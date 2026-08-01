/**
 * مخزوني — سيرفر بدون أي مكتبات خارجية
 * Node.js 22+ فقط (node:http + node:sqlite)
 *
 * بيقدّم الملفات الثابتة + API بسيط للمزامنة بين الأجهزة.
 */
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { existsSync, mkdirSync } from "node:fs";
import { join, extname, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { randomBytes, scryptSync, timingSafeEqual, createHash } from "node:crypto";

const ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)));
const PORT = Number(process.env.PORT) || 8080;
const HOST = process.env.HOST || "0.0.0.0";

/* مكان قاعدة البيانات — Railway بيركّب فوليوم وبيحط المسار في متغيّر */
const DATA_DIR = process.env.DATA_DIR || process.env.RAILWAY_VOLUME_MOUNT_PATH || join(ROOT, "data");
if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(join(DATA_DIR, "mystock.db"));
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY, user TEXT UNIQUE NOT NULL, name TEXT,
    salt TEXT NOT NULL, hash TEXT NOT NULL, at INTEGER
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY, uid TEXT NOT NULL, exp INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS recs (
    uid TEXT NOT NULL, kind TEXT NOT NULL, id TEXT NOT NULL,
    data TEXT, u INTEGER NOT NULL, deleted INTEGER DEFAULT 0,
    PRIMARY KEY (uid, kind, id)
  );
  CREATE INDEX IF NOT EXISTS recs_u ON recs (uid, u);
  CREATE TABLE IF NOT EXISTS prof (
    uid TEXT PRIMARY KEY, data TEXT, u INTEGER NOT NULL
  );
`);

const KINDS = new Set(["items", "stores", "parties", "moves", "deals", "pays", "users"]);
const MAX_BODY = 12 * 1024 * 1024;         /* المرفقات بتكبّر الطلب */
const TOKEN_DAYS = 90;

/* ---------- مساعدات ---------- */
const uid = () => randomBytes(12).toString("hex");
const hashPass = (pass, salt) => scryptSync(pass, salt, 64).toString("hex");
function samePass(pass, salt, hash) {
  const a = Buffer.from(hashPass(pass, salt), "hex");
  const b = Buffer.from(hash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}
function json(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(body);
}
function readBody(req) {
  return new Promise((ok, no) => {
    let n = 0; const chunks = [];
    req.on("data", c => {
      n += c.length;
      if (n > MAX_BODY) { no(new Error("too_large")); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => {
      try { ok(chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {}); }
      catch { no(new Error("bad_json")); }
    });
    req.on("error", no);
  });
}
function auth(req) {
  const h = req.headers.authorization || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : "";
  if (!token) return null;
  const row = db.prepare('SELECT uid, exp FROM sessions WHERE token = ?').get(token);
  if (!row || row.exp < Date.now()) return null;
  return row.uid;
}

/* حد بسيط لمحاولات الدخول */
const hits = new Map();
function rateLimited(ip) {
  const t = Date.now(), w = 15 * 60 * 1000;
  const arr = (hits.get(ip) || []).filter(x => t - x < w);
  arr.push(t); hits.set(ip, arr);
  return arr.length > 30;
}

/* ---------- API ---------- */
async function handleApi(req, res, path) {
  if (req.method !== "POST") return json(res, 405, { error: "method" });
  let body;
  try { body = await readBody(req); }
  catch (e) { return json(res, e.message === "too_large" ? 413 : 400, { error: e.message }); }

  const ip = (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "?").split(",")[0].trim();

  if (path === "register" || path === "login") {
    if (rateLimited(ip)) return json(res, 429, { error: "too_many" });
    const user = String(body.user || "").trim().toLowerCase();
    const pass = String(body.pass || "");
    if (user.length < 3 || pass.length < 6) return json(res, 400, { error: "bad" });

    let row = db.prepare('SELECT * FROM users WHERE user = ?').get(user);
    if (path === "register") {
      if (row) return json(res, 409, { error: "taken" });
      const salt = randomBytes(16).toString("hex");
      row = { id: uid(), user, name: String(body.name || "").trim() || user, salt, hash: hashPass(pass, salt), at: Date.now() };
      db.prepare('INSERT INTO users (id, user, name, salt, hash, at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(row.id, row.user, row.name, row.salt, row.hash, row.at);
    } else {
      if (!row || !samePass(pass, row.salt, row.hash)) return json(res, 401, { error: "bad" });
    }
    const token = randomBytes(32).toString("hex");
    db.prepare('INSERT INTO sessions (token, uid, exp) VALUES (?, ?, ?)')
      .run(token, row.id, Date.now() + TOKEN_DAYS * 86400000);
    return json(res, 200, { token, uid: row.id, name: row.name });
  }

  const me = auth(req);
  if (!me) return json(res, 401, { error: "unauthorized" });

  if (path === "logout") {
    const h = req.headers.authorization || "";
    db.prepare('DELETE FROM sessions WHERE token = ?').run(h.slice(7));
    return json(res, 200, { ok: true });
  }

  if (path === "sync") {
    const now = Date.now();
    const since = Number(body.since) || 0;
    const incoming = Array.isArray(body.records) ? body.records : [];

    const put = db.prepare(`
      INSERT INTO recs (uid, kind, id, data, u, deleted) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(uid, kind, id) DO UPDATE SET
        data = excluded.data, u = excluded.u, deleted = excluded.deleted
      WHERE excluded.u > recs.u
    `);
    for (const r of incoming) {
      if (!r || !KINDS.has(r.kind) || !r.id) continue;      /* أي نوع مش معروف بيتجاهل */
      put.run(me, r.kind, String(r.id), r.deleted ? null : String(r.data || ""), Number(r.u) || now, r.deleted ? 1 : 0);
    }
    if (body.profile && body.profile.u) {
      db.prepare(`
        INSERT INTO prof (uid, data, u) VALUES (?, ?, ?)
        ON CONFLICT(uid) DO UPDATE SET data = excluded.data, u = excluded.u WHERE excluded.u > prof.u
      `).run(me, String(body.profile.data || ""), Number(body.profile.u));
    }

    const out = db.prepare('SELECT kind, id, data, u, deleted FROM recs WHERE uid = ? AND u > ? ORDER BY u LIMIT 5000')
      .all(me, since);
    const p = db.prepare('SELECT data, u FROM prof WHERE uid = ? AND u > ?').get(me, since);
    return json(res, 200, { now, records: out, profile: p || null });
  }

  return json(res, 404, { error: "not_found" });
}

/* ---------- الملفات الثابتة ---------- */
const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg",
  ".ico": "image/x-icon", ".txt": "text/plain; charset=utf-8", ".webp": "image/webp",
};
async function serveStatic(req, res, urlPath) {
  let rel = decodeURIComponent(urlPath.split("?")[0]);
  if (rel === "/" || rel === "") rel = "/index.html";
  const full = join(ROOT, normalize(rel).replace(/^(\.\.[/\\])+/, ""));
  if (!full.startsWith(ROOT)) { res.writeHead(403); return res.end("forbidden"); }

  let st;
  try { st = await stat(full); } catch { res.writeHead(404); return res.end("not found"); }
  if (!st.isFile()) { res.writeHead(404); return res.end("not found"); }

  const buf = await readFile(full);
  const etag = '"' + createHash("sha1").update(buf).digest("base64").slice(0, 22) + '"';
  if (req.headers["if-none-match"] === etag) { res.writeHead(304); return res.end(); }

  const ext = extname(full).toLowerCase();
  const isHtml = ext === ".html";
  res.writeHead(200, {
    "Content-Type": MIME[ext] || "application/octet-stream",
    "Content-Length": buf.length,
    "ETag": etag,
    "Cache-Control": isHtml ? "no-cache" : "public, max-age=604800",
  });
  res.end(req.method === "HEAD" ? undefined : buf);
}

/* ---------- السيرفر ---------- */
const server = createServer(async (req, res) => {
  try {
    const url = req.url || "/";
    if (url === "/healthz") { res.writeHead(200, { "Content-Type": "application/json" }); return res.end('{"ok":true}'); }
    if (url.startsWith("/api/")) return await handleApi(req, res, url.slice(5).split("?")[0]);
    if (req.method !== "GET" && req.method !== "HEAD") { res.writeHead(405); return res.end(); }
    return await serveStatic(req, res, url);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) res.writeHead(500, { "Content-Type": "application/json" });
    res.end('{"error":"server"}');
  }
});

/* تنضيف الجلسات المنتهية مرة كل ساعة */
setInterval(() => {
  try { db.prepare('DELETE FROM sessions WHERE exp < ?').run(Date.now()); } catch {}
}, 3600000).unref?.();

server.listen(PORT, HOST, () => {
  console.log(`مخزوني شغّال على http://${HOST}:${PORT}`);
  console.log(`قاعدة البيانات: ${DATA_DIR}`);
});

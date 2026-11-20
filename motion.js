/* =========================================================
   مخزوني — الحركة
   GSAP محلي (vendor/gsap) + CSS. مفيش CDN.
   الأنماط المستخدمة، وسببها:
   - Fade In Up + Stagger + Page transition: دخول التاب والكروت
   - Skeleton shimmer: أول رسم قبل ما البيانات تترسم
   - Ripple: رد فعل اللمس على الأزرار
   - Bottom sheet: ظهور محتوى الشيت (الانزلاق نفسه CSS)
   - Segmented control: مؤشر الفلتر/التاب يتحرك بالـ transform
   - Scroll reveal: كروت الرئيسية والتقارير تحت الطية
   - Hover lift: كروت/إحصائيات/بلاطات، ماوس فقط
   - Spring scale: أيقونة الحالة الفاضية وشعار الدخول
   غير كده (mask، magnifier، scan-line، morph) متضافش عمداً.
   ========================================================= */
(function () {
  "use strict";

  var gsap = window.gsap;
  var root = document.documentElement;
  root.classList.add("motion");

  function noop() {}
  if (!gsap) {
    window.Motion = {
      arm: noop, consumeArm: function () { return null; },
      beforeRender: noop, enter: noop, sync: noop,
      beforeSheet: noop, sheetIn: noop, sheetOut: noop,
      authIn: noop, authOut: function (_el, done) { if (done) done(); }
    };
    return;
  }

  gsap.config({ nullTargetWarn: false });
  /* translate3d من أول فريم عشان الموبايل ما يبدّلش الطبقة في نص الحركة */
  gsap.defaults({ force3D: true, overwrite: "auto" });

  var reduceMQ = window.matchMedia("(prefers-reduced-motion: reduce)");
  var printMQ = window.matchMedia("print");
  function reduced() { return !!(reduceMQ.matches || printMQ.matches); }

  /* مدة قصيرة، والتفاعل مش مستنيها */
  var DUR = { rise: 0.26, sheet: 0.22, pill: 0.26, ripple: 0.36, auth: 0.22, spring: 0.3 };
  var STAGGER = 0.028;
  var MAX_RISE = 6;
  var REVEAL = { "s-home": 1, "s-reports": 1 };

  var armed = null;
  var tracked = [];
  var revealIO = null;
  var revealTimer = 0;
  var segIndex = Object.create(null);

  function list(targets) {
    if (!targets) return [];
    if (targets.nodeType === 1) return [targets];
    return Array.prototype.slice.call(targets);
  }
  function track(targets) {
    list(targets).forEach(function (el) {
      if (el && tracked.indexOf(el) < 0) tracked.push(el);
    });
  }
  function release(scope) {
    for (var i = tracked.length - 1; i >= 0; i--) {
      var el = tracked[i];
      if (!el || !el.isConnected || (scope && (el === scope || scope.contains(el)))) {
        if (el) gsap.killTweensOf(el);
        tracked.splice(i, 1);
      }
    }
  }
  function clearReveal() {
    if (revealIO) { revealIO.disconnect(); revealIO = null; }
    if (revealTimer) { clearTimeout(revealTimer); revealTimer = 0; }
  }

  /* ---------- دخول الصفحة: fade-up رأسي (مناسب لـ RTL، من غير يمين/شمال) ---------- */
  function pieces(screen) {
    return Array.prototype.slice.call(
      screen.querySelectorAll(".hero, .tiles, .stat-grid, .card, .empty, .sec-t")
    );
  }
  function splitFold(els) {
    var vh = window.innerHeight || 700;
    var above = [], below = [];
    for (var i = 0; i < els.length; i++) {
      var top = els[i].getBoundingClientRect().top;
      if (top < vh - 8) above.push(els[i]);
      else below.push(els[i]);
    }
    return { above: above, below: below };
  }
  function unlock(els) {
    gsap.set(els, { clearProps: "transform,opacity" });
    for (var i = 0; i < els.length; i++) els[i].style.transition = "";
  }
  function rise(els, fromY) {
    if (!els.length || reduced()) return;
    for (var i = 0; i < els.length; i++) els[i].style.transition = "none";
    track(els);
    gsap.fromTo(els,
      { opacity: 0, y: fromY },
      {
        opacity: 1, y: 0, duration: DUR.rise, stagger: STAGGER,
        ease: "power2.out", overwrite: "auto",
        onComplete: function () { unlock(els); }
      }
    );
  }
  function springIcon(screen) {
    if (reduced()) return;
    var icon = screen.querySelector(".empty .ic");
    if (!icon) return;
    icon.style.transition = "none";
    track(icon);
    gsap.fromTo(icon,
      { opacity: 0, scale: 0.92 },
      {
        opacity: 1, scale: 1, duration: DUR.spring, ease: "back.out(1.15)", overwrite: "auto",
        onComplete: function () { unlock([icon]); }
      }
    );
  }

  function reveal(els) {
    if (!els.length || reduced() || typeof IntersectionObserver !== "function") return;
    clearReveal();
    gsap.set(els, { opacity: 0, y: 10 });
    track(els);
    var pending = els.slice();
    var saw = false;
    function show(el) {
      var i = pending.indexOf(el);
      if (i >= 0) pending.splice(i, 1);
      if (!el.isConnected) return;
      gsap.to(el, {
        opacity: 1, y: 0, duration: 0.3, ease: "power2.out", overwrite: "auto",
        onComplete: function () { unlock([el]); }
      });
    }
    revealIO = new IntersectionObserver(function (entries) {
      saw = true;
      for (var i = 0; i < entries.length; i++) {
        if (!entries[i].isIntersecting) continue;
        revealIO.unobserve(entries[i].target);
        show(entries[i].target);
      }
      if (!pending.length) clearReveal();
    }, { root: null, rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
    els.forEach(function (el) { revealIO.observe(el); });
    /* لو المراقب أصلًا ما اشتغلش، نظهر المحتوى. لو اشتغل، نستنى التمرير */
    revealTimer = setTimeout(function () {
      if (!saw) pending.slice().forEach(show);
      if (!pending.length) clearReveal();
    }, 2500);
  }

  function enter(screen, dir) {
    try {
      if (!screen) return;
      release(screen);
      clearReveal();
      placeSegs(screen, false);
      if (reduced()) return;
      var fold = splitFold(pieces(screen));
      var fromY = dir === "bwd" ? -8 : 8;
      rise(fold.above.slice(0, MAX_RISE), fromY);
      springIcon(screen);
      if (REVEAL[screen.id]) reveal(fold.below);
    } catch (err) { /* الحركة ما تعطّلش الشاشة */ }
  }

  function sync(screen) {
    try {
      if (!screen) return;
      placeSegs(screen, true);
    } catch (err) {}
  }

  /* ---------- مؤشر التاب / الفلتر ---------- */
  function segKey(seg) {
    var host = seg.closest(".screen, #sheetBody");
    var id = host && host.id ? host.id : "sheet";
    var labels = [];
    var buttons = seg.querySelectorAll(":scope > button");
    for (var i = 0; i < buttons.length; i++) labels.push(buttons[i].textContent.replace(/\s+/g, " ").trim());
    return id + "::" + labels.join("|");
  }
  function placePill(seg, btn, animate) {
    var sr = seg.getBoundingClientRect();
    var br = btn.getBoundingClientRect();
    if (br.width < 2 || sr.width < 2) return;
    var cs = getComputedStyle(seg);
    var x = br.left - sr.left - (parseFloat(cs.borderLeftWidth) || 0);
    var y = br.top - sr.top - (parseFloat(cs.borderTopWidth) || 0);
    var pill = seg.querySelector(":scope > .seg-pill");
    if (!pill) {
      pill = document.createElement("i");
      pill.className = "seg-pill";
      pill.setAttribute("aria-hidden", "true");
      seg.insertBefore(pill, seg.firstChild);
    }
    seg.classList.add("has-pill");
    pill.style.width = br.width + "px";
    pill.style.height = br.height + "px";
    pill.style.top = y + "px";
    /* x فيزيائي (مش منطقي) عشان translateX كده — القياس من الزرار نفسه فالنتيجة صح في RTL */
    if (animate && !reduced()) {
      track(pill);
      gsap.to(pill, { x: x, duration: DUR.pill, ease: "power2.out", overwrite: "auto" });
    } else {
      gsap.killTweensOf(pill);
      gsap.set(pill, { x: x });
    }
  }
  function placeSegs(scope, animate) {
    if (!scope) return;
    var segs = scope.querySelectorAll(".seg");
    for (var i = 0; i < segs.length; i++) {
      var seg = segs[i];
      var buttons = seg.querySelectorAll(":scope > button");
      if (buttons.length < 2) continue;
      var idx = -1;
      for (var b = 0; b < buttons.length; b++) if (buttons[b].classList.contains("on")) idx = b;
      if (idx < 0) continue;
      var key = segKey(seg);
      var prev = segIndex[key];
      segIndex[key] = idx;
      var slide = animate && prev != null && prev !== idx && buttons[prev];
      if (slide) placePill(seg, buttons[prev], false);
      placePill(seg, buttons[idx], slide);
    }
  }

  /* ---------- الشيت ---------- */
  function sheetIn(body, fresh) {
    try {
      if (!body) return;
      /* الانزلاق نفسه على #sheet بالـ CSS. هنا ظهور المحتوى بس، opacity عشان ما يتعارضش مع سحب الشيت */
      if (!fresh || reduced()) {
        unlock([body]);
        placeSegs(body, !fresh && !reduced());
        return;
      }
      placeSegs(body, false);
      body.style.transition = "none";
      track(body);
      gsap.fromTo(body,
        { opacity: 0 },
        {
          opacity: 1, duration: DUR.sheet, ease: "power1.out", overwrite: "auto",
          onComplete: function () { unlock([body]); }
        }
      );
    } catch (err) {}
  }
  function sheetOut() {
    try {
      var body = document.getElementById("sheetBody");
      if (!body) return;
      gsap.killTweensOf(body);
      unlock([body]);
    } catch (err) {}
  }

  /* ---------- الدخول ---------- */
  function authIn(box) {
    try {
      if (!box || reduced()) return;
      var crest = box.querySelector(".auth-crest");
      var kids = [];
      for (var i = 0; i < box.children.length; i++) {
        if (box.children[i] !== crest) kids.push(box.children[i]);
      }
      if (crest) {
        crest.style.transition = "none";
        track(crest);
        gsap.fromTo(crest,
          { opacity: 0, scale: 0.94 },
          { opacity: 1, scale: 1, duration: DUR.spring, ease: "back.out(1.15)", overwrite: "auto",
            onComplete: function () { unlock([crest]); } }
        );
      }
      if (kids.length) {
        kids.forEach(function (el) { el.style.transition = "none"; });
        track(kids);
        gsap.fromTo(kids,
          { opacity: 0, y: 8 },
          { opacity: 1, y: 0, duration: DUR.auth, stagger: 0.03, ease: "power2.out", overwrite: "auto",
            onComplete: function () { unlock(kids); } }
        );
      }
    } catch (err) {}
  }
  function authOut(el, done) {
    var finished = false;
    function finish() {
      if (finished) return;
      finished = true;
      if (el) {
        gsap.set(el, { clearProps: "opacity" });
        el.style.pointerEvents = "";
      }
      if (done) done();
    }
    try {
      if (!el || reduced()) { finish(); return; }
      /* النقر يعدّي فورًا — الاختفاء ما يحبسش التفاعل */
      el.style.pointerEvents = "none";
      gsap.to(el, {
        opacity: 0, duration: 0.18, ease: "power1.out", overwrite: "auto",
        onComplete: finish
      });
      setTimeout(finish, 420);
    } catch (err) { finish(); }
  }

  /* ---------- لمسة الزرار ---------- */
  var RIPPLE = ".btn, .tile, .icon-btn, .fab, .pill, .pick, .sheet-x, .who, .nav button, .seg button";
  function spawnRipple(btn, cx, cy) {
    if (reduced()) return;
    var rect = btn.getBoundingClientRect();
    if (rect.width < 2) return;
    var host = btn.querySelector(":scope > .ripple-host");
    if (!host) {
      host = document.createElement("span");
      host.className = "ripple-host";
      host.setAttribute("aria-hidden", "true");
      btn.appendChild(host);
    }
    var dot = document.createElement("span");
    dot.className = "ripple";
    dot.style.left = (cx - rect.left) + "px";
    dot.style.top = (cy - rect.top) + "px";
    if (host.childElementCount > 2) return;
    host.appendChild(dot);
    track(dot);
    var scale = Math.max(rect.width, rect.height) / 12;
    gsap.fromTo(dot,
      { xPercent: -50, yPercent: -50, scale: 0.2, opacity: 0.2 },
      {
        xPercent: -50, yPercent: -50, scale: scale, opacity: 0,
        duration: DUR.ripple, ease: "power2.out", overwrite: "auto",
        onComplete: function () { dot.remove(); }
      }
    );
  }
  function onPointerDown(e) {
    if (reduced()) return;
    if (e.button != null && e.button !== 0) return;
    var t = e.target;
    if (!t || !t.closest) return;
    if (t.closest("input, textarea, select")) return;
    var btn = t.closest(RIPPLE);
    if (!btn || btn.disabled || btn.getAttribute("aria-disabled") === "true") return;
    spawnRipple(btn, e.clientX, e.clientY);
  }

  function hardStop() {
    clearReveal();
    gsap.killTweensOf("*");
    tracked.length = 0;
    var stuck = document.querySelectorAll(".hero, .tiles, .stat-grid, .card, .empty, .sec-t, #sheetBody, .auth-crest, #auth");
    gsap.set(stuck, { clearProps: "transform,opacity" });
    for (var i = 0; i < stuck.length; i++) stuck[i].style.transition = "";
  }
  if (reduceMQ.addEventListener) reduceMQ.addEventListener("change", function () { if (reduced()) hardStop(); });
  else if (reduceMQ.addListener) reduceMQ.addListener(function () { if (reduced()) hardStop(); });

  document.addEventListener("pointerdown", onPointerDown, { passive: true });

  window.Motion = {
    arm: function (dir) { armed = dir || "fwd"; },
    consumeArm: function () { var d = armed; armed = null; return d; },
    beforeRender: function (screen) {
      try { clearReveal(); release(screen); } catch (err) {}
    },
    enter: enter,
    sync: sync,
    beforeSheet: function () {
      try {
        var body = document.getElementById("sheetBody");
        release(body);
        if (body) unlock([body]);
      } catch (err) {}
    },
    sheetIn: sheetIn,
    sheetOut: sheetOut,
    authIn: authIn,
    authOut: authOut
  };
})();

/* مخزوني — إضافات: قائمة الطلب، شارة المخزون، ريبل، اهتزاز خفيف
   بتقرأ من S/balance الموجودين فقط ومبتكتبش في البيانات. */
(function(){
  "use strict";
  var AR = "٠١٢٣٤٥٦٧٨٩";
  function toEn(s){ return String(s).replace(/[٠-٩]/g,function(d){return AR.indexOf(d)}); }
  function low(){
    try{
      return S.items.filter(function(i){return !i.archived && i.min})
        .map(function(i){var b=balance(i.id);return {it:i,b:b}})
        .filter(function(x){return x.b <= x.it.min})
        .sort(function(a,b){return (a.b/a.it.min)-(b.b/b.it.min)});
    }catch(e){return []}
  }
  var pill=document.createElement("button");
  pill.className="reorder-pill";pill.type="button";
  pill.innerHTML='<span>قائمة الطلب</span><b>0</b>';
  document.body.appendChild(pill);

  function qtyFor(x){ return Math.max(1, Math.ceil(x.it.min*2 - x.b)); }
  function open(){
    var L=low();
    if(!L.length){ toast("مفيش أصناف تحت حد الطلب 👌"); return; }
    var h='<div class="mut" style="font-size:13px;margin-bottom:6px">أصناف وصلت للحد الأدنى. عدّل الكميات وابعتها للمورد.</div><div id="roList">'+
      L.map(function(x,i){
        return '<div class="ro-row" data-i="'+i+'"><div class="nm">'+esc(x.it.name)+
          '<small>الرصيد '+n1(x.b)+' · الحد '+n1(x.it.min)+' '+esc(x.it.unit||"")+'</small></div>'+
          '<div class="ro-q"><button data-d="-1">−</button><input inputmode="numeric" value="'+qtyFor(x)+'"><button data-d="1">+</button></div></div>';
      }).join("")+'</div>'+
      '<div class="btn-row" style="margin-top:16px"><button class="btn soft" id="roCopy">نسخ</button><button class="btn" id="roWa">إرسال واتساب</button></div>';
    sheet("قائمة الطلب", h, function(){
      var box=document.getElementById("roList");
      box.onclick=function(e){
        var b=e.target.closest("[data-d]"); if(!b) return;
        var inp=b.parentNode.querySelector("input");
        inp.value=Math.max(0,(+toEn(inp.value)||0)+(+b.dataset.d)); buzz();
      };
      function text(){
        var lines=[].map.call(box.querySelectorAll(".ro-row"),function(r){
          var x=L[+r.dataset.i], q=+toEn(r.querySelector("input").value)||0;
          return q>0 ? "• "+x.it.name+": "+q+" "+(x.it.unit||"") : null;
        }).filter(Boolean);
        return (S.cfg.biz||"مخزوني")+" — طلبية\n"+lines.join("\n");
      }
      document.getElementById("roWa").onclick=function(){ window.open("https://wa.me/?text="+encodeURIComponent(text()),"_blank"); };
      document.getElementById("roCopy").onclick=function(){
        try{navigator.clipboard.writeText(text()); toast("اتنسخت القائمة ✅");}catch(e){toast("النسخ مش متاح هنا");}
      };
    });
  }
  pill.addEventListener("click",open);

  /* شارة على تاب المخزون + إظهار الزر */
  var last=-1;
  function tick(){
    var n=low().length;
    var host=document.querySelector('.nav button[data-scr="stock"] .ic');
    if(n!==last){
      last=n;
      var b=host&&host.querySelector(".badge");
      if(host){ if(n&&!b){b=document.createElement("span");b.className="badge";host.appendChild(b);}
        if(b){ if(n) b.textContent=n0(n); else b.remove(); } }
      pill.querySelector("b").textContent=n0(n);
    }
    pill.classList.toggle("on", n>0 && (SCR==="home"||SCR==="stock") && !document.getElementById("sheet").classList.contains("on"));
  }
  setInterval(tick,1200); setTimeout(tick,600);

  /* ريبل + اهتزاز خفيف */
  function buzz(){ try{navigator.vibrate&&navigator.vibrate(8)}catch(e){} }
  document.addEventListener("pointerdown",function(e){
    var t=e.target.closest(".btn,.pill,.row,.tile"); if(!t) return;
    buzz();
    var r=t.getBoundingClientRect(),d=Math.max(r.width,r.height)*2,s=document.createElement("span");
    s.className="rip";s.style.cssText="width:"+d+"px;height:"+d+"px;left:"+(e.clientX-r.left-d/2)+"px;top:"+(e.clientY-r.top-d/2)+"px";
    t.appendChild(s);setTimeout(function(){s.remove()},650);
  },{passive:true});
})();

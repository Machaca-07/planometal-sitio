/* PlanoMetal: configuración, consentimiento, medición y checkout. Común a todas las páginas. */
const CONFIG = {
  checkout: {
    esencial: "https://pay.hotmart.com/U108639715E",
    profesional: "https://pay.hotmart.com/H108639739N",
    kit: "https://pay.hotmart.com/G108639746F"
  },
  precio: { esencial: 19, profesional: 27, kit: 4.9 },
  idHotmart: { esencial: "9057710", profesional: "9057725", kit: "9057731" },
  pixelId: "{{PIXEL_ID}}",
  ga4Id: "{{GA4_ID}}",
  brevoForm: "{{BREVO_FORM_URL}}",
  whatsapp: "{{WHATSAPP}}"
};

const pendiente = (u) => !u || String(u).startsWith("{{") || u === "#";

/* UTM: se guardan en la sesión y se pasan al checkout */
const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"];
(function guardarUtm(){
  try {
    const q = new URLSearchParams(location.search);
    UTM_KEYS.forEach(k => { if (q.get(k)) sessionStorage.setItem(k, q.get(k)); });
  } catch (e) {}
})();
function conUtm(url){
  try {
    const u = new URL(url);
    UTM_KEYS.forEach(k => { const v = sessionStorage.getItem(k); if (v && !u.searchParams.get(k)) u.searchParams.set(k, v); });
    const camp = sessionStorage.getItem("utm_campaign"), cont = sessionStorage.getItem("utm_content");
    if (camp && !u.searchParams.get("src")) u.searchParams.set("src", [camp, cont].filter(Boolean).join("_"));
    return u.toString();
  } catch (e) { return url; }
}

/* Medición: solo con consentimiento. Los eventos previos quedan en cola. */
const ESTANDAR = ["PageView", "ViewContent", "Lead", "InitiateCheckout", "Contact"];
const cola = [];
let medir = false;
function track(evento, datos){
  datos = datos || {};
  if (!medir) { cola.push([evento, datos]); return; }
  if (window.fbq) {
    if (ESTANDAR.includes(evento)) fbq("track", evento, datos); else fbq("trackCustom", evento, datos);
  }
  if (window.gtag) gtag("event", evento, datos);
}
function cargarMedicion(){
  if (medir) return;
  medir = true;
  if (!pendiente(CONFIG.pixelId)) {
    !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
    fbq("init", CONFIG.pixelId); fbq("track", "PageView");
  }
  if (!pendiente(CONFIG.ga4Id)) {
    const s = document.createElement("script"); s.async = true;
    s.src = "https://www.googletagmanager.com/gtag/js?id=" + CONFIG.ga4Id; document.head.appendChild(s);
    window.dataLayer = window.dataLayer || [];
    window.gtag = function(){ dataLayer.push(arguments); };
    gtag("js", new Date()); gtag("config", CONFIG.ga4Id);
  }
  while (cola.length) { const [e, d] = cola.shift(); track(e, d); }
}

/* Checkout: InitiateCheckout al salir hacia la plataforma. Purchase lo envía la Hotmart tras el pago confirmado. */
function irCheckout(plan){
  const url = CONFIG.checkout[plan];
  if (pendiente(url)) { console.warn("Checkout no configurado: " + plan); return; }
  track("InitiateCheckout", { content_ids: [CONFIG.idHotmart[plan]], content_type: "product", value: CONFIG.precio[plan], currency: "USD" });
  setTimeout(() => { window.location.href = conUtm(url); }, 250);
}
document.querySelectorAll("[data-checkout]").forEach(el => {
  const url = CONFIG.checkout[el.dataset.checkout];
  if (!pendiente(url)) el.href = conUtm(url);
  el.addEventListener("click", e => {
    e.preventDefault();
    if (el.dataset.evento) track(el.dataset.evento, { plan: el.dataset.checkout });
    irCheckout(el.dataset.checkout);
  });
});

/* Pop-up de upgrade: aparece al elegir Esencial, una vez por sesión */
const modal = document.getElementById("upgrade");
if (modal) {
  const cerrar = () => modal.classList.remove("on");
  document.querySelectorAll('[data-plan]').forEach(b => b.addEventListener("click", e => {
    const plan = b.dataset.plan;
    track("SelectPlan", { plan });
    if (plan !== "esencial") return;
    let visto = null; try { visto = sessionStorage.getItem("pm_upgrade"); } catch (x) {}
    if (visto) { e.preventDefault(); irCheckout("esencial"); return; }
    try { sessionStorage.setItem("pm_upgrade", "1"); } catch (x) {}
    modal.classList.add("on"); track("UpgradeShown");
  }));
  modal.querySelector(".cerrar").addEventListener("click", cerrar);
  modal.addEventListener("click", e => { if (e.target === modal) cerrar(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape") cerrar(); });
}

/* ViewContent cuando se ven los precios */
const precios = document.getElementById("precios");
if (precios && "IntersectionObserver" in window) {
  const io = new IntersectionObserver(es => { if (es.some(x => x.isIntersecting)) { track("ViewContent", { content_name: "precios" }); io.disconnect(); } }, { threshold: 0.4 });
  io.observe(precios);
}

/* Descarga de la muestra */
document.querySelectorAll("[data-descarga]").forEach(a => a.addEventListener("click", () => track("SampleDownload", { ref: "PM-BAN-0001-C03" })));

/* WhatsApp: el botón solo aparece si hay número configurado */
if (!pendiente(CONFIG.whatsapp)) {
  const w = document.createElement("a");
  w.className = "wa"; w.target = "_blank"; w.rel = "noopener";
  w.href = "https://wa.me/" + CONFIG.whatsapp.replace(/\D/g, "") + "?text=" + encodeURIComponent("Hola, quiero información sobre PlanoMetal.");
  w.setAttribute("aria-label", "Escribir por WhatsApp"); w.textContent = "WhatsApp";
  w.addEventListener("click", () => track("WhatsAppClick"));
  document.body.appendChild(w);
}

/* Cookies */
const banner = document.getElementById("cookies");
let decision = null;
try { decision = localStorage.getItem("pm_cookies"); } catch (e) {}
function decidir(v){ try { localStorage.setItem("pm_cookies", v); } catch (e) {} if (banner) banner.classList.remove("on"); if (v === "si") cargarMedicion(); }
if (decision === "si") cargarMedicion(); else if (!decision && banner) banner.classList.add("on");
if (banner) {
  document.getElementById("ck-si").onclick = () => decidir("si");
  document.getElementById("ck-no").onclick = () => decidir("no");
}
const ab = document.getElementById("abrir-cookies");
if (ab) ab.onclick = (e) => { e.preventDefault(); banner.classList.add("on"); };

/**
 * LIFT WhatsApp Widget — loader embebible
 *
 * Uso (en theme.liquid del cliente, antes de </body>):
 *   <script src="https://TU-BACKEND/widget.js" data-shop="cliente.myshopify.com"></script>
 *
 * Atributos opcionales del <script>:
 *   data-shop      → dominio myshopify del tenant (se pasa al backend)
 *   data-position  → "right" (default) | "left"
 *   data-greeting  → texto del tooltip junto al botón (opcional)
 *
 * El loader sólo inyecta un botón flotante + un iframe que apunta a
 * /widget.html del backend. Toda la lógica de chat vive en el iframe
 * (mismo origen que el backend → sin problemas de CORS).
 */
(function () {
  "use strict";

  // Evitar doble inyección si el script se pega dos veces.
  if (window.__liftWaLoaded) return;
  window.__liftWaLoaded = true;

  // ─── Resolver el <script> propio y el origen del backend ───
  var script =
    document.currentScript ||
    (function () {
      var all = document.getElementsByTagName("script");
      for (var i = all.length - 1; i >= 0; i--) {
        if (/\/widget\.js(\?|#|$)/.test(all[i].src)) return all[i];
      }
      return null;
    })();

  if (!script) return;

  var base = script.src.replace(/\/widget\.js(?:\?[^#]*)?(?:#.*)?$/, "");
  var shop = script.getAttribute("data-shop") || "";
  var position = script.getAttribute("data-position") === "left" ? "left" : "right";
  var greeting = script.getAttribute("data-greeting") || "";

  var iframeSrc = base + "/widget.html" + (shop ? "?shop=" + encodeURIComponent(shop) : "");

  // ─── Estilos aislados (.lift-wa-*) ───
  var side = position === "left" ? "left" : "right";
  var css =
    ".lift-wa-fab{position:fixed;bottom:20px;" + side + ":20px;width:60px;height:60px;border-radius:50%;" +
    "background:#25D366;box-shadow:0 4px 14px rgba(0,0,0,0.28);cursor:pointer;z-index:2147483000;" +
    "display:flex;align-items:center;justify-content:center;border:none;transition:transform .18s ease,box-shadow .18s ease;}" +
    ".lift-wa-fab:hover{transform:scale(1.06);box-shadow:0 6px 18px rgba(0,0,0,0.34);}" +
    ".lift-wa-fab:active{transform:scale(.96);}" +
    ".lift-wa-fab svg{width:32px;height:32px;fill:#fff;transition:opacity .15s;}" +
    ".lift-wa-fab .lift-wa-ico-close{display:none;}" +
    ".lift-wa-fab.lift-wa-open .lift-wa-ico-open{display:none;}" +
    ".lift-wa-fab.lift-wa-open .lift-wa-ico-close{display:block;}" +
    // Badge de notificación
    ".lift-wa-badge{position:absolute;top:-2px;" + (side === "left" ? "right" : "left") + ":-2px;" +
    "min-width:20px;height:20px;border-radius:10px;background:#ff3b30;color:#fff;font:600 12px/20px -apple-system,sans-serif;" +
    "text-align:center;padding:0 5px;box-shadow:0 1px 3px rgba(0,0,0,.3);}" +
    ".lift-wa-fab.lift-wa-open .lift-wa-badge{display:none;}" +
    // Panel + iframe
    ".lift-wa-panel{position:fixed;bottom:92px;" + side + ":20px;width:380px;height:600px;max-height:calc(100vh - 112px);" +
    "max-width:calc(100vw - 40px);border-radius:14px;overflow:hidden;z-index:2147483000;" +
    "box-shadow:0 12px 40px rgba(0,0,0,0.28);background:#ECE5DD;opacity:0;transform:translateY(16px) scale(.98);" +
    "pointer-events:none;transition:opacity .2s ease,transform .2s ease;transform-origin:" + side + " bottom;}" +
    ".lift-wa-panel.lift-wa-open{opacity:1;transform:translateY(0) scale(1);pointer-events:auto;}" +
    ".lift-wa-panel iframe{width:100%;height:100%;border:none;display:block;}" +
    // Tooltip
    ".lift-wa-tip{position:fixed;bottom:32px;" + side + ":92px;background:#fff;color:#111;" +
    "font:500 13.5px/1.35 -apple-system,sans-serif;padding:10px 14px;border-radius:10px;max-width:220px;" +
    "box-shadow:0 4px 14px rgba(0,0,0,.18);z-index:2147482999;transition:opacity .2s;}" +
    ".lift-wa-tip::after{content:'';position:absolute;bottom:14px;" + side + ":-6px;border:6px solid transparent;" +
    "border-" + side + "-color:#fff;}" +
    // Mobile fullscreen (el espacio tras @media es obligatorio para parsear).
    // inset:0 con width/height auto fija los 4 bordes sin depender de 100vw
    // (que en algunos contextos excluye scrollbar o difiere de innerWidth).
    "@media (max-width:480px){" +
    ".lift-wa-panel{inset:0;width:auto;height:auto;max-width:none;max-height:none;border-radius:0;}" +
    ".lift-wa-fab.lift-wa-open{display:none;}" +  // en fullscreen, cerrar va por la X del header
    ".lift-wa-tip{display:none;}}";

  var style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);

  // ─── Iconos ───
  var waIcon =
    '<svg class="lift-wa-ico-open" viewBox="0 0 24 24"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18a8 8 0 0 1-4.1-1.1l-.3-.2-3 .8.8-2.9-.2-.3A8 8 0 1 1 12 20zm4.4-6c-.2-.1-1.4-.7-1.6-.8-.2-.1-.4-.1-.5.1l-.7.9c-.1.2-.3.2-.5.1a6.5 6.5 0 0 1-3.2-2.8c-.1-.2 0-.4.1-.5l.4-.5.2-.4v-.4l-.8-1.8c-.2-.5-.4-.4-.5-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.7 11.7 0 0 0 4.5 4 5 5 0 0 0 2.3.6 2.7 2.7 0 0 0 1.8-1.3c.2-.4.2-.8.1-.9l-.5-.2z"/></svg>';
  var closeIcon =
    '<svg class="lift-wa-ico-close" viewBox="0 0 24 24"><path d="M18.3 5.7a1 1 0 0 0-1.4 0L12 10.6 7.1 5.7a1 1 0 1 0-1.4 1.4L10.6 12l-4.9 4.9a1 1 0 1 0 1.4 1.4l4.9-4.9 4.9 4.9a1 1 0 0 0 1.4-1.4L13.4 12l4.9-4.9a1 1 0 0 0 0-1.4z"/></svg>';

  // ─── Panel (lazy: el iframe se crea al primer abrir) ───
  var panel = document.createElement("div");
  panel.className = "lift-wa-panel";
  document.body.appendChild(panel);
  var iframeMounted = false;

  // ─── Botón flotante (FAB) ───
  var fab = document.createElement("button");
  fab.className = "lift-wa-fab";
  fab.setAttribute("aria-label", "Abrir chat de compras");
  fab.innerHTML = waIcon + closeIcon + '<span class="lift-wa-badge">1</span>';
  document.body.appendChild(fab);

  // ─── Tooltip opcional ───
  var tip = null;
  if (greeting) {
    tip = document.createElement("div");
    tip.className = "lift-wa-tip";
    tip.textContent = greeting;
    document.body.appendChild(tip);
  }

  var open = false;
  function toggle() {
    open = !open;
    fab.classList.toggle("lift-wa-open", open);
    panel.classList.toggle("lift-wa-open", open);
    fab.setAttribute("aria-label", open ? "Cerrar chat" : "Abrir chat de compras");
    if (open) {
      if (!iframeMounted) {
        var iframe = document.createElement("iframe");
        iframe.src = iframeSrc;
        iframe.setAttribute("title", "Asistente de compras");
        iframe.setAttribute("allow", "clipboard-write");
        panel.appendChild(iframe);
        iframeMounted = true;
      }
      if (tip) tip.style.display = "none";
    }
  }

  fab.addEventListener("click", toggle);

  // Cerrar con tecla Escape.
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && open) toggle();
  });

  // Cerrar desde dentro del iframe (botón del header en mobile fullscreen).
  window.addEventListener("message", function (e) {
    if (e.data && e.data.type === "lift-wa-close" && open) toggle();
  });
})();

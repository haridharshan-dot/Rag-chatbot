(function () {
  function applyFloatingStyles(iframe) {
    var width = Number(iframe.dataset.sonaWidth || 420);
    var height = Number(iframe.dataset.sonaHeight || 700);
    var right = Number(iframe.dataset.sonaRight || 16);
    var bottom = Number(iframe.dataset.sonaBottom || 16);

    iframe.style.position = "fixed";
    iframe.style.right = right + "px";
    iframe.style.bottom = bottom + "px";
    iframe.style.width = width + "px";
    iframe.style.height = height + "px";
    iframe.style.maxWidth = "calc(100vw - 16px)";
    iframe.style.border = iframe.style.border || "0";
    iframe.style.borderRadius = iframe.style.borderRadius || "16px";
    iframe.style.boxShadow =
      iframe.style.boxShadow || "0 10px 25px rgba(0,0,0,0.14)";
    iframe.style.zIndex = iframe.style.zIndex || "999999";
    iframe.style.background = iframe.style.background || "transparent";

    if (window.innerWidth <= 640) {
      iframe.style.left = "8px";
      iframe.style.right = "8px";
      iframe.style.width = "calc(100vw - 16px)";
      iframe.style.height = "82vh";
      iframe.style.bottom = "8px";
      iframe.style.borderRadius = "16px";
    } else {
      iframe.style.left = "auto";
    }
  }

  function bindIframe(iframe) {
    if (!iframe || iframe.dataset.sonaBound === "1") return;
    iframe.dataset.sonaBound = "1";

    var mode = String(iframe.dataset.sonaMode || "inline").toLowerCase();

    if (mode === "floating") {
      applyFloatingStyles(iframe);
      window.addEventListener("resize", function () {
        applyFloatingStyles(iframe);
      });
      return;
    }

    function onMessage(event) {
      if (!event || !event.data || event.data.type !== "sona-chatbot:resize") return;
      if (!iframe.contentWindow || event.source !== iframe.contentWindow) return;

      var nextHeight = Number(event.data.height || 0);
      if (!Number.isFinite(nextHeight) || nextHeight <= 0) return;

      var clamped = Math.max(480, Math.min(900, nextHeight));
      iframe.style.height = clamped + "px";
    }

    window.addEventListener("message", onMessage);
  }

  function init() {
    var frames = document.querySelectorAll('iframe[data-sona-chatbot="true"]');
    frames.forEach(bindIframe);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

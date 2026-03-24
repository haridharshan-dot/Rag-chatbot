(function () {
  function bindIframe(iframe) {
    if (!iframe || iframe.dataset.sonaBound === "1") return;
    iframe.dataset.sonaBound = "1";

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

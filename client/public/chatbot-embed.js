(function () {
  function getHostContext() {
    var title = document.title || "";
    var url = window.location.href || "";
    var metaDescription = "";
    var descriptionTag = document.querySelector('meta[name="description"]');
    if (descriptionTag && descriptionTag.content) {
      metaDescription = descriptionTag.content;
    }

    var headings = Array.prototype.slice
      .call(document.querySelectorAll("h1, h2"))
      .map(function (el) {
        return (el.textContent || "").trim();
      })
      .filter(Boolean)
      .slice(0, 12);

    var bodyText = (document.body && document.body.innerText) || "";
    bodyText = bodyText.replace(/\s+/g, " ").trim().slice(0, 7000);

    return {
      title: title,
      url: url,
      description: metaDescription,
      headings: headings,
      text: bodyText,
      capturedAt: new Date().toISOString(),
    };
  }

  function sendHostContext(iframe) {
    if (!iframe || !iframe.contentWindow) return;
    iframe.contentWindow.postMessage(
      {
        type: "sona-chatbot:hostContext",
        context: getHostContext(),
      },
      "*"
    );
  }

  function applyFloatingStyles(iframe, open, dimensions) {
    var isOpen = typeof open === "boolean" ? open : true;
    var fallbackClosed = { width: 136, height: 84 };
    var fallbackOpen = {
      width: Number(iframe.dataset.sonaWidth || 420),
      height: Number(iframe.dataset.sonaHeight || 700),
    };
    var size = dimensions && Number(dimensions.width) > 0 && Number(dimensions.height) > 0
      ? { width: Number(dimensions.width), height: Number(dimensions.height) }
      : (isOpen ? fallbackOpen : fallbackClosed);
    var right = Number(iframe.dataset.sonaRight || 16);
    var bottom = Number(iframe.dataset.sonaBottom || 16);

    iframe.style.position = "fixed";
    iframe.style.right = right + "px";
    iframe.style.bottom = bottom + "px";
    iframe.style.width = size.width + "px";
    iframe.style.height = size.height + "px";
    iframe.style.maxWidth = "calc(100vw - 16px)";
    iframe.style.border = iframe.style.border || "0";
    iframe.style.borderRadius = isOpen ? "16px" : "14px";
    iframe.style.boxShadow = isOpen
      ? "0 10px 25px rgba(0,0,0,0.14)"
      : "0 8px 18px rgba(0,0,0,0.16)";
    iframe.style.zIndex = iframe.style.zIndex || "999999";
    iframe.style.background = iframe.style.background || "transparent";

    if (window.innerWidth <= 640) {
      if (isOpen) {
        iframe.style.left = "8px";
        iframe.style.right = "8px";
        iframe.style.width = "calc(100vw - 16px)";
        iframe.style.height = "82vh";
        iframe.style.bottom = "8px";
        iframe.style.borderRadius = "16px";
      } else {
        iframe.style.left = "auto";
        iframe.style.right = "8px";
        iframe.style.width = "136px";
        iframe.style.height = "84px";
        iframe.style.bottom = "8px";
        iframe.style.borderRadius = "14px";
      }
    } else {
      iframe.style.left = "auto";
    }
  }

  function applyCompactStyles(iframe, open, dimensions) {
    var width = Number((dimensions && dimensions.width) || iframe.dataset.sonaWidth || 420);
    var height = Number((dimensions && dimensions.height) || iframe.dataset.sonaHeight || 700);
    var right = Number(iframe.dataset.sonaRight || 16);
    var bottom = Number(iframe.dataset.sonaBottom || 16);

    iframe.style.position = "fixed";
    iframe.style.right = right + "px";
    iframe.style.bottom = bottom + "px";
    iframe.style.left = "auto";
    iframe.style.width = width + "px";
    iframe.style.height = height + "px";
    iframe.style.border = "0";
    iframe.style.borderRadius = open ? "16px" : "14px";
    iframe.style.boxShadow = open
      ? "0 10px 25px rgba(0,0,0,0.14)"
      : "0 8px 18px rgba(0,0,0,0.16)";
    iframe.style.zIndex = iframe.style.zIndex || "999999";
    iframe.style.background = "transparent";

    if (window.innerWidth <= 640) {
      if (open) {
        iframe.style.left = "8px";
        iframe.style.right = "8px";
        iframe.style.width = "calc(100vw - 16px)";
        iframe.style.height = "82vh";
        iframe.style.bottom = "8px";
        iframe.style.borderRadius = "16px";
      } else {
        iframe.style.left = "auto";
        iframe.style.right = "8px";
        iframe.style.width = "136px";
        iframe.style.height = "84px";
        iframe.style.bottom = "8px";
        iframe.style.borderRadius = "14px";
      }
    }
  }

  function bindIframe(iframe) {
    if (!iframe || iframe.dataset.sonaBound === "1") return;
    iframe.dataset.sonaBound = "1";

    iframe.addEventListener("load", function () {
      sendHostContext(iframe);
    });

    function onHostContextRequest(event) {
      if (!event || !event.data || event.data.type !== "sona-chatbot:requestHostContext") return;
      if (!iframe.contentWindow || event.source !== iframe.contentWindow) return;
      sendHostContext(iframe);
    }

    window.addEventListener("message", onHostContextRequest);

    var mode = String(iframe.dataset.sonaMode || "inline").toLowerCase();

    if (mode === "floating") {
      var floatingState = {
        open: false,
        dimensions: { width: 136, height: 84 },
      };

      function onFloatingMessage(event) {
        if (!event || !event.data || event.data.type !== "sona-chatbot:state") return;
        if (!iframe.contentWindow || event.source !== iframe.contentWindow) return;

        floatingState.open = Boolean(event.data.open);
        floatingState.dimensions = event.data.dimensions || null;
        applyFloatingStyles(iframe, floatingState.open, floatingState.dimensions);
      }

      applyFloatingStyles(iframe, floatingState.open, floatingState.dimensions);
      window.addEventListener("message", onFloatingMessage);
      window.addEventListener("resize", function () {
        applyFloatingStyles(iframe, floatingState.open, floatingState.dimensions);
      });
      return;
    }

    if (mode === "compact") {
      applyCompactStyles(iframe, false, { width: 136, height: 84 });

      function onCompactMessage(event) {
        if (!event || !event.data || event.data.type !== "sona-chatbot:state") return;
        if (!iframe.contentWindow || event.source !== iframe.contentWindow) return;
        applyCompactStyles(iframe, Boolean(event.data.open), event.data.dimensions || null);
      }

      window.addEventListener("message", onCompactMessage);
      window.addEventListener("resize", function () {
        applyCompactStyles(iframe, iframe.style.height !== "84px", null);
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

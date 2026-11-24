(function () {
  "use strict";

  var year = document.querySelector("[data-year]");
  if (year) year.textContent = String(new Date().getFullYear());

  var root = document.documentElement;
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  var framePending = false;

  function updatePaperSettle() {
    framePending = false;

    var maxScroll = Math.max(0, root.scrollHeight - window.innerHeight);
    var distanceToEnd = maxScroll - window.scrollY;
    var range = Math.min(260, maxScroll * 0.1);
    var progress = range > 0
      ? Math.max(0, Math.min(1, (range - distanceToEnd) / range))
      : 0;
    if (reduceMotion.matches) progress = 0;
    var eased = progress * progress * (3 - 2 * progress);

    root.style.setProperty("--paper-settle", eased.toFixed(3));
  }

  function queueSettleUpdate() {
    if (framePending) return;
    framePending = true;
    window.requestAnimationFrame(updatePaperSettle);
  }

  window.addEventListener("scroll", queueSettleUpdate, { passive: true });
  window.addEventListener("resize", queueSettleUpdate);
  window.addEventListener("load", queueSettleUpdate, { once: true });
  queueSettleUpdate();
})();

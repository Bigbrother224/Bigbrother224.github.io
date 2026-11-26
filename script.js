(function () {
  "use strict";

  var year = document.querySelector("[data-year]");
  if (year) year.textContent = String(new Date().getFullYear());

  var receipt = document.querySelector(".receipt");
  var canvas = document.querySelector(".receipt__crumple");
  var context = canvas && canvas.getContext("2d", { alpha: true, desynchronized: true });
  if (!receipt || !canvas || !context) return;

  var root = document.documentElement;
  var reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  var mobileQuery = window.matchMedia("(max-width: 560px)");
  var frameId = 0;
  var lastFrameTime = 0;
  var targetProgress = 0;
  var currentProgress = 0;
  var pixelRatio = 1;
  var viewportWidth = window.innerWidth;
  var viewportHeight = window.innerHeight;
  var desktopTexture = loadTexture("assets/img/receipt-desktop.webp");
  var mobileTexture = loadTexture("assets/img/receipt-mobile.webp");

  function loadTexture(src) {
    var image = new Image();
    image.addEventListener("load", requestFrame, { once: true });
    image.src = src;
    return image;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function smoothstep(start, end, value) {
    var t = clamp((value - start) / (end - start), 0, 1);
    return t * t * (3 - 2 * t);
  }

  function activeTexture() {
    return mobileQuery.matches ? mobileTexture : desktopTexture;
  }

  function resizeCanvas() {
    pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
    viewportWidth = window.innerWidth;
    viewportHeight = window.innerHeight;
    canvas.width = Math.round(viewportWidth * pixelRatio);
    canvas.height = Math.round(viewportHeight * pixelRatio);
    canvas.style.width = viewportWidth + "px";
    canvas.style.height = viewportHeight + "px";
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    updateTarget();
  }

  function updatePaperSettle() {
    var maxScroll = Math.max(0, root.scrollHeight - viewportHeight);
    var distanceToEnd = maxScroll - window.scrollY;
    var settleRange = Math.min(260, maxScroll * 0.1);
    var settle = settleRange > 0
      ? clamp((settleRange - distanceToEnd) / settleRange, 0, 1)
      : 0;
    if (reducedMotion.matches) settle = 0;
    settle = settle * settle * (3 - 2 * settle);
    root.style.setProperty("--paper-settle", settle.toFixed(3));
  }

  function updateTarget() {
    updatePaperSettle();
    var maxScroll = Math.max(0, root.scrollHeight - viewportHeight);
    var distanceToEnd = maxScroll - window.scrollY;
    var range = Math.min(820, Math.max(480, maxScroll * 0.18));
    targetProgress = reducedMotion.matches
      ? 0
      : clamp((range - distanceToEnd) / range, 0, 1);
    requestFrame();
  }

  function requestFrame() {
    if (!frameId) frameId = window.requestAnimationFrame(renderFrame);
  }

  function makeVertex(u, v, image, rect, radius, centerX, centerY, progress) {
    var flatX = rect.left + u * rect.width;
    var flatY = rect.top + v * rect.height;
    var baseTheta = u * Math.PI * 2;
    var basePhi = v * Math.PI;
    var theta = baseTheta
      + Math.sin(basePhi * 3.6 + 0.4) * 0.29
      + Math.sin(baseTheta * 2.5 + basePhi * 5.7) * 0.16
      + Math.sin(baseTheta * 7.2 - basePhi * 4.3) * 0.055
      + progress * 0.34;
    var phi = clamp(
      basePhi
        + Math.sin(baseTheta * 4.7 + basePhi * 4.1) * 0.13 * Math.sin(basePhi)
        + Math.cos(baseTheta * 8.2 - basePhi * 6.7) * 0.07 * Math.sin(basePhi),
      0,
      Math.PI
    );
    var ridge = 0.88
      + Math.sin(theta * 5.1 + phi * 3.7) * 0.1
      + Math.cos(theta * 8.8 - phi * 6.2) * 0.066
      + Math.sin(theta * 13.2 + phi * 11.4) * 0.039;
    var pinches = Math.pow(Math.max(0, Math.sin(theta * 7.2 + phi * 5.3)), 10);
    var surfaceRadius = radius * (ridge - pinches * 0.045);
    var targetX3 = Math.sin(phi) * Math.cos(theta) * surfaceRadius;
    var targetY3 = Math.cos(phi) * surfaceRadius;
    var targetZ3 = Math.sin(phi) * Math.sin(theta) * surfaceRadius;
    var cameraDistance = radius * 3.8;
    var perspective = cameraDistance / (cameraDistance - targetZ3);
    var targetX = centerX + targetX3 * perspective;
    var targetY = centerY + targetY3 * perspective;

    // The fold travels from the receipt's torn end upward, gathering the full strip.
    var foldStart = (1 - v) * 0.44;
    var localFold = smoothstep(foldStart, foldStart + 0.56, progress);
    var ripple = Math.sin(theta * 8.5 + phi * 10.7) * radius * 0.17
      * Math.sin(Math.PI * localFold) * (0.25 + progress * 0.75);
    var curlX = Math.cos(theta * 6.8 - phi * 12.2) * ripple * 0.32;
    var curlY = Math.sin(theta * 9.3 + phi * 7.4) * ripple * 0.28;
    var curlZ = Math.sin(theta * 10.8 - phi * 9.1) * ripple;

    var worldX = (flatX - centerX) * (1 - localFold) + targetX3 * localFold + curlX;
    var worldY = (flatY - centerY) * (1 - localFold) + targetY3 * localFold + curlY;
    var worldZ = targetZ3 * localFold + curlZ;

    return {
      sx: u * image.naturalWidth,
      sy: v * image.naturalHeight,
      x: flatX * (1 - localFold) + targetX * localFold + curlX,
      y: flatY * (1 - localFold) + targetY * localFold + curlY,
      wx: worldX,
      wy: worldY,
      wz: worldZ,
      z: worldZ
    };
  }

  function triangleShade(a, b, c, progress) {
    var abx = b.wx - a.wx;
    var aby = b.wy - a.wy;
    var abz = b.wz - a.wz;
    var acx = c.wx - a.wx;
    var acy = c.wy - a.wy;
    var acz = c.wz - a.wz;
    var nx = aby * acz - abz * acy;
    var ny = abz * acx - abx * acz;
    var nz = abx * acy - aby * acx;
    var length = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
    nx /= length;
    ny /= length;
    nz /= length;
    var light = Math.abs(nx * -0.28 + ny * -0.48 + nz * 0.83);
    return clamp(progress * (0.035 + (1 - light) * 0.23), 0, 0.24);
  }

  function drawTriangle(image, a, b, c, progress) {
    var dx1 = b.x - a.x;
    var dy1 = b.y - a.y;
    var dx2 = c.x - a.x;
    var dy2 = c.y - a.y;
    var area = dx1 * dy2 - dx2 * dy1;
    if (Math.abs(area) < 0.12) return;

    var left = Math.min(a.x, b.x, c.x);
    var right = Math.max(a.x, b.x, c.x);
    var top = Math.min(a.y, b.y, c.y);
    var bottom = Math.max(a.y, b.y, c.y);
    if (right < -4 || left > viewportWidth + 4 || bottom < -4 || top > viewportHeight + 4) return;

    var sourceArea = (b.sx - a.sx) * (c.sy - a.sy) - (c.sx - a.sx) * (b.sy - a.sy);
    if (Math.abs(sourceArea) < 0.01) return;
    var inv = 1 / sourceArea;
    var mA = (dx1 * (c.sy - a.sy) - dx2 * (b.sy - a.sy)) * inv;
    var mC = ((b.sx - a.sx) * dx2 - (c.sx - a.sx) * dx1) * inv;
    var mB = (dy1 * (c.sy - a.sy) - dy2 * (b.sy - a.sy)) * inv;
    var mD = ((b.sx - a.sx) * dy2 - (c.sx - a.sx) * dy1) * inv;
    var mE = a.x - mA * a.sx - mC * a.sy;
    var mF = a.y - mB * a.sx - mD * a.sy;

    context.save();
    context.beginPath();
    context.moveTo(a.x, a.y);
    context.lineTo(b.x, b.y);
    context.lineTo(c.x, c.y);
    context.closePath();
    context.clip();
    context.transform(mA, mB, mC, mD, mE, mF);
    context.drawImage(image, 0, 0);
    var shade = triangleShade(a, b, c, progress);
    var inkWash = smoothstep(0.18, 1, progress) * 0.86;
    if (inkWash > 0.005) {
      context.fillStyle = "rgba(255, 255, 255, " + inkWash.toFixed(3) + ")";
      context.fillRect(0, 0, image.naturalWidth, image.naturalHeight);
    }
    if (shade > 0.006) {
      context.fillStyle = "rgba(47, 49, 54, " + shade.toFixed(3) + ")";
      context.fillRect(0, 0, image.naturalWidth, image.naturalHeight);
    }
    context.restore();
  }

  function drawBallShadow(progress, centerX, centerY, radius) {
    var strength = smoothstep(0.2, 0.9, progress);
    if (strength < 0.01) return;
    var shadowX = centerX + radius * 0.24;
    var shadowY = centerY + radius * 0.74;
    var shadow = context.createRadialGradient(
      shadowX,
      shadowY,
      radius * 0.08,
      shadowX,
      shadowY,
      radius * 1.42
    );
    shadow.addColorStop(0, "rgba(31, 32, 35, " + (0.27 * strength).toFixed(3) + ")");
    shadow.addColorStop(0.42, "rgba(31, 32, 35, " + (0.15 * strength).toFixed(3) + ")");
    shadow.addColorStop(1, "rgba(31, 32, 35, 0)");
    context.fillStyle = shadow;
    context.beginPath();
    context.ellipse(shadowX, shadowY, radius * 1.36, radius * 0.42, -0.08, 0, Math.PI * 2);
    context.fill();
  }

  function renderCrumple(progress) {
    var image = activeTexture();
    if (!image.complete || !image.naturalWidth) return false;

    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    context.clearRect(0, 0, viewportWidth, viewportHeight);
    var rect = receipt.getBoundingClientRect();
    var layoutWidth = receipt.offsetWidth;
    var layoutHeight = receipt.offsetHeight;
    var centerX = viewportWidth * 0.5;
    var centerY = viewportHeight * 0.51;
    var radius = Math.min(130, Math.max(64, viewportWidth * 0.1));
    var blush = smoothstep(0.16, 0.98, progress);
    if (blush > 0.005) {
      var backdrop = context.createLinearGradient(0, 0, viewportWidth, viewportHeight);
      backdrop.addColorStop(0, "rgba(222, 177, 187, " + (0.94 * blush).toFixed(3) + ")");
      backdrop.addColorStop(1, "rgba(207, 148, 163, " + (0.94 * blush).toFixed(3) + ")");
      context.fillStyle = backdrop;
      context.fillRect(0, 0, viewportWidth, viewportHeight);
    }
    drawBallShadow(progress, centerX, centerY, radius);

    var columns = mobileQuery.matches ? 12 : 18;
    var rows = clamp(Math.ceil(image.naturalHeight / (mobileQuery.matches ? 46 : 42)), 64, 94);
    var vertices = new Array((columns + 1) * (rows + 1));
    for (var row = 0; row <= rows; row++) {
      var v = row / rows;
      for (var column = 0; column <= columns; column++) {
        var u = column / columns;
        vertices[row * (columns + 1) + column] = makeVertex(
          u, v, image, { left: rect.left, top: rect.top, width: layoutWidth, height: layoutHeight },
          radius, centerX, centerY, progress
        );
      }
    }

    var triangles = [];
    for (var y = 0; y < rows; y++) {
      for (var x = 0; x < columns; x++) {
        var i = y * (columns + 1) + x;
        var topLeft = vertices[i];
        var topRight = vertices[i + 1];
        var bottomLeft = vertices[i + columns + 1];
        var bottomRight = vertices[i + columns + 2];
        triangles.push({ a: topLeft, b: topRight, c: bottomLeft, z: (topLeft.z + topRight.z + bottomLeft.z) / 3 });
        triangles.push({ a: topRight, b: bottomRight, c: bottomLeft, z: (topRight.z + bottomRight.z + bottomLeft.z) / 3 });
      }
    }
    triangles.sort(function (a, b) { return a.z - b.z; });
    for (var i = 0; i < triangles.length; i++) {
      var triangle = triangles[i];
      drawTriangle(image, triangle.a, triangle.b, triangle.c, progress);
    }
    return true;
  }

  function renderFrame(time) {
    frameId = 0;
    var elapsed = lastFrameTime ? Math.min(80, time - lastFrameTime) : 16;
    lastFrameTime = time;
    var follow = 1 - Math.exp(-elapsed / 110);
    currentProgress += (targetProgress - currentProgress) * follow;
    if (Math.abs(targetProgress - currentProgress) < 0.001) currentProgress = targetProgress;

    if (currentProgress < 0.001 && targetProgress < 0.001) {
      canvas.style.opacity = "0";
      receipt.style.opacity = "1";
      receipt.style.pointerEvents = "";
      root.style.setProperty("--paper-crumple", "0");
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      context.clearRect(0, 0, viewportWidth, viewportHeight);
      lastFrameTime = 0;
      return;
    }

    if (!renderCrumple(currentProgress)) {
      canvas.style.opacity = "0";
      receipt.style.opacity = "1";
      receipt.style.pointerEvents = "";
      if (targetProgress !== currentProgress) requestFrame();
      return;
    }

    canvas.style.opacity = "1";
    var receiptFade = smoothstep(0.08, 0.68, currentProgress);
    receipt.style.opacity = (1 - receiptFade).toFixed(3);
    receipt.style.pointerEvents = currentProgress > 0.04 ? "none" : "";
    root.style.setProperty("--paper-crumple", currentProgress.toFixed(3));

    if (Math.abs(targetProgress - currentProgress) >= 0.001) requestFrame();
    else lastFrameTime = 0;
  }

  window.addEventListener("scroll", updateTarget, { passive: true });
  window.addEventListener("resize", resizeCanvas);
  window.addEventListener("load", updateTarget, { once: true });
  if (mobileQuery.addEventListener) mobileQuery.addEventListener("change", requestFrame);
  if (reducedMotion.addEventListener) reducedMotion.addEventListener("change", updateTarget);

  resizeCanvas();
  updateTarget();
})();

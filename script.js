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
  var foldLighting = loadTexture("assets/img/paper-fold-lighting.webp");
  var foldPixels = null;
  var foldWidth = 0;
  var foldHeight = 0;
  foldLighting.addEventListener("load", cacheFoldLighting, { once: true });

  function loadTexture(src) {
    var image = new Image();
    image.addEventListener("load", requestFrame, { once: true });
    image.src = src;
    return image;
  }

  function cacheFoldLighting() {
    var map = document.createElement("canvas");
    map.width = foldLighting.naturalWidth;
    map.height = foldLighting.naturalHeight;
    var mapContext = map.getContext("2d", { willReadFrequently: true });
    try {
      mapContext.drawImage(foldLighting, 0, 0);
      foldPixels = mapContext.getImageData(0, 0, map.width, map.height).data;
      foldWidth = map.width;
      foldHeight = map.height;
    } catch (error) {
      foldPixels = null;
    }
  }

  function sampleFoldLighting(u, v) {
    if (!foldPixels || u < 0 || u > 1 || v < 0 || v > 1) return { luminance: 0.78, alpha: 0 };
    var x = u * (foldWidth - 1);
    var y = v * (foldHeight - 1);
    var x0 = Math.floor(x);
    var y0 = Math.floor(y);
    var x1 = Math.min(foldWidth - 1, x0 + 1);
    var y1 = Math.min(foldHeight - 1, y0 + 1);
    var fx = x - x0;
    var fy = y - y0;
    function channel(ix, iy, offset) {
      return foldPixels[(iy * foldWidth + ix) * 4 + offset] / 255;
    }
    function bilinear(offset) {
      var top = channel(x0, y0, offset) * (1 - fx) + channel(x1, y0, offset) * fx;
      var bottom = channel(x0, y1, offset) * (1 - fx) + channel(x1, y1, offset) * fx;
      return top * (1 - fy) + bottom * fy;
    }
    return { luminance: bilinear(0), alpha: bilinear(3) };
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
        + Math.sin(baseTheta * 4.7 + basePhi * 4.1) * 0.16 * Math.sin(basePhi)
        + Math.cos(baseTheta * 8.2 - basePhi * 6.7) * 0.09 * Math.sin(basePhi),
      0,
      Math.PI
    );
    var ridge = 0.91
      + Math.sin(theta * 4.4 + phi * 3.2) * 0.074
      + Math.cos(theta * 7.2 - phi * 5.5) * 0.043
      + Math.sin(theta * 11.2 + phi * 9.4) * 0.024;
    var pinches = Math.pow(Math.max(0, Math.sin(theta * 6.4 + phi * 4.8)), 12);
    var surfaceRadius = radius * (ridge - pinches * 0.03);
    var targetX3 = Math.sin(phi) * Math.cos(theta) * surfaceRadius;
    var targetY3 = Math.cos(phi) * surfaceRadius;
    var targetZ3 = Math.sin(phi) * Math.sin(theta) * surfaceRadius;
    var cameraDistance = radius * 3.8;
    var perspective = cameraDistance / (cameraDistance - targetZ3);
    var targetX = centerX + targetX3 * perspective;
    var targetY = centerY + targetY3 * perspective;
    var lightWidth = radius * 2.14;
    var lightHeight = foldLighting.naturalWidth
      ? lightWidth * foldLighting.naturalHeight / foldLighting.naturalWidth
      : lightWidth;
    var foldSample = sampleFoldLighting(
      (targetX - (centerX - lightWidth / 2)) / lightWidth,
      (targetY - (centerY - lightHeight / 2)) / lightHeight
    );
    surfaceRadius += (foldSample.luminance - 0.78) * radius * 0.55 * foldSample.alpha;
    targetX3 = Math.sin(phi) * Math.cos(theta) * surfaceRadius;
    targetY3 = Math.cos(phi) * surfaceRadius;
    targetZ3 = Math.sin(phi) * Math.sin(theta) * surfaceRadius;
    perspective = cameraDistance / (cameraDistance - targetZ3);
    targetX = centerX + targetX3 * perspective;
    targetY = centerY + targetY3 * perspective;

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
    var inkWash = smoothstep(0.22, 0.9, progress) * 0.5;
    if (inkWash > 0.005) {
      context.fillStyle = "rgba(255, 255, 255, " + inkWash.toFixed(3) + ")";
      context.fillRect(0, 0, image.naturalWidth, image.naturalHeight);
    }
    context.restore();
  }

  function drawBallShadow(progress, centerX, centerY, radius) {
    var strength = smoothstep(0.2, 0.9, progress);
    if (strength < 0.01) return;
    var shadowX = centerX + radius * 0.22;
    var shadowY = centerY + radius * 0.76;
    var shadow = context.createRadialGradient(
      shadowX,
      shadowY,
      radius * 0.12,
      shadowX,
      shadowY,
      radius * 1.2
    );
    shadow.addColorStop(0, "rgba(31, 32, 35, " + (0.18 * strength).toFixed(3) + ")");
    shadow.addColorStop(0.4, "rgba(31, 32, 35, " + (0.09 * strength).toFixed(3) + ")");
    shadow.addColorStop(1, "rgba(31, 32, 35, 0)");
    context.fillStyle = shadow;
    context.beginPath();
    context.ellipse(shadowX, shadowY, radius * 1.12, radius * 0.34, -0.1, 0, Math.PI * 2);
    context.fill();

    var contactX = centerX + radius * 0.12;
    var contactY = centerY + radius * 0.78;
    var contact = context.createRadialGradient(contactX, contactY, 0, contactX, contactY, radius * 0.72);
    contact.addColorStop(0, "rgba(31, 32, 35, " + (0.13 * strength).toFixed(3) + ")");
    contact.addColorStop(1, "rgba(31, 32, 35, 0)");
    context.fillStyle = contact;
    context.beginPath();
    context.ellipse(contactX, contactY, radius * 0.72, radius * 0.18, -0.05, 0, Math.PI * 2);
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
    drawBallShadow(progress, centerX, centerY, radius);

    var columns = mobileQuery.matches ? 16 : 22;
    var rows = clamp(Math.ceil(image.naturalHeight / (mobileQuery.matches ? 40 : 36)), 78, 112);
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
    if (foldLighting.complete && foldLighting.naturalWidth && progress > 0.01) {
      var lightStrength = smoothstep(0.24, 0.92, progress) * 0.62;
      var lightWidth = radius * 2.14;
      var lightHeight = lightWidth * foldLighting.naturalHeight / foldLighting.naturalWidth;
      context.save();
      context.globalCompositeOperation = "multiply";
      context.globalAlpha = lightStrength;
      context.filter = "blur(0.35px)";
      context.drawImage(foldLighting, centerX - lightWidth / 2, centerY - lightHeight / 2, lightWidth, lightHeight);
      context.restore();
    }
    context.globalAlpha = 1;
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

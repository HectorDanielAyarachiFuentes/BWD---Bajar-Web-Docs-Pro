/**
 * ============================================================================
 * Webs-Docs — Motor Compartido de Costura Interior sin Líneas Blancas
 * Módulo único usado por popup/ y editor/ (shared/capture-stitch.js)
 * ============================================================================
 */
(function (global) {
  'use strict';

  const BwdShared = global.BwdShared || (global.BwdShared = {});

  function loadImageElement(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  // Paso de scroll múltiplo de 8px para lograr enteros exactos en DPI 100%/125%/150%/200%
  function computeScrollStep(viewportH) {
    const overlapCss = Math.min(96, Math.max(32, Math.floor(viewportH * 0.2)));
    const stepCss = Math.max(64, Math.floor((viewportH - overlapCss) / 8) * 8);
    return { overlapCss, stepCss };
  }

  /**
   * Ensambla cortes capturados recortando el borde inferior de cortes intermedios
   * y tomando el inicio del siguiente corte desde el interior limpio (0 líneas blancas).
   */
  async function stitchCapturedSlices(slices, {
    cropX = 0,
    cropY = 0,
    cropW = null,
    cropH = null,
    dprY = 1,
    totalH = null
  } = {}) {
    if (!Array.isArray(slices) || slices.length === 0) return null;

    const firstImg = await loadImageElement(slices[0].url);
    const effCropX = Math.max(0, Math.round(cropX));
    const effCropY = Math.max(0, Math.round(cropY));
    const effCropW = cropW ? Math.max(1, Math.min(firstImg.width - effCropX, Math.round(cropW))) : Math.max(1, firstImg.width - effCropX);
    const effCropH = cropH ? Math.max(1, Math.min(firstImg.height - effCropY, Math.round(cropH))) : Math.max(1, firstImg.height - effCropY - 2);

    const lastScroll = slices[slices.length - 1].actualScrollY || 0;
    const masterHeight = slices.length === 1
      ? Math.max(1, totalH ? Math.min(effCropH, Math.round(totalH * dprY)) : effCropH)
      : Math.max(1, Math.round(lastScroll * dprY) + effCropH);

    const masterCanvas = document.createElement('canvas');
    masterCanvas.width = effCropW;
    masterCanvas.height = masterHeight;
    const ctx = masterCanvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;

    const bottomTrimPx = slices.length > 1
      ? Math.min(Math.floor(effCropH * 0.14), Math.max(10, Math.round(28 * dprY)))
      : 0;

    const firstDrawH = Math.max(1, Math.min(masterHeight, effCropH - bottomTrimPx));
    ctx.drawImage(firstImg, effCropX, effCropY, effCropW, firstDrawH, 0, 0, effCropW, firstDrawH);
    let paintedDocPx = firstDrawH;

    for (let i = 1; i < slices.length; i++) {
      const img = await loadImageElement(slices[i].url);
      const isLastSlice = (i === slices.length - 1);
      const sliceStartDocPx = Math.round((slices[i].actualScrollY || 0) * dprY);
      const usableLocalEnd = isLastSlice ? effCropH : Math.max(1, effCropH - bottomTrimPx);

      const localStartY = Math.max(0, paintedDocPx - sliceStartDocPx);
      const drawH = Math.min(usableLocalEnd - localStartY, masterHeight - paintedDocPx);

      if (drawH > 0) {
        ctx.drawImage(img, effCropX, effCropY + localStartY, effCropW, drawH, 0, paintedDocPx, effCropW, drawH);
        paintedDocPx += drawH;
      }
    }

    if (paintedDocPx > 0 && paintedDocPx < masterCanvas.height) {
      const trimmed = document.createElement('canvas');
      trimmed.width = effCropW;
      trimmed.height = paintedDocPx;
      trimmed.getContext('2d').drawImage(masterCanvas, 0, 0, effCropW, paintedDocPx, 0, 0, effCropW, paintedDocPx);
      return trimmed;
    }

    return masterCanvas;
  }

  Object.assign(BwdShared, {
    loadImageElement,
    computeScrollStep,
    stitchCapturedSlices
  });
})(window);

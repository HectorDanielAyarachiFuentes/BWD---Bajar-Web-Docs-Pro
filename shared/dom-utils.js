/**
 * ============================================================================
 * Webs-Docs — Utilidades DOM, Descargas y Formato Compartidas (shared/dom-utils.js)
 * Módulo único usado por popup/ y editor/ para evitar duplicación de código.
 * ============================================================================
 */
(function (global) {
  'use strict';

  const BwdShared = global.BwdShared || (global.BwdShared = {});

  function getOrganizedPath(filename) {
    if (!filename) return filename;
    if (filename.includes('/') || filename.includes('\\')) return filename;

    const ext = (filename.split('.').pop() || '').toLowerCase();
    let folder = '';
    switch (ext) {
      case 'pdf':
        folder = 'PDFs';
        break;
      case 'doc':
      case 'docx':
      case 'rtf':
      case 'odt':
      case 'txt':
        folder = 'Documentos';
        break;
      case 'png':
      case 'jpg':
      case 'jpeg':
      case 'webp':
      case 'svg':
        folder = 'Imágenes';
        break;
      case 'html':
      case 'htm':
      case 'json':
      case 'xml':
        folder = 'Código';
        break;
      case 'zip':
      case 'rar':
      case '7z':
      case 'tar':
      case 'gz':
        folder = 'Comprimidos';
        break;
      default:
        folder = '';
    }
    return folder ? `${folder}/${filename}` : filename;
  }

  function sanitizeFilename(title, ext, suffix = '') {
    let raw = String(title || 'documento_web').trim();
    const stripped = raw.replace(/\s*[-|—–•]\s*[^-|—–•]{2,30}$/u, '').trim();
    if (stripped.length >= 10) {
      raw = stripped;
    }

    let clean = raw;
    try {
      clean = clean.normalize('NFC');
    } catch (_) {}

    const maxLen = suffix ? 55 : 68;
    clean = clean
      .replace(/[\\/:*?"<>|\x00-\x1F]+/g, ' ')
      .replace(/[^\p{L}\p{N}\s._()-]/gu, '')
      .trim()
      .replace(/\s+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^[_.-]+|[_.-]+$/g, '')
      .substring(0, maxLen);

    if (!clean) clean = 'documento_web';
    return `${clean}${suffix}.${ext}`;
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  function canvasToBlob(canvas, mimeType = 'image/png', quality) {
    return new Promise((resolve, reject) => {
      try {
        canvas.toBlob((blob) => {
          if (blob) resolve(blob);
          else reject(new Error('No se pudo codificar el lienzo de imagen.'));
        }, mimeType, quality);
      } catch (err) {
        reject(err);
      }
    });
  }

  async function triggerDownload(blobOrUrl, filename) {
    let downloadUrl = blobOrUrl;
    let isCreatedObjectUrl = false;
    const targetFilename = getOrganizedPath(filename);
    const api = typeof browser !== 'undefined' ? browser : (typeof chrome !== 'undefined' ? chrome : null);

    if (blobOrUrl instanceof Blob) {
      downloadUrl = URL.createObjectURL(blobOrUrl);
      isCreatedObjectUrl = true;
    }

    try {
      if (api && api.downloads && api.downloads.download) {
        await api.downloads.download({
          url: downloadUrl,
          filename: targetFilename,
          saveAs: false
        });
        if (isCreatedObjectUrl) {
          setTimeout(() => URL.revokeObjectURL(downloadUrl), 30000);
        }
        return;
      }
    } catch (err) {
      console.warn('api.downloads con ObjectURL falló, intentando respaldo:', err);
      if (blobOrUrl instanceof Blob) {
        try {
          const dataUrl = await blobToDataUrl(blobOrUrl);
          if (api && api.downloads && api.downloads.download) {
            await api.downloads.download({
              url: dataUrl,
              filename: targetFilename,
              saveAs: false
            });
            if (isCreatedObjectUrl) URL.revokeObjectURL(downloadUrl);
            return;
          }
        } catch (_) {}
      }
    }

    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = targetFilename;
    document.body.appendChild(a);
    a.click();
    a.remove();

    if (isCreatedObjectUrl) {
      setTimeout(() => URL.revokeObjectURL(downloadUrl), 30000);
    }
  }

  function escapeXml(unsafe) {
    if (!unsafe) return '';
    return String(unsafe)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;')
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function pickBestSrcsetUrl(srcsetStr) {
    if (!srcsetStr || typeof srcsetStr !== 'string') return '';
    const regex = /(\S+)(?:\s+(\d+(?:\.\d+)?)([wx]))?(?:\s*,\s*|$)/g;
    let bestUrl = '';
    let bestScore = -1;
    let match;
    while ((match = regex.exec(srcsetStr.trim())) !== null) {
      if (!match[1]) break;
      const url = match[1].replace(/,+$/, '');
      if (!url || url.includes('data:image/svg') || url.includes('placeholder')) continue;
      const val = match[2] ? parseFloat(match[2]) : 1;
      const unit = match[3] || 'x';
      const score = unit === 'w' ? val : val * 1000;
      if (score >= bestScore) {
        bestScore = score;
        bestUrl = url;
      }
    }
    return bestUrl;
  }

  function detectPageTheme(doc) {
    let bgColor = '#ffffff';
    let isDark = false;
    let bgR = 255, bgG = 255, bgB = 255;
    try {
      const win = (doc && doc.defaultView) || global;
      const body = doc && doc.body;
      const docEl = doc && doc.documentElement;
      let rawBg = body ? win.getComputedStyle(body).backgroundColor : '';
      if (!rawBg || rawBg === 'transparent' || rawBg === 'rgba(0, 0, 0, 0)') {
        rawBg = docEl ? win.getComputedStyle(docEl).backgroundColor : '';
      }
      if (rawBg && rawBg !== 'transparent' && rawBg !== 'rgba(0, 0, 0, 0)') {
        bgColor = rawBg;
        const rgbMatch = rawBg.match(/\d+/g);
        if (rgbMatch && rgbMatch.length >= 3) {
          bgR = parseInt(rgbMatch[0], 10);
          bgG = parseInt(rgbMatch[1], 10);
          bgB = parseInt(rgbMatch[2], 10);
          isDark = (0.299 * bgR + 0.587 * bgG + 0.114 * bgB) < 128;
        }
      }
    } catch (_) {}
    return { bgColor, isDark, bgR, bgG, bgB };
  }

  function formatErrorMessage(err) {
    if (!err) return 'Error desconocido';
    if (typeof err === 'string') return err;
    if (err instanceof Error) return err.message || err.toString();
    if (typeof err === 'object') {
      if (err.message) return String(err.message);
      if (err.error) return typeof err.error === 'object' ? formatErrorMessage(err.error) : String(err.error);
      if (err.id && err.windowId) return 'Error de comunicación con la pestaña del navegador.';
      try { return JSON.stringify(err); } catch (_) { return String(err); }
    }
    return String(err);
  }

  Object.assign(BwdShared, {
    getOrganizedPath,
    sanitizeFilename,
    blobToDataUrl,
    canvasToBlob,
    triggerDownload,
    escapeXml,
    escapeHtml,
    pickBestSrcsetUrl,
    detectPageTheme,
    formatErrorMessage
  });
})(window);

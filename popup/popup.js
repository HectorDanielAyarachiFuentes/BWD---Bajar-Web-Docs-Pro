/**
 * ============================================================================
 * BWD — Executive Edition Controller
 * Basado en las soluciones de repositorios de referencia en GitHub:
 * - PDF Fiel: Firefox Native Engine (browser.tabs.saveAsPDF) con preservación
 *   de colores y fondos, vector real, cero problemas de CORS/taint.
 * - PNG Completo: Algoritmo de scrolling + captureVisibleTab (estilo GoFullPage)
 * - Word: Extractor semántico limpio (.doc enriquecido con metadatos)
 * ============================================================================
 */

// DOM Elements
const statusEl = document.getElementById('status');
const statusTextEl = document.getElementById('statusText');
const progressSection = document.getElementById('progressSection');
const progressLabel = document.getElementById('progressLabel');
const progressPercent = document.getElementById('progressPercent');
const progressBar = document.getElementById('progressBar');
const tabHostEl = document.getElementById('tabHost');

const btnPdfVisual = document.getElementById('btnPdfVisual');
const btnDocx = document.getElementById('btnDocx');
const btnPngFull = document.getElementById('btnPngFull');
const btnHtmlWeb = document.getElementById('btnHtmlWeb');
const btnLaunchEditor = document.getElementById('btnLaunchEditor');

const tabNavExport = document.getElementById('tabNavExport');
const tabNavEditor = document.getElementById('tabNavEditor');
const panelExport = document.getElementById('panelExport');
const panelEditor = document.getElementById('panelEditor');

const cleanDomCheckbox = document.getElementById('cleanDom');
const expandScrollCheckbox = document.getElementById('expandScroll');
const highQualityCheckbox = document.getElementById('highQuality');
const cleanCloneCheckboxEl = document.getElementById('cleanCloneDom');

const btnCopyPngClipboard = document.getElementById('btnCopyPngClipboard');
const pdfSummaryTextEl = document.getElementById('pdfSummaryText');
const docxSummaryTextEl = document.getElementById('docxSummaryText');
const pngSummaryTextEl = document.getElementById('pngSummaryText');
const htmlSummaryTextEl = document.getElementById('htmlSummaryText');

const exportState = {
  pdfMode: 'continuous', // 'continuous' | 'a4' | 'vector'
  docxMode: 'rich',      // 'rich' | 'visual' | 'hybrid'
  pngMode: 'full',       // 'full' | 'visible'
  htmlMode: 'offline'    // 'offline' | 'light'
};

const MODE_SUMMARIES = {
  pdfMode: {
    continuous: 'Continuo sin cortes, enlaces activos y texto seleccionable.',
    a4: 'Paginado A4 inteligente sin partir renglones, con links y OCR.',
    vector: 'Motor vectorial nativo puro de Firefox (saveAsPDF).'
  },
  docxMode: {
    rich: 'Word .docx editable con fotos integradas, tablas y links.',
    visual: 'Copia visual A4 de alta fidelidad sin partir renglones.',
    hybrid: 'Copia visual A4 + contenido editable estructurado.'
  },
  pngMode: {
    full: 'Captura continua ultra nítida sin límite de memoria.',
    visible: 'Captura instantánea nítida solo del área visible.'
  },
  htmlMode: {
    offline: 'Archivo único 100% offline con estilos e imágenes incrustadas.',
    light: 'HTML limpio liviano sin alterar la pestaña abierta.'
  }
};

const actionButtons = [btnPdfVisual, btnDocx, btnPngFull, btnHtmlWeb, btnLaunchEditor];

// ----------------------------------------------------------------------------
// 1. Estados y Progreso
// ----------------------------------------------------------------------------

function setProgress(percent, label, state = 'busy') {
  if (progressSection) {
    progressSection.style.display = 'block';
  }
  if (progressBar) {
    progressBar.style.width = `${percent}%`;
  }
  if (progressPercent) {
    progressPercent.textContent = `${percent}%`;
  }
  if (progressLabel) {
    progressLabel.textContent = label;
  }
  if (statusTextEl) {
    if (label && label.includes('(') && label.endsWith(')')) {
      const match = label.match(/^(.*?)\s*\((.*?)\)$/);
      if (match) {
        statusTextEl.textContent = '';
        const titleSpan = document.createElement('span');
        titleSpan.className = 'status-title';
        titleSpan.textContent = match[1];
        const pillSpan = document.createElement('span');
        pillSpan.className = 'status-file-pill';
        pillSpan.textContent = match[2];
        statusTextEl.appendChild(titleSpan);
        statusTextEl.appendChild(pillSpan);
      } else {
        statusTextEl.textContent = label;
      }
    } else {
      statusTextEl.textContent = label;
    }
  }

  if (statusEl) {
    statusEl.className = 'status-indicator';
    if (state === 'busy') {
      statusEl.classList.add('is-busy');
    } else if (state === 'success') {
      statusEl.classList.add('is-success');
      setTimeout(() => {
        if (progressSection) progressSection.style.display = 'none';
        if (progressBar) progressBar.style.width = '0%';
      }, 4000);
    } else if (state === 'error') {
      statusEl.classList.add('is-error');
    }
  }
}

function setBusy(isBusy) {
  actionButtons.forEach(btn => {
    if (btn) {
      if (isBusy) {
        btn.classList.add('is-disabled');
        btn.disabled = true;
      } else {
        btn.classList.remove('is-disabled');
        btn.disabled = false;
      }
    }
  });
}

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

function sanitizeFilename(title, ext) {
  let raw = String(title || 'documento_web').trim();
  // Limpiar sufijos repetitivos de portales ("Titular - LA NACION", "Artículo | Medio") cuando el título es suficientemente descriptivo
  const stripped = raw.replace(/\s*[-|—–•]\s*[^-|—–•]{2,30}$/u, '').trim();
  if (stripped.length >= 10) {
    raw = stripped;
  }

  let clean = raw;
  try {
    clean = clean.normalize('NFC');
  } catch (_) {}

  clean = clean
    .replace(/[\\/:*?"<>|\x00-\x1F]+/g, ' ')
    .replace(/[^\p{L}\p{N}\s._()-]/gu, '')
    .trim()
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[_.-]+|[_.-]+$/g, '')
    .substring(0, 68);

  if (!clean) clean = 'documento_web';
  return `${clean}.${ext}`;
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

  // Usar ObjectURL directo para Blobs evitando picos de memoria Base64 (+33% RAM) en capturas HD largas
  if (blobOrUrl instanceof Blob) {
    downloadUrl = URL.createObjectURL(blobOrUrl);
    isCreatedObjectUrl = true;
  }

  try {
    if (typeof browser !== 'undefined' && browser.downloads && browser.downloads.download) {
      await browser.downloads.download({
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
    console.warn("browser.downloads con ObjectURL falló, intentando respaldo:", err);
    if (blobOrUrl instanceof Blob) {
      try {
        const dataUrl = await blobToDataUrl(blobOrUrl);
        if (typeof browser !== 'undefined' && browser.downloads && browser.downloads.download) {
          await browser.downloads.download({
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

// ----------------------------------------------------------------------------
// 2. Tab Intelligence y Scripts In-Page
// ----------------------------------------------------------------------------

async function getActiveTab() {
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tabs || tabs.length === 0 || !tabs[0] || !tabs[0].id) {
    throw new Error("No hay pestaña activa disponible.");
  }
  return tabs[0];
}

function formatErrorMessage(err) {
  if (!err) return "Error desconocido";
  if (typeof err === 'string') return err;
  if (err instanceof Error) return err.message || err.toString();
  if (typeof err === 'object') {
    if (err.message) return String(err.message);
    if (err.error) return typeof err.error === 'object' ? formatErrorMessage(err.error) : String(err.error);
    if (err.id && err.windowId) {
      return "Error de comunicación con la pestaña del navegador.";
    }
    try {
      return JSON.stringify(err);
    } catch (_) {
      return String(err);
    }
  }
  return String(err);
}

/**
 * Captura visual confiable compatible con Firefox WebExtensions
 * Basado en las soluciones de los repositorios de GitHub:
 * mosfor/fullpage-capture y mdn/webextensions-examples
 */
async function captureTabImage(tab, format = 'jpeg') {
  // 1. Intentar con el windowId numérico de la pestaña activa
  if (tab && typeof tab.windowId === 'number') {
    try {
      const res = await browser.tabs.captureVisibleTab(tab.windowId, { format: format });
      if (res) return res;
    } catch (e) {
      console.warn("captureVisibleTab(windowId) no respondió, intentando fallback:", e);
    }
  }

  // 2. Fallback: llamada con null como windowId (Firefox WebExtensions estándar)
  try {
    const res = await browser.tabs.captureVisibleTab(null, { format: format });
    if (res) return res;
  } catch (e) {
    console.warn("captureVisibleTab(null) falló:", e);
  }

  // 3. Fallback: llamada directa sin parámetros
  try {
    const res = await browser.tabs.captureVisibleTab();
    if (res) return res;
  } catch (e) {
    console.warn("captureVisibleTab() sin parámetros falló:", e);
  }

  // 4. Fallback: API nativa exclusiva de Firefox browser.tabs.captureTab
  if (typeof browser.tabs.captureTab === 'function' && tab && tab.id) {
    try {
      const res = await browser.tabs.captureTab(tab.id, { format: format });
      if (res) return res;
    } catch (e) {
      console.warn("browser.tabs.captureTab() falló:", e);
    }
  }

  throw new Error("No fue posible capturar la pantalla. Verifica que la pestaña sea una página web accesible.");
}

async function applyPageBackground(tab) {
  const bgEl = document.getElementById('pagePreviewBg');
  if (!bgEl || !tab) return;

  try {
    let dataUrl = null;
    try {
      dataUrl = await captureTabImage(tab, 'jpeg');
    } catch (_) {
      try {
        dataUrl = await captureTabImage(tab, 'png');
      } catch (err2) {
        console.warn("Captura de fondo no disponible:", err2);
      }
    }

    if (dataUrl) {
      bgEl.style.backgroundImage = `url("${dataUrl}")`;
      bgEl.classList.add('is-loaded');

      // 🧠 Motor Dinámico Inteligente de Luminosidad
      // Calibra los filtros y opacidades de cristal según si la web es clara u oscura
      detectAndApplyPageTone(dataUrl);
    }
  } catch (err) {
    console.debug("applyPageBackground aviso:", err);
  }
}

function detectAndApplyPageTone(dataUrl) {
  try {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 16;
        canvas.height = 16;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, 16, 16);
        const imgData = ctx.getImageData(0, 0, 16, 16).data;
        let sumLum = 0;
        for (let i = 0; i < imgData.length; i += 4) {
          const r = imgData[i];
          const g = imgData[i + 1];
          const b = imgData[i + 2];
          // Rec. 709 perceived luminance
          const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
          sumLum += lum;
        }
        const avgLum = sumLum / (imgData.length / 4);
        const tone = avgLum >= 0.48 ? 'light' : 'dark';
        document.body.setAttribute('data-page-tone', tone);
      } catch (e) {
        document.body.setAttribute('data-page-tone', 'light');
      }
    };
    img.src = dataUrl;
  } catch (_) {
    document.body.setAttribute('data-page-tone', 'light');
  }
}

async function initTabDetection() {
  try {
    const tab = await getActiveTab();
    if (tab.url) {
      const urlObj = new URL(tab.url);
      if (['about:', 'chrome:', 'moz-extension:', 'addons.mozilla.org'].some(p => tab.url.startsWith(p))) {
        tabHostEl.textContent = 'Página interna (restringida)';
        statusTextEl.textContent = 'Las páginas internas del sistema no permiten exportación';
      } else {
        tabHostEl.textContent = urlObj.hostname || tab.title || 'Página web activa';
        applyPageBackground(tab);
      }
    }
  } catch (e) {
    tabHostEl.textContent = 'Pestaña activa';
  }
}

async function executeInPage(func, args = []) {
  const tab = await getActiveTab();
  try {
    const results = await browser.scripting.executeScript({
      target: { tabId: tab.id },
      func: func,
      args: args
    });
    if (results && results.length > 0) {
      const first = results[0];
      if (first.error) {
        const msg = first.error.message || formatErrorMessage(first.error);
        throw new Error(msg);
      }
      return first.result;
    }
    return null;
  } catch (err) {
    throw new Error(formatErrorMessage(err));
  }
}

// ----------------------------------------------------------------------------
// 3. Motor de Captura Completa HD (Auto-reparable, con solapamiento interior sin líneas blancas ni cabeceras repetidas)
// ----------------------------------------------------------------------------

async function captureFullPageCanvas({
  clean = false,
  expand = false,
  highQuality = undefined,
  visibleOnly = false,
  onProgress = () => {}
} = {}) {
  const tab = await getActiveTab();
  const useHighQuality = highQuality !== undefined
    ? Boolean(highQuality)
    : (highQualityCheckbox ? highQualityCheckbox.checked : true);

  // 0. Registrar posición original del usuario e instalar Watchdog auto-reparable en la pestaña
  const initialScroll = await executeInPage(() => {
    const origX = window.scrollX || window.pageXOffset || 0;
    const origY = window.scrollY || window.pageYOffset || 0;

    if (typeof window._bwdCleanupNow === 'function') {
      try { window._bwdCleanupNow(); } catch (_) {}
    }

    window._bwdOrigScroll = { x: origX, y: origY };
    window._bwdRestores = [];
    window._bwdLastBeat = Date.now();

    window._bwdRecordStyle = function(el, prop) {
      if (!el || !el.style) return;
      if (!el.__bwdSavedProps) el.__bwdSavedProps = {};
      if (!(prop in el.__bwdSavedProps)) {
        el.__bwdSavedProps[prop] = el.style.getPropertyValue(prop);
        window._bwdRestores.push({
          type: 'style-prop',
          el,
          prop,
          val: el.__bwdSavedProps[prop]
        });
      }
    };

    window._bwdCleanupNow = function() {
      try {
        if (window._bwdWatchdogId) {
          clearInterval(window._bwdWatchdogId);
          delete window._bwdWatchdogId;
        }
        const noScrollStyle = document.getElementById('bwd-no-scrollbars');
        if (noScrollStyle) noScrollStyle.remove();

        if (Array.isArray(window._bwdRestores)) {
          for (let i = window._bwdRestores.length - 1; i >= 0; i--) {
            const item = window._bwdRestores[i];
            try {
              if (item.type === 'style-tag') {
                const st = document.getElementById(item.id);
                if (st) st.remove();
              } else if (item.type === 'style-prop' && item.el && item.el.style) {
                if (item.el.__bwdSavedProps) delete item.el.__bwdSavedProps;
                if (item.val) item.el.style.setProperty(item.prop, item.val);
                else item.el.style.removeProperty(item.prop);
              }
            } catch (_) {}
          }
        }
        delete window._bwdRestores;
        delete window._bwdRecordStyle;

        if (window._bwdOrigScroll) {
          window.scrollTo({ top: window._bwdOrigScroll.y, left: window._bwdOrigScroll.x, behavior: 'instant' });
          delete window._bwdOrigScroll;
        }
      } catch (_) {}
    };

    window._bwdWatchdogId = setInterval(() => {
      if (!window._bwdLastBeat || (Date.now() - window._bwdLastBeat > 2600)) {
        if (typeof window._bwdCleanupNow === 'function') window._bwdCleanupNow();
      }
    }, 850);

    return { x: origX, y: origY };
  });

  try {
    // 1. Pre-activar imágenes lazy y volver a scrollY = 0 dejando asentar el JS del sitio
    if (!visibleOnly) {
      onProgress(25, "Activando imágenes diferidas y estabilizando cabeceras...");
      await executeInPage(async () => {
        window._bwdLastBeat = Date.now();
        const docH = Math.min(
          Math.max(
            document.body ? document.body.scrollHeight : 0,
            document.documentElement ? document.documentElement.scrollHeight : 0
          ),
          22000
        );
        const step = Math.max(400, window.innerHeight || 800);
        if (docH > step * 1.25) {
          for (let y = 0; y < docH; y += step * 1.5) {
            window._bwdLastBeat = Date.now();
            window.scrollTo({ top: y, left: 0, behavior: 'instant' });
            await new Promise(r => setTimeout(r, 35));
          }
        }
        window._bwdLastBeat = Date.now();
        window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
        if (document.documentElement) document.documentElement.scrollTop = 0;
        if (document.body) document.body.scrollTop = 0;
        window.dispatchEvent(new Event('scroll'));
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        await new Promise(r => setTimeout(r, 200));
        window._bwdLastBeat = Date.now();
      });
    }

    // 2. Preparar estilos limpios en el origen sin deformar cabeceras sticky/fixed del corte 0
    await executeInPage((opts) => {
      window._bwdLastBeat = Date.now();
      const rec = window._bwdRecordStyle;

      const styleEl = document.createElement('style');
      styleEl.id = 'bwd-no-scrollbars';
      styleEl.textContent = `
        html, body, :root, *, *::before, *::after {
          scrollbar-width: none !important;
          -ms-overflow-style: none !important;
          scroll-behavior: auto !important;
          transition: none !important;
          animation: none !important;
        }
        *::-webkit-scrollbar,
        html::-webkit-scrollbar,
        body::-webkit-scrollbar {
          display: none !important;
          width: 0px !important;
          height: 0px !important;
          background: transparent !important;
        }
      `;
      (document.head || document.documentElement).appendChild(styleEl);
      window._bwdRestores.push({ type: 'style-tag', id: 'bwd-no-scrollbars' });

      if (!opts.visibleOnly) {
        [document.documentElement, document.body].forEach(rootEl => {
          if (!rootEl) return;
          try {
            const cs = window.getComputedStyle(rootEl);
            if (cs.overflow === 'hidden' || cs.overflowY === 'hidden') {
              rec(rootEl, 'overflow');
              rec(rootEl, 'overflow-y');
              rootEl.style.setProperty('overflow', 'visible', 'important');
              rootEl.style.setProperty('overflow-y', 'visible', 'important');
            }
          } catch (_) {}
        });
      }

      if (opts.clean) {
        const inlineAdSelectors = [
          'ins.adsbygoogle',
          'iframe[id*="google_ads"]',
          'iframe[src*="doubleclick"]',
          'div[id*="google_ads"]',
          'div[id*="div-gpt-ad"]',
          'div[class*="ad-container"]',
          'div[class*="ad-slot"]',
          'div[class*="ad-box"]',
          'div[class*="advertisement"]',
          'div[class*="taboola"]',
          'div[class*="outbrain"]',
          '[data-ad-slot]',
          '[data-ad-unit]',
          '.ln-placeholder',
          '[class*="caja-comercial"]',
          '#onetrust-consent-sdk',
          '#onetrust-banner-sdk',
          '#cookie-banner',
          '.cookie-banner',
          '[class*="cookie-consent"]',
          '.swg-dialog',
          '.modal-backdrop',
          '.chat-widget',
          '[aria-label*="cookie" i]'
        ];

        inlineAdSelectors.forEach(sel => {
          try {
            document.querySelectorAll(sel).forEach(el => {
              if (!el || ['HTML', 'BODY', 'MAIN', 'ARTICLE', 'HEADER'].includes(el.tagName)) return;
              if (el.querySelector && el.querySelector('article, main, h1')) return;
              rec(el, 'display');
              el.style.setProperty('display', 'none', 'important');
              const p = el.parentElement;
              if (p && p !== document.body && !p.textContent.trim() && !p.querySelector('img, svg, video, canvas')) {
                rec(p, 'min-height');
                rec(p, 'height');
                rec(p, 'padding');
                p.style.setProperty('min-height', '0px', 'important');
                p.style.setProperty('height', 'auto', 'important');
                p.style.setProperty('padding', '0px', 'important');
              }
            });
          } catch (_) {}
        });

        document.querySelectorAll('div, aside, section, dialog').forEach(el => {
          try {
            if (el.querySelector('article, main, h1')) return;
            const s = window.getComputedStyle(el);
            const idCls = `${el.id || ''} ${typeof el.className === 'string' ? el.className : ''}`.toLowerCase();
            if ((s.position === 'fixed' || parseInt(s.zIndex, 10) > 999) && /(cookie|consent|gdpr|paywall|subscribe-bar|newsletter-modal|chat-widget)/i.test(idCls)) {
              rec(el, 'display');
              el.style.setProperty('display', 'none', 'important');
            }
          } catch (_) {}
        });
      }

      if (opts.expand && !opts.visibleOnly) {
        const vW = window.innerWidth || 1200;
        const vH = window.innerHeight || 800;
        document.querySelectorAll('*').forEach(el => {
          try {
            if (['HTML', 'BODY'].includes(el.tagName)) return;
            const s = window.getComputedStyle(el);
            if (s.overflowY === 'scroll' || s.overflowY === 'auto') {
              if (el.scrollHeight > el.clientHeight + 24 && el.scrollHeight < 30000) {
                rec(el, 'overflow-y');
                rec(el, 'overflow');
                rec(el, 'max-height');
                rec(el, 'height');
                el.style.setProperty('overflow-y', 'visible', 'important');
                el.style.setProperty('overflow', 'visible', 'important');
                el.style.setProperty('max-height', 'none', 'important');
                el.style.setProperty('height', 'auto', 'important');

                const r = el.getBoundingClientRect();
                if (r.width >= vW * 0.45 && el.clientHeight >= vH * 0.45) {
                  let anc = el.parentElement;
                  while (anc && anc !== document.documentElement) {
                    const as = window.getComputedStyle(anc);
                    if (as.overflow === 'hidden' || as.overflowY === 'hidden' || as.height !== 'auto') {
                      rec(anc, 'overflow');
                      rec(anc, 'overflow-y');
                      rec(anc, 'height');
                      rec(anc, 'max-height');
                      anc.style.setProperty('overflow', 'visible', 'important');
                      anc.style.setProperty('overflow-y', 'visible', 'important');
                      anc.style.setProperty('height', 'auto', 'important');
                      anc.style.setProperty('max-height', 'none', 'important');
                    }
                    anc = anc.parentElement;
                  }
                }
              }
            }
          } catch (_) {}
        });
      }

      const vH = window.innerHeight || 800;
      const mainH1 = document.querySelector('article h1, main h1, h1');
      const h1Rect = (!opts.visibleOnly && mainH1) ? mainH1.getBoundingClientRect() : null;

      document.querySelectorAll('*').forEach(el => {
        if (!el || ['HTML', 'BODY', 'MAIN', 'ARTICLE'].includes(el.tagName)) return;
        try {
          const s = window.getComputedStyle(el);
          if (s.backgroundAttachment === 'fixed') {
            rec(el, 'background-attachment');
            el.style.setProperty('background-attachment', 'scroll', 'important');
          }
          if (s.overflowX === 'scroll' || s.overflowX === 'auto') {
            rec(el, 'scrollbar-width');
            el.style.setProperty('scrollbar-width', 'none', 'important');
          }
          if (!opts.visibleOnly && s.position === 'fixed') {
            const rect = el.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0 || rect.height > vH * 0.75) return;
            const topPx = parseFloat(s.top);
            const overlapsH1 = Boolean(
              h1Rect &&
              h1Rect.height > 10 &&
              rect.bottom > (h1Rect.top + 4) &&
              rect.top < (h1Rect.bottom + 64) &&
              !el.contains(mainH1)
            );

            if (rect.top > vH * 0.45) {
              rec(el, 'visibility');
              rec(el, 'opacity');
              el.style.setProperty('visibility', 'hidden', 'important');
              el.style.setProperty('opacity', '0', 'important');
            } else if (overlapsH1 || (!Number.isNaN(topPx) && topPx > 24 && rect.top < 380)) {
              rec(el, 'position');
              rec(el, 'top');
              rec(el, 'width');
              rec(el, 'transform');
              const isNav = el.tagName === 'HEADER' || el.tagName === 'NAV' || /header|navbar/i.test(`${el.id} ${el.className}`);
              el.style.setProperty('position', isNav ? 'relative' : 'static', 'important');
              el.style.setProperty('top', 'auto', 'important');
              if (isNav) el.style.setProperty('width', '100%', 'important');
              el.style.setProperty('transform', 'none', 'important');
            }
          }
        } catch (_) {}
      });
    }, [{ clean, expand, visibleOnly }]);

    // 3. Medir geometría, tema de color, líneas OCR multi-renglón, links activos y semántica rica para Word
    const pageData = await executeInPage((opts) => {
      window._bwdLastBeat = Date.now();
      if (!opts.visibleOnly) {
        window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
        if (document.documentElement) document.documentElement.scrollTop = 0;
        if (document.body) document.body.scrollTop = 0;
      }

      const vH = window.innerHeight || 800;
      const vW = window.innerWidth || 1200;
      const docEl = document.documentElement;
      const body = document.body;
      const baseHref = document.baseURI || window.location.href;

      const scrollH = Math.max(
        body ? body.scrollHeight : 0,
        body ? body.offsetHeight : 0,
        docEl ? docEl.clientHeight : 0,
        docEl ? docEl.scrollHeight : 0,
        docEl ? docEl.offsetHeight : 0
      );

      const scrollW = Math.max(vW, docEl ? docEl.clientWidth : 0);

      let bgColor = '#ffffff';
      let isDark = false;
      let bgR = 255, bgG = 255, bgB = 255;
      try {
        let rawBg = body ? window.getComputedStyle(body).backgroundColor : '';
        if (!rawBg || rawBg === 'transparent' || rawBg === 'rgba(0, 0, 0, 0)') {
          rawBg = docEl ? window.getComputedStyle(docEl).backgroundColor : '';
        }
        if (rawBg && rawBg !== 'transparent' && rawBg !== 'rgba(0, 0, 0, 0)') {
          bgColor = rawBg;
          const m = rawBg.match(/\d+/g);
          if (m && m.length >= 3) {
            bgR = parseInt(m[0], 10);
            bgG = parseInt(m[1], 10);
            bgB = parseInt(m[2], 10);
            isDark = (0.299 * bgR + 0.587 * bgG + 0.114 * bgB) < 128;
          }
        }
      } catch (_) {}

      const sX = window.scrollX || window.pageXOffset || 0;
      const sY = window.scrollY || window.pageYOffset || 0;

      const textBlocks = [];
      try {
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
          acceptNode(node) {
            if (!node.textContent || !node.textContent.trim()) return NodeFilter.FILTER_REJECT;
            const parent = node.parentElement;
            if (!parent) return NodeFilter.FILTER_REJECT;
            const tag = parent.tagName.toLowerCase();
            if (['script', 'style', 'noscript', 'svg', 'canvas', 'template'].includes(tag)) return NodeFilter.FILTER_REJECT;
            const s = window.getComputedStyle(parent);
            if (s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0') return NodeFilter.FILTER_REJECT;
            return NodeFilter.FILTER_ACCEPT;
          }
        });

        const range = document.createRange();
        let tNode;
        while ((tNode = walker.nextNode())) {
          const cleanText = tNode.textContent.replace(/\s+/g, ' ').trim();
          if (!cleanText) continue;

          const parent = tNode.parentElement;
          const style = window.getComputedStyle(parent);
          const fSize = parseFloat(style.fontSize) || 14;

          try {
            range.selectNodeContents(tNode);
            const rawRects = Array.from(range.getClientRects()).filter(r => r.width > 2 && r.height > 2);
            if (rawRects.length === 1) {
              const r = rawRects[0];
              textBlocks.push({
                text: cleanText,
                x: Math.round(r.left + sX),
                y: Math.round(r.top + sY),
                width: Math.round(r.width),
                height: Math.round(r.height),
                fontSize: Math.round(fSize)
              });
            } else if (rawRects.length > 1) {
              const totalRectW = rawRects.reduce((acc, r) => acc + r.width, 0) || 1;
              const words = cleanText.split(' ');
              let wordIdx = 0;
              rawRects.forEach((r, idx) => {
                if (wordIdx >= words.length) return;
                let chunk;
                if (idx === rawRects.length - 1) {
                  chunk = words.slice(wordIdx);
                  wordIdx = words.length;
                } else {
                  const cnt = Math.max(1, Math.round((r.width / totalRectW) * words.length));
                  chunk = words.slice(wordIdx, wordIdx + cnt);
                  wordIdx += cnt;
                }
                const lineStr = chunk.join(' ').trim();
                if (lineStr) {
                  textBlocks.push({
                    text: lineStr,
                    x: Math.round(r.left + sX),
                    y: Math.round(r.top + sY),
                    width: Math.round(r.width),
                    height: Math.round(r.height),
                    fontSize: Math.round(fSize)
                  });
                }
              });
            }
          } catch (_) {}
        }
      } catch (_) {}

      const linkBlocks = [];
      try {
        document.querySelectorAll('a[href]').forEach(a => {
          const rawHref = a.getAttribute('href') || '';
          if (!rawHref || rawHref.startsWith('#') || rawHref.startsWith('javascript:')) return;
          let absHref = '';
          try { absHref = new URL(rawHref, baseHref).href; } catch (_) {}
          if (!absHref || !/^https?:|^mailto:/i.test(absHref)) return;

          const s = window.getComputedStyle(a);
          if (s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0') return;
          const rects = Array.from(a.getClientRects()).filter(r => r.width > 4 && r.height > 4);
          rects.forEach(r => {
            linkBlocks.push({
              url: absHref,
              x: Math.round(r.left + sX),
              y: Math.round(r.top + sY),
              width: Math.round(r.width),
              height: Math.round(r.height)
            });
          });
        });
      } catch (_) {}

      function extractRuns(rootNode) {
        const runs = [];
        function walk(node, state) {
          if (!node) return;
          if (node.nodeType === 3) {
            const txt = node.nodeValue.replace(/\s+/g, ' ');
            if (txt) runs.push({ text: txt, bold: state.bold, italic: state.italic, href: state.href });
            return;
          }
          if (node.nodeType !== 1) return;
          const tag = node.tagName.toLowerCase();
          if (['script', 'style', 'noscript', 'svg', 'button'].includes(tag)) return;
          if (tag === 'br') {
            runs.push({ text: '\n', bold: false, italic: false, href: null });
            return;
          }
          const cs = window.getComputedStyle(node);
          if (cs.display === 'none' || cs.visibility === 'hidden') return;

          const nextState = {
            bold: state.bold || tag === 'b' || tag === 'strong' || parseInt(cs.fontWeight, 10) >= 600,
            italic: state.italic || tag === 'i' || tag === 'em' || cs.fontStyle === 'italic',
            href: state.href
          };
          if (tag === 'a' && node.getAttribute('href')) {
            try {
              const resolved = new URL(node.getAttribute('href'), baseHref).href;
              if (/^https?:|^mailto:/i.test(resolved)) nextState.href = resolved;
            } catch (_) {}
          }
          Array.from(node.childNodes).forEach(ch => walk(ch, nextState));
        }
        walk(rootNode, { bold: false, italic: false, href: null });
        return runs;
      }

      const structuredItems = [];
      const seenImages = new Set();
      try {
        const rootScope = document.querySelector('article, main, [role="main"]') || document.body;
        const selectors = 'h1, h2, h3, h4, h5, h6, p, blockquote, ul, ol, table, pre, figure, img';
        const elements = rootScope.querySelectorAll(selectors);

        elements.forEach(el => {
          const s = window.getComputedStyle(el);
          if (s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0') return;
          if (el.closest('nav, footer, header:not(article header)')) return;

          const tag = el.tagName.toLowerCase();
          if (el.closest('table') && tag !== 'table') return;
          if (el.closest('ul, ol') && !['ul', 'ol'].includes(tag)) return;
          if (tag === 'img' && el.closest('figure')) return;

          if (tag.startsWith('h') && tag.length === 2) {
            const level = parseInt(tag[1], 10) || 1;
            const text = el.textContent.replace(/\s+/g, ' ').trim();
            if (text) structuredItems.push({ type: 'heading', level, text, runs: extractRuns(el) });
          } else if (tag === 'p') {
            const text = el.textContent.replace(/\s+/g, ' ').trim();
            if (text) structuredItems.push({ type: 'paragraph', text, runs: extractRuns(el) });
          } else if (tag === 'blockquote') {
            const text = el.textContent.replace(/\s+/g, ' ').trim();
            if (text) structuredItems.push({ type: 'quote', text, runs: extractRuns(el) });
          } else if (tag === 'ul' || tag === 'ol') {
            const liItems = [];
            el.querySelectorAll(':scope > li').forEach(li => {
              const t = li.textContent.replace(/\s+/g, ' ').trim();
              if (t) liItems.push({ text: t, runs: extractRuns(li) });
            });
            if (liItems.length > 0) {
              structuredItems.push({
                type: 'list',
                isOrdered: tag === 'ol',
                items: liItems.map(x => x.text),
                richItems: liItems
              });
            }
          } else if (tag === 'table') {
            const rows = [];
            el.querySelectorAll('tr').forEach(tr => {
              const cells = [];
              tr.querySelectorAll(':scope > th, :scope > td').forEach(td => {
                cells.push({
                  text: td.textContent.replace(/\s+/g, ' ').trim(),
                  isHeader: td.tagName.toLowerCase() === 'th'
                });
              });
              if (cells.length > 0) rows.push(cells);
            });
            if (rows.length > 0) structuredItems.push({ type: 'table', rows });
          } else if (tag === 'pre') {
            const text = el.textContent.trim();
            if (text) structuredItems.push({ type: 'code', text });
          } else if (tag === 'figure' || tag === 'img') {
            const img = tag === 'img' ? el : el.querySelector('img');
            if (!img) return;
            const srcCand = img.currentSrc || img.getAttribute('src') || img.getAttribute('data-src') || '';
            if (!srcCand || srcCand.includes('data:image/svg') || /avatar|logo|icon|pixel|spacer/i.test(srcCand)) return;
            const w = img.naturalWidth || img.clientWidth || 0;
            const h = img.naturalHeight || img.clientHeight || 0;
            if (w < 120 || h < 70) return;
            let absImg = srcCand;
            try { if (!absImg.startsWith('data:')) absImg = new URL(absImg, baseHref).href; } catch (_) {}
            if (seenImages.has(absImg)) return;
            seenImages.add(absImg);
            const capEl = tag === 'figure' ? el.querySelector('figcaption, [class*="caption"], [class*="epigrafe"]') : null;
            const caption = capEl ? capEl.textContent.replace(/\s+/g, ' ').trim() : (img.getAttribute('alt') || '');
            structuredItems.push({ type: 'image', src: absImg, width: w, height: h, caption });
          }
        });

        if (structuredItems.filter(it => it.type === 'paragraph').length === 0) {
          document.querySelectorAll('main div, article div, body div').forEach(div => {
            if (div.children.length > 2) return;
            const s = window.getComputedStyle(div);
            if (s.display === 'none' || s.visibility === 'hidden') return;
            const directText = Array.from(div.childNodes)
              .filter(n => n.nodeType === 3)
              .map(n => n.nodeValue.trim())
              .join(' ')
              .trim();
            if (directText.length >= 45) {
              structuredItems.push({ type: 'paragraph', text: directText, runs: [{ text: directText }] });
            }
          });
        }
      } catch (_) {}

      return {
        metrics: {
          title: document.title || 'documento_web',
          url: window.location.href,
          width: scrollW,
          height: scrollH,
          viewportHeight: vH,
          viewportWidth: vW,
          dpr: window.devicePixelRatio || 1
        },
        pageTheme: { bgColor, isDark, bgR, bgG, bgB },
        textBlocks,
        linkBlocks,
        structuredItems
      };
    }, [{ visibleOnly }]);

    if (!pageData || !pageData.metrics) throw new Error("No se pudo obtener las métricas de la página.");

    const metrics = pageData.metrics;
    const pageTheme = pageData.pageTheme || { bgColor: '#ffffff', isDark: false, bgR: 255, bgG: 255, bgB: 255 };
    const textBlocks = pageData.textBlocks || [];
    const linkBlocks = pageData.linkBlocks || [];
    const structuredItems = pageData.structuredItems || [];

    const viewportH = metrics.viewportHeight;
    const viewportW = metrics.viewportWidth;
    let totalHeight = Math.min(metrics.height, 28000);
    const isSingleScreen = visibleOnly || (totalHeight <= (viewportH + 20));

    const applyOutputScaling = (rawCanvas, cssWidth, cssHeight) => {
      const nativeScale = rawCanvas.width / Math.max(1, cssWidth);
      let desiredScale = useHighQuality ? Math.max(nativeScale, 1.5) : 1;
      if (useHighQuality && nativeScale < 2 && cssHeight * 2 <= 24000) {
        desiredScale = 2;
      }
      if (cssHeight * desiredScale > 26000) {
        desiredScale = Math.max(0.75, 26000 / cssHeight);
      }

      if (Math.abs(desiredScale - nativeScale) < 0.08) {
        return rawCanvas;
      }

      const scaled = document.createElement('canvas');
      scaled.width = Math.max(1, Math.round(cssWidth * desiredScale));
      scaled.height = Math.max(1, Math.round(cssHeight * desiredScale));
      const sctx = scaled.getContext('2d');
      sctx.imageSmoothingEnabled = true;
      sctx.imageSmoothingQuality = 'high';
      sctx.drawImage(rawCanvas, 0, 0, scaled.width, scaled.height);
      return scaled;
    };

    if (isSingleScreen) {
      onProgress(70, visibleOnly ? "Capturando área visible en alta nitidez..." : "Capturando diseño de pantalla completa...");
      await executeInPage(() => { window._bwdLastBeat = Date.now(); });
      const captureDataUrl = await captureTabImage(tab, 'png');
      const img = new Image();
      await new Promise((res, rej) => {
        img.onload = res;
        img.onerror = rej;
        img.src = captureDataUrl;
      });

      const singleCanvas = document.createElement('canvas');
      singleCanvas.width = img.width;
      singleCanvas.height = img.height;
      const ctx = singleCanvas.getContext('2d');
      ctx.drawImage(img, 0, 0);

      const finalSingle = applyOutputScaling(singleCanvas, viewportW, viewportH);
      return {
        canvas: finalSingle,
        isSingleScreen: true,
        metrics: { ...metrics, height: visibleOnly ? viewportH : metrics.height },
        pageTheme,
        textBlocks,
        linkBlocks,
        structuredItems
      };
    }

    // 4. Captura multi-slice con solapamiento interior múltiplo de 8px (cero costuras blancas y cero cabeceras repetidas)
    onProgress(50, "Capturando secciones continuas sin costuras ni cabeceras repetidas...");
    const slices = [];
    let currentY = 0;
    let maxScrollY = Math.max(0, totalHeight - viewportH);
    let previousScrollY = -1;

    const overlapCss = Math.min(96, Math.max(32, Math.floor(viewportH * 0.2)));
    const stepCss = Math.max(64, Math.floor((viewportH - overlapCss) / 8) * 8);

    while (currentY <= maxScrollY) {
      const targetScrollY = Math.min(currentY, maxScrollY);
      const isScrollSlice = slices.length >= 1;

      const stepInfo = await executeInPage(async (y, hideStickyHeaders) => {
        window._bwdLastBeat = Date.now();
        window.scrollTo({ top: y, left: 0, behavior: 'instant' });
        if (document.documentElement) document.documentElement.scrollTop = y;
        if (document.body) document.body.scrollTop = y;

        await new Promise(r => requestAnimationFrame(() => setTimeout(r, 150)));
        window._bwdLastBeat = Date.now();

        if (hideStickyHeaders && typeof window._bwdRecordStyle === 'function') {
          const vH = window.innerHeight || 800;
          document.querySelectorAll('*').forEach(el => {
            if (!el || ['HTML', 'BODY', 'MAIN', 'ARTICLE'].includes(el.tagName)) return;
            try {
              const s = window.getComputedStyle(el);
              if (s.position === 'fixed' || s.position === 'sticky') {
                const r = el.getBoundingClientRect();
                const isOverlayWrapper = !el.querySelector('article, main, h1, p') && (el.innerText || '').trim().length < 260;
                if ((r.height < vH * 0.78 || isOverlayWrapper) && s.visibility !== 'hidden') {
                  window._bwdRecordStyle(el, 'visibility');
                  window._bwdRecordStyle(el, 'opacity');
                  window._bwdRecordStyle(el, 'border-color');
                  window._bwdRecordStyle(el, 'box-shadow');
                  el.style.setProperty('visibility', 'hidden', 'important');
                  el.style.setProperty('opacity', '0', 'important');
                  el.style.setProperty('border-color', 'transparent', 'important');
                  el.style.setProperty('box-shadow', 'none', 'important');
                }
              }
            } catch (_) {}
          });
          await new Promise(r => requestAnimationFrame(r));
        }

        const actualY = Math.max(
          window.scrollY || 0,
          window.pageYOffset || 0,
          document.documentElement ? document.documentElement.scrollTop : 0,
          document.body ? document.body.scrollTop : 0
        );

        const liveH = Math.min(
          Math.max(
            document.body ? document.body.scrollHeight : 0,
            document.documentElement ? document.documentElement.scrollHeight : 0
          ),
          28000
        );

        return { actualY, liveH };
      }, [targetScrollY, isScrollSlice]);

      const actualScrollY = stepInfo ? stepInfo.actualY : targetScrollY;
      if (stepInfo && stepInfo.liveH > totalHeight) {
        totalHeight = stepInfo.liveH;
        maxScrollY = Math.max(0, totalHeight - viewportH);
      }

      if (currentY > 0 && actualScrollY <= previousScrollY + 0.5) {
        break;
      }

      const sliceUrl = await captureTabImage(tab, 'png');
      slices.push({
        url: sliceUrl,
        actualScrollY: actualScrollY
      });

      const pct = Math.min(74, 50 + Math.round((actualScrollY / Math.max(1, maxScrollY)) * 24));
      onProgress(pct, `Capturando sección ${slices.length}...`);

      previousScrollY = actualScrollY;
      if (currentY >= maxScrollY || actualScrollY >= maxScrollY - 1) break;

      currentY = actualScrollY + stepCss;
      if (currentY > maxScrollY && previousScrollY < maxScrollY - 1) {
        currentY = maxScrollY;
      }
    }

    if (slices.length === 1) {
      const img = new Image();
      await new Promise((res, rej) => {
        img.onload = res;
        img.onerror = rej;
        img.src = slices[0].url;
      });
      const singleCanvas = document.createElement('canvas');
      singleCanvas.width = img.width;
      singleCanvas.height = img.height;
      const ctx = singleCanvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const finalSingle = applyOutputScaling(singleCanvas, viewportW, viewportH);
      return { canvas: finalSingle, isSingleScreen: true, metrics, pageTheme, textBlocks, linkBlocks, structuredItems };
    }

    onProgress(78, "Ensamblando documento continuo sin líneas ni costuras...");

    const firstImg = new Image();
    await new Promise((res, rej) => {
      firstImg.onload = res;
      firstImg.onerror = rej;
      firstImg.src = slices[0].url;
    });

    const dprY = firstImg.height / Math.max(1, viewportH);
    const sliceH = Math.max(1, firstImg.height - 2);
    const lastScroll = slices[slices.length - 1].actualScrollY;
    const totalCssH = lastScroll + viewportH;
    const masterCanvasHeight = Math.max(1, Math.round(lastScroll * dprY) + sliceH);

    const masterCanvas = document.createElement('canvas');
    masterCanvas.width = firstImg.width;
    masterCanvas.height = masterCanvasHeight;
    const ctx = masterCanvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;

    const bottomTrimPx = Math.min(Math.floor(sliceH * 0.14), Math.max(10, Math.round(28 * dprY)));
    const firstDrawH = Math.max(1, Math.min(masterCanvasHeight, sliceH - bottomTrimPx));
    ctx.drawImage(firstImg, 0, 0, firstImg.width, firstDrawH, 0, 0, firstImg.width, firstDrawH);
    let paintedDocPx = firstDrawH;

    for (let i = 1; i < slices.length; i++) {
      const slice = slices[i];
      const img = await (async () => {
        const im = new Image();
        await new Promise((res, rej) => {
          im.onload = res;
          im.onerror = rej;
          im.src = slice.url;
        });
        return im;
      })();

      const isLastSlice = (i === slices.length - 1);
      const sliceStartDocPx = Math.round(slice.actualScrollY * dprY);
      const usableLocalEnd = isLastSlice ? sliceH : Math.max(1, sliceH - bottomTrimPx);
      const localStartY = Math.max(0, paintedDocPx - sliceStartDocPx);
      const drawH = Math.min(usableLocalEnd - localStartY, masterCanvasHeight - paintedDocPx);

      if (drawH > 0) {
        ctx.drawImage(img, 0, localStartY, img.width, drawH, 0, paintedDocPx, img.width, drawH);
        paintedDocPx += drawH;
      }
    }

    let rawStitched = masterCanvas;
    if (paintedDocPx > 0 && paintedDocPx < masterCanvas.height) {
      rawStitched = document.createElement('canvas');
      rawStitched.width = masterCanvas.width;
      rawStitched.height = paintedDocPx;
      rawStitched.getContext('2d').drawImage(masterCanvas, 0, 0, masterCanvas.width, paintedDocPx, 0, 0, masterCanvas.width, paintedDocPx);
    }

    const finalCanvas = applyOutputScaling(rawStitched, viewportW, totalCssH);
    metrics.height = totalCssH;

    return {
      canvas: finalCanvas,
      isSingleScreen: false,
      metrics,
      pageTheme,
      textBlocks,
      linkBlocks,
      structuredItems
    };

  } finally {
    try {
      await executeInPage((orig) => {
        if (typeof window._bwdCleanupNow === 'function') {
          window._bwdCleanupNow();
        } else if (orig) {
          window.scrollTo({ top: orig.y, left: orig.x, behavior: 'instant' });
        }
      }, [initialScroll]);
    } catch (_) {}
  }
}

// ----------------------------------------------------------------------------
// 4. Exportar PDF Fiel (3 Modos: 1 Sola Página Continua | A4 Inteligente | Vector Firefox)
// ----------------------------------------------------------------------------

btnPdfVisual.addEventListener('click', async () => {
  try {
    setBusy(true);
    const clean = cleanDomCheckbox ? cleanDomCheckbox.checked : true;
    const expand = expandScrollCheckbox ? expandScrollCheckbox.checked : true;
    const highQuality = highQualityCheckbox ? highQualityCheckbox.checked : true;
    const tab = await getActiveTab();
    let targetPdfMode = exportState.pdfMode || 'continuous';

    // Modo Vector Nativo de Firefox (saveAsPDF)
    if (targetPdfMode === 'vector') {
      if (typeof browser !== 'undefined' && browser.tabs && typeof browser.tabs.saveAsPDF === 'function') {
        setProgress(35, "Preparando motor vectorial puro de Firefox...", 'busy');
        if (clean) {
          await executeInPage(() => {
            window._bwdVecRestores = [];
            const sels = ['ins.adsbygoogle', 'div[id*="div-gpt-ad"]', '#onetrust-consent-sdk', '.cookie-banner', '.ln-placeholder', '.swg-dialog'];
            sels.forEach(sel => {
              document.querySelectorAll(sel).forEach(el => {
                window._bwdVecRestores.push({ el, val: el.style.getPropertyValue('display') });
                el.style.setProperty('display', 'none', 'important');
              });
            });
          }).catch(() => {});
        }
        try {
          const status = await browser.tabs.saveAsPDF({});
          if (status === 'saved' || status === 'replaced') {
            setProgress(100, "¡PDF vectorial nativo guardado con éxito!", 'success');
          } else {
            setProgress(100, "Diálogo de PDF vectorial finalizado.", 'success');
          }
          setBusy(false);
          return;
        } catch (vecErr) {
          console.warn("saveAsPDF no disponible en esta plataforma, usando modo A4 inteligente:", vecErr);
          targetPdfMode = 'a4';
        } finally {
          if (clean) {
            await executeInPage(() => {
              (window._bwdVecRestores || []).forEach(r => {
                if (r.val) r.el.style.setProperty('display', r.val);
                else r.el.style.removeProperty('display');
              });
              delete window._bwdVecRestores;
            }).catch(() => {});
          }
        }
      } else {
        targetPdfMode = 'a4';
      }
    }

    setProgress(18, "Preparando página para exportación PDF fiel...", 'busy');

    const { canvas, metrics, pageTheme, textBlocks, linkBlocks } = await captureFullPageCanvas({
      clean,
      expand,
      highQuality,
      onProgress: (pct, msg) => setProgress(pct, msg, 'busy')
    });

    const { jsPDF } = window.jspdf;
    const canvasWidth = canvas.width;
    const canvasHeight = canvas.height;
    const bgHex = (pageTheme && pageTheme.isDark)
      ? `rgb(${pageTheme.bgR}, ${pageTheme.bgG}, ${pageTheme.bgB})`
      : '#ffffff';
    const jpgQuality = highQuality ? 0.95 : 0.86;

    const cssW = Math.max(1, metrics.viewportWidth || 1200);
    const cssH = Math.max(1, metrics.height || (canvasHeight / (canvasWidth / cssW)));

    if (targetPdfMode === 'a4') {
      setProgress(84, "Paginando en hojas A4 sin partir renglones...", 'busy');
      const a4Slices = sliceCanvasForA4(canvas, (cur, tot) => {
        setProgress(84 + Math.round((cur / Math.max(1, tot)) * 8), `Maquetando hoja A4 ${cur} de ${tot}...`, 'busy');
      }, bgHex, jpgQuality);

      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
      const pageW = 210;
      const pageH = 297;
      const margin = 8;
      const usableW = pageW - margin * 2;
      const usableH = pageH - margin * 2;

      const scaleCssToCanvasX = canvasWidth / cssW;
      const scaleCssToCanvasY = canvasHeight / cssH;

      a4Slices.forEach((sl, idx) => {
        if (idx > 0) pdf.addPage('a4', 'portrait');
        if (pageTheme && pageTheme.isDark) {
          pdf.setFillColor(pageTheme.bgR, pageTheme.bgG, pageTheme.bgB);
          pdf.rect(0, 0, pageW, pageH, 'F');
        }
        const ratio = Math.min(usableW / sl.width, usableH / sl.height);
        const drawW = sl.width * ratio;
        const drawH = sl.height * ratio;
        const offsetX = margin + (usableW - drawW) / 2;
        const offsetY = margin;

        pdf.addImage(sl.dataUrl, 'JPEG', offsetX, offsetY, drawW, drawH, undefined, 'FAST');

        const sliceStartCanvasY = sl.offsetY || 0;
        const sliceEndCanvasY = sliceStartCanvasY + sl.height;

        // Capa de texto OCR seleccionable por página A4
        if (textBlocks && textBlocks.length > 0) {
          for (const tb of textBlocks) {
            const cy = tb.y * scaleCssToCanvasY;
            if (cy < sliceStartCanvasY || cy >= sliceEndCanvasY) continue;
            const txMm = offsetX + (tb.x * scaleCssToCanvasX) * ratio;
            const tyMm = offsetY + (cy - sliceStartCanvasY) * ratio;
            const fPt = Math.max(5, Math.min(48, (tb.fontSize * scaleCssToCanvasY * ratio) * 2.83));
            try {
              pdf.setFontSize(fPt);
              pdf.text(tb.text, txMm, tyMm, { baseline: 'top', renderingMode: 'invisible' });
            } catch (_) {}
          }
        }

        // Enlaces cliqueables activos por página A4
        if (linkBlocks && linkBlocks.length > 0) {
          for (const lb of linkBlocks) {
            const cy = lb.y * scaleCssToCanvasY;
            if (cy < sliceStartCanvasY || cy >= sliceEndCanvasY) continue;
            const lxMm = offsetX + (lb.x * scaleCssToCanvasX) * ratio;
            const lyMm = offsetY + (cy - sliceStartCanvasY) * ratio;
            const lwMm = Math.max(2, (lb.width * scaleCssToCanvasX) * ratio);
            const lhMm = Math.max(2, (lb.height * scaleCssToCanvasY) * ratio);
            try { pdf.link(lxMm, lyMm, lwMm, lhMm, { url: lb.url }); } catch (_) {}
          }
        }
      });

      const filename = sanitizeFilename(metrics.title || tab.title, 'pdf');
      setProgress(96, "Descargando PDF A4 inteligente...", 'busy');
      await triggerDownload(pdf.output('blob'), filename);
      setProgress(100, `¡PDF A4 descargado con éxito! (${filename})`, 'success');
      setBusy(false);
      return;
    }

    // Modo 1 Sola Página Continua (borde a borde, escalando unidades lógicas si > 14000px para máxima compatibilidad Acrobat)
    setProgress(85, "Compilando PDF continuo en 1 sola página con links activos...", 'busy');

    const unitScale = canvasHeight > 14000 ? (14000 / canvasHeight) : 1;
    const pdfW = Math.max(10, Math.round(canvasWidth * unitScale));
    const pdfH = Math.max(10, Math.round(canvasHeight * unitScale));
    const orientation = pdfW > pdfH ? 'landscape' : 'portrait';

    const pdf = new jsPDF({
      orientation,
      unit: 'px',
      format: [pdfW, pdfH],
      hotfixes: ['px_scaling'],
      compress: true
    });

    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = canvasWidth;
    exportCanvas.height = canvasHeight;
    const ectx = exportCanvas.getContext('2d');
    ectx.fillStyle = bgHex;
    ectx.fillRect(0, 0, canvasWidth, canvasHeight);
    ectx.drawImage(canvas, 0, 0);

    const imgData = exportCanvas.toDataURL('image/jpeg', jpgQuality);
    pdf.addImage(imgData, 'JPEG', 0, 0, pdfW, pdfH, undefined, 'FAST');

    const scaleX = pdfW / cssW;
    const scaleY = pdfH / cssH;

    // Capa de texto nativo invisible multi-línea (Ctrl+F + copiar texto exacto)
    if (textBlocks && textBlocks.length > 0) {
      setProgress(90, "Incrustando texto seleccionable (OCR) y enlaces activos...", 'busy');
      for (const tb of textBlocks) {
        if (!tb.text) continue;
        const posX = Math.round(tb.x * scaleX);
        const posY = Math.round(tb.y * scaleY);
        const fSize = Math.max(5, Math.min(72, Math.round(tb.fontSize * scaleY)));
        try {
          pdf.setFontSize(fSize);
          pdf.text(tb.text, posX, posY, {
            baseline: 'top',
            renderingMode: 'invisible'
          });
        } catch (_) {}
      }
    }

    // Capa de hipervínculos reales cliqueables
    if (linkBlocks && linkBlocks.length > 0) {
      for (const lb of linkBlocks) {
        if (!lb.url) continue;
        const lx = Math.max(0, lb.x * scaleX);
        const ly = Math.max(0, lb.y * scaleY);
        const lw = Math.max(2, lb.width * scaleX);
        const lh = Math.max(2, lb.height * scaleY);
        try {
          pdf.link(lx, ly, lw, lh, { url: lb.url });
        } catch (_) {}
      }
    }

    const filename = sanitizeFilename(metrics.title || tab.title, 'pdf');
    setProgress(95, "Descargando documento PDF fiel...", 'busy');
    const pdfBlob = pdf.output('blob');
    await triggerDownload(pdfBlob, filename);

    setProgress(100, `¡PDF fiel descargado con éxito! (${filename})`, 'success');
    setBusy(false);

  } catch (err) {
    console.error("Error al exportar PDF:", err);
    setProgress(0, `Error: ${formatErrorMessage(err)}`, 'error');
    setBusy(false);
  }
});

// ----------------------------------------------------------------------------
// Motor OpenXML / DOCX Nativo de Alta Fidelidad
// ----------------------------------------------------------------------------

function makeCrcTable() {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[n] = c;
  }
  return table;
}
const _crcTable = makeCrcTable();

function crc32(uint8Array) {
  let crc = 0 ^ (-1);
  for (let i = 0; i < uint8Array.length; i++) {
    crc = (crc >>> 8) ^ _crcTable[(crc ^ uint8Array[i]) & 0xFF];
  }
  return (crc ^ (-1)) >>> 0;
}

class SimpleZip {
  constructor() {
    this.files = [];
  }

  addFile(path, data) {
    let bytes;
    if (typeof data === 'string') {
      bytes = new TextEncoder().encode(data);
    } else if (data instanceof Uint8Array) {
      bytes = data;
    } else if (data instanceof ArrayBuffer) {
      bytes = new Uint8Array(data);
    } else {
      bytes = new Uint8Array(data);
    }
    this.files.push({ path, bytes, crc: crc32(bytes) });
  }

  build() {
    const textEncoder = new TextEncoder();
    const localHeaders = [];
    const cdHeaders = [];
    let offset = 0;

    for (const f of this.files) {
      const nameBytes = textEncoder.encode(f.path);
      const localH = new Uint8Array(30 + nameBytes.length);
      const lView = new DataView(localH.buffer);
      lView.setUint32(0, 0x04034b50, true);
      lView.setUint16(4, 20, true);
      lView.setUint16(6, 0, true);
      lView.setUint16(8, 0, true);
      lView.setUint16(10, 0, true);
      lView.setUint16(12, 0, true);
      lView.setUint32(14, f.crc, true);
      lView.setUint32(18, f.bytes.length, true);
      lView.setUint32(22, f.bytes.length, true);
      lView.setUint16(26, nameBytes.length, true);
      lView.setUint16(28, 0, true);
      localH.set(nameBytes, 30);

      const cdH = new Uint8Array(46 + nameBytes.length);
      const cView = new DataView(cdH.buffer);
      cView.setUint32(0, 0x02014b50, true);
      cView.setUint16(4, 20, true);
      cView.setUint16(6, 20, true);
      cView.setUint16(8, 0, true);
      cView.setUint16(10, 0, true);
      cView.setUint16(12, 0, true);
      cView.setUint16(14, 0, true);
      cView.setUint32(16, f.crc, true);
      cView.setUint32(20, f.bytes.length, true);
      cView.setUint32(24, f.bytes.length, true);
      cView.setUint16(28, nameBytes.length, true);
      cView.setUint16(30, 0, true);
      cView.setUint16(32, 0, true);
      cView.setUint16(34, 0, true);
      cView.setUint16(36, 0, true);
      cView.setUint32(38, 0, true);
      cView.setUint32(42, offset, true);
      cdH.set(nameBytes, 46);

      localHeaders.push(localH, f.bytes);
      cdHeaders.push(cdH);
      offset += localH.length + f.bytes.length;
    }

    const cdOffset = offset;
    let cdSize = 0;
    for (const cd of cdHeaders) cdSize += cd.length;

    const eocd = new Uint8Array(22);
    const eView = new DataView(eocd.buffer);
    eView.setUint32(0, 0x06054b50, true);
    eView.setUint16(4, 0, true);
    eView.setUint16(6, 0, true);
    eView.setUint16(8, this.files.length, true);
    eView.setUint16(10, this.files.length, true);
    eView.setUint32(12, cdSize, true);
    eView.setUint32(16, cdOffset, true);
    eView.setUint16(20, 0, true);

    const totalSize = offset + cdSize + 22;
    const finalZip = new Uint8Array(totalSize);
    let cur = 0;
    for (const part of [...localHeaders, ...cdHeaders, eocd]) {
      finalZip.set(part, cur);
      cur += part.length;
    }

    return finalZip;
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

function buildDocx(slices, isLandscape = false, structuredItems = []) {
  const zip = new SimpleZip();

  let relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n`;
  let bodyXml = '';

  const maxW = isLandscape ? 10234800 : 7102800;
  const maxH = isLandscape ? 7102800 : 10234800;

  slices.forEach((slice, idx) => {
    const rId = `rId${idx + 1}`;
    const imgName = `image${idx + 1}.jpeg`;

    let imgBytes = slice.bytes;
    if (!imgBytes && slice.dataUrl) {
      const b64 = slice.dataUrl.replace(/^data:image\/[a-zA-Z]+;base64,/, '');
      const binary = atob(b64);
      imgBytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        imgBytes[i] = binary.charCodeAt(i);
      }
    }

    zip.addFile(`word/media/${imgName}`, imgBytes);

    relsXml += `  <Relationship Id="${rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${imgName}"/>\n`;

    const scale = Math.min(maxW / slice.width, maxH / slice.height);
    const widthEmu = Math.round(slice.width * scale);
    const heightEmu = Math.round(slice.height * scale);

    const pageBreakXml = idx > 0 ? '<w:pageBreakBefore/>' : '';

    bodyXml += `
    <w:p>
      <w:pPr>
        ${pageBreakXml}
        <w:jc w:val="center"/>
        <w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/>
      </w:pPr>
      <w:r>
        <w:drawing>
          <wp:inline distT="0" distB="0" distL="0" distR="0">
            <wp:extent cx="${widthEmu}" cy="${heightEmu}"/>
            <wp:effectExtent l="0" t="0" r="0" b="0"/>
            <wp:docPr id="${idx + 1}" name="Página ${idx + 1}"/>
            <wp:cNvGraphicFramePr>
              <a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/>
            </wp:cNvGraphicFramePr>
            <a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
              <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
                <pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
                  <pic:nvPicPr>
                    <pic:cNvPr id="${idx + 1}" name="${imgName}"/>
                    <pic:cNvPicPr/>
                  </pic:nvPicPr>
                  <pic:blipFill>
                    <a:blip r:embed="${rId}"/>
                    <a:stretch><a:fillRect/></a:stretch>
                  </pic:blipFill>
                  <pic:spPr>
                    <a:xfrm>
                      <a:off x="0" y="0"/>
                      <a:ext cx="${widthEmu}" cy="${heightEmu}"/>
                    </a:xfrm>
                    <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
                  </pic:spPr>
                </pic:pic>
              </a:graphicData>
            </a:graphic>
          </wp:inline>
        </w:drawing>
      </w:r>
    </w:p>`;
  });

  relsXml += `</Relationships>`;

  // Incrustar sección de texto editable y estructurado (OCR / DOM Nativo)
  if (structuredItems && structuredItems.length > 0) {
    bodyXml += `
    <w:p>
      <w:pPr>
        <w:pageBreakBefore/>
        <w:spacing w:before="240" w:after="140"/>
      </w:pPr>
      <w:r>
        <w:rPr>
          <w:b/>
          <w:sz w:val="32"/>
          <w:color w:val="2563EB"/>
        </w:rPr>
        <w:t xml:space="preserve">Contenido y Texto Editable del Documento</w:t>
      </w:r>
    </w:p>`;

    structuredItems.forEach(item => {
      if (item.type === 'heading') {
        const sz = item.level === 1 ? '34' : item.level === 2 ? '28' : '24';
        const color = item.level === 1 ? '0F172A' : item.level === 2 ? '1E293B' : '334155';
        const spBefore = item.level === 1 ? '260' : '200';
        bodyXml += `
        <w:p>
          <w:pPr>
            <w:spacing w:before="${spBefore}" w:after="100"/>
          </w:pPr>
          <w:r>
            <w:rPr>
              <w:b/>
              <w:sz w:val="${sz}"/>
              <w:color w:val="${color}"/>
            </w:rPr>
            <w:t xml:space="preserve">${escapeXml(item.text)}</w:t>
          </w:r>
        </w:p>`;
      } else if (item.type === 'paragraph') {
        bodyXml += `
        <w:p>
          <w:pPr>
            <w:spacing w:before="60" w:after="120" w:line="276" w:lineRule="auto"/>
          </w:pPr>
          <w:r>
            <w:rPr>
              <w:sz w:val="22"/>
              <w:color w:val="334155"/>
            </w:rPr>
            <w:t xml:space="preserve">${escapeXml(item.text)}</w:t>
          </w:r>
        </w:p>`;
      } else if (item.type === 'quote') {
        bodyXml += `
        <w:p>
          <w:pPr>
            <w:spacing w:before="120" w:after="120"/>
            <w:ind w:left="400"/>
          </w:pPr>
          <w:r>
            <w:rPr>
              <w:i/>
              <w:sz w:val="22"/>
              <w:color w:val="64748B"/>
            </w:rPr>
            <w:t xml:space="preserve">${escapeXml(item.text)}</w:t>
          </w:r>
        </w:p>`;
      } else if (item.type === 'list') {
        (item.items || []).forEach((liText, liIdx) => {
          const bullet = item.isOrdered ? `${liIdx + 1}. ` : '•  ';
          bodyXml += `
          <w:p>
            <w:pPr>
              <w:spacing w:before="40" w:after="40"/>
              <w:ind w:left="360"/>
            </w:pPr>
            <w:r>
              <w:rPr>
                <w:sz w:val="22"/>
                <w:color w:val="334155"/>
              </w:rPr>
              <w:t xml:space="preserve">${escapeXml(bullet + liText)}</w:t>
            </w:r>
          </w:p>`;
        });
      } else if (item.type === 'table') {
        bodyXml += `
        <w:tbl>
          <w:tblPr>
            <w:tblW w:w="0" w:type="auto"/>
            <w:tblBorders>
              <w:top w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/>
              <w:left w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/>
              <w:bottom w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/>
              <w:right w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/>
              <w:insideH w:val="single" w:sz="4" w:space="0" w:color="E2E8F0"/>
              <w:insideV w:val="single" w:sz="4" w:space="0" w:color="E2E8F0"/>
            </w:tblBorders>
          </w:tblPr>`;
        (item.rows || []).forEach(row => {
          bodyXml += `<w:tr>`;
          row.forEach(cell => {
            const isH = cell.isHeader;
            bodyXml += `
            <w:tc>
              <w:tcPr>
                <w:tcW w:w="0" w:type="auto"/>
                <w:tcMar><w:top w:w="120"/><w:bottom w:w="120"/><w:left w:w="160"/><w:right w:w="160"/></w:tcMar>
                ${isH ? '<w:shd w:val="clear" w:color="auto" w:fill="F1F5F9"/>' : ''}
              </w:tcPr>
              <w:p>
                <w:pPr><w:spacing w:before="0" w:after="0"/></w:pPr>
                <w:r>
                  <w:rPr>
                    ${isH ? '<w:b/>' : ''}
                    <w:sz w:val="20"/>
                    <w:color w:val="${isH ? '0F172A' : '334155'}"/>
                  </w:rPr>
                  <w:t xml:space="preserve">${escapeXml(cell.text)}</w:t>
                </w:r>
              </w:p>
            </w:tc>`;
          });
          bodyXml += `</w:tr>`;
        });
        bodyXml += `</w:tbl>`;
      } else if (item.type === 'code') {
        bodyXml += `
        <w:p>
          <w:pPr>
            <w:spacing w:before="80" w:after="80"/>
            <w:shd w:val="clear" w:color="auto" w:fill="F8FAFC"/>
          </w:pPr>
          <w:r>
            <w:rPr>
              <w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/>
              <w:sz w:val="20"/>
              <w:color w:val="0F172A"/>
            </w:rPr>
            <w:t xml:space="preserve">${escapeXml(item.text)}</w:t>
          </w:r>
        </w:p>`;
      }
    });
  }

  const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
            xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
            xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
            xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
  <w:body>
    ${bodyXml}
    <w:sectPr>
      <w:pgSz w:w="${isLandscape ? 16838 : 11906}" w:h="${isLandscape ? 11906 : 16838}" w:orient="${isLandscape ? 'landscape' : 'portrait'}"/>
      <w:pgMar w:top="360" w:right="360" w:bottom="360" w:left="360" w:header="0" w:footer="0" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`;

  zip.addFile('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="jpeg" ContentType="image/jpeg"/>
  <Default Extension="jpg" ContentType="image/jpeg"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`);

  zip.addFile('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`);

  zip.addFile('word/_rels/document.xml.rels', relsXml);
  zip.addFile('word/document.xml', docXml);

  return zip.build();
}

// Empaquetador ZIP DEFLATE asíncrono usando CompressionStream nativo (reduce 40-65% el peso de .docx)
async function compressZipInstance(zip) {
  if (typeof CompressionStream === 'undefined') {
    return zip.build();
  }

  try {
    const textEncoder = new TextEncoder();
    const localParts = [];
    const cdParts = [];
    let offset = 0;

    for (const f of zip.files) {
      const nameBytes = textEncoder.encode(f.path);
      const isAlreadyCompressedMedia = /\.(jpe?g|png)$/i.test(f.path);
      let compBytes = f.bytes;
      let method = 0;

      if (!isAlreadyCompressedMedia && f.bytes.length > 96) {
        try {
          const cs = new CompressionStream('deflate-raw');
          const writer = cs.writable.getWriter();
          writer.write(f.bytes);
          writer.close();
          const buf = await new Response(cs.readable).arrayBuffer();
          const deflated = new Uint8Array(buf);
          if (deflated.length > 0 && deflated.length < f.bytes.length) {
            compBytes = deflated;
            method = 8;
          }
        } catch (_) {}
      }

      const localH = new Uint8Array(30 + nameBytes.length);
      const lView = new DataView(localH.buffer);
      lView.setUint32(0, 0x04034b50, true);
      lView.setUint16(4, 20, true);
      lView.setUint16(6, 0, true);
      lView.setUint16(8, method, true);
      lView.setUint16(10, 0, true);
      lView.setUint16(12, 0, true);
      lView.setUint32(14, f.crc, true);
      lView.setUint32(18, compBytes.length, true);
      lView.setUint32(22, f.bytes.length, true);
      lView.setUint16(26, nameBytes.length, true);
      lView.setUint16(28, 0, true);
      localH.set(nameBytes, 30);

      const cdH = new Uint8Array(46 + nameBytes.length);
      const cView = new DataView(cdH.buffer);
      cView.setUint32(0, 0x02014b50, true);
      cView.setUint16(4, 20, true);
      cView.setUint16(6, 20, true);
      cView.setUint16(8, 0, true);
      cView.setUint16(10, method, true);
      cView.setUint16(12, 0, true);
      cView.setUint16(14, 0, true);
      cView.setUint32(16, f.crc, true);
      cView.setUint32(20, compBytes.length, true);
      cView.setUint32(24, f.bytes.length, true);
      cView.setUint16(28, nameBytes.length, true);
      cView.setUint16(30, 0, true);
      cView.setUint16(32, 0, true);
      cView.setUint16(34, 0, true);
      cView.setUint16(36, 0, true);
      cView.setUint32(38, 0, true);
      cView.setUint32(42, offset, true);
      cdH.set(nameBytes, 46);

      localParts.push(localH, compBytes);
      cdParts.push(cdH);
      offset += localH.length + compBytes.length;
    }

    const cdOffset = offset;
    let cdSize = 0;
    for (const cd of cdParts) cdSize += cd.length;

    const eocd = new Uint8Array(22);
    const eView = new DataView(eocd.buffer);
    eView.setUint32(0, 0x06054b50, true);
    eView.setUint16(4, 0, true);
    eView.setUint16(6, 0, true);
    eView.setUint16(8, zip.files.length, true);
    eView.setUint16(10, zip.files.length, true);
    eView.setUint32(12, cdSize, true);
    eView.setUint32(16, cdOffset, true);
    eView.setUint16(20, 0, true);

    const out = new Uint8Array(offset + cdSize + 22);
    let cur = 0;
    for (const part of [...localParts, ...cdParts, eocd]) {
      out.set(part, cur);
      cur += part.length;
    }
    return out;
  } catch (_) {
    return zip.build();
  }
}

async function fetchImageForWordMedia(imgUrl) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(imgUrl, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const blob = await res.blob();
    const bmpUrl = URL.createObjectURL(blob);
    try {
      const im = new Image();
      await new Promise((resolve, reject) => {
        im.onload = resolve;
        im.onerror = reject;
        im.src = bmpUrl;
      });
      if (im.naturalWidth < 60 || im.naturalHeight < 40) return null;
      const maxDim = 1400;
      const scale = Math.min(1, maxDim / Math.max(im.naturalWidth, im.naturalHeight));
      const w = Math.max(1, Math.round(im.naturalWidth * scale));
      const h = Math.max(1, Math.round(im.naturalHeight * scale));
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const cctx = c.getContext('2d');
      cctx.fillStyle = '#ffffff';
      cctx.fillRect(0, 0, w, h);
      cctx.drawImage(im, 0, 0, w, h);
      const jpegBlob = await canvasToBlob(c, 'image/jpeg', 0.88);
      const bytes = new Uint8Array(await jpegBlob.arrayBuffer());
      return { bytes, width: w, height: h, ext: 'jpeg' };
    } finally {
      URL.revokeObjectURL(bmpUrl);
    }
  } catch (_) {
    return null;
  }
}

async function buildRichEditableDocx(structuredItems = [], docMeta = {}, visualSlices = []) {
  const zip = new SimpleZip();
  let relIdx = 1;
  const nextRelId = () => `rId${relIdx++}`;
  const hyperlinkRels = new Map();
  let relsEntries = '';
  let bodyXml = '';
  let docPrId = 1;

  const ensureHyperlinkRel = (url) => {
    if (!url) return null;
    if (hyperlinkRels.has(url)) return hyperlinkRels.get(url);
    const rId = nextRelId();
    hyperlinkRels.set(url, rId);
    relsEntries += `  <Relationship Id="${rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${escapeXml(url)}" TargetMode="External"/>\n`;
    return rId;
  };

  const renderRunsXml = (runs, fallbackText, baseSz = '22', baseColor = '1E293B', forceBold = false, forceItalic = false) => {
    const list = (Array.isArray(runs) && runs.length > 0) ? runs : [{ text: fallbackText || '' }];
    let xml = '';
    list.forEach(r => {
      if (!r || !r.text) return;
      const isB = Boolean(forceBold || r.bold);
      const isI = Boolean(forceItalic || r.italic);
      const linkId = r.href ? ensureHyperlinkRel(r.href) : null;
      const colorVal = linkId ? '0284C7' : baseColor;
      const uXml = linkId ? '<w:u w:val="single"/>' : '';

      const parts = String(r.text).split('\n');
      let innerRun = `<w:r><w:rPr>${isB ? '<w:b/>' : ''}${isI ? '<w:i/>' : ''}${uXml}<w:sz w:val="${baseSz}"/><w:szCs w:val="${baseSz}"/><w:color w:val="${colorVal}"/></w:rPr>`;
      parts.forEach((seg, sIdx) => {
        if (sIdx > 0) innerRun += '<w:br/>';
        innerRun += `<w:t xml:space="preserve">${escapeXml(seg)}</w:t>`;
      });
      innerRun += `</w:r>`;

      if (linkId) {
        xml += `<w:hyperlink r:id="${linkId}">${innerRun}</w:hyperlink>`;
      } else {
        xml += innerRun;
      }
    });
    return xml;
  };

  // Si es modo Híbrido, incluir primero las láminas visuales A4
  const maxVisualW = 6858000;
  const maxVisualH = 9874000;
  visualSlices.forEach((slice, sIdx) => {
    const rId = nextRelId();
    const imgName = `visual_page_${sIdx + 1}.jpeg`;
    let imgBytes = slice.bytes;
    if (!imgBytes && slice.dataUrl) {
      const b64 = slice.dataUrl.replace(/^data:image\/[a-zA-Z]+;base64,/, '');
      const bin = atob(b64);
      imgBytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) imgBytes[i] = bin.charCodeAt(i);
    }
    zip.addFile(`word/media/${imgName}`, imgBytes);
    relsEntries += `  <Relationship Id="${rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${imgName}"/>\n`;

    const sc = Math.min(maxVisualW / slice.width, maxVisualH / slice.height);
    const cx = Math.round(slice.width * sc);
    const cy = Math.round(slice.height * sc);
    const idNum = docPrId++;

    bodyXml += `
    <w:p>
      <w:pPr>${sIdx > 0 ? '<w:pageBreakBefore/>' : ''}<w:jc w:val="center"/><w:spacing w:before="0" w:after="0"/></w:pPr>
      <w:r>
        <w:drawing>
          <wp:inline distT="0" distB="0" distL="0" distR="0">
            <wp:extent cx="${cx}" cy="${cy}"/>
            <wp:docPr id="${idNum}" name="Vista ${sIdx + 1}"/>
            <wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr>
            <a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
              <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
                <pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
                  <pic:nvPicPr><pic:cNvPr id="${idNum}" name="${imgName}"/><pic:cNvPicPr/></pic:nvPicPr>
                  <pic:blipFill><a:blip r:embed="${rId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>
                  <pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>
                </pic:pic>
              </a:graphicData>
            </a:graphic>
          </wp:inline>
        </w:drawing>
      </w:r>
    </w:p>`;
  });

  // Encabezado editorial limpio en modo Editable / Híbrido
  if (structuredItems.length > 0 || visualSlices.length === 0) {
    const hasH1 = structuredItems.some(it => it.type === 'heading' && it.level === 1);
    if (visualSlices.length > 0) {
      bodyXml += `<w:p><w:pPr><w:pageBreakBefore/><w:spacing w:before="200" w:after="160"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="30"/><w:color w:val="0284C7"/></w:rPr><w:t xml:space="preserve">Versión 100% Editable del Documento</w:t></w:r></w:p>`;
    } else if (docMeta.title && !hasH1) {
      bodyXml += `<w:p><w:pPr><w:spacing w:before="80" w:after="140"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="36"/><w:color w:val="0F172A"/></w:rPr><w:t xml:space="preserve">${escapeXml(docMeta.title)}</w:t></w:r></w:p>`;
    }
    if (docMeta.url && visualSlices.length === 0) {
      const srcLinkId = ensureHyperlinkRel(docMeta.url);
      bodyXml += `<w:p><w:pPr><w:spacing w:before="0" w:after="200"/><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="6" w:color="E2E8F0"/></w:pBdr></w:pPr><w:r><w:rPr><w:sz w:val="18"/><w:color w:val="64748B"/></w:rPr><w:t xml:space="preserve">Fuente original: </w:t></w:r>${srcLinkId ? `<w:hyperlink r:id="${srcLinkId}"><w:r><w:rPr><w:u w:val="single"/><w:sz w:val="18"/><w:color w:val="0284C7"/></w:rPr><w:t xml:space="preserve">${escapeXml(docMeta.url)}</w:t></w:r></w:hyperlink>` : ''}</w:p>`;
    }
  }

  let embeddedArticlePhotos = 0;
  const maxContentEmuW = 5943600; // ~16.5cm ancho útil editorial A4 con márgenes estándar

  for (const item of structuredItems) {
    if (item.type === 'heading') {
      const sz = item.level === 1 ? '36' : item.level === 2 ? '28' : item.level === 3 ? '25' : '23';
      const color = item.level === 1 ? '0F172A' : '1E293B';
      const spBefore = item.level === 1 ? '260' : '200';
      bodyXml += `<w:p><w:pPr><w:keepNext/><w:spacing w:before="${spBefore}" w:after="100"/></w:pPr>${renderRunsXml(item.runs, item.text, sz, color, true, false)}</w:p>`;
    } else if (item.type === 'paragraph') {
      bodyXml += `<w:p><w:pPr><w:spacing w:before="60" w:after="140" w:line="288" w:lineRule="auto"/></w:pPr>${renderRunsXml(item.runs, item.text, '22', '1E293B', false, false)}</w:p>`;
    } else if (item.type === 'quote') {
      bodyXml += `<w:p><w:pPr><w:spacing w:before="140" w:after="140"/><w:ind w:left="420"/><w:pBdr><w:left w:val="single" w:sz="18" w:space="12" w:color="38BDF8"/></w:pBdr></w:pPr>${renderRunsXml(item.runs, item.text, '22', '475569', false, true)}</w:p>`;
    } else if (item.type === 'list') {
      const richList = item.richItems || (item.items || []).map(t => ({ text: t, runs: [{ text: t }] }));
      richList.forEach((liObj, idx) => {
        const prefix = item.isOrdered ? `${idx + 1}. ` : '•  ';
        bodyXml += `<w:p><w:pPr><w:spacing w:before="40" w:after="60" w:line="268" w:lineRule="auto"/><w:ind w:left="420" w:hanging="220"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="22"/><w:color w:val="0284C7"/></w:rPr><w:t xml:space="preserve">${escapeXml(prefix)}</w:t></w:r>${renderRunsXml(liObj.runs, liObj.text, '22', '1E293B', false, false)}</w:p>`;
      });
    } else if (item.type === 'table') {
      bodyXml += `<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/><w:left w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/><w:right w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/><w:insideH w:val="single" w:sz="4" w:space="0" w:color="E2E8F0"/><w:insideV w:val="single" w:sz="4" w:space="0" w:color="E2E8F0"/></w:tblBorders></w:tblPr>`;
      (item.rows || []).forEach(row => {
        bodyXml += `<w:tr>`;
        row.forEach(cell => {
          const isH = Boolean(cell.isHeader);
          bodyXml += `<w:tc><w:tcPr><w:tcW w:w="0" w:type="auto"/><w:tcMar><w:top w:w="120"/><w:bottom w:w="120"/><w:left w:w="160"/><w:right w:w="160"/></w:tcMar>${isH ? '<w:shd w:val="clear" w:color="auto" w:fill="F1F5F9"/>' : ''}</w:tcPr><w:p><w:pPr><w:spacing w:before="20" w:after="20"/></w:pPr><w:r><w:rPr>${isH ? '<w:b/>' : ''}<w:sz w:val="20"/><w:color w:val="${isH ? '0F172A' : '334155'}"/></w:rPr><w:t xml:space="preserve">${escapeXml(cell.text)}</w:t></w:r></w:p></w:tc>`;
        });
        bodyXml += `</w:tr>`;
      });
      bodyXml += `</w:tbl><w:p><w:pPr><w:spacing w:before="40" w:after="80"/></w:pPr></w:p>`;
    } else if (item.type === 'code') {
      const codeLines = String(item.text || '').split('\n');
      let codeRuns = '';
      codeLines.forEach((ln, lIdx) => {
        if (lIdx > 0) codeRuns += '<w:br/>';
        codeRuns += `<w:t xml:space="preserve">${escapeXml(ln)}</w:t>`;
      });
      bodyXml += `<w:p><w:pPr><w:spacing w:before="100" w:after="120"/><w:ind w:left="200" w:right="200"/><w:shd w:val="clear" w:color="auto" w:fill="F1F5F9"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/><w:sz w:val="19"/><w:color w:val="0F172A"/></w:rPr>${codeRuns}</w:r></w:p>`;
    } else if (item.type === 'image' && item.src && embeddedArticlePhotos < 24) {
      const media = await fetchImageForWordMedia(item.src);
      if (media) {
        embeddedArticlePhotos++;
        const rId = nextRelId();
        const imgName = `article_img_${embeddedArticlePhotos}.jpeg`;
        zip.addFile(`word/media/${imgName}`, media.bytes);
        relsEntries += `  <Relationship Id="${rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${imgName}"/>\n`;

        const rawEmuW = media.width * 9525;
        const rawEmuH = media.height * 9525;
        const sc = Math.min(1, maxContentEmuW / Math.max(1, rawEmuW), 7200000 / Math.max(1, rawEmuH));
        const cx = Math.round(rawEmuW * sc);
        const cy = Math.round(rawEmuH * sc);
        const idNum = docPrId++;

        bodyXml += `<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="140" w:after="${item.caption ? '40' : '140'}"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${idNum}" name="Imagen ${embeddedArticlePhotos}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${idNum}" name="${imgName}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
        if (item.caption) {
          bodyXml += `<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="0" w:after="160"/></w:pPr><w:r><w:rPr><w:i/><w:sz w:val="18"/><w:color w:val="64748B"/></w:rPr><w:t xml:space="preserve">${escapeXml(item.caption)}</w:t></w:r></w:p>`;
        }
      }
    }
  }

  const marginTwips = visualSlices.length > 0 ? 540 : 1134; // 2cm margen editorial en modo Editable
  const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
            xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
            xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
            xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
  <w:body>
    ${bodyXml}
    <w:sectPr>
      <w:pgSz w:w="11906" w:h="16838" w:orient="portrait"/>
      <w:pgMar w:top="${marginTwips}" w:right="${marginTwips}" w:bottom="${marginTwips}" w:left="${marginTwips}" w:header="708" w:footer="708" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`;

  const fullRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n${relsEntries}</Relationships>`;

  zip.addFile('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="jpeg" ContentType="image/jpeg"/>
  <Default Extension="jpg" ContentType="image/jpeg"/>
  <Default Extension="png" ContentType="image/png"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`);

  zip.addFile('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`);

  zip.addFile('word/_rels/document.xml.rels', fullRelsXml);
  zip.addFile('word/document.xml', docXml);

  return await compressZipInstance(zip);
}

// ----------------------------------------------------------------------------
// Motor de Rebanado A4 Inteligente con Detección de Renglones Seguros
// ----------------------------------------------------------------------------

function findSafeCutRowPopup(ctx, width, idealCutY, minCutY, totalHeight) {
  if (idealCutY >= totalHeight) return totalHeight;
  const searchStart = Math.max(minCutY, idealCutY - Math.round(width * 0.085));
  const bandHeight = idealCutY - searchStart;
  if (bandHeight <= 8) return idealCutY;

  try {
    const sampleStepX = Math.max(2, Math.floor(width / 160));
    const imgData = ctx.getImageData(0, searchStart, width, bandHeight).data;
    let bestRowOffset = bandHeight - 1;
    let lowestVariance = Infinity;

    for (let ry = bandHeight - 1; ry >= 0; ry--) {
      let diffSum = 0;
      const rowBase = ry * width * 4;
      let prevR = imgData[rowBase];
      let prevG = imgData[rowBase + 1];
      let prevB = imgData[rowBase + 2];

      for (let x = sampleStepX; x < width; x += sampleStepX) {
        const idx = rowBase + x * 4;
        const r = imgData[idx];
        const g = imgData[idx + 1];
        const b = imgData[idx + 2];
        diffSum += Math.abs(r - prevR) + Math.abs(g - prevG) + Math.abs(b - prevB);
        prevR = r; prevG = g; prevB = b;
      }

      if (diffSum <= 18) return searchStart + ry;
      if (diffSum < lowestVariance) {
        lowestVariance = diffSum;
        bestRowOffset = ry;
      }
    }
    return searchStart + bestRowOffset;
  } catch (_) {
    return idealCutY;
  }
}

function sliceCanvasForA4(canvas, onProgress = () => {}, bgFill = '#ffffff', jpegQuality = 0.92) {
  const canvasWidth = canvas.width;
  const canvasHeight = canvas.height;

  const sliceHeightPx = Math.floor(canvasWidth * (281 / 194));
  const isSingleScreen = (canvasHeight <= (canvasWidth * 1.45));

  if (isSingleScreen) {
    const pageCanvas = document.createElement('canvas');
    pageCanvas.width = canvasWidth;
    pageCanvas.height = canvasHeight;
    const pctx = pageCanvas.getContext('2d');
    pctx.fillStyle = bgFill;
    pctx.fillRect(0, 0, canvasWidth, canvasHeight);
    pctx.drawImage(canvas, 0, 0);

    return [{
      dataUrl: pageCanvas.toDataURL('image/jpeg', jpegQuality),
      width: canvasWidth,
      height: canvasHeight,
      offsetY: 0,
      isSingleScreen: true
    }];
  }

  const srcCtx = canvas.getContext('2d');
  const slices = [];
  let currentY = 0;
  let pageIndex = 0;
  const estTotalPages = Math.max(1, Math.ceil(canvasHeight / sliceHeightPx));

  while (currentY < canvasHeight) {
    const remaining = canvasHeight - currentY;
    let nextCutY;
    if (remaining <= sliceHeightPx) {
      nextCutY = canvasHeight;
    } else {
      const idealCut = currentY + sliceHeightPx;
      const minCut = currentY + Math.floor(sliceHeightPx * 0.65);
      nextCutY = findSafeCutRowPopup(srcCtx, canvasWidth, idealCut, minCut, canvasHeight);
    }

    const currentSliceH = Math.max(1, nextCutY - currentY);
    const pageCanvas = document.createElement('canvas');
    pageCanvas.width = canvasWidth;
    pageCanvas.height = currentSliceH;

    const pctx = pageCanvas.getContext('2d');
    pctx.fillStyle = bgFill;
    pctx.fillRect(0, 0, canvasWidth, currentSliceH);
    pctx.drawImage(canvas, 0, currentY, canvasWidth, currentSliceH, 0, 0, canvasWidth, currentSliceH);

    slices.push({
      dataUrl: pageCanvas.toDataURL('image/jpeg', jpegQuality),
      width: canvasWidth,
      height: currentSliceH,
      offsetY: currentY,
      sliceHeightPx,
      isSingleScreen: false
    });

    currentY = nextCutY;
    pageIndex++;
    onProgress(pageIndex, Math.max(pageIndex, estTotalPages));
  }

  return slices;
}

// ----------------------------------------------------------------------------
// 5. Exportar a Word (.docx Nativo OpenXML: Editable | Visual A4 | Híbrido)
// ----------------------------------------------------------------------------

btnDocx.addEventListener('click', async () => {
  try {
    setBusy(true);
    const clean = cleanDomCheckbox ? cleanDomCheckbox.checked : true;
    const expand = expandScrollCheckbox ? expandScrollCheckbox.checked : true;
    const highQuality = highQualityCheckbox ? highQualityCheckbox.checked : true;
    const docxMode = exportState.docxMode || 'rich';
    const tab = await getActiveTab();

    // Modo Editable Puro: extracción semántica ultrarrápida con fotos, tablas y links reales sin rebanar screenshots pesados
    if (docxMode === 'rich') {
      setProgress(25, "Extrayendo texto estructurado, tablas, enlaces e imágenes...", 'busy');
      const { metrics, structuredItems } = await captureFullPageCanvas({
        clean,
        expand,
        highQuality: false,
        visibleOnly: true,
        onProgress: (pct, msg) => setProgress(Math.min(60, pct), msg, 'busy')
      });

      const title = (metrics && metrics.title) || tab.title || 'Documento Web';
      setProgress(72, "Incrustando fotografías y maquetando Word editable (.docx)...", 'busy');
      const docxUint8 = await buildRichEditableDocx(structuredItems, {
        title,
        url: (metrics && metrics.url) || tab.url
      }, []);

      const blob = new Blob([docxUint8], {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      });
      const filename = sanitizeFilename(title, 'docx');

      setProgress(95, "Descargando documento Word editable...", 'busy');
      await triggerDownload(blob, filename);
      setProgress(100, `¡Word editable (.docx) descargado con éxito! (${filename})`, 'success');
      setBusy(false);
      return;
    }

    // Modos Visual A4 e Híbrido
    setProgress(20, "Capturando página completa para Word (.docx)...", 'busy');
    const { canvas, metrics, pageTheme, structuredItems } = await captureFullPageCanvas({
      clean,
      expand,
      highQuality,
      onProgress: (pct, msg) => setProgress(pct, msg, 'busy')
    });

    const title = (metrics && metrics.title) || tab.title || 'Documento Web';
    const bgHex = (pageTheme && pageTheme.isDark)
      ? `rgb(${pageTheme.bgR}, ${pageTheme.bgG}, ${pageTheme.bgB})`
      : '#ffffff';

    setProgress(76, "Rebanando hojas A4 sin cortar líneas de texto...", 'busy');
    const slices = sliceCanvasForA4(canvas, (current, total) => {
      const pct = Math.min(90, 76 + Math.round((current / Math.max(1, total)) * 14));
      setProgress(pct, `Generando lámina Word ${current} de ${total}...`, 'busy');
    }, bgHex, highQuality ? 0.92 : 0.85);

    setProgress(92, "Comprimiendo paquete OpenXML (.docx)...", 'busy');
    let docxUint8;
    if (docxMode === 'visual') {
      docxUint8 = await buildRichEditableDocx([], { title, url: tab.url }, slices);
    } else {
      docxUint8 = await buildRichEditableDocx(structuredItems, { title, url: tab.url }, slices);
    }

    const blob = new Blob([docxUint8], {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    });
    const filename = sanitizeFilename(title, 'docx');

    setProgress(96, "Descargando documento Word fiel...", 'busy');
    await triggerDownload(blob, filename);

    setProgress(100, `¡Documento Word (.docx) descargado con éxito! (${filename})`, 'success');
    setBusy(false);

  } catch (err) {
    console.error("Error al exportar Word (.docx):", err);
    setProgress(0, `Error: ${formatErrorMessage(err)}`, 'error');
    setBusy(false);
  }
});

// ----------------------------------------------------------------------------
// 5.a Captura PNG HD (Completa | Solo Visible | Copiar directo al Portapapeles)
// ----------------------------------------------------------------------------

async function runPngCaptureBlob() {
  const clean = cleanDomCheckbox ? cleanDomCheckbox.checked : true;
  const expand = expandScrollCheckbox ? expandScrollCheckbox.checked : true;
  const highQuality = highQualityCheckbox ? highQualityCheckbox.checked : true;
  const visibleOnly = exportState.pngMode === 'visible';
  const tab = await getActiveTab();

  const { canvas, metrics } = await captureFullPageCanvas({
    clean,
    expand,
    highQuality,
    visibleOnly,
    onProgress: (pct, msg) => setProgress(pct, msg, 'busy')
  });

  setProgress(90, "Codificando imagen PNG sin compresión con pérdida...", 'busy');
  const pngBlob = await canvasToBlob(canvas, 'image/png');
  return { pngBlob, title: (metrics && metrics.title) || tab.title || 'captura_web' };
}

btnPngFull.addEventListener('click', async () => {
  try {
    setBusy(true);
    setProgress(15, exportState.pngMode === 'visible' ? "Capturando área visible HD..." : "Iniciando captura continua HD...", 'busy');

    const { pngBlob, title } = await runPngCaptureBlob();
    const filename = sanitizeFilename(title, 'png');
    await triggerDownload(pngBlob, filename);

    setProgress(100, `¡Captura PNG HD guardada con éxito! (${filename})`, 'success');
    setBusy(false);

  } catch (err) {
    console.error("Error en captura PNG:", err);
    setProgress(0, `Error: ${formatErrorMessage(err)}`, 'error');
    setBusy(false);
  }
});

if (btnCopyPngClipboard) {
  const handleClipboardCopy = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (btnPngFull && btnPngFull.disabled) return;
    try {
      setBusy(true);
      setProgress(20, "Capturando imagen PNG para el portapapeles...", 'busy');
      const { pngBlob } = await runPngCaptureBlob();

      if (navigator.clipboard && typeof ClipboardItem !== 'undefined' && navigator.clipboard.write) {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob })]);
        setProgress(100, "¡Imagen PNG copiada al portapapeles! Usa Ctrl+V para pegarla.", 'success');
      } else {
        throw new Error("El portapapeles de imágenes no está habilitado en este navegador.");
      }
      setBusy(false);
    } catch (err) {
      console.error("Error al copiar PNG al portapapeles:", err);
      setProgress(0, `Error: ${formatErrorMessage(err)}`, 'error');
      setBusy(false);
    }
  };

  btnCopyPngClipboard.addEventListener('click', handleClipboardCopy);
  btnCopyPngClipboard.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') handleClipboardCopy(e);
  });
}

// ----------------------------------------------------------------------------
// 5.b Descargar HTML Web (100% Sin Mutar Pestaña: SingleFile Offline | Ligero)
// ----------------------------------------------------------------------------

async function fetchResourceAsDataUrlPopup(urlStr, timeoutMs = 4500) {
  if (!urlStr || urlStr.startsWith('data:') || urlStr.startsWith('blob:')) return null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(urlStr, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const blob = await res.blob();
    if (blob.size > 8 * 1024 * 1024) return null; // Proteger memoria ante archivos gigantes (>8MB)
    return await blobToDataUrl(blob);
  } catch (_) {
    return null;
  }
}

async function fetchAndInlineCssTextPopup(cssUrl) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4500);
    const res = await fetch(cssUrl, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    let cssText = await res.text();
    // Reescribir url(...) relativas dentro del CSS a URLs absolutas del servidor original
    cssText = cssText.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (full, quote, rawPath) => {
      const trimmed = (rawPath || '').trim();
      if (!trimmed || trimmed.startsWith('data:') || trimmed.startsWith('#')) return full;
      try {
        const abs = new URL(trimmed, cssUrl).href;
        return `url("${abs}")`;
      } catch (_) {
        return full;
      }
    });
    return cssText;
  } catch (_) {
    return null;
  }
}

if (btnHtmlWeb) {
  btnHtmlWeb.addEventListener('click', async () => {
    try {
      setBusy(true);
      const clean = cleanDomCheckbox ? cleanDomCheckbox.checked : true;
      const isOfflineMode = (exportState.htmlMode || 'offline') === 'offline';
      const tab = await getActiveTab();

      setProgress(20, "Clonando estructura DOM, formularios y estilos sin tocar la pestaña...", 'busy');

      // Extracción 100% sobre un clon en memoria: la pestaña viva del usuario queda completamente intacta
      const pageData = await executeInPage((cleanParam) => {
        function pickBestSrcset(srcsetStr) {
          if (!srcsetStr || typeof srcsetStr !== 'string') return '';
          const regex = /(\S+)(?:\s+(\d+(?:\.\d+)?)([wx]))?(?:\s*,\s*|$)/g;
          let bestUrl = '';
          let bestScore = -1;
          let m;
          while ((m = regex.exec(srcsetStr.trim())) !== null) {
            if (!m[1]) break;
            const url = m[1].replace(/,+$/, '');
            if (!url || url.includes('data:image/svg') || url.includes('placeholder')) continue;
            const val = m[2] ? parseFloat(m[2]) : 1;
            const score = (m[3] || 'x') === 'w' ? val : val * 1000;
            if (score >= bestScore) { bestScore = score; bestUrl = url; }
          }
          return bestUrl;
        }

        const baseHref = document.baseURI || window.location.href;
        const cloneRoot = document.documentElement.cloneNode(true);

        // 1. Sincronizar estado vivo de inputs, textareas y selects hacia el clon
        const liveInputs = document.querySelectorAll('input, textarea, select');
        const cloneInputs = cloneRoot.querySelectorAll('input, textarea, select');
        liveInputs.forEach((liveEl, i) => {
          const cloneEl = cloneInputs[i];
          if (!cloneEl) return;
          const tag = liveEl.tagName.toLowerCase();
          if (tag === 'input') {
            const type = (liveEl.getAttribute('type') || 'text').toLowerCase();
            if (type === 'checkbox' || type === 'radio') {
              if (liveEl.checked) cloneEl.setAttribute('checked', 'checked');
              else cloneEl.removeAttribute('checked');
            } else if (type !== 'password') {
              cloneEl.setAttribute('value', liveEl.value || '');
            }
          } else if (tag === 'textarea') {
            cloneEl.textContent = liveEl.value || '';
          } else if (tag === 'select') {
            const lOpts = liveEl.querySelectorAll('option');
            const cOpts = cloneEl.querySelectorAll('option');
            lOpts.forEach((o, idx) => {
              if (!cOpts[idx]) return;
              if (o.selected) cOpts[idx].setAttribute('selected', 'selected');
              else cOpts[idx].removeAttribute('selected');
            });
          }
        });

        // 2. Convertir <canvas> vivos en imágenes PNG estáticas sobre el clon
        const liveCanvases = document.querySelectorAll('canvas');
        const cloneCanvases = cloneRoot.querySelectorAll('canvas');
        liveCanvases.forEach((lc, i) => {
          const cc = cloneCanvases[i];
          if (!cc || lc.width === 0 || lc.height === 0) return;
          try {
            const dUrl = lc.toDataURL('image/png');
            if (dUrl && dUrl.startsWith('data:image/png')) {
              const img = document.createElement('img');
              img.setAttribute('src', dUrl);
              if (lc.className) img.className = lc.className;
              cc.replaceWith(img);
            }
          } catch (_) {}
        });

        // 3. Capturar reglas dinámicas CSS-in-JS y adoptedStyleSheets
        let dynamicCss = '';
        try {
          Array.from(document.styleSheets).forEach(sheet => {
            try {
              const owner = sheet.ownerNode;
              if (owner && owner.tagName === 'STYLE' && (!owner.textContent || !owner.textContent.trim())) {
                const rules = Array.from(sheet.cssRules || []).map(r => r.cssText).join('\n');
                if (rules) dynamicCss += rules + '\n';
              }
            } catch (_) {}
          });
          if (document.adoptedStyleSheets) {
            Array.from(document.adoptedStyleSheets).forEach(sheet => {
              try {
                const rules = Array.from(sheet.cssRules || []).map(r => r.cssText).join('\n');
                if (rules) dynamicCss += rules + '\n';
              } catch (_) {}
            });
          }
        } catch (_) {}

        if (dynamicCss) {
          const st = document.createElement('style');
          st.setAttribute('data-bwd-css-in-js', 'true');
          st.textContent = dynamicCss;
          (cloneRoot.querySelector('head') || cloneRoot).appendChild(st);
        }

        // 4. Resolver imágenes y <picture> únicamente sobre cloneRoot
        const liveImgs = document.querySelectorAll('img');
        const cloneImgs = cloneRoot.querySelectorAll('img');
        liveImgs.forEach((lImg, idx) => {
          const cImg = cloneImgs[idx];
          if (!cImg) return;
          const bestSet = pickBestSrcset(lImg.getAttribute('srcset') || lImg.getAttribute('data-srcset') || '');
          const cands = [lImg.currentSrc, bestSet, lImg.getAttribute('data-src'), lImg.getAttribute('data-original'), lImg.getAttribute('data-lazy-src'), lImg.getAttribute('src')];
          let chosen = '';
          for (const c of cands) {
            if (c && typeof c === 'string' && !c.includes('data:image/svg') && !c.includes('placeholder')) {
              chosen = c.trim();
              break;
            }
          }
          if (!chosen && lImg.getAttribute('src')) chosen = lImg.getAttribute('src').trim();
          if (chosen && !chosen.startsWith('data:')) {
            try { chosen = new URL(chosen, baseHref).href; } catch (_) {}
          }
          if (chosen) cImg.setAttribute('src', chosen);
          cImg.removeAttribute('srcset');
          cImg.removeAttribute('data-srcset');
          cImg.removeAttribute('data-src');
          cImg.removeAttribute('loading');
        });

        cloneRoot.querySelectorAll('picture').forEach(pic => {
          const im = pic.querySelector('img');
          if (im) pic.replaceWith(im);
        });

        // 5. Limpiar scripts, noscripts, atributos on* y anuncios/cookies (sin falsos positivos en "header"/"load")
        cloneRoot.querySelectorAll('script, noscript').forEach(s => s.remove());
        cloneRoot.querySelectorAll('*').forEach(el => {
          for (const attr of Array.from(el.attributes)) {
            if (attr.name.toLowerCase().startsWith('on')) el.removeAttribute(attr.name);
          }
        });

        if (cleanParam) {
          const cleanSels = [
            'ins.adsbygoogle', 'iframe[id*="google_ads"]', 'iframe[src*="doubleclick"]',
            'div[id*="google_ads"]', 'div[id*="div-gpt-ad"]', 'div[class*="taboola"]',
            'div[class*="outbrain"]', '.ln-placeholder', '#onetrust-consent-sdk',
            '#cookie-banner', '.cookie-banner', '[class*="cookie-consent"]',
            '.swg-dialog', '.modal-backdrop'
          ];
          cleanSels.forEach(sel => {
            try {
              cloneRoot.querySelectorAll(sel).forEach(el => {
                if (!['HTML', 'HEAD', 'BODY', 'MAIN', 'ARTICLE', 'HEADER'].includes(el.tagName) && !el.querySelector('article, main, h1')) {
                  el.remove();
                }
              });
            } catch (_) {}
          });
        }

        return {
          html: cloneRoot.outerHTML,
          title: document.title || 'pagina_web',
          baseHref
        };
      }, [clean]);

      const parser = new DOMParser();
      const doc = parser.parseFromString('<!DOCTYPE html>\n' + (pageData.html || ''), 'text/html');
      const baseHref = pageData.baseHref || tab.url || '';

      if (isOfflineMode) {
        // Modo SingleFile 100% Offline: incrustar hojas CSS externas e imágenes en Base64
        const styleLinks = Array.from(doc.querySelectorAll('link[rel~="stylesheet"][href]'));
        if (styleLinks.length > 0) {
          setProgress(42, `Incrustando ${styleLinks.length} hojas de estilo CSS...`, 'busy');
          await Promise.all(styleLinks.map(async (lnk) => {
            try {
              const absCssUrl = new URL(lnk.getAttribute('href'), baseHref).href;
              const cssText = await fetchAndInlineCssTextPopup(absCssUrl);
              if (cssText !== null) {
                const st = doc.createElement('style');
                const media = lnk.getAttribute('media');
                if (media) st.setAttribute('media', media);
                st.textContent = cssText;
                lnk.replaceWith(st);
              } else {
                lnk.setAttribute('href', absCssUrl);
              }
            } catch (_) {}
          }));
        }

        const imgs = Array.from(doc.querySelectorAll('img[src]')).filter(im => {
          const s = im.getAttribute('src') || '';
          return s && !s.startsWith('data:');
        });

        if (imgs.length > 0) {
          let doneImgs = 0;
          const totalImgs = Math.min(imgs.length, 90);
          const targetImgs = imgs.slice(0, totalImgs);
          const concurrency = 6;
          for (let i = 0; i < targetImgs.length; i += concurrency) {
            const batch = targetImgs.slice(i, i + concurrency);
            await Promise.all(batch.map(async (im) => {
              try {
                const absImg = new URL(im.getAttribute('src'), baseHref).href;
                const dUrl = await fetchResourceAsDataUrlPopup(absImg);
                im.setAttribute('src', dUrl || absImg);
              } catch (_) {}
              doneImgs++;
            }));
            const pct = Math.min(86, 52 + Math.round((doneImgs / Math.max(1, totalImgs)) * 34));
            setProgress(pct, `Incrustando imágenes offline (${doneImgs}/${totalImgs})...`, 'busy');
          }
        }

        // Absolutizar enlaces externos manteniendo intactas las anclas internas (#seccion) y quitar <base>
        doc.querySelectorAll('a[href]').forEach(a => {
          const raw = (a.getAttribute('href') || '').trim();
          if (!raw || raw.startsWith('#') || raw.startsWith('mailto:') || raw.startsWith('tel:') || raw.startsWith('javascript:')) return;
          try {
            a.setAttribute('href', new URL(raw, baseHref).href);
          } catch (_) {}
        });
        doc.querySelectorAll('base').forEach(b => b.remove());
      } else {
        // Modo Ligero: asegurar <base href> limpio sin peso Base64
        if (baseHref && !doc.querySelector('base') && doc.head) {
          const baseEl = doc.createElement('base');
          baseEl.setAttribute('href', baseHref);
          doc.head.insertBefore(baseEl, doc.head.firstChild);
        }
      }

      if (doc.head && !doc.querySelector('meta[charset]')) {
        const meta = doc.createElement('meta');
        meta.setAttribute('charset', 'UTF-8');
        doc.head.insertBefore(meta, doc.head.firstChild);
      }

      setProgress(90, "Empaquetando archivo HTML independiente...", 'busy');
      const finalHtml = '<!DOCTYPE html>\n' + doc.documentElement.outerHTML;
      const blob = new Blob([finalHtml], { type: 'text/html;charset=utf-8' });
      const filename = sanitizeFilename(pageData.title || tab.title, 'html');

      await triggerDownload(blob, filename);

      setProgress(100, `¡HTML ${isOfflineMode ? 'Offline' : 'Ligero'} descargado con éxito! (${filename})`, 'success');
      setBusy(false);

    } catch (err) {
      console.error("Error al exportar HTML:", err);
      setProgress(0, `Error: ${formatErrorMessage(err)}`, 'error');
      setBusy(false);
    }
  });
}

// ----------------------------------------------------------------------------
// 6. Tooltips e Inicialización
// ----------------------------------------------------------------------------

function initTooltips() {
  // Tooltips desactivados según preferencia del usuario
}

// ----------------------------------------------------------------------------
// 7. Navegación de Pestañas y Lanzador de Modo Creador
// ----------------------------------------------------------------------------

function initTabs() {
  if (!tabNavExport || !tabNavEditor) return;

  tabNavExport.addEventListener('click', () => {
    tabNavExport.classList.add('is-active');
    tabNavEditor.classList.remove('is-active');
    if (panelExport) panelExport.style.display = 'block';
    if (panelEditor) panelEditor.style.display = 'none';
  });

  tabNavEditor.addEventListener('click', () => {
    tabNavEditor.classList.add('is-active');
    tabNavExport.classList.remove('is-active');
    if (panelExport) panelExport.style.display = 'none';
    if (panelEditor) panelEditor.style.display = 'block';
  });
}

function initEditorLauncher() {
  if (!btnLaunchEditor) return;

  btnLaunchEditor.addEventListener('click', async () => {
    try {
      setBusy(true);
      setProgress(15, "Precargando elementos e imágenes originales...", 'busy');

      const tab = await getActiveTab();

      // 1. Asentar en scrollY = 0, activar recursos lazy y volver a scrollY = 0 antes de clonar para no congelar cabeceras flotantes sobre el <h1>
      const origUserScroll = await executeInPage(async () => {
        const prevX = window.scrollX || window.pageXOffset || 0;
        const prevY = window.scrollY || window.pageYOffset || 0;

        window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
        if (document.documentElement) document.documentElement.scrollTop = 0;
        if (document.body) document.body.scrollTop = 0;
        window.dispatchEvent(new Event('scroll'));
        await new Promise(r => requestAnimationFrame(() => setTimeout(r, 150)));

        // Guardar estado limpio de cabeceras superiores en scrollY = 0 antes de recorrer la página
        const topNodes = Array.from(document.querySelectorAll('header, nav, [class*="header"], [class*="sticky"], [class*="banner"]')).slice(0, 40);
        window._bwdCleanTopSnapshot = topNodes.map(el => ({
          el,
          className: typeof el.className === 'string' ? el.className : null,
          cssText: el.style ? el.style.cssText : ''
        }));

        const totalH = Math.min(document.body ? document.body.scrollHeight : 0, 16000);
        const step = window.innerHeight || 800;
        for (let y = 0; y < totalH; y += step) {
          window.scrollTo({ top: y, left: 0, behavior: 'instant' });
          await new Promise(r => setTimeout(r, 45));
        }

        // Regresar al tope absoluto y esperar que los listeners del diario desacoplen barras fixed/sticky
        window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
        if (document.documentElement) document.documentElement.scrollTop = 0;
        if (document.body) document.body.scrollTop = 0;
        window.dispatchEvent(new Event('scroll'));
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        await new Promise(r => setTimeout(r, 200));

        return { x: prevX, y: prevY };
      });

      setProgress(40, "Clonando DOM, formularios y estilos sin alterar la pestaña...", 'busy');

      const cleanCloneCheckbox = document.getElementById('cleanCloneDom');
      const clean = cleanCloneCheckbox ? cleanCloneCheckbox.checked : false;

      let cloneData;
      try {
        cloneData = await executeInPage((shouldClean) => {
        // Parsear srcset eligiendo la mayor resolución sin romper URLs con comas internas (Cloudinary/Cloudflare)
        function pickBestSrcsetUrl(srcsetStr) {
          if (!srcsetStr || typeof srcsetStr !== 'string') return '';
          const regex = /(\S+)(?:\s+(\d+(?:\.\d+)?)([wx]))?(?:\s*,\s*|$)/g;
          let bestUrl = '';
          let bestScore = -1;
          let match;
          while ((match = regex.exec(srcsetStr.trim())) !== null) {
            if (!match[1]) break;
            let url = match[1].replace(/,+$/, '');
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

        const baseHref = document.baseURI || window.location.href;
        // Clonar PRIMERO en scrollY = 0 para jamás mutar el DOM vivo que el usuario tiene abierto
        const allLiveEls = Array.from(document.documentElement.querySelectorAll('*'));
        const cloneRoot = document.documentElement.cloneNode(true);
        const allCloneEls = Array.from(cloneRoot.querySelectorAll('*'));

        // Restaurar sobre el clon el estado limpio de cabeceras en scrollY = 0 si algún script dejó clases/estilos fixed pegados
        if (Array.isArray(window._bwdCleanTopSnapshot)) {
          window._bwdCleanTopSnapshot.forEach(snap => {
            const idx = allLiveEls.indexOf(snap.el);
            if (idx >= 0 && allCloneEls[idx]) {
              if (snap.className !== null) allCloneEls[idx].className = snap.className;
              allCloneEls[idx].style.cssText = snap.cssText || '';
            }
          });
          delete window._bwdCleanTopSnapshot;
        }

        try {
          // A. Sincronizar estado vivo de formularios (<input>, <textarea>, <select>) hacia el clon
          const liveInputs = document.querySelectorAll('input, textarea, select');
          const cloneInputs = cloneRoot.querySelectorAll('input, textarea, select');
          liveInputs.forEach((liveEl, i) => {
            const cloneEl = cloneInputs[i];
            if (!cloneEl) return;
            const tag = liveEl.tagName.toLowerCase();
            if (tag === 'input') {
              const type = (liveEl.getAttribute('type') || 'text').toLowerCase();
              if (type === 'checkbox' || type === 'radio') {
                if (liveEl.checked) cloneEl.setAttribute('checked', 'checked');
                else cloneEl.removeAttribute('checked');
              } else if (type !== 'password') {
                cloneEl.setAttribute('value', liveEl.value || '');
              }
            } else if (tag === 'textarea') {
              cloneEl.textContent = liveEl.value || '';
            } else if (tag === 'select') {
              const liveOpts = liveEl.querySelectorAll('option');
              const cloneOpts = cloneEl.querySelectorAll('option');
              liveOpts.forEach((opt, idx) => {
                if (!cloneOpts[idx]) return;
                if (opt.selected) cloneOpts[idx].setAttribute('selected', 'selected');
                else cloneOpts[idx].removeAttribute('selected');
              });
            }
          });

          // B. Convertir <canvas> dinámicos (gráficos, charts, firmas) en imágenes PNG fieles dentro del clon
          const liveCanvases = document.querySelectorAll('canvas');
          const cloneCanvases = cloneRoot.querySelectorAll('canvas');
          liveCanvases.forEach((liveCanvas, i) => {
            const cloneCanvas = cloneCanvases[i];
            if (!cloneCanvas || liveCanvas.width === 0 || liveCanvas.height === 0) return;
            try {
              const dataUrl = liveCanvas.toDataURL('image/png');
              if (dataUrl && dataUrl.startsWith('data:image/png')) {
                const img = document.createElement('img');
                img.setAttribute('src', dataUrl);
                if (liveCanvas.className) img.className = liveCanvas.className;
                const rect = liveCanvas.getBoundingClientRect();
                if (rect.width > 0 && rect.height > 0) {
                  img.style.width = `${Math.round(rect.width)}px`;
                  img.style.height = `${Math.round(rect.height)}px`;
                }
                cloneCanvas.replaceWith(img);
              }
            } catch (_) {}
          });

          // C. Capturar hojas CSS-in-JS (styled-components / Emotion / adoptedStyleSheets) que están vacías en HTML
          let dynamicCssText = '';
          try {
            Array.from(document.styleSheets).forEach(sheet => {
              try {
                const owner = sheet.ownerNode;
                if (owner && owner.tagName === 'STYLE' && (!owner.textContent || !owner.textContent.trim())) {
                  const rules = Array.from(sheet.cssRules || []).map(r => r.cssText).join('\n');
                  if (rules) dynamicCssText += rules + '\n';
                }
              } catch (_) {}
            });
            if (document.adoptedStyleSheets && document.adoptedStyleSheets.length > 0) {
              Array.from(document.adoptedStyleSheets).forEach(sheet => {
                try {
                  const rules = Array.from(sheet.cssRules || []).map(r => r.cssText).join('\n');
                  if (rules) dynamicCssText += rules + '\n';
                } catch (_) {}
              });
            }
          } catch (_) {}

          if (dynamicCssText) {
            const dynStyle = document.createElement('style');
            dynStyle.setAttribute('data-bwd-css-in-js', 'true');
            dynStyle.textContent = dynamicCssText;
            const cloneHead = cloneRoot.querySelector('head') || cloneRoot;
            cloneHead.appendChild(dynStyle);
          }

          // D. Resolver imágenes reales sobre cloneRoot usando las lecturas en memoria de las imágenes vivas (sin tocar la página)
          const liveImgs = document.querySelectorAll('img');
          const cloneImgs = cloneRoot.querySelectorAll('img');
          liveImgs.forEach((liveImg, idx) => {
            const cloneImg = cloneImgs[idx];
            if (!cloneImg) return;

            const srcsetBest = pickBestSrcsetUrl(
              liveImg.getAttribute('srcset') ||
              liveImg.getAttribute('data-srcset') ||
              (liveImg.closest('picture') ? Array.from(liveImg.closest('picture').querySelectorAll('source')).map(s => s.getAttribute('srcset') || s.getAttribute('data-srcset') || '').join(', ') : '')
            );

            const candidates = [
              liveImg.currentSrc,
              srcsetBest,
              liveImg.getAttribute('data-src'),
              liveImg.getAttribute('data-original'),
              liveImg.getAttribute('data-lazy-src'),
              liveImg.getAttribute('data-url'),
              liveImg.getAttribute('data-retina'),
              liveImg.getAttribute('src')
            ];

            let realSrc = '';
            for (const c of candidates) {
              if (c && typeof c === 'string' && !c.includes('data:image/svg') && !c.includes('placeholder')) {
                realSrc = c.trim();
                break;
              }
            }
            if (!realSrc && liveImg.getAttribute('src')) {
              realSrc = liveImg.getAttribute('src').trim();
            }

            let absUrl = realSrc;
            if (realSrc && !realSrc.startsWith('data:')) {
              try {
                absUrl = new URL(realSrc, baseHref).href;
              } catch (_) {}
            }

            if (absUrl) {
              cloneImg.setAttribute('src', absUrl);
            }

            // Si está cargada y es mismo origen, preservar PNG (con canal alfa/transparencia) o JPEG según corresponda
            if (
              liveImg.complete &&
              liveImg.naturalWidth > 0 &&
              liveImg.naturalHeight > 0 &&
              liveImg.naturalWidth <= 2400 &&
              absUrl &&
              !absUrl.startsWith('data:image/svg') &&
              !/\.svg(?:$|\?)/i.test(absUrl)
            ) {
              try {
                const canvas = document.createElement('canvas');
                canvas.width = liveImg.naturalWidth;
                canvas.height = liveImg.naturalHeight;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(liveImg, 0, 0);
                const isJpegSource = /\.(?:jpe?g)(?:$|\?)/i.test(absUrl);
                const mime = isJpegSource ? 'image/jpeg' : 'image/png';
                const dataUrl = isJpegSource ? canvas.toDataURL(mime, 0.90) : canvas.toDataURL(mime);
                if (dataUrl && dataUrl.startsWith('data:image/')) {
                  cloneImg.setAttribute('src', dataUrl);
                }
              } catch (_) {
                // Si tiene CORS, el inliner privilegiado del editor la descargará intacta
              }
            }

            cloneImg.removeAttribute('data-src');
            cloneImg.removeAttribute('data-original');
            cloneImg.removeAttribute('data-lazy-src');
            cloneImg.removeAttribute('data-srcset');
            cloneImg.removeAttribute('data-url');
            cloneImg.removeAttribute('srcset');
            cloneImg.setAttribute('loading', 'eager');
          });

          // Desenrollar <picture> únicamente en cloneRoot
          cloneRoot.querySelectorAll('picture').forEach(pic => {
            const img = pic.querySelector('img');
            if (img) pic.replaceWith(img);
          });
        } catch (_) {}

        // A. Neutralizar scripts y noscripts completamente para evitar bloqueos y recargas
        cloneRoot.querySelectorAll('script, noscript').forEach(s => s.remove());

        // B. Neutralizar autoplay en videos y audios para evitar advertencias de permisos y consumo
        cloneRoot.querySelectorAll('video, audio').forEach(media => {
          media.removeAttribute('autoplay');
          media.removeAttribute('loop');
          media.setAttribute('muted', '');
        });

        // C. Neutralizar iframes invasivos de tracking, videos publicitarios y paywall (Google SwG, serviceiframe, etc.)
        cloneRoot.querySelectorAll('iframe').forEach(ifr => {
          const src = (ifr.getAttribute('src') || '').toLowerCase();
          const id = (ifr.getAttribute('id') || '').toLowerCase();
          if (
            id.includes('serviceiframe') ||
            src.includes('google.com/swg') ||
            src.includes('doubleclick') ||
            src.includes('google_ads') ||
            src.includes('taboola') ||
            src.includes('outbrain') ||
            src.includes('adnxs') ||
            src.includes('adsystem') ||
            src.includes('dailymotion') ||
            src.includes('chartbeat') ||
            src.includes('adzone') ||
            src.includes('streamtheworld') ||
            src.includes('imasdk')
          ) {
            ifr.remove();
          }
        });

        // D. Eliminar inline handlers (onload, onerror, etc.) en el DOM clonado sin usar regex destructivo
        cloneRoot.querySelectorAll('*').forEach(el => {
          for (const attr of Array.from(el.attributes)) {
            if (attr.name.toLowerCase().startsWith('on')) {
              el.removeAttribute(attr.name);
            }
          }
        });

        // E. Solo si el usuario activó explícitamente pre-limpieza en el panel Creador
        if (shouldClean) {
          const adSelectors = [
            'ins.adsbygoogle',
            'iframe[id*="google_ads"]',
            'div[id*="google_ads"]',
            'div[id*="div-gpt-ad"]',
            'div[class*="taboola"]',
            'div[class*="outbrain"]',
            'div[class*="advertisement"]',
            'div[class*="ad-box"]',
            'div[class*="ad-container"]',
            'div[class*="banner-ad"]',
            'div[class*="dfp-ad"]',
            'div[class*="teads"]',
            '[data-ad-slot]',
            '[data-ad-unit]',
            '#onetrust-consent-sdk',
            '#onetrust-banner-sdk',
            '#cookie-banner',
            '[class*="cookie-consent"]',
            '.swg-dialog',
            '[class*="newsletter-modal"]',
            '#disqus_thread'
          ];
          adSelectors.forEach(sel => {
            try {
              cloneRoot.querySelectorAll(sel).forEach(el => {
                if (!['HTML', 'HEAD', 'BODY', 'MAIN', 'ARTICLE'].includes(el.tagName)) {
                  el.remove();
                }
              });
            } catch (_) {}
          });
        }

        return {
          html: '<!DOCTYPE html>\n' + cloneRoot.outerHTML,
          title: document.title || 'Página Web',
          url: window.location.href,
          baseURI: baseHref,
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight,
          createdAt: Date.now()
        };
      }, [clean]);
      } finally {
        if (origUserScroll) {
          await executeInPage((pos) => {
            delete window._bwdCleanTopSnapshot;
            window.scrollTo({ top: pos.y, left: pos.x, behavior: 'instant' });
          }, [origUserScroll]).catch(() => {});
        }
      }

      if (!cloneData || !cloneData.html) {
        throw new Error("No se pudo extraer el HTML de la página activa.");
      }

      setProgress(65, "Guardando sesión aislada en almacenamiento...", 'busy');

      // Limpiar sesiones antiguas (> 2 horas) para proteger cuota de browser.storage.local
      try {
        const allStored = await browser.storage.local.get(null);
        const now = Date.now();
        const keysToRemove = Object.keys(allStored).filter(k => {
          if (!k.startsWith('bwd_clone_session_')) return false;
          const item = allStored[k];
          return !item || !item.createdAt || (now - item.createdAt > 2 * 60 * 60 * 1000);
        });
        if (keysToRemove.length > 0) {
          await browser.storage.local.remove(keysToRemove);
        }
      } catch (_) {}

      const sessionId = `bwd_clone_session_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      await browser.storage.local.set({
        [sessionId]: cloneData,
        bwd_clone_data: cloneData
      });

      setProgress(85, "Abriendo Modo Creador Inteligente...", 'busy');
      await browser.tabs.create({
        url: browser.runtime.getURL(`editor/editor.html?id=${encodeURIComponent(sessionId)}`)
      });

      setProgress(100, "¡Modo Creador Inteligente iniciado!", 'success');
      setBusy(false);

      setTimeout(() => {
        window.close();
      }, 400);

    } catch (err) {
      console.error("Error al abrir Modo Creador:", err);
      setProgress(0, `Error: ${formatErrorMessage(err)}`, 'error');
      setBusy(false);
    }
  });
}

function initSpotlightCards() {
  const cards = document.querySelectorAll('.action-row, .pro-spotlight-card');
  cards.forEach(card => {
    card.addEventListener('mousemove', (e) => {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      card.style.setProperty('--mouse-x', `${x}px`);
      card.style.setProperty('--mouse-y', `${y}px`);
    });
  });
}

function initSettingsCollapsible() {
  const collapsible = document.getElementById('settingsCollapsible');
  const trigger = document.getElementById('btnToggleSettings');
  if (!collapsible || !trigger) return;

  trigger.addEventListener('click', (e) => {
    e.preventDefault();
    collapsible.classList.toggle('is-open');
  });
}

function applySubModeVisualState() {
  const bindGroupState = (groupId, attrName, currentVal, summaryEl, summaryMap) => {
    const group = document.getElementById(groupId);
    if (group) {
      group.querySelectorAll(`[${attrName}]`).forEach(pill => {
        const val = pill.getAttribute(attrName);
        pill.classList.toggle('is-active', val === currentVal);
      });
    }
    if (summaryEl && summaryMap && summaryMap[currentVal]) {
      summaryEl.textContent = summaryMap[currentVal];
    }
  };

  bindGroupState('popupPdfModeGroup', 'data-pdf-mode', exportState.pdfMode, pdfSummaryTextEl, MODE_SUMMARIES.pdfMode);
  bindGroupState('popupDocxModeGroup', 'data-docx-mode', exportState.docxMode, docxSummaryTextEl, MODE_SUMMARIES.docxMode);
  bindGroupState('popupPngModeGroup', 'data-png-mode', exportState.pngMode, pngSummaryTextEl, MODE_SUMMARIES.pngMode);
  bindGroupState('popupHtmlModeGroup', 'data-html-mode', exportState.htmlMode, htmlSummaryTextEl, MODE_SUMMARIES.htmlMode);
}

async function saveExportPrefs() {
  try {
    if (typeof browser !== 'undefined' && browser.storage && browser.storage.local) {
      await browser.storage.local.set({
        bwd_export_prefs: {
          cleanDom: cleanDomCheckbox ? cleanDomCheckbox.checked : true,
          expandScroll: expandScrollCheckbox ? expandScrollCheckbox.checked : true,
          highQuality: highQualityCheckbox ? highQualityCheckbox.checked : true,
          cleanCloneDom: cleanCloneCheckboxEl ? cleanCloneCheckboxEl.checked : false,
          pdfMode: exportState.pdfMode,
          docxMode: exportState.docxMode,
          pngMode: exportState.pngMode,
          htmlMode: exportState.htmlMode
        }
      });
    }
  } catch (_) {}
}

async function initExportSubModesAndPrefs() {
  try {
    if (typeof browser !== 'undefined' && browser.storage && browser.storage.local) {
      const stored = await browser.storage.local.get('bwd_export_prefs');
      const prefs = stored && stored.bwd_export_prefs;
      if (prefs && typeof prefs === 'object') {
        if (cleanDomCheckbox && typeof prefs.cleanDom === 'boolean') cleanDomCheckbox.checked = prefs.cleanDom;
        if (expandScrollCheckbox && typeof prefs.expandScroll === 'boolean') expandScrollCheckbox.checked = prefs.expandScroll;
        if (highQualityCheckbox && typeof prefs.highQuality === 'boolean') highQualityCheckbox.checked = prefs.highQuality;
        if (cleanCloneCheckboxEl && typeof prefs.cleanCloneDom === 'boolean') cleanCloneCheckboxEl.checked = prefs.cleanCloneDom;
        if (prefs.pdfMode && MODE_SUMMARIES.pdfMode[prefs.pdfMode]) exportState.pdfMode = prefs.pdfMode;
        if (prefs.docxMode && MODE_SUMMARIES.docxMode[prefs.docxMode]) exportState.docxMode = prefs.docxMode;
        if (prefs.pngMode && MODE_SUMMARIES.pngMode[prefs.pngMode]) exportState.pngMode = prefs.pngMode;
        if (prefs.htmlMode && MODE_SUMMARIES.htmlMode[prefs.htmlMode]) exportState.htmlMode = prefs.htmlMode;
      }
    }
  } catch (_) {}

  applySubModeVisualState();

  const wireGroup = (groupId, attrName, stateKey) => {
    const group = document.getElementById(groupId);
    if (!group) return;
    group.querySelectorAll(`[${attrName}]`).forEach(pill => {
      const activatePill = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const val = pill.getAttribute(attrName);
        if (!val) return;
        exportState[stateKey] = val;
        applySubModeVisualState();
        saveExportPrefs();
      };
      pill.addEventListener('click', activatePill);
      pill.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') activatePill(e);
      });
    });
  };

  wireGroup('popupPdfModeGroup', 'data-pdf-mode', 'pdfMode');
  wireGroup('popupDocxModeGroup', 'data-docx-mode', 'docxMode');
  wireGroup('popupPngModeGroup', 'data-png-mode', 'pngMode');
  wireGroup('popupHtmlModeGroup', 'data-html-mode', 'htmlMode');

  [cleanDomCheckbox, expandScrollCheckbox, highQualityCheckbox, cleanCloneCheckboxEl].forEach(chk => {
    if (chk) chk.addEventListener('change', () => saveExportPrefs());
  });
}

async function initLivePageBackground() {
  try {
    const tab = await getActiveTab();
    if (tab) {
      await applyPageBackground(tab);
    }
  } catch (_) {}
}

document.addEventListener('DOMContentLoaded', () => {
  initTabDetection();
  initExportSubModesAndPrefs();
  initTooltips();
  initTabs();
  initEditorLauncher();
  initSpotlightCards();
  initSettingsCollapsible();
});

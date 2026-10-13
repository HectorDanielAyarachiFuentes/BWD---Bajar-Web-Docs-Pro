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
const btnLaunchEditor = document.getElementById('btnLaunchEditor');

const tabNavExport = document.getElementById('tabNavExport');
const tabNavEditor = document.getElementById('tabNavEditor');
const panelExport = document.getElementById('panelExport');
const panelEditor = document.getElementById('panelEditor');

const cleanDomCheckbox = document.getElementById('cleanDom');
const expandScrollCheckbox = document.getElementById('expandScroll');
const highQualityCheckbox = document.getElementById('highQuality');

const actionButtons = [btnPdfVisual, btnDocx, btnPngFull, btnLaunchEditor];

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
    statusTextEl.textContent = label;
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

function sanitizeFilename(title, ext) {
  const clean = (title || 'documento_web')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, '_')
    .substring(0, 50);
  return `${clean}_${Date.now().toString().slice(-4)}.${ext}`;
}

async function triggerDownload(blobOrUrl, filename) {
  let downloadUrl = blobOrUrl;
  let isCreatedObjectUrl = false;

  if (blobOrUrl instanceof Blob) {
    downloadUrl = URL.createObjectURL(blobOrUrl);
    isCreatedObjectUrl = true;
  }

  try {
    if (typeof browser !== 'undefined' && browser.downloads && browser.downloads.download) {
      await browser.downloads.download({
        url: downloadUrl,
        filename: filename,
        saveAs: false
      });
      if (isCreatedObjectUrl) {
        setTimeout(() => URL.revokeObjectURL(downloadUrl), 15000);
      }
      return;
    }
  } catch (err) {
    console.warn("browser.downloads no disponible, usando fallback:", err);
  }

  const a = document.createElement('a');
  a.href = downloadUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();

  if (isCreatedObjectUrl) {
    setTimeout(() => URL.revokeObjectURL(downloadUrl), 15000);
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
async function captureTabImage(tab, format = 'png') {
  // 1. Intentar con el windowId numérico de la pestaña activa
  if (tab && typeof tab.windowId === 'number') {
    try {
      return await browser.tabs.captureVisibleTab(tab.windowId, { format: format });
    } catch (e) {
      console.warn("captureVisibleTab(windowId) no respondió, intentando fallback:", e);
    }
  }

  // 2. Fallback: llamada directa sin windowId (estándar Firefox)
  try {
    return await browser.tabs.captureVisibleTab({ format: format });
  } catch (e) {
    console.warn("captureVisibleTab() sin parámetros falló:", e);
  }

  // 3. Fallback: API nativa exclusiva de Firefox browser.tabs.captureTab
  if (typeof browser.tabs.captureTab === 'function' && tab && tab.id) {
    try {
      return await browser.tabs.captureTab(tab.id, { format: format });
    } catch (e) {
      console.warn("browser.tabs.captureTab() falló:", e);
    }
  }

  throw new Error("No fue posible capturar la pantalla. Verifica que la pestaña sea una página web accesible.");
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
// 3. Motor de Captura Completa HD (Multi-slice exacto, sin duplicación ni distorsión)
// ----------------------------------------------------------------------------

async function captureFullPageCanvas({ clean = false, expand = false, onProgress = () => {} } = {}) {
  const tab = await getActiveTab();

  // 0. Asegurar que la página esté en el origen absoluto (0, 0) antes de calcular rectángulos o posiciones
  await executeInPage(() => {
    window.scrollTo(0, 0);
  });
  await new Promise(r => setTimeout(r, 100));

  // 1. Suprimir barras de scroll y des-fijar elementos sticky/fixed para evitar repeticiones en cortes
  await executeInPage((opts) => {
    window._bwdRestores = [];

    // A. Inyectar regla global de supresión de scrollbars y desactivar smooth scrolling para scroll instantáneo
    const styleEl = document.createElement('style');
    styleEl.id = 'bwd-no-scrollbars';
    styleEl.textContent = `
      html, body, :root, * {
        scrollbar-width: none !important;
        -ms-overflow-style: none !important;
        scroll-behavior: auto !important;
      }
      *::-webkit-scrollbar,
      html::-webkit-scrollbar,
      body::-webkit-scrollbar {
        display: none !important;
        width: 0px !important;
        height: 0px !important;
        background: transparent !important;
      }
      *::-webkit-scrollbar-thumb,
      *::-webkit-scrollbar-track {
        display: none !important;
        background: transparent !important;
      }
    `;
    (document.head || document.documentElement).appendChild(styleEl);
    window._bwdRestores.push({ type: 'style-tag', id: 'bwd-no-scrollbars' });

    if (opts.clean) {
      const selectors = [
        '.cookie-banner', '#cookie-banner', '.cookies', '.modal-backdrop',
        '.ad', '.ads', '.advertisement', '[id*="cookie"]', '[class*="cookie"]',
        '.chat-widget', '#onetrust-consent-sdk', '[aria-label*="cookie" i]'
      ];
      selectors.forEach(sel => {
        try {
          document.querySelectorAll(sel).forEach(el => {
            const style = window.getComputedStyle(el);
            if (style.position === 'fixed' || style.position === 'sticky' || parseInt(style.zIndex, 10) > 1000) {
              window._bwdRestores.push({ el, prop: 'display', val: el.style.display });
              el.style.setProperty('display', 'none', 'important');
            }
          });
        } catch (_) {}
      });
    }

    if (opts.expand) {
      document.querySelectorAll('*').forEach(el => {
        try {
          const s = window.getComputedStyle(el);
          if (s.overflowY === 'scroll' || s.overflowY === 'auto') {
            if (el.scrollHeight > el.clientHeight && el.scrollHeight < 25000) {
              window._bwdRestores.push({ el, prop: 'overflowY', val: el.style.overflowY });
              window._bwdRestores.push({ el, prop: 'maxHeight', val: el.style.maxHeight });
              window._bwdRestores.push({ el, prop: 'height', val: el.style.height });
              el.style.setProperty('overflow-y', 'visible', 'important');
              el.style.setProperty('max-height', 'none', 'important');
              el.style.setProperty('height', 'auto', 'important');
            }
          }
        } catch (_) {}
      });
    }

    // B. Neutralizar elementos sticky y fixed en toda la página
    document.querySelectorAll('*').forEach(el => {
      try {
        const s = window.getComputedStyle(el);
        if (s.position === 'sticky') {
          // Dejar sticky en su posición estática original para que no se duplique al scrollear
          window._bwdRestores.push({ el, prop: 'position', val: el.style.position });
          el.style.setProperty('position', 'static', 'important');
        } else if (s.position === 'fixed') {
          const rect = el.getBoundingClientRect();
          if (rect.top <= 200 && rect.height > 0) {
            // Cabecera superior fija: anclarla como absolute en el tope del documento
            const absTop = rect.top + (window.scrollY || window.pageYOffset || 0);
            window._bwdRestores.push({ el, prop: 'position', val: el.style.position });
            window._bwdRestores.push({ el, prop: 'top', val: el.style.top });
            el.style.setProperty('position', 'absolute', 'important');
            el.style.setProperty('top', `${absTop}px`, 'important');
          } else {
            // Elementos fijos flotantes (widgets de chat, banners inferiores): ocultar
            window._bwdRestores.push({ el, prop: 'display', val: el.style.display });
            el.style.setProperty('display', 'none', 'important');
          }
        }

        // Suprimir barras de scroll internas en elementos con scroll horizontal
        if (s.overflowX === 'scroll' || s.overflowX === 'auto') {
          window._bwdRestores.push({ el, prop: 'scrollbarWidth', val: el.style.scrollbarWidth });
          el.style.setProperty('scrollbar-width', 'none', 'important');
        }
      } catch (_) {}
    });
  }, [{ clean, expand }]);

  try {
    // 2. Medir dimensiones completas del documento en la página
    const metrics = await executeInPage(() => {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      if (document.documentElement) document.documentElement.scrollTop = 0;
      if (document.body) document.body.scrollTop = 0;

      const vH = window.innerHeight;
      const vW = window.innerWidth;
      const docEl = document.documentElement;
      const body = document.body;

      const scrollH = Math.max(
        body ? body.scrollHeight : 0,
        body ? body.offsetHeight : 0,
        docEl ? docEl.clientHeight : 0,
        docEl ? docEl.scrollHeight : 0,
        docEl ? docEl.offsetHeight : 0
      );

      const scrollW = Math.max(
        vW,
        body ? body.scrollWidth : 0,
        body ? body.offsetWidth : 0,
        docEl ? docEl.clientWidth : 0,
        docEl ? docEl.scrollWidth : 0,
        docEl ? docEl.offsetWidth : 0
      );

      return {
        title: document.title || 'documento_web',
        width: scrollW,
        height: scrollH,
        viewportHeight: vH,
        viewportWidth: vW,
        dpr: window.devicePixelRatio || 1
      };
    });

    if (!metrics) throw new Error("No se pudo obtener las métricas de la página.");

    const totalHeight = Math.min(metrics.height, 16000);
    const viewportH = metrics.viewportHeight;
    const viewportW = metrics.viewportWidth;
    const isSingleScreen = totalHeight <= (viewportH + 25);

    // Si la página cabe exactamente en una pantalla, capturar directamente sin rebanar
    if (isSingleScreen) {
      onProgress(70, "Capturando diseño de pantalla completa...");
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

      return { canvas: singleCanvas, isSingleScreen: true, metrics };
    }

    // 3. Captura multi-slice con avance real y prevención de duplicados
    onProgress(50, "Capturando secciones de la página...");
    const slices = [];
    let currentY = 0;
    const maxScrollY = Math.max(0, totalHeight - viewportH);
    let previousScrollY = -1;

    while (currentY <= maxScrollY) {
      const targetScrollY = Math.min(currentY, maxScrollY);

      await executeInPage((y) => {
        window.scrollTo({ top: y, left: 0, behavior: 'instant' });
        if (document.documentElement) document.documentElement.scrollTop = y;
        if (document.body) document.body.scrollTop = y;
      }, [targetScrollY]);
      await new Promise(r => setTimeout(r, 220));

      const actualScrollY = await executeInPage(() => {
        return Math.max(
          window.scrollY || 0,
          window.pageYOffset || 0,
          document.documentElement ? document.documentElement.scrollTop : 0,
          document.body ? document.body.scrollTop : 0
        );
      });

      // Si intentamos avanzar hacia abajo pero el scroll no se movió (límite físico o página fija), detener
      if (currentY > 0 && actualScrollY <= previousScrollY) {
        break;
      }

      const sliceUrl = await captureTabImage(tab, 'png');
      const isLast = (currentY >= maxScrollY) || (actualScrollY >= maxScrollY);

      slices.push({
        url: sliceUrl,
        actualScrollY: actualScrollY
      });

      previousScrollY = actualScrollY;

      if (isLast) break;

      currentY += viewportH;
      if (currentY > maxScrollY && previousScrollY < maxScrollY) {
        currentY = maxScrollY;
      }
    }

    // Restaurar scroll al inicio de forma instantánea
    await executeInPage(() => {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      if (document.documentElement) document.documentElement.scrollTop = 0;
      if (document.body) document.body.scrollTop = 0;
    });

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
      return { canvas: singleCanvas, isSingleScreen: true, metrics };
    }

    onProgress(75, "Ensamblando imagen completa sin superposiciones ni duplicados...");

    // Cargar la primera imagen para obtener resolución nativa del compositor
    const firstImg = new Image();
    await new Promise((res, rej) => {
      firstImg.onload = res;
      firstImg.onerror = rej;
      firstImg.src = slices[0].url;
    });

    const scaleY = firstImg.height / viewportH;
    const lastScroll = slices[slices.length - 1].actualScrollY;
    const totalCssH = lastScroll + viewportH;
    const masterCanvasHeight = Math.round(totalCssH * scaleY);

    const masterCanvas = document.createElement('canvas');
    masterCanvas.width = firstImg.width;
    masterCanvas.height = masterCanvasHeight;
    const ctx = masterCanvas.getContext('2d');

    // 1. Pintar primer corte completo (0 a viewportH)
    ctx.drawImage(firstImg, 0, 0);
    let paintedCssY = viewportH;

    // 2. Pintar cortes subsecuentes tomando únicamente la porción nueva (delta) al fondo del visor
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

      const newContentCssH = (slice.actualScrollY + viewportH) - paintedCssY;
      if (newContentCssH > 0) {
        const newContentCanvasH = Math.round(newContentCssH * scaleY);
        const sy = Math.max(0, img.height - newContentCanvasH);
        const dy = Math.round(paintedCssY * scaleY);
        ctx.drawImage(img, 0, sy, img.width, newContentCanvasH, 0, dy, img.width, newContentCanvasH);
        paintedCssY += newContentCssH;
      }
    }

    return { canvas: masterCanvas, isSingleScreen: false, metrics };

  } finally {
    // Restaurar siempre todos los estilos modificados en la página
    try {
      await executeInPage(() => {
        const noScrollStyle = document.getElementById('bwd-no-scrollbars');
        if (noScrollStyle) noScrollStyle.remove();

        if (window._bwdRestores && Array.isArray(window._bwdRestores)) {
          window._bwdRestores.forEach(item => {
            try {
              if (item.type === 'style-tag') {
                const el = document.getElementById(item.id);
                if (el) el.remove();
              } else if (item.el && item.prop) {
                if (item.val) item.el.style[item.prop] = item.val;
                else item.el.style.removeProperty(item.prop);
              }
            } catch (_) {}
          });
          delete window._bwdRestores;
        }
        document.querySelectorAll('[data-bwd-hidden="true"]').forEach(el => {
          el.style.removeProperty('display');
          el.removeAttribute('data-bwd-hidden');
        });
      });
    } catch (_) {}
  }
}

// ----------------------------------------------------------------------------
// 4. Exportar PDF Fiel (Motor Visual de Alta Fidelidad y Proporción Real)
// ----------------------------------------------------------------------------

btnPdfVisual.addEventListener('click', async () => {
  try {
    setBusy(true);
    setProgress(20, "Preparando página para exportación fiel...", 'busy');

    const clean = cleanDomCheckbox.checked;
    const expand = expandScrollCheckbox.checked;
    const tab = await getActiveTab();

    const { canvas, isSingleScreen, metrics } = await captureFullPageCanvas({
      clean,
      expand,
      onProgress: (pct, msg) => setProgress(pct, msg, 'busy')
    });

    setProgress(85, "Compilando PDF continuo en una sola página (sin saltos)...", 'busy');

    const { jsPDF } = window.jspdf;
    const canvasWidth = canvas.width;
    const canvasHeight = canvas.height;

    // Detectar orientación nativa según dimensiones reales
    const isLandscape = canvasWidth > canvasHeight;
    const orientation = isLandscape ? 'landscape' : 'portrait';

    // Generar documento en 1 sola página continua con proporción exacta y sin saltos
    const pdf = new jsPDF({
      orientation: orientation,
      unit: 'px',
      format: [canvasWidth, canvasHeight],
      hotfixes: ['px_scaling'],
      compress: true
    });

    // Preparar canvas con fondo limpio para evitar transparencias oscuras y garantizar nitidez
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = canvasWidth;
    exportCanvas.height = canvasHeight;
    const ectx = exportCanvas.getContext('2d');
    ectx.fillStyle = '#ffffff';
    ectx.fillRect(0, 0, canvasWidth, canvasHeight);
    ectx.drawImage(canvas, 0, 0);

    const imgData = exportCanvas.toDataURL('image/jpeg', 0.95);
    pdf.addImage(imgData, 'JPEG', 0, 0, canvasWidth, canvasHeight, undefined, 'FAST');

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
// 4. Exportar a Word (.doc enriquecido / editable con esencia visual y dimensiones)
// ----------------------------------------------------------------------------

btnDocx.addEventListener('click', async () => {
  try {
    setBusy(true);
    setProgress(20, "Capturando diseño visual y dimensiones...", 'busy');

    const tab = await getActiveTab();

    // 1. Capturar la vista de pantalla fiel para la portada de Word
    const visualSnapshotUrl = await captureTabImage(tab, 'png');

    setProgress(45, "Extrayendo contenido estructurado y legible...", 'busy');

    // 2. Extraer ÚNICAMENTE bloques semánticos visibles reales (evita los 300 divs vacíos que causaban 50 páginas)
    const extracted = await executeInPage(() => {
      const title = document.title ? document.title.trim() : 'Documento Web';
      const url = window.location.href;

      function isVisible(el) {
        if (!el) return false;
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      }

      const container = document.querySelector('article') ||
                        document.querySelector('[role="article"]') ||
                        document.querySelector('main') ||
                        document.querySelector('[role="main"]') ||
                        document.body;

      const blocks = [];
      const seenTexts = new Set();

      // Recorrer sólo elementos informativos principales
      const elements = container.querySelectorAll('h1, h2, h3, h4, p, table, ul, ol, form, blockquote');

      elements.forEach(el => {
        // Ignorar encabezados de navegación fija, footers repetitivos y anuncios
        if (el.closest('nav, footer, aside, script, noscript, header, .cookie-banner, #cookie-banner, [role="navigation"]')) {
          return;
        }

        if (!isVisible(el)) return;

        const tag = el.tagName.toLowerCase();
        const text = el.innerText ? el.innerText.trim() : '';

        if (!text && tag !== 'table' && tag !== 'form') return;

        // Evitar duplicaciones provocadas por contenedores anidados
        if (text && seenTexts.has(text)) return;
        if (text) seenTexts.add(text);

        if (tag.startsWith('h')) {
          blocks.push(`<${tag} style="color: #0f172a; margin-top: 14pt; margin-bottom: 4pt; font-size: ${tag === 'h1' ? '18pt' : tag === 'h2' ? '14pt' : '12pt'}; font-weight: bold; mso-line-height-rule: exactly; line-height: 1.2;">${text}</${tag}>`);
        } else if (tag === 'p') {
          if (text.length > 3) {
            blocks.push(`<p style="margin: 0 0 8pt 0; line-height: 1.45; color: #334155;">${text}</p>`);
          }
        } else if (tag === 'table') {
          const cloneTable = el.cloneNode(true);
          cloneTable.querySelectorAll('*').forEach(t => t.removeAttribute('class'));
          cloneTable.setAttribute('border', '1');
          cloneTable.setAttribute('cellpadding', '6');
          cloneTable.setAttribute('cellspacing', '0');
          cloneTable.style.cssText = 'border-collapse: collapse; width: 100%; margin: 12pt 0; border: 1pt solid #cbd5e1; font-size: 10pt;';
          blocks.push(cloneTable.outerHTML);
        } else if (tag === 'ul' || tag === 'ol') {
          const items = Array.from(el.querySelectorAll('li'))
            .map(li => li.innerText ? li.innerText.trim() : '')
            .filter(t => t.length > 0 && !seenTexts.has(t));
          if (items.length > 0) {
            items.forEach(t => seenTexts.add(t));
            const lis = items.map(t => `<li style="margin-bottom: 3pt; color: #334155;">${t}</li>`).join('');
            blocks.push(`<${tag} style="margin: 6pt 0 10pt 18pt;">${lis}</${tag}>`);
          }
        } else if (tag === 'form') {
          const inputs = Array.from(el.querySelectorAll('input, select, textarea, button'));
          if (inputs.length > 0) {
            let formSummary = '<table style="width: 100%; border-collapse: collapse; background-color: #f8fafc; border: 1pt solid #cbd5e1; margin: 10pt 0;" cellpadding="6">';
            formSummary += '<tr><td style="background-color: #f1f5f9; font-weight: bold; color: #1e40af; border-bottom: 1pt solid #cbd5e1;" colspan="2">Estructura del Formulario</td></tr>';
            inputs.forEach(inp => {
              const label = inp.getAttribute('placeholder') || inp.getAttribute('aria-label') || inp.name || inp.innerText || inp.value;
              if (label && label.trim()) {
                formSummary += `<tr><td style="width: 35%; font-weight: bold; color: #475569; border-bottom: 1pt solid #e2e8f0;">${label.trim()}</td><td style="color: #64748b; border-bottom: 1pt solid #e2e8f0; font-family: Consolas, monospace;">[ Campo editable ]</td></tr>`;
              }
            });
            formSummary += '</table>';
            blocks.push(formSummary);
          }
        }
      });

      return {
        title: title,
        url: url,
        contentHtml: blocks.join('\n')
      };
    });

    setProgress(75, "Empaquetando documento fiel para Word (formato MHTML)...", 'busy');

    const today = new Date().toLocaleDateString('es-ES', {
      year: 'numeric', month: 'long', day: 'numeric'
    });

    // 3. Extraer y formatear el base64 para el estándar MIME (RFC 2045: líneas de 76 caracteres)
    const rawBase64 = visualSnapshotUrl.replace(/^data:image\/[a-z]+;base64,/, '');
    const chunkedBase64 = (rawBase64.match(/.{1,76}/g) || [rawBase64]).join('\r\n');

    // 4. Plantilla HTML interna que referencia el identificador MIME 'snapshot_cover.png'
    const wordHtmlContent = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
      <head>
        <meta charset='utf-8'>
        <title>${extracted.title}</title>
        <!--[if gte mso 9]>
        <xml>
         <w:WordDocument>
          <w:View>Print</w:View>
          <w:Zoom>100</w:Zoom>
          <w:DoNotOptimizeForBrowser/>
         </w:WordDocument>
        </xml>
        <![endif]-->
        <style>
          @page Section1 {
            size: 8.27in 11.69in; /* A4 */
            margin: 0.6in 0.6in 0.6in 0.6in;
            mso-header-margin: 0.4in;
            mso-footer-margin: 0.4in;
            mso-paper-source: 0;
          }
          div.Section1 {
            page: Section1;
          }
          body {
            font-family: 'Segoe UI', Calibri, Arial, sans-serif;
            font-size: 11pt;
            line-height: 1.45;
            color: #1e293b;
            margin: 0;
            padding: 0;
          }
          h1 {
            color: #0f172a;
            font-size: 20pt;
            font-weight: bold;
            margin: 0 0 8pt 0;
            line-height: 1.2;
          }
          .bwd-card {
            background-color: #f8fafc;
            border: 1pt solid #cbd5e1;
            border-left: 3.5pt solid #2563eb;
            padding: 8pt 12pt;
            margin-bottom: 12pt;
          }
          .bwd-meta {
            font-size: 9pt;
            color: #64748b;
            margin: 2pt 0;
          }
          .visual-box {
            border: 1pt solid #cbd5e1;
            padding: 4pt;
            background: #ffffff;
            margin-bottom: 14pt;
            text-align: center;
          }
          .visual-tag {
            font-size: 8.5pt;
            font-weight: bold;
            color: #2563eb;
            text-transform: uppercase;
            letter-spacing: 0.5pt;
            margin-bottom: 4pt;
            text-align: left;
          }
          /* Dimensión exacta calculada para el ancho A4 útil */
          img.visual-img {
            width: 6.8in;
            max-width: 6.8in;
            height: auto;
            border: 1pt solid #e2e8f0;
            display: block;
            margin: 0 auto;
          }
          .page-break {
            page-break-before: always;
            margin-top: 14pt;
          }
        </style>
      </head>
      <body>
        <div class="Section1">
          <h1>${extracted.title}</h1>
          <div class="bwd-card">
            <div class="bwd-meta"><strong>Origen:</strong> <a href="${extracted.url}">${extracted.url}</a></div>
            <div class="bwd-meta"><strong>Fecha de exportación:</strong> ${today} — Generado con BWD Pro</div>
          </div>

          <!-- 1. VISTA VISUAL FIEL (VINCULADA AL RECURSO EMBEBIDO EN EL ARCHIVO) -->
          <div class="visual-box">
            <div class="visual-tag">Maquetación Visual y Dimensiones Originales</div>
            <img class="visual-img" src="snapshot_cover.png" alt="${extracted.title}" />
          </div>

          ${extracted.contentHtml ? `
          <!-- 2. CONTENIDO ESTRUCTURADO Y FORMULARIOS EDITABLES -->
          <div class="page-break">
            <h2 style="color: #1e40af; border-bottom: 2pt solid #2563eb; padding-bottom: 4pt; margin-bottom: 10pt; font-size: 15pt;">
              Contenido Estructurado y Formularios Editables
            </h2>
            ${extracted.contentHtml}
          </div>
          ` : ''}
        </div>
      </body>
      </html>
    `;

    // 5. Ensamblar documento MIME Multipart/Related (MHTML nativo que Word abre con imágenes intactas)
    const boundary = '----=_NextPart_01D9_BWD_OFFICE';
    const mhtmlPayload = [
      'MIME-Version: 1.0',
      `Content-Type: multipart/related; boundary="${boundary}"; type="text/html"`,
      '',
      `--${boundary}`,
      'Content-Type: text/html; charset="utf-8"',
      'Content-Location: http://document/page.html',
      '',
      wordHtmlContent,
      '',
      `--${boundary}`,
      'Content-Type: image/png',
      'Content-Transfer-Encoding: base64',
      'Content-Location: snapshot_cover.png',
      '',
      chunkedBase64,
      '',
      `--${boundary}--`
    ].join('\r\n');

    const blob = new Blob([mhtmlPayload], { type: 'application/msword;charset=utf-8' });
    const filename = sanitizeFilename(extracted.title, 'doc');

    await triggerDownload(blob, filename);

    setProgress(100, `¡Documento Word guardado con diseño fiel! (${filename})`, 'success');
    setBusy(false);

  } catch (err) {
    console.error("Error al exportar Word:", err);
    setProgress(0, `Error: ${formatErrorMessage(err)}`, 'error');
    setBusy(false);
  }
});

// ----------------------------------------------------------------------------
// 5. Captura Completa HD (Patrón GoFullPage: Compositor Real sin Fallos de CORS)
// ----------------------------------------------------------------------------

btnPngFull.addEventListener('click', async () => {
  try {
    setBusy(true);
    setProgress(15, "Iniciando captura continua HD...", 'busy');

    const clean = cleanDomCheckbox.checked;
    const expand = expandScrollCheckbox.checked;
    const tab = await getActiveTab();

    const { canvas, metrics } = await captureFullPageCanvas({
      clean,
      expand,
      onProgress: (pct, msg) => setProgress(pct, msg, 'busy')
    });

    setProgress(90, "Generando archivo PNG en alta resolución...", 'busy');
    const finalDataUrl = canvas.toDataURL('image/png');
    const filename = sanitizeFilename(metrics.title || tab.title, 'png');
    await triggerDownload(finalDataUrl, filename);

    setProgress(100, `¡Captura PNG HD guardada con éxito! (${filename})`, 'success');
    setBusy(false);

  } catch (err) {
    console.error("Error en captura PNG:", err);
    setProgress(0, `Error: ${formatErrorMessage(err)}`, 'error');
    setBusy(false);
  }
});

// ----------------------------------------------------------------------------
// 6. Tooltips e Inicialización
// ----------------------------------------------------------------------------

function initTooltips() {
  const elements = document.querySelectorAll('[data-tooltip]');
  elements.forEach(el => {
    let tooltipEl = null;

    el.addEventListener('mouseenter', () => {
      const text = el.getAttribute('data-tooltip');
      if (!text) return;

      tooltipEl = document.createElement('div');
      tooltipEl.className = 'imp-tooltip';
      tooltipEl.textContent = text;
      tooltipEl.style.opacity = '0';
      document.body.appendChild(tooltipEl);

      const rect = el.getBoundingClientRect();
      const tooltipRect = tooltipEl.getBoundingClientRect();

      let top = rect.top - tooltipRect.height - 6;
      let left = rect.left + (rect.width / 2) - (tooltipRect.width / 2);

      if (left < 6) left = 6;
      if (left + tooltipRect.width > window.innerWidth - 6) {
        left = window.innerWidth - tooltipRect.width - 6;
      }
      if (top < 6) {
        top = rect.bottom + 6;
      }

      tooltipEl.style.top = `${top}px`;
      tooltipEl.style.left = `${left}px`;
      requestAnimationFrame(() => {
        if (tooltipEl) tooltipEl.style.opacity = '1';
      });
    });

    el.addEventListener('mouseleave', () => {
      if (tooltipEl) {
        tooltipEl.remove();
        tooltipEl = null;
      }
    });
  });
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

      // 1. Activar de inmediato todos los IntersectionObserver y scripts lazy de la página original
      await executeInPage(async () => {
        const totalH = Math.min(document.body ? document.body.scrollHeight : 0, 12000);
        const step = window.innerHeight || 800;
        for (let y = 0; y < totalH; y += step) {
          window.scrollTo(0, y);
          await new Promise(r => setTimeout(r, 40));
        }
        window.scrollTo(0, 0);
      });

      setProgress(40, "Extrayendo diseño e imágenes originales...", 'busy');

      const cloneData = await executeInPage(() => {
        try {
          // Desenrollar <picture> para que html2canvas y el DOM estándar lo muestren sin fallos
          document.querySelectorAll('picture').forEach(pic => {
            const img = pic.querySelector('img');
            if (img) {
              const sources = Array.from(pic.querySelectorAll('source'));
              for (const s of sources) {
                const srcset = s.getAttribute('srcset') || s.getAttribute('data-srcset');
                if (srcset) {
                  const parts = srcset.trim().split(/\s*,\s*|\s+/);
                  const best = parts[0];
                  if (best && !best.includes('svg') && !best.includes('placeholder')) {
                    img.setAttribute('src', best);
                    img.src = best;
                    break;
                  }
                }
              }
              pic.replaceWith(img);
            }
          });

          // Resolver todas las imágenes lazy y placeholders en el DOM real
          document.querySelectorAll('img').forEach(img => {
            let realSrc = '';
            const candidates = [
              img.getAttribute('data-src'),
              img.getAttribute('data-original'),
              img.getAttribute('data-lazy-src'),
              img.getAttribute('data-url'),
              img.getAttribute('data-retina'),
              img.currentSrc,
              img.getAttribute('src')
            ];

            for (const c of candidates) {
              if (c && typeof c === 'string' && !c.includes('data:image/svg') && !c.includes('placeholder')) {
                realSrc = c;
                break;
              }
            }

            if (realSrc) {
              try {
                const absUrl = new URL(realSrc, document.baseURI || window.location.href).href;
                img.setAttribute('src', absUrl);
                img.src = absUrl;
              } catch (_) {
                img.setAttribute('src', realSrc);
              }
            }

            // Si la imagen ya está completamente cargada y es mismo origen, convertir a dataURL local
            if (img.complete && img.naturalWidth > 0 && img.naturalHeight > 0) {
              try {
                const canvas = document.createElement('canvas');
                canvas.width = img.naturalWidth;
                canvas.height = img.naturalHeight;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);
                const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
                if (dataUrl && dataUrl.startsWith('data:image/jpeg')) {
                  img.setAttribute('src', dataUrl);
                  img.src = dataUrl;
                }
              } catch (_) {
                // Si está restringida por CORS, permanece la URL absoluta para el inliner del editor
              }
            }

            img.removeAttribute('data-src');
            img.removeAttribute('data-original');
            img.removeAttribute('data-lazy-src');
            img.removeAttribute('data-srcset');
            img.removeAttribute('data-url');
            img.removeAttribute('srcset');
            img.removeAttribute('loading');
            img.setAttribute('loading', 'eager');
          });
        } catch (_) {}

        return {
          html: document.documentElement.outerHTML,
          title: document.title || 'Página Web',
          url: window.location.href,
          baseURI: document.baseURI || window.location.href,
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight
        };
      });

      if (!cloneData || !cloneData.html) {
        throw new Error("No se pudo extraer el HTML de la página activa.");
      }

      setProgress(60, "Guardando clon en almacenamiento local...", 'busy');
      await browser.storage.local.set({ bwd_clone_data: cloneData });

      setProgress(85, "Abriendo Modo Creador Inteligente...", 'busy');
      await browser.tabs.create({
        url: browser.runtime.getURL('editor/editor.html')
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

document.addEventListener('DOMContentLoaded', () => {
  initTabDetection();
  initTooltips();
  initTabs();
  initEditorLauncher();
});

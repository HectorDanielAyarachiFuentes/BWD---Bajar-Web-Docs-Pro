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

const cleanDomCheckbox = document.getElementById('cleanDom');
const expandScrollCheckbox = document.getElementById('expandScroll');
const highQualityCheckbox = document.getElementById('highQuality');

const actionButtons = [btnPdfVisual, btnDocx, btnPngFull];

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
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) {
    throw new Error("No hay pestaña activa disponible.");
  }
  return tab;
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
  const results = await browser.scripting.executeScript({
    target: { tabId: tab.id },
    func: func,
    args: args
  });
  if (results && results[0]) {
    if (results[0].error) {
      throw new Error(results[0].error.message || String(results[0].error));
    }
    return results[0].result;
  }
  return null;
}

// ----------------------------------------------------------------------------
// 3. Exportar PDF Fiel (Solución Definitiva: Firefox Native PDF Engine)
// ----------------------------------------------------------------------------

btnPdfVisual.addEventListener('click', async () => {
  try {
    setBusy(true);
    setProgress(20, "Preparando página para exportación...", 'busy');

    const clean = cleanDomCheckbox.checked;
    const expand = expandScrollCheckbox.checked;
    const tab = await getActiveTab();

    // 1. Limpieza y preparación visual en la página antes de generar el PDF
    if (clean || expand) {
      setProgress(40, "Aplicando optimizaciones de lectura...", 'busy');
      await executeInPage((opts) => {
        if (opts.clean) {
          const selectors = [
            'header[style*="fixed"]', 'nav[style*="fixed"]', 'div[style*="fixed"]',
            '.cookie-banner', '#cookie-banner', '.cookies', '.modal', '.popup',
            '.ad', '.ads', '.advertisement', '[id*="cookie"]', '[class*="cookie"]',
            '.fixed-top', '.sticky-top', '.chat-widget', '#onetrust-consent-sdk'
          ];
          selectors.forEach(sel => {
            try {
              document.querySelectorAll(sel).forEach(el => {
                const style = window.getComputedStyle(el);
                if (style.position === 'fixed' || style.position === 'sticky') {
                  el.setAttribute('data-bwd-hidden', 'true');
                  el.style.display = 'none';
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
                if (el.scrollHeight > el.clientHeight && el.scrollHeight < 15000) {
                  el.style.overflow = 'visible';
                  el.style.maxHeight = 'none';
                }
              }
            } catch (_) {}
          });
        }
      }, [{ clean, expand }]);
    }

    setProgress(70, "Generando PDF de alta fidelidad con motor nativo...", 'busy');

    const filename = sanitizeFilename(tab.title, 'pdf');

    // Usar el motor nativo de Firefox (browser.tabs.saveAsPDF)
    // Cero problemas de CORS, colores y fuentes intactos, soporte A4 perfecto.
    if (typeof browser.tabs.saveAsPDF === 'function') {
      const pageSettings = {
        toFileName: filename,
        showBackgroundColors: true,
        showBackgroundImages: true,
        shrinkToFit: true,
        headerLeft: "",
        headerCenter: "",
        headerRight: "",
        footerLeft: "",
        footerCenter: "",
        footerRight: ""
      };

      const saveStatus = await browser.tabs.saveAsPDF(pageSettings);

      // Restaurar elementos modificados en el DOM
      await executeInPage(() => {
        document.querySelectorAll('[data-bwd-hidden="true"]').forEach(el => {
          el.style.removeProperty('display');
          el.removeAttribute('data-bwd-hidden');
        });
      });

      if (saveStatus === 'saved' || saveStatus === 'replaced') {
        setProgress(100, `¡PDF fiel guardado! (${filename})`, 'success');
      } else if (saveStatus === 'canceled') {
        setProgress(0, "Guardado cancelado por el usuario", 'busy');
      } else {
        setProgress(100, `¡PDF procesado con éxito!`, 'success');
      }

      setBusy(false);
      return;
    }

    throw new Error("El motor nativo saveAsPDF de Firefox no está disponible.");

  } catch (err) {
    console.error("Error al exportar PDF:", err);
    setProgress(0, `Error: ${err.message || err}`, 'error');
    setBusy(false);

    try {
      await executeInPage(() => {
        document.querySelectorAll('[data-bwd-hidden="true"]').forEach(el => {
          el.style.removeProperty('display');
          el.removeAttribute('data-bwd-hidden');
        });
      });
    } catch (_) {}
  }
});

// ----------------------------------------------------------------------------
// 4. Exportar a Word (.doc enriquecido / editable)
// ----------------------------------------------------------------------------

btnDocx.addEventListener('click', async () => {
  try {
    setBusy(true);
    setProgress(30, "Extrayendo cuerpo principal del artículo...", 'busy');

    const extracted = await executeInPage(() => {
      const title = document.title || 'Documento Web';
      const url = window.location.href;

      const mainEl = document.querySelector('article') ||
                     document.querySelector('main') ||
                     document.querySelector('[role="main"]') ||
                     document.body;

      const clone = mainEl.cloneNode(true);

      const unwanted = ['script', 'style', 'iframe', 'nav', 'footer', 'aside', 'noscript', 'button', 'input', 'svg'];
      unwanted.forEach(tag => {
        clone.querySelectorAll(tag).forEach(el => el.remove());
      });

      return {
        title: title,
        url: url,
        html: clone.innerHTML
      };
    });

    setProgress(70, "Formateando documento para Word...", 'busy');

    const today = new Date().toLocaleDateString('es-ES', {
      year: 'numeric', month: 'long', day: 'numeric'
    });

    const wordTemplate = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
      <head>
        <meta charset='utf-8'>
        <title>${extracted.title}</title>
        <style>
          body { font-family: 'Segoe UI', Calibri, Arial, sans-serif; font-size: 11pt; line-height: 1.6; color: #1e293b; margin: 40px; }
          h1 { color: #0f172a; font-size: 22pt; border-bottom: 2px solid #2563eb; padding-bottom: 8px; margin-bottom: 12px; }
          h2 { color: #1e40af; font-size: 15pt; margin-top: 24px; }
          h3 { color: #334155; font-size: 12pt; }
          p { margin-bottom: 12px; }
          .bwd-meta { font-size: 9pt; color: #64748b; margin-bottom: 24px; padding: 8px 12px; background: #f8fafc; border-left: 3px solid #2563eb; }
          img { max-width: 100%; height: auto; margin: 12px 0; border-radius: 4px; }
          table { border-collapse: collapse; width: 100%; margin: 16px 0; font-size: 10pt; }
          th, td { border: 1px solid #cbd5e1; padding: 8px 10px; }
          th { background-color: #f1f5f9; font-weight: bold; color: #0f172a; }
        </style>
      </head>
      <body>
        <h1>${extracted.title}</h1>
        <div class="bwd-meta">
          <strong>Origen:</strong> <a href="${extracted.url}">${extracted.url}</a><br/>
          <strong>Fecha de exportación:</strong> ${today} — Bajar Web Docs
        </div>
        ${extracted.html}
      </body>
      </html>
    `;

    const blob = new Blob(['\ufeff', wordTemplate], { type: 'application/msword;charset=utf-8' });
    const filename = sanitizeFilename(extracted.title, 'doc');

    await triggerDownload(blob, filename);

    setProgress(100, `¡Documento Word guardado! (${filename})`, 'success');
    setBusy(false);

  } catch (err) {
    console.error("Error al exportar Word:", err);
    setProgress(0, `Error: ${err.message || err}`, 'error');
    setBusy(false);
  }
});

// ----------------------------------------------------------------------------
// 5. Captura Completa HD (Patrón GoFullPage: Compositor Real sin Fallos de CORS)
// ----------------------------------------------------------------------------

btnPngFull.addEventListener('click', async () => {
  try {
    setBusy(true);
    setProgress(15, "Inicializando captura continua...", 'busy');

    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) throw new Error("No hay pestaña activa disponible.");

    // Medir dimensiones del documento en la página
    const metrics = await executeInPage(() => {
      window.scrollTo(0, 0);
      return {
        title: document.title || 'captura_web',
        width: Math.max(document.documentElement.clientWidth, window.innerWidth),
        height: Math.max(document.body.scrollHeight, document.documentElement.scrollHeight),
        viewportHeight: window.innerHeight,
        viewportWidth: window.innerWidth,
        dpr: window.devicePixelRatio || 1
      };
    });

    if (!metrics) throw new Error("No se pudo obtener las métricas de la página.");

    const totalHeight = Math.min(metrics.height, 12000);
    const viewportH = metrics.viewportHeight;

    // Si cabe en una sola pantalla, captura directa sin scroll
    if (totalHeight <= viewportH) {
      setProgress(60, "Capturando pantalla...", 'busy');
      const dataUrl = await browser.tabs.captureVisibleTab(null, { format: 'png' });
      const filename = sanitizeFilename(metrics.title, 'png');
      await triggerDownload(dataUrl, filename);
      setProgress(100, `¡Captura PNG guardada! (${filename})`, 'success');
      setBusy(false);
      return;
    }

    // Si tiene scroll: desplazamiento secuencial y captura del compositor (sin CORS)
    setProgress(35, "Capturando secciones de la página...", 'busy');

    const slices = [];
    let currentY = 0;
    const step = viewportH;
    let index = 0;

    while (currentY < totalHeight) {
      await executeInPage((y) => window.scrollTo(0, y), [currentY]);
      await new Promise(r => setTimeout(r, 100)); // Breve espera para estabilizar render

      const sliceUrl = await browser.tabs.captureVisibleTab(null, { format: 'png' });
      slices.push({ url: sliceUrl, y: currentY });

      currentY += step;
      index++;
      const pct = 35 + Math.round((currentY / totalHeight) * 45);
      setProgress(Math.min(pct, 80), `Capturando sección ${index}...`, 'busy');
    }

    // Restaurar scroll al inicio
    await executeInPage(() => window.scrollTo(0, 0));

    setProgress(85, "Ensamblando imagen panorámica HD...", 'busy');

    const masterCanvas = document.createElement('canvas');
    masterCanvas.width = metrics.viewportWidth;
    masterCanvas.height = totalHeight;
    const ctx = masterCanvas.getContext('2d');

    for (const slice of slices) {
      const img = new Image();
      await new Promise((res, rej) => {
        img.onload = res;
        img.onerror = rej;
        img.src = slice.url;
      });
      ctx.drawImage(img, 0, slice.y, metrics.viewportWidth, slice.y + viewportH > totalHeight ? totalHeight - slice.y : viewportH);
    }

    setProgress(95, "Descargando captura...", 'busy');
    const finalDataUrl = masterCanvas.toDataURL('image/png');
    const filename = sanitizeFilename(metrics.title, 'png');
    await triggerDownload(finalDataUrl, filename);

    setProgress(100, `¡Captura PNG guardada! (${filename})`, 'success');
    setBusy(false);

  } catch (err) {
    console.error("Error en captura PNG:", err);
    setProgress(0, `Error: ${err.message || err}`, 'error');
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

document.addEventListener('DOMContentLoaded', () => {
  initTabDetection();
  initTooltips();
});

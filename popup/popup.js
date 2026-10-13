/**
 * ============================================================================
 * BWD — Executive & Enterprise Edition Controller
 * High reliability, zero-hang capture engine, and native download pipeline.
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
// 1. Estado y Barra de Progreso
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

// ----------------------------------------------------------------------------
// 2. Descargas Confiables (WebExtension Downloads API)
// ----------------------------------------------------------------------------

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
    console.warn("browser.downloads.download no disponible o denegado, usando fallback:", err);
  }

  // Fallback para entornos donde downloads API no responde
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

// Sanitizar nombres de archivo
function sanitizeFilename(title, ext) {
  const clean = (title || 'documento_web')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, '_')
    .substring(0, 50);
  return `${clean}_${Date.now().toString().slice(-4)}.${ext}`;
}

// ----------------------------------------------------------------------------
// 3. Tab Intelligence
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
        tabHostEl.textContent = 'Página del sistema (restringida)';
        statusTextEl.textContent = 'Las páginas internas del navegador no permiten captura';
      } else {
        tabHostEl.textContent = urlObj.hostname || tab.title || 'Página web activa';
      }
    }
  } catch (e) {
    tabHostEl.textContent = 'Pestaña activa';
  }
}

async function ensureLibInjected(tabId) {
  try {
    await browser.scripting.executeScript({
      target: { tabId: tabId },
      files: ['libs/html2canvas.min.js']
    });
  } catch (err) {
    console.warn("Aviso al inyectar html2canvas:", err);
  }
}

async function executeInPage(func, args = []) {
  const tab = await getActiveTab();
  const results = await browser.scripting.executeScript({
    target: { tabId: tab.id },
    func: func,
    args: args
  });
  return results[0]?.result;
}

// ----------------------------------------------------------------------------
// 4. Captura y Exportación a PDF Fiel (Sin cuelgues, A4 exacto)
// ----------------------------------------------------------------------------

btnPdfVisual.addEventListener('click', async () => {
  try {
    setBusy(true);
    setProgress(15, "Preparando y limpiando elementos...", 'busy');

    const clean = cleanDomCheckbox.checked;
    const expand = expandScrollCheckbox.checked;
    const scale = highQualityCheckbox.checked ? 2 : 1;
    const tab = await getActiveTab();

    // Inyectar librería gráfica en la página
    setProgress(30, "Inyectando motor gráfico...", 'busy');
    await ensureLibInjected(tab.id);

    setProgress(50, "Renderizando lienzo y procesando páginas A4...", 'busy');

    // Ejecutar captura y segmentación exacta de páginas A4 en la pestaña
    const pageResult = await executeInPage(async (opts) => {
      // 1. Limpieza opcional de elementos molestos
      if (opts.clean) {
        const selectors = [
          'header[style*="fixed"]', 'nav[style*="fixed"]', 'div[style*="fixed"]',
          '.cookie-banner', '#cookie-banner', '.cookies', '.modal', '.popup',
          '.ad', '.ads', '.advertisement', '[id*="cookie"]', '[class*="cookie"]',
          '.fixed-top', '.sticky-top', '.chat-widget', '#onetrust-consent-sdk',
          '[aria-label*="cookie" i]'
        ];
        selectors.forEach(sel => {
          document.querySelectorAll(sel).forEach(el => {
            const style = window.getComputedStyle(el);
            if (style.position === 'fixed' || style.position === 'sticky') {
              el.setAttribute('data-bwd-hidden', 'true');
              el.style.display = 'none';
            }
          });
        });
      }

      // 2. Expansión segura de contenedores (con límite superior para evitar bucles de scroll infinito)
      if (opts.expand) {
        document.querySelectorAll('*').forEach(el => {
          const s = window.getComputedStyle(el);
          if (s.overflowY === 'scroll' || s.overflowY === 'auto') {
            if (el.scrollHeight > el.clientHeight && el.scrollHeight < 15000) {
              el.style.overflow = 'visible';
              el.style.maxHeight = 'none';
            }
          }
        });
      }

      window.scrollTo(0, 0);

      if (typeof window.html2canvas !== 'function') {
        throw new Error("html2canvas no está disponible en la página.");
      }

      // Límite de seguridad de altura para páginas infinitas (ej. Instagram)
      const scrollH = Math.min(
        Math.max(document.body.scrollHeight, document.documentElement.scrollHeight),
        25000
      );
      const scrollW = Math.max(document.body.scrollWidth, document.documentElement.scrollWidth);

      const canvas = await window.html2canvas(document.body, {
        scale: opts.scale,
        useCORS: true,
        logging: false,
        allowTaint: true,
        windowWidth: scrollW,
        windowHeight: scrollH
      });

      // 3. Segmentación matemática exacta en páginas A4
      // Ratio A4 = 297mm alto / 210mm ancho = 1.4142857
      const a4Ratio = 297 / 210;
      const pageCanvasHeight = Math.floor(canvas.width * a4Ratio);
      const totalPages = Math.min(Math.max(Math.ceil(canvas.height / pageCanvasHeight), 1), 30);
      const pageSlices = [];

      for (let i = 0; i < totalPages; i++) {
        const sliceCanvas = document.createElement('canvas');
        sliceCanvas.width = canvas.width;
        sliceCanvas.height = pageCanvasHeight;
        const ctx = sliceCanvas.getContext('2d');

        // Fondo blanco de hoja de papel
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);

        const sourceY = i * pageCanvasHeight;
        const sourceHeight = Math.min(pageCanvasHeight, canvas.height - sourceY);

        if (sourceHeight > 0) {
          ctx.drawImage(
            canvas,
            0, sourceY, canvas.width, sourceHeight,
            0, 0, canvas.width, sourceHeight
          );
        }

        pageSlices.push(sliceCanvas.toDataURL('image/jpeg', 0.88));
      }

      // Restaurar elementos ocultos
      document.querySelectorAll('[data-bwd-hidden="true"]').forEach(el => {
        el.style.removeProperty('display');
        el.removeAttribute('data-bwd-hidden');
      });

      return {
        title: document.title || 'documento_web',
        totalPages: totalPages,
        pages: pageSlices
      };
    }, [{ clean, expand, scale }]);

    if (!pageResult || !pageResult.pages || pageResult.pages.length === 0) {
      throw new Error("No se pudo obtener el renderizado de la página.");
    }

    setProgress(75, `Ensamblando ${pageResult.totalPages} página(s) en PDF...`, 'busy');

    // 4. Ensamblado directo con jsPDF (sin callbacks ni bucles pesados)
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({
      orientation: 'p',
      unit: 'mm',
      format: 'a4',
      compress: true
    });

    for (let i = 0; i < pageResult.pages.length; i++) {
      if (i > 0) {
        doc.addPage('a4', 'p');
      }
      doc.addImage(pageResult.pages[i], 'JPEG', 0, 0, 210, 297, undefined, 'FAST');
      const pct = 75 + Math.round(((i + 1) / pageResult.pages.length) * 20);
      setProgress(pct, `Compaginando página ${i + 1} de ${pageResult.pages.length}...`, 'busy');
    }

    setProgress(96, "Generando descarga del archivo...", 'busy');

    const pdfBlob = doc.output('blob');
    const filename = sanitizeFilename(pageResult.title, 'pdf');
    await triggerDownload(pdfBlob, filename);

    setProgress(100, `¡PDF fiel guardado! (${pageResult.totalPages} pág.)`, 'success');
    setBusy(false);

  } catch (err) {
    console.error("Error al exportar PDF:", err);
    setProgress(0, `Error: ${err.message || err}`, 'error');
    setBusy(false);
  }
});

// ----------------------------------------------------------------------------
// 5. Exportar a Word (.doc enriquecido / editable)
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

    setProgress(70, "Generando formato Word enriquecido...", 'busy');

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
// 6. Captura Completa PNG Retina
// ----------------------------------------------------------------------------

btnPngFull.addEventListener('click', async () => {
  try {
    setBusy(true);
    setProgress(20, "Preparando captura continua...", 'busy');

    const scale = highQualityCheckbox.checked ? 2 : 1;
    const tab = await getActiveTab();

    await ensureLibInjected(tab.id);

    setProgress(50, "Renderizando screenshot de página completa...", 'busy');

    const captureData = await executeInPage(async (renderScale) => {
      window.scrollTo(0, 0);
      if (typeof window.html2canvas !== 'function') {
        throw new Error("html2canvas no está cargado.");
      }

      const scrollH = Math.min(
        Math.max(document.body.scrollHeight, document.documentElement.scrollHeight),
        25000
      );
      const scrollW = Math.max(document.body.scrollWidth, document.documentElement.scrollWidth);

      const canvas = await window.html2canvas(document.body, {
        scale: renderScale,
        useCORS: true,
        logging: false,
        allowTaint: true,
        windowWidth: scrollW,
        windowHeight: scrollH
      });

      return {
        title: document.title || 'captura_web',
        dataUrl: canvas.toDataURL('image/png')
      };
    }, [scale]);

    setProgress(85, "Descargando imagen PNG...", 'busy');

    const filename = sanitizeFilename(captureData.title, 'png');
    await triggerDownload(captureData.dataUrl, filename);

    setProgress(100, `¡Captura PNG guardada! (${filename})`, 'success');
    setBusy(false);

  } catch (err) {
    console.error("Error al exportar PNG:", err);
    setProgress(0, `Error: ${err.message || err}`, 'error');
    setBusy(false);
  }
});

// ----------------------------------------------------------------------------
// 7. Tooltips e Inicialización
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

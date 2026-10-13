/**
 * ============================================================================
 * BWD — Executive & Enterprise Edition Controller
 * High-performance, bulletproof in-tab capture engine.
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
// 2. Descargas Confiables
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
    console.warn("browser.downloads.download no disponible, usando fallback:", err);
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

function sanitizeFilename(title, ext) {
  const clean = (title || 'documento_web')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, '_')
    .substring(0, 50);
  return `${clean}_${Date.now().toString().slice(-4)}.${ext}`;
}

// ----------------------------------------------------------------------------
// 3. Tab Intelligence & Inyección de Scripts
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

async function ensureLibsInjected(tabId) {
  try {
    await browser.scripting.executeScript({
      target: { tabId: tabId },
      files: ['libs/html2canvas.min.js', 'libs/jspdf.umd.min.js']
    });
  } catch (err) {
    console.warn("Aviso al inyectar librerías:", err);
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
// 4. Captura y Exportación a PDF Fiel (In-Tab Engine A4)
// ----------------------------------------------------------------------------

btnPdfVisual.addEventListener('click', async () => {
  try {
    setBusy(true);
    setProgress(15, "Preparando y limpiando elementos...", 'busy');

    const clean = cleanDomCheckbox.checked;
    const expand = expandScrollCheckbox.checked;
    const scale = highQualityCheckbox.checked ? 1.5 : 1;
    const tab = await getActiveTab();

    setProgress(30, "Inyectando motor gráfico...", 'busy');
    await ensureLibsInjected(tab.id);

    setProgress(55, "Renderizando lienzo y estructurando páginas A4...", 'busy');

    // Ejecución in-page protegida y optimizada
    const pageResult = await executeInPage(async (opts) => {
      try {
        // 1. Limpieza de banners y modales
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

        // 2. Expansión de scroll interno
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

        window.scrollTo(0, 0);

        const html2canvasFn = window.html2canvas || globalThis.html2canvas;
        if (typeof html2canvasFn !== 'function') {
          return { success: false, error: "Motor gráfico html2canvas no disponible en la página." };
        }

        const jsPDFClass = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF;
        if (!jsPDFClass) {
          return { success: false, error: "Motor PDF jsPDF no disponible en la página." };
        }

        const scrollH = Math.min(
          Math.max(document.body.scrollHeight, document.documentElement.scrollHeight),
          20000
        );
        const scrollW = Math.max(document.body.scrollWidth, document.documentElement.scrollWidth);

        // Renderizar a Canvas sin contaminar (allowTaint: false)
        const canvas = await html2canvasFn(document.body, {
          scale: opts.scale,
          useCORS: true,
          allowTaint: false,
          logging: false,
          scrollX: 0,
          scrollY: 0,
          windowWidth: scrollW,
          windowHeight: Math.min(scrollH, 12000),
          ignoreElements: (el) => {
            return el.tagName === 'IFRAME' || el.tagName === 'SCRIPT' || el.tagName === 'NOSCRIPT';
          }
        });

        if (!canvas || canvas.width === 0 || canvas.height === 0) {
          return { success: false, error: "El lienzo generado está vacío." };
        }

        // Segmentación exacta A4 (297 / 210 = 1.414)
        const a4Ratio = 297 / 210;
        const pageCanvasHeight = Math.floor(canvas.width * a4Ratio);
        const totalPages = Math.min(Math.max(Math.ceil(canvas.height / pageCanvasHeight), 1), 25);

        const doc = new jsPDFClass({
          orientation: 'p',
          unit: 'mm',
          format: 'a4',
          compress: true
        });

        for (let i = 0; i < totalPages; i++) {
          if (i > 0) doc.addPage('a4', 'p');

          const sliceCanvas = document.createElement('canvas');
          sliceCanvas.width = canvas.width;
          sliceCanvas.height = pageCanvasHeight;
          const ctx = sliceCanvas.getContext('2d');

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

          const sliceData = sliceCanvas.toDataURL('image/jpeg', 0.88);
          doc.addImage(sliceData, 'JPEG', 0, 0, 210, 297, undefined, 'FAST');
        }

        // Restaurar elementos ocultos
        document.querySelectorAll('[data-bwd-hidden="true"]').forEach(el => {
          el.style.removeProperty('display');
          el.removeAttribute('data-bwd-hidden');
        });

        const pdfBlob = doc.output('blob');
        const blobUrl = URL.createObjectURL(pdfBlob);

        const safeTitle = (document.title || 'documento_web')
          .replace(/[\\/:*?"<>|]/g, '_')
          .replace(/\s+/g, '_')
          .substring(0, 50);
        const filename = `${safeTitle}_${Date.now().toString().slice(-4)}.pdf`;

        // Disparar descarga directa en la página
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();

        return {
          success: true,
          title: document.title || 'documento_web',
          filename: filename,
          blobUrl: blobUrl,
          totalPages: totalPages
        };

      } catch (innerErr) {
        return {
          success: false,
          error: innerErr.message || String(innerErr)
        };
      }
    }, [{ clean, expand, scale }]);

    if (!pageResult) {
      throw new Error("No se recibió respuesta del script inyectado en la página.");
    }

    if (!pageResult.success) {
      throw new Error(pageResult.error || "No se pudo obtener el renderizado de la página.");
    }

    setProgress(90, "Descargando documento PDF...", 'busy');
    await triggerDownload(pageResult.blobUrl, pageResult.filename);

    setProgress(100, `¡PDF fiel descargado! (${pageResult.totalPages} pág.)`, 'success');
    setBusy(false);

  } catch (err) {
    console.error("Error al exportar PDF:", err);
    setProgress(0, `Error: ${err.message || err}`, 'error');
    setBusy(false);
  }
});

// ----------------------------------------------------------------------------
// 5. Exportar a Word (.doc)
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
// 6. Captura Completa PNG
// ----------------------------------------------------------------------------

btnPngFull.addEventListener('click', async () => {
  try {
    setBusy(true);
    setProgress(20, "Preparando captura continua...", 'busy');

    const scale = highQualityCheckbox.checked ? 1.5 : 1;
    const tab = await getActiveTab();

    await ensureLibsInjected(tab.id);

    setProgress(50, "Renderizando screenshot de página completa...", 'busy');

    const captureResult = await executeInPage(async (opts) => {
      try {
        window.scrollTo(0, 0);
        const html2canvasFn = window.html2canvas || globalThis.html2canvas;
        if (typeof html2canvasFn !== 'function') {
          return { success: false, error: "html2canvas no está cargado." };
        }

        const scrollH = Math.min(
          Math.max(document.body.scrollHeight, document.documentElement.scrollHeight),
          20000
        );
        const scrollW = Math.max(document.body.scrollWidth, document.documentElement.scrollWidth);

        const canvas = await html2canvasFn(document.body, {
          scale: opts.scale,
          useCORS: true,
          allowTaint: false,
          logging: false,
          windowWidth: scrollW,
          windowHeight: Math.min(scrollH, 12000),
          ignoreElements: (el) => {
            return el.tagName === 'IFRAME' || el.tagName === 'SCRIPT' || el.tagName === 'NOSCRIPT';
          }
        });

        return new Promise((resolve) => {
          canvas.toBlob((blob) => {
            if (!blob) {
              resolve({ success: false, error: "No se pudo generar la imagen del lienzo." });
              return;
            }
            const blobUrl = URL.createObjectURL(blob);
            const safeTitle = (document.title || 'captura_web')
              .replace(/[\\/:*?"<>|]/g, '_')
              .replace(/\s+/g, '_')
              .substring(0, 50);
            const filename = `${safeTitle}_${Date.now().toString().slice(-4)}.png`;

            // Descarga directa en la página
            const a = document.createElement('a');
            a.href = blobUrl;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            a.remove();

            resolve({
              success: true,
              filename: filename,
              blobUrl: blobUrl
            });
          }, 'image/png');
        });

      } catch (err) {
        return { success: false, error: err.message || String(err) };
      }
    }, [{ scale }]);

    if (!captureResult) {
      throw new Error("No se recibió respuesta de captura de la página.");
    }

    if (!captureResult.success) {
      throw new Error(captureResult.error || "Error al capturar la imagen.");
    }

    setProgress(90, "Descargando imagen PNG...", 'busy');
    await triggerDownload(captureResult.blobUrl, captureResult.filename);

    setProgress(100, `¡Captura PNG guardada! (${captureResult.filename})`, 'success');
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

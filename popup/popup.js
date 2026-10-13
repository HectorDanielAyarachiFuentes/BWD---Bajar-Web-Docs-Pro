/**
 * ============================================================================
 * BWD PRO — Controller & Capture Engine
 * Enhanced with Frontend Embellecedor Suite:
 * - UI Pro Max (Spotlight cursor tracking & dynamic glow)
 * - Impeccable UI (Precision tooltips & states)
 * - Skill-UL (Real-time animated progress bars & counter springs)
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

const actionCards = [btnPdfVisual, btnDocx, btnPngFull];

// ----------------------------------------------------------------------------
// 1. UI Micro-Engines (Frontend Embellecedor)
// ----------------------------------------------------------------------------

/** UI Pro Max — Spotlight Cursor Tracking */
function initSpotlight() {
  const cards = document.querySelectorAll('.pro-spotlight-card, .action-card, .config-panel');
  cards.forEach(card => {
    card.addEventListener('mousemove', (e) => {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      card.style.setProperty('--mouse-x', `${x}px`);
      card.style.setProperty('--mouse-y', `${y}px`);
    });

    card.addEventListener('mouseleave', () => {
      card.style.removeProperty('--mouse-x');
      card.style.removeProperty('--mouse-y');
    });
  });
}

/** Impeccable UI — Viewport-Safe Precision Tooltips */
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
      tooltipEl.style.position = 'fixed';
      tooltipEl.style.zIndex = '9999';
      tooltipEl.style.pointerEvents = 'none';
      document.body.appendChild(tooltipEl);

      const rect = el.getBoundingClientRect();
      const tooltipRect = tooltipEl.getBoundingClientRect();

      let top = rect.top - tooltipRect.height - 8;
      let left = rect.left + (rect.width / 2) - (tooltipRect.width / 2);

      // Boundary safety check
      if (left < 8) left = 8;
      if (left + tooltipRect.width > window.innerWidth - 8) {
        left = window.innerWidth - tooltipRect.width - 8;
      }
      if (top < 8) {
        top = rect.bottom + 8; // Flip to bottom
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
// 2. Estado y Barra de Progreso Fluida (Skill-UL)
// ----------------------------------------------------------------------------

function setProgress(percent, label, state = 'busy') {
  progressSection.style.display = 'block';
  progressBar.style.width = `${percent}%`;
  progressPercent.textContent = `${percent}%`;
  progressLabel.textContent = label;
  statusTextEl.textContent = label;

  statusEl.className = 'status-indicator';
  if (state === 'busy') {
    statusEl.classList.add('is-busy');
  } else if (state === 'success') {
    statusEl.classList.add('is-success');
    setTimeout(() => {
      progressSection.style.display = 'none';
      progressBar.style.width = '0%';
    }, 4000);
  } else if (state === 'error') {
    statusEl.classList.add('is-error');
  }
}

function setBusy(isBusy) {
  actionCards.forEach(c => {
    if (isBusy) {
      c.classList.add('is-disabled');
      c.disabled = true;
    } else {
      c.classList.remove('is-disabled');
      c.disabled = false;
    }
  });
}

// ----------------------------------------------------------------------------
// 3. Tab Intelligence & Helper Functions
// ----------------------------------------------------------------------------

async function getActiveTab() {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) {
    throw new Error("No hay pestaña activa disponible.");
  }
  return tab;
}

// Sanitizar nombre de archivo
function sanitizeFilename(title, ext) {
  const clean = (title || 'documento_web')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, '_')
    .substring(0, 60);
  return `${clean}_${Date.now().toString().slice(-4)}.${ext}`;
}

// Detectar y mostrar pestaña activa al inicio
async function initTabDetection() {
  try {
    const tab = await getActiveTab();
    if (tab.url) {
      const urlObj = new URL(tab.url);
      if (['about:', 'chrome:', 'moz-extension:', 'addons.mozilla.org'].some(p => tab.url.startsWith(p))) {
        tabHostEl.textContent = 'Página interna (restringida)';
        statusTextEl.textContent = 'Aviso: Las páginas del sistema no permiten inyección';
      } else {
        tabHostEl.textContent = urlObj.hostname || tab.title || 'Página web activa';
      }
    }
  } catch (e) {
    tabHostEl.textContent = 'Pestaña activa';
  }
}

/** Inyección segura de librerías y scripts en la pestaña activa */
async function ensureLibInjected(tabId) {
  try {
    await browser.scripting.executeScript({
      target: { tabId: tabId },
      files: ['libs/html2canvas.min.js']
    });
  } catch (err) {
    console.warn("Fallo o advertencia al inyectar html2canvas:", err);
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
// 4. Captura y Exportación a PDF Fiel (Multi-Página A4)
// ----------------------------------------------------------------------------

btnPdfVisual.addEventListener('click', async () => {
  try {
    setBusy(true);
    setProgress(15, "Analizando y limpiando página...", 'busy');

    const clean = cleanDomCheckbox.checked;
    const expand = expandScrollCheckbox.checked;
    const scale = highQualityCheckbox.checked ? 2 : 1;
    const tab = await getActiveTab();

    // 1. Limpieza y preparación del DOM
    const pageData = await executeInPage((opts) => {
      if (opts.clean) {
        const selectors = [
          'header[style*="fixed"]', 'nav[style*="fixed"]', 'div[style*="fixed"]',
          '.cookie-banner', '#cookie-banner', '.cookies', '.modal', '.popup',
          '.ad', '.ads', '.advertisement', '[id*="cookie"]', '[class*="cookie"]',
          '.fixed-top', '.sticky-top', '.chat-widget', '#onetrust-consent-sdk'
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

      if (opts.expand) {
        document.querySelectorAll('*').forEach(el => {
          const s = window.getComputedStyle(el);
          if (s.overflowY === 'scroll' || s.overflowY === 'auto') {
            if (el.scrollHeight > el.clientHeight) {
              el.style.overflow = 'visible';
              el.style.maxHeight = 'none';
            }
          }
        });
      }

      return {
        title: document.title || 'documento_web',
        width: Math.max(document.body.scrollWidth, document.documentElement.scrollWidth),
        height: Math.max(document.body.scrollHeight, document.documentElement.scrollHeight)
      };
    }, [{ clean, expand, scale }]);

    setProgress(40, "Inyectando motor gráfico (html2canvas)...", 'busy');
    await ensureLibInjected(tab.id);

    setProgress(60, "Renderizando lienzo de alta resolución...", 'busy');

    // 2. Renderizado de la página completa
    const dataUrl = await executeInPage(async (renderScale) => {
      window.scrollTo(0, 0);
      if (typeof window.html2canvas !== 'function') {
        throw new Error("html2canvas no se encuentra disponible en la página.");
      }

      const canvas = await window.html2canvas(document.body, {
        scale: renderScale,
        useCORS: true,
        logging: false,
        allowTaint: true,
        windowWidth: document.documentElement.scrollWidth,
        windowHeight: document.documentElement.scrollHeight
      });

      return canvas.toDataURL('image/jpeg', 0.95);
    }, [scale]);

    setProgress(85, "Compaginando documento PDF multipágina...", 'busy');

    // 3. Generación del PDF con jsPDF
    const { jsPDF } = window.jspdf;
    const img = new Image();
    img.src = dataUrl;

    img.onload = () => {
      const imgWidth = 210; // A4 mm
      const pageHeight = 297; // A4 mm
      const imgHeight = (img.height * imgWidth) / img.width;
      let heightLeft = imgHeight;

      const doc = new jsPDF('p', 'mm', 'a4');
      let position = 0;

      doc.addImage(dataUrl, 'JPEG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;

      while (heightLeft > 0) {
        position = heightLeft - imgHeight;
        doc.addPage();
        doc.addImage(dataUrl, 'JPEG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }

      const filename = sanitizeFilename(pageData.title, 'pdf');
      doc.save(filename);

      setProgress(100, `¡PDF fiel descargado con éxito! (${filename})`, 'success');
      setBusy(false);
    };

    img.onerror = () => {
      throw new Error("Error al procesar la imagen generada.");
    };

  } catch (err) {
    console.error(err);
    setProgress(0, `Error: ${err.message || err}`, 'error');
    setBusy(false);
  }
});

// ----------------------------------------------------------------------------
// 5. Exportar a Word (.docx / .doc enriquecido)
// ----------------------------------------------------------------------------

btnDocx.addEventListener('click', async () => {
  try {
    setBusy(true);
    setProgress(30, "Extrayendo cuerpo principal del artículo...", 'busy');

    const extracted = await executeInPage(() => {
      const title = document.title || 'Documento Web';
      const url = window.location.href;
      
      // Buscar cuerpo más relevante
      const mainEl = document.querySelector('article') ||
                     document.querySelector('main') ||
                     document.querySelector('[role="main"]') ||
                     document.body;
      
      const clone = mainEl.cloneNode(true);

      // Eliminar scripts, anuncios, navbars, iframes y elementos no deseados
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

    setProgress(75, "Empaquetando plantilla compatible con Word...", 'busy');

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
          h1 { color: #0f172a; font-size: 24pt; border-bottom: 2px solid #3b82f6; padding-bottom: 8px; margin-bottom: 12px; }
          h2 { color: #1e40af; font-size: 16pt; margin-top: 24px; }
          h3 { color: #334155; font-size: 13pt; }
          p { margin-bottom: 12px; }
          .bwd-meta { font-size: 9pt; color: #64748b; margin-bottom: 24px; padding: 8px 12px; background: #f8fafc; border-left: 3px solid #3b82f6; }
          img { max-width: 100%; height: auto; margin: 12px 0; border-radius: 4px; }
          table { border-collapse: collapse; width: 100%; margin: 16px 0; font-size: 10pt; }
          th, td { border: 1px solid #cbd5e1; padding: 8px 10px; }
          th { background-color: #f1f5f9; font-weight: bold; color: #0f172a; }
          blockquote { border-left: 4px solid #cbd5e1; padding-left: 16px; margin: 16px 0; color: #475569; font-style: italic; }
        </style>
      </head>
      <body>
        <h1>${extracted.title}</h1>
        <div class="bwd-meta">
          <strong>Origen:</strong> <a href="${extracted.url}">${extracted.url}</a><br/>
          <strong>Fecha de exportación:</strong> ${today} — Generado con Bajar-Web-Docs Pro
        </div>
        ${extracted.html}
      </body>
      </html>
    `;

    const blob = new Blob(['\ufeff', wordTemplate], { type: 'application/msword;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const filename = sanitizeFilename(extracted.title, 'doc');

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);

    setProgress(100, `¡Documento Word guardado! (${filename})`, 'success');
    setBusy(false);

  } catch (err) {
    console.error(err);
    setProgress(0, `Error: ${err.message || err}`, 'error');
    setBusy(false);
  }
});

// ----------------------------------------------------------------------------
// 6. Captura Completa PNG Retina (2x)
// ----------------------------------------------------------------------------

btnPngFull.addEventListener('click', async () => {
  try {
    setBusy(true);
    setProgress(20, "Preparando captura de longitud completa...", 'busy');

    const scale = highQualityCheckbox.checked ? 2 : 1;
    const tab = await getActiveTab();

    await ensureLibInjected(tab.id);

    setProgress(60, "Renderizando screenshot de página completa...", 'busy');

    const captureData = await executeInPage(async (renderScale) => {
      window.scrollTo(0, 0);
      if (typeof window.html2canvas !== 'function') {
        throw new Error("html2canvas no está cargado.");
      }

      const canvas = await window.html2canvas(document.body, {
        scale: renderScale,
        useCORS: true,
        logging: false,
        allowTaint: true,
        windowWidth: document.documentElement.scrollWidth,
        windowHeight: document.documentElement.scrollHeight
      });

      return {
        title: document.title || 'captura_web',
        dataUrl: canvas.toDataURL('image/png')
      };
    }, [scale]);

    setProgress(90, "Descargando imagen PNG en alta definición...", 'busy');

    const filename = sanitizeFilename(captureData.title, 'png');
    const a = document.createElement('a');
    a.href = captureData.dataUrl;
    a.download = filename;
    a.click();

    setProgress(100, `¡Captura PNG guardada! (${filename})`, 'success');
    setBusy(false);

  } catch (err) {
    console.error(err);
    setProgress(0, `Error: ${err.message || err}`, 'error');
    setBusy(false);
  }
});

// ----------------------------------------------------------------------------
// 7. Inicialización de Micro-Interacciones
// ----------------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
  initSpotlight();
  initTooltips();
  initTabDetection();
});

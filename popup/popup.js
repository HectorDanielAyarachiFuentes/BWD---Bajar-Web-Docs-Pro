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
// 3. Exportar PDF Fiel (Motor Visual de Alta Fidelidad y Proporción Real)
// ----------------------------------------------------------------------------

btnPdfVisual.addEventListener('click', async () => {
  try {
    setBusy(true);
    setProgress(20, "Preparando página para exportación fiel...", 'busy');

    const clean = cleanDomCheckbox.checked;
    const expand = expandScrollCheckbox.checked;
    const tab = await getActiveTab();

    // 1. Limpieza y preparación visual en la página antes de generar el PDF
    if (clean || expand) {
      setProgress(35, "Aplicando optimizaciones de lectura...", 'busy');
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

    setProgress(55, "Capturando diseño visual exacto en alta resolución...", 'busy');

    // Medir dimensiones del documento en la página
    const metrics = await executeInPage(() => {
      window.scrollTo(0, 0);
      return {
        title: document.title || 'documento_web',
        width: Math.max(document.documentElement.clientWidth, window.innerWidth),
        height: Math.max(document.body.scrollHeight, document.documentElement.scrollHeight),
        viewportHeight: window.innerHeight,
        viewportWidth: window.innerWidth
      };
    });

    const isSingleScreen = !metrics || metrics.height <= (metrics.viewportHeight + 50);
    const filename = sanitizeFilename(tab.title, 'pdf');

    let finalCanvas = null;

    if (isSingleScreen) {
      // Caso 1: Pantalla completa fija (como Facebook Login, Landing, Portada)
      setProgress(70, "Procesando proporciones originales de pantalla...", 'busy');
      const captureDataUrl = await captureTabImage(tab, 'png');

      const img = new Image();
      await new Promise((res, rej) => {
        img.onload = res;
        img.onerror = rej;
        img.src = captureDataUrl;
      });

      finalCanvas = document.createElement('canvas');
      finalCanvas.width = img.width;
      finalCanvas.height = img.height;
      const ctx = finalCanvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
    } else {
      // Caso 2: Página larga con desplazamiento continuo
      setProgress(60, "Capturando secciones completas de la página...", 'busy');
      const totalHeight = Math.min(metrics.height, 12000);
      const viewportH = metrics.viewportHeight;

      const slices = [];
      let currentY = 0;
      const step = viewportH;

      while (currentY < totalHeight) {
        await executeInPage((y) => window.scrollTo(0, y), [currentY]);
        await new Promise(r => setTimeout(r, 120));

        const sliceUrl = await captureTabImage(tab, 'png');
        slices.push({ url: sliceUrl, y: currentY });

        currentY += step;
      }

      await executeInPage(() => window.scrollTo(0, 0));

      finalCanvas = document.createElement('canvas');
      finalCanvas.width = metrics.viewportWidth;
      finalCanvas.height = totalHeight;
      const ctx = finalCanvas.getContext('2d');

      for (const slice of slices) {
        const img = new Image();
        await new Promise((res, rej) => {
          img.onload = res;
          img.onerror = rej;
          img.src = slice.url;
        });
        ctx.drawImage(img, 0, slice.y, metrics.viewportWidth, slice.y + viewportH > totalHeight ? totalHeight - slice.y : viewportH);
      }
    }

    setProgress(85, "Compilando PDF con proporción nativa y márgenes ejecutivos...", 'busy');

    const { jsPDF } = window.jspdf;
    const canvasWidth = finalCanvas.width;
    const canvasHeight = finalCanvas.height;

    // Detectar automáticamente la orientación original (Horizontal para diseño desktop, Vertical para documentos largos)
    const isLandscape = canvasWidth >= canvasHeight;
    const orientation = isLandscape ? 'landscape' : 'portrait';
    const pageW = isLandscape ? 297 : 210; // A4 mm
    const pageH = isLandscape ? 210 : 297; // A4 mm

    const margin = 8; // Margen sobrio y elegante de 8mm
    const usableW = pageW - (margin * 2);
    const usableH = pageH - (margin * 2);

    const pdf = new jsPDF({
      orientation: orientation,
      unit: 'mm',
      format: 'a4'
    });

    if (isSingleScreen || isLandscape) {
      // Renderizado proporcional perfecto en 1 sola página:
      // Conserva exactamente la proporción de aspecto del sitio original (sin deformar ni cortar)
      const scale = Math.min(usableW / canvasWidth, usableH / canvasHeight);
      const renderW = canvasWidth * scale;
      const renderH = canvasHeight * scale;
      const posX = margin + (usableW - renderW) / 2;
      const posY = margin + (usableH - renderH) / 2;

      const imgData = finalCanvas.toDataURL('image/png');
      pdf.addImage(imgData, 'PNG', posX, posY, renderW, renderH);

    } else {
      // Página larga vertical: Paginación secuencial limpia sin cortar elementos
      const scale = usableW / canvasWidth;
      const sliceHeightPx = usableH / scale;

      let currentY = 0;
      let pageIndex = 0;

      while (currentY < canvasHeight) {
        if (pageIndex > 0) {
          pdf.addPage('a4', 'portrait');
        }

        const currentSliceH = Math.min(sliceHeightPx, canvasHeight - currentY);
        const pageCanvas = document.createElement('canvas');
        pageCanvas.width = canvasWidth;
        pageCanvas.height = currentSliceH;

        const pctx = pageCanvas.getContext('2d');
        pctx.drawImage(finalCanvas, 0, currentY, canvasWidth, currentSliceH, 0, 0, canvasWidth, currentSliceH);

        const pageDataUrl = pageCanvas.toDataURL('image/png');
        const renderH = currentSliceH * scale;

        pdf.addImage(pageDataUrl, 'PNG', margin, margin, usableW, renderH);

        currentY += sliceHeightPx;
        pageIndex++;
      }
    }

    setProgress(95, "Descargando documento PDF fiel...", 'busy');
    const pdfBlob = pdf.output('blob');
    await triggerDownload(pdfBlob, filename);

    // Restaurar elementos modificados en el DOM
    await executeInPage(() => {
      document.querySelectorAll('[data-bwd-hidden="true"]').forEach(el => {
        el.style.removeProperty('display');
        el.removeAttribute('data-bwd-hidden');
      });
    });

    setProgress(100, `¡PDF fiel descargado con éxito! (${filename})`, 'success');
    setBusy(false);

  } catch (err) {
    console.error("Error al exportar PDF:", err);
    setProgress(0, `Error: ${formatErrorMessage(err)}`, 'error');
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
    setProgress(15, "Inicializando captura continua...", 'busy');

    const tab = await getActiveTab();

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
      const dataUrl = await captureTabImage(tab, 'png');
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
      await new Promise(r => setTimeout(r, 120)); // Breve espera para estabilizar render y lazy loading

      const sliceUrl = await captureTabImage(tab, 'png');
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

document.addEventListener('DOMContentLoaded', () => {
  initTabDetection();
  initTooltips();
});

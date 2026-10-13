# BWD Pro — Bajar-Web-Docs (v0.2.0)

Extensión de navegador para Firefox de alta fidelidad visual diseñada para resolver definitivamente los problemas habituales de `Ctrl + P` (pérdida de colores de fondo, layouts rotos, cortes de texto a mitad de bloque y banners invasivos).

Elevada y estilizada con la suite de diseño **Frontend Embellecedor** (UI Pro Max + Impeccable UI + Skill-UL).

---

## 🚀 Cómo instalar la extensión en Firefox (Modo Desarrollador)

1. Abre Firefox y en la barra de direcciones escribe:
   ```text
   about:debugging#/runtime/this-firefox
   ```
2. Haz clic en el botón **"Cargar complemento temporal..."** (*Load Temporary Add-on*).
3. Selecciona el archivo `manifest.json` ubicado en la raíz de esta carpeta.
4. ¡Listo! Verás el icono de **BWD Pro** en la barra de herramientas de Firefox con su interfaz obsidian cyberpunk.

---

## 💎 Características Principales

* **📄 PDF Fiel de Página Completa (1 Hoja Continua):** Captura el renderizado real de la pantalla (modo `screen`) en una sola página continua sin saltos ni cortes de layout, preservando fondos, columnas, tipografías y colores exactos sin aplicar los destructivos estilos de impresión del navegador.
* **📝 Exportar a Word (.docx / .doc):** Extrae el artículo o cuerpo central, remueve automáticamente anuncios, iframes y menús de navegación, formateando un documento limpio con metadatos de origen listo para Microsoft Word y LibreOffice Writer.
* **🖼️ Captura Completa Retina (2x):** Exporta una imagen PNG nítida de toda la altura del sitio web sin pixelado.
* **⚡ Motor de Optimización DOM:**
  * **Limpieza Inteligente:** Oculta banners de cookies, popups, chats flotantes y elementos `fixed`/`sticky`.
  * **Expandir Scrolls:** Despliega bloques internos con scroll para evitar texto truncado.
  * **Súper-Muestreo:** Duplica la resolución del canvas para nitidez extrema.
* **📊 Barra de Progreso Fluida (Skill-UL):** Feedback en tiempo real con indicador porcentual animado y estados dinámicos.

---

## 🎨 Suite Integrada: Frontend Embellecedor

El repositorio ahora cuenta con la suite completa de embellecimiento en `Fronted embellecedor/`:

* **Pilar 1: UI Pro Max (`Fronted embellecedor/ui-pro-max/`):** Paleta Obsidian Deep (`#050508`), bordes dinámicos cinéticos (`.pro-beam-card`), tarjetas spotlight con seguimiento de cursor (`.pro-spotlight-card`), headers con glassmorphism (`.pro-header-glass`) y mesh aurora backgrounds.
* **Pilar 2: Impeccable UI (`Fronted embellecedor/impecable/`):** Espaciado matemático 4pt/8pt (`--imp-space-*`), tipografía balanceada, contraste accesible WCAG AAA, switches cibernéticos y tooltips con prevención de desborde de pantalla.
* **Pilar 3: Skill-UL (`Fronted embellecedor/skill-ul/`):** Barras de progreso fluidas con animación shimmer (`.skill-bar-fill`), badges flotantes interactivos con brillo (`.skill-badge-shine`) y física de rebote elástico.

Para probar la demostración completa e interactiva de los 3 pilares, abre:
```text
Fronted embellecedor/index.html
```

---

## 📁 Estructura del Proyecto

```text
Bajar-Web-Docs- Extension-Firefox/
├── manifest.json                       # Manifiesto WebExtension MV3 (Firefox 109+)
├── popup/
│   ├── popup.html                      # Interfaz visual del complemento
│   ├── popup.css                       # Estilos Pro con tokens de los 3 pilares
│   └── popup.js                        # Controlador de captura y exportación
├── libs/
│   ├── html2canvas.min.js              # Motor de renderizado DOM a Canvas (1.4.1)
│   └── jspdf.umd.min.js                # Motor de ensamblado de PDF (2.5.1)
├── icons/
│   ├── icon-48.png
│   └── icon-96.png
├── Fronted embellecedor/               # Suite completa de embellecimiento visual
│   ├── index.html                      # Showcase interactivo de los 3 pilares
│   ├── ui-pro-max/                     # Pilar 1: Alto contraste y bordes cinéticos
│   ├── impecable/                      # Pilar 2: Grid 8pt, botones y contraste AAA
│   └── skill-ul/                       # Pilar 3: Listas interactivas y barras fluidas
├── .agents/skills/                     # Directiva de agente para Frontend Embellecedor
│   └── frontend-embellecedor/
├── AGENTS.md                           # Directivas operativas y reglas de desarrollo
└── README.md
```

# Página web de presentación de Mystica (`index.html` + carpeta `web/`)

Página para promocionar **Mystica · Terapia alternativa y masajes**. Mantiene el mismo formato que la web de
ACACHETE (portada con imágenes que se turnan, tarjetas, ventanas internas y visor), pero con el contenido, los
colores (turquesa y arena), el logo y los teléfonos de Mystica. Está **aparte de la app**: no usa ni cambia
ningún archivo de la app.

| Archivo | Qué tiene |
|---|---|
| `index.html` (raíz, junto a `app.html`) | Bienvenida, terapias, galería "Conozca más" y pie |
| `web/paginas/terapia-relajante.html`, `terapia-descontracturante.html`, `terapia-especiales.html` | Una página por tipo de terapia: lo que cambia (antes / después), así es tu sesión, beneficios, aviso de seguridad y reserva |
| `web/paginas/productos.html` | **Servicios**: cada masaje con su detalle (qué es, beneficios, antes de reservar) en el visor |
| `web/paginas/vision.html` | **Nosotros**: misión, visión, valores y "Tu ficha, tu seguridad" |
| `web/paginas/contacto.html` | **Reserva tu cita**: teléfonos, WhatsApp y formulario que arma la solicitud |
| `web/css/web.css` | Colores, estilos e **imágenes** |
| `web/js/web.js` | Imágenes que se turnan, ventanas, visor, reserva por WhatsApp |
| `web/paginas/solucion-*.html` | Páginas viejas de ACACHETE (ya no se usan; se pueden borrar) |

## Imágenes
En `web/css/web.css`, arriba, bloque **IMÁGENES**: `img/banner-masa.jpg`, `img/banner-masa2.jpg` y el logo
`img/logo.jpg` (también en `index.html`: cabecera y pie). Rutas desde `web/css/`: empiezan con `../../img/`.

## Ventanas internas
`data-ventana="productos|vision|contacto|app|relajante|descontracturante|especiales"` abre la suya;
`data-filtro="relajante|descontracturante|especiales"` abre Servicios filtrado. Enlaces directos:
`index.html#productos`, `#contacto`, `#app`... "Reservar en línea" abre la app (`app.html`): el cliente pide su
usuario y reserva sus citas.

## WhatsApp
`WEB_WHATSAPP` en `web/js/web.js` (8349 1107). Cualquier elemento con `data-whatsapp` abre el chat; en el
**celular abre directo la app de WhatsApp** (si no está instalada, wa.me). El formulario de Contacto arma la
solicitud (nombre, teléfono, servicio, día, horario y molestias de salud).

## Agregar un servicio
Copiar un `<article class="producto">` completo en `web/paginas/productos.html` y cambiar imagen, ícono, textos y
`data-segmentos`. La imagen va en `<figure class="producto-foto"><img src="img/...">` (ruta desde `index.html`,
espacios del nombre como `%20`); se ve en la tarjeta, en grande en el visor y como miniatura. Sin imagen:
`<div class="producto-foto sin-imagen"><i class="bi bi-..."></i></div>`.

## Abrirla
Con Live Server o desde la web publicada (con doble clic el navegador no carga las páginas de `web/paginas/`).
Después de cambios, subir `?v=` de `web.css` y `web.js` en `index.html` y recargar con Ctrl + F5.

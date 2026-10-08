# 15. Mystica Masajes (modo CITAS)

El mismo sistema de ACACHETE funciona como **sala de masajes** cuando la empresa tiene la actividad
`masajes`. **No se borró nada**: lo de logística sigue para las demás empresas; a Mystica no le aparece.

## Puesta en marcha

Mystica es **una empresa interna más**, igual que las otras: misma base, mismo login, el Desarrollador
la crea y la elige. Solo cambia lo que se ve cuando la empresa tiene la actividad "Servicios (masajes)".

1. En la **misma base de ACACHETE que ya funciona** (la de `js/supabase.js`): SQL Editor → ejecutar
   **`sql/02_mystica_masajes.sql`** (solo crea las tablas `myst_`; se puede repetir). No hace falta el `00`.
2. Entrar con **`desar` / `ak7desa`** → Tiendas → **Empresas** → Nueva empresa: ID 02 o mayor, nombre
   "Mystica Masajes", marcar **solo** "Servicios (masajes)" y la paleta.
3. Menú del usuario → **Empresa: Mystica Masajes** (el menú cambia a Citas, Clientes, Sucursales...).
4. Como en cualquier empresa: Sucursales (región y sucursal), **Usuarios** (Administrador de Mystica;
   terapeutas = rol Piloto, se leen "Terapeuta").
5. Configuración → **Servicios y horario de atención** → "Cargar servicios y horario de ejemplo" y ajustar.

`EMPRESA_ACTIVA = 'mystica'` en `empresas/empresas.js` solo cambia título, pie y colores de la portada;
con `'acachete'` funciona igual.

## Tablas (prefijo `myst_`, no tocan las de ACACHETE)

| Tabla | Qué guarda |
|---|---|
| `myst_servicios` | Servicios: nombre, duración (min), precio, activo |
| `myst_horarios` | Horario por día (1 lunes…7 domingo): bloques **inicia desde / termina** y **citas a la vez**; general o por sucursal (gana la sucursal) |
| `myst_clientes` | Clientes: datos, **fecha de nacimiento** (edad y cumpleaños), sucursal, contacto de emergencia |
| `myst_clientes_historial` | Ficha: lesión, enfermedad, tratamiento que recibe, medicamento, alergia, **tratamiento aplicado** (de cada sesión), nota; riesgo y vigente/superado |
| `myst_citas` | Citas: cliente, servicio, sucursal, terapeuta, inicio/fin, estado, precio, forma de pago, recordatorio |
| `myst_config` | Mensajes de WhatsApp (recordatorio y cumpleaños) por empresa |

Compartido (ya separado por `empresa_id`): `usuarios` (login), `empresas`, `tiendas` (= Sucursales),
`regiones`, `notificaciones`, `cajas`. `js/supabase.js` filtra las `myst_` por empresa.

## Qué ve la empresa de masajes

| Se queda | Se oculta |
|---|---|
| Inicio (de citas), **Citas**, **Clientes**, Sucursales (antes Tiendas), Reportes (de citas), Usuarios, Configuración: Servicios y horario, Cajas, Costos, Planes y funciones | Pedidos, Viajes, Mis envíos, Pilotos, Rutas y asignaciones, Cotizador, Caja de pilotos, QR, Slots, Vehículos, Transporte, Tarifas, Actividades, Horarios de pilotos |

Palabras en pantalla (`js/palabras.js`): Pedido → **Cita**, Piloto → **Terapeuta**, Tienda → **Sucursal**.
El terapeuta no envía ubicación GPS.

## Funciones

- **Citas** (`#citas`): calendario Mes / Semana / Día. La hora solo se puede elegir **dentro del horario
  del día** (inicia desde → termina, contando la duración), si hay lugar (citas a la vez) y si el terapeuta
  está libre (la base también impide doble cita del terapeuta). Estados: programada → confirmada →
  atendida (forma de pago + tratamiento aplicado al historial) / no asistió / cancelada (motivo).
  El terapeuta ve solo sus citas y cambia estado y notas.
- **Clientes** (`#mclientes`): buscar, filtros (alertas de salud, cumpleaños del mes, inactivos),
  **Ficha** con "Agregar nuevo" (todo queda en el historial con fecha y quién lo registró), sesiones
  anteriores y guía de contraindicaciones. Al escribir, sugiere el riesgo por palabras clave.
  Si el cliente tiene algo "No masajear", la cita pide confirmar la autorización.
- **WhatsApp** (enlace `wa.me`, sin costo ni API): recordatorio de cita (Inicio → "Recordatorios para
  mañana" y dentro de la cita; queda marcado "Enviado") y **cumpleaños** con mensaje predefinido que usa
  **solo `{nombre}`** (Inicio, Clientes y la ficha). Teléfonos de 8 dígitos → +506.
- **Avisos a usuarios** (campana): cita nueva o reprogramada → terapeuta y personal de la sucursal;
  al abrir Inicio, recordatorio de las citas de las próximas 24 h.
- **Reportes**: por fechas y sucursal: citas, atendidas, canceladas, no asistió, ingresos; por servicio,
  terapeuta, forma de pago y sucursal; exportar CSV (si el plan incluye "exportar").
- **Planes**: funciones nuevas `citas`, `cfg_servicios`, `whatsapp`.

## Portal del cliente (rol cliente)

- **Pedir usuario:** login → "¿Eres cliente? Solicita tu usuario" (en la copia de Mystica ya va puesta la
  empresa 02; o enlace `app.html#registro?empresa=02`). Crea su ficha en `myst_clientes` y su usuario
  **sin aprobar**; avisa al Administrador y al G1 (`myst_solicitar_acceso`).
- **Aprobar:** Clientes → columna **Acceso** (aprobar / rechazar / quitar) o filtro "Solicitudes de usuario".
  También se puede **dar acceso a mano** (llave): usuario + ID de la empresa y contraseña.
- **Con usuario solo ve:** Inicio (visitas totales y del año, última visita, próximas citas, servicios que
  más usa), **Citas** (solicitar y ver las suyas; cancelar las próximas) y **Mi perfil**. Nada más.
- La cita del cliente queda **"Solicitada"**: el personal la ve en el calendario (morada) y la **confirma**;
  el cliente recibe el aviso (confirmada, cambio de hora o cancelada) en su campana.
- Columna nueva `usuarios.myst_cliente_id` (y la regla del rol cliente la acepta) — `sql/02`.

## Contraindicaciones (resumen en `CIT_CONTRAINDICACIONES`, `js/citas-comun.js`)

**No masajear / solo con autorización médica:** trombosis venosa profunda o coágulos; fiebre o infección
aguda; heridas abiertas, quemaduras o infección de piel; fractura o cirugía reciente; trastornos de
coagulación o plaquetas bajas; lesión aguda en la zona (esguince, desgarro, golpe); problema cardíaco grave
o presión no controlada; embarazo de riesgo / preeclampsia.

**Precaución:** anticoagulantes (sin masaje profundo), embarazo, cáncer o tratamiento oncológico,
osteoporosis, diabetes/neuropatía, hipertensión controlada, várices, hernia discal, enfermedad renal o
hepática, artritis/lupus/gota/fibromialgia, epilepsia, marcapasos/prótesis, alergias a aceites o látex.

Fuentes: [Mayo Clinic](https://www.mayoclinic.org/healthy-lifestyle/stress-management/in-depth/massage/art-20045743) ·
[NCCIH (NIH)](https://www.nccih.nih.gov/health/massage-therapy-what-you-need-to-know) ·
[Cleveland Clinic](https://my.clevelandclinic.org/departments/wellness/integrative/treatments-services/massage-therapy) ·
[American Cancer Society](https://www.cancer.org/cancer/managing-cancer/side-effects/low-blood-counts/bleeding.html).
Es orientación para el personal; no reemplaza el criterio médico.

## Archivos

| Archivo | Qué |
|---|---|
| `sql/02_mystica_masajes.sql` | Tablas `myst_`, triggers, acceso y datos de ejemplo |
| `js/citas-comun.js` + `css/citas-comun.css` | Contraindicaciones, WhatsApp, horario, ficha, cliente, Inicio y Reporte de citas |
| `secciones/citas.html`, `js/secciones/citas.js` | Calendario |
| `secciones/mclientes.html`, `js/secciones/mclientes.js` | Clientes de masajes |
| `js/secciones/configuracion/servicios.js` | Servicios, horario de atención y mensajes |
| Cambios pequeños | `empresas/empresas.js` (marca, `empresaTieneCitas`, plan), `js/sesion.js` (secciones), `js/palabras.js`, `js/pagina_inicial.js` (pie y `clientes`→`mclientes`), `js/supabase.js`, `js/ubicacion.js`, `inicio.js`, `reportes.js`, `configuracion.js/.html`, `app.html` (menú) |

## Pendiente / ideas

- Envío automático de WhatsApp (requiere WhatsApp Business API, de pago); hoy es con un clic.
- Cajas y Costos siguen siendo los de logística (fondo por terapeuta, gastos del mes); el cobro de cada
  cita queda en la cita y en Reportes.
- La protección real de los datos (RLS por usuario) sigue en la Fase 7, como el resto del sistema.

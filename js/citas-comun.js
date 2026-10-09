/* ==================================================
   CITAS (SALA DE MASAJES) - FUNCIONES COMPARTIDAS
   MYSTICA MASAJES sobre ACACHETE LOGISTICS

   Solo para empresas con una actividad de citas (empresaTieneCitas(),
   empresas/empresas.js). Tablas propias con prefijo myst_
   (sql/02_mystica_masajes.sql); no toca las tablas de ACACHETE.

   Aquí:
     - Contraindicaciones del masaje (CIT_CONTRAINDICACIONES) y citRiesgo(texto)
     - Mensajes de WhatsApp (recordatorio y cumpleaños) y citWhatsApp()
     - Horario de atención: citBloquesDelDia() y citHorasDelDia() (bloquea la cita
       fuera de "inicia desde / termina" o si ya está lleno)
     - Ventanas: ficha del cliente (citAbrirFicha) y cliente nuevo / modificar
       (citAbrirCliente)
     - montarInicioCitas(zona)  -> Inicio (js/secciones/inicio.js)
     - montarReporteCitas(zona) -> Reportes (js/secciones/reportes.js)
   Las usan js/secciones/citas.js, js/secciones/mclientes.js y
   js/secciones/configuracion/servicios.js. Estilos: css/citas-comun.css.
   Documentación: docs/15-mystica-masajes.md
   ================================================== */

// ==================================================
// DATOS FIJOS
// ==================================================

const CIT_ESTADOS = {
    solicitada: ['Solicitada', 'etiqueta-morada'],  // la pidió el cliente; la confirma el personal
    programada: ['Programada', 'etiqueta-azul'],
    confirmada: ['Confirmada', 'etiqueta-turquesa'],
    atendida:   ['Atendida', 'etiqueta-verde'],
    no_asistio: ['No asistió', 'etiqueta-naranja'],
    cancelada:  ['Cancelada', 'etiqueta-gris'],
};
const CIT_ACTIVAS = ['solicitada', 'programada', 'confirmada'];
const CIT_COBROS = { efectivo: 'Efectivo', sinpe: 'SINPE Móvil', tarjeta: 'Tarjeta' };
const CIT_PASO_MIN = 15; // cada cuántos minutos se ofrece una hora

const CIT_TIPOS = {
    enfermedad:           ['Enfermedad / condición', 'bi-heart-pulse'],
    lesion:               ['Lesión', 'bi-bandaid'],
    tratamiento_actual:   ['Tratamiento que recibe', 'bi-capsule'],
    medicamento:          ['Medicamento', 'bi-prescription2'],
    alergia:              ['Alergia', 'bi-exclamation-diamond'],
    tratamiento_aplicado: ['Tratamiento aplicado (sesión)', 'bi-flower1'],
    nota:                 ['Nota', 'bi-journal-text'],
};
const CIT_RIESGOS = {
    contraindicado: ['No masajear / pedir autorización médica', 'etiqueta-rosada'],
    precaucion:     ['Precaución', 'etiqueta-naranja'],
};

// Contraindicaciones del masaje y la descontracturación (resumen para el personal; NO es
// diagnóstico). Fuentes: Mayo Clinic, NCCIH (NIH), Cleveland Clinic y American Cancer
// Society (ver CIT_FUENTES y docs/15-mystica-masajes.md). "claves" se buscan sin tildes
// en lo que se escribe en la ficha para sugerir el riesgo.
const CIT_CONTRAINDICACIONES = [
    // ---- No masajear (o solo con autorización médica) ----
    { nombre: 'Trombosis venosa profunda / coágulos', nivel: 'contraindicado', claves: ['trombosis', 'tvp', 'coagulo', 'embolia', 'tromboflebitis', 'flebitis'],
      nota: 'El masaje puede desprender el coágulo (embolia pulmonar).' },
    { nombre: 'Fiebre o infección aguda', nivel: 'contraindicado', claves: ['fiebre', 'gripe', 'influenza', 'infeccion', 'covid', 'resfriado'],
      nota: 'Reprogramar hasta 48 h sin síntomas.' },
    { nombre: 'Heridas abiertas, quemaduras o infección de piel', nivel: 'contraindicado', claves: ['herida', 'quemadura', 'hongo', 'herpes', 'sarna', 'impetigo', 'celulitis infecciosa'],
      nota: 'No tocar la zona; si es contagiosa, no atender.' },
    { nombre: 'Fractura o cirugía reciente', nivel: 'contraindicado', claves: ['fractura', 'cirugia', 'operacion', 'postoperatorio', 'operado'],
      nota: 'Esperar el alta médica para la zona.' },
    { nombre: 'Trastorno de coagulación / plaquetas bajas', nivel: 'contraindicado', claves: ['hemofilia', 'plaquetas', 'trombocitopenia', 'hemorragia', 'sangrado'],
      nota: 'Riesgo de hematomas y sangrado.' },
    { nombre: 'Lesión aguda (esguince, desgarro, golpe) en la zona', nivel: 'contraindicado', claves: ['esguince', 'desgarro', 'contusion', 'hematoma', 'inflamacion aguda', 'derrame articular'],
      nota: 'Primeras 48-72 h: no masajear la zona.' },
    { nombre: 'Problema cardíaco grave o presión no controlada', nivel: 'contraindicado', claves: ['infarto', 'insuficiencia cardiaca', 'hipertension no controlada', 'arritmia', 'angina'],
      nota: 'Pedir autorización médica.' },
    { nombre: 'Embarazo de riesgo / preeclampsia', nivel: 'contraindicado', claves: ['preeclampsia', 'embarazo de alto riesgo', 'amenaza de aborto', 'placenta previa'],
      nota: 'Solo con autorización del médico tratante.' },
    // ---- Precaución (adaptar presión, zona o posición) ----
    { nombre: 'Anticoagulantes', nivel: 'precaucion', claves: ['anticoagulante', 'warfarina', 'rivaroxaban', 'apixaban', 'heparina', 'clopidogrel', 'aspirina'],
      nota: 'Sin masaje profundo: riesgo de moretones.' },
    { nombre: 'Embarazo', nivel: 'precaucion', claves: ['embarazo', 'embarazada', 'gestacion'],
      nota: 'Técnica prenatal, posición de lado; evitar el primer trimestre si hay dudas.' },
    { nombre: 'Cáncer o tratamiento oncológico', nivel: 'precaucion', claves: ['cancer', 'tumor', 'quimioterapia', 'radioterapia', 'metastasis', 'linfedema', 'oncologico'],
      nota: 'Presión suave, evitar zonas de tumor, radiación o catéter; consultar al oncólogo.' },
    { nombre: 'Osteoporosis', nivel: 'precaucion', claves: ['osteoporosis', 'osteopenia'],
      nota: 'Presión suave; si es severa, no masaje profundo.' },
    { nombre: 'Diabetes / neuropatía', nivel: 'precaucion', claves: ['diabetes', 'diabetico', 'neuropatia'],
      nota: 'Menos sensibilidad: presión moderada; revisar pies y glucosa.' },
    { nombre: 'Hipertensión', nivel: 'precaucion', claves: ['hipertension', 'presion alta'],
      nota: 'Controlada: sesión relajante, sin cambios bruscos de posición.' },
    { nombre: 'Várices', nivel: 'precaucion', claves: ['varices', 'variz', 'venas varicosas'],
      nota: 'No presionar sobre las venas.' },
    { nombre: 'Hernia discal o problema de columna', nivel: 'precaucion', claves: ['hernia', 'discopatia', 'ciatica', 'escoliosis', 'lumbalgia'],
      nota: 'Sin manipulaciones; presión moderada.' },
    { nombre: 'Enfermedad renal o hepática', nivel: 'precaucion', claves: ['renal', 'rinon', 'hepatica', 'higado', 'cirrosis', 'dialisis'],
      nota: 'Sesiones cortas y suaves.' },
    { nombre: 'Artritis, lupus, gota o fibromialgia', nivel: 'precaucion', claves: ['artritis', 'lupus', 'gota', 'fibromialgia', 'reumat'],
      nota: 'En crisis no masajear la articulación; presión según tolerancia.' },
    { nombre: 'Epilepsia', nivel: 'precaucion', claves: ['epilepsia', 'convulsion'],
      nota: 'Evitar aromas fuertes; tener plan de emergencia.' },
    { nombre: 'Marcapasos, prótesis o implantes', nivel: 'precaucion', claves: ['marcapasos', 'protesis', 'implante'],
      nota: 'No presionar sobre el dispositivo o la prótesis.' },
    { nombre: 'Alergia a aceites, cremas o látex', nivel: 'precaucion', claves: ['alergia', 'alergico', 'latex'],
      nota: 'Usar productos hipoalergénicos.' },
];
const CIT_FUENTES = [
    ['Mayo Clinic: Massage', 'https://www.mayoclinic.org/healthy-lifestyle/stress-management/in-depth/massage/art-20045743'],
    ['NCCIH (NIH): Massage Therapy', 'https://www.nccih.nih.gov/health/massage-therapy-what-you-need-to-know'],
    ['Cleveland Clinic: Massage Therapy', 'https://my.clevelandclinic.org/departments/wellness/integrative/treatments-services/massage-therapy'],
    ['American Cancer Society: Low platelets', 'https://www.cancer.org/cancer/managing-cancer/side-effects/low-blood-counts/bleeding.html'],
];

// Mensajes de WhatsApp por defecto (se cambian en Configuración -> Servicios; tabla myst_config)
//   Recordatorio: {nombre} {servicio} {fecha} {hora} {sucursal} {empresa}
//   Cumpleaños: SOLO {nombre}
const CIT_MENSAJES_BASE = {
    mensaje_recordatorio: 'Hola {nombre} 🌿, te recordamos tu cita de {servicio} el {fecha} a las {hora} en {sucursal}. Responde SÍ para confirmar o avísanos si necesitas cambiarla. ¡Te esperamos! — {empresa}',
    mensaje_cumpleanos: '¡Feliz cumpleaños, {nombre}! 🎉🌸 Todo el equipo te desea un día lleno de bienestar y relajación. Como regalo, tienes un detalle especial en tu próxima sesión. ¡Te esperamos!',
};

// ==================================================
// AYUDAS
// ==================================================

const citSinTildes = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const citDinero = (n) => `₡${Math.round(Number(n || 0)).toLocaleString('es-CR')}`;
const citDos = (n) => String(n).padStart(2, '0');
const citFechaISO = (d) => `${d.getFullYear()}-${citDos(d.getMonth() + 1)}-${citDos(d.getDate())}`;
const citHora = (d) => `${citDos(d.getHours())}:${citDos(d.getMinutes())}`;
const citMinutos = (hhmm) => { const [h, m] = String(hhmm).slice(0, 5).split(':').map(Number); return h * 60 + m; };
const citHoraDeMin = (min) => `${citDos(Math.floor(min / 60))}:${citDos(min % 60)}`;
const citFechaLarga = (d) => d.toLocaleDateString('es-CR', { weekday: 'long', day: 'numeric', month: 'long' });
const citDiaSemana = (fechaISO) => { const d = new Date(`${fechaISO}T12:00:00`).getDay(); return d === 0 ? 7 : d; }; // 1 lunes ... 7 domingo
const citNombre = (c) => (c ? `${c.nombre || ''} ${c.apellidos || ''}`.trim() : '—');
const citFaltaSql = (e) => !!e && ['42P01', 'PGRST205', '42703', 'PGRST200', 'PGRST204'].includes(e.code);
const CIT_AVISO_SQL = 'Falta ejecutar sql/02_mystica_masajes.sql en Supabase.';

// Crea un elemento: citEl('button', { class: 'boton', type: 'button', onclick }, 'texto', otroNodo)
// Los textos van siempre como texto (nunca HTML). icon: 'bi-x' agrega <i class="bi bi-x">.
function citEl(tag, attrs = {}, ...hijos) {
    const e = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([k, v]) => {
        if (v == null || v === false) return;
        if (k === 'class') e.className = v;
        else if (k === 'icon') e.appendChild(citEl('i', { class: `bi ${v}` }));
        else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
        else if (k in e && typeof v !== 'string') e[k] = v;
        else e.setAttribute(k, v === true ? '' : v);
    });
    hijos.flat().forEach((h) => { if (h != null && h !== false) e.append(h instanceof Node ? h : document.createTextNode(String(h))); });
    return e;
}
const citEtiqueta = (texto, color) => citEl('span', { class: `etiqueta ${color}` }, texto);

// Edad en años a partir de 'YYYY-MM-DD' (null si no hay fecha)
function citEdad(fecha) {
    if (!fecha) return null;
    const n = new Date(`${fecha}T12:00:00`);
    const hoy = new Date();
    let edad = hoy.getFullYear() - n.getFullYear();
    if (hoy.getMonth() < n.getMonth() || (hoy.getMonth() === n.getMonth() && hoy.getDate() < n.getDate())) edad--;
    return edad;
}

// Días que faltan para el próximo cumpleaños (0 = hoy)
function citDiasACumple(fecha) {
    if (!fecha) return null;
    const [, m, d] = fecha.split('-').map(Number);
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    let prox = new Date(hoy.getFullYear(), m - 1, d);
    if (prox < hoy) prox = new Date(hoy.getFullYear() + 1, m - 1, d);
    return Math.round((prox - hoy) / 86400000);
}

// Riesgo que sugiere un texto: { nivel: 'contraindicado'|'precaucion'|null, coincide: [contraindicaciones] }
function citRiesgo(texto) {
    const t = citSinTildes(texto);
    const coincide = t ? CIT_CONTRAINDICACIONES.filter((c) => c.claves.some((k) => t.includes(k))) : [];
    const nivel = coincide.some((c) => c.nivel === 'contraindicado') ? 'contraindicado' : (coincide.length ? 'precaucion' : null);
    return { nivel, coincide };
}

// ==================================================
// MENSAJES Y WHATSAPP
// ==================================================

let citMensajes = { ...CIT_MENSAJES_BASE };

async function citCargarMensajes() {
    const { data, error } = await db.from('myst_config').select('clave, valor').in('clave', Object.keys(CIT_MENSAJES_BASE));
    if (!error) (data || []).forEach((r) => { if (typeof r.valor === 'string' && r.valor.trim()) citMensajes[r.clave] = r.valor; });
    return citMensajes;
}

// Reemplaza {campo} por su valor
const citLlenar = (plantilla, datos) => plantilla.replace(/\{(\w+)\}/g, (_, k) => (datos[k] != null ? datos[k] : ''));

// Número para WhatsApp (Costa Rica: 8 dígitos -> +506) o '' si no hay
function citNumeroWhatsApp(telefono) {
    let n = String(telefono || '').replace(/\D/g, '');
    if (n.length === 8) n = `506${n}`;
    return n;
}

// Enlace web de WhatsApp con el mensaje listo (computadora; respaldo en el celular)
function citWhatsApp(telefono, texto) {
    const n = citNumeroWhatsApp(telefono);
    return n ? `https://wa.me/${n}?text=${encodeURIComponent(texto)}` : null;
}

// ¿Celular o tablet? (Android, iPhone, iPad; el iPad nuevo se presenta como Mac con pantalla táctil)
const citEsCelular = () => /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
    || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);

// Abre el chat con el mensaje listo:
//   - Celular: directo en la APP (whatsapp://send), sin pasar por la página de WhatsApp.
//     Si la app no está instalada (la página sigue visible al rato), abre wa.me.
//   - Computadora: wa.me en otra pestaña (ofrece WhatsApp de escritorio o WhatsApp Web).
function citAbrirWhatsApp(telefono, texto) {
    const n = citNumeroWhatsApp(telefono);
    if (!n) return false;
    if (!citEsCelular()) {
        window.open(citWhatsApp(telefono, texto), '_blank', 'noopener');
        return true;
    }
    let seFue = false;
    const alSalir = () => { if (document.hidden) seFue = true; };
    document.addEventListener('visibilitychange', alSalir);
    window.location.href = `whatsapp://send?phone=${n}&text=${encodeURIComponent(texto)}`;
    setTimeout(() => {
        document.removeEventListener('visibilitychange', alSalir);
        if (!seFue && !document.hidden) window.location.href = citWhatsApp(telefono, texto); // sin la app
    }, 1500);
    return true;
}

// Mensaje de recordatorio de una cita (con su cliente, servicio y sucursal)
function citTextoRecordatorio(cita) {
    const inicio = new Date(cita.inicio);
    return citLlenar(citMensajes.mensaje_recordatorio, {
        nombre: (cita.cliente && cita.cliente.nombre) || '',
        servicio: cita.servicio_nombre || '',
        fecha: citFechaLarga(inicio),
        hora: citHora(inicio),
        sucursal: (cita.tienda && cita.tienda.nombre) || '',
        empresa: (typeof empresaActual === 'function' && empresaActual() && empresaActual().nombre) || EMPRESA.nombre || '',
    });
}

// Mensaje de cumpleaños: SOLO el nombre del cliente
const citTextoCumple = (cliente) => citLlenar(citMensajes.mensaje_cumpleanos, { nombre: cliente.nombre || '' });

// Botón verde de WhatsApp (en el celular abre la app; en la computadora wa.me). alAbrir: después de abrirlo
function citBotonWhatsApp(telefono, texto, titulo = 'Enviar por WhatsApp', alAbrir = null) {
    const hay = !!citNumeroWhatsApp(telefono);
    const habil = typeof funcionHabilitada !== 'function' || funcionHabilitada('whatsapp');
    return citEl('button', {
        type: 'button', class: 'boton boton-chico cit-wa', title: hay ? titulo : 'El cliente no tiene teléfono', disabled: !hay || !habil,
        onclick: () => { if (citAbrirWhatsApp(telefono, texto) && alAbrir) alAbrir(); },
    }, citEl('i', { class: 'bi bi-whatsapp' }), ' WhatsApp');
}

// ==================================================
// HORARIO DE ATENCIÓN (myst_horarios)
// ==================================================

async function citCargarHorarios() {
    const { data, error } = await db.from('myst_horarios').select('id, tienda_id, dia, inicia_desde, termina, capacidad').order('dia').order('inicia_desde');
    if (error) throw error;
    return data || [];
}

// Bloques de un día para una sucursal: los propios de la sucursal o, si no tiene, los generales
function citBloquesDelDia(horarios, fechaISO, tiendaId) {
    const dia = citDiaSemana(fechaISO);
    const delDia = horarios.filter((h) => h.dia === dia);
    const propios = tiendaId ? delDia.filter((h) => h.tienda_id === Number(tiendaId)) : [];
    return (propios.length ? propios : delDia.filter((h) => !h.tienda_id))
        .map((h) => ({ desde: citMinutos(h.inicia_desde), hasta: citMinutos(h.termina), capacidad: h.capacidad || 1 }));
}

// Horas para una cita en un día: [{ hora: '09:15', libre, motivo }]
// Se bloquea: fuera del horario (inicia desde / termina, contando la duración), hora pasada,
// sucursal llena (capacidad del bloque) o terapeuta ocupado.
function citHorasDelDia({ horarios, citas, fecha, tiendaId, duracion, terapeutaId, ignorarId }) {
    const ahora = Date.now();
    const activas = citas.filter((c) => CIT_ACTIVAS.includes(c.estado) && c.id !== ignorarId);
    const horas = [];
    citBloquesDelDia(horarios, fecha, tiendaId).forEach((b) => {
        for (let m = b.desde; m + duracion <= b.hasta; m += CIT_PASO_MIN) {
            const ini = new Date(`${fecha}T${citHoraDeMin(m)}:00`);
            const fin = new Date(ini.getTime() + duracion * 60000);
            const cruza = (c) => new Date(c.inicio) < fin && new Date(c.fin) > ini;
            let motivo = null;
            if (ini.getTime() < ahora) motivo = 'ya pasó';
            else if (activas.filter((c) => cruza(c) && (!tiendaId || !c.tienda_id || c.tienda_id === Number(tiendaId))).length >= b.capacidad) motivo = 'lleno';
            else if (terapeutaId && activas.some((c) => cruza(c) && c.terapeuta_id === Number(terapeutaId))) motivo = 'terapeuta ocupado';
            horas.push({ hora: citHoraDeMin(m), libre: !motivo, motivo });
        }
    });
    return horas;
}

// ==================================================
// VENTANAS (dialog)
// ==================================================

// Ventana genérica: { dialogo, cuerpo, botones, error, cerrar }. Se borra al cerrarse.
function citVentana(titulo, { ancha = false } = {}) {
    const error = citEl('p', { class: 'form-error', role: 'alert' });
    const cuerpo = citEl('div', { class: 'cit-ventana-cuerpo' });
    const botones = citEl('div', { class: 'dialogo-botones' });
    const dialogo = citEl('dialog', { class: `dialogo cit-ventana${ancha ? ' cit-ventana-ancha' : ''}` },
        citEl('div', { class: 'dialogo-form' },
            citEl('div', { class: 'cit-ventana-cabecera' },
                citEl('h3', { class: 'dialogo-titulo' }, titulo),
                citEl('button', { type: 'button', class: 'boton-icono', title: 'Cerrar', 'aria-label': 'Cerrar', onclick: () => dialogo.close() }, citEl('i', { class: 'bi bi-x-lg' }))),
            cuerpo, error, botones));
    dialogo.addEventListener('close', () => dialogo.remove());
    document.body.appendChild(dialogo);
    dialogo.showModal();
    return { dialogo, cuerpo, botones, error, cerrar: () => dialogo.close() };
}

// Campo con etiqueta: citCampo('Nombre *', input, { ancho: true, ayuda: '...' })
function citCampo(etiqueta, control, { ancho = false, ayuda = null } = {}) {
    return citEl('label', { class: `campo${ancho ? ' campo-ancho' : ''}` },
        citEl('span', { class: 'campo-etiqueta' }, etiqueta), control,
        ayuda ? citEl('small', { class: 'campo-ayuda' }, ayuda) : null);
}
const citInput = (attrs = {}) => citEl('input', { class: 'campo-input', autocomplete: 'off', ...attrs });
function citSelect(opciones, valor = '', attrs = {}) {
    const s = citEl('select', { class: 'campo-input', ...attrs });
    opciones.forEach(([v, t]) => s.appendChild(citEl('option', { value: v }, t)));
    s.value = valor == null ? '' : String(valor);
    return s;
}

// Sucursales (tiendas) activas de la empresa: [{ id, codigo, nombre }]
let citSucursalesCache = null;
async function citSucursales() {
    if (!citSucursalesCache) {
        const { data } = await db.from('tiendas').select('id, codigo, nombre').eq('estado', 'activa').order('nombre');
        citSucursalesCache = data || [];
    }
    return citSucursalesCache;
}

// ---------- Cliente nuevo / modificar ----------
// alGuardar(cliente) recibe la fila guardada. Un cliente nuevo abre luego su ficha.
async function citAbrirCliente(cliente = null, { alGuardar = null, tiendaId = null, abrirFicha = true } = {}) {
    const sucursales = await citSucursales();
    const v = citVentana(cliente ? `Modificar a ${citNombre(cliente)}` : 'Nuevo cliente');
    const c = cliente || {};
    const f = {
        nombre: citInput({ value: c.nombre || '', maxlength: 60, required: true }),
        apellidos: citInput({ value: c.apellidos || '', maxlength: 80 }),
        telefono: citInput({ value: c.telefono || '', type: 'tel', inputmode: 'tel', maxlength: 20, required: true }),
        correo: citInput({ value: c.correo || '', type: 'email', maxlength: 120 }),
        fecha_nacimiento: citInput({ value: c.fecha_nacimiento || '', type: 'date', max: citFechaISO(new Date()) }),
        sexo: citSelect([['', '—'], ['F', 'Femenino'], ['M', 'Masculino'], ['O', 'Otro']], c.sexo || ''),
        tienda_id: citSelect([['', '— Sin sucursal —'], ...sucursales.map((s) => [s.id, s.nombre])], c.tienda_id || tiendaId || (sucursales.length === 1 ? sucursales[0].id : '')),
        contacto_emergencia: citInput({ value: c.contacto_emergencia || '', maxlength: 120, placeholder: 'Nombre y teléfono' }),
        notas: citEl('textarea', { class: 'campo-input', rows: 2, maxlength: 500 }, c.notas || ''),
    };
    v.cuerpo.appendChild(citEl('div', { class: 'campos' },
        citCampo('Nombre *', f.nombre), citCampo('Apellidos', f.apellidos),
        citCampo('Teléfono (WhatsApp) *', f.telefono), citCampo('Correo', f.correo),
        citCampo('Fecha de nacimiento', f.fecha_nacimiento, { ayuda: 'Para la edad y el mensaje de cumpleaños.' }), citCampo('Sexo', f.sexo),
        citCampo('Sucursal', f.tienda_id), citCampo('Contacto de emergencia', f.contacto_emergencia),
        citCampo('Notas', f.notas, { ancho: true })));
    if (!cliente) v.cuerpo.appendChild(citEl('p', { class: 'cit-nota' }, citEl('i', { class: 'bi bi-info-circle' }),
        ' Al guardar se abre su ficha para agregar lesiones, enfermedades y tratamientos.'));

    const guardar = citEl('button', { type: 'button', class: 'boton boton-principal' }, 'Guardar');
    v.botones.append(citEl('button', { type: 'button', class: 'boton boton-secundario', onclick: v.cerrar }, 'Cancelar'), guardar);
    guardar.addEventListener('click', async () => {
        const fila = Object.fromEntries(Object.entries(f).map(([k, el]) => [k, el.value.trim() || null]));
        fila.tienda_id = fila.tienda_id ? Number(fila.tienda_id) : null;
        if (!fila.nombre || !fila.telefono) { v.error.textContent = 'Nombre y teléfono son obligatorios.'; return; }
        if (fila.telefono.replace(/\D/g, '').length < 8) { v.error.textContent = 'Revisa el teléfono (mínimo 8 dígitos).'; return; }
        guardar.disabled = true;
        const consulta = cliente
            ? db.from('myst_clientes').update(fila).eq('id', cliente.id)
            : db.from('myst_clientes').insert(fila);
        const { data, error } = await consulta.select().single();
        guardar.disabled = false;
        if (error) { v.error.textContent = citFaltaSql(error) ? CIT_AVISO_SQL : 'No se pudo guardar. Intenta de nuevo.'; return; }
        v.cerrar();
        if (alGuardar) alGuardar(data);
        if (citDiasACumple(data.fecha_nacimiento) === 0) citAvisosDelDia(true); // cumple hoy: aviso a la campana ya
        if (!cliente && abrirFicha) citAbrirFicha(data.id);
    });
    f.nombre.focus();
}

// ---------- Ficha del cliente (historial) ----------
// Datos, edad, alertas de salud, "Agregar nuevo" (se guarda en su historial), historial
// completo (lesiones, enfermedades, tratamientos, tratamientos aplicados) y citas anteriores.
async function citAbrirFicha(clienteId, { alCambiar = null } = {}) {
    const [cli, his, cit] = await Promise.all([
        db.from('myst_clientes').select('*').eq('id', clienteId).single(),
        db.from('myst_clientes_historial').select('*').eq('cliente_id', clienteId).order('fecha', { ascending: false }).order('id', { ascending: false }),
        db.from('myst_citas').select('id, inicio, servicio_nombre, estado, notas, terapeuta:usuarios(nombre)').eq('cliente_id', clienteId).order('inicio', { ascending: false }).limit(30),
    ]);
    if (cli.error) { alert(citFaltaSql(cli.error) ? CIT_AVISO_SQL : 'No se pudo abrir la ficha.'); return; }
    const cliente = cli.data;
    let historial = his.data || [];
    const sesion = obtenerSesion() || {};
    const v = citVentana(`Ficha de ${citNombre(cliente)}`, { ancha: true });

    // Datos del cliente
    const edad = citEdad(cliente.fecha_nacimiento);
    const dias = citDiasACumple(cliente.fecha_nacimiento);
    v.cuerpo.appendChild(citEl('div', { class: 'cit-ficha-datos' },
        citEl('span', {}, citEl('i', { class: 'bi bi-telephone' }), ` ${cliente.telefono || '—'}`),
        citEl('span', {}, citEl('i', { class: 'bi bi-person' }), edad != null ? ` ${edad} años` : ' Edad sin registrar'),
        cliente.fecha_nacimiento ? citEl('span', {}, citEl('i', { class: 'bi bi-cake2' }),
            ` ${new Date(`${cliente.fecha_nacimiento}T12:00:00`).toLocaleDateString('es-CR', { day: 'numeric', month: 'long' })}${dias === 0 ? ' · ¡HOY cumple años!' : ''}`) : null,
        cliente.contacto_emergencia ? citEl('span', {}, citEl('i', { class: 'bi bi-telephone-plus' }), ` Emergencia: ${cliente.contacto_emergencia}`) : null,
        dias === 0 ? citBotonWhatsApp(cliente.telefono, citTextoCumple(cliente), 'Enviar felicitación de cumpleaños') : null));

    const alertas = citEl('div');
    const lista = citEl('div', { class: 'cit-historial' });
    v.cuerpo.append(alertas);

    // ---- Agregar nuevo ----
    const tipo = citSelect(Object.entries(CIT_TIPOS).map(([k, [t]]) => [k, t]), 'enfermedad');
    const fecha = citInput({ type: 'date', value: citFechaISO(new Date()), max: citFechaISO(new Date()) });
    const desc = citEl('textarea', { class: 'campo-input', rows: 2, maxlength: 600, placeholder: 'Ej.: Hernia discal L5, operado de rodilla en 2024, toma warfarina...' });
    const riesgo = citSelect([['', 'Sin riesgo'], ['precaucion', 'Precaución'], ['contraindicado', 'No masajear / autorización médica']], '');
    const sugerencia = citEl('div', { class: 'cit-sugerencia' });
    let riesgoTocado = false;
    riesgo.addEventListener('change', () => { riesgoTocado = true; });
    desc.addEventListener('input', () => {
        const r = citRiesgo(desc.value);
        if (!riesgoTocado) riesgo.value = r.nivel || '';
        sugerencia.replaceChildren(...r.coincide.map((c) => citEl('div', { class: `cit-alerta cit-alerta-${c.nivel}` },
            citEl('strong', {}, c.nombre), ` — ${c.nota}`)));
    });
    // Atajos: las condiciones más comunes con un clic
    const atajos = citEl('div', { class: 'cit-atajos' }, ...CIT_CONTRAINDICACIONES.map((c) => citEl('button', {
        type: 'button', class: `cit-atajo cit-atajo-${c.nivel}`, title: c.nota,
        onclick: () => { tipo.value = 'enfermedad'; desc.value = desc.value ? `${desc.value}, ${c.nombre}` : c.nombre; desc.dispatchEvent(new Event('input')); desc.focus(); },
    }, c.nombre)));
    const agregar = citEl('button', { type: 'button', class: 'boton boton-principal' }, citEl('i', { class: 'bi bi-plus-circle' }), ' Agregar al historial');
    agregar.addEventListener('click', async () => {
        if (!desc.value.trim()) { v.error.textContent = 'Escribe la descripción.'; return; }
        agregar.disabled = true;
        const { data, error } = await db.from('myst_clientes_historial').insert({
            cliente_id: cliente.id, tipo: tipo.value, descripcion: desc.value.trim(), riesgo: riesgo.value || null,
            fecha: fecha.value || citFechaISO(new Date()), registrado_por_nombre: sesion.nombre || null,
        }).select().single();
        agregar.disabled = false;
        if (error) { v.error.textContent = citFaltaSql(error) ? CIT_AVISO_SQL : 'No se pudo agregar.'; return; }
        v.error.textContent = '';
        historial = [data, ...historial];
        desc.value = ''; riesgo.value = ''; riesgoTocado = false; sugerencia.replaceChildren();
        dibujar();
        if (alCambiar) alCambiar();
    });
    v.cuerpo.appendChild(citEl('details', { class: 'cit-agregar', open: true },
        citEl('summary', {}, citEl('i', { class: 'bi bi-plus-square' }), ' Agregar nuevo'),
        citEl('div', { class: 'campos' }, citCampo('Tipo', tipo), citCampo('Fecha', fecha),
            citCampo('Descripción *', desc, { ancho: true }), citCampo('Riesgo para el masaje', riesgo, { ayuda: 'Se sugiere solo al escribir; revísalo.' })),
        sugerencia,
        citEl('p', { class: 'campo-etiqueta' }, 'Condiciones frecuentes (clic para agregar):'), atajos,
        citEl('div', { class: 'dialogo-botones' }, agregar)));

    v.cuerpo.append(citEl('h4', { class: 'cit-subtitulo' }, 'Historial'), lista);

    // Citas anteriores
    const citas = cit.data || [];
    if (citas.length) {
        v.cuerpo.append(citEl('h4', { class: 'cit-subtitulo' }, 'Sesiones'),
            citEl('div', { class: 'tabla-caja' }, citEl('table', { class: 'tabla' },
                citEl('thead', {}, citEl('tr', {}, ...['Fecha', 'Servicio', 'Terapeuta', 'Estado', 'Notas'].map((t) => citEl('th', {}, t)))),
                citEl('tbody', {}, ...citas.map((c) => citEl('tr', {},
                    citEl('td', {}, new Date(c.inicio).toLocaleString('es-CR', { dateStyle: 'short', timeStyle: 'short' })),
                    citEl('td', {}, c.servicio_nombre), citEl('td', {}, (c.terapeuta && c.terapeuta.nombre) || '—'),
                    citEl('td', {}, citEtiqueta(...(CIT_ESTADOS[c.estado] || [c.estado, 'etiqueta-gris']))),
                    citEl('td', { 'data-sin-palabras': true }, c.notas || '—')))))));
    }
    v.cuerpo.appendChild(citGuiaContraindicaciones());
    v.botones.append(
        citEl('button', { type: 'button', class: 'boton boton-secundario', onclick: () => { v.cerrar(); citAbrirCliente(cliente, { alGuardar: alCambiar }); } },
            citEl('i', { class: 'bi bi-pencil' }), ' Modificar datos'),
        citEl('button', { type: 'button', class: 'boton boton-principal', onclick: v.cerrar }, 'Listo'));

    async function cambiarVigente(h) {
        const { error } = await db.from('myst_clientes_historial').update({ vigente: !h.vigente }).eq('id', h.id);
        if (error) { v.error.textContent = 'No se pudo cambiar.'; return; }
        h.vigente = !h.vigente;
        dibujar();
        if (alCambiar) alCambiar();
    }

    function dibujar() {
        const vigentes = historial.filter((h) => h.vigente && h.riesgo);
        alertas.replaceChildren(...['contraindicado', 'precaucion'].map((n) => {
            const de = vigentes.filter((h) => h.riesgo === n);
            return de.length ? citEl('div', { class: `cit-alerta cit-alerta-${n}` }, citEl('i', { class: 'bi bi-exclamation-triangle-fill' }),
                citEl('strong', {}, ` ${CIT_RIESGOS[n][0]}: `), de.map((h) => h.descripcion).join(' · ')) : null;
        }).filter(Boolean));
        lista.replaceChildren();
        if (!historial.length) { lista.appendChild(citEl('p', { class: 'cit-vacio' }, 'Sin registros todavía. Usa "Agregar nuevo".')); return; }
        historial.forEach((h) => {
            const [texto, icono] = CIT_TIPOS[h.tipo] || [h.tipo, 'bi-dot'];
            lista.appendChild(citEl('div', { class: `cit-historial-item${h.vigente ? '' : ' cit-superado'}` },
                citEl('i', { class: `bi ${icono} cit-historial-icono` }),
                citEl('div', { class: 'cit-historial-texto' },
                    citEl('div', {}, citEl('strong', {}, texto), ' · ', new Date(`${h.fecha}T12:00:00`).toLocaleDateString('es-CR'),
                        h.riesgo ? citEl('span', {}, ' ', citEtiqueta(...CIT_RIESGOS[h.riesgo])) : null,
                        h.vigente ? null : citEl('span', {}, ' ', citEtiqueta('Superado', 'etiqueta-gris'))),
                    citEl('div', { 'data-sin-palabras': true }, h.descripcion),
                    h.registrado_por_nombre ? citEl('small', { class: 'cit-gris' }, `Registró: ${h.registrado_por_nombre}`) : null),
                h.tipo === 'tratamiento_aplicado' || h.tipo === 'nota' ? null : citEl('button', {
                    type: 'button', class: 'boton boton-chico boton-secundario', onclick: () => cambiarVigente(h),
                    title: h.vigente ? 'Ya no aplica (queda en el historial)' : 'Volver a marcar como vigente',
                }, h.vigente ? 'Marcar superado' : 'Vigente')));
        });
    }
    dibujar();
}

// Alertas de salud vigentes de varios clientes: Map cliente_id -> 'contraindicado'|'precaucion'
async function citRiesgosDe(clienteIds) {
    const mapa = new Map();
    if (!clienteIds.length) return mapa;
    const { data } = await db.from('myst_clientes_historial').select('cliente_id, riesgo')
        .in('cliente_id', [...new Set(clienteIds)]).eq('vigente', true).not('riesgo', 'is', null);
    (data || []).forEach((h) => { if (mapa.get(h.cliente_id) !== 'contraindicado') mapa.set(h.cliente_id, h.riesgo); });
    return mapa;
}

// Icono de alerta de salud para listas
function citIconoRiesgo(nivel) {
    if (!nivel) return null;
    return citEl('i', { class: `bi bi-exclamation-triangle-fill cit-riesgo-${nivel}`, title: CIT_RIESGOS[nivel][0] });
}

// Guía plegable de contraindicaciones con sus fuentes
function citGuiaContraindicaciones() {
    const fila = (c) => citEl('li', {}, citEl('strong', {}, c.nombre), ` — ${c.nota}`);
    return citEl('details', { class: 'cit-guia' },
        citEl('summary', {}, citEl('i', { class: 'bi bi-shield-exclamation' }), ' Guía de contraindicaciones (masaje y descontracturante)'),
        citEl('p', { class: 'cit-alerta cit-alerta-contraindicado' }, 'No masajear (o solo con autorización médica):'),
        citEl('ul', {}, CIT_CONTRAINDICACIONES.filter((c) => c.nivel === 'contraindicado').map(fila)),
        citEl('p', { class: 'cit-alerta cit-alerta-precaucion' }, 'Precaución (adaptar presión, zona o posición):'),
        citEl('ul', {}, CIT_CONTRAINDICACIONES.filter((c) => c.nivel === 'precaucion').map(fila)),
        citEl('p', { class: 'cit-gris' }, 'Orientación para el personal, no reemplaza el criterio médico. Fuentes: ',
            ...CIT_FUENTES.flatMap(([t, u], i) => [i ? ' · ' : '', citEl('a', { href: u, target: '_blank', rel: 'noopener noreferrer' }, t)])));
}

// ==================================================
// AVISOS A LOS USUARIOS (campana, js/notificaciones.js)
// ==================================================

// Administradores y G1 de la empresa (ids), para los avisos generales
async function citIdsAdministradores() {
    const { data } = await db.from('usuarios').select('id').in('rol', ['administrador', 'admin_g1', 'piloto']).neq('aprobado', false);
    return (data || []).map((u) => u.id);
}

// Cita nueva o reprogramada: avisa al terapeuta, al personal de la sucursal y a los
// administradores (nunca a quien la creó: ese ya lo sabe, js/notificaciones.js)
async function citAvisarCita(cita, titulo) {
    if (typeof avisar !== 'function') return;
    const inicio = new Date(cita.inicio);
    const admins = await citIdsAdministradores();
    avisar({
        tiendaId: cita.tienda_id || null, a: cita.tienda_id ? ['tienda', 'g3'] : [],
        usuarios: [cita.terapeuta_id, ...admins], titulo,
        mensaje: `${cita.servicio_nombre} · ${citFechaLarga(inicio)} ${citHora(inicio)}`,
        enlace: `#citas?id=${cita.id}`, referenciaTipo: 'cita', referenciaId: cita.id,
    });
}

// Recordatorio en la campana del usuario conectado: sus citas de las próximas 24 h
// (el terapeuta las suyas; el resto, las de su sucursal o todas). Una sola vez por cita.
async function citRecordatoriosInternos(citas) {
    const sesion = obtenerSesion();
    if (!sesion || !citas.length) return;
    const limite = Date.now() + 86400000;
    const proximas = citas.filter((c) => CIT_ACTIVAS.includes(c.estado) && new Date(c.inicio).getTime() > Date.now() && new Date(c.inicio).getTime() < limite);
    if (!proximas.length) return;
    const { data: ya } = await db.from('notificaciones').select('referencia_id')
        .eq('usuario_id', sesion.id).eq('referencia_tipo', 'cita_recordatorio').in('referencia_id', proximas.map((c) => c.id));
    const avisadas = new Set((ya || []).map((n) => n.referencia_id));
    const nuevas = proximas.filter((c) => !avisadas.has(c.id)).map((c) => ({
        usuario_id: sesion.id, tipo: 'info', titulo: `Cita próxima: ${citNombre(c.cliente)}`,
        mensaje: `${c.servicio_nombre} · ${citFechaLarga(new Date(c.inicio))} ${citHora(new Date(c.inicio))}`,
        enlace: `#citas?id=${c.id}`, referencia_tipo: 'cita_recordatorio', referencia_id: c.id,
    }));
    if (nuevas.length) {
        await db.from('notificaciones').insert(nuevas);
        if (typeof refrescarNotificaciones === 'function') refrescarNotificaciones();
    }
}

// Avisos del día en la campana del usuario conectado (personal de una empresa de citas):
//   - Cumpleaños de hoy de los clientes (uno por cliente y por año; el mensaje de
//     WhatsApp está en Inicio, Clientes y la ficha)
//   - Citas de las próximas 24 h (citRecordatoriosInternos)
// Se llama sola al abrir la página, al iniciar sesión y al cambiar de empresa (js/permisos.js),
// una vez por día y por pestaña; forzar = true la repite (ej. al guardar un cliente que cumple hoy).
async function citAvisosDelDia(forzar = false) {
    const sesion = obtenerSesion();
    if (!sesion || sesion.rol === 'cliente' || typeof empresaTieneCitas !== 'function' || !empresaTieneCitas()) return;
    const hoy = citFechaISO(new Date());
    const empresa = (sesion.empresa && sesion.empresa.id) || '';
    const clave = `cit_avisos_${sesion.id}_${empresa}_${hoy}`;
    try {
        if (!forzar && sessionStorage.getItem(clave)) return;
        sessionStorage.setItem(clave, '1');
    } catch {
        // sin almacenamiento: se revisa igual (la base evita repetir el aviso)
    }
    try {
        // ---- Cumpleaños ----
        const { data: clientes } = await db.from('myst_clientes').select('id, nombre, apellidos, fecha_nacimiento')
            .not('fecha_nacimiento', 'is', null).eq('activo', true);
        const cumplen = (clientes || []).filter((c) => citDiasACumple(c.fecha_nacimiento) === 0);
        const tipo = `cumpleanos_${new Date().getFullYear()}`;
        let nuevos = [];
        if (cumplen.length) {
            const { data: ya } = await db.from('notificaciones').select('referencia_id')
                .eq('usuario_id', sesion.id).eq('referencia_tipo', tipo).in('referencia_id', cumplen.map((c) => c.id));
            const avisados = new Set((ya || []).map((n) => n.referencia_id));
            nuevos = cumplen.filter((c) => !avisados.has(c.id)).map((c) => ({
                usuario_id: sesion.id, tipo: 'info', titulo: `🎂 Hoy cumple años ${citNombre(c)}`,
                mensaje: `Cumple ${citEdad(c.fecha_nacimiento)} años. Envíale la felicitación por WhatsApp desde Inicio o Clientes.`,
                enlace: '#inicio', referencia_tipo: tipo, referencia_id: c.id,
            }));
            if (nuevos.length) await db.from('notificaciones').insert(nuevos);
        }
        // ---- Citas de las próximas 24 h ----
        const ahora = new Date();
        const citas = await citCargarCitas(ahora, new Date(ahora.getTime() + 86400000));
        await citRecordatoriosInternos(citas);
        if (nuevos.length && typeof refrescarNotificaciones === 'function') refrescarNotificaciones();
    } catch (e) {
        console.error('No se pudieron revisar los avisos del día:', e);
    }
}

// Citas entre dos fechas (con cliente, sucursal y terapeuta). Terapeuta: solo las suyas.
const CIT_SELECT = '*, cliente:myst_clientes(id, nombre, apellidos, telefono, fecha_nacimiento), tienda:tiendas(id, codigo, nombre), terapeuta:usuarios(id, nombre)';
async function citCargarCitas(desde, hasta, { tiendaId = null } = {}) {
    let q = db.from('myst_citas').select(CIT_SELECT).gte('inicio', desde.toISOString()).lt('inicio', hasta.toISOString()).order('inicio');
    const sesion = obtenerSesion() || {};
    if (sesion.rol === 'cliente') q = q.eq('cliente_id', sesion.myst_cliente_id || 0); // solo las suyas
    else if (sesion.rol === 'piloto' && !esAdministrador()) q = q.eq('terapeuta_id', sesion.id); // terapeuta sin nivel admin: solo las suyas
    else if (tiendaId) q = q.eq('tienda_id', tiendaId);
    else if (['admin_g3', 'empleado'].includes(sesion.rol) && sesion.tienda) q = q.eq('tienda_id', sesion.tienda.id);
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
}

// Marca que se envió el recordatorio de WhatsApp
const citMarcarRecordatorio = (cita) => db.from('myst_citas').update({ recordatorio_en: new Date().toISOString() }).eq('id', cita.id);

// ==================================================
// INICIO (empresa de citas)
// ==================================================

function montarInicioCitas(zona) {
    let activo = true;
    const sesion = obtenerSesion() || {};
    const kpis = citEl('div', { class: 'resumen' });
    const hoyCaja = citEl('div', { class: 'cit-lista' }, 'Cargando...');
    const mananaCaja = citEl('div', { class: 'cit-lista' });
    const cumpleCaja = citEl('div', { class: 'cit-lista' });
    zona.replaceChildren(citEl('div', { class: 'pagina cit-inicio' },
        citEl('div', { class: 'pagina-cabecera' },
            citEl('div', {}, citEl('h2', { class: 'pagina-titulo' }, `Hola, ${(sesion.nombre || '').split(' ')[0]}`),
                citEl('p', { class: 'pagina-subtitulo' }, citFechaLarga(new Date()))),
            tienePermiso('citas') ? citEl('div', { class: 'pagina-acciones' },
                citEl('a', { class: 'boton boton-principal', href: '#citas?nuevo=1' }, citEl('i', { class: 'bi bi-plus-circle' }), ' Nueva cita'),
                citEl('a', { class: 'boton boton-secundario', href: '#citas' }, citEl('i', { class: 'bi bi-calendar3' }), ' Calendario')) : null),
        kpis,
        citEl('div', { class: 'cit-inicio-columnas' },
            citEl('section', { class: 'tarjeta' }, citEl('h3', { class: 'cit-subtitulo' }, citEl('i', { class: 'bi bi-calendar-day' }), ' Citas de hoy'), hoyCaja),
            citEl('section', { class: 'tarjeta' }, citEl('h3', { class: 'cit-subtitulo' }, citEl('i', { class: 'bi bi-whatsapp' }), ' Recordatorios para mañana'), mananaCaja),
            citEl('section', { class: 'tarjeta' }, citEl('h3', { class: 'cit-subtitulo' }, citEl('i', { class: 'bi bi-cake2' }), ' Cumpleaños'), cumpleCaja))));

    const fila = (c, extra) => citEl('div', { class: 'cit-fila' },
        citEl('span', { class: 'cit-fila-hora' }, citHora(new Date(c.inicio))),
        citEl('div', { class: 'cit-fila-texto' },
            citEl('strong', {}, citIconoRiesgo(c._riesgo), ` ${citNombre(c.cliente)}`),
            citEl('small', {}, `${c.servicio_nombre}${c.terapeuta ? ` · ${c.terapeuta.nombre}` : ''}${c.tienda ? ` · ${c.tienda.nombre}` : ''}`)),
        citEtiqueta(...CIT_ESTADOS[c.estado]), extra || null,
        citEl('a', { class: 'boton-icono', href: `#citas?id=${c.id}`, title: 'Abrir cita' }, citEl('i', { class: 'bi bi-box-arrow-up-right' })));

    (async () => {
        try {
            const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
            const pasado = new Date(hoy.getTime() + 2 * 86400000);
            const [citas] = await Promise.all([citCargarCitas(hoy, pasado), citCargarMensajes()]);
            const riesgos = await citRiesgosDe(citas.map((c) => c.cliente_id));
            citas.forEach((c) => { c._riesgo = riesgos.get(c.cliente_id); });
            if (!activo) return;
            const finHoy = new Date(hoy.getTime() + 86400000);
            const deHoy = citas.filter((c) => new Date(c.inicio) < finHoy);
            const deManana = citas.filter((c) => new Date(c.inicio) >= finHoy && CIT_ACTIVAS.includes(c.estado));
            const kpi = (n, t, color) => citEl('div', { class: `resumen-item ${color}` }, citEl('span', { class: 'resumen-numero' }, n), citEl('span', { class: 'resumen-texto' }, t));
            const atendidas = deHoy.filter((c) => c.estado === 'atendida');
            kpis.replaceChildren(
                kpi(deHoy.filter((c) => c.estado !== 'cancelada').length, 'Citas hoy', 'resumen-azul'),
                kpi(deHoy.filter((c) => ['solicitada', 'programada'].includes(c.estado)).length, 'Por confirmar hoy', 'resumen-naranja'),
                kpi(atendidas.length, 'Atendidas', 'resumen-verde'),
                kpi(deManana.length, 'Mañana', 'resumen-morada'),
                ...(sesion.rol === 'piloto' && !esAdministrador() ? [] : [kpi(citDinero(atendidas.reduce((s, c) => s + Number(c.precio || 0), 0)), 'Ingresos de hoy', 'resumen-turquesa')]));
            hoyCaja.replaceChildren(...(deHoy.length ? deHoy.map((c) => fila(c)) : [citEl('p', { class: 'cit-vacio' }, 'No hay citas hoy.')]));
            mananaCaja.replaceChildren(...(deManana.length ? deManana.map((c) => fila(c,
                c.recordatorio_en ? citEtiqueta('Enviado', 'etiqueta-verde')
                    : citBotonWhatsApp(c.cliente && c.cliente.telefono, citTextoRecordatorio(c), 'Enviar recordatorio', () => { citMarcarRecordatorio(c); })))
                : [citEl('p', { class: 'cit-vacio' }, 'No hay citas para mañana.')]));
            citRecordatoriosInternos(citas);
        } catch (e) {
            if (activo) hoyCaja.textContent = citFaltaSql(e) ? CIT_AVISO_SQL : 'No se pudieron cargar las citas.';
        }
        // Cumpleaños: hoy (con mensaje listo) y los próximos 7 días
        const { data } = await db.from('myst_clientes').select('id, nombre, apellidos, telefono, fecha_nacimiento').not('fecha_nacimiento', 'is', null).eq('activo', true);
        if (!activo) return;
        const proximos = (data || []).map((c) => ({ ...c, dias: citDiasACumple(c.fecha_nacimiento) })).filter((c) => c.dias <= 7).sort((a, b) => a.dias - b.dias);
        cumpleCaja.replaceChildren(...(proximos.length ? proximos.map((c) => citEl('div', { class: 'cit-fila' },
            citEl('span', { class: 'cit-fila-hora' }, c.dias === 0 ? '🎂 Hoy' : `en ${c.dias} d`),
            citEl('div', { class: 'cit-fila-texto' }, citEl('strong', {}, citNombre(c)), citEl('small', {}, `Cumple ${citEdad(c.fecha_nacimiento) + (c.dias === 0 ? 0 : 1)} años`)),
            c.dias === 0 ? citBotonWhatsApp(c.telefono, citTextoCumple(c), 'Enviar felicitación') : null))
            : [citEl('p', { class: 'cit-vacio' }, 'Nadie cumple años esta semana.')]));
    })();
    return () => { activo = false; };
}

// ==================================================
// PORTAL DEL CLIENTE (rol cliente de una empresa de masajes)
// Solo ve: su Inicio (resumen de sus visitas), solicitar citas, sus citas y Mi perfil.
// ==================================================

// Avisa al personal que un cliente pidió o canceló una cita (Administrador, G1 y la sucursal)
async function citAvisarPersonal(cita, titulo) {
    if (typeof avisar !== 'function') return;
    const { data } = await db.from('usuarios').select('id').in('rol', ['administrador', 'admin_g1', 'piloto']).neq('aprobado', false);
    const inicio = new Date(cita.inicio);
    avisar({
        tiendaId: cita.tienda_id || null, a: cita.tienda_id ? ['tienda', 'g3'] : [],
        usuarios: (data || []).map((u) => u.id), titulo,
        mensaje: `${cita.servicio_nombre} · ${citFechaLarga(inicio)} ${citHora(inicio)}`,
        enlace: `#citas?id=${cita.id}`, referenciaTipo: 'cita', referenciaId: cita.id,
    });
}

// Avisa al cliente con usuario (si tiene) que su cita cambió: confirmada, reprogramada, cancelada
async function citAvisarCliente(cita, titulo) {
    if (typeof avisar !== 'function') return;
    const { data } = await db.from('usuarios').select('id').eq('myst_cliente_id', cita.cliente_id).eq('aprobado', true);
    if (!data || !data.length) return;
    const inicio = new Date(cita.inicio);
    avisar({ usuarios: data.map((u) => u.id), titulo, mensaje: `${cita.servicio_nombre} · ${citFechaLarga(inicio)} ${citHora(inicio)}`,
        enlace: '#citas', referenciaTipo: 'cita', referenciaId: cita.id });
}

// Ventana "Solicitar cita": servicio, sucursal, fecha y hora libre (mismo bloqueo por horario)
async function citAbrirSolicitud({ alGuardar = null } = {}) {
    const sesion = obtenerSesion() || {};
    const [servicios, sucursales, horarios] = await Promise.all([
        db.from('myst_servicios').select('id, nombre, duracion_min, precio, descripcion').eq('activo', true).order('nombre').then((r) => r.data || []),
        citSucursales(),
        citCargarHorarios().catch(() => []),
    ]);
    const v = citVentana('Solicitar cita');
    if (!servicios.length) { v.cuerpo.appendChild(citEl('p', { class: 'cit-vacio' }, 'Por ahora no hay servicios disponibles. Comunícate con la empresa.')); return; }
    const fServicio = citSelect([['', '— Elige el servicio —'], ...servicios.map((s) => [s.id, `${s.nombre} · ${s.duracion_min} min · ${citDinero(s.precio)}`])]);
    const fSucursal = citSelect([['', sucursales.length ? '— Elige la sucursal —' : 'Única sede'], ...sucursales.map((s) => [s.id, s.nombre])], sucursales.length === 1 ? sucursales[0].id : '');
    const fFecha = citInput({ type: 'date', min: citFechaISO(new Date()), value: citFechaISO(new Date()) });
    const fHora = citSelect([['', 'Elige el servicio y la fecha']]);
    const fNotas = citEl('textarea', { class: 'campo-input', rows: 2, maxlength: 400, placeholder: 'Ej.: molestia en la espalda baja, prefiero presión suave...' });
    v.cuerpo.appendChild(citEl('div', { class: 'campos' },
        citCampo('Servicio *', fServicio, { ancho: true }), ...(sucursales.length > 1 ? [citCampo('Sucursal *', fSucursal)] : []),
        citCampo('Fecha *', fFecha), citCampo('Hora *', fHora, { ayuda: 'Solo se muestran las horas libres.' }),
        citCampo('Comentarios para el terapeuta', fNotas, { ancho: true })));
    v.cuerpo.appendChild(citEl('p', { class: 'cit-nota' }, citEl('i', { class: 'bi bi-info-circle' }),
        ' La empresa confirmará tu cita. Te avisaremos por aquí y por WhatsApp.'));

    const servicio = () => servicios.find((s) => s.id === Number(fServicio.value));
    async function refrescarHoras() {
        const s = servicio();
        if (!s || !fFecha.value) { fHora.replaceChildren(citEl('option', { value: '' }, 'Elige el servicio y la fecha')); return; }
        const dia = new Date(`${fFecha.value}T00:00:00`);
        const { data } = await db.from('myst_citas').select('id, inicio, fin, estado, tienda_id, terapeuta_id')
            .gte('inicio', dia.toISOString()).lt('inicio', new Date(dia.getTime() + 86400000).toISOString());
        const libres = citHorasDelDia({ horarios, citas: data || [], fecha: fFecha.value, tiendaId: Number(fSucursal.value) || null, duracion: s.duracion_min })
            .filter((h) => h.libre);
        fHora.replaceChildren(...(libres.length
            ? [citEl('option', { value: '' }, `— ${libres.length} horas libres —`), ...libres.map((h) => citEl('option', { value: h.hora }, h.hora))]
            : [citEl('option', { value: '' }, 'No hay horas libres ese día')]));
    }
    [fServicio, fSucursal, fFecha].forEach((x) => x.addEventListener('change', refrescarHoras));

    const enviar = citEl('button', { type: 'button', class: 'boton boton-principal' }, citEl('i', { class: 'bi bi-send' }), ' Solicitar');
    v.botones.append(citEl('button', { type: 'button', class: 'boton boton-secundario', onclick: v.cerrar }, 'Cancelar'), enviar);
    enviar.addEventListener('click', async () => {
        const s = servicio();
        if (!s) { v.error.textContent = 'Elige el servicio.'; return; }
        if (sucursales.length > 1 && !fSucursal.value) { v.error.textContent = 'Elige la sucursal.'; return; }
        if (!fHora.value) { v.error.textContent = 'Elige una hora libre.'; return; }
        const inicio = new Date(`${fFecha.value}T${fHora.value}:00`);
        enviar.disabled = true;
        const { data, error } = await db.from('myst_citas').insert({
            cliente_id: sesion.myst_cliente_id, servicio_id: s.id, servicio_nombre: s.nombre,
            tienda_id: Number(fSucursal.value) || null, estado: 'solicitada', precio: s.precio,
            inicio: inicio.toISOString(), fin: new Date(inicio.getTime() + s.duracion_min * 60000).toISOString(),
            notas: fNotas.value.trim() || null, creado_por: sesion.id || null, creado_por_nombre: sesion.nombre || null,
        }).select().single();
        enviar.disabled = false;
        if (error) { v.error.textContent = citFaltaSql(error) ? CIT_AVISO_SQL : 'No se pudo enviar la solicitud. Intenta de nuevo.'; return; }
        citAvisarPersonal(data, `Cita solicitada por ${sesion.nombre || 'un cliente'}`);
        v.cerrar();
        if (alGuardar) alGuardar(data);
    });
}

// Inicio del cliente: resumen de sus visitas, próxima cita y servicios que más usa
function montarInicioClienteCitas(zona) {
    let activo = true;
    const sesion = obtenerSesion() || {};
    const kpis = citEl('div', { class: 'resumen' });
    const proxima = citEl('div', { class: 'cit-lista' }, 'Cargando...');
    const favoritos = citEl('div', { class: 'cit-lista' });
    const ultimas = citEl('div', { class: 'cit-lista' });
    const saludo = citEl('p', { class: 'pagina-subtitulo' }, citFechaLarga(new Date()));
    zona.replaceChildren(citEl('div', { class: 'pagina cit-inicio' },
        citEl('div', { class: 'pagina-cabecera' },
            citEl('div', {}, citEl('h2', { class: 'pagina-titulo' }, `Hola, ${(sesion.nombre || '').split(' ')[0]}`), saludo),
            citEl('div', { class: 'pagina-acciones' },
                citEl('button', { type: 'button', class: 'boton boton-principal', onclick: () => citAbrirSolicitud({ alGuardar: cargar }) },
                    citEl('i', { class: 'bi bi-calendar-plus' }), ' Solicitar cita'),
                citEl('a', { class: 'boton boton-secundario', href: '#citas' }, citEl('i', { class: 'bi bi-calendar3' }), ' Mis citas'))),
        kpis,
        citEl('div', { class: 'cit-inicio-columnas' },
            citEl('section', { class: 'tarjeta' }, citEl('h3', { class: 'cit-subtitulo' }, citEl('i', { class: 'bi bi-calendar-check' }), ' Próximas citas'), proxima),
            citEl('section', { class: 'tarjeta' }, citEl('h3', { class: 'cit-subtitulo' }, citEl('i', { class: 'bi bi-flower1' }), ' Tus servicios'), favoritos),
            citEl('section', { class: 'tarjeta' }, citEl('h3', { class: 'cit-subtitulo' }, citEl('i', { class: 'bi bi-clock-history' }), ' Últimas visitas'), ultimas))));

    const kpi = (n, t, color) => citEl('div', { class: `resumen-item ${color}` }, citEl('span', { class: 'resumen-numero' }, n), citEl('span', { class: 'resumen-texto' }, t));
    const filaCita = (c) => citEl('div', { class: 'cit-fila' },
        citEl('span', { class: 'cit-fila-hora' }, new Date(c.inicio).toLocaleDateString('es-CR', { day: 'numeric', month: 'short' })),
        citEl('div', { class: 'cit-fila-texto' }, citEl('strong', {}, c.servicio_nombre),
            citEl('small', {}, `${citHora(new Date(c.inicio))}${c.tienda ? ` · ${c.tienda.nombre}` : ''}${c.terapeuta ? ` · ${c.terapeuta.nombre}` : ''}`)),
        citEtiqueta(...CIT_ESTADOS[c.estado]));

    async function cargar() {
        let citas;
        try {
            citas = await citCargarCitas(new Date(2000, 0, 1), new Date(Date.now() + 400 * 86400000));
        } catch (e) {
            if (activo) proxima.textContent = citFaltaSql(e) ? CIT_AVISO_SQL : 'No se pudieron cargar tus citas.';
            return;
        }
        if (!activo) return;
        const ahora = Date.now();
        const atendidas = citas.filter((c) => c.estado === 'atendida').sort((a, b) => new Date(b.inicio) - new Date(a.inicio));
        const futuras = citas.filter((c) => CIT_ACTIVAS.includes(c.estado) && new Date(c.inicio).getTime() > ahora);
        const esteAnio = atendidas.filter((c) => new Date(c.inicio).getFullYear() === new Date().getFullYear()).length;
        kpis.replaceChildren(
            kpi(atendidas.length, 'Visitas en total', 'resumen-verde'),
            kpi(esteAnio, 'Visitas este año', 'resumen-azul'),
            kpi(futuras.length, 'Citas próximas', 'resumen-morada'),
            kpi(atendidas[0] ? new Date(atendidas[0].inicio).toLocaleDateString('es-CR', { day: 'numeric', month: 'short' }) : '—', 'Última visita', 'resumen-turquesa'));
        proxima.replaceChildren(...(futuras.length ? futuras.map(filaCita) : [citEl('p', { class: 'cit-vacio' }, 'No tienes citas próximas. ¡Agenda la tuya!')]));
        const cuenta = new Map();
        atendidas.forEach((c) => cuenta.set(c.servicio_nombre, (cuenta.get(c.servicio_nombre) || 0) + 1));
        favoritos.replaceChildren(...(cuenta.size ? [...cuenta].sort((a, b) => b[1] - a[1]).map(([s, n]) => citEl('div', { class: 'cit-fila' },
            citEl('div', { class: 'cit-fila-texto' }, citEl('strong', {}, s)), citEtiqueta(plural(n, 'visita', 'visitas'), 'etiqueta-verde')))
            : [citEl('p', { class: 'cit-vacio' }, 'Aún no tienes visitas.')]));
        ultimas.replaceChildren(...(atendidas.length ? atendidas.slice(0, 5).map(filaCita) : [citEl('p', { class: 'cit-vacio' }, 'Aún no tienes visitas.')]));
        // Su cumpleaños: saludo en pantalla
        const { data: yo } = await db.from('myst_clientes').select('nombre, fecha_nacimiento').eq('id', sesion.myst_cliente_id || 0).maybeSingle();
        if (activo && yo && citDiasACumple(yo.fecha_nacimiento) === 0) saludo.textContent = `¡Feliz cumpleaños, ${yo.nombre}! 🎉`;
    }
    cargar();
    return () => { activo = false; document.querySelectorAll('dialog.cit-ventana').forEach((d) => d.close()); };
}

// Citas del cliente: solicitar, ver las suyas y cancelar las que aún no se atienden
function montarCitasCliente(zona) {
    let activo = true;
    const sesion = obtenerSesion() || {};
    const lista = citEl('div', { class: 'cit-lista' }, 'Cargando...');
    const historial = citEl('div', { class: 'cit-lista' });
    zona.replaceChildren(citEl('div', { class: 'pagina' },
        citEl('div', { class: 'pagina-cabecera' },
            citEl('div', {}, citEl('h2', { class: 'pagina-titulo' }, 'Mis citas'), citEl('p', { class: 'pagina-subtitulo' }, 'Solicita una cita y revisa las tuyas')),
            citEl('div', { class: 'pagina-acciones' }, citEl('button', { type: 'button', class: 'boton boton-principal', onclick: () => citAbrirSolicitud({ alGuardar: cargar }) },
                citEl('i', { class: 'bi bi-calendar-plus' }), ' Solicitar cita'))),
        citEl('section', { class: 'tarjeta' }, citEl('h3', { class: 'cit-subtitulo' }, 'Próximas'), lista),
        citEl('section', { class: 'tarjeta' }, citEl('h3', { class: 'cit-subtitulo' }, 'Anteriores'), historial)));

    async function cancelar(c) {
        const motivo = prompt('¿Por qué cancelas la cita? (opcional)');
        if (motivo === null) return;
        const { error } = await db.from('myst_citas').update({ estado: 'cancelada', motivo_cancelacion: motivo.trim() || 'Cancelada por el cliente' })
            .eq('id', c.id).eq('cliente_id', sesion.myst_cliente_id || 0);
        if (error) { alert('No se pudo cancelar. Intenta de nuevo.'); return; }
        citAvisarPersonal(c, `Cita cancelada por ${sesion.nombre || 'el cliente'}`);
        cargar();
    }

    const fila = (c, puedeCancelar) => citEl('div', { class: 'cit-fila' },
        citEl('span', { class: 'cit-fila-hora' }, new Date(c.inicio).toLocaleDateString('es-CR', { day: 'numeric', month: 'short' })),
        citEl('div', { class: 'cit-fila-texto' }, citEl('strong', {}, `${citHora(new Date(c.inicio))} · ${c.servicio_nombre}`),
            citEl('small', {}, [c.tienda && c.tienda.nombre, c.terapeuta && `Terapeuta: ${c.terapeuta.nombre}`, citDinero(c.precio)].filter(Boolean).join(' · '))),
        citEtiqueta(...CIT_ESTADOS[c.estado]),
        puedeCancelar ? citEl('button', { type: 'button', class: 'boton boton-chico boton-peligro', onclick: () => cancelar(c) }, 'Cancelar') : null);

    async function cargar() {
        let citas;
        try {
            citas = await citCargarCitas(new Date(2000, 0, 1), new Date(Date.now() + 400 * 86400000));
        } catch (e) {
            if (activo) lista.textContent = citFaltaSql(e) ? CIT_AVISO_SQL : 'No se pudieron cargar tus citas.';
            return;
        }
        if (!activo) return;
        const ahora = Date.now();
        const futuras = citas.filter((c) => CIT_ACTIVAS.includes(c.estado) && new Date(c.inicio).getTime() > ahora);
        const pasadas = citas.filter((c) => !futuras.includes(c)).reverse();
        lista.replaceChildren(...(futuras.length ? futuras.map((c) => fila(c, true)) : [citEl('p', { class: 'cit-vacio' }, 'No tienes citas próximas.')]));
        historial.replaceChildren(...(pasadas.length ? pasadas.map((c) => fila(c, false)) : [citEl('p', { class: 'cit-vacio' }, 'Aún no tienes citas anteriores.')]));
    }
    cargar();
    if (parametrosSeccion().get('nuevo')) citAbrirSolicitud({ alGuardar: cargar });
    return () => { activo = false; document.querySelectorAll('dialog.cit-ventana').forEach((d) => d.close()); };
}

// ==================================================
// REPORTE DE CITAS
// ==================================================

function montarReporteCitas(zona) {
    let activo = true;
    let citas = [];
    const hoy = new Date();
    const desde = citInput({ type: 'date', value: citFechaISO(new Date(hoy.getFullYear(), hoy.getMonth(), 1)) });
    const hasta = citInput({ type: 'date', value: citFechaISO(hoy) });
    const sucursal = citSelect([['', 'Todas las sucursales']], '');
    const kpis = citEl('div', { class: 'resumen' });
    const tablas = citEl('div', { class: 'cit-rep-tablas' });
    const exportar = citEl('button', { type: 'button', class: 'boton boton-secundario', hidden: typeof funcionHabilitada === 'function' && !funcionHabilitada('exportar') },
        citEl('i', { class: 'bi bi-filetype-csv' }), ' Exportar (Excel CSV)');
    zona.replaceChildren(citEl('div', { class: 'pagina' },
        citEl('div', { class: 'pagina-cabecera' },
            citEl('div', {}, citEl('h2', { class: 'pagina-titulo' }, 'Reportes'), citEl('p', { class: 'pagina-subtitulo' }, 'Citas, servicios, terapeutas e ingresos')),
            citEl('div', { class: 'pagina-acciones' }, exportar)),
        citEl('div', { class: 'filtros' }, citCampo('Desde', desde), citCampo('Hasta', hasta), citCampo('Sucursal', sucursal)),
        kpis, tablas));

    citSucursales().then((s) => s.forEach((x) => sucursal.appendChild(citEl('option', { value: x.id }, x.nombre))));

    const tabla = (titulo, columnas, filas) => citEl('section', { class: 'tarjeta' }, citEl('h3', { class: 'cit-subtitulo' }, titulo),
        citEl('div', { class: 'tabla-caja' }, citEl('table', { class: 'tabla' },
            citEl('thead', {}, citEl('tr', {}, ...columnas.map((c) => citEl('th', {}, c)))),
            citEl('tbody', {}, ...(filas.length ? filas.map((f) => citEl('tr', {}, ...f.map((x) => citEl('td', {}, x))))
                : [citEl('tr', {}, citEl('td', { colSpan: columnas.length }, 'Sin datos'))])))));

    // Agrupa: [[clave, cantidad, atendidas, ingresos]]
    function agrupar(fn) {
        const m = new Map();
        citas.forEach((c) => {
            const k = fn(c) || '—';
            const g = m.get(k) || [k, 0, 0, 0];
            g[1]++;
            if (c.estado === 'atendida') { g[2]++; g[3] += Number(c.precio || 0); }
            m.set(k, g);
        });
        return [...m.values()].sort((a, b) => b[3] - a[3] || b[1] - a[1]).map((g) => [g[0], g[1], g[2], citDinero(g[3])]);
    }

    async function cargar() {
        tablas.textContent = 'Cargando...';
        try {
            const a = new Date(`${desde.value}T00:00:00`);
            const b = new Date(new Date(`${hasta.value}T00:00:00`).getTime() + 86400000);
            citas = await citCargarCitas(a, b, { tiendaId: Number(sucursal.value) || null });
        } catch (e) {
            if (activo) tablas.textContent = citFaltaSql(e) ? CIT_AVISO_SQL : 'No se pudo cargar el reporte.';
            return;
        }
        if (!activo) return;
        const cuenta = (e) => citas.filter((c) => c.estado === e).length;
        const ingresos = citas.filter((c) => c.estado === 'atendida').reduce((s, c) => s + Number(c.precio || 0), 0);
        const kpi = (n, t, color) => citEl('div', { class: `resumen-item ${color}` }, citEl('span', { class: 'resumen-numero' }, n), citEl('span', { class: 'resumen-texto' }, t));
        kpis.replaceChildren(kpi(citas.length, 'Citas', 'resumen-azul'), kpi(cuenta('atendida'), 'Atendidas', 'resumen-verde'),
            kpi(cuenta('cancelada'), 'Canceladas', 'resumen-gris'), kpi(cuenta('no_asistio'), 'No asistieron', 'resumen-naranja'),
            kpi(citDinero(ingresos), 'Ingresos', 'resumen-turquesa'));
        const cols = ['', 'Citas', 'Atendidas', 'Ingresos'];
        tablas.replaceChildren(
            tabla('Por servicio', ['Servicio', ...cols.slice(1)], agrupar((c) => c.servicio_nombre)),
            tabla('Por terapeuta', ['Terapeuta', ...cols.slice(1)], agrupar((c) => c.terapeuta && c.terapeuta.nombre)),
            tabla('Por forma de pago', ['Forma de pago', ...cols.slice(1)], agrupar((c) => (c.estado === 'atendida' ? CIT_COBROS[c.cobro_forma] || 'Sin indicar' : null)).filter((g) => g[0] !== '—')),
            tabla('Por sucursal', ['Sucursal', ...cols.slice(1)], agrupar((c) => c.tienda && c.tienda.nombre)));
    }

    exportar.addEventListener('click', () => {
        const filas = [['Fecha', 'Hora', 'Cliente', 'Teléfono', 'Servicio', 'Terapeuta', 'Sucursal', 'Estado', 'Precio', 'Forma de pago'],
            ...citas.map((c) => { const d = new Date(c.inicio); return [citFechaISO(d), citHora(d), citNombre(c.cliente), c.cliente && c.cliente.telefono,
                c.servicio_nombre, c.terapeuta && c.terapeuta.nombre, c.tienda && c.tienda.nombre, CIT_ESTADOS[c.estado][0], c.precio, CIT_COBROS[c.cobro_forma] || '']; })];
        const csv = filas.map((f) => f.map((x) => `"${String(x == null ? '' : x).replace(/"/g, '""')}"`).join(';')).join('\r\n');
        const a = citEl('a', { href: URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })), download: `citas_${desde.value}_${hasta.value}.csv` });
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    });
    [desde, hasta, sucursal].forEach((x) => x.addEventListener('change', cargar));
    cargar();
    return () => { activo = false; };
}

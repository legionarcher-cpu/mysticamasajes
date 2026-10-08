/* ==================================================
   CONFIGURACIÓN -> SERVICIOS Y HORARIO DE ATENCIÓN (sala de masajes)
   MYSTICA MASAJES

   Lo carga js/secciones/configuracion.js (tarjeta "servicios"; solo empresas de citas,
   Administrador y Admin G1, plan "cfg_servicios"). Tablas myst_ (sql/02_mystica_masajes.sql):
     1. Servicios (myst_servicios): nombre, duración, precio, activo. Reemplazan a las
        "actividades" de la logística.
     2. Horario de atención (myst_horarios): por día, uno o varios bloques
        "inicia desde / termina" y cuántas citas a la vez. General o por sucursal
        (la de la sucursal gana). Fuera de esto no se puede agendar.
     3. Mensajes de WhatsApp (myst_config): recordatorio y cumpleaños.
   ================================================== */

registrarModuloConfig('servicios', (seccion, ctx) => {
    const { aviso } = ctx;
    const caja = seccion.querySelector('#cfgSrvContenido');
    const DIAS = ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
    let servicios = [];
    let horarios = [];
    let sucursales = [];
    let sucursal = ''; // '' = horario general
    let activo = true;

    const srvCaja = citEl('div');
    const horCaja = citEl('div');
    const msjCaja = citEl('div');
    const selSuc = citSelect([['', 'Horario general (todas las sucursales)']], '');
    caja.replaceChildren(
        citEl('section', { class: 'tarjeta' }, citEl('div', { class: 'cit-cfg-cabeza' },
            citEl('h3', { class: 'cit-subtitulo' }, citEl('i', { class: 'bi bi-flower1' }), ' Servicios'),
            citEl('button', { type: 'button', class: 'boton boton-principal boton-chico', onclick: () => editarServicio() }, citEl('i', { class: 'bi bi-plus-circle' }), ' Nuevo servicio')), srvCaja),
        citEl('section', { class: 'tarjeta' }, citEl('div', { class: 'cit-cfg-cabeza' },
            citEl('h3', { class: 'cit-subtitulo' }, citEl('i', { class: 'bi bi-clock' }), ' Horario de atención'), selSuc),
        citEl('p', { class: 'cit-gris' }, 'Las citas solo se agendan entre "inicia desde" y "termina" (contando la duración del servicio). "A la vez" = camillas o terapeutas disponibles. Un día sin bloques queda cerrado.'), horCaja),
        citEl('section', { class: 'tarjeta' }, citEl('h3', { class: 'cit-subtitulo' }, citEl('i', { class: 'bi bi-whatsapp' }), ' Mensajes de WhatsApp'), msjCaja));

    async function cargar() {
        const [s, h, suc] = await Promise.all([
            db.from('myst_servicios').select('*').order('activo', { ascending: false }).order('nombre'),
            citCargarHorarios().catch((e) => ({ error: e })),
            citSucursales(),
            citCargarMensajes(),
        ]);
        if (!activo) return;
        if (s.error || h.error) { caja.prepend(citEl('p', { class: 'cit-alerta cit-alerta-contraindicado' }, CIT_AVISO_SQL)); return; }
        servicios = s.data || []; horarios = h; sucursales = suc;
        if (selSuc.options.length === 1) sucursales.forEach((x) => selSuc.appendChild(citEl('option', { value: x.id }, `Solo ${x.nombre}`)));
        dibujarServicios(); dibujarHorario(); dibujarMensajes();
    }

    // ---------- 1. Servicios ----------
    function dibujarServicios() {
        srvCaja.replaceChildren(citEl('div', { class: 'tabla-caja' }, citEl('table', { class: 'tabla' },
            citEl('thead', {}, citEl('tr', {}, ...['Servicio', 'Duración', 'Precio', 'Estado', ''].map((t) => citEl('th', {}, t)))),
            citEl('tbody', {}, ...(servicios.length ? servicios.map((s) => citEl('tr', {},
                citEl('td', {}, citEl('strong', {}, s.nombre), s.descripcion ? citEl('span', { class: 'celda-detalle' }, s.descripcion) : null),
                crearCelda(`${s.duracion_min} min`), crearCelda(citDinero(s.precio)),
                citEl('td', {}, citEtiqueta(s.activo ? 'Activo' : 'Inactivo', s.activo ? 'etiqueta-verde' : 'etiqueta-gris')),
                citEl('td', { class: 'tabla-col-acciones' }, citEl('div', { class: 'tabla-botones' },
                    citEl('button', { type: 'button', class: 'boton-icono boton-icono-editar', title: 'Modificar', onclick: () => editarServicio(s) }, citEl('i', { class: 'bi bi-pencil' })),
                    citEl('button', { type: 'button', class: 'boton-icono boton-icono-eliminar', title: 'Eliminar', onclick: () => eliminarServicio(s) }, citEl('i', { class: 'bi bi-trash3' }))))))
                : [citEl('tr', {}, citEl('td', { colSpan: 5 }, 'Sin servicios. Agrega el primero.'))])))),
            ...(servicios.length ? [] : [citEl('button', { type: 'button', class: 'boton boton-secundario boton-chico', onclick: cargarEjemplos },
                citEl('i', { class: 'bi bi-magic' }), ' Cargar servicios y horario de ejemplo')]));
    }

    // Servicios de ejemplo y horario lunes a sábado 09:00–19:00 (2 a la vez), si no hay
    async function cargarEjemplos() {
        const ejemplos = [
            ['Masaje relajante', 'Presión suave a media, cuerpo completo.', 60, 25000],
            ['Masaje descontracturante', 'Trabajo profundo en espalda, cuello y hombros.', 60, 30000],
            ['Masaje deportivo', 'Preparación o recuperación muscular.', 60, 32000],
            ['Piedras calientes', 'Masaje con piedras volcánicas.', 75, 35000],
            ['Drenaje linfático', 'Técnica manual suave (con indicación médica si aplica).', 60, 30000],
        ].map(([nombre, descripcion, duracion_min, precio]) => ({ nombre, descripcion, duracion_min, precio }));
        const r1 = await db.from('myst_servicios').insert(ejemplos);
        const r2 = horarios.some((h) => !h.tienda_id) ? { error: null }
            : await db.from('myst_horarios').insert([1, 2, 3, 4, 5, 6].map((dia) => ({ dia, inicia_desde: '09:00', termina: '19:00', capacidad: 2 })));
        if (r1.error || r2.error) aviso.mostrar(citFaltaSql(r1.error || r2.error) ? CIT_AVISO_SQL : 'No se pudieron cargar los ejemplos.', 'error');
        else aviso.mostrar('Ejemplos cargados: ajústalos a tu gusto.', 'ok');
        cargar();
    }

    function editarServicio(s = null) {
        const v = citVentana(s ? `Modificar ${s.nombre}` : 'Nuevo servicio');
        const f = {
            nombre: citInput({ value: s ? s.nombre : '', maxlength: 80 }),
            duracion_min: citInput({ type: 'number', min: 10, max: 480, step: 5, value: s ? s.duracion_min : 60 }),
            precio: citInput({ type: 'number', min: 0, step: 500, value: s ? s.precio : 0 }),
            activo: citSelect([['true', 'Activo'], ['false', 'Inactivo (no se ofrece)']], s ? String(s.activo) : 'true'),
            descripcion: citEl('textarea', { class: 'campo-input', rows: 2, maxlength: 300 }, (s && s.descripcion) || ''),
        };
        v.cuerpo.appendChild(citEl('div', { class: 'campos' }, citCampo('Nombre *', f.nombre), citCampo('Duración (min) *', f.duracion_min),
            citCampo('Precio (₡)', f.precio), citCampo('Estado', f.activo), citCampo('Descripción', f.descripcion, { ancho: true })));
        const ok = citEl('button', { type: 'button', class: 'boton boton-principal' }, 'Guardar');
        v.botones.append(citEl('button', { type: 'button', class: 'boton boton-secundario', onclick: v.cerrar }, 'Cancelar'), ok);
        ok.addEventListener('click', async () => {
            const fila = { nombre: f.nombre.value.trim(), duracion_min: Number(f.duracion_min.value), precio: Number(f.precio.value) || 0,
                activo: f.activo.value === 'true', descripcion: f.descripcion.value.trim() || null };
            if (!fila.nombre || !(fila.duracion_min >= 10 && fila.duracion_min <= 480)) { v.error.textContent = 'Nombre y duración (10 a 480 min) son obligatorios.'; return; }
            const { error } = s ? await db.from('myst_servicios').update(fila).eq('id', s.id) : await db.from('myst_servicios').insert(fila);
            if (error) { v.error.textContent = error.code === '23505' ? 'Ya existe un servicio con ese nombre.' : 'No se pudo guardar.'; return; }
            v.cerrar(); aviso.mostrar('Servicio guardado.', 'ok'); cargar();
        });
    }

    async function eliminarServicio(s) {
        if (!confirm(`¿Eliminar "${s.nombre}"? Las citas que ya lo tienen conservan su nombre. Para dejar de ofrecerlo sin borrarlo, márcalo Inactivo.`)) return;
        const { error } = await db.from('myst_servicios').delete().eq('id', s.id);
        if (error) aviso.mostrar('No se pudo eliminar.', 'error'); else cargar();
    }

    // ---------- 2. Horario de atención ----------
    const delGrupo = () => horarios.filter((h) => (sucursal ? h.tienda_id === Number(sucursal) : !h.tienda_id));

    function dibujarHorario() {
        const grupo = delGrupo();
        const filas = [];
        for (let d = 1; d <= 7; d++) {
            const bloques = grupo.filter((h) => h.dia === d);
            filas.push(citEl('div', { class: 'cit-horario-dia' },
                citEl('strong', {}, DIAS[d]),
                citEl('div', { class: 'cit-horario-bloques' }, ...(bloques.length ? bloques.map((h) => citEl('span', { class: 'cit-bloque' },
                    `${h.inicia_desde.slice(0, 5)} – ${h.termina.slice(0, 5)} · ${h.capacidad} a la vez `,
                    citEl('button', { type: 'button', class: 'boton-icono', title: 'Modificar', onclick: () => editarBloque(d, h) }, citEl('i', { class: 'bi bi-pencil' })),
                    citEl('button', { type: 'button', class: 'boton-icono boton-icono-eliminar', title: 'Quitar', onclick: () => quitarBloque(h) }, citEl('i', { class: 'bi bi-x-lg' }))))
                    : [citEtiqueta('Cerrado', 'etiqueta-gris')])),
                citEl('button', { type: 'button', class: 'boton boton-chico boton-secundario', onclick: () => editarBloque(d) }, citEl('i', { class: 'bi bi-plus' }), ' Bloque')));
        }
        const lunes = grupo.filter((h) => h.dia === 1);
        horCaja.replaceChildren(...[...filas,
            sucursal && !grupo.length ? citEl('p', { class: 'cit-gris' }, 'Esta sucursal usa el horario general hasta que le agregues bloques propios.') : null,
            lunes.length ? citEl('button', { type: 'button', class: 'boton boton-secundario boton-chico', onclick: copiarLunes },
                citEl('i', { class: 'bi bi-copy' }), ' Copiar el lunes a martes–sábado') : null].filter(Boolean));
    }

    function editarBloque(dia, h = null) {
        const v = citVentana(`${DIAS[dia]}: ${h ? 'modificar' : 'nuevo'} bloque`);
        const desde = citInput({ type: 'time', value: h ? h.inicia_desde.slice(0, 5) : '09:00', step: 900 });
        const hasta = citInput({ type: 'time', value: h ? h.termina.slice(0, 5) : '18:00', step: 900 });
        const cap = citInput({ type: 'number', min: 1, max: 50, value: h ? h.capacidad : 1 });
        v.cuerpo.appendChild(citEl('div', { class: 'campos' }, citCampo('Inicia desde', desde), citCampo('Termina', hasta), citCampo('Citas a la vez', cap)));
        const ok = citEl('button', { type: 'button', class: 'boton boton-principal' }, 'Guardar');
        v.botones.append(citEl('button', { type: 'button', class: 'boton boton-secundario', onclick: v.cerrar }, 'Cancelar'), ok);
        ok.addEventListener('click', async () => {
            const a = citMinutos(desde.value); const b = citMinutos(hasta.value);
            if (!(b > a)) { v.error.textContent = '"Termina" debe ser después de "Inicia desde".'; return; }
            if (delGrupo().some((x) => x.dia === dia && (!h || x.id !== h.id) && citMinutos(x.inicia_desde) < b && citMinutos(x.termina) > a)) {
                v.error.textContent = 'Se cruza con otro bloque de ese día.'; return;
            }
            const fila = { dia, inicia_desde: desde.value, termina: hasta.value, capacidad: Number(cap.value) || 1, tienda_id: Number(sucursal) || null };
            const { error } = h ? await db.from('myst_horarios').update(fila).eq('id', h.id) : await db.from('myst_horarios').insert(fila);
            if (error) { v.error.textContent = 'No se pudo guardar.'; return; }
            v.cerrar(); cargar();
        });
    }

    async function quitarBloque(h) {
        if (!confirm('¿Quitar este bloque? Las citas ya agendadas no se borran.')) return;
        const { error } = await db.from('myst_horarios').delete().eq('id', h.id);
        if (error) aviso.mostrar('No se pudo quitar.', 'error'); else cargar();
    }

    async function copiarLunes() {
        if (!confirm('Se reemplaza el horario de martes a sábado por el del lunes. ¿Seguir?')) return;
        const grupo = delGrupo();
        const borrar = grupo.filter((h) => h.dia >= 2 && h.dia <= 6).map((h) => h.id);
        if (borrar.length) await db.from('myst_horarios').delete().in('id', borrar);
        const nuevos = [];
        grupo.filter((h) => h.dia === 1).forEach((h) => { for (let d = 2; d <= 6; d++) nuevos.push({ dia: d, inicia_desde: h.inicia_desde, termina: h.termina, capacidad: h.capacidad, tienda_id: h.tienda_id }); });
        const { error } = await db.from('myst_horarios').insert(nuevos);
        if (error) aviso.mostrar('No se pudo copiar.', 'error'); else { aviso.mostrar('Horario copiado.', 'ok'); cargar(); }
    }
    selSuc.addEventListener('change', () => { sucursal = selSuc.value; dibujarHorario(); });

    // ---------- 3. Mensajes ----------
    function dibujarMensajes() {
        const campos = {
            mensaje_recordatorio: ['Recordatorio de cita', 'Puedes usar {nombre} {servicio} {fecha} {hora} {sucursal} {empresa}'],
            mensaje_cumpleanos: ['Cumpleaños', 'Solo se usa {nombre} (el nombre del cliente).'],
        };
        const ejemplo = { nombre: 'Ana', servicio: 'Masaje relajante', fecha: citFechaLarga(new Date()), hora: '10:00', sucursal: 'Sucursal Centro', empresa: EMPRESA.nombre };
        msjCaja.replaceChildren(...Object.entries(campos).map(([clave, [titulo, ayuda]]) => {
            const t = citEl('textarea', { class: 'campo-input', rows: 3, maxlength: 700 }, citMensajes[clave]);
            const vista = citEl('p', { class: 'cit-vista-previa' });
            const previa = () => { vista.textContent = citLlenar(t.value, ejemplo); };
            t.addEventListener('input', previa); previa();
            return citEl('div', { class: 'cit-mensaje' }, citCampo(titulo, t, { ancho: true, ayuda }), vista,
                citEl('div', { class: 'dialogo-botones' },
                    citEl('button', { type: 'button', class: 'boton boton-secundario boton-chico', onclick: () => { t.value = CIT_MENSAJES_BASE[clave]; previa(); } }, 'Original'),
                    citEl('button', { type: 'button', class: 'boton boton-principal boton-chico', onclick: async () => {
                        const { error } = await db.from('myst_config').upsert({ clave, valor: t.value.trim() || CIT_MENSAJES_BASE[clave] }, { onConflict: 'empresa_id,clave' });
                        if (error) aviso.mostrar('No se pudo guardar el mensaje.', 'error');
                        else { citMensajes[clave] = t.value.trim() || CIT_MENSAJES_BASE[clave]; aviso.mostrar('Mensaje guardado.', 'ok'); }
                    } }, 'Guardar')));
        }));
    }

    cargar();
    return () => { activo = false; document.querySelectorAll('dialog.cit-ventana').forEach((d) => d.close()); };
});

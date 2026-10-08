/* ==================================================
   SECCIÓN: CITAS (sala de masajes) - LÓGICA
   MYSTICA MASAJES

   Calendario Mes / Semana / Día de myst_citas (sql/02_mystica_masajes.sql).
   - Una cita solo se agenda DENTRO del horario de atención del día (myst_horarios:
     inicia desde / termina, contando la duración del servicio), si la sucursal no
     está llena (capacidad del bloque) y si el terapeuta está libre
     (citHorasDelDia, js/citas-comun.js; la base también lo revisa).
   - Al elegir el cliente se ven sus alertas de salud; si tiene algo "No masajear"
     hay que confirmar la autorización antes de guardar.
   - Estados: programada -> confirmada -> atendida (forma de pago + tratamiento
     aplicado, que queda en el historial del cliente) | no asistió | cancelada.
   - WhatsApp: recordatorio con el mensaje de Configuración -> Servicios.
   - Avisos: el terapeuta y la sucursal reciben la cita nueva o reprogramada en la campana.
   Quién: todos los de la empresa; el terapeuta (rol piloto) solo ve las suyas y
   solo cambia el estado (no crea ni mueve citas).
   #citas?nuevo=1 abre una cita nueva; #citas?id=15 abre esa cita.
   ================================================== */

const CIT_DIAS_CORTOS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

registrarSeccion('citas', (zona) => {
    // Cliente con usuario: solo solicita y ve SUS citas (js/citas-comun.js)
    if (esCliente()) return montarCitasCliente(zona);

    const $ = (s) => zona.querySelector(s);
    const sesion = obtenerSesion() || {};
    const esTerapeuta = sesion.rol === 'piloto';
    const puedeAgendar = !esTerapeuta;
    let activo = true;

    let vista = 'semana';
    let ref = new Date(); ref.setHours(0, 0, 0, 0);
    let citas = [];
    let riesgos = new Map();
    let horarios = [];
    let servicios = [];
    let sucursales = [];
    let terapeutas = [];
    let clientes = [];

    const selSucursal = $('#citSucursal');
    const cal = $('#citCalendario');
    $('#citNueva').hidden = !puedeAgendar;

    // ==================================================
    // RANGO Y CARGA
    // ==================================================

    const lunes = (d) => { const x = new Date(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
    const sumarDias = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

    function rango() {
        if (vista === 'dia') return [ref, sumarDias(ref, 1)];
        if (vista === 'semana') { const a = lunes(ref); return [a, sumarDias(a, 7)]; }
        const a = lunes(new Date(ref.getFullYear(), ref.getMonth(), 1));
        return [a, sumarDias(a, 42)];
    }

    async function cargarBase() {
        const [h, s, suc, t, c] = await Promise.all([
            citCargarHorarios(),
            db.from('myst_servicios').select('id, nombre, duracion_min, precio, activo').order('nombre'),
            citSucursales(),
            db.from('usuarios').select('id, nombre, tienda_id').eq('rol', 'piloto').neq('aprobado', false).order('nombre'),
            db.from('myst_clientes').select('id, nombre, apellidos, telefono, tienda_id').eq('activo', true).order('nombre'),
            citCargarMensajes(),
        ]);
        if (s.error) throw s.error;
        horarios = h; servicios = s.data || []; sucursales = suc; terapeutas = t.data || []; clientes = c.data || [];
        selSucursal.replaceChildren(citEl('option', { value: '' }, 'Todas las sucursales'), ...sucursales.map((x) => citEl('option', { value: x.id }, x.nombre)));
        if (sesion.tienda && !esAdministrador()) selSucursal.value = String(sesion.tienda.id);
        selSucursal.hidden = sucursales.length < 2;
    }

    async function cargarCitas() {
        const [a, b] = rango();
        citas = await citCargarCitas(a, b, { tiendaId: Number(selSucursal.value) || null });
        riesgos = await citRiesgosDe(citas.map((c) => c.cliente_id));
        if (activo) dibujar();
    }

    // ==================================================
    // DIBUJAR
    // ==================================================

    const tiendaFiltro = () => Number(selSucursal.value) || null;
    const delDia = (fechaISO) => citas.filter((c) => citFechaISO(new Date(c.inicio)) === fechaISO);
    const textoHorario = (fechaISO) => {
        const b = citBloquesDelDia(horarios, fechaISO, tiendaFiltro());
        return b.length ? b.map((x) => `${citHoraDeMin(x.desde)}–${citHoraDeMin(x.hasta)}`).join(' · ') : 'Cerrado';
    };

    const chip = (c) => citEl('button', {
        type: 'button', class: `cit-chip cit-chip-${c.estado}`, title: `${citNombre(c.cliente)} · ${c.servicio_nombre}`,
        onclick: (e) => { e.stopPropagation(); abrirCita(c); },
    }, citIconoRiesgo(riesgos.get(c.cliente_id)), citEl('b', {}, citHora(new Date(c.inicio))), ` ${citNombre(c.cliente)}`);

    function dibujar() {
        zona.querySelectorAll('.cit-vista').forEach((b) => b.classList.toggle('activa', b.dataset.vista === vista));
        const [a, b] = rango();
        const hoyISO = citFechaISO(new Date());
        $('#citTitulo').textContent = vista === 'mes'
            ? ref.toLocaleDateString('es-CR', { month: 'long', year: 'numeric' })
            : vista === 'semana' ? `${a.toLocaleDateString('es-CR', { day: 'numeric', month: 'short' })} – ${sumarDias(b, -1).toLocaleDateString('es-CR', { day: 'numeric', month: 'short', year: 'numeric' })}`
                : citFechaLarga(ref);
        const activas = citas.filter((c) => c.estado !== 'cancelada').length;
        $('#citSubtitulo').textContent = `${plural(activas, 'cita', 'citas')} en este período${esTerapeuta ? ' (las tuyas)' : ''}`;

        if (vista === 'dia') { dibujarDia(); return; }
        const dias = Math.round((b - a) / 86400000);
        const grilla = citEl('div', { class: `cit-grilla cit-grilla-${vista}` }, ...CIT_DIAS_CORTOS.map((d) => citEl('div', { class: 'cit-grilla-cabeza' }, d)));
        for (let i = 0; i < dias; i++) {
            const d = sumarDias(a, i);
            const iso = citFechaISO(d);
            const lista = delDia(iso);
            const cerrado = !citBloquesDelDia(horarios, iso, tiendaFiltro()).length;
            const max = vista === 'mes' ? 3 : 50;
            grilla.appendChild(citEl('div', {
                class: `cit-dia${iso === hoyISO ? ' cit-hoy' : ''}${cerrado ? ' cit-cerrado' : ''}${vista === 'mes' && d.getMonth() !== ref.getMonth() ? ' cit-fuera' : ''}`,
                title: 'Ver el día', onclick: () => { ref = d; vista = 'dia'; cargarCitas(); },
            },
            citEl('div', { class: 'cit-dia-cabeza' }, citEl('strong', {}, d.getDate()), vista === 'semana' ? citEl('small', {}, textoHorario(iso)) : null),
            ...lista.slice(0, max).map(chip),
            lista.length > max ? citEl('small', { class: 'cit-mas' }, `+${lista.length - max} más`) : null));
        }
        cal.replaceChildren(grilla);
    }

    // Día: filas cada 30 min dentro del horario; cada fila con sus citas y "Agendar" si hay lugar
    function dibujarDia() {
        const iso = citFechaISO(ref);
        const bloques = citBloquesDelDia(horarios, iso, tiendaFiltro());
        const caja = citEl('div', { class: 'cit-agenda' }, citEl('p', { class: 'cit-gris' }, `Horario: ${textoHorario(iso)}`));
        if (!bloques.length) caja.appendChild(citEl('p', { class: 'cit-vacio' }, 'Cerrado este día (Configuración -> Servicios y horario de atención).'));
        const lista = delDia(iso);
        const ahora = Date.now();
        bloques.forEach((bl) => {
            for (let m = bl.desde; m < bl.hasta; m += 30) {
                const ini = new Date(`${iso}T${citHoraDeMin(m)}:00`);
                const fin = new Date(ini.getTime() + 30 * 60000);
                const aqui = lista.filter((c) => new Date(c.inicio) >= ini && new Date(c.inicio) < fin);
                const ocupadas = lista.filter((c) => CIT_ACTIVAS.includes(c.estado) && new Date(c.inicio) < fin && new Date(c.fin) > ini).length;
                const lugar = ocupadas < bl.capacidad && ini.getTime() > ahora;
                caja.appendChild(citEl('div', { class: 'cit-agenda-fila' },
                    citEl('span', { class: 'cit-fila-hora' }, citHoraDeMin(m)),
                    citEl('div', { class: 'cit-agenda-citas' }, ...aqui.map(chip)),
                    citEl('small', { class: 'cit-gris' }, `${ocupadas}/${bl.capacidad}`),
                    puedeAgendar && lugar ? citEl('button', { type: 'button', class: 'boton boton-chico boton-secundario', onclick: () => abrirCita(null, { fecha: iso, hora: citHoraDeMin(m) }) },
                        citEl('i', { class: 'bi bi-plus' }), ' Agendar') : null));
            }
        });
        cal.replaceChildren(caja);
    }

    // ==================================================
    // VENTANA DE LA CITA
    // ==================================================

    const etiquetaCliente = (c) => `${citNombre(c)} · ${c.telefono}`;

    async function abrirCita(cita = null, { fecha = null, hora = null } = {}) {
        const editable = puedeAgendar && (!cita || CIT_ACTIVAS.includes(cita.estado));
        const v = citVentana(cita ? `Cita de ${citNombre(cita.cliente)}` : 'Nueva cita', { ancha: true });
        const lista = citEl('datalist', { id: 'citClientesLista' }, ...clientes.map((c) => citEl('option', { value: etiquetaCliente(c) })));
        const fCliente = citInput({ list: 'citClientesLista', placeholder: 'Buscar por nombre o teléfono', value: cita ? etiquetaCliente({ ...cita.cliente, telefono: cita.cliente.telefono }) : '', disabled: !!cita });
        const fServicio = citSelect([['', '— Elige —'], ...servicios.filter((s) => s.activo || (cita && s.id === cita.servicio_id)).map((s) => [s.id, `${s.nombre} (${s.duracion_min} min · ${citDinero(s.precio)})`])], cita ? cita.servicio_id : '', { disabled: !editable });
        const fSucursal = citSelect([['', '— Sin sucursal —'], ...sucursales.map((s) => [s.id, s.nombre])], cita ? cita.tienda_id : (tiendaFiltro() || (sucursales.length === 1 ? sucursales[0].id : '')), { disabled: !editable });
        const fTerapeuta = citSelect([['', '— Sin asignar —']], '', { disabled: !editable });
        const fFecha = citInput({ type: 'date', value: cita ? citFechaISO(new Date(cita.inicio)) : (fecha || citFechaISO(ref < new Date(new Date().setHours(0, 0, 0, 0)) ? new Date() : ref)), min: cita ? null : citFechaISO(new Date()), disabled: !editable });
        const fHora = citSelect([], '', { disabled: !editable });
        const fPrecio = citInput({ type: 'number', min: 0, step: 500, value: cita ? cita.precio : '', disabled: !editable });
        const fNotas = citEl('textarea', { class: 'campo-input', rows: 2, maxlength: 600, disabled: !editable && !esTerapeuta }, (cita && cita.notas) || '');
        const salud = citEl('div', { class: 'cit-salud' });
        const confirmaSalud = citEl('input', { type: 'checkbox' });
        let nivelSalud = null;
        let clienteId = cita ? cita.cliente_id : null;

        const nuevoCliente = citEl('button', { type: 'button', class: 'boton boton-chico boton-secundario', hidden: !!cita,
            onclick: () => citAbrirCliente(null, { tiendaId: Number(fSucursal.value) || null, abrirFicha: false, alGuardar: (c) => {
                clientes.push(c); lista.appendChild(citEl('option', { value: etiquetaCliente(c) }));
                fCliente.value = etiquetaCliente(c); elegirCliente();
            } }) }, citEl('i', { class: 'bi bi-person-plus' }), ' Nuevo cliente');

        v.cuerpo.append(lista, citEl('div', { class: 'campos' },
            citCampo('Cliente *', citEl('div', { class: 'cit-en-linea' }, fCliente, nuevoCliente), { ancho: true })),
        salud,
        citEl('div', { class: 'campos' },
            citCampo('Servicio *', fServicio), citCampo('Sucursal', fSucursal),
            citCampo('Terapeuta', fTerapeuta), citCampo('Fecha *', fFecha),
            citCampo('Hora *', fHora, { ayuda: 'Solo horas dentro del horario de atención y con lugar.' }), citCampo('Precio', fPrecio),
            citCampo('Notas', fNotas, { ancho: true })));

        // ---- Cliente: alertas de salud ----
        async function elegirCliente() {
            const c = clientes.find((x) => etiquetaCliente(x) === fCliente.value.trim());
            clienteId = c ? c.id : (cita ? cita.cliente_id : null);
            salud.replaceChildren(); nivelSalud = null;
            if (!clienteId) return;
            if (c && !cita && c.tienda_id && !fSucursal.value) { fSucursal.value = String(c.tienda_id); refrescarTerapeutas(); refrescarHoras(); }
            const { data } = await db.from('myst_clientes_historial').select('descripcion, riesgo').eq('cliente_id', clienteId).eq('vigente', true).not('riesgo', 'is', null);
            const r = data || [];
            nivelSalud = r.some((h) => h.riesgo === 'contraindicado') ? 'contraindicado' : (r.length ? 'precaucion' : null);
            salud.append(...['contraindicado', 'precaucion'].map((n) => {
                const de = r.filter((h) => h.riesgo === n);
                return de.length ? citEl('div', { class: `cit-alerta cit-alerta-${n}` }, citEl('i', { class: 'bi bi-exclamation-triangle-fill' }),
                    citEl('strong', {}, ` ${CIT_RIESGOS[n][0]}: `), de.map((h) => h.descripcion).join(' · ')) : null;
            }).filter(Boolean),
            nivelSalud === 'contraindicado' && editable ? citEl('label', { class: 'cit-confirmar' }, confirmaSalud, ' Confirmo que se revisó y hay autorización médica o se adapta la sesión.') : '',
            citEl('button', { type: 'button', class: 'boton boton-chico boton-secundario', onclick: () => citAbrirFicha(clienteId, { alCambiar: elegirCliente }) },
                citEl('i', { class: 'bi bi-journal-medical' }), ' Ver ficha / agregar al historial'));
        }
        fCliente.addEventListener('change', elegirCliente);

        // ---- Terapeutas de la sucursal ----
        function refrescarTerapeutas() {
            const actual = fTerapeuta.value || (cita && cita.terapeuta_id) || '';
            const suc = Number(fSucursal.value) || null;
            const opciones = terapeutas.filter((t) => !suc || !t.tienda_id || t.tienda_id === suc);
            fTerapeuta.replaceChildren(citEl('option', { value: '' }, '— Sin asignar —'), ...opciones.map((t) => citEl('option', { value: t.id }, t.nombre)));
            fTerapeuta.value = String(actual);
            if (fTerapeuta.value !== String(actual)) fTerapeuta.value = '';
        }

        // ---- Horas disponibles (bloqueo por horario, capacidad y terapeuta) ----
        const servicio = () => servicios.find((s) => s.id === Number(fServicio.value));
        async function refrescarHoras() {
            const s = servicio();
            const actual = fHora.value || hora || (cita ? citHora(new Date(cita.inicio)) : '');
            if (!editable) { fHora.replaceChildren(citEl('option', { value: actual }, actual)); return; }
            if (!s || !fFecha.value) { fHora.replaceChildren(citEl('option', { value: '' }, s ? 'Elige la fecha' : 'Elige el servicio')); return; }
            const dia = new Date(`${fFecha.value}T00:00:00`);
            const { data } = await db.from('myst_citas').select('id, inicio, fin, estado, tienda_id, terapeuta_id')
                .gte('inicio', dia.toISOString()).lt('inicio', sumarDias(dia, 1).toISOString());
            const horas = citHorasDelDia({ horarios, citas: data || [], fecha: fFecha.value, tiendaId: Number(fSucursal.value) || null,
                duracion: s.duracion_min, terapeutaId: Number(fTerapeuta.value) || null, ignorarId: cita ? cita.id : null });
            fHora.replaceChildren(...(horas.length
                ? [citEl('option', { value: '' }, `— ${horas.filter((x) => x.libre).length} horas libres —`),
                    ...horas.map((x) => citEl('option', { value: x.hora, disabled: !x.libre }, x.libre ? x.hora : `${x.hora} (${x.motivo})`))]
                : [citEl('option', { value: '' }, 'Cerrado ese día')]));
            const op = [...fHora.options].find((o) => o.value === actual && !o.disabled);
            fHora.value = op ? actual : '';
        }
        fServicio.addEventListener('change', () => { const s = servicio(); if (s && (!fPrecio.value || !cita)) fPrecio.value = s.precio; refrescarHoras(); });
        fSucursal.addEventListener('change', () => { refrescarTerapeutas(); refrescarHoras(); });
        [fTerapeuta, fFecha].forEach((x) => x.addEventListener('change', refrescarHoras));

        // ---- Botones ----
        const cerrarYRecargar = () => { v.cerrar(); cargarCitas(); };
        const boton = (texto, icono, clase, fn) => citEl('button', { type: 'button', class: `boton ${clase}`, onclick: fn }, citEl('i', { class: `bi ${icono}` }), ` ${texto}`);
        const cambiarEstado = async (cambios) => {
            const { error } = await db.from('myst_citas').update(cambios).eq('id', cita.id);
            if (error) { v.error.textContent = 'No se pudo cambiar la cita.'; return false; }
            return true;
        };

        if (cita) {
            v.cuerpo.prepend(citEl('p', {}, 'Estado: ', citEtiqueta(...CIT_ESTADOS[cita.estado]),
                cita.cobro_forma ? ` · Pagó con ${CIT_COBROS[cita.cobro_forma]}` : '',
                cita.motivo_cancelacion ? ` · Motivo: ${cita.motivo_cancelacion}` : '',
                cita.creado_por_nombre ? citEl('small', { class: 'cit-gris' }, ` · Agendó ${cita.creado_por_nombre}`) : ''));
            v.botones.append(
                citBotonWhatsApp(cita.cliente && cita.cliente.telefono, citTextoRecordatorio(cita), 'Enviar recordatorio', () => citMarcarRecordatorio(cita)),
                boton('Ficha', 'bi-journal-medical', 'boton-secundario', () => citAbrirFicha(cita.cliente_id)));
            if (CIT_ACTIVAS.includes(cita.estado)) {
                if (['solicitada', 'programada'].includes(cita.estado)) v.botones.append(boton('Confirmar', 'bi-check2', 'boton-secundario', async () => {
                    if (await cambiarEstado({ estado: 'confirmada' })) { citAvisarCliente(cita, 'Tu cita está confirmada'); cerrarYRecargar(); }
                }));
                v.botones.append(
                    boton('Atendida', 'bi-check2-circle', 'boton-principal', () => marcarAtendida()),
                    boton('No asistió', 'bi-person-x', 'boton-secundario', async () => { if (await cambiarEstado({ estado: 'no_asistio' })) cerrarYRecargar(); }));
                if (puedeAgendar) v.botones.append(boton('Cancelar cita', 'bi-slash-circle', 'boton-peligro', async () => {
                    const motivo = prompt('Motivo de la cancelación:');
                    if (motivo === null) return;
                    if (await cambiarEstado({ estado: 'cancelada', motivo_cancelacion: motivo.trim() || null })) {
                        citAvisarCliente(cita, 'Tu cita fue cancelada');
                        cerrarYRecargar();
                    }
                }));
            }
        }
        if (editable || (esTerapeuta && cita)) {
            const guardar = boton(cita ? 'Guardar cambios' : 'Agendar', 'bi-calendar-check', 'boton-principal', () => guardarCita(guardar));
            v.botones.append(guardar);
        }

        async function guardarCita(btn) {
            v.error.textContent = '';
            if (esTerapeuta) { // el terapeuta solo cambia las notas
                if (await cambiarEstado({ notas: fNotas.value.trim() || null })) cerrarYRecargar();
                return;
            }
            const s = servicio();
            if (!clienteId) { v.error.textContent = 'Elige un cliente de la lista (o crea uno nuevo).'; return; }
            if (!s) { v.error.textContent = 'Elige el servicio.'; return; }
            if (!fHora.value) { v.error.textContent = 'Elige una hora libre dentro del horario de atención.'; return; }
            if (nivelSalud === 'contraindicado' && !confirmaSalud.checked) { v.error.textContent = 'El cliente tiene una contraindicación: marca la confirmación.'; return; }
            const inicio = new Date(`${fFecha.value}T${fHora.value}:00`);
            const fila = {
                cliente_id: clienteId, servicio_id: s.id, servicio_nombre: s.nombre,
                tienda_id: Number(fSucursal.value) || null, terapeuta_id: Number(fTerapeuta.value) || null,
                inicio: inicio.toISOString(), fin: new Date(inicio.getTime() + s.duracion_min * 60000).toISOString(),
                precio: Number(fPrecio.value) || 0, notas: fNotas.value.trim() || null,
            };
            if (!cita) Object.assign(fila, { creado_por: sesion.id || null, creado_por_nombre: sesion.nombre || null });
            btn.disabled = true;
            const { data, error } = cita
                ? await db.from('myst_citas').update(fila).eq('id', cita.id).select().single()
                : await db.from('myst_citas').insert(fila).select().single();
            btn.disabled = false;
            if (error) { v.error.textContent = error.code === 'P0001' ? error.message : (citFaltaSql(error) ? CIT_AVISO_SQL : 'No se pudo guardar la cita.'); return; }
            if (!cita) citAvisarCita(data, 'Nueva cita');
            else if (cita.inicio !== data.inicio || cita.terapeuta_id !== data.terapeuta_id) {
                citAvisarCita(data, 'Cita reprogramada');
                if (cita.inicio !== data.inicio) citAvisarCliente(data, 'Tu cita cambió de hora');
            }
            cerrarYRecargar();
        }

        // Atendida: forma de pago y tratamiento aplicado (queda en el historial del cliente)
        function marcarAtendida() {
            const w = citVentana('Cita atendida');
            const forma = citSelect([['', '— Sin cobro / pendiente —'], ...Object.entries(CIT_COBROS)], 'efectivo');
            const monto = citInput({ type: 'number', min: 0, step: 500, value: cita.precio });
            const trat = citEl('textarea', { class: 'campo-input', rows: 3, maxlength: 600 }, `${cita.servicio_nombre}. `);
            w.cuerpo.appendChild(citEl('div', { class: 'campos' }, citCampo('Forma de pago', forma), citCampo('Cobrado', monto),
                citCampo('Tratamiento aplicado (zonas, técnica, presión, observaciones)', trat, { ancho: true })));
            const ok = boton('Guardar', 'bi-check2-circle', 'boton-principal', async () => {
                ok.disabled = true;
                const bien = await cambiarEstado({ estado: 'atendida', cobro_forma: forma.value || null, precio: Number(monto.value) || 0 });
                if (bien && trat.value.trim()) {
                    await db.from('myst_clientes_historial').insert({ cliente_id: cita.cliente_id, tipo: 'tratamiento_aplicado', descripcion: trat.value.trim(),
                        cita_id: cita.id, fecha: citFechaISO(new Date(cita.inicio)), registrado_por_nombre: sesion.nombre || null });
                }
                ok.disabled = false;
                if (bien) { w.cerrar(); cerrarYRecargar(); }
            });
            w.botones.append(boton('Volver', 'bi-arrow-left', 'boton-secundario', w.cerrar), ok);
        }

        refrescarTerapeutas();
        if (cita) elegirCliente();
        await refrescarHoras();
        if (!cita) fCliente.focus();
    }

    // ==================================================
    // EVENTOS Y ARRANQUE
    // ==================================================

    zona.querySelectorAll('[data-mover]').forEach((b) => b.addEventListener('click', () => {
        const n = Number(b.dataset.mover);
        if (!n) { ref = new Date(); ref.setHours(0, 0, 0, 0); }
        else if (vista === 'mes') ref = new Date(ref.getFullYear(), ref.getMonth() + n, 1);
        else ref = sumarDias(ref, vista === 'semana' ? 7 * n : n);
        cargarCitas();
    }));
    zona.querySelectorAll('.cit-vista').forEach((b) => b.addEventListener('click', () => { vista = b.dataset.vista; cargarCitas(); }));
    selSucursal.addEventListener('change', cargarCitas);
    $('#citNueva').addEventListener('click', () => abrirCita());

    (async () => {
        try {
            await cargarBase();
            await cargarCitas();
        } catch (e) {
            if (activo) cal.textContent = citFaltaSql(e) ? CIT_AVISO_SQL : 'No se pudieron cargar las citas.';
            return;
        }
        const p = parametrosSeccion();
        if (p.get('nuevo') && puedeAgendar) abrirCita();
        const id = Number(p.get('id'));
        if (id) {
            const { data } = await db.from('myst_citas').select(CIT_SELECT).eq('id', id).maybeSingle();
            if (data && activo) { ref = new Date(data.inicio); ref.setHours(0, 0, 0, 0); vista = 'dia'; await cargarCitas(); abrirCita(data); }
        }
    })();

    return () => {
        activo = false;
        document.querySelectorAll('dialog.cit-ventana').forEach((d) => d.close());
    };
});

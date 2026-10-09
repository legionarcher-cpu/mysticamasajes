/* ==================================================
   SECCIÓN: CLIENTES (sala de masajes) - LÓGICA
   MYSTICA MASAJES

   Tabla myst_clientes (sql/02_mystica_masajes.sql), aparte de los clientes de ACACHETE.
   - Nuevo / modificar (citAbrirCliente) y ficha con historial (citAbrirFicha):
     lesiones, enfermedades, tratamientos que recibe, tratamientos aplicados...
     Todo se agrega con "Agregar nuevo" y queda en el historial.
   - Alerta de salud por cliente (lo vigente con riesgo).
   - Cumpleaños de hoy: botón de WhatsApp con el mensaje listo (solo el nombre).
   - Desactivar (no se borra: tiene citas e historial).
   - Acceso (usuario rol cliente, usuarios.myst_cliente_id): aprobar o rechazar la
     solicitud hecha desde el login, o dar acceso a mano (usuario y contraseña).
     Con usuario, el cliente solo ve su Inicio, sus citas (y solicitar) y Mi perfil.
   El terapeuta (rol piloto) ve y abre fichas, pero no crea ni modifica clientes.
   ================================================== */

registrarSeccion('mclientes', (zona) => {
    const $ = (s) => zona.querySelector(s);
    const puedeModificar = rolActual() !== 'piloto' || esAdministrador(); // terapeuta de masajes: nivel Administrador
    const puedeDarAcceso = esAdministrador() || esAdminG1();
    let clientes = [];
    let riesgos = new Map();
    let sucursales = [];
    let accesos = new Map(); // myst_cliente_id -> { id, id_usuario, aprobado }
    let activo = true;

    $('#mclNuevo').hidden = !puedeModificar;

    async function cargar() {
        const [{ data, error }, suc, , acc] = await Promise.all([
            db.from('myst_clientes').select('*').order('nombre'),
            citSucursales(),
            citCargarMensajes(),
            db.from('usuarios').select('id, id_usuario, aprobado, myst_cliente_id').eq('rol', 'cliente').not('myst_cliente_id', 'is', null),
        ]);
        if (!activo) return;
        if (error) { $('#mclContador').textContent = citFaltaSql(error) ? CIT_AVISO_SQL : 'No se pudieron cargar los clientes.'; return; }
        clientes = data || [];
        sucursales = suc;
        accesos = new Map((acc.data || []).map((u) => [u.myst_cliente_id, u]));
        riesgos = await citRiesgosDe(clientes.map((c) => c.id));
        if (activo) dibujar();
    }

    function dibujar() {
        const palabras = citSinTildes($('#mclBuscar').value).split(/\s+/).filter(Boolean);
        const filtro = $('#mclFiltro').value;
        const mes = new Date().getMonth() + 1;
        const visibles = clientes.filter((c) => {
            const texto = citSinTildes(`${citNombre(c)} ${c.correo || ''} ${String(c.telefono || '').replace(/\D/g, '')}`);
            if (!palabras.every((p) => texto.includes(p))) return false;
            if (filtro === 'inactivos') return !c.activo;
            if (filtro === 'solicitudes') return !!accesos.get(c.id) && !accesos.get(c.id).aprobado;
            if (!c.activo) return false;
            if (filtro === 'riesgo') return riesgos.has(c.id);
            if (filtro === 'cumple') return c.fecha_nacimiento && Number(c.fecha_nacimiento.slice(5, 7)) === mes;
            return true;
        });
        const cuerpo = $('#mclCuerpo');
        cuerpo.replaceChildren();
        if (!visibles.length) cuerpo.appendChild(crearFilaVacia(clientes.length ? 'No hay clientes con ese filtro.' : 'Aún no hay clientes. Agrega el primero con "Nuevo cliente".', 8));
        visibles.forEach((c) => {
            const dias = citDiasACumple(c.fecha_nacimiento);
            const suc = sucursales.find((s) => s.id === c.tienda_id);
            const nivel = riesgos.get(c.id);
            const tr = citEl('tr', {},
                citEl('td', {}, citEl('strong', {}, citNombre(c)), c.correo ? citEl('span', { class: 'celda-detalle' }, c.correo) : null),
                crearCelda(c.telefono),
                crearCelda(citEdad(c.fecha_nacimiento) != null ? `${citEdad(c.fecha_nacimiento)} años` : ''),
                citEl('td', {}, c.fecha_nacimiento ? new Date(`${c.fecha_nacimiento}T12:00:00`).toLocaleDateString('es-CR', { day: 'numeric', month: 'short' }) : '—',
                    dias === 0 ? citEl('span', {}, ' ', citEtiqueta('¡Hoy! 🎂', 'etiqueta-morada')) : null),
                crearCelda(suc ? suc.nombre : ''),
                citEl('td', {}, nivel ? citEtiqueta(CIT_RIESGOS[nivel][0], CIT_RIESGOS[nivel][1]) : citEtiqueta('Sin alertas', 'etiqueta-verde')),
                celdaAcceso(c),
                crearCeldaAcciones(
                    ...(dias === 0 && c.activo ? [citBotonWhatsApp(c.telefono, citTextoCumple(c), 'Enviar felicitación de cumpleaños')] : []),
                    crearBotonIcono('ficha', c.id, 'bi-journal-medical', 'Ficha e historial'),
                    ...(puedeModificar ? [
                        crearBotonIcono('agendar', c.id, 'bi-calendar-plus', 'Agendar cita'),
                        crearBotonIcono('editar', c.id, 'bi-pencil', `Modificar a ${c.nombre}`),
                        crearBotonIcono('activo', c.id, c.activo ? 'bi-person-slash' : 'bi-person-check', c.activo ? 'Desactivar' : 'Activar'),
                    ] : []),
                    ...(puedeDarAcceso ? [crearBotonIcono('eliminar', c.id, 'bi-trash3', `Eliminar a ${c.nombre}`)] : [])));
            cuerpo.appendChild(tr);
        });
        const n = clientes.filter((c) => c.activo).length;
        const cumple = clientes.filter((c) => c.activo && citDiasACumple(c.fecha_nacimiento) === 0).length;
        const pendientes = [...accesos.values()].filter((u) => !u.aprobado).length;
        $('#mclContador').textContent = `${plural(n, 'cliente', 'clientes')}${cumple ? ` · ${plural(cumple, 'cumple', 'cumplen')} años hoy 🎂` : ''}`
            + (pendientes ? ` · ${plural(pendientes, 'solicitud', 'solicitudes')} de usuario` : '');
    }

    // ---------- Eliminar (Administrador, G1 y Desarrollador) ----------
    // Sin citas: se borra con su ficha (historial) y su usuario. Con citas: se recomienda
    // Desactivar (así no cambian los reportes); si aun así se confirma, se borran también sus citas.
    async function eliminar(c) {
        const { count, error: e1 } = await db.from('myst_citas').select('id', { count: 'exact', head: true }).eq('cliente_id', c.id);
        if (e1) { alert('No se pudo revisar sus citas. Intenta de nuevo.'); return; }
        const nombre = citNombre(c);
        if (count) {
            if (!confirm(`${nombre} tiene ${plural(count, 'cita', 'citas')}. Si lo eliminas, también se borran sus citas y salen de los reportes.\n\nRecomendado: "Desactivar" (conserva todo). ¿Eliminar de todas formas?`)) return;
            if (prompt(`Para confirmar escribe ELIMINAR`) !== 'ELIMINAR') return;
            const { error: e2 } = await db.from('myst_citas').delete().eq('cliente_id', c.id);
            if (e2) { alert('No se pudieron borrar sus citas.'); return; }
        } else if (!confirm(`¿Eliminar a ${nombre}? Se borran su ficha, su historial y su usuario (si tiene). No se puede deshacer.`)) {
            return;
        }
        const { error } = await db.from('myst_clientes').delete().eq('id', c.id);
        if (error) { alert('No se pudo eliminar el cliente.'); return; }
        cargar();
    }

    // ---------- Acceso del cliente (su usuario) ----------
    function celdaAcceso(c) {
        const u = accesos.get(c.id);
        const td = citEl('td');
        if (!u) {
            td.append(citEtiqueta('Sin usuario', 'etiqueta-gris'));
            if (puedeDarAcceso && c.activo) td.append(' ', citEl('button', { type: 'button', class: 'boton-icono', title: 'Dar acceso (usuario y contraseña)', 'data-accion': 'dar-acceso', 'data-id': c.id }, citEl('i', { class: 'bi bi-key' })));
        } else if (!u.aprobado) {
            td.append(citEtiqueta(`Solicitó "${u.id_usuario}"`, 'etiqueta-naranja'));
            if (puedeDarAcceso) td.append(' ',
                citEl('button', { type: 'button', class: 'boton-icono boton-icono-revisar', title: 'Aprobar solicitud', 'data-accion': 'aprobar', 'data-id': c.id }, citEl('i', { class: 'bi bi-check2-circle' })),
                citEl('button', { type: 'button', class: 'boton-icono boton-icono-eliminar', title: 'Rechazar solicitud', 'data-accion': 'rechazar', 'data-id': c.id }, citEl('i', { class: 'bi bi-x-circle' })));
        } else {
            td.append(citEtiqueta(u.id_usuario, 'etiqueta-verde'));
            if (puedeDarAcceso) td.append(' ', citEl('button', { type: 'button', class: 'boton-icono boton-icono-eliminar', title: 'Quitar acceso', 'data-accion': 'rechazar', 'data-id': c.id }, citEl('i', { class: 'bi bi-person-x' })));
        }
        return td;
    }

    async function aprobar(c) {
        const { error } = await db.from('usuarios').update({ aprobado: true }).eq('id', accesos.get(c.id).id);
        if (error) { alert('No se pudo aprobar.'); return; }
        if (typeof resolverPendientes === 'function') resolverPendientes('acceso_cliente_masajes', c.id);
        cargar();
    }

    async function quitarAcceso(c) {
        const u = accesos.get(c.id);
        if (!confirm(u.aprobado ? `¿Quitar el acceso de ${citNombre(c)}? Su ficha y sus citas se conservan.` : `¿Rechazar la solicitud de ${citNombre(c)}?`)) return;
        const { error } = await db.from('usuarios').delete().eq('id', u.id);
        if (error) { alert('No se pudo quitar el acceso.'); return; }
        if (typeof resolverPendientes === 'function') resolverPendientes('acceso_cliente_masajes', c.id);
        cargar();
    }

    // Dar acceso a mano: usuario (+ ID de la empresa, ej. aramirez02) y contraseña
    function darAcceso(c) {
        const v = citVentana(`Acceso de ${citNombre(c)}`);
        const empresa = (typeof empresaActual === 'function' && empresaActual()) || {};
        const base = citInput({ maxlength: 20, value: citSinTildes(`${c.nombre.charAt(0)}${(c.apellidos || '').split(' ')[0]}`).replace(/[^a-z0-9]/g, '') });
        const clave = citInput({ maxlength: 40, placeholder: 'Mínimo 6 caracteres' });
        const ayuda = citEl('small', { class: 'campo-ayuda' });
        const pintar = () => { ayuda.textContent = `Entrará como "${base.value.toLowerCase().replace(/[^a-z0-9]/g, '')}${empresa.codigo || ''}"`; };
        base.addEventListener('input', pintar); pintar();
        v.cuerpo.appendChild(citEl('div', { class: 'campos' }, citEl('label', { class: 'campo' }, citEl('span', { class: 'campo-etiqueta' }, 'Usuario'), base, ayuda),
            citCampo('Contraseña', clave)));
        v.cuerpo.appendChild(citEl('p', { class: 'cit-nota' }, 'Con su usuario solo verá su Inicio (resumen de visitas), sus citas (y solicitar nuevas) y Mi perfil.'));
        const ok = citEl('button', { type: 'button', class: 'boton boton-principal' }, 'Crear acceso');
        v.botones.append(citEl('button', { type: 'button', class: 'boton boton-secundario', onclick: v.cerrar }, 'Cancelar'), ok);
        ok.addEventListener('click', async () => {
            const b = base.value.toLowerCase().replace(/[^a-z0-9]/g, '');
            if (!/^[a-z0-9]{3,20}$/.test(b)) { v.error.textContent = 'El usuario: de 3 a 20 letras o números.'; return; }
            if (clave.value.length < 6) { v.error.textContent = 'La contraseña debe tener al menos 6 caracteres.'; return; }
            ok.disabled = true;
            const { data: idUsuario, error: e1 } = await db.rpc('usuario_libre', { p_base: b, p_codigo_empresa: empresa.codigo || '', p_codigo_tienda: null, p_usuario_id: 0 });
            const { error } = e1 ? { error: e1 } : await db.from('usuarios').insert({
                nombre: citNombre(c), id_usuario: idUsuario, telefono: c.telefono, clave: clave.value,
                permisos: [], rol: 'cliente', myst_cliente_id: c.id, aprobado: true,
            });
            ok.disabled = false;
            if (error) { v.error.textContent = citFaltaSql(error) ? CIT_AVISO_SQL : 'No se pudo crear el acceso.'; return; }
            v.cerrar();
            alert(`Acceso creado: usuario "${idUsuario}". Compártelo con el cliente junto con su contraseña.`);
            cargar();
        });
    }

    $('#mclCuerpo').addEventListener('click', async (e) => {
        const b = e.target.closest('button[data-accion]');
        if (!b || b.disabled) return;
        const c = clientes.find((x) => x.id === Number(b.dataset.id));
        if (!c) return;
        const accion = b.dataset.accion;
        if (accion === 'ficha') citAbrirFicha(c.id, { alCambiar: cargar });
        if (accion === 'eliminar' && puedeDarAcceso) eliminar(c);
        if (accion === 'dar-acceso' && puedeDarAcceso) darAcceso(c);
        if (accion === 'aprobar' && puedeDarAcceso) aprobar(c);
        if (accion === 'rechazar' && puedeDarAcceso) quitarAcceso(c);
        if (accion === 'agendar') irA('citas?nuevo=1');
        if (accion === 'editar') citAbrirCliente(c, { alGuardar: cargar });
        if (accion === 'activo') {
            if (c.activo && !confirm(`¿Desactivar a ${citNombre(c)}? Su historial y sus citas se conservan.`)) return;
            const { error } = await db.from('myst_clientes').update({ activo: !c.activo }).eq('id', c.id);
            if (error) alert('No se pudo cambiar.'); else cargar();
        }
    });
    $('#mclNuevo').addEventListener('click', () => citAbrirCliente(null, { alGuardar: cargar }));
    $('#mclBuscar').addEventListener('input', dibujar);
    $('#mclFiltro').addEventListener('change', dibujar);

    cargar();
    return () => { activo = false; document.querySelectorAll('dialog.cit-ventana').forEach((d) => d.close()); };
});

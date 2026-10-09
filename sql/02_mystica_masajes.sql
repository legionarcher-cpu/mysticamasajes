-- ==================================================
-- MYSTICA MASAJES (sala de masajes) — tablas propias con prefijo myst_
--   No usa ni modifica las tablas de ACACHETE (clientes, pedidos, marcas_horario...).
--   Comparte solo lo de acceso: usuarios (login), empresas, tiendas (= Sucursales),
--   regiones y notificaciones, que ya van separadas por empresa_id.
--
--   myst_config             -> mensajes de WhatsApp y ajustes (por empresa)
--   myst_servicios          -> servicios: nombre, duración y precio
--   myst_horarios           -> horario de atención por día: inicia desde / termina
--   myst_clientes           -> clientes con fecha de nacimiento (cumpleaños, edad)
--   myst_clientes_historial -> ficha: lesiones, enfermedades, tratamientos...
--   myst_citas              -> citas (calendario)
--
--   Se ejecuta en la MISMA base de ACACHETE que ya funciona (la de js/supabase.js).
--   Solo crea tablas: la empresa, sus sucursales y usuarios los crea el Desarrollador
--   en la página, igual que cualquier otra empresa.
--   Se puede repetir. Documentación: docs/15-mystica-masajes.md
-- ==================================================

-- ---------- Actividad del catálogo (para marcarla en Tiendas -> Empresas) ----------
insert into public.actividades (codigo, nombre, descripcion, icono, orden)
values ('masajes', 'Servicios (masajes)', 'Sala de masajes: citas, servicios y ficha del cliente.', 'bi-flower1', 9)
on conflict (codigo) do nothing;


-- ---------- Ajustes y mensajes ----------
create table if not exists public.myst_config (
    empresa_id  bigint not null default public.empresa_principal() references public.empresas(id) on delete cascade,
    clave       text not null,
    valor       jsonb not null,
    primary key (empresa_id, clave)
);


-- ---------- Servicios ----------
create table if not exists public.myst_servicios (
    id           bigint generated always as identity primary key,
    empresa_id   bigint not null default public.empresa_principal() references public.empresas(id) on delete cascade,
    nombre       text not null,
    descripcion  text,
    duracion_min integer not null default 60,
    precio       numeric(12,2) not null default 0,
    activo       boolean not null default true,
    creado_en    timestamptz not null default now(),

    constraint myst_servicios_nombre_unico unique (empresa_id, nombre),
    constraint myst_servicios_duracion     check (duracion_min between 10 and 480),
    constraint myst_servicios_precio       check (precio >= 0)
);


-- ---------- Horario de atención ----------
-- Un día puede tener varios bloques (ej. 08:00-12:00 y 13:00-19:00).
-- tienda_id null = todas las sucursales; con sucursal = solo esa (gana sobre la general).
-- capacidad = citas al mismo tiempo (camillas / terapeutas).
create table if not exists public.myst_horarios (
    id            bigint generated always as identity primary key,
    empresa_id    bigint not null default public.empresa_principal() references public.empresas(id) on delete cascade,
    tienda_id     bigint references public.tiendas(id) on delete cascade,
    dia           smallint not null,          -- 1 lunes ... 7 domingo
    inicia_desde  time not null,
    termina       time not null,
    capacidad     smallint not null default 1,

    constraint myst_horarios_dia       check (dia between 1 and 7),
    constraint myst_horarios_rango     check (termina > inicia_desde),
    constraint myst_horarios_capacidad check (capacidad between 1 and 50)
);
create index if not exists myst_horarios_idx on public.myst_horarios (empresa_id, dia);


-- ---------- Clientes ----------
create table if not exists public.myst_clientes (
    id                bigint generated always as identity primary key,
    empresa_id        bigint not null default public.empresa_principal() references public.empresas(id) on delete cascade,
    tienda_id         bigint references public.tiendas(id) on delete set null, -- sucursal habitual
    nombre            text not null,
    apellidos         text,
    telefono          text not null,
    correo            text,
    fecha_nacimiento  date,
    sexo              text,
    contacto_emergencia text,
    notas             text,
    activo            boolean not null default true,
    creado_en         timestamptz not null default now(),

    constraint myst_clientes_sexo check (sexo is null or sexo in ('F', 'M', 'O'))
);
create index if not exists myst_clientes_empresa_idx on public.myst_clientes (empresa_id, nombre);


-- ---------- Citas ----------
create table if not exists public.myst_citas (
    id                bigint generated always as identity primary key,
    empresa_id        bigint not null default public.empresa_principal() references public.empresas(id) on delete cascade,
    cliente_id        bigint not null references public.myst_clientes(id) on delete restrict,
    servicio_id       bigint references public.myst_servicios(id) on delete set null,
    servicio_nombre   text not null,              -- queda aunque se borre el servicio
    tienda_id         bigint references public.tiendas(id) on delete set null,
    terapeuta_id      bigint references public.usuarios(id) on delete set null,
    inicio            timestamptz not null,
    fin               timestamptz not null,
    estado            text not null default 'programada',
    precio            numeric(12,2) not null default 0,
    cobro_forma       text,
    notas             text,
    motivo_cancelacion text,
    recordatorio_en   timestamptz,                -- último recordatorio de WhatsApp
    creado_por        bigint,
    creado_por_nombre text,
    creado_en         timestamptz not null default now(),

    constraint myst_citas_rango  check (fin > inicio),
    constraint myst_citas_estado check (estado in ('programada', 'confirmada', 'atendida', 'no_asistio', 'cancelada')),
    constraint myst_citas_cobro  check (cobro_forma is null or cobro_forma in ('efectivo', 'sinpe', 'tarjeta')),
    constraint myst_citas_precio check (precio >= 0)
);
create index if not exists myst_citas_inicio_idx  on public.myst_citas (empresa_id, inicio);
create index if not exists myst_citas_cliente_idx on public.myst_citas (cliente_id, inicio desc);

-- Un terapeuta no puede tener dos citas activas al mismo tiempo
create or replace function public.myst_citas_validar()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    if new.terapeuta_id is not null and new.estado in ('programada', 'confirmada') and exists (
        select 1 from public.myst_citas c
         where c.terapeuta_id = new.terapeuta_id and c.id is distinct from new.id
           and c.estado in ('programada', 'confirmada')
           and c.inicio < new.fin and c.fin > new.inicio) then
        raise exception 'El terapeuta ya tiene una cita en ese horario.' using errcode = 'P0001';
    end if;
    -- La cita queda en la empresa de su cliente
    select cl.empresa_id into new.empresa_id from public.myst_clientes cl where cl.id = new.cliente_id;
    return new;
end;
$$;
drop trigger if exists myst_citas_validar on public.myst_citas;
create trigger myst_citas_validar before insert or update on public.myst_citas
    for each row execute function public.myst_citas_validar();


-- ---------- Historial (ficha) del cliente ----------
create table if not exists public.myst_clientes_historial (
    id                    bigint generated always as identity primary key,
    empresa_id            bigint not null default public.empresa_principal() references public.empresas(id) on delete cascade,
    cliente_id            bigint not null references public.myst_clientes(id) on delete cascade,
    tipo                  text not null,
    descripcion           text not null,
    riesgo                text,                    -- null | precaucion | contraindicado
    vigente               boolean not null default true,  -- false = ya superado (queda en el historial)
    cita_id               bigint references public.myst_citas(id) on delete set null,
    fecha                 date not null default current_date,
    registrado_por_nombre text,
    creado_en             timestamptz not null default now(),

    constraint myst_historial_tipo   check (tipo in ('lesion', 'enfermedad', 'tratamiento_actual', 'tratamiento_aplicado', 'alergia', 'medicamento', 'nota')),
    constraint myst_historial_riesgo check (riesgo is null or riesgo in ('precaucion', 'contraindicado'))
);
create index if not exists myst_historial_cliente_idx on public.myst_clientes_historial (cliente_id, fecha desc);

create or replace function public.myst_historial_empresa()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    select cl.empresa_id into new.empresa_id from public.myst_clientes cl where cl.id = new.cliente_id;
    return new;
end;
$$;
drop trigger if exists myst_historial_empresa on public.myst_clientes_historial;
create trigger myst_historial_empresa before insert or update on public.myst_clientes_historial
    for each row execute function public.myst_historial_empresa();


-- ---------- Acceso (igual que el resto del sistema: TEMPORAL hasta la Fase 7) ----------
do $$
declare
    t text;
begin
    foreach t in array array['myst_config', 'myst_servicios', 'myst_horarios', 'myst_clientes', 'myst_citas', 'myst_clientes_historial'] loop
        execute format('alter table public.%I enable row level security', t);
        execute format('grant select, insert, update, delete on public.%I to anon', t);
        execute format('drop policy if exists "TEMPORAL - todo %1$s" on public.%1$I', t);
        execute format('create policy "TEMPORAL - todo %1$s" on public.%1$I for all to anon using (true) with check (true)', t);
    end loop;
end;
$$;


-- ==================================================
-- CLIENTES CON USUARIO (rol cliente) EN UNA EMPRESA DE MASAJES
--   - El cliente pide su usuario en el login ("Solicita tu usuario", código de la empresa
--     o enlace app.html#registro?empresa=02): se crea su ficha en myst_clientes y su
--     usuario rol "cliente" SIN APROBAR; se avisa al Administrador y al G1.
--     Se aprueba en Clientes (sección de masajes).
--   - Con usuario: Inicio (resumen de sus visitas), Citas (solicitar y ver las suyas)
--     y Mi perfil. Nada más.
--   - Cita "solicitada": la pide el cliente; la confirma el personal.
-- ==================================================

alter table public.myst_citas drop constraint if exists myst_citas_estado;
alter table public.myst_citas add constraint myst_citas_estado
    check (estado in ('solicitada', 'programada', 'confirmada', 'atendida', 'no_asistio', 'cancelada'));

alter table public.usuarios add column if not exists myst_cliente_id bigint references public.myst_clientes(id) on delete cascade;
create unique index if not exists usuarios_un_acceso_por_myst_cliente on public.usuarios (myst_cliente_id) where myst_cliente_id is not null;
alter table public.usuarios drop constraint if exists usuarios_tienda_segun_rol;
alter table public.usuarios add constraint usuarios_tienda_segun_rol check (
    (rol in ('desarrollador', 'administrador', 'admin_g1') and tienda_id is null and region is null)
    or (rol = 'admin_g2' and tienda_id is null and region is not null)
    or (rol in ('admin_g3', 'empleado', 'piloto') and tienda_id is not null and region is null)
    or (rol = 'cliente' and tienda_id is null and region is null and (cliente_id is not null or myst_cliente_id is not null)));
alter table public.usuarios drop constraint if exists usuarios_myst_cliente_solo_cliente;
alter table public.usuarios add constraint usuarios_myst_cliente_solo_cliente check (myst_cliente_id is null or rol = 'cliente');

-- empresa_id del usuario: de su tienda, su región o (cliente) de su cliente o su ficha de masajes
create or replace function public.empresa_de_usuario()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    if new.rol = 'desarrollador' then
        new.empresa_id := null;
    elsif new.tienda_id is not null then
        select t.empresa_id into new.empresa_id from public.tiendas t where t.id = new.tienda_id;
    elsif new.region is not null then
        select r.empresa_id into new.empresa_id from public.regiones r where r.codigo = new.region;
    elsif new.cliente_id is not null then
        select c.empresa_id into new.empresa_id from public.clientes c where c.id = new.cliente_id;
    elsif new.myst_cliente_id is not null then
        select c.empresa_id into new.empresa_id from public.myst_clientes c where c.id = new.myst_cliente_id;
    end if;
    return new;
end;
$$;
drop trigger if exists usuarios_empresa on public.usuarios;
create trigger usuarios_empresa before insert or update of tienda_id, region, rol, cliente_id, myst_cliente_id on public.usuarios
    for each row execute function public.empresa_de_usuario();

-- ¿Esa empresa de masajes recibe solicitudes? Devuelve { nombre, citas: true } o null
create or replace function public.myst_registro_empresa(p_codigo text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
    select jsonb_build_object('nombre', e.nombre, 'citas', true)
      from public.empresas e
     where e.codigo = btrim(coalesce(p_codigo, ''))
       and e.activa
       and 'masajes' = any (e.actividades)
       and (e.funciones is null or 'registro_clientes' = any (e.funciones));
$$;

-- Guarda la solicitud: ficha (si su teléfono no existe en la empresa) + usuario rol cliente
-- SIN APROBAR, y avisa al Administrador y al G1.
--   p = { empresa: '02', nombre, apellido1, apellido2, telefono, correo, usuario, clave }
create or replace function public.myst_solicitar_acceso(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_empresa record;
    v_nombre  text := regexp_replace(btrim(coalesce(p->>'nombre', '')), '\s+', ' ', 'g');
    v_ape     text := regexp_replace(btrim(coalesce(p->>'apellido1', '') || ' ' || coalesce(p->>'apellido2', '')), '\s+', ' ', 'g');
    v_tel     text := regexp_replace(coalesce(p->>'telefono', ''), '\D', '', 'g');
    v_correo  text := nullif(lower(btrim(coalesce(p->>'correo', ''))), '');
    v_base    text := lower(btrim(coalesce(p->>'usuario', '')));
    v_clave   text := coalesce(p->>'clave', '');
    v_cliente bigint;
    v_usuario text;
begin
    select e.id, e.codigo, e.nombre into v_empresa
      from public.empresas e
     where e.codigo = btrim(coalesce(p->>'empresa', '')) and e.activa and 'masajes' = any (e.actividades)
       and (e.funciones is null or 'registro_clientes' = any (e.funciones));
    if not found then
        raise exception 'Este código de empresa no recibe solicitudes. Revísalo con la empresa.' using errcode = 'P0001';
    end if;
    if length(v_nombre) not between 2 and 60 or length(v_ape) not between 2 and 120 then
        raise exception 'Escribe tu nombre y tu primer apellido.' using errcode = 'P0001';
    end if;
    if length(v_tel) not between 8 and 15 then
        raise exception 'El teléfono debe tener al menos 8 dígitos.' using errcode = 'P0001';
    end if;
    if v_base !~ '^[a-z0-9]{3,20}$' then
        raise exception 'El usuario: de 3 a 20 letras o números, sin espacios.' using errcode = 'P0001';
    end if;
    if length(v_clave) not between 6 and 72 then
        raise exception 'La contraseña debe tener de 6 a 72 caracteres.' using errcode = 'P0001';
    end if;

    perform pg_advisory_xact_lock(7304, v_empresa.id::integer);
    if (select count(*) from public.usuarios u where u.empresa_id = v_empresa.id and u.rol = 'cliente'
         and not u.aprobado and u.creado_en > now() - interval '1 hour') >= 20 then
        raise exception 'Hay muchas solicitudes en este momento. Intenta de nuevo en una hora.' using errcode = 'P0001';
    end if;

    select c.id into v_cliente from public.myst_clientes c
     where c.empresa_id = v_empresa.id and regexp_replace(c.telefono, '\D', '', 'g') = v_tel
     order by c.id limit 1;
    if v_cliente is not null then
        if exists (select 1 from public.usuarios u where u.myst_cliente_id = v_cliente) then
            raise exception 'Ya hay un usuario o una solicitud con ese teléfono. Comunícate con la empresa.' using errcode = 'P0001';
        end if;
    else
        insert into public.myst_clientes (empresa_id, nombre, apellidos, telefono, correo)
        values (v_empresa.id, v_nombre, v_ape, v_tel, v_correo)
        returning id into v_cliente;
    end if;

    v_usuario := public.usuario_libre(v_base, v_empresa.codigo, null, 0);
    insert into public.usuarios (nombre, id_usuario, telefono, clave, permisos, rol, myst_cliente_id, aprobado, solicitado_en)
    values (btrim(v_nombre || ' ' || v_ape), v_usuario, v_tel, v_clave, '{}', 'cliente', v_cliente, false, now());

    insert into public.notificaciones (usuario_id, tipo, titulo, mensaje, enlace, referencia_tipo, referencia_id)
    select u.id, 'pendiente', 'Solicitud de usuario de cliente',
           format('%s (tel. %s) pidió su usuario "%s". Revísala en Clientes.', btrim(v_nombre || ' ' || v_ape), v_tel, v_usuario),
           '#mclientes', 'acceso_cliente_masajes', v_cliente
      from public.usuarios u
     where u.empresa_id = v_empresa.id and u.rol in ('administrador', 'admin_g1', 'piloto') and u.aprobado; -- piloto = terapeuta (nivel administrador en masajes)

    return jsonb_build_object('usuario', v_usuario, 'empresa', v_empresa.nombre);
end;
$$;

grant execute on function public.myst_registro_empresa(text) to anon;
grant execute on function public.myst_solicitar_acceso(jsonb) to anon;

-- usuarios tiene una columna nueva: la página tiene que poder leerla (contraseñas cifradas, sql/01 bloque 20)
do $$
begin
    perform public.usuarios_ocultar_clave();
exception when undefined_function then null;
end;
$$;

-- Servicios y horario de ejemplo: Configuración -> Servicios y horario de atención
-- ("Cargar ejemplos"), dentro de la empresa con la que se trabaja.

notify pgrst, 'reload schema';

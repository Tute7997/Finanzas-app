-- =====================================================================
-- FinanzasApp — Schema de Supabase
-- =====================================================================
-- Cómo usar este archivo:
--   1. Creá un proyecto en https://supabase.com
--   2. Abrí el SQL Editor del proyecto
--   3. Pegá TODO este archivo y ejecutalo (Run)
--   4. Copiá el "Project URL" y la "anon public key" (Settings > API)
--      y pegalos en supabase-config.js
--
-- Nota sobre "ahorros": un retiro se guarda como un insert con monto
-- NEGATIVO del mismo tipo de inversión. Así, sumar los montos de un
-- tipo da directamente el holding neto actual, y sumar por fecha da
-- la evolución del saldo. Esta convención se usa igual en el frontend
-- (chat-parser.js, ui.js, charts.js) — si se cambia acá hay que
-- cambiarla en todos lados.
-- =====================================================================

-- ---------------------------------------------------------------------
-- usuarios: perfil 1:1 con auth.users (nombre, email visibles en la UI)
-- ---------------------------------------------------------------------
create table if not exists public.usuarios (
  id          uuid primary key references auth.users(id) on delete cascade,
  nombre      text,
  email       text,
  created_at  timestamptz not null default now()
);

-- Trigger: crea automáticamente la fila de usuarios al hacer signup.
-- El nombre se toma de options.data.nombre pasado en supabase.auth.signUp().
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.usuarios (id, nombre, email)
  values (new.id, new.raw_user_meta_data ->> 'nombre', new.email);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ---------------------------------------------------------------------
-- ingresos
-- ---------------------------------------------------------------------
create table if not exists public.ingresos (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users(id) on delete cascade default auth.uid(),
  fecha       date not null default current_date,
  categoria   text not null check (categoria in ('Sueldo','Operaciones','Extras','Otro')),
  descripcion text,
  monto       numeric(12,2) not null check (monto > 0),
  created_at  timestamptz not null default now()
);
create index if not exists ingresos_user_fecha_idx on public.ingresos (user_id, fecha desc);

-- ---------------------------------------------------------------------
-- gastos
-- ---------------------------------------------------------------------
create table if not exists public.gastos (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users(id) on delete cascade default auth.uid(),
  fecha       date not null default current_date,
  categoria   text not null check (categoria in ('Comida','Almacén','Nafta','Supermercado','Servicios','Salud','Otros')),
  descripcion text,
  monto       numeric(12,2) not null check (monto > 0),
  created_at  timestamptz not null default now()
);
create index if not exists gastos_user_fecha_idx on public.gastos (user_id, fecha desc);

-- ---------------------------------------------------------------------
-- facturas
-- ---------------------------------------------------------------------
create table if not exists public.facturas (
  id                bigint generated always as identity primary key,
  user_id           uuid not null references auth.users(id) on delete cascade default auth.uid(),
  fecha             date not null default current_date,
  dia_vencimiento   smallint not null check (dia_vencimiento between 1 and 31),
  descripcion       text not null,
  monto             numeric(12,2),
  estado            text not null default 'pendiente' check (estado in ('pendiente','pagado')),
  fecha_pago        date,
  created_at        timestamptz not null default now()
);
create index if not exists facturas_user_estado_idx on public.facturas (user_id, estado, dia_vencimiento);

-- ---------------------------------------------------------------------
-- ahorros (ver nota de convención de signo al principio del archivo)
-- ---------------------------------------------------------------------
create table if not exists public.ahorros (
  id                    bigint generated always as identity primary key,
  user_id               uuid not null references auth.users(id) on delete cascade default auth.uid(),
  fecha                 date not null default current_date,
  tipo                  text not null check (tipo in ('UALA','Galicia','Mercado','FIMA A','FIMA B','FIMA C','Otro')),
  monto                 numeric(12,2) not null,
  rentabilidad_estimada numeric(5,2),
  created_at            timestamptz not null default now()
);
create index if not exists ahorros_user_fecha_idx on public.ahorros (user_id, fecha desc);

-- ---------------------------------------------------------------------
-- recordatorios (no se usa en la UI todavía, preparada para el bot futuro)
-- ---------------------------------------------------------------------
create table if not exists public.recordatorios (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users(id) on delete cascade default auth.uid(),
  fecha       date not null,
  hora        time,
  descripcion text not null,
  completado  boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists recordatorios_user_fecha_idx on public.recordatorios (user_id, fecha);

-- ---------------------------------------------------------------------
-- chat_log
-- ---------------------------------------------------------------------
create table if not exists public.chat_log (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users(id) on delete cascade default auth.uid(),
  ts          timestamptz not null default now(),
  source      text not null default 'web' check (source in ('web','whatsapp','telegram')),
  command     text not null,
  reply       text,
  status      text not null check (status in ('OK','ERROR')),
  created_at  timestamptz not null default now()
);
create index if not exists chat_log_user_ts_idx on public.chat_log (user_id, ts desc);

-- =====================================================================
-- Row Level Security: cada usuario solo ve y modifica sus propias filas
-- =====================================================================
alter table public.usuarios enable row level security;
alter table public.ingresos enable row level security;
alter table public.gastos enable row level security;
alter table public.facturas enable row level security;
alter table public.ahorros enable row level security;
alter table public.recordatorios enable row level security;
alter table public.chat_log enable row level security;

-- usuarios: scoped por id (no user_id)
create policy "usuarios_select_own" on public.usuarios for select using (id = auth.uid());
create policy "usuarios_update_own" on public.usuarios for update using (id = auth.uid()) with check (id = auth.uid());

-- ingresos
create policy "ingresos_select_own" on public.ingresos for select using (user_id = auth.uid());
create policy "ingresos_insert_own" on public.ingresos for insert with check (user_id = auth.uid());
create policy "ingresos_update_own" on public.ingresos for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "ingresos_delete_own" on public.ingresos for delete using (user_id = auth.uid());

-- gastos
create policy "gastos_select_own" on public.gastos for select using (user_id = auth.uid());
create policy "gastos_insert_own" on public.gastos for insert with check (user_id = auth.uid());
create policy "gastos_update_own" on public.gastos for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "gastos_delete_own" on public.gastos for delete using (user_id = auth.uid());

-- facturas
create policy "facturas_select_own" on public.facturas for select using (user_id = auth.uid());
create policy "facturas_insert_own" on public.facturas for insert with check (user_id = auth.uid());
create policy "facturas_update_own" on public.facturas for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "facturas_delete_own" on public.facturas for delete using (user_id = auth.uid());

-- ahorros
create policy "ahorros_select_own" on public.ahorros for select using (user_id = auth.uid());
create policy "ahorros_insert_own" on public.ahorros for insert with check (user_id = auth.uid());
create policy "ahorros_update_own" on public.ahorros for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "ahorros_delete_own" on public.ahorros for delete using (user_id = auth.uid());

-- recordatorios
create policy "recordatorios_select_own" on public.recordatorios for select using (user_id = auth.uid());
create policy "recordatorios_insert_own" on public.recordatorios for insert with check (user_id = auth.uid());
create policy "recordatorios_update_own" on public.recordatorios for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "recordatorios_delete_own" on public.recordatorios for delete using (user_id = auth.uid());

-- chat_log
create policy "chat_log_select_own" on public.chat_log for select using (user_id = auth.uid());
create policy "chat_log_insert_own" on public.chat_log for insert with check (user_id = auth.uid());

-- Sierra Tayrona Wind — consola de gestión de reservas
-- Estados ampliados, bitácora de seguimiento, bloqueos de fechas/contactos y administradores.

-- 1. "check_in no en el pasado" solo debe validarse al CREAR la solicitud.
--    Como CHECK se reevaluaba en cada UPDATE, impedía cambiar el estado de
--    reservas cuya fecha de llegada ya pasó (check-in, completar, no-show).
alter table public.booking_requests drop constraint chk_not_in_past;

create or replace function public.enforce_check_in_not_past()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.check_in < ((now() at time zone 'America/Bogota')::date) then
    raise exception 'check_in no puede estar en el pasado' using errcode = '23514';
  end if;
  return new;
end $$;

create trigger trg_check_in_not_past
  before insert on public.booking_requests
  for each row execute function public.enforce_check_in_not_past();

-- 2. Ciclo de vida completo, al estilo de los PMS hoteleros:
--    pending → on_hold (pre-reserva) → approved → checked_in → completed
--    y salidas: rejected, cancelled, no_show.
alter table public.booking_requests drop constraint booking_requests_status_check;
alter table public.booking_requests add constraint booking_requests_status_check
  check (status in ('pending','on_hold','approved','rejected','cancelled','checked_in','completed','no_show'));

-- Las estancias que ocupan el apartamento no pueden traslaparse.
alter table public.booking_requests drop constraint booking_requests_stay_range_excl;
alter table public.booking_requests add constraint booking_requests_stay_range_excl
  exclude using gist (stay_range with &&) where (status in ('approved','checked_in','completed'));

alter table public.booking_requests
  add column confirmation_code text unique,
  add column quoted_price numeric(12,2) check (quoted_price is null or quoted_price >= 0),
  add column internal_notes text check (char_length(internal_notes) <= 4000),
  add column decision_reason text check (char_length(decision_reason) <= 1000),
  add column decided_by text,
  add column updated_at timestamptz not null default now();

-- 3. Administradores de la consola (por correo de Supabase Auth).
create table public.admin_users (
  email text primary key check (email = lower(email)),
  full_name text,
  created_at timestamptz not null default now()
);
alter table public.admin_users enable row level security;

insert into public.admin_users (email, full_name) values
  ('juan.etayo@cacsantabarbara.co', 'Juan Carlos Etayo'),
  ('etayojuanc@gmail.com', 'Juan Carlos Etayo'),
  ('edwin.etayo@gmail.com', 'Edwin Etayo'),
  -- Usuario "adminwind" de la consola (el login convierte usuario → este correo técnico).
  ('adminwind@sierratayronawind.app', 'Administrador (prueba)');

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.admin_users
    where email = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;
revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

create policy admin_users_self_read on public.admin_users
  for select to authenticated using (public.is_admin());

-- 4. Bitácora de seguimiento (timeline de cada solicitud).
create table public.booking_events (
  id bigint generated always as identity primary key,
  booking_id uuid not null references public.booking_requests(id) on delete cascade,
  action text not null,
  from_status text,
  to_status text,
  note text,
  actor_email text,
  notified_email boolean not null default false,
  created_at timestamptz not null default now()
);
create index idx_booking_events_booking on public.booking_events (booking_id, created_at desc);
alter table public.booking_events enable row level security;
create policy booking_events_admin_read on public.booking_events
  for select to authenticated using (public.is_admin());

-- 5. Fechas bloqueadas por el propietario (mantenimiento, uso personal, etc.).
create table public.blocked_dates (
  id uuid primary key default gen_random_uuid(),
  start_date date not null,
  end_date date not null,
  reason text check (char_length(reason) <= 300),
  created_by text,
  created_at timestamptz not null default now(),
  constraint chk_block_order check (end_date > start_date)
);
create index idx_blocked_dates_range on public.blocked_dates using gist (daterange(start_date, end_date, '[)'));
alter table public.blocked_dates enable row level security;
create policy blocked_dates_admin_all on public.blocked_dates
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- 6. Contactos bloqueados (lista negra: spam o huéspedes no deseados).
create table public.blocked_contacts (
  id uuid primary key default gen_random_uuid(),
  email text,
  phone_digits text,
  reason text check (char_length(reason) <= 300),
  created_by text,
  created_at timestamptz not null default now(),
  constraint chk_contact_present check (email is not null or phone_digits is not null)
);
create index idx_blocked_contacts_email on public.blocked_contacts (lower(email));
create index idx_blocked_contacts_phone on public.blocked_contacts (phone_digits);
alter table public.blocked_contacts enable row level security;
create policy blocked_contacts_admin_all on public.blocked_contacts
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- 7. Los administradores leen las solicitudes; toda escritura pasa por la
--    Edge Function admin-booking (auditoría + correos).
create policy booking_requests_admin_read on public.booking_requests
  for select to authenticated using (public.is_admin());

-- 8. Disponibilidad pública: estancias confirmadas + bloqueos del propietario.
create or replace view public.public_availability
with (security_invoker = false) as
select check_in, check_out
from public.booking_requests
where status in ('approved','checked_in','completed')
union all
select start_date, end_date from public.blocked_dates;

grant select on public.public_availability to anon, authenticated;

-- Avisos en vivo de nuevas solicitudes en la consola (Realtime respeta RLS).
alter publication supabase_realtime add table public.booking_requests;

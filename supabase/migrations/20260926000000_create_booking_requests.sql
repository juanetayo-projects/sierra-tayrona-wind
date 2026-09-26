-- Sierra Tayrona Wind — booking requests schema
-- Applied to Supabase project: sierra-tayrona-wind (dwyyhrntkcqnowsyimjz)

create schema if not exists extensions;
create extension if not exists btree_gist with schema extensions;

create table public.booking_requests (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (char_length(trim(full_name)) between 3 and 120),
  phone text not null check (char_length(trim(phone)) between 7 and 20),
  email text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  visit_reason text not null check (visit_reason in ('vacaciones','fin_de_semana','pasadia','evento','reunion','otro')),
  check_in date not null,
  check_out date not null,
  guests smallint not null check (guests between 1 and 20),
  comments text check (char_length(comments) <= 2000),
  consent_accepted boolean not null default false,
  status text not null default 'pending' check (status in ('pending','approved','rejected','cancelled')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  stay_range daterange generated always as (daterange(check_in, check_out, '[)')) stored,
  constraint chk_dates_order check (check_out > check_in),
  constraint chk_not_in_past check (check_in >= ((now() at time zone 'America/Bogota')::date)),
  constraint chk_consent check (consent_accepted = true),
  exclude using gist (stay_range with &&) where (status = 'approved')
);

comment on table public.booking_requests is 'Solicitudes de reserva del apartamento Sierra Tayrona Wind. Insertadas solo via Edge Function (service role) tras validar Turnstile/honeypot/rate-limit; el cliente nunca inserta directo con la anon key.';

create index idx_booking_requests_status on public.booking_requests (status);
create index idx_booking_requests_dates on public.booking_requests using gist (stay_range);

alter table public.booking_requests enable row level security;
-- No policies for anon/authenticated: direct client access is fully denied by default.
-- All writes happen through the Edge Function using the service role key, which bypasses RLS.

-- Public, privacy-safe view: only the date ranges already confirmed, no personal data.
-- Intentionally SECURITY DEFINER-style (security_invoker = false): it must read past
-- booking_requests' RLS (which denies anon entirely) while exposing only two columns.
create view public.public_availability
with (security_invoker = false) as
select check_in, check_out
from public.booking_requests
where status = 'approved';

comment on view public.public_availability is 'Rangos de fechas ya confirmadas, sin datos personales. Expuesta al publico para pintar el calendario del formulario.';

grant select on public.public_availability to anon, authenticated;

-- Lightweight rate-limiting ledger for the Edge Function (service role only, never exposed to clients).
create table public.booking_submission_attempts (
  id bigint generated always as identity primary key,
  ip_hash text not null,
  created_at timestamptz not null default now()
);

create index idx_submission_attempts_ip_time on public.booking_submission_attempts (ip_hash, created_at desc);

alter table public.booking_submission_attempts enable row level security;
-- No policies: only the service role (Edge Function) can read/write this table.

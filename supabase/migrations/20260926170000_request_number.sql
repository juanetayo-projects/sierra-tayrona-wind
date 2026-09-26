-- Número de solicitud visible para el huésped y la consola (SOL-00001, SOL-00002, …).
alter table public.booking_requests add column request_number bigint;

-- Las solicitudes existentes se numeran en orden de llegada.
update public.booking_requests r
set request_number = n.rn
from (select id, row_number() over (order by created_at, id) as rn from public.booking_requests) n
where n.id = r.id;

create sequence public.booking_requests_request_number_seq owned by public.booking_requests.request_number;
select setval('public.booking_requests_request_number_seq', coalesce((select max(request_number) from public.booking_requests), 0) + 1, false);

alter table public.booking_requests
  alter column request_number set default nextval('public.booking_requests_request_number_seq'),
  alter column request_number set not null,
  add constraint booking_requests_request_number_key unique (request_number);

-- Etiqueta legible, calculada por la base de datos.
alter table public.booking_requests
  add column request_code text generated always as ('SOL-' || lpad(request_number::text, 5, '0')) stored;

comment on column public.booking_requests.request_code is 'Número de solicitud que ve el huésped al enviar el formulario (SOL-00001).';

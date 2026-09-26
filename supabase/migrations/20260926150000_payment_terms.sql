-- Condiciones de pago acordadas con el huésped: solo se acepta COP o USD.
alter table public.booking_requests
  add column price_currency text not null default 'COP' check (price_currency in ('COP','USD')),
  add column payment_method text check (payment_method in ('transferencia','efectivo','tarjeta','otro'));

comment on column public.booking_requests.price_currency is 'Moneda del valor acordado: pesos colombianos (COP) o dólares (USD). No se aceptan otras monedas.';
comment on column public.booking_requests.payment_method is 'Método de pago acordado con el huésped al aprobar la reserva.';

# Configuración del proyecto Supabase

- **Proyecto:** `sierra-tayrona-wind` (`dwyyhrntkcqnowsyimjz`), organización `juan.etayo@cacsantabarbara.co's Org`, región `us-east-1`.
- **URL:** `https://dwyyhrntkcqnowsyimjz.supabase.co`
- **Publishable (anon) key** — segura para usar en el frontend, ya que las políticas de RLS son las que realmente controlan el acceso:
  `sb_publishable_B6yeo_9GwZDbQEmh9agyMA_FRX2amNB`

La `service_role` key **nunca** debe usarse en el frontend ni commitearse a este repo; vive únicamente como secreto de la Edge Function dentro de Supabase.

## Esquema

Ver [`migrations/20260926000000_create_booking_requests.sql`](migrations/20260926000000_create_booking_requests.sql).

- `booking_requests`: tabla principal. RLS activo **sin ninguna política** para `anon`/`authenticated` — el cliente no puede insertar, leer, actualizar ni borrar directamente. Toda escritura pasa por la Edge Function (rol `service_role`, que ignora RLS) después de validar Turnstile + honeypot + límite de solicitudes.
- `public_availability`: vista pública (solo `check_in`/`check_out` de reservas `approved`) para pintar el calendario sin exponer datos personales de otros huéspedes.
- `booking_submission_attempts`: bitácora ligera para limitar solicitudes por IP desde la Edge Function.
- Restricción de exclusión (`exclude using gist`) que impide dos reservas `approved` con fechas que se traslapen — el propio motor de base de datos evita el doble-booking al aprobar.
- Restricción `chk_not_in_past` calculada en `America/Bogota`, evaluada en cada inserción.

## Pendiente para conectar el formulario

1. Cuenta de Cloudflare Turnstile (site key + secret key).
2. API key de Resend (la que ya usas en otros proyectos).
3. Escribir la Edge Function que reciba el formulario, valide Turnstile + honeypot + rate limit, inserte en `booking_requests` con `service_role`, y envíe el correo de notificación con Resend.
4. Apuntar `index.html` a esa Edge Function en lugar del `console.log` actual de la demo.

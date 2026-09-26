# Sierra Tayrona Wind — Formulario de reserva

Landing + formulario de solicitud de reserva para el apartamento en Playa Salguero, Santa Marta.

## Estado actual

**Fase 1 — Mockup visual e interactivo (sin backend).** `index.html` es un prototipo estático que demuestra:

- Landing de presentación con la identidad de marca (colores, tipografía) tomada de las piezas gráficas de Sierra Tayrona Wind.
- Formulario de solicitud de reserva: motivo de la visita, calendario de fechas (check-in/check-out, estilo rango continuo), número de huéspedes, datos de contacto y comentarios.
- Calendario que bloquea visualmente fechas pasadas y fechas ya ocupadas (datos de ejemplo, aún no conectado a una base de datos real).
- Campo honeypot oculto como primera capa anti-spam (visual únicamente en esta fase).

Fotos reales del apartamento y logo oficial (`assets/photos/`, `assets/logo/`) ya incorporados — se usa la versión clara del logo sobre fondos claros y la versión navy sobre el hero/footer. Quedan pendientes más fotos (baños, habitación) si se quiere ampliar la galería.

**Fase 2 — Base de datos (en curso).** Proyecto Supabase dedicado `sierra-tayrona-wind` creado, con el esquema de solicitudes de reserva aplicado. Ver [`supabase/config.md`](supabase/config.md) y [`supabase/migrations/`](supabase/migrations/).

## Próximos pasos (pendientes, definidos junto con el propietario)

- [x] Crear proyecto dedicado en Supabase (separado de los proyectos de la Clínica CAC) con la tabla de solicitudes de reserva.
- [x] RLS: el formulario público no puede leer ni escribir directo en la tabla; solo puede leer los rangos de fechas ya confirmados (vista `public_availability`, sin datos personales de otros huéspedes).
- [x] Restricción a nivel de base de datos: no se puede insertar una reserva con `check_in` en el pasado (zona horaria `America/Bogota`), y no se pueden traslapar dos reservas `approved`.
- [ ] Edge Function para recibir el envío: verifica Cloudflare Turnstile + honeypot + límite de solicitudes por IP antes de insertar en la base de datos (requiere cuenta de Turnstile).
- [ ] Notificación por correo (HTML con diseño de marca) a `edwin.etayo@gmail.com` y `etayojuanc@gmail.com` con los datos del solicitante cuando llega una nueva solicitud, vía Resend (cuenta existente); la aprobación de la reserva se hace manualmente por ahora.
- [ ] Conectar `index.html` a la Edge Function (hoy el envío es una simulación visual, sin guardar nada).
- [x] Reemplazar fotos de marcador de posición por las fotografías reales (logo, sala, cocina-comedor).
- [ ] Despliegue en GitHub Pages.

## Decisiones ya confirmadas

- Marca pública: **Sierra Tayrona Wind**.
- Fechas: rango continuo único por solicitud (check-in/check-out), sin fechas sueltas no contiguas.
- Flujo de aprobación: solicitud → revisión manual del propietario por WhatsApp/correo (sin aprobación automática por ahora).
- Anti-spam: honeypot + Cloudflare Turnstile + Edge Function (capa completa, no solo honeypot).
- Notificaciones: correo electrónico con plantilla HTML elegante a `edwin.etayo@gmail.com` y `etayojuanc@gmail.com` (no WhatsApp).

## Fase 3 — Consola de gestión de reservas (`/admin/`)

URL: https://juanetayo-projects.github.io/sierra-tayrona-wind/admin/ — separada del formulario público (no hay enlaces entre ambos y tiene `noindex`). Instalable en el teléfono como app (PWA).

- **Login** con el logo de marca. Acepta usuario (`adminwind` → `adminwind@sierratayronawind.app`) o correo. Solo entran las cuentas registradas en `public.admin_users`.
- **Panel de control** (modelo PMS: Airbnb Insights / Booking Extranet / Cloudbeds): llegadas, salidas y hospedados de hoy; solicitudes, aprobadas, rechazadas, conversión, ocupación a 30 días, tiempo de respuesta, anticipación, estancia promedio, ingresos y ADR; tendencia semanal/mensual, mapa de calor día × hora de las solicitudes, meses y días de llegada más pedidos, calendario de demanda a 6 meses, embudo de estados, motivos, tamaño de grupo y anticipación.
- **Solicitudes**: filtros por estado, búsqueda, alertas de cruce de fechas y detalle con contacto directo (WhatsApp / llamada / correo), valor, notas internas y línea de tiempo de seguimiento.
- **Ciclo de vida**: pendiente → pre-reserva → aprobada → hospedado → finalizada; salidas: rechazada, cancelada, no se presentó; reabrir; bloquear solicitante; reenviar notificación.
- **Notificaciones**: al aprobar, rechazar, cancelar o pre-reservar se envía correo al huésped (Edge Function `admin-booking` + Resend) y se prepara el mensaje de WhatsApp con todos los datos (un toque desde el teléfono vía `wa.me`).
- **Calendario**: ocupación, solicitudes en revisión y bloqueos de fechas (los bloqueos también se reflejan en el formulario público).
- **Ajustes**: solicitantes bloqueados, tema claro/oscuro, exportar CSV, cambiar contraseña.

Esquema: [`supabase/migrations/20260926120000_admin_console.sql`](supabase/migrations/20260926120000_admin_console.sql).

Secretos opcionales de la Edge Function `admin-booking`: `RESEND_FROM_EMAIL` (remitente con dominio verificado), `RESEND_REPLY_TO` (buzón que recibe respuestas de huéspedes), `OWNER_WHATSAPP` (número del propietario para el botón de WhatsApp en los correos).

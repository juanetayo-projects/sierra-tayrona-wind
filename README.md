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

# Sierra Tayrona Wind — Formulario de reserva

Landing + formulario de solicitud de reserva para el apartamento en Playa Salguero, Santa Marta.

## Estado actual

**Fase 1 — Mockup visual e interactivo (sin backend).** `index.html` es un prototipo estático que demuestra:

- Landing de presentación con la identidad de marca (colores, tipografía) tomada de las piezas gráficas de Sierra Tayrona Wind.
- Formulario de solicitud de reserva: motivo de la visita, calendario de fechas (check-in/check-out, estilo rango continuo), número de huéspedes, datos de contacto y comentarios.
- Calendario que bloquea visualmente fechas pasadas y fechas ya ocupadas (datos de ejemplo, aún no conectado a una base de datos real).
- Campo honeypot oculto como primera capa anti-spam (visual únicamente en esta fase).

Las fotografías son marcadores de posición — pendiente reemplazar por fotos reales del apartamento sin texto superpuesto.

## Próximos pasos (pendientes, definidos junto con el propietario)

- [ ] Crear proyecto dedicado en Supabase (separado de los proyectos de la Clínica CAC) con la tabla de solicitudes de reserva.
- [ ] RLS: el formulario público solo puede insertar solicitudes; solo puede leer los rangos de fechas ya ocupados (sin datos personales de otros huéspedes).
- [ ] Validación de fecha mínima (no reservar en el pasado) en zona horaria `America/Bogota`, en el cliente y en el servidor.
- [ ] Edge Function para recibir el envío: verifica Cloudflare Turnstile + honeypot + límite de solicitudes por IP antes de insertar en la base de datos.
- [ ] Notificación por correo (HTML con diseño de marca) a `edwin.etayo@gmail.com` y `etayojuanc@gmail.com` con los datos del solicitante cuando llega una nueva solicitud; la aprobación de la reserva se hace manualmente por ahora.
- [ ] Reemplazar fotos de marcador de posición por fotografías reales.
- [ ] Despliegue en GitHub Pages.

## Decisiones ya confirmadas

- Marca pública: **Sierra Tayrona Wind**.
- Fechas: rango continuo único por solicitud (check-in/check-out), sin fechas sueltas no contiguas.
- Flujo de aprobación: solicitud → revisión manual del propietario por WhatsApp/correo (sin aprobación automática por ahora).
- Anti-spam: honeypot + Cloudflare Turnstile + Edge Function (capa completa, no solo honeypot).
- Notificaciones: correo electrónico con plantilla HTML elegante a `edwin.etayo@gmail.com` y `etayojuanc@gmail.com` (no WhatsApp).

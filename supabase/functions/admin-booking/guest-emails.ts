// Plantillas de correo al huésped para las decisiones tomadas desde la consola.
// Mismo lenguaje visual que los correos de submit-booking.

export interface GuestEmailData {
  fullName: string;
  confirmationCode: string | null;
  reasonLabel: string;
  checkInLabel: string;
  checkOutLabel: string;
  nights: number;
  guests: number;
  priceLabel: string | null;
  message: string | null;
  formUrl: string;
  whatsappUrl: string | null;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function row(label: string, value: string): string {
  return `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid #E4DFD3;font:600 12px/1.4 Georgia,'Times New Roman',serif;color:#9B937F;text-transform:uppercase;letter-spacing:0.5px;width:150px;vertical-align:top;">${label}</td>
      <td style="padding:10px 0;border-bottom:1px solid #E4DFD3;font:400 15px/1.5 -apple-system,Segoe UI,Arial,sans-serif;color:#1B2430;vertical-align:top;">${value}</td>
    </tr>`;
}

function button(href: string, label: string, bg: string): string {
  return `<a href="${esc(href)}" style="display:inline-block;background:${bg};color:#ffffff;text-decoration:none;font:600 14px/1 -apple-system,Segoe UI,Arial,sans-serif;padding:14px 22px;border-radius:10px;margin:4px 4px;">${label}</a>`;
}

function layout(eyebrow: string, inner: string): string {
  return `<!doctype html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#FAF6EE;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FAF6EE;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 8px 24px rgba(14,42,74,0.12);">
          <tr>
            <td style="background:linear-gradient(160deg,#163A63 0%,#0E2A4A 60%,#0A1E38 100%);padding:32px 28px;text-align:center;">
              <div style="font:600 22px/1.2 Georgia,'Times New Roman',serif;color:#ffffff;">Sierra Tayrona Wind</div>
              <div style="font:600 11px/1.4 -apple-system,Segoe UI,Arial,sans-serif;color:#C9A227;letter-spacing:2px;text-transform:uppercase;margin-top:6px;">${eyebrow}</div>
            </td>
          </tr>
          ${inner}
          <tr>
            <td style="background:#0E2A4A;padding:18px 28px;text-align:center;">
              <div style="font:400 11px/1.5 -apple-system,Segoe UI,Arial,sans-serif;color:rgba(255,255,255,0.55);">
                Sierra Tayrona Wind · Playa Salguero, Santa Marta, Colombia
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function para(html: string): string {
  return `<p style="margin:0 0 16px;font:400 14px/1.6 -apple-system,Segoe UI,Arial,sans-serif;color:#4A4436;">${html}</p>`;
}

function greeting(name: string): string {
  return `<p style="margin:0 0 8px;font:600 16px/1.4 Georgia,'Times New Roman',serif;color:#0E2A4A;">¡Hola, ${esc(name)}!</p>`;
}

function messageBox(message: string | null): string {
  if (!message) return "";
  return `<div style="background:#F4F7FA;border-left:3px solid #2F6690;border-radius:8px;padding:12px 14px;margin:0 0 16px;font:400 14px/1.6 -apple-system,Segoe UI,Arial,sans-serif;color:#1B2430;">${esc(message).replace(/\n/g, "<br>")}</div>`;
}

function stayRows(b: GuestEmailData, withCode: boolean): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    ${withCode && b.confirmationCode ? row("Código", `<strong style="letter-spacing:1px;color:#0E2A4A;">${esc(b.confirmationCode)}</strong>`) : ""}
    ${row("Llegada", b.checkInLabel)}
    ${row("Salida", b.checkOutLabel)}
    ${row("Noches", String(b.nights))}
    ${row("Huéspedes", String(b.guests))}
    ${row("Motivo", esc(b.reasonLabel))}
    ${b.priceLabel ? row("Valor total", `<strong>${esc(b.priceLabel)}</strong>`) : ""}
  </table>`;
}

export function renderApprovedEmail(b: GuestEmailData): string {
  return layout("Reserva confirmada", `
    <tr><td style="padding:28px 28px 8px;">
      ${greeting(b.fullName)}
      ${para("Nos alegra confirmarte que <strong>tu reserva en Sierra Tayrona Wind está aprobada</strong>. Te esperamos en Playa Salguero, Santa Marta. Estos son los datos de tu estancia:")}
      ${stayRows(b, true)}
    </td></tr>
    <tr><td style="padding:16px 28px 8px;">
      ${messageBox(b.message)}
      <div style="background:#EAF4EE;border:1px solid #3F8F63;border-radius:10px;padding:14px 16px;font:400 13px/1.5 -apple-system,Segoe UI,Arial,sans-serif;color:#24573B;">
        Guarda tu código de confirmación <strong>${esc(b.confirmationCode ?? "")}</strong>. Si necesitas cambiar algo, respóndenos a este correo${b.whatsappUrl ? " o escríbenos por WhatsApp" : ""}.
      </div>
    </td></tr>
    ${b.whatsappUrl ? `<tr><td style="padding:12px 28px 28px;text-align:center;">${button(b.whatsappUrl, "Escribir por WhatsApp", "#1F8F5F")}</td></tr>` : `<tr><td style="padding:0 0 20px;"></td></tr>`}
  `);
}

export function renderRejectedEmail(b: GuestEmailData): string {
  return layout("Gracias por tu interés", `
    <tr><td style="padding:28px 28px 8px;">
      ${greeting(b.fullName)}
      ${para("Muchas gracias por tu interés en hospedarte en nuestro apartamento <strong>Sierra Tayrona Wind</strong> en Playa Salguero.")}
      ${para(`Lamentablemente, en esta ocasión no nos es posible confirmar tu solicitud para las fechas del <strong>${b.checkInLabel}</strong> al <strong>${b.checkOutLabel}</strong>.`)}
      ${messageBox(b.message)}
      ${para("Nos encantaría recibirte en otra oportunidad. Puedes consultar nuevas fechas disponibles y enviarnos una nueva solicitud cuando quieras.")}
    </td></tr>
    <tr><td style="padding:4px 28px 28px;text-align:center;">${button(b.formUrl, "Ver otras fechas", "#0E2A4A")}</td></tr>
  `);
}

export function renderCancelledEmail(b: GuestEmailData): string {
  return layout("Reserva cancelada", `
    <tr><td style="padding:28px 28px 8px;">
      ${greeting(b.fullName)}
      ${para(`Te confirmamos que la reserva${b.confirmationCode ? ` <strong>${esc(b.confirmationCode)}</strong>` : ""} para las fechas del <strong>${b.checkInLabel}</strong> al <strong>${b.checkOutLabel}</strong> fue <strong>cancelada</strong>.`)}
      ${messageBox(b.message)}
      ${para("Gracias por tenernos en cuenta. Si quieres reprogramar tu visita, con gusto te ayudamos.")}
    </td></tr>
    <tr><td style="padding:4px 28px 28px;text-align:center;">${button(b.formUrl, "Solicitar nuevas fechas", "#0E2A4A")}</td></tr>
  `);
}

export function renderOnHoldEmail(b: GuestEmailData): string {
  return layout("Pre-reserva", `
    <tr><td style="padding:28px 28px 8px;">
      ${greeting(b.fullName)}
      ${para("Revisamos tu solicitud y <strong>apartamos temporalmente tus fechas</strong> mientras terminamos de confirmar los detalles contigo.")}
      ${stayRows(b, false)}
    </td></tr>
    <tr><td style="padding:16px 28px 28px;">
      ${messageBox(b.message)}
      <div style="background:#FBF3EA;border:1px solid #C9A227;border-radius:10px;padding:14px 16px;font:400 13px/1.5 -apple-system,Segoe UI,Arial,sans-serif;color:#7A5F12;">
        La pre-reserva aún <strong>no es una confirmación definitiva</strong>. Te escribiremos pronto para cerrarla.
      </div>
    </td></tr>
  `);
}

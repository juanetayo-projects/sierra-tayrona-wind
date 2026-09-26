export interface BookingEmailData {
  fullName: string;
  phone: string;
  email: string;
  reasonLabel: string;
  checkInLabel: string;
  checkOutLabel: string;
  guests: number;
  comments: string | null;
  createdAtLabel: string;
}

function row(label: string, value: string): string {
  return `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid #E4DFD3;font:600 12px/1.4 Georgia,'Times New Roman',serif;color:#9B937F;text-transform:uppercase;letter-spacing:0.5px;width:150px;vertical-align:top;">${label}</td>
      <td style="padding:10px 0;border-bottom:1px solid #E4DFD3;font:400 15px/1.5 -apple-system,Segoe UI,Arial,sans-serif;color:#1B2430;vertical-align:top;">${value}</td>
    </tr>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderBookingEmail(b: BookingEmailData): string {
  const comments = b.comments
    ? escapeHtml(b.comments).replace(/\n/g, "<br>")
    : "<span style=\"color:#9B937F;font-style:italic;\">Sin comentarios adicionales</span>";

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
              <div style="font:600 11px/1.4 -apple-system,Segoe UI,Arial,sans-serif;color:#C9A227;letter-spacing:2px;text-transform:uppercase;margin-top:6px;">Nueva solicitud de reserva</div>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 28px 8px;">
              <p style="margin:0 0 20px;font:400 14px/1.6 -apple-system,Segoe UI,Arial,sans-serif;color:#4A4436;">
                Alguien solicitó reservar el apartamento. Revisa los datos y confirma la disponibilidad directamente con el solicitante.
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                ${row("Nombre", escapeHtml(b.fullName))}
                ${row("Teléfono", `<a href="tel:${escapeHtml(b.phone)}" style="color:#2F6690;text-decoration:none;">${escapeHtml(b.phone)}</a>`)}
                ${row("Correo", `<a href="mailto:${escapeHtml(b.email)}" style="color:#2F6690;text-decoration:none;">${escapeHtml(b.email)}</a>`)}
                ${row("Motivo", escapeHtml(b.reasonLabel))}
                ${row("Llegada", b.checkInLabel)}
                ${row("Salida", b.checkOutLabel)}
                ${row("Huéspedes", String(b.guests))}
                ${row("Comentarios", comments)}
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 28px 28px;">
              <div style="background:#FBF3EA;border:1px solid #C9A227;border-radius:10px;padding:14px 16px;font:400 13px/1.5 -apple-system,Segoe UI,Arial,sans-serif;color:#7A5F12;">
                Esta solicitud queda en estado <strong>pendiente</strong> hasta que la confirmes manualmente con el huésped. Recibida el ${b.createdAtLabel} (hora de Bogotá).
              </div>
            </td>
          </tr>
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

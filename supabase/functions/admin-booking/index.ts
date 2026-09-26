import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  type GuestEmailData,
  renderApprovedEmail,
  renderCancelledEmail,
  renderOnHoldEmail,
  renderRejectedEmail,
} from "./guest-emails.ts";

// Acciones de la consola de gestión. Solo usuarios de public.admin_users.
// Cada cambio de estado queda en booking_events y, si aplica, se notifica al
// huésped por correo (Resend). El mensaje de WhatsApp se devuelve ya armado
// para que la consola lo abra con wa.me desde el teléfono del administrador.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const RESEND_FROM_EMAIL = Deno.env.get("RESEND_FROM_EMAIL") ?? "Sierra Tayrona Wind <onboarding@resend.dev>";
const RESEND_REPLY_TO = Deno.env.get("RESEND_REPLY_TO") ?? "etayojuanc@gmail.com";
// Número de WhatsApp del propietario (solo dígitos, con indicativo). Opcional:
// si existe, los correos al huésped incluyen un botón para escribirle.
const OWNER_WHATSAPP = (Deno.env.get("OWNER_WHATSAPP") ?? "573160232830").replace(/\D/g, "");
const FORM_URL = "https://juanetayo-projects.github.io/sierra-tayrona-wind/";

const ALLOWED_ORIGINS = new Set([
  "http://localhost:5173",
  "https://juanetayo-projects.github.io",
]);

const REASON_LABELS: Record<string, string> = {
  vacaciones: "Vacaciones familiares",
  fin_de_semana: "Fin de semana",
  pasadia: "Pasadía",
  evento: "Evento",
  reunion: "Reunión empresarial",
  otro: "Otro",
};

type Status =
  | "pending" | "on_hold" | "approved" | "rejected"
  | "cancelled" | "checked_in" | "completed" | "no_show";

// Transiciones válidas: acción → [estados de origen, estado destino].
const TRANSITIONS: Record<string, { from: Status[]; to: Status }> = {
  approve: { from: ["pending", "on_hold"], to: "approved" },
  hold: { from: ["pending"], to: "on_hold" },
  reject: { from: ["pending", "on_hold"], to: "rejected" },
  cancel: { from: ["on_hold", "approved"], to: "cancelled" },
  check_in: { from: ["approved"], to: "checked_in" },
  complete: { from: ["approved", "checked_in"], to: "completed" },
  no_show: { from: ["approved"], to: "no_show" },
  reopen: { from: ["rejected", "cancelled", "no_show"], to: "pending" },
};

// Estados cuya decisión se comunica por correo al huésped.
const NOTIFY_STATUSES = new Set<Status>(["approved", "rejected", "cancelled", "on_hold"]);

function corsHeaders(origin: string | null): Record<string, string> {
  const allow = origin && ALLOWED_ORIGINS.has(origin) ? origin : "";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "content-type, apikey, authorization, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function json(body: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

function formatDateEs(dateStr: string): string {
  return new Date(`${dateStr}T12:00:00`).toLocaleDateString("es-CO", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "America/Bogota",
  });
}

// Solo se aceptan pagos en pesos colombianos o en dólares estadounidenses.
const CURRENCIES = new Set(["COP", "USD"]);
const PAYMENT_METHODS: Record<string, string> = {
  transferencia: "Transferencia bancaria",
  efectivo: "Efectivo",
  tarjeta: "Tarjeta de crédito / débito",
  otro: "Otro (acordado con el propietario)",
};
const ACCEPTED_CURRENCIES_NOTE = "Aceptamos pagos únicamente en pesos colombianos (COP) o en dólares estadounidenses (USD).";

function formatMoney(v: number | null, currency = "COP"): string | null {
  if (v === null || v === undefined) return null;
  const n = new Intl.NumberFormat("es-CO", { style: "currency", currency, maximumFractionDigits: 0 }).format(v);
  return currency === "USD" ? n.replace("US$", "US$ ").replace(/\s+/g, " ") : n;
}

function paymentLabel(b: Booking): string | null {
  if (!b.payment_method) return null;
  return `${PAYMENT_METHODS[b.payment_method] ?? b.payment_method} · ${b.price_currency === "USD" ? "Dólares (USD)" : "Pesos colombianos (COP)"}`;
}

// Lee moneda, método y valor del cuerpo de la petición.
function readPaymentTerms(body: Record<string, unknown>, patch: Record<string, unknown>): string | null {
  if (body.price_currency !== undefined) {
    const c = String(body.price_currency).toUpperCase();
    if (!CURRENCIES.has(c)) return "invalid_currency";
    patch.price_currency = c;
  }
  if (body.payment_method !== undefined) {
    const m = body.payment_method === null || body.payment_method === "" ? null : String(body.payment_method);
    if (m !== null && !(m in PAYMENT_METHODS)) return "invalid_payment_method";
    patch.payment_method = m;
  }
  if (body.quoted_price !== undefined) {
    const p = body.quoted_price === null || body.quoted_price === "" ? null : Number(body.quoted_price);
    if (p !== null && (!Number.isFinite(p) || p < 0)) return "invalid_price";
    patch.quoted_price = p;
  }
  return null;
}

function nightsBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
}

// deno-lint-ignore no-explicit-any
type Booking = Record<string, any>;

function newConfirmationCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return "STW-" + Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

function phoneDigits(phone: string): string {
  return phone.replace(/\D/g, "");
}


function buildWhatsappText(b: Booking, status: Status, message: string | null): string | null {
  const first = String(b.full_name).split(" ")[0];
  const inL = formatDateEs(b.check_in);
  const outL = formatDateEs(b.check_out);
  const nights = nightsBetween(b.check_in, b.check_out);
  const price = formatMoney(b.quoted_price, b.price_currency);
  const payment = paymentLabel(b);
  const extra = message ? `\n\n${message}` : "";
  switch (status) {
    case "approved":
      return [
        `¡Hola, ${first}! 🌴`,
        `Tu reserva en *Sierra Tayrona Wind* (Playa Salguero, Santa Marta) está *CONFIRMADA* ✅`,
        ``,
        `🔑 Código: *${b.confirmation_code}*`,
        `📅 Llegada: ${inL}`,
        `📅 Salida: ${outL}`,
        `🌙 Noches: ${nights}`,
        `👥 Huéspedes: ${b.guests}`,
        price ? `💵 Valor total: ${price}` : null,
        payment ? `💳 Forma de pago: ${payment}` : null,
        ``,
        ACCEPTED_CURRENCIES_NOTE,
        extra ? extra.trimEnd() : null,
        ``,
        `También te enviamos la confirmación a ${b.email}. ¡Te esperamos!`,
      ].filter((l) => l !== null).join("\n");
    case "on_hold":
      return `¡Hola, ${first}! Apartamos temporalmente tus fechas en *Sierra Tayrona Wind* del ${inL} al ${outL} (${nights} noches, ${b.guests} huéspedes) mientras confirmamos los detalles.${price ? `\n💵 Valor: ${price}` : ""}${payment ? `\n💳 Forma de pago: ${payment}` : ""}\n\n${ACCEPTED_CURRENCIES_NOTE}${extra}`;
    case "rejected":
      return `¡Hola, ${first}! Muchas gracias por tu interés en hospedarte en *Sierra Tayrona Wind*. Lamentablemente no podemos confirmar tu solicitud del ${inL} al ${outL}.${extra}\n\nNos encantaría recibirte en otras fechas: ${FORM_URL}`;
    case "cancelled":
      return `¡Hola, ${first}! Te confirmamos que tu reserva${b.confirmation_code ? ` ${b.confirmation_code}` : ""} en *Sierra Tayrona Wind* del ${inL} al ${outL} fue cancelada.${extra}`;
    default:
      return null;
  }
}

function whatsappUrl(phone: string, text: string | null): string | null {
  const digits = phoneDigits(phone);
  if (!text || digits.length < 7) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

function emailFor(b: Booking, status: Status, message: string | null): { subject: string; html: string } | null {
  const data: GuestEmailData = {
    fullName: b.full_name,
    confirmationCode: b.confirmation_code,
    reasonLabel: REASON_LABELS[b.visit_reason] ?? b.visit_reason,
    checkInLabel: formatDateEs(b.check_in),
    checkOutLabel: formatDateEs(b.check_out),
    nights: nightsBetween(b.check_in, b.check_out),
    guests: b.guests,
    priceLabel: formatMoney(b.quoted_price, b.price_currency),
    paymentLabel: paymentLabel(b),
    currenciesNote: ACCEPTED_CURRENCIES_NOTE,
    message,
    formUrl: FORM_URL,
    whatsappUrl: OWNER_WHATSAPP ? `https://wa.me/${OWNER_WHATSAPP}` : null,
  };
  switch (status) {
    case "approved":
      return { subject: `Reserva confirmada ${b.confirmation_code} — Sierra Tayrona Wind`, html: renderApprovedEmail(data) };
    case "rejected":
      return { subject: "Gracias por tu interés en Sierra Tayrona Wind", html: renderRejectedEmail(data) };
    case "cancelled":
      return { subject: "Tu reserva fue cancelada — Sierra Tayrona Wind", html: renderCancelledEmail(data) };
    case "on_hold":
      return { subject: "Pre-reserva de tus fechas — Sierra Tayrona Wind", html: renderOnHoldEmail(data) };
    default:
      return null;
  }
}

async function sendEmail(to: string, subject: string, html: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: RESEND_FROM_EMAIL, to: [to], reply_to: RESEND_REPLY_TO, subject, html }),
    });
    if (!res.ok) {
      const text = await res.text();
      console.error("resend_failed", to, text);
      return { ok: false, error: text.slice(0, 300) };
    }
    return { ok: true };
  } catch (err) {
    console.error("resend_error", to, err);
    return { ok: false, error: String(err) };
  }
}

Deno.serve(async (req: Request) => {
  const headers = corsHeaders(req.headers.get("origin"));
  if (req.method === "OPTIONS") return new Response(null, { headers });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405, headers);

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // Autenticación: JWT del usuario + pertenencia a admin_users.
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  const actorEmail = userData?.user?.email?.toLowerCase();
  if (userError || !actorEmail) return json({ ok: false, error: "unauthorized" }, 401, headers);
  const { data: admin } = await supabase.from("admin_users").select("email").eq("email", actorEmail).maybeSingle();
  if (!admin) return json({ ok: false, error: "forbidden" }, 403, headers);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400, headers);
  }

  const action = String(body.action ?? "");
  const id = String(body.id ?? "");
  const message = body.message ? String(body.message).trim().slice(0, 1000) : null;
  const notify = body.notify !== false;

  const { data: booking, error: fetchError } = await supabase
    .from("booking_requests").select("*").eq("id", id).maybeSingle();
  if (fetchError || !booking) return json({ ok: false, error: "not_found" }, 404, headers);

  const currentStatus = booking.status as Status;

  // --- Notas internas y precio (no cambian el estado) ---
  if (action === "note") {
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if ("internal_notes" in body) patch.internal_notes = body.internal_notes ? String(body.internal_notes).slice(0, 4000) : null;
    const termsError = readPaymentTerms(body, patch);
    if (termsError) return json({ ok: false, error: termsError }, 400, headers);
    const { error } = await supabase.from("booking_requests").update(patch).eq("id", id);
    if (error) return json({ ok: false, error: "update_failed" }, 500, headers);
    await supabase.from("booking_events").insert({
      booking_id: id, action: "note", from_status: currentStatus, to_status: currentStatus,
      note: "quoted_price" in body
        ? `Valor: ${formatMoney(patch.quoted_price as number | null, (patch.price_currency as string) ?? booking.price_currency) ?? "sin valor"}${patch.payment_method ? ` · ${PAYMENT_METHODS[patch.payment_method as string]}` : ""}`
        : "Notas internas actualizadas",
      actor_email: actorEmail,
    });
    return json({ ok: true }, 200, headers);
  }

  // --- Bloquear contacto (lista negra) ---
  if (action === "block_contact") {
    await supabase.from("blocked_contacts").insert({
      email: String(booking.email).toLowerCase(),
      phone_digits: phoneDigits(booking.phone),
      reason: message,
      created_by: actorEmail,
    });
    let toStatus = currentStatus;
    if (currentStatus === "pending" || currentStatus === "on_hold") {
      toStatus = "rejected";
      await supabase.from("booking_requests").update({
        status: toStatus, reviewed_at: new Date().toISOString(), decided_by: actorEmail,
        decision_reason: message ?? "Contacto bloqueado", updated_at: new Date().toISOString(),
      }).eq("id", id);
    }
    await supabase.from("booking_events").insert({
      booking_id: id, action: "block_contact", from_status: currentStatus, to_status: toStatus,
      note: message ?? "Contacto bloqueado", actor_email: actorEmail,
    });
    return json({ ok: true, status: toStatus }, 200, headers);
  }

  // --- Reenviar la notificación del estado actual ---
  if (action === "resend") {
    const mail = emailFor(booking, currentStatus, booking.decision_reason);
    if (!mail) return json({ ok: false, error: "nothing_to_resend" }, 400, headers);
    const sent = await sendEmail(booking.email, mail.subject, mail.html);
    await supabase.from("booking_events").insert({
      booking_id: id, action: "resend", from_status: currentStatus, to_status: currentStatus,
      note: sent.ok ? "Correo reenviado" : `Fallo al reenviar: ${sent.error}`, actor_email: actorEmail, notified_email: sent.ok,
    });
    return json({
      ok: true, emailSent: sent.ok, emailError: sent.error ?? null,
      whatsappUrl: whatsappUrl(booking.phone, buildWhatsappText(booking, currentStatus, booking.decision_reason)),
    }, 200, headers);
  }

  // --- Cambios de estado ---
  const transition = TRANSITIONS[action];
  if (!transition) return json({ ok: false, error: "unknown_action" }, 400, headers);
  if (!transition.from.includes(currentStatus)) {
    return json({ ok: false, error: "invalid_transition", from: currentStatus }, 409, headers);
  }
  const toStatus = transition.to;

  const patch: Record<string, unknown> = { status: toStatus, updated_at: new Date().toISOString() };

  if (toStatus === "approved") {
    // Fechas bloqueadas por el propietario (el traslape con otras reservas lo
    // impide la restricción de exclusión de la base de datos).
    const { data: blocks } = await supabase
      .from("blocked_dates").select("start_date, end_date, reason")
      .lt("start_date", booking.check_out).gt("end_date", booking.check_in);
    if (blocks && blocks.length > 0) {
      return json({ ok: false, error: "dates_blocked", blocks }, 409, headers);
    }
    patch.confirmation_code = booking.confirmation_code ?? newConfirmationCode();
  }
  if (toStatus === "approved" || toStatus === "on_hold") {
    const termsError = readPaymentTerms(body, patch);
    if (termsError) return json({ ok: false, error: termsError }, 400, headers);
    // Al aprobar, el método de pago debe quedar acordado con el huésped.
    if (toStatus === "approved" && !(patch.payment_method ?? booking.payment_method)) {
      return json({ ok: false, error: "payment_method_required" }, 400, headers);
    }
  }
  if (["approved", "rejected", "on_hold"].includes(toStatus)) {
    patch.reviewed_at = new Date().toISOString();
    patch.decided_by = actorEmail;
  }
  if (["approved", "rejected", "cancelled", "on_hold", "no_show"].includes(toStatus)) {
    patch.decision_reason = message;
  }

  const { data: updated, error: updateError } = await supabase
    .from("booking_requests").update(patch).eq("id", id).eq("status", currentStatus)
    .select("*").maybeSingle();

  if (updateError) {
    if (updateError.code === "23P01") {
      return json({ ok: false, error: "dates_conflict" }, 409, headers);
    }
    console.error("update_failed", updateError);
    return json({ ok: false, error: "update_failed" }, 500, headers);
  }
  if (!updated) return json({ ok: false, error: "concurrent_change" }, 409, headers);

  let emailSent = false;
  let emailError: string | null = null;
  if (notify && NOTIFY_STATUSES.has(toStatus)) {
    const mail = emailFor(updated, toStatus, message);
    if (mail) {
      const sent = await sendEmail(updated.email, mail.subject, mail.html);
      emailSent = sent.ok;
      emailError = sent.error ?? null;
    }
  }

  await supabase.from("booking_events").insert({
    booking_id: id, action, from_status: currentStatus, to_status: toStatus,
    note: message, actor_email: actorEmail, notified_email: emailSent,
  });

  return json({
    ok: true,
    status: toStatus,
    booking: updated,
    emailSent,
    emailError,
    whatsappUrl: whatsappUrl(updated.phone, buildWhatsappText(updated, toStatus, message)),
  }, 200, headers);
});

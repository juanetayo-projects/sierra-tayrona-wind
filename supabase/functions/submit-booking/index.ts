import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { renderBookingEmail, renderApplicantEmail } from "./email-template.ts";

// Auto-provided by Supabase for every Edge Function — no manual secret needed.
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Manually set under Edge Functions -> Secrets in the Supabase dashboard.
const TURNSTILE_SECRET_KEY = Deno.env.get("TURNSTILE_SECRET_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;

// Not secret — safe to default in code. Override via an Edge Function secret
// once a verified sending domain exists in Resend (RESEND_FROM_EMAIL).
const RESEND_FROM_EMAIL = Deno.env.get("RESEND_FROM_EMAIL") ?? "Sierra Tayrona Wind <onboarding@resend.dev>";
// TEMPORARY: Resend's sandbox mode (no verified domain yet) only allows
// sending to the account owner's own address. Restore both real recipients
// once notificaciones.cacsantabarbara.co is verified in Resend.
const NOTIFY_EMAILS = ["juan.etayo@cacsantabarbara.co"];

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

const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const MIN_FILL_TIME_MS = 3000;

function corsHeaders(origin: string | null): Record<string, string> {
  const allow = origin && ALLOWED_ORIGINS.has(origin) ? origin : "";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "content-type, apikey, authorization",
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

async function hashIp(ip: string): Promise<string> {
  const data = new TextEncoder().encode(`sierra-tayrona-wind|${ip}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function isValidEmail(v: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v);
}

function isValidDate(v: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
}

function todayInBogota(): string {
  // en-CA gives YYYY-MM-DD directly, already in the target timezone.
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
}

function formatDateEs(dateStr: string): string {
  return new Date(`${dateStr}T12:00:00`).toLocaleDateString("es-CO", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "America/Bogota",
  });
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  const headers = corsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers });
  }
  if (req.method !== "POST") {
    return json({ ok: false, error: "method_not_allowed" }, 405, headers);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400, headers);
  }

  // Honeypot: a hidden field real visitors never fill. Fail silently so bots
  // that check the response don't learn to route around it.
  if (typeof body.website === "string" && body.website.trim() !== "") {
    return json({ ok: true }, 200, headers);
  }

  // A human can't fill this form in under a few seconds.
  const loadedAt = Number(body.formLoadedAt);
  if (!Number.isFinite(loadedAt) || Date.now() - loadedAt < MIN_FILL_TIME_MS) {
    return json({ ok: false, error: "too_fast" }, 400, headers);
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const ipHash = await hashIp(ip);
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();
  const { count } = await supabase
    .from("booking_submission_attempts")
    .select("id", { count: "exact", head: true })
    .eq("ip_hash", ipHash)
    .gte("created_at", windowStart);

  // Record this attempt regardless of outcome, so repeated hammering counts.
  await supabase.from("booking_submission_attempts").insert({ ip_hash: ipHash });

  if ((count ?? 0) >= RATE_LIMIT_MAX) {
    return json({ ok: false, error: "rate_limited" }, 429, headers);
  }

  const token = body.turnstileToken;
  if (!token || typeof token !== "string") {
    return json({ ok: false, error: "missing_turnstile_token" }, 400, headers);
  }
  const verifyRes = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ secret: TURNSTILE_SECRET_KEY, response: token, remoteip: ip }),
  });
  const verifyData = await verifyRes.json();
  if (!verifyData.success) {
    console.error("turnstile_failed", JSON.stringify(verifyData));
    return json({ ok: false, error: "turnstile_failed" }, 400, headers);
  }

  const fullName = String(body.fullName ?? "").trim();
  const phone = String(body.phone ?? "").trim();
  const email = String(body.email ?? "").trim();
  const visitReason = String(body.visitReason ?? "");
  const checkIn = String(body.checkIn ?? "");
  const checkOut = String(body.checkOut ?? "");
  const guests = Number(body.guests);
  const comments = body.comments ? String(body.comments).trim().slice(0, 2000) : null;
  const consent = body.consent === true;

  const fieldErrors: string[] = [];
  if (fullName.length < 3 || fullName.length > 120) fieldErrors.push("fullName");
  if (phone.length < 7 || phone.length > 20) fieldErrors.push("phone");
  if (!isValidEmail(email)) fieldErrors.push("email");
  if (!(visitReason in REASON_LABELS)) fieldErrors.push("visitReason");
  if (!isValidDate(checkIn) || !isValidDate(checkOut) || checkOut <= checkIn) fieldErrors.push("dates");
  if (!Number.isInteger(guests) || guests < 1 || guests > 20) fieldErrors.push("guests");
  if (!consent) fieldErrors.push("consent");
  if (isValidDate(checkIn) && checkIn < todayInBogota()) fieldErrors.push("checkInPast");

  if (fieldErrors.length > 0) {
    return json({ ok: false, error: "validation_failed", fields: fieldErrors }, 400, headers);
  }

  const { data: inserted, error: insertError } = await supabase
    .from("booking_requests")
    .insert({
      full_name: fullName,
      phone,
      email,
      visit_reason: visitReason,
      check_in: checkIn,
      check_out: checkOut,
      guests,
      comments,
      consent_accepted: consent,
    })
    .select("id, created_at")
    .single();

  if (insertError || !inserted) {
    console.error("insert_failed", insertError);
    return json({ ok: false, error: "insert_failed" }, 500, headers);
  }

  const emailData = {
    fullName,
    phone,
    email,
    reasonLabel: REASON_LABELS[visitReason],
    checkInLabel: formatDateEs(checkIn),
    checkOutLabel: formatDateEs(checkOut),
    guests,
    comments,
    createdAtLabel: new Date(inserted.created_at).toLocaleString("es-CO", {
      timeZone: "America/Bogota",
      dateStyle: "long",
      timeStyle: "short",
    }),
  };

  // A notification failure shouldn't fail the request — the booking is
  // already saved. Send both emails independently so one failing (e.g. the
  // applicant's address isn't allowed yet under Resend's sandbox mode)
  // doesn't stop the other from going out.
  await Promise.all([
    sendEmail(NOTIFY_EMAILS, `Nueva solicitud de reserva — ${fullName}`, renderBookingEmail(emailData)),
    sendEmail([email], "Recibimos tu solicitud de reserva — Sierra Tayrona Wind", renderApplicantEmail(emailData)),
  ]);

  return json({ ok: true, id: inserted.id }, 200, headers);
});

async function sendEmail(to: string[], subject: string, html: string): Promise<void> {
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: RESEND_FROM_EMAIL, to, subject, html }),
    });
    if (!res.ok) {
      console.error("resend_failed", to.join(","), await res.text());
    }
  } catch (err) {
    console.error("resend_error", to.join(","), err);
  }
}

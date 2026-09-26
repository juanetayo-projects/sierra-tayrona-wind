/* Sierra Tayrona Wind — Consola de gestión de reservas (móvil primero). */
(function () {
  'use strict';

  var SUPABASE_URL = 'https://dwyyhrntkcqnowsyimjz.supabase.co';
  var SUPABASE_KEY = 'sb_publishable_B6yeo_9GwZDbQEmh9agyMA_FRX2amNB';
  var ADMIN_FN = SUPABASE_URL + '/functions/v1/admin-booking';
  // Usuarios sin "@" (p. ej. "adminwind") se traducen a este dominio técnico.
  var USER_DOMAIN = 'sierratayronawind.app';

  var sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

  var STATUS = {
    pending:    { label: 'Pendiente',       v: 'pending' },
    on_hold:    { label: 'Pre-reserva',     v: 'hold' },
    approved:   { label: 'Aprobada',        v: 'approved' },
    checked_in: { label: 'Hospedado',       v: 'checkin' },
    completed:  { label: 'Finalizada',      v: 'completed' },
    rejected:   { label: 'Rechazada',       v: 'rejected' },
    cancelled:  { label: 'Cancelada',       v: 'cancelled' },
    no_show:    { label: 'No se presentó',  v: 'noshow' }
  };
  var REASONS = {
    vacaciones: 'Vacaciones familiares', fin_de_semana: 'Fin de semana', pasadia: 'Pasadía',
    evento: 'Evento', reunion: 'Reunión empresarial', otro: 'Otro'
  };
  var OCCUPYING = ['approved', 'checked_in', 'completed'];
  var OPEN = ['pending', 'on_hold'];

  var state = {
    user: null,
    bookings: [],
    blocks: [],
    contacts: [],
    view: 'dashboard',
    filter: 'pending',
    search: '',
    period: '90',
    calMonth: null,
    selDay: null,
    openId: null,
    charts: {}
  };

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  /* ================= Utilidades ================= */
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function cssVar(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
  function parseD(iso) { var p = iso.split('-'); return new Date(+p[0], +p[1] - 1, +p[2], 12); }
  function toIso(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function addDays(iso, n) { var d = parseD(iso); d.setDate(d.getDate() + n); return toIso(d); }
  function todayIso() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date()); }
  function nights(b) { return Math.round((parseD(b.check_out) - parseD(b.check_in)) / 86400000); }
  function daysBetween(a, b) { return Math.round((parseD(b) - parseD(a)) / 86400000); }
  function fmtShort(iso) { return parseD(iso).toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, ''); }
  function fmtLong(iso) { return parseD(iso).toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); }
  function fmtTs(ts) { return new Date(ts).toLocaleString('es-CO', { timeZone: 'America/Bogota', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }); }
  function fmtCop(v) { if (v == null || v === '') return null; return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(v); }
  function fmtNum(v, d) { return new Intl.NumberFormat('es-CO', { maximumFractionDigits: d || 0 }).format(v); }
  function timeAgo(ts) {
    var s = (Date.now() - new Date(ts).getTime()) / 1000;
    if (s < 60) return 'ahora';
    if (s < 3600) return 'hace ' + Math.floor(s / 60) + ' min';
    if (s < 86400) return 'hace ' + Math.floor(s / 3600) + ' h';
    if (s < 86400 * 30) return 'hace ' + Math.floor(s / 86400) + ' d';
    return fmtTs(ts);
  }
  function fmtDuration(hours) {
    if (hours == null || !isFinite(hours)) return '—';
    if (hours < 1) return Math.max(1, Math.round(hours * 60)) + ' min';
    if (hours < 48) return fmtNum(hours, 1) + ' h';
    return fmtNum(hours / 24, 1) + ' d';
  }
  function median(arr) {
    if (!arr.length) return null;
    var a = arr.slice().sort(function (x, y) { return x - y; });
    var m = Math.floor(a.length / 2);
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
  }
  function avg(arr) { return arr.length ? arr.reduce(function (s, x) { return s + x; }, 0) / arr.length : null; }
  function digits(p) { return String(p || '').replace(/\D/g, ''); }
  var bogotaFmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Bogota', weekday: 'short', hour: 'numeric', hour12: false });
  var DOW_EN = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  function bogotaParts(ts) {
    var parts = bogotaFmt.formatToParts(new Date(ts));
    var wd = parts.find(function (p) { return p.type === 'weekday'; }).value;
    var h = +parts.find(function (p) { return p.type === 'hour'; }).value;
    return { dow: DOW_EN.indexOf(wd), hour: h === 24 ? 0 : h };
  }
  function pill(status) {
    var s = STATUS[status] || { label: status, v: 'cancelled' };
    return '<span class="pill" style="--c:var(--st-' + s.v + ');--bg:var(--st-' + s.v + '-bg)">' + s.label + '</span>';
  }
  function statusColor(status) { return 'var(--st-' + (STATUS[status] ? STATUS[status].v : 'cancelled') + ')'; }
  function overlaps(aIn, aOut, bIn, bOut) { return aIn < bOut && bIn < aOut; }

  function conflictsFor(b) {
    var occ = state.bookings.filter(function (o) {
      return o.id !== b.id && OCCUPYING.indexOf(o.status) >= 0 && overlaps(b.check_in, b.check_out, o.check_in, o.check_out);
    });
    var blk = state.blocks.filter(function (k) { return overlaps(b.check_in, b.check_out, k.start_date, k.end_date); });
    var competing = state.bookings.filter(function (o) {
      return o.id !== b.id && OPEN.indexOf(o.status) >= 0 && overlaps(b.check_in, b.check_out, o.check_in, o.check_out);
    });
    return { occ: occ, blk: blk, competing: competing };
  }

  /* ================= Modales / toast ================= */
  var modalWrap = $('#modalWrap');
  var modalEl = $('#modal');
  var modalResolve = null;
  function openModal(html, onMount) {
    modalEl.innerHTML = html;
    modalWrap.classList.add('open');
    if (onMount) onMount(modalEl);
  }
  function closeModal(val) {
    modalWrap.classList.remove('open');
    if (modalResolve) { var r = modalResolve; modalResolve = null; r(val); }
  }
  modalWrap.addEventListener('click', function (e) { if (e.target === modalWrap) closeModal(false); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && modalWrap.classList.contains('open')) closeModal(false); });

  var TONES = {
    ok: ['var(--st-approved-bg)', 'var(--st-approved)', '✓'],
    err: ['var(--st-rejected-bg)', 'var(--st-rejected)', '!'],
    warn: ['var(--st-pending-bg)', 'var(--st-pending)', '!'],
    info: ['var(--st-checkin-bg)', 'var(--st-checkin)', 'i']
  };
  function icon(tone) {
    var t = TONES[tone] || TONES.info;
    return '<div class="ico" style="background:' + t[0] + ';color:' + t[1] + '"><b>' + t[2] + '</b></div>';
  }
  function alertModal(o) {
    return new Promise(function (res) {
      modalResolve = res;
      openModal(icon(o.tone) + '<h3>' + esc(o.title) + '</h3>' + (o.html || '<p>' + esc(o.text || '') + '</p>') +
        '<div class="actions"><button class="btn navy" data-close>' + esc(o.btn || 'Entendido') + '</button></div>',
        function (m) { $('[data-close]', m).onclick = function () { closeModal(true); }; });
    });
  }
  function confirmModal(o) {
    return new Promise(function (res) {
      modalResolve = res;
      openModal(icon(o.tone || 'warn') + '<h3>' + esc(o.title) + '</h3><p>' + esc(o.text || '') + '</p>' +
        '<div class="actions"><button class="btn ghost" data-no>Cancelar</button><button class="btn ' + (o.danger ? 'danger' : 'navy') + '" data-yes>' + esc(o.ok || 'Confirmar') + '</button></div>',
        function (m) {
          $('[data-no]', m).onclick = function () { closeModal(false); };
          $('[data-yes]', m).onclick = function () { closeModal(true); };
        });
    });
  }
  var toastTimer;
  function toast(msg) {
    var t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 3200);
  }

  /* ================= Tema ================= */
  function applyTheme() {
    var t = null;
    try { t = localStorage.getItem('stw-theme'); } catch (e) { /* sin almacenamiento */ }
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
    else document.documentElement.removeAttribute('data-theme');
  }
  applyTheme();

  /* ================= Autenticación ================= */
  function toEmail(u) {
    u = u.trim().toLowerCase();
    return u.indexOf('@') >= 0 ? u : u + '@' + USER_DOMAIN;
  }

  $('#togglePass').onclick = function () {
    var i = $('#loginPass');
    i.type = i.type === 'password' ? 'text' : 'password';
  };

  $('#loginForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    var btn = $('#loginBtn');
    btn.disabled = true; btn.textContent = 'Ingresando…';
    try {
      var res = await sb.auth.signInWithPassword({ email: toEmail($('#loginUser').value), password: $('#loginPass').value });
      if (res.error) {
        await alertModal({ tone: 'err', title: 'No pudimos ingresar', text: 'Usuario o contraseña incorrectos. Verifica los datos e intenta de nuevo.' });
        return;
      }
      await enterApp(res.data.session);
    } finally {
      btn.disabled = false; btn.textContent = 'Ingresar';
    }
  });

  $('#forgotBtn').onclick = function () {
    openModal(icon('info') + '<h3>Recuperar contraseña</h3>' +
      '<p>Escribe el correo de tu cuenta de administrador y te enviaremos un enlace para crear una nueva contraseña. Para el usuario <b>adminwind</b>, la contraseña se restablece desde el panel de Supabase.</p>' +
      '<div class="fld"><label>Correo</label><input id="fpEmail" type="email" autocomplete="email" autocapitalize="none"></div>' +
      '<div class="actions"><button class="btn ghost" data-no>Cancelar</button><button class="btn navy" data-yes>Enviar enlace</button></div>',
      function (m) {
        $('[data-no]', m).onclick = function () { closeModal(false); };
        $('[data-yes]', m).onclick = async function () {
          var em = $('#fpEmail', m).value.trim();
          if (!em || em.indexOf('@') < 0) return;
          await sb.auth.resetPasswordForEmail(em, { redirectTo: location.origin + location.pathname });
          closeModal(true);
          alertModal({ tone: 'ok', title: 'Revisa tu correo', text: 'Si el correo corresponde a un administrador, recibirás un enlace para restablecer la contraseña.' });
        };
      });
  };

  sb.auth.onAuthStateChange(function (event) {
    if (event === 'PASSWORD_RECOVERY') setTimeout(changePassword, 300);
  });

  async function enterApp(session) {
    var admin = await sb.rpc('is_admin');
    if (admin.error || admin.data !== true) {
      await sb.auth.signOut();
      await alertModal({ tone: 'err', title: 'Sin acceso', text: 'Esta cuenta no tiene permisos de administrador de la consola.' });
      showLogin();
      return;
    }
    state.user = session.user;
    $('#login').classList.add('hidden');
    $('#app').classList.remove('hidden');
    setView(state.view);
    await loadAll();
    subscribeRealtime();
  }
  function showLogin() {
    $('#app').classList.add('hidden');
    $('#login').classList.remove('hidden');
    $('#loginPass').value = '';
  }
  async function logout() {
    var ok = await confirmModal({ title: 'Cerrar sesión', text: '¿Quieres salir de la consola?', ok: 'Cerrar sesión' });
    if (!ok) return;
    await sb.auth.signOut();
    state.user = null;
    showLogin();
  }

  /* ================= Datos ================= */
  var loading = false;
  async function loadAll() {
    if (loading) return;
    loading = true;
    $('#refreshBtn').classList.add('spin');
    try {
      var r = await Promise.all([
        sb.from('booking_requests').select('*').order('created_at', { ascending: false }),
        sb.from('blocked_dates').select('*').order('start_date'),
        sb.from('blocked_contacts').select('*').order('created_at', { ascending: false })
      ]);
      if (r[0].error) throw r[0].error;
      state.bookings = r[0].data || [];
      state.blocks = r[1].data || [];
      state.contacts = r[2].data || [];
      renderAll();
    } catch (err) {
      console.error(err);
      if (String(err && err.message).indexOf('JWT') >= 0) { showLogin(); return; }
      toast('No se pudieron cargar los datos. Revisa tu conexión.');
    } finally {
      loading = false;
      $('#refreshBtn').classList.remove('spin');
    }
  }
  $('#refreshBtn').onclick = loadAll;
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && state.user) loadAll();
  });

  var channel = null;
  function subscribeRealtime() {
    if (channel) return;
    channel = sb.channel('stw-bookings')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'booking_requests' }, function (p) {
        if (p.eventType === 'INSERT' && p.new) toast('Nueva solicitud de ' + p.new.full_name);
        loadAll();
      })
      .subscribe();
  }

  async function callAdmin(body) {
    var s = await sb.auth.getSession();
    var token = s.data.session && s.data.session.access_token;
    var res = await fetch(ADMIN_FN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token, apikey: SUPABASE_KEY },
      body: JSON.stringify(body)
    });
    var data = {};
    try { data = await res.json(); } catch (e) { /* respuesta vacía */ }
    return data;
  }
  var ERRORS = {
    dates_conflict: 'Estas fechas se cruzan con otra reserva ya aprobada. Rechaza o cancela la otra primero.',
    dates_blocked: 'Estas fechas están bloqueadas en el calendario. Libera el bloqueo antes de aprobar.',
    invalid_transition: 'Esta acción ya no aplica al estado actual de la solicitud. Actualiza la pantalla.',
    concurrent_change: 'Otro administrador modificó esta solicitud al mismo tiempo. Actualiza e intenta de nuevo.',
    unauthorized: 'Tu sesión expiró. Vuelve a ingresar.',
    forbidden: 'Tu cuenta no tiene permisos de administrador.',
    invalid_price: 'El valor ingresado no es válido.',
    nothing_to_resend: 'No hay una notificación para reenviar en este estado.'
  };

  /* ================= Navegación ================= */
  function setView(v) {
    state.view = v;
    $$('main > section').forEach(function (s) { s.classList.toggle('hidden', s.dataset.view !== v); });
    $$('.bottom-nav button').forEach(function (b) { b.classList.toggle('active', b.dataset.nav === v); });
    var subs = { dashboard: 'Panel de control', requests: 'Solicitudes', calendar: 'Calendario', more: 'Ajustes' };
    $('#topSub').textContent = subs[v];
    window.scrollTo(0, 0);
    renderView(v);
  }
  $$('.bottom-nav button').forEach(function (b) { b.onclick = function () { setView(b.dataset.nav); }; });

  function renderAll() {
    var pend = state.bookings.filter(function (b) { return b.status === 'pending'; }).length;
    var badge = $('#pendingBadge');
    badge.textContent = pend;
    badge.classList.toggle('hidden', pend === 0);
    renderView(state.view);
    if (state.openId) renderSheet();
  }
  function renderView(v) {
    if (v === 'dashboard') renderDashboard();
    else if (v === 'requests') renderRequests();
    else if (v === 'calendar') renderCalendar();
    else renderMore();
  }

  /* ================= Dashboard ================= */
  var KPI_INFO = {
    requests: 'Total de solicitudes recibidas en el periodo seleccionado, sin importar su estado.',
    approved: 'Solicitudes aprobadas (incluye hospedados y estancias finalizadas). La conversión es aprobadas ÷ solicitudes decididas.',
    rejected: 'Solicitudes rechazadas en el periodo. La tasa de cancelación compara cancelaciones y no-shows contra las reservas que llegaron a aprobarse.',
    occupancy: 'Noches reservadas en los próximos 30 días ÷ noches disponibles (se descuentan las fechas bloqueadas por el propietario). Es el indicador principal de la industria hotelera.',
    response: 'Tiempo mediano entre la llegada de la solicitud y la primera decisión (aprobar, pre-reservar o rechazar). Airbnb y Booking premian respuestas en menos de 24 h.',
    lead: 'Anticipación promedio: días entre la solicitud y la fecha de llegada. Ayuda a planear precios y promociones.',
    los: 'Estancia promedio (Length of Stay): número promedio de noches por solicitud.',
    revenue: 'Suma del valor registrado en las reservas aprobadas. ADR = ingreso ÷ noches vendidas (tarifa promedio por noche).'
  };

  function greetingText() {
    var h = bogotaParts(Date.now()).hour;
    return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
  }

  function periodBookings() {
    if (state.period === 'all') return state.bookings;
    var since = Date.now() - (+state.period) * 86400000;
    return state.bookings.filter(function (b) { return new Date(b.created_at).getTime() >= since; });
  }

  function renderDashboard() {
    var el = $('#view-dashboard');
    var today = todayIso();
    var all = state.bookings;
    var arrivals = all.filter(function (b) { return OCCUPYING.indexOf(b.status) >= 0 && b.check_in === today; });
    var departures = all.filter(function (b) { return OCCUPYING.indexOf(b.status) >= 0 && b.check_out === today; });
    var inHouse = all.filter(function (b) { return (b.status === 'checked_in') || (b.status === 'approved' && b.check_in <= today && today < b.check_out); });
    var pending = all.filter(function (b) { return b.status === 'pending'; });

    var P = periodBookings();
    var count = function (arr, sts) { return arr.filter(function (b) { return sts.indexOf(b.status) >= 0; }).length; };
    var nApproved = count(P, OCCUPYING);
    var nRejected = count(P, ['rejected']);
    var nCancelled = count(P, ['cancelled', 'no_show']);
    var decided = P.filter(function (b) { return b.reviewed_at; }).length;
    var conversion = decided ? nApproved / decided : null;
    var cancelRate = (nApproved + nCancelled) ? nCancelled / (nApproved + nCancelled) : null;

    // Ocupación próximos 30 días
    var horizonEnd = addDays(today, 30);
    var blockedNights = 0, bookedNights = 0;
    for (var i = 0; i < 30; i++) {
      var d = addDays(today, i);
      var isBlocked = state.blocks.some(function (k) { return k.start_date <= d && d < k.end_date; });
      if (isBlocked) { blockedNights++; continue; }
      if (all.some(function (b) { return OCCUPYING.indexOf(b.status) >= 0 && b.check_in <= d && d < b.check_out; })) bookedNights++;
    }
    var availNights = 30 - blockedNights;
    var occupancy = availNights ? bookedNights / availNights : 0;

    var responseHours = P.filter(function (b) { return b.reviewed_at; }).map(function (b) {
      return (new Date(b.reviewed_at) - new Date(b.created_at)) / 3600000;
    });
    var leadDays = P.map(function (b) {
      var created = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date(b.created_at));
      return daysBetween(created, b.check_in);
    });
    var losArr = P.map(nights);
    var sold = P.filter(function (b) { return OCCUPYING.indexOf(b.status) >= 0 && b.quoted_price != null; });
    var revenue = sold.reduce(function (s, b) { return s + Number(b.quoted_price); }, 0);
    var soldNights = sold.reduce(function (s, b) { return s + nights(b); }, 0);
    var adr = soldNights ? revenue / soldNights : null;

    var upcoming = all.filter(function (b) { return OCCUPYING.indexOf(b.status) >= 0 && b.check_in >= today; })
      .sort(function (a, b) { return a.check_in < b.check_in ? -1 : 1; }).slice(0, 5);

    function kpi(key, label, value, sub) {
      return '<div class="card kpi"><div class="l">' + label + '<button class="info" data-info="' + key + '" aria-label="Qué significa">?</button></div>' +
        '<div class="v">' + value + '</div><div class="s">' + sub + '</div></div>';
    }
    var periods = [['30', '30 días'], ['90', '90 días'], ['365', '12 meses'], ['all', 'Todo']];

    el.innerHTML =
      '<h1 class="view-title">' + greetingText() + '</h1>' +
      '<p class="view-sub">' + esc(fmtLong(today)) + '</p>' +
      '<div class="today">' +
        '<div class="card' + (pending.length ? ' alert' : '') + '" data-go="pending"><div class="n">' + pending.length + '</div><div class="l">Por responder</div></div>' +
        '<div class="card"><div class="n">' + arrivals.length + '</div><div class="l">Llegadas hoy</div></div>' +
        '<div class="card"><div class="n">' + departures.length + '</div><div class="l">Salidas hoy</div></div>' +
        '<div class="card"><div class="n">' + inHouse.length + '</div><div class="l">Hospedados</div></div>' +
      '</div>' +
      '<div class="section-title">Indicadores</div>' +
      '<div class="chips" id="periodChips">' + periods.map(function (p) {
        return '<button class="chip' + (state.period === p[0] ? ' active' : '') + '" data-period="' + p[0] + '">' + p[1] + '</button>';
      }).join('') + '</div>' +
      '<div class="kpis" style="margin-top:10px">' +
        kpi('requests', 'Solicitudes', fmtNum(P.length), count(P, OPEN) + ' en revisión') +
        kpi('approved', 'Aprobadas', fmtNum(nApproved), 'Conversión ' + (conversion == null ? '—' : fmtNum(conversion * 100) + '%')) +
        kpi('rejected', 'Rechazadas', fmtNum(nRejected), 'Cancelación ' + (cancelRate == null ? '—' : fmtNum(cancelRate * 100) + '%')) +
        kpi('occupancy', 'Ocupación 30 d', fmtNum(occupancy * 100) + '%', bookedNights + ' de ' + availNights + ' noches') +
        kpi('response', 'Tiempo de respuesta', fmtDuration(median(responseHours)), 'Mediana · ' + responseHours.length + ' decididas') +
        kpi('lead', 'Anticipación', leadDays.length ? fmtNum(avg(leadDays)) + ' d' : '—', 'Promedio antes de llegar') +
        kpi('los', 'Estancia promedio', losArr.length ? fmtNum(avg(losArr), 1) + ' n' : '—', 'Noches por solicitud') +
        kpi('revenue', 'Ingresos confirmados', revenue ? fmtCop(revenue) : '—', 'ADR ' + (adr ? fmtCop(adr) : '—') + ' / noche') +
      '</div>' +

      '<div class="section-title">Tendencia</div>' +
      '<div class="card chart-card"><h3>Solicitudes recibidas</h3><p class="hint">Por ' + (state.period === '30' || state.period === '90' ? 'semana' : 'mes') + ', según el resultado</p><div class="chart-box"><canvas id="chTrend"></canvas></div></div>' +

      '<div class="section-title">Comportamiento de los solicitantes</div>' +
      '<div class="card chart-card"><h3>¿Cuándo escriben?</h3><p class="hint">Día y hora (Bogotá) en que llegan las solicitudes. Toca una celda para ver el total.</p><div id="heatmap"></div></div>' +
      '<div class="grid-2" style="margin-top:12px">' +
        '<div class="card chart-card"><h3>Meses de mayor interés</h3><p class="hint">Noches solicitadas según el mes de la estancia</p><div class="chart-box" style="height:200px"><canvas id="chMonths"></canvas></div></div>' +
        '<div class="card chart-card"><h3>Día de llegada preferido</h3><p class="hint">Check-in solicitado por día de la semana</p><div class="chart-box" style="height:200px"><canvas id="chDow"></canvas></div></div>' +
      '</div>' +
      '<div class="card chart-card" style="margin-top:12px"><h3>Calendario de demanda</h3><p class="hint">Cuántas solicitudes quieren cada noche (próximos 6 meses)</p><div id="demandCal"></div></div>' +

      '<div class="grid-2" style="margin-top:12px">' +
        '<div class="card chart-card"><h3>Embudo de estados</h3><p class="hint">Distribución de las solicitudes del periodo</p><div class="hbars" id="hbStatus"></div></div>' +
        '<div class="card chart-card"><h3>Motivo de la visita</h3><p class="hint">Qué buscan los huéspedes</p><div class="hbars" id="hbReason"></div></div>' +
        '<div class="card chart-card"><h3>Tamaño del grupo</h3><p class="hint">Huéspedes por solicitud</p><div class="hbars" id="hbGuests"></div></div>' +
        '<div class="card chart-card"><h3>Anticipación de la reserva</h3><p class="hint">Días entre la solicitud y la llegada</p><div class="hbars" id="hbLead"></div></div>' +
      '</div>' +

      '<div class="section-title">Próximas llegadas</div>' +
      '<div class="card">' + (upcoming.length ? upcoming.map(function (b) {
        return '<div class="row-item" data-open="' + b.id + '" style="cursor:pointer"><div class="grow"><div class="t">' + esc(b.full_name) + '</div><div class="s">' +
          esc(fmtShort(b.check_in)) + ' → ' + esc(fmtShort(b.check_out)) + ' · ' + nights(b) + ' noches · ' + b.guests + ' huésp.</div></div>' + pill(b.status) + '</div>';
      }).join('') : '<div class="empty" style="padding:18px">No hay llegadas confirmadas próximamente.</div>') + '</div>';

    $$('[data-period]', el).forEach(function (c) { c.onclick = function () { state.period = c.dataset.period; renderDashboard(); }; });
    $$('[data-info]', el).forEach(function (b) {
      b.onclick = function () { alertModal({ tone: 'info', title: b.parentNode.firstChild.textContent, text: KPI_INFO[b.dataset.info] }); };
    });
    $$('[data-open]', el).forEach(function (r) { r.onclick = function () { openBooking(r.dataset.open); }; });
    var go = $('[data-go]', el);
    if (go) go.onclick = function () { state.filter = 'pending'; setView('requests'); };

    drawTrend(P);
    drawHeatmap(P);
    drawMonths(P);
    drawDow(P);
    drawDemand();
    drawHbars('#hbStatus', Object.keys(STATUS).map(function (k) {
      return [STATUS[k].label, P.filter(function (b) { return b.status === k; }).length, statusColor(k)];
    }).filter(function (x) { return x[1] > 0; }));
    drawHbars('#hbReason', Object.keys(REASONS).map(function (k) {
      return [REASONS[k], P.filter(function (b) { return b.visit_reason === k; }).length];
    }).sort(function (a, b) { return b[1] - a[1]; }));
    var gb = [['1–2 personas', 1, 2], ['3–4 personas', 3, 4], ['5–6 personas', 5, 6], ['7 o más', 7, 99]];
    drawHbars('#hbGuests', gb.map(function (g) {
      return [g[0], P.filter(function (b) { return b.guests >= g[1] && b.guests <= g[2]; }).length];
    }));
    var lb = [['Menos de 7 días', -999, 6], ['1 a 4 semanas', 7, 30], ['1 a 3 meses', 31, 90], ['Más de 3 meses', 91, 99999]];
    drawHbars('#hbLead', lb.map(function (g) {
      return [g[0], leadDays.filter(function (x) { return x >= g[1] && x <= g[2]; }).length];
    }));
  }

  function chartBase() {
    return {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { backgroundColor: '#0E2A4A', padding: 10, cornerRadius: 8, titleFont: { family: 'Work Sans' }, bodyFont: { family: 'Work Sans' } }
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: cssVar('--faint'), font: { family: 'Work Sans', size: 10 } }, border: { color: cssVar('--line') } },
        y: { beginAtZero: true, grid: { color: cssVar('--line') }, ticks: { precision: 0, color: cssVar('--faint'), font: { family: 'Work Sans', size: 10 } }, border: { display: false } }
      }
    };
  }
  function makeChart(id, cfg) {
    if (state.charts[id]) state.charts[id].destroy();
    var cv = document.getElementById(id);
    if (!cv || !window.Chart) return;
    state.charts[id] = new Chart(cv, cfg);
  }

  function drawTrend(P) {
    var weekly = state.period === '30' || state.period === '90';
    var buckets = [], idx = {};
    var now = new Date();
    var start;
    if (state.period === 'all') {
      start = P.length ? new Date(P[P.length - 1].created_at) : now;
    } else {
      start = new Date(Date.now() - (+state.period) * 86400000);
    }
    var cur = new Date(start.getFullYear(), start.getMonth(), weekly ? start.getDate() : 1, 12);
    if (weekly) { var dw = (cur.getDay() + 6) % 7; cur.setDate(cur.getDate() - dw); }
    while (cur <= now) {
      var key = toIso(cur);
      idx[key] = buckets.length;
      buckets.push({ key: key, label: weekly ? cur.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' }).replace('.', '') : cur.toLocaleDateString('es-CO', { month: 'short', year: '2-digit' }).replace('.', ''), a: 0, o: 0, r: 0 });
      if (weekly) cur.setDate(cur.getDate() + 7); else cur.setMonth(cur.getMonth() + 1);
    }
    P.forEach(function (b) {
      var c = new Date(b.created_at);
      var k = new Date(c.getFullYear(), c.getMonth(), weekly ? c.getDate() : 1, 12);
      if (weekly) { var dw2 = (k.getDay() + 6) % 7; k.setDate(k.getDate() - dw2); }
      var bi = idx[toIso(k)];
      if (bi == null) return;
      if (OCCUPYING.indexOf(b.status) >= 0) buckets[bi].a++;
      else if (OPEN.indexOf(b.status) >= 0) buckets[bi].o++;
      else buckets[bi].r++;
    });
    var cfg = chartBase();
    cfg.scales.x.stacked = true; cfg.scales.y.stacked = true;
    cfg.plugins.legend = { display: true, position: 'bottom', labels: { boxWidth: 10, boxHeight: 10, usePointStyle: true, color: cssVar('--muted'), font: { family: 'Work Sans', size: 11 } } };
    makeChart('chTrend', {
      type: 'bar',
      data: {
        labels: buckets.map(function (b) { return b.label; }),
        datasets: [
          { label: 'Aprobadas', data: buckets.map(function (b) { return b.a; }), backgroundColor: cssVar('--st-approved'), borderRadius: 4, maxBarThickness: 26 },
          { label: 'En revisión', data: buckets.map(function (b) { return b.o; }), backgroundColor: cssVar('--gold'), borderRadius: 4, maxBarThickness: 26 },
          { label: 'No concretadas', data: buckets.map(function (b) { return b.r; }), backgroundColor: cssVar('--coral'), borderRadius: 4, maxBarThickness: 26 }
        ]
      },
      options: cfg
    });
  }

  function drawHeatmap(P) {
    var DOW = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
    var SLOTS = ['0h', '3h', '6h', '9h', '12h', '15h', '18h', '21h'];
    var m = [];
    for (var i = 0; i < 7; i++) m.push([0, 0, 0, 0, 0, 0, 0, 0]);
    P.forEach(function (b) { var p = bogotaParts(b.created_at); if (p.dow >= 0) m[p.dow][Math.floor(p.hour / 3)]++; });
    var max = Math.max.apply(null, m.map(function (r) { return Math.max.apply(null, r); })) || 1;
    var html = '<div class="heat"><div></div>' + SLOTS.map(function (s) { return '<div class="hh">' + s + '</div>'; }).join('');
    m.forEach(function (row, di) {
      html += '<div class="hl">' + DOW[di] + '</div>';
      row.forEach(function (v, si) {
        var a = v ? 0.15 + 0.85 * (v / max) : 0;
        var tip = DOW[di] + ' ' + (si * 3) + '–' + (si * 3 + 3) + 'h: ' + v + ' solicitud' + (v === 1 ? '' : 'es');
        html += '<div class="cell" data-v="' + v + '" data-t="' + tip + '" style="' + (v ? 'background:rgba(47,102,144,' + a.toFixed(2) + ')' : '') + '"></div>';
      });
    });
    html += '</div><div class="legend">Menos <span class="sw" style="background:rgba(47,102,144,.15)"></span><span class="sw" style="background:rgba(47,102,144,.5)"></span><span class="sw" style="background:rgba(47,102,144,1)"></span> Más</div>';
    var box = $('#heatmap');
    box.innerHTML = html;
    $$('.cell', box).forEach(function (c) {
      c.onclick = function () { $$('.cell.sel', box).forEach(function (x) { if (x !== c) x.classList.remove('sel'); }); c.classList.toggle('sel'); };
    });
  }

  function drawMonths(P) {
    var counts = new Array(12).fill(0);
    P.forEach(function (b) {
      for (var d = b.check_in; d < b.check_out; d = addDays(d, 1)) counts[parseD(d).getMonth()]++;
    });
    var labels = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    var max = Math.max.apply(null, counts);
    makeChart('chMonths', {
      type: 'bar',
      data: { labels: labels, datasets: [{ label: 'Noches solicitadas', data: counts, borderRadius: 4, maxBarThickness: 22,
        backgroundColor: counts.map(function (c) { return c === max && c > 0 ? cssVar('--gold') : cssVar('--teal'); }) }] },
      options: chartBase()
    });
  }

  function drawDow(P) {
    var labels = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
    var counts = new Array(7).fill(0);
    P.forEach(function (b) { counts[(parseD(b.check_in).getDay() + 6) % 7]++; });
    var max = Math.max.apply(null, counts);
    makeChart('chDow', {
      type: 'bar',
      data: { labels: labels, datasets: [{ label: 'Llegadas solicitadas', data: counts, borderRadius: 4, maxBarThickness: 22,
        backgroundColor: counts.map(function (c) { return c === max && c > 0 ? cssVar('--gold') : cssVar('--teal'); }) }] },
      options: chartBase()
    });
  }

  function drawDemand() {
    var today = todayIso();
    var t = parseD(today);
    var demand = {}, booked = {}, blocked = {};
    state.bookings.forEach(function (b) {
      if (['rejected', 'cancelled', 'no_show'].indexOf(b.status) >= 0) return;
      for (var d = b.check_in; d < b.check_out; d = addDays(d, 1)) {
        demand[d] = (demand[d] || 0) + 1;
        if (OCCUPYING.indexOf(b.status) >= 0) booked[d] = true;
      }
    });
    state.blocks.forEach(function (k) { for (var d = k.start_date; d < k.end_date; d = addDays(d, 1)) blocked[d] = true; });
    var max = Math.max.apply(null, Object.keys(demand).map(function (k) { return demand[k]; }).concat([1]));
    var html = '<div class="demand-months">';
    for (var mi = 0; mi < 6; mi++) {
      var first = new Date(t.getFullYear(), t.getMonth() + mi, 1, 12);
      var dim = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
      var off = (first.getDay() + 6) % 7;
      html += '<div class="dm"><h4>' + first.toLocaleDateString('es-CO', { month: 'long', year: 'numeric' }) + '</h4><div class="g">';
      for (var e = 0; e < off; e++) html += '<div></div>';
      for (var dd = 1; dd <= dim; dd++) {
        var iso = toIso(new Date(first.getFullYear(), first.getMonth(), dd, 12));
        var v = demand[iso] || 0;
        var style = '';
        if (blocked[iso]) style = 'background:var(--st-blocked-bg);color:var(--st-blocked)';
        else if (booked[iso]) style = 'background:var(--navy);color:#fff';
        else if (v) style = 'background:rgba(201,162,39,' + (0.25 + 0.75 * v / max).toFixed(2) + ');color:var(--ink)';
        if (iso < today) style += ';opacity:.35';
        html += '<div class="d" style="' + style + '" title="' + v + ' solicitudes">' + dd + '</div>';
      }
      html += '</div></div>';
    }
    html += '</div><div class="legend"><span class="sw" style="background:rgba(201,162,39,.35)"></span>Poca demanda <span class="sw" style="background:rgba(201,162,39,1)"></span>Alta demanda <span class="sw" style="background:var(--navy)"></span>Reservado <span class="sw" style="background:var(--st-blocked-bg);border:1px solid var(--line)"></span>Bloqueado</div>';
    $('#demandCal').innerHTML = html;
  }

  function drawHbars(sel, rows) {
    var el = $(sel);
    if (!el) return;
    var total = rows.reduce(function (s, r) { return s + r[1]; }, 0);
    if (!total) { el.innerHTML = '<div class="empty" style="padding:10px">Sin datos en este periodo.</div>'; return; }
    var max = Math.max.apply(null, rows.map(function (r) { return r[1]; }));
    el.innerHTML = rows.map(function (r) {
      return '<div class="hbar"><div class="top"><span>' + esc(r[0]) + '</span><b>' + r[1] + ' <span style="color:var(--faint);font-weight:500">· ' + fmtNum(r[1] / total * 100) + '%</span></b></div>' +
        '<div class="track"><div class="fill" style="width:' + (r[1] / max * 100) + '%;' + (r[2] ? 'background:' + r[2] : '') + '"></div></div></div>';
    }).join('');
  }

  /* ================= Solicitudes ================= */
  var FILTERS = [
    ['pending', 'Pendientes', ['pending']],
    ['on_hold', 'Pre-reservas', ['on_hold']],
    ['approved', 'Aprobadas', ['approved']],
    ['checked_in', 'Hospedados', ['checked_in']],
    ['completed', 'Finalizadas', ['completed']],
    ['rejected', 'Rechazadas', ['rejected']],
    ['cancelled', 'Canceladas', ['cancelled', 'no_show']],
    ['all', 'Todas', null]
  ];

  function renderRequests() {
    var el = $('#view-requests');
    var f = FILTERS.find(function (x) { return x[0] === state.filter; }) || FILTERS[0];
    var q = state.search.trim().toLowerCase();
    var list = state.bookings.filter(function (b) {
      if (f[2] && f[2].indexOf(b.status) < 0) return false;
      if (!q) return true;
      return [b.full_name, b.email, b.phone, b.confirmation_code].join(' ').toLowerCase().indexOf(q) >= 0;
    });
    if (['approved', 'checked_in', 'on_hold'].indexOf(state.filter) >= 0) {
      list.sort(function (a, b) { return a.check_in < b.check_in ? -1 : 1; });
    }
    var searchFocused = document.activeElement && document.activeElement.id === 'searchInput';
    el.innerHTML =
      '<h1 class="view-title">Solicitudes</h1><p class="view-sub">' + state.bookings.length + ' en total</p>' +
      '<div class="search"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>' +
      '<input id="searchInput" type="search" placeholder="Buscar por nombre, correo, teléfono o código" value="' + esc(state.search) + '"></div>' +
      '<div class="chips">' + FILTERS.map(function (x) {
        var n = x[2] ? state.bookings.filter(function (b) { return x[2].indexOf(b.status) >= 0; }).length : state.bookings.length;
        return '<button class="chip' + (x[0] === state.filter ? ' active' : '') + '" data-filter="' + x[0] + '">' + x[1] + ' <span class="c">' + n + '</span></button>';
      }).join('') + '</div>' +
      '<div class="list">' + (list.length ? list.map(cardHtml).join('') :
        '<div class="empty"><div class="ico">🌴</div>No hay solicitudes en esta vista.</div>') + '</div>';

    var si = $('#searchInput', el);
    si.oninput = function () { state.search = si.value; renderRequests(); };
    if (searchFocused) { si.focus(); si.setSelectionRange(si.value.length, si.value.length); }
    $$('[data-filter]', el).forEach(function (c) { c.onclick = function () { state.filter = c.dataset.filter; renderRequests(); }; });
    $$('[data-open]', el).forEach(function (c) { c.onclick = function () { openBooking(c.dataset.open); }; });
    var active = $('.chip.active', el);
    if (active) active.scrollIntoView({ inline: 'center', block: 'nearest' });
  }

  function cardHtml(b) {
    var warn = '';
    if (OPEN.indexOf(b.status) >= 0) {
      var c = conflictsFor(b);
      if (c.occ.length) warn = '<div class="warn">⚠ Se cruza con una reserva aprobada</div>';
      else if (c.blk.length) warn = '<div class="warn">⚠ Fechas bloqueadas en el calendario</div>';
      else if (c.competing.length) warn = '<div class="warn" style="color:var(--st-pending)">● Compite con ' + c.competing.length + ' solicitud' + (c.competing.length > 1 ? 'es' : '') + ' por estas fechas</div>';
    }
    return '<button class="bk" data-open="' + b.id + '" style="--c:' + statusColor(b.status) + '">' +
      '<div class="r1"><div class="name">' + esc(b.full_name) + '</div>' + pill(b.status) + '</div>' +
      '<div class="r2"><span>📅 ' + esc(fmtShort(b.check_in)) + ' → ' + esc(fmtShort(b.check_out)) + '</span><span>🌙 ' + nights(b) + '</span><span>👥 ' + b.guests + '</span></div>' +
      '<div class="r2"><span>' + esc(REASONS[b.visit_reason] || b.visit_reason) + '</span>' + (b.confirmation_code ? '<span>🔑 ' + esc(b.confirmation_code) + '</span>' : '') + '<span style="margin-left:auto">' + timeAgo(b.created_at) + '</span></div>' +
      warn + '</button>';
  }

  /* ================= Detalle ================= */
  var sheet = $('#sheet');
  var actionBar = $('#actionBar');
  var events = [];

  async function openBooking(id) {
    state.openId = id;
    events = [];
    renderSheet();
    sheet.classList.add('open');
    sheet.setAttribute('aria-hidden', 'false');
    actionBar.classList.add('open');
    document.body.style.overflow = 'hidden';
    history.pushState({ sheet: id }, '');
    await loadEvents();
  }
  async function loadEvents() {
    if (!state.openId) return;
    var r = await sb.from('booking_events').select('*').eq('booking_id', state.openId).order('created_at', { ascending: true });
    events = r.data || [];
    renderSheet();
  }
  function closeSheet(fromPop) {
    state.openId = null;
    sheet.classList.remove('open');
    sheet.setAttribute('aria-hidden', 'true');
    actionBar.classList.remove('open');
    document.body.style.overflow = '';
    if (!fromPop && history.state && history.state.sheet) history.back();
  }
  window.addEventListener('popstate', function () { if (state.openId) closeSheet(true); });

  var ACTION_LABELS = {
    approve: 'Aprobada', hold: 'Pre-reserva', reject: 'Rechazada', cancel: 'Cancelada', check_in: 'Check-in',
    complete: 'Estancia finalizada', no_show: 'No se presentó', reopen: 'Reabierta', note: 'Nota / valor',
    block_contact: 'Contacto bloqueado', resend: 'Notificación reenviada'
  };

  function renderSheet() {
    var b = state.bookings.find(function (x) { return x.id === state.openId; });
    if (!b) { sheet.innerHTML = ''; return; }
    var c = conflictsFor(b);
    var wa = 'https://wa.me/' + digits(b.phone);
    var conflictHtml = '';
    if (OPEN.indexOf(b.status) >= 0) {
      if (c.occ.length) conflictHtml += '<div class="conflict">⚠ <div>Se cruza con la reserva aprobada de <b>' + esc(c.occ[0].full_name) + '</b> (' + esc(fmtShort(c.occ[0].check_in)) + ' → ' + esc(fmtShort(c.occ[0].check_out)) + '). No se puede aprobar mientras exista.</div></div>';
      if (c.blk.length) conflictHtml += '<div class="conflict">⛔ <div>Las fechas incluyen un bloqueo del calendario' + (c.blk[0].reason ? ' (' + esc(c.blk[0].reason) + ')' : '') + '.</div></div>';
      if (c.competing.length) conflictHtml += '<div class="conflict" style="background:var(--st-pending-bg);color:var(--st-pending)">● <div>Otras ' + c.competing.length + ' solicitud(es) piden fechas que se cruzan: ' + c.competing.map(function (o) { return esc(o.full_name); }).join(', ') + '.</div></div>';
    }
    var tl = '<div class="tl" style="--c:var(--st-pending)"><div class="t">Solicitud recibida</div><div class="m">' + esc(fmtTs(b.created_at)) + ' · formulario web</div></div>';
    tl += events.map(function (e) {
      return '<div class="tl" style="--c:' + statusColor(e.to_status) + '"><div class="t">' + esc(ACTION_LABELS[e.action] || e.action) +
        (e.notified_email ? ' · <span style="color:var(--st-approved);font-weight:500">correo enviado ✓</span>' : '') + '</div>' +
        '<div class="m">' + esc(fmtTs(e.created_at)) + ' · ' + esc(e.actor_email || '') + '</div>' +
        (e.note ? '<div class="n">' + esc(e.note) + '</div>' : '') + '</div>';
    }).join('');

    var more = secondaryActions(b.status).map(function (a) {
      return '<button class="btn ghost block" style="margin-bottom:8px;justify-content:flex-start" data-act="' + a[0] + '">' + a[1] + '</button>';
    }).join('');

    sheet.innerHTML =
      '<div class="sheet-head"><div class="row"><button class="icon-btn" data-close aria-label="Volver"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><polyline points="15 18 9 12 15 6"/></svg></button>' +
      '<div style="flex:1"></div>' + pill(b.status) + '</div>' +
      '<h2>' + esc(b.full_name) + '</h2><div class="meta">Recibida ' + esc(timeAgo(b.created_at)) + (b.confirmation_code ? ' · Código <b style="color:var(--gold)">' + esc(b.confirmation_code) + '</b>' : '') + '</div></div>' +
      '<div class="sheet-body">' +
        '<div class="contact-row">' +
          '<a href="' + wa + '" target="_blank" rel="noopener"><span class="i" style="background:#E3F4EC;color:#1F8F5F"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M17.5 14.4c-.3-.1-1.8-.9-2-1-.3-.1-.5-.1-.7.1-.2.3-.8 1-.9 1.2-.2.2-.3.2-.6.1-.3-.1-1.3-.5-2.4-1.5-.9-.8-1.5-1.8-1.7-2.1-.2-.3 0-.5.1-.6l.4-.5c.2-.2.2-.3.3-.5.1-.2 0-.4 0-.5l-.9-2.2c-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.5s1.1 2.9 1.2 3.1c.1.2 2.1 3.2 5.1 4.5.7.3 1.3.5 1.7.6.7.2 1.4.2 1.9.1.6-.1 1.8-.7 2-1.4.2-.7.2-1.3.2-1.4-.1-.2-.3-.3-.6-.4zM12 21.8c-1.8 0-3.5-.5-5-1.4l-.4-.2-3.7 1 1-3.6-.2-.4c-1-1.6-1.5-3.4-1.5-5.2 0-5.4 4.4-9.8 9.8-9.8 2.6 0 5.1 1 6.9 2.9 1.8 1.8 2.9 4.3 2.9 6.9 0 5.4-4.4 9.8-9.8 9.8z"/></svg></span>WhatsApp</a>' +
          '<a href="tel:' + esc(b.phone.replace(/\s/g, '')) + '"><span class="i" style="background:var(--st-checkin-bg);color:var(--st-checkin)"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/></svg></span>Llamar</a>' +
          '<a href="mailto:' + esc(b.email) + '"><span class="i" style="background:var(--st-pending-bg);color:var(--st-pending)"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/><polyline points="22 6 12 13 2 6"/></svg></span>Correo</a>' +
        '</div>' +
        conflictHtml +
        '<div class="card"><div class="dl">' +
          '<div><div class="k">Llegada</div><div class="v">' + esc(fmtShort(b.check_in)) + '</div></div>' +
          '<div><div class="k">Salida</div><div class="v">' + esc(fmtShort(b.check_out)) + '</div></div>' +
          '<div><div class="k">Noches</div><div class="v">' + nights(b) + '</div></div>' +
          '<div><div class="k">Huéspedes</div><div class="v">' + b.guests + '</div></div>' +
          '<div><div class="k">Motivo</div><div class="v">' + esc(REASONS[b.visit_reason] || b.visit_reason) + '</div></div>' +
          '<div><div class="k">Anticipación</div><div class="v">' + daysBetween(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date(b.created_at)), b.check_in) + ' días</div></div>' +
          '<div class="full"><div class="k">Teléfono</div><div class="v">' + esc(b.phone) + '</div></div>' +
          '<div class="full"><div class="k">Correo</div><div class="v">' + esc(b.email) + '</div></div>' +
          '<div class="full"><div class="k">Comentarios del huésped</div><div class="v">' + (b.comments ? '<div class="note-box">' + esc(b.comments) + '</div>' : '<span style="color:var(--faint)">Sin comentarios</span>') + '</div></div>' +
        '</div></div>' +

        '<div class="section-title">Valor y notas internas</div>' +
        '<div class="card"><div class="dl">' +
          '<div><div class="k">Valor total</div><div class="v">' + (b.quoted_price != null ? esc(fmtCop(b.quoted_price)) : '<span style="color:var(--faint)">Sin definir</span>') + '</div></div>' +
          '<div><div class="k">Por noche</div><div class="v">' + (b.quoted_price != null ? esc(fmtCop(b.quoted_price / nights(b))) : '—') + '</div></div>' +
          '<div class="full"><div class="k">Notas internas (solo administradores)</div><div class="v">' + (b.internal_notes ? '<div class="note-box">' + esc(b.internal_notes) + '</div>' : '<span style="color:var(--faint)">Sin notas</span>') + '</div></div>' +
          (b.decision_reason ? '<div class="full"><div class="k">Mensaje enviado al huésped</div><div class="v"><div class="note-box">' + esc(b.decision_reason) + '</div></div></div>' : '') +
        '</div><button class="btn ghost block" style="margin-top:12px" data-edit>✎ Editar valor y notas</button></div>' +

        (more ? '<div class="section-title">Más acciones</div>' + more : '') +

        '<div class="section-title">Seguimiento</div><div class="card"><div class="timeline">' + tl + '</div></div>' +
      '</div>';

    $('[data-close]', sheet).onclick = function () { closeSheet(false); };
    $('[data-edit]', sheet).onclick = function () { editNotes(b); };
    $$('[data-act]', sheet).forEach(function (btn) { btn.onclick = function () { runAction(b, btn.dataset.act); }; });

    var primary = primaryActions(b.status);
    $('#actionBarInner').innerHTML = primary.length ? primary.map(function (a) {
      return '<button class="btn ' + a[2] + '" data-act="' + a[0] + '">' + a[1] + '</button>';
    }).join('') : '<button class="btn ghost" style="flex:1" data-close2>Volver</button>';
    $$('#actionBarInner [data-act]').forEach(function (btn) { btn.onclick = function () { runAction(b, btn.dataset.act); }; });
    var c2 = $('#actionBarInner [data-close2]');
    if (c2) c2.onclick = function () { closeSheet(false); };
  }

  function primaryActions(st) {
    switch (st) {
      case 'pending': return [['reject', 'Rechazar', 'danger'], ['approve', '✓ Aprobar', 'primary']];
      case 'on_hold': return [['reject', 'Rechazar', 'danger'], ['approve', '✓ Confirmar', 'primary']];
      case 'approved': return [['cancel', 'Cancelar', 'danger'], ['check_in', 'Registrar llegada', 'primary']];
      case 'checked_in': return [['complete', 'Registrar salida', 'primary']];
      case 'rejected': case 'cancelled': case 'no_show': return [['reopen', 'Reabrir solicitud', 'navy']];
      default: return [];
    }
  }
  function secondaryActions(st) {
    var a = [];
    if (st === 'pending') a.push(['hold', '⏳ Pre-reservar (apartar fechas temporalmente)']);
    if (st === 'on_hold') a.push(['cancel', '✕ Cancelar pre-reserva']);
    if (st === 'approved') { a.push(['complete', '✓ Marcar estancia como finalizada']); a.push(['no_show', '⊘ Marcar como no se presentó']); }
    if (['approved', 'rejected', 'cancelled', 'on_hold'].indexOf(st) >= 0) a.push(['resend', '↻ Reenviar notificación (correo + WhatsApp)']);
    a.push(['block_contact', '⛔ Bloquear a este solicitante']);
    return a;
  }

  var ACTIONS = {
    approve: { title: 'Aprobar reserva', text: 'Se confirmará la reserva, se generará un código y se notificará al huésped.', ok: 'Aprobar y notificar', price: true, msg: 'Mensaje para el huésped (opcional)', msgPh: 'Ej.: Hora de llegada desde las 3:00 p. m. Te enviaremos la ubicación exacta.', notify: true, tone: 'ok' },
    hold: { title: 'Pre-reservar', text: 'Las fechas quedan apartadas mientras confirmas detalles (pago, número de huéspedes, etc.).', ok: 'Pre-reservar', price: true, msg: 'Mensaje para el huésped (opcional)', msgPh: 'Ej.: Para confirmar, por favor envíanos el anticipo.', notify: true, tone: 'info' },
    reject: { title: 'Rechazar solicitud', text: 'Se enviará al solicitante un correo agradeciendo su interés en Sierra Tayrona Wind.', ok: 'Rechazar y notificar', msg: 'Mensaje para el solicitante (opcional)', msgPh: 'Ej.: Esas fechas ya no están disponibles, pero la semana siguiente sí.', notify: true, danger: true, tone: 'err' },
    cancel: { title: 'Cancelar reserva', text: 'La reserva se cancela y las fechas quedan libres nuevamente.', ok: 'Cancelar reserva', msg: 'Motivo / mensaje al huésped (opcional)', msgPh: '', notify: true, danger: true, tone: 'err' },
    check_in: { title: 'Registrar llegada', text: 'Confirma que el huésped ya llegó al apartamento.', ok: 'Registrar llegada', tone: 'ok' },
    complete: { title: 'Registrar salida', text: 'La estancia se marcará como finalizada.', ok: 'Finalizar estancia', tone: 'ok' },
    no_show: { title: 'No se presentó', text: 'La reserva se marcará como "no show" y las fechas quedarán libres.', ok: 'Confirmar', msg: 'Nota (opcional)', msgPh: '', danger: true, tone: 'warn' },
    reopen: { title: 'Reabrir solicitud', text: 'La solicitud vuelve a estado pendiente para una nueva decisión.', ok: 'Reabrir', tone: 'info' },
    block_contact: { title: 'Bloquear solicitante', text: 'Su correo y teléfono quedarán en la lista de bloqueados: sus próximas solicitudes se descartarán en silencio. Si la solicitud está abierta, se rechaza sin enviar correo.', ok: 'Bloquear', msg: 'Motivo (interno)', msgPh: 'Ej.: Spam / solicitudes repetidas', danger: true, tone: 'err' },
    resend: { title: 'Reenviar notificación', text: 'Se reenviará el correo correspondiente al estado actual y podrás enviar el mensaje por WhatsApp.', ok: 'Reenviar', tone: 'info' }
  };

  function runAction(b, action) {
    var cfg = ACTIONS[action];
    if (!cfg) return;
    if (action === 'approve') {
      var c = conflictsFor(b);
      if (c.occ.length || c.blk.length) {
        alertModal({ tone: 'err', title: 'No se puede aprobar', text: c.occ.length ? ERRORS.dates_conflict : ERRORS.dates_blocked });
        return;
      }
    }
    var html = icon(cfg.tone) + '<h3>' + esc(cfg.title) + '</h3><p>' + esc(cfg.text) + '</p>' +
      '<div class="note-box" style="margin-bottom:14px;font-size:13px"><b>' + esc(b.full_name) + '</b><br>' + esc(fmtShort(b.check_in)) + ' → ' + esc(fmtShort(b.check_out)) + ' · ' + nights(b) + ' noches · ' + b.guests + ' huéspedes</div>' +
      (cfg.price ? '<div class="fld"><label>Valor total de la estadía (COP, opcional)</label><input id="acPrice" inputmode="numeric" placeholder="Ej.: 1200000" value="' + (b.quoted_price != null ? Math.round(b.quoted_price) : '') + '"></div>' : '') +
      (cfg.msg ? '<div class="fld"><label>' + esc(cfg.msg) + '</label><textarea id="acMsg" placeholder="' + esc(cfg.msgPh) + '"></textarea></div>' : '') +
      (cfg.notify ? '<label class="switch"><input type="checkbox" id="acNotify" checked> Notificar al huésped por correo</label>' : '') +
      '<div class="actions"><button class="btn ghost" data-no>Volver</button><button class="btn ' + (cfg.danger ? 'danger' : 'primary') + '" data-yes>' + esc(cfg.ok) + '</button></div>';
    openModal(html, function (m) {
      $('[data-no]', m).onclick = function () { closeModal(false); };
      $('[data-yes]', m).onclick = async function () {
        var btn = this;
        var body = { action: action, id: b.id };
        if (cfg.price) {
          var pv = $('#acPrice', m).value.replace(/[^\d]/g, '');
          if (pv) body.quoted_price = Number(pv);
        }
        if (cfg.msg) body.message = $('#acMsg', m).value.trim() || null;
        if (cfg.notify) body.notify = $('#acNotify', m).checked;
        btn.disabled = true; btn.textContent = 'Procesando…';
        var res = await callAdmin(body);
        closeModal(true);
        if (!res.ok) {
          alertModal({ tone: 'err', title: 'No se pudo completar', text: ERRORS[res.error] || 'Ocurrió un error inesperado (' + (res.error || 'sin respuesta') + ').' });
          return;
        }
        await loadAll();
        await loadEvents();
        showResult(action, res, body.notify !== false && !!cfg.notify || action === 'resend');
      };
    });
  }

  function showResult(action, res, triedEmail) {
    var titles = { approve: '¡Reserva aprobada!', hold: 'Fechas pre-reservadas', reject: 'Solicitud rechazada', cancel: 'Reserva cancelada',
      check_in: 'Llegada registrada', complete: 'Estancia finalizada', no_show: 'Marcada como no-show', reopen: 'Solicitud reabierta',
      block_contact: 'Solicitante bloqueado', resend: 'Notificación reenviada' };
    var lines = '';
    if (triedEmail) {
      lines += res.emailSent
        ? '<p style="color:var(--st-approved)">✓ Correo enviado al huésped.</p>'
        : '<p style="color:var(--st-rejected)">✕ El correo no se pudo enviar. Mientras el dominio de envío no esté verificado en Resend, solo llegan correos a la cuenta propietaria. Usa WhatsApp para notificar.</p>';
    }
    if (res.whatsappUrl) lines += '<p>Envía también el mensaje por WhatsApp con todos los datos:</p>';
    openModal(icon('ok') + '<h3>' + esc(titles[action] || 'Listo') + '</h3>' + lines +
      '<div class="actions" style="flex-direction:column">' +
      (res.whatsappUrl ? '<a class="btn wa block" style="text-decoration:none" href="' + esc(res.whatsappUrl) + '" target="_blank" rel="noopener">Enviar por WhatsApp</a>' : '') +
      '<button class="btn ghost block" data-close>Listo</button></div>',
      function (m) { $('[data-close]', m).onclick = function () { closeModal(true); }; });
  }

  function editNotes(b) {
    openModal('<h3>Valor y notas internas</h3><p>Solo los administradores ven esta información.</p>' +
      '<div class="fld"><label>Valor total de la estadía (COP)</label><input id="enPrice" inputmode="numeric" value="' + (b.quoted_price != null ? Math.round(b.quoted_price) : '') + '" placeholder="Ej.: 1200000"></div>' +
      '<div class="fld"><label>Notas internas</label><textarea id="enNotes" placeholder="Anticipo recibido, hora de llegada, placa del vehículo…">' + esc(b.internal_notes || '') + '</textarea></div>' +
      '<div class="actions"><button class="btn ghost" data-no>Cancelar</button><button class="btn navy" data-yes>Guardar</button></div>',
      function (m) {
        $('[data-no]', m).onclick = function () { closeModal(false); };
        $('[data-yes]', m).onclick = async function () {
          this.disabled = true;
          var pv = $('#enPrice', m).value.replace(/[^\d]/g, '');
          var res = await callAdmin({ action: 'note', id: b.id, quoted_price: pv ? Number(pv) : null, internal_notes: $('#enNotes', m).value.trim() || null });
          closeModal(true);
          if (!res.ok) { alertModal({ tone: 'err', title: 'No se pudo guardar', text: ERRORS[res.error] || 'Error inesperado.' }); return; }
          toast('Cambios guardados');
          await loadAll();
          await loadEvents();
        };
      });
  }

  /* ================= Calendario ================= */
  function renderCalendar() {
    var el = $('#view-calendar');
    var today = todayIso();
    if (!state.calMonth) { var t = parseD(today); state.calMonth = new Date(t.getFullYear(), t.getMonth(), 1, 12); }
    var m = state.calMonth;
    var dim = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
    var off = (m.getDay() + 6) % 7;
    var cells = '';
    ['L', 'M', 'M', 'J', 'V', 'S', 'D'].forEach(function (d) { cells += '<div class="dow">' + d + '</div>'; });
    for (var e = 0; e < off; e++) cells += '<div></div>';
    for (var d = 1; d <= dim; d++) {
      var iso = toIso(new Date(m.getFullYear(), m.getMonth(), d, 12));
      var occ = state.bookings.filter(function (b) { return OCCUPYING.indexOf(b.status) >= 0 && b.check_in <= iso && iso < b.check_out; });
      var open = state.bookings.filter(function (b) { return OPEN.indexOf(b.status) >= 0 && b.check_in <= iso && iso < b.check_out; });
      var blk = state.blocks.some(function (k) { return k.start_date <= iso && iso < k.end_date; });
      var cls = 'cal-day' + (iso === today ? ' today' : '') + (iso < today ? ' past' : '') + (blk ? ' blocked' : '') + (state.selDay === iso ? ' sel' : '');
      cells += '<button class="' + cls + '" data-day="' + iso + '"><span class="num">' + d + '</span>' +
        occ.map(function (b) { return '<span class="bar" style="--c:' + statusColor(b.status) + '"></span>'; }).join('') +
        (open.length ? '<span class="dots">' + open.slice(0, 4).map(function (b) { return '<span class="dot" style="--c:' + statusColor(b.status) + '"></span>'; }).join('') + '</span>' : '') +
        '</button>';
    }

    var dayPanel = '';
    if (state.selDay) {
      var sd = state.selDay;
      var items = state.bookings.filter(function (b) { return b.check_in <= sd && sd < b.check_out && ['rejected', 'cancelled', 'no_show'].indexOf(b.status) < 0; });
      var bl = state.blocks.filter(function (k) { return k.start_date <= sd && sd < k.end_date; });
      dayPanel = '<div class="section-title">' + esc(fmtLong(sd)) + '</div><div class="card">' +
        (items.length || bl.length ? '' : '<div class="empty" style="padding:12px">Noche libre.</div>') +
        items.map(function (b) {
          return '<div class="row-item" data-open="' + b.id + '" style="cursor:pointer"><div class="grow"><div class="t">' + esc(b.full_name) + '</div><div class="s">' + esc(fmtShort(b.check_in)) + ' → ' + esc(fmtShort(b.check_out)) + ' · ' + b.guests + ' huésp.</div></div>' + pill(b.status) + '</div>';
        }).join('') +
        bl.map(function (k) {
          return '<div class="row-item"><div class="grow"><div class="t">⛔ Bloqueado</div><div class="s">' + esc(k.reason || 'Sin motivo') + '</div></div></div>';
        }).join('') +
        '<button class="btn navy block" style="margin-top:10px" data-newblock="' + sd + '">Bloquear desde esta fecha</button></div>';
    }

    var upcomingBlocks = state.blocks.filter(function (k) { return k.end_date > today; });

    el.innerHTML =
      '<h1 class="view-title">Calendario</h1><p class="view-sub">Ocupación, solicitudes en revisión y bloqueos</p>' +
      '<div class="card"><div class="cal-head"><button class="cal-nav" data-mv="-1" aria-label="Mes anterior">‹</button>' +
      '<div class="m">' + m.toLocaleDateString('es-CO', { month: 'long', year: 'numeric' }) + '</div>' +
      '<button class="cal-nav" data-mv="1" aria-label="Mes siguiente">›</button></div>' +
      '<div class="cal-grid">' + cells + '</div>' +
      '<div class="legend"><span class="sw" style="background:var(--st-approved)"></span>Aprobada <span class="sw" style="background:var(--st-checkin)"></span>Hospedado <span class="sw" style="background:var(--st-pending);border-radius:50%"></span>Pendiente <span class="sw" style="background:var(--st-hold);border-radius:50%"></span>Pre-reserva <span class="sw" style="background:repeating-linear-gradient(135deg,var(--st-blocked-bg),var(--st-blocked-bg) 3px,var(--card) 3px,var(--card) 6px);border:1px solid var(--line)"></span>Bloqueado</div>' +
      '</div>' + dayPanel +
      '<div class="section-title">Fechas bloqueadas</div><div class="card">' +
      (upcomingBlocks.length ? upcomingBlocks.map(function (k) {
        return '<div class="row-item"><div class="grow"><div class="t">' + esc(fmtShort(k.start_date)) + ' → ' + esc(fmtShort(k.end_date)) + '</div><div class="s">' + esc(k.reason || 'Sin motivo') + '</div></div>' +
          '<button class="btn ghost" style="padding:8px 12px;font-size:13px" data-delblock="' + k.id + '">Liberar</button></div>';
      }).join('') : '<div class="empty" style="padding:12px">No hay bloqueos vigentes.</div>') +
      '<button class="btn navy block" style="margin-top:10px" data-newblock="">+ Bloquear fechas</button></div>';

    $$('[data-mv]', el).forEach(function (b) {
      b.onclick = function () { state.calMonth = new Date(m.getFullYear(), m.getMonth() + (+b.dataset.mv), 1, 12); renderCalendar(); };
    });
    $$('[data-day]', el).forEach(function (b) {
      b.onclick = function () { state.selDay = state.selDay === b.dataset.day ? null : b.dataset.day; renderCalendar(); };
    });
    $$('[data-open]', el).forEach(function (r) { r.onclick = function () { openBooking(r.dataset.open); }; });
    $$('[data-newblock]', el).forEach(function (b) { b.onclick = function () { newBlock(b.dataset.newblock || todayIso()); }; });
    $$('[data-delblock]', el).forEach(function (b) {
      b.onclick = async function () {
        var ok = await confirmModal({ title: 'Liberar fechas', text: 'Las fechas volverán a estar disponibles en el formulario público.', ok: 'Liberar' });
        if (!ok) return;
        var r = await sb.from('blocked_dates').delete().eq('id', b.dataset.delblock);
        if (r.error) { alertModal({ tone: 'err', title: 'No se pudo liberar', text: r.error.message }); return; }
        toast('Fechas liberadas');
        loadAll();
      };
    });
  }

  function newBlock(start) {
    openModal(icon('warn') + '<h3>Bloquear fechas</h3><p>Las noches bloqueadas aparecen como no disponibles en el formulario público (mantenimiento, uso personal, etc.).</p>' +
      '<div class="grid-2" style="gap:8px"><div class="fld"><label>Desde (primera noche)</label><input type="date" id="nbStart" value="' + start + '"></div>' +
      '<div class="fld"><label>Hasta (día de salida)</label><input type="date" id="nbEnd" value="' + addDays(start, 1) + '"></div></div>' +
      '<div class="fld"><label>Motivo (interno)</label><input id="nbReason" placeholder="Ej.: Mantenimiento, uso familiar"></div>' +
      '<div class="actions"><button class="btn ghost" data-no>Cancelar</button><button class="btn navy" data-yes>Bloquear</button></div>',
      function (m) {
        $('[data-no]', m).onclick = function () { closeModal(false); };
        $('[data-yes]', m).onclick = async function () {
          var s = $('#nbStart', m).value, e = $('#nbEnd', m).value;
          if (!s || !e || e <= s) { toast('La fecha final debe ser posterior a la inicial'); return; }
          var clash = state.bookings.filter(function (b) { return OCCUPYING.indexOf(b.status) >= 0 && overlaps(s, e, b.check_in, b.check_out); });
          if (clash.length) { closeModal(false); alertModal({ tone: 'err', title: 'Hay reservas en esas fechas', text: 'Se cruza con la reserva de ' + clash[0].full_name + '. Cancélala primero si quieres bloquear.' }); return; }
          this.disabled = true;
          var r = await sb.from('blocked_dates').insert({ start_date: s, end_date: e, reason: $('#nbReason', m).value.trim() || null, created_by: state.user.email });
          closeModal(true);
          if (r.error) { alertModal({ tone: 'err', title: 'No se pudo bloquear', text: r.error.message }); return; }
          toast('Fechas bloqueadas');
          loadAll();
        };
      });
  }

  /* ================= Ajustes ================= */
  function renderMore() {
    var el = $('#view-more');
    var theme = null;
    try { theme = localStorage.getItem('stw-theme'); } catch (e) { /* sin almacenamiento */ }
    el.innerHTML =
      '<h1 class="view-title">Ajustes</h1><p class="view-sub">Sesión: ' + esc(state.user ? state.user.email : '') + '</p>' +
      '<div class="section-title">Solicitantes bloqueados</div><div class="card">' +
      (state.contacts.length ? state.contacts.map(function (c) {
        return '<div class="row-item"><div class="grow"><div class="t">' + esc(c.email || '') + '</div><div class="s">' + esc(c.phone_digits ? '+' + c.phone_digits : '') + (c.reason ? ' · ' + esc(c.reason) : '') + '</div></div>' +
          '<button class="btn ghost" style="padding:8px 12px;font-size:13px" data-unblock="' + c.id + '">Desbloquear</button></div>';
      }).join('') : '<div class="empty" style="padding:12px">No hay solicitantes bloqueados.</div>') + '</div>' +
      '<div class="section-title">Apariencia</div><div class="card"><div class="chips">' +
      [['auto', 'Automático'], ['light', 'Claro'], ['dark', 'Oscuro']].map(function (t) {
        var act = (t[0] === 'auto' && !theme) || t[0] === theme;
        return '<button class="chip' + (act ? ' active' : '') + '" data-theme="' + t[0] + '">' + t[1] + '</button>';
      }).join('') + '</div></div>' +
      '<div class="section-title">Herramientas</div><div class="card menu">' +
      '<button data-export>⬇ Exportar solicitudes (CSV / Excel)<span class="chev">›</span></button>' +
      '<a href="../" target="_blank" rel="noopener">🌐 Ver formulario público<span class="chev">›</span></a>' +
      '<button data-pass>🔒 Cambiar contraseña<span class="chev">›</span></button>' +
      '<button data-install>📱 Instalar en el teléfono<span class="chev">›</span></button>' +
      '<button data-logout style="color:var(--st-rejected)">⎋ Cerrar sesión</button>' +
      '</div>' +
      '<p style="text-align:center;color:var(--faint);font-size:11.5px;margin-top:22px">Sierra Tayrona Wind · Consola de reservas</p>';

    $$('[data-unblock]', el).forEach(function (b) {
      b.onclick = async function () {
        var ok = await confirmModal({ title: 'Desbloquear', text: 'Esta persona podrá volver a enviar solicitudes.', ok: 'Desbloquear' });
        if (!ok) return;
        await sb.from('blocked_contacts').delete().eq('id', b.dataset.unblock);
        toast('Solicitante desbloqueado');
        loadAll();
      };
    });
    $$('[data-theme]', el).forEach(function (b) {
      b.onclick = function () {
        try { if (b.dataset.theme === 'auto') localStorage.removeItem('stw-theme'); else localStorage.setItem('stw-theme', b.dataset.theme); } catch (e) { /* sin almacenamiento */ }
        if (b.dataset.theme === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', b.dataset.theme);
        renderMore();
      };
    });
    $('[data-export]', el).onclick = exportCsv;
    $('[data-pass]', el).onclick = changePassword;
    $('[data-logout]', el).onclick = logout;
    $('[data-install]', el).onclick = function () {
      alertModal({ tone: 'info', title: 'Instalar la consola', html: '<p><b>iPhone (Safari):</b> toca Compartir → "Agregar a pantalla de inicio".<br><b>Android (Chrome):</b> menú ⋮ → "Instalar app" o "Agregar a pantalla principal".</p><p>Quedará como una app con el logo de Sierra Tayrona Wind.</p>' });
    };
  }

  function changePassword() {
    openModal(icon('info') + '<h3>Cambiar contraseña</h3><p>Usa al menos 8 caracteres, combinando letras y números.</p>' +
      '<div class="fld"><label>Nueva contraseña</label><input type="password" id="cp1" autocomplete="new-password"></div>' +
      '<div class="fld"><label>Confirmar contraseña</label><input type="password" id="cp2" autocomplete="new-password"></div>' +
      '<div class="actions"><button class="btn ghost" data-no>Cancelar</button><button class="btn navy" data-yes>Guardar</button></div>',
      function (m) {
        $('[data-no]', m).onclick = function () { closeModal(false); };
        $('[data-yes]', m).onclick = async function () {
          var p1 = $('#cp1', m).value, p2 = $('#cp2', m).value;
          if (p1.length < 8) { toast('La contraseña debe tener al menos 8 caracteres'); return; }
          if (p1 !== p2) { toast('Las contraseñas no coinciden'); return; }
          this.disabled = true;
          var r = await sb.auth.updateUser({ password: p1 });
          closeModal(true);
          if (r.error) alertModal({ tone: 'err', title: 'No se pudo cambiar', text: r.error.message });
          else alertModal({ tone: 'ok', title: 'Contraseña actualizada', text: 'Usa la nueva contraseña la próxima vez que ingreses.' });
        };
      });
  }

  function exportCsv() {
    var cols = [['Código', 'confirmation_code'], ['Estado', function (b) { return (STATUS[b.status] || {}).label; }], ['Nombre', 'full_name'], ['Teléfono', 'phone'], ['Correo', 'email'],
      ['Motivo', function (b) { return REASONS[b.visit_reason]; }], ['Llegada', 'check_in'], ['Salida', 'check_out'], ['Noches', nights], ['Huéspedes', 'guests'],
      ['Valor', 'quoted_price'], ['Comentarios', 'comments'], ['Notas internas', 'internal_notes'], ['Recibida', function (b) { return fmtTs(b.created_at); }],
      ['Decidida', function (b) { return b.reviewed_at ? fmtTs(b.reviewed_at) : ''; }], ['Decidida por', 'decided_by']];
    var q = function (v) { v = v == null ? '' : String(v); return '"' + v.replace(/"/g, '""') + '"'; };
    var rows = [cols.map(function (c) { return q(c[0]); }).join(';')].concat(state.bookings.map(function (b) {
      return cols.map(function (c) { return q(typeof c[1] === 'function' ? c[1](b) : b[c[1]]); }).join(';');
    }));
    var blob = new Blob(['﻿' + rows.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'reservas-sierra-tayrona-wind-' + todayIso() + '.csv';
    document.body.appendChild(a); a.click(); a.remove();
  }

  /* ================= Inicio ================= */
  (async function init() {
    var s = await sb.auth.getSession();
    if (s.data.session) await enterApp(s.data.session);
    else showLogin();
  })();
})();

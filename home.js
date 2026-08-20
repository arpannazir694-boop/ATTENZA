const API_URL = 'https://script.google.com/macros/s/AKfycbwpuED8aHh5bs_ljk9tFDTITHUmmkCS6HGn3uhE7xvYUqjFDTLMI_H5bMOTiis_8QJY/exec';
const $ = id => document.getElementById(id);

function showToast(message, success = false) {
    const t = $('toast');
    t.textContent = message;
    t.className = `toast show${success ? ' success' : ''}`;
    setTimeout(() => t.className = 'toast', 3000);
}

function formatTime(iso) {
    try {
        return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
    } catch (_) { return '—'; }
}

// Big live "time in office" counter — ticks every second from the
// employee's sign-in time up to now, so it visibly keeps running.
let durationTimer = null;
function formatDuration(ms) {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    const pad = n => String(n).padStart(2, '0');
    return `${pad(h)}:${pad(m)}:${pad(s)}`;
}
function startDurationTimer(signedInAtIso) {
    const start = new Date(signedInAtIso).getTime();
    if (durationTimer) clearInterval(durationTimer);
    if (!isFinite(start)) return;
    const el = $('durationValue');
    const tick = () => { if (el) el.textContent = formatDuration(Date.now() - start); };
    tick();
    durationTimer = setInterval(tick, 1000);
}

$('today').textContent = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }).format(new Date()).toUpperCase();

let record = null;
try {
    const raw = sessionStorage.getItem('attenza_signin');
    record = raw ? JSON.parse(raw) : null;
} catch (_) { record = null; }

// Show Admin panel link only for Admin role — case/space tolerant check,
// since the role comes from a free-typed sheet cell ("Admin", "admin", "ADMIN ", etc.)
const isAdmin = record && String(record.role || '').trim().toLowerCase() === 'admin';
if (isAdmin) {
    const adminLink = $('adminLink');
    if (adminLink) adminLink.hidden = false;
}

if (record && record.employee) {
    const firstName = String(record.employee).trim().split(' ')[0];
    $('greetingTitle').innerHTML = `Good to see<br>you, <em style="color:var(--coral);font-style:normal">${firstName}</em>.`;
    $('greetingSub').textContent = `You checked in at ${record.branch || 'your branch'} — everything looks good.`;

    const viaNote = record.viaQr ? ' · via QR' : (record.viaApproval ? ' · admin approved' : '');
    $('statusTitle').textContent = 'Sign-in recorded';
    $('statusText').textContent = `${record.employee} · ${record.branch || '—'}${viaNote}`;

    $('statBranch').textContent = record.branch || '—';
    $('statTime').textContent = formatTime(record.signedInAt);
    $('statTimeNote').textContent = record.signedInAt ? new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short' }).format(new Date(record.signedInAt)) : '\u00a0';
    $('statStatusNote').textContent = typeof record.distance === 'number' ? `${record.distance}m from office` : '\u00a0';

    $('durationSub').textContent = `Signed in since ${formatTime(record.signedInAt)} · ${record.branch || '—'}`;
    startDurationTimer(record.signedInAt);
} else {
    $('greetingTitle').textContent = 'Welcome.';
    $('greetingSub').textContent = 'We don\u2019t have a sign-in on record for this session yet.';
    $('statusCard').style.borderColor = '#d8dce1';
    $('statusCard').style.background = '#fff';
    $('statusCard').querySelector('.status-icon').style.background = '#edf0f3';
    $('statusTitle').textContent = 'No sign-in yet';
    $('statusText').textContent = 'Go back to the sign-in screen to check in for today.';
    $('durationValue').textContent = '—';
    $('durationSub').textContent = 'Sign in to start tracking.';
}

document.querySelectorAll('.sidebar-link[data-soon]').forEach(btn => {
    if (btn.id === 'adminLink') return; // Admin link gets real navigation below, not a "coming soon" toast.
    btn.addEventListener('click', () => showToast(`${btn.dataset.soon} is coming soon.`));
});

const adminLinkBtn = $('adminLink');
if (adminLinkBtn) adminLinkBtn.addEventListener('click', () => { window.location.href = 'admin.html'; });

$('signOut').addEventListener('click', async () => {
    const btn = $('signOut');
    // Record the sign-out server-side (closes today's open session) so the
    // next login starts a brand-new, freshly-timed one instead of quietly
    // resuming this one. Still sign out locally even if this call fails.
    if (record && record.employee) {
        btn.disabled = true;
        try {
            await fetch(API_URL, {
                method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({ action: 'signOut', employee: record.employee, branch: record.branch })
            });
        } catch (_) {/* ignore — still sign out locally below */ }
    }
    if (durationTimer) clearInterval(durationTimer);
    try { sessionStorage.removeItem('attenza_signin'); } catch (_) {/* ignore */ }
    window.location.href = 'index.html';
});

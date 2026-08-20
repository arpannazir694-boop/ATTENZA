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

    $('statusTitle').textContent = 'Sign-in recorded';
    $('statusText').textContent = `${record.employee} · ${record.branch || '—'}${record.viaQr ? ' · via QR' : ''}`;

    $('statBranch').textContent = record.branch || '—';
    $('statTime').textContent = formatTime(record.signedInAt);
    $('statTimeNote').textContent = record.signedInAt ? new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short' }).format(new Date(record.signedInAt)) : '\u00a0';
    $('statStatusNote').textContent = typeof record.distance === 'number' ? `${record.distance}m from office` : '\u00a0';

    $('activityList').innerHTML = `
        <div class="activity-row">
            <div>
                <span class="a-main">Sign in${record.viaQr ? ' (QR)' : ''}</span>
                <span class="a-sub">${record.branch || '—'}${typeof record.distance === 'number' ? ` · ${record.distance}m from office` : ''}${typeof record.accuracy === 'number' ? ` · GPS ±${Math.round(record.accuracy)}m` : ''}</span>
            </div>
            <span class="a-time">${formatTime(record.signedInAt)}</span>
        </div>`;
} else {
    $('greetingTitle').textContent = 'Welcome.';
    $('greetingSub').textContent = 'We don\u2019t have a sign-in on record for this session yet.';
    $('statusCard').style.borderColor = '#d8dce1';
    $('statusCard').style.background = '#fff';
    $('statusCard').querySelector('.status-icon').style.background = '#edf0f3';
    $('statusTitle').textContent = 'No sign-in yet';
    $('statusText').textContent = 'Go back to the sign-in screen to check in for today.';
}

document.querySelectorAll('.sidebar-link[data-soon]').forEach(btn => {
    btn.addEventListener('click', () => showToast(`${btn.dataset.soon} is coming soon.`));
});

$('signOut').addEventListener('click', () => {
    try { sessionStorage.removeItem('attenza_signin'); } catch (_) {/* ignore */ }
    window.location.href = 'index.html';
});

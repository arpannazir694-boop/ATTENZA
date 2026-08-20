const API_URL = 'https://script.google.com/macros/s/AKfycbwpuED8aHh5bs_ljk9tFDTITHUmmkCS6HGn3uhE7xvYUqjFDTLMI_H5bMOTiis_8QJY/exec';
const $ = id => document.getElementById(id);

function showToast(message, success = false) {
    const t = $('toast');
    t.textContent = message;
    t.className = `toast show${success ? ' success' : ''}`;
    setTimeout(() => t.className = 'toast', 3500);
}

$('today').textContent = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }).format(new Date()).toUpperCase();

let record = null;
try {
    const raw = sessionStorage.getItem('attenza_signin');
    record = raw ? JSON.parse(raw) : null;
} catch (_) { record = null; }

// Admin panel is admin-only — anyone who lands here without an Admin
// session (e.g. by typing the URL directly) is sent back to the home screen.
const isAdmin = record && String(record.role || '').trim().toLowerCase() === 'admin';
if (!isAdmin) {
    window.location.href = 'home.html';
}

let busyRequestId = null;
let pollTimer = null;

function renderRequests(requests) {
    $('requestCountText').textContent = requests.length
        ? `${requests.length} request${requests.length === 1 ? '' : 's'} waiting for your decision.`
        : 'No pending requests right now.';

    if (!requests.length) {
        $('requestList').innerHTML = `
            <div class="activity-row">
                <div>
                    <span class="a-main">All caught up</span>
                    <span class="a-sub">No branch sign-in requests are waiting for approval.</span>
                </div>
                <span class="a-time">—</span>
            </div>`;
        return;
    }

    $('requestList').innerHTML = requests.map(req => `
        <div class="activity-row request-row">
            <div>
                <span class="a-main">${req.employee}</span>
                <span class="a-sub">Wants to sign in at <strong>${req.requestedBranch}</strong> instead of ${req.assignedBranch || 'their assigned branch'} · ${req.distanceMeters}m away${req.accuracyMeters ? ` · GPS ±${Math.round(req.accuracyMeters)}m` : ''}</span>
            </div>
            <div class="request-actions">
                <button class="reject-btn" type="button" data-id="${req.requestId}" data-decision="Reject" ${busyRequestId === req.requestId ? 'disabled' : ''}>DECLINE</button>
                <button class="approve-btn" type="button" data-id="${req.requestId}" data-decision="Approve" ${busyRequestId === req.requestId ? 'disabled' : ''}>APPROVE</button>
            </div>
        </div>`).join('');

    document.querySelectorAll('.approve-btn, .reject-btn').forEach(btn => {
        btn.addEventListener('click', () => reviewRequest(btn.dataset.id, btn.dataset.decision));
    });
}

async function loadRequests() {
    try {
        const r = await fetch(`${API_URL}?action=getPendingRequests`);
        const result = await r.json();
        if (result && result.ok) renderRequests(result.requests || []);
    } catch (_) {/* keep showing the last known list until the next poll succeeds */ }
}

async function reviewRequest(requestId, decision) {
    busyRequestId = requestId;
    try {
        const r = await fetch(API_URL, {
            method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ action: 'reviewRequest', requestId, decision, reviewer: record.employee })
        });
        const result = await r.json();
        if (result && result.ok) {
            showToast(decision === 'Approve' ? 'Approved — the employee has been signed in.' : 'Request declined.', decision === 'Approve');
        } else {
            showToast((result && result.message) || 'Could not update the request.');
        }
    } catch (_) {
        showToast('Could not reach the server. Try again.');
    } finally {
        busyRequestId = null;
        loadRequests();
    }
}

document.querySelectorAll('.sidebar-link[data-soon]').forEach(btn => {
    btn.addEventListener('click', () => showToast(`${btn.dataset.soon} is coming soon.`));
});

$('signOut').addEventListener('click', () => {
    try { sessionStorage.removeItem('attenza_signin'); } catch (_) {/* ignore */ }
    window.location.href = 'index.html';
});

if (isAdmin) {
    loadRequests();
    pollTimer = setInterval(loadRequests, 5000);
}

/**
 * ATTENZA — Leave
 *
 * • Apply for leave (goes to branch admin as "Pending")
 * • Live status list with auto-refresh
 * • Leave balance KPI strip with date-range filter
 *
 * Leave deduction rules (applied only to APPROVED leaves):
 *   Medical Purpose / Personal Leave  → 1 day per calendar day
 *   Half Day                          → 0.5 day per application
 *   Early Leave                       → 0 if total approved ≤ 2
 *                                       0.5 per day beyond the first 2
 */

const API_URL = 'https://script.google.com/macros/s/AKfycbwpuED8aHh5bs_ljk9tFDTITHUmmkCS6HGn3uhE7xvYUqjFDTLMI_H5bMOTiis_8QJY/exec';
const $ = id => document.getElementById(id);

function showToast(message, success = false) {
    const t = $('toast');
    t.textContent = message;
    t.className = `toast show${success ? ' success' : ''}`;
    setTimeout(() => t.className = 'toast', 3500);
}

$('today').textContent = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }).format(new Date()).toUpperCase();

/* ── Auth guard ── */
let record = null;
try {
    const raw = sessionStorage.getItem('attenza_signin');
    record = raw ? JSON.parse(raw) : null;
} catch (_) { record = null; }

if (!record || !record.employee) {
    window.location.href = 'index.html';
}

const isAdmin = record && String(record.role || '').trim().toLowerCase() === 'admin';
if (isAdmin && $('adminLink')) $('adminLink').hidden = false;
if ($('adminLink')) $('adminLink').addEventListener('click', () => { window.location.href = 'admin.html'; });

const firstName = record ? String(record.employee).trim().split(' ')[0] : '';
$('leaveTitle').innerHTML = `Apply for leave,<br><em style="color:var(--coral);font-style:normal">${firstName}</em>.`;

$('signOut').addEventListener('click', async () => {
    const btn = $('signOut');
    if (btn) btn.disabled = true;
    const rawName = (record && record.employee) ? String(record.employee).trim() : '';
    const firstName = rawName.split(' ')[0];
    const farewell = firstName ? `Goodbye ${firstName}, see you tomorrow!` : `Goodbye, see you tomorrow!`;

    const overlay = $('signoutOverlay');
    if (overlay) overlay.classList.add('active');

    const speechPromise = new Promise(resolve => {
        if (typeof SoundFx !== 'undefined' && SoundFx.speak) {
            SoundFx.speak(farewell, resolve);
        } else {
            setTimeout(resolve, 1000);
        }
    });

    if (record && record.employee) {
        try {
            await Promise.all([
                fetch(API_URL, {
                    method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                    body: JSON.stringify({ action: 'signOut', employee: record.employee, branch: record.branch })
                }),
                speechPromise
            ]);
        } catch (_) { await speechPromise; }
    } else {
        await speechPromise;
    }
    try { sessionStorage.removeItem('attenza_signin'); } catch (_) { }
    window.location.href = 'index.html';
});

/* ── Date helpers ── */
function todayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function toDateOnly(value) {
    if (!value) return '';
    const m = String(value).match(/^\d{4}-\d{2}-\d{2}/);
    return m ? m[0] : '';
}

function fmtDate(value) {
    const dateOnly = toDateOnly(value);
    if (!dateOnly) return '—';
    const d = new Date(dateOnly + 'T00:00:00');
    if (isNaN(d.getTime())) return String(value);
    const day = String(d.getDate()).padStart(2, '0');
    const month = new Intl.DateTimeFormat('en-GB', { month: 'short' }).format(d);
    return `${day} ${month}, ${d.getFullYear()}`;
}

function daysBetween(fromStr, toStr) {
    const fromOnly = toDateOnly(fromStr), toOnly = toDateOnly(toStr);
    if (!fromOnly || !toOnly) return 0;
    const a = new Date(fromOnly + 'T00:00:00'), b = new Date(toOnly + 'T00:00:00');
    const diff = Math.round((b - a) / 86400000) + 1;
    return diff > 0 ? diff : 0;
}

/* ── Time field — only for Half Day / Early Leave ── */
const TIME_REQUIRED_TYPES = ['Half Day', 'Early Leave'];
function timeRequiredFor(leaveType) { return TIME_REQUIRED_TYPES.includes(leaveType); }

function syncTimeField() {
    const type = $('leaveType').value;
    const field = $('leaveTimeField');
    const label = $('leaveTimeLabel');
    if (timeRequiredFor(type)) {
        field.hidden = false;
        label.textContent = 'LEAVING AT';
    } else {
        field.hidden = true;
        $('leaveTime').value = '';
    }
}
$('leaveType').addEventListener('change', syncTimeField);
syncTimeField();

function fmtTime(value) {
    if (!value) return '';
    const m = String(value).match(/^(\d{2}):(\d{2})/);
    if (m) {
        const d = new Date();
        d.setHours(Number(m[1]), Number(m[2]), 0, 0);
        return new Intl.DateTimeFormat('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true }).format(d);
    }
    const iso = new Date(value);
    if (!isNaN(iso.getTime())) {
        return new Intl.DateTimeFormat('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'UTC' }).format(iso);
    }
    return String(value);
}

$('leaveFrom').min = todayStr();
$('leaveTo').min = todayStr();
$('leaveFrom').addEventListener('change', () => {
    if ($('leaveTo').value && $('leaveTo').value < $('leaveFrom').value) $('leaveTo').value = $('leaveFrom').value;
    $('leaveTo').min = $('leaveFrom').value || todayStr();
    updateDaysNote();
});
$('leaveTo').addEventListener('change', updateDaysNote);

function updateDaysNote() {
    const from = $('leaveFrom').value, to = $('leaveTo').value;
    const note = $('leaveDaysNote');
    if (from && to) {
        const n = daysBetween(from, to);
        note.textContent = n > 0 ? `${n} day${n === 1 ? '' : 's'} of leave` : 'Select a valid date range.';
    } else {
        note.textContent = '\u00a0';
    }
}

/* ── Status chip + row colouring ── */
function statusChip(status) {
    const s = String(status || '').trim().toLowerCase();
    if (s === 'approved') return { cls: 'chip-approved', text: 'APPROVED', row: 'row-approved' };
    if (s === 'rejected') return { cls: 'chip-rejected', text: 'REJECTED', row: 'row-rejected' };
    return { cls: 'chip-pending', text: 'PENDING', row: 'row-pending' };
}

/* ════════════════════════════════════════════════════════════════════
   LEAVE BALANCE KPI
   ════════════════════════════════════════════════════════════════════ */

/**
 * Calculates how many earned leave days have been consumed by approved
 * leaves, applying the rules:
 *   Medical / Personal → 1 day per calendar day
 *   Half Day           → 0.5 per application
 *   Early Leave        → first 2 approved are free; each beyond that = 0.5
 *
 * Returns { used, medical, personal, halfDay, early, earlyFree, earlyCharged }
 */
function calcLeaveUsage(approvedLeaves) {
    let medical = 0;    // days
    let personal = 0;   // days
    let halfDay = 0;    // count of applications (each = 0.5 days)
    let earlyCount = 0; // count of Early Leave applications

    approvedLeaves.forEach(r => {
        const type = String(r.leaveType || '').trim().toLowerCase();
        const days = daysBetween(r.fromDate, r.toDate);

        if (type === 'medical purpose') {
            medical += days;
        } else if (type === 'personal leave') {
            personal += days;
        } else if (type === 'half day') {
            halfDay += 1;          // each half-day app = 0.5 days off
        } else if (type === 'early leave') {
            earlyCount += 1;
        }
    });

    // Early Leave: first 2 are free, every additional = 0.5 day deducted
    const earlyFree = Math.min(earlyCount, 2);
    const earlyCharged = Math.max(0, earlyCount - 2);
    const earlyDeducted = earlyCharged * 0.5;

    const used = medical + personal + (halfDay * 0.5) + earlyDeducted;

    return { used, medical, personal, halfDay, earlyCount, earlyFree, earlyCharged, earlyDeducted };
}

/**
 * Format a leave day number cleanly — whole numbers shown as integers,
 * halves shown with one decimal (e.g. 3.5).
 */
function fmtDays(n) {
    return Number.isInteger(n * 2) && n !== Math.floor(n)
        ? n.toFixed(1)
        : String(n);
}

/** All leaves, unfiltered reference — needed for Early Leave free-count logic. */
let allApprovedLeaves = [];
/** Earned leave balance from the Employee sheet (F column). */
let earnedLeaveTotal = null;

/** Active filter state */
let activeFilter = { type: 'all', from: null, to: null };

/**
 * Filter approved leaves by the current date range, then recompute and
 * render the KPI strip.
 */
function refreshKpis() {
    const filtered = filterLeavesByRange(allApprovedLeaves, activeFilter);
    renderKpis(filtered);
}

function filterLeavesByRange(leaves, filter) {
    if (filter.type === 'all') return leaves;

    const from = filter.from, to = filter.to;
    if (!from && !to) return leaves;

    return leaves.filter(r => {
        const leaveFrom = toDateOnly(r.fromDate);
        const leaveTo = toDateOnly(r.toDate);
        // Include if the leave range overlaps with the filter range.
        const afterStart = !from || leaveTo >= from;
        const beforeEnd = !to || leaveFrom <= to;
        return afterStart && beforeEnd;
    });
}

function renderKpis(approvedLeaves) {
    const { used, medical, personal, halfDay, earlyCount, earlyFree, earlyCharged } = calcLeaveUsage(approvedLeaves);

    // Balance
    if (earnedLeaveTotal !== null) {
        const remaining = Math.max(0, earnedLeaveTotal - used);
        $('kpiBalance').innerHTML = `<span class="kpi-balance-pulse">${fmtDays(remaining)}</span><span class="kpi-live-dot"></span>`;
        $('kpiBalanceSub').textContent = `of ${fmtDays(earnedLeaveTotal)} total · ${fmtDays(used)} used`;
    } else {
        $('kpiBalance').innerHTML = `<span class="kpi-balance-pulse">${fmtDays(-used)}</span><span class="kpi-live-dot"></span>`;
        $('kpiBalanceSub').textContent = `${fmtDays(used)} days used`;
    }

    // Medical
    $('kpiMedical').textContent = String(medical);
    $('kpiMedicalSub').textContent = medical === 1 ? 'day approved' : 'days approved';

    // Personal
    $('kpiPersonal').textContent = String(personal);
    $('kpiPersonalSub').textContent = personal === 1 ? 'day approved' : 'days approved';

    // Half Day
    $('kpiHalfDay').textContent = String(halfDay);
    $('kpiHalfDaySub').textContent = halfDay === 1 ? '= 0.5 day deducted' : `= ${fmtDays(halfDay * 0.5)} days deducted`;

    // Early Leave
    $('kpiEarly').textContent = String(earlyCount);
    if (earlyCount === 0) {
        $('kpiEarlySub').textContent = 'none taken';
    } else if (earlyCharged === 0) {
        $('kpiEarlySub').textContent = `${earlyFree} free · no deduction`;
    } else {
        $('kpiEarlySub').textContent = `${earlyFree} free + ${earlyCharged} × 0.5 = ${fmtDays(earlyCharged * 0.5)}d`;
    }
}

/* ── Date-range preset buttons ── */
function getWeekRange() {
    const now = new Date();
    const day = now.getDay(); // 0=Sun
    const diffToMon = (day === 0 ? -6 : 1 - day);
    const mon = new Date(now); mon.setDate(now.getDate() + diffToMon);
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
    const fmt = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return { from: fmt(mon), to: fmt(sun) };
}

function getMonthRange() {
    const now = new Date();
    const y = now.getFullYear(), m = now.getMonth();
    const from = `${y}-${String(m + 1).padStart(2, '0')}-01`;
    const lastDay = new Date(y, m + 1, 0).getDate();
    const to = `${y}-${String(m + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    return { from, to };
}

document.querySelectorAll('.filter-btn[data-range]').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-btn[data-range]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const range = btn.dataset.range;
        if (range === 'all') {
            activeFilter = { type: 'all', from: null, to: null };
            $('filterFrom').value = '';
            $('filterTo').value = '';
        } else if (range === 'thisweek') {
            const { from, to } = getWeekRange();
            activeFilter = { type: 'custom', from, to };
            $('filterFrom').value = from;
            $('filterTo').value = to;
        } else if (range === 'thismonth') {
            const { from, to } = getMonthRange();
            activeFilter = { type: 'custom', from, to };
            $('filterFrom').value = from;
            $('filterTo').value = to;
        }
        refreshKpis();
    });
});

$('applyCustomRange').addEventListener('click', () => {
    const from = $('filterFrom').value, to = $('filterTo').value;
    if (!from && !to) return;
    document.querySelectorAll('.filter-btn[data-range]').forEach(b => b.classList.remove('active'));
    activeFilter = { type: 'custom', from: from || null, to: to || null };
    refreshKpis();
});

/* ── Render leave list ── */
function renderLeaveList(requests) {
    const el = $('leaveList');
    if (!requests.length) {
        el.innerHTML = `<p class="leave-empty">You haven't applied for any leave yet.</p>`;
        $('leaveSub').textContent = 'No leave applications on record.';
        return;
    }

    const pending = requests.filter(r => String(r.status).trim().toLowerCase() === 'pending').length;
    $('leaveSub').textContent = pending
        ? `${requests.length} application${requests.length === 1 ? '' : 's'} on record · ${pending} waiting on your admin.`
        : `${requests.length} application${requests.length === 1 ? '' : 's'} on record.`;

    el.innerHTML = requests.map(r => {
        const chip = statusChip(r.status);
        const n = daysBetween(r.fromDate, r.toDate);
        const reviewNote = r.status !== 'Pending' && r.reviewedBy
            ? ` · ${r.status === 'Approved' ? 'Approved' : 'Declined'} by ${r.reviewedBy}`
            : '';
        return `
            <div class="leave-row ${chip.row}">
                <div>
                    <span class="leave-row-main">${fmtDate(r.fromDate)} — ${fmtDate(r.toDate)}</span>
                    <span class="leave-row-sub">${n} day${n === 1 ? '' : 's'} · ${r.leaveType || 'Leave'}${r.leaveTime ? ` · Leaving at ${fmtTime(r.leaveTime)}` : ''}${reviewNote}</span>
                    ${r.reason ? `<span class="leave-row-reason">${r.reason}</span>` : ''}
                </div>
                <span class="leave-status-chip ${chip.cls}">${chip.text}</span>
            </div>`;
    }).join('');
}

/* ── Fetch leave requests + update KPIs ── */
async function loadMyLeaves() {
    try {
        const r = await fetch(`${API_URL}?action=getMyLeaveRequests&employee=${encodeURIComponent(record.employee)}`);
        const result = await r.json();
        if (result && result.ok) {
            const allRequests = result.requests || [];
            renderLeaveList(allRequests);

            // Extract only approved leaves for KPI calculation
            allApprovedLeaves = allRequests.filter(r => String(r.status).trim().toLowerCase() === 'approved');

            // If the API returns earnedLeave balance, use it
            if (typeof result.earnedLeave === 'number') {
                earnedLeaveTotal = result.earnedLeave;
            }
            refreshKpis();
        }
    } catch (_) { /* keep showing the last known list */ }
}

/* ── Fetch earned leave balance from Employee sheet ── */
async function loadEarnedLeave() {
    try {
        const r = await fetch(`${API_URL}?action=getEarnedLeave&employee=${encodeURIComponent(record.employee)}`);
        const result = await r.json();
        if (result && result.ok && typeof result.earnedLeave === 'number') {
            earnedLeaveTotal = result.earnedLeave;
            refreshKpis();
        }
    } catch (_) { /* earnedLeaveTotal stays null — balance shown as "—" */ }
}

/* ── Submit ── */
let submitting = false;
$('submitLeave').addEventListener('click', async () => {
    if (submitting) return;
    const from = $('leaveFrom').value, to = $('leaveTo').value;
    const leaveType = $('leaveType').value;
    const leaveTime = $('leaveTime').value;
    const reason = $('leaveReason').value.trim();
    const statusEl = $('leaveSubmitStatus');

    if (!from || !to) {
        statusEl.className = 'leave-submit-status error';
        statusEl.textContent = 'Pick both a from and to date.';
        return;
    }
    if (to < from) {
        statusEl.className = 'leave-submit-status error';
        statusEl.textContent = 'The to-date can\u2019t be before the from-date.';
        return;
    }
    if (timeRequiredFor(leaveType) && !leaveTime) {
        statusEl.className = 'leave-submit-status error';
        statusEl.textContent = 'Pick the time you\u2019ll be leaving.';
        return;
    }
    if (!reason) {
        statusEl.className = 'leave-submit-status error';
        statusEl.textContent = 'Add a short reason for your admin.';
        return;
    }

    submitting = true;
    $('submitLeave').disabled = true;
    statusEl.className = 'leave-submit-status';
    statusEl.textContent = 'Sending…';

    try {
        const r = await fetch(API_URL, {
            method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({
                action: 'applyLeave',
                employee: record.employee,
                branch: record.branch,
                fromDate: from,
                toDate: to,
                leaveType,
                leaveTime: timeRequiredFor(leaveType) ? leaveTime : '',
                reason
            })
        });
        const result = await r.json();
        if (result && result.ok) {
            if (typeof SoundFx !== 'undefined') SoundFx.playNotification();
            statusEl.className = 'leave-submit-status success';
            statusEl.textContent = 'Sent to your admin for approval.';
            showToast('Leave application sent for approval.', true);
            $('leaveReason').value = '';
            $('leaveFrom').value = '';
            $('leaveTo').value = '';
            $('leaveTime').value = '';
            syncTimeField();
            updateDaysNote();
            loadMyLeaves();
        } else {
            statusEl.className = 'leave-submit-status error';
            statusEl.textContent = (result && result.message) || 'Could not submit your application.';
        }
    } catch (_) {
        statusEl.className = 'leave-submit-status error';
        statusEl.textContent = 'Could not reach the server. Try again.';
    } finally {
        submitting = false;
        $('submitLeave').disabled = false;
    }
});

/* ── Boot ── */
loadEarnedLeave();
loadMyLeaves();
setInterval(loadMyLeaves, 8000); // pick up admin decisions without a manual reload

/* ════════════════════════════════════════════════════════════════════
   KPI DETAIL MODAL
   ════════════════════════════════════════════════════════════════════ */

const KPI_CONFIG = {
    'kpi-balance': {
        title: 'Earned Leave Balance',
        dot: '#c96845',
        type: 'balance',
    },
    'kpi-medical': {
        title: 'Medical Purpose Leaves',
        dot: '#4a57a8',
        type: 'medical',
        matchType: 'medical purpose',
    },
    'kpi-personal': {
        title: 'Personal Leaves',
        dot: '#2e7a56',
        type: 'personal',
        matchType: 'personal leave',
    },
    'kpi-halfday': {
        title: 'Half Day Leaves',
        dot: '#a07030',
        type: 'halfday',
        matchType: 'half day',
    },
    'kpi-early': {
        title: 'Early Leaves',
        dot: '#6a5fa0',
        type: 'early',
        matchType: 'early leave',
    },
};

function openKpiModal(kpiClass) {
    const cfg = KPI_CONFIG[kpiClass];
    if (!cfg) return;

    const overlay = $('kpiModalOverlay');
    const dot = $('kpiModalDot');
    const title = $('kpiModalTitle');
    const summary = $('kpiModalSummary');
    const body = $('kpiModalBody');

    dot.style.background = cfg.dot;
    title.textContent = cfg.title;

    // Get current filtered approved leaves
    const filtered = filterLeavesByRange(allApprovedLeaves, activeFilter);
    const usage = calcLeaveUsage(filtered);

    if (cfg.type === 'balance') {
        renderBalanceModal(summary, body, filtered, usage);
    } else {
        const rows = filtered.filter(r =>
            String(r.leaveType || '').trim().toLowerCase() === cfg.matchType
        );
        renderLeaveTypeModal(cfg, summary, body, rows, usage);
    }

    overlay.classList.add('open');
}

function renderBalanceModal(summary, body, filtered, usage) {
    const total = earnedLeaveTotal !== null ? fmtDays(earnedLeaveTotal) : '—';
    const used = fmtDays(usage.used);
    const remaining = earnedLeaveTotal !== null ? fmtDays(Math.max(0, earnedLeaveTotal - usage.used)) : '—';

    summary.innerHTML = `
        <div class="kpi-modal-stat">
            <span class="kpi-modal-stat-val" style="color:#c96845">${total}</span>
            <span class="kpi-modal-stat-lbl">TOTAL EARNED</span>
        </div>
        <div class="kpi-modal-stat">
            <span class="kpi-modal-stat-val" style="color:#c1554a">${used}</span>
            <span class="kpi-modal-stat-lbl">DAYS USED</span>
        </div>
        <div class="kpi-modal-stat">
            <span class="kpi-modal-stat-val" style="color:#2e7d53">${remaining}</span>
            <span class="kpi-modal-stat-lbl">REMAINING</span>
        </div>`;

    // Breakdown table
    const rows = [
        { label: 'Medical Purpose', days: usage.medical, deducted: usage.medical, note: '1 day per calendar day' },
        { label: 'Personal Leave', days: usage.personal, deducted: usage.personal, note: '1 day per calendar day' },
        { label: 'Half Day', days: usage.halfDay + ' application' + (usage.halfDay !== 1 ? 's' : ''), deducted: fmtDays(usage.halfDay * 0.5), note: '0.5 day each' },
        { label: 'Early Leave', days: usage.earlyCount + ' application' + (usage.earlyCount !== 1 ? 's' : ''), deducted: fmtDays(usage.earlyDeducted), note: `${usage.earlyFree} free · ${usage.earlyCharged} × 0.5` },
    ];

    body.innerHTML = `
        <table class="kpi-modal-table">
            <thead>
                <tr>
                    <th>LEAVE TYPE</th>
                    <th>TAKEN</th>
                    <th>DAYS DEDUCTED</th>
                    <th>RULE</th>
                </tr>
            </thead>
            <tbody>
                ${rows.map(r => `
                <tr>
                    <td>${r.label}</td>
                    <td>${r.days}</td>
                    <td style="font-weight:600;color:#c1554a">${r.deducted}</td>
                    <td style="color:var(--muted);font-size:11px">${r.note}</td>
                </tr>`).join('')}
                <tr style="background:#fafafa">
                    <td colspan="2" style="font-weight:700;font-size:13px">TOTAL USED</td>
                    <td style="font-weight:700;font-size:13px;color:#c1554a">${used}</td>
                    <td></td>
                </tr>
            </tbody>
        </table>`;
}

function renderLeaveTypeModal(cfg, summary, body, rows, usage) {
    let statHTML = '';

    if (cfg.type === 'medical') {
        statHTML = `
            <div class="kpi-modal-stat">
                <span class="kpi-modal-stat-val" style="color:${cfg.dot}">${usage.medical}</span>
                <span class="kpi-modal-stat-lbl">DAYS APPROVED</span>
            </div>
            <div class="kpi-modal-stat">
                <span class="kpi-modal-stat-val" style="color:${cfg.dot}">${rows.length}</span>
                <span class="kpi-modal-stat-lbl">APPLICATIONS</span>
            </div>
            <div class="kpi-modal-stat">
                <span class="kpi-modal-stat-val" style="color:#c1554a">${usage.medical}</span>
                <span class="kpi-modal-stat-lbl">DAYS DEDUCTED</span>
            </div>`;
    } else if (cfg.type === 'personal') {
        statHTML = `
            <div class="kpi-modal-stat">
                <span class="kpi-modal-stat-val" style="color:${cfg.dot}">${usage.personal}</span>
                <span class="kpi-modal-stat-lbl">DAYS APPROVED</span>
            </div>
            <div class="kpi-modal-stat">
                <span class="kpi-modal-stat-val" style="color:${cfg.dot}">${rows.length}</span>
                <span class="kpi-modal-stat-lbl">APPLICATIONS</span>
            </div>
            <div class="kpi-modal-stat">
                <span class="kpi-modal-stat-val" style="color:#c1554a">${usage.personal}</span>
                <span class="kpi-modal-stat-lbl">DAYS DEDUCTED</span>
            </div>`;
    } else if (cfg.type === 'halfday') {
        statHTML = `
            <div class="kpi-modal-stat">
                <span class="kpi-modal-stat-val" style="color:${cfg.dot}">${usage.halfDay}</span>
                <span class="kpi-modal-stat-lbl">APPLICATIONS</span>
            </div>
            <div class="kpi-modal-stat">
                <span class="kpi-modal-stat-val" style="color:#c1554a">${fmtDays(usage.halfDay * 0.5)}</span>
                <span class="kpi-modal-stat-lbl">DAYS DEDUCTED</span>
            </div>
            <div class="kpi-modal-stat">
                <span class="kpi-modal-stat-val" style="color:var(--muted);font-size:13px">0.5/app</span>
                <span class="kpi-modal-stat-lbl">RULE</span>
            </div>`;
    } else if (cfg.type === 'early') {
        statHTML = `
            <div class="kpi-modal-stat">
                <span class="kpi-modal-stat-val" style="color:${cfg.dot}">${usage.earlyCount}</span>
                <span class="kpi-modal-stat-lbl">TOTAL TAKEN</span>
            </div>
            <div class="kpi-modal-stat">
                <span class="kpi-modal-stat-val" style="color:#2e7d53">${usage.earlyFree}</span>
                <span class="kpi-modal-stat-lbl">FREE (NO DEDUCTION)</span>
            </div>
            <div class="kpi-modal-stat">
                <span class="kpi-modal-stat-val" style="color:#c1554a">${fmtDays(usage.earlyDeducted)}</span>
                <span class="kpi-modal-stat-lbl">DAYS DEDUCTED</span>
            </div>`;
    }

    summary.innerHTML = statHTML;

    if (!rows.length) {
        body.innerHTML = `<p class="kpi-modal-empty">No approved ${cfg.title.toLowerCase()} in this period.</p>`;
        return;
    }

    // Build table per type
    let tableHTML = '';
    if (cfg.type === 'medical' || cfg.type === 'personal') {
        tableHTML = `
            <table class="kpi-modal-table">
                <thead>
                    <tr>
                        <th>#</th>
                        <th>FROM</th>
                        <th>TO</th>
                        <th>DAYS</th>
                        <th>REASON</th>
                        <th>APPROVED BY</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows.map((r, i) => {
            const days = daysBetween(r.fromDate, r.toDate);
            return `<tr>
                            <td style="color:var(--muted)">${i + 1}</td>
                            <td>${fmtDate(r.fromDate)}</td>
                            <td>${fmtDate(r.toDate)}</td>
                            <td style="font-weight:600;color:#c1554a">${days}</td>
                            <td style="color:var(--muted);font-size:11px;max-width:180px">${r.reason || '—'}</td>
                            <td style="color:var(--muted)">${r.reviewedBy || '—'}</td>
                        </tr>`;
        }).join('')}
                </tbody>
            </table>`;
    } else if (cfg.type === 'halfday') {
        tableHTML = `
            <table class="kpi-modal-table">
                <thead>
                    <tr>
                        <th>#</th>
                        <th>DATE</th>
                        <th>LEAVING AT</th>
                        <th>DEDUCTED</th>
                        <th>REASON</th>
                        <th>APPROVED BY</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows.map((r, i) => `<tr>
                        <td style="color:var(--muted)">${i + 1}</td>
                        <td>${fmtDate(r.fromDate)}</td>
                        <td>${r.leaveTime ? fmtTime(r.leaveTime) : '—'}</td>
                        <td style="font-weight:600;color:#c1554a">0.5 day</td>
                        <td style="color:var(--muted);font-size:11px;max-width:180px">${r.reason || '—'}</td>
                        <td style="color:var(--muted)">${r.reviewedBy || '—'}</td>
                    </tr>`).join('')}
                </tbody>
            </table>`;
    } else if (cfg.type === 'early') {
        tableHTML = `
            <table class="kpi-modal-table">
                <thead>
                    <tr>
                        <th>#</th>
                        <th>DATE</th>
                        <th>LEAVING AT</th>
                        <th>STATUS</th>
                        <th>DEDUCTED</th>
                        <th>REASON</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows.map((r, i) => {
            const isFree = (i + 1) <= usage.earlyFree;
            return `<tr>
                            <td style="color:var(--muted)">${i + 1}</td>
                            <td>${fmtDate(r.fromDate)}</td>
                            <td>${r.leaveTime ? fmtTime(r.leaveTime) : '—'}</td>
                            <td>
                                <span class="kpi-td-badge" style="background:${isFree ? '#e6f5ec' : '#fdeee9'};color:${isFree ? '#2e7d53' : '#c1554a'}">
                                    ${isFree ? 'FREE' : 'CHARGED'}
                                </span>
                            </td>
                            <td style="font-weight:600;color:${isFree ? '#2e7d53' : '#c1554a'}">${isFree ? '—' : '0.5 day'}</td>
                            <td style="color:var(--muted);font-size:11px;max-width:160px">${r.reason || '—'}</td>
                        </tr>`;
        }).join('')}
                </tbody>
            </table>`;
    }

    body.innerHTML = tableHTML;
}

// Wire up KPI clicks
document.querySelectorAll('.leave-kpi').forEach(card => {
    const kpiClass = Array.from(card.classList).find(c => c.startsWith('kpi-'));
    if (!kpiClass) return;
    card.addEventListener('click', () => openKpiModal(kpiClass));
});

// Close modal
$('kpiModalClose').addEventListener('click', () => {
    $('kpiModalOverlay').classList.remove('open');
});
$('kpiModalOverlay').addEventListener('click', e => {
    if (e.target === $('kpiModalOverlay')) $('kpiModalOverlay').classList.remove('open');
});
document.addEventListener('keydown', e => {
    if (e.key === 'Escape') $('kpiModalOverlay').classList.remove('open');
});

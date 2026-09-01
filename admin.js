/**
 * ATTENZA — Admin Panel & Branch Reports
 *
 * • Review sign-in override requests & leave applications
 * • Branch Reports: Ke kobe leave niyeche (Leave History) & Kar ki leave baki ache (Leave Balances)
 * • Custom date-wise, employee-wise, type-wise & status-wise filters
 * • Full Excel (.xlsx) export
 */

const API_URL = 'https://script.google.com/macros/s/AKfycbwpuED8aHh5bs_ljk9tFDTITHUmmkCS6HGn3uhE7xvYUqjFDTLMI_H5bMOTiis_8QJY/exec';
const $ = id => document.getElementById(id);

function showToast(message, success = false) {
    const t = $('toast');
    if (!t) return;
    t.textContent = message;
    t.className = `toast show${success ? ' success' : ''}`;
    setTimeout(() => t.className = 'toast', 3500);
}

$('today').textContent = new Intl.DateTimeFormat('en-GB', {
    weekday: 'short', day: '2-digit', month: 'short', year: 'numeric'
}).format(new Date()).toUpperCase();

let record = null;
try {
    const raw = sessionStorage.getItem('attenza_signin');
    record = raw ? JSON.parse(raw) : null;
} catch (_) { record = null; }

// Admin panel is admin-only
const isAdmin = record && String(record.role || '').trim().toLowerCase() === 'admin';
if (!isAdmin) {
    window.location.href = 'home.html';
}

const adminBranch = (record && record.branch) ? String(record.branch).trim() : '';

/* ════════════════════════════════════════════════════════════════════
   DATE & TIME HELPERS
   ════════════════════════════════════════════════════════════════════ */
function toDateOnly(value) {
    if (!value) return '';
    const m = String(value).match(/^\d{4}-\d{2}-\d{2}/);
    return m ? m[0] : '';
}

function fmtLeaveDate(value) {
    const dateOnly = toDateOnly(value);
    if (!dateOnly) return '—';
    const d = new Date(dateOnly + 'T00:00:00');
    if (isNaN(d.getTime())) return String(value);
    const day = String(d.getDate()).padStart(2, '0');
    const month = new Intl.DateTimeFormat('en-GB', { month: 'short' }).format(d);
    return `${day} ${month}, ${d.getFullYear()}`;
}

function fmtShortDate(value) {
    const dateOnly = toDateOnly(value);
    if (!dateOnly) return '—';
    const d = new Date(dateOnly + 'T00:00:00');
    if (isNaN(d.getTime())) return String(value);
    const day = String(d.getDate()).padStart(2, '0');
    const month = new Intl.DateTimeFormat('en-GB', { month: 'short' }).format(d);
    return `${day} ${month}`;
}

function fmtLeaveTime(value) {
    if (!value || value === '—' || value === '-') return '';
    const str = String(value).trim().replace(/^'+/, '');
    if (!str) return '';

    // 12-hour format with AM/PM (e.g. "09:54 pm", "9:54 PM")
    const m12 = str.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*([aApP][mM])$/i);
    if (m12) {
        const hh = String(m12[1]).padStart(2, '0');
        const mm = m12[2];
        const ampm = m12[3].toUpperCase();
        return `${hh}:${mm} ${ampm}`;
    }

    // 24-hour format (e.g. "14:30" or "09:54")
    const m24 = str.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
    if (m24) {
        const h = parseInt(m24[1], 10);
        const mm = m24[2];
        const ampm = h >= 12 ? 'PM' : 'AM';
        const h12 = h % 12 || 12;
        return `${String(h12).padStart(2, '0')}:${mm} ${ampm}`;
    }

    // ISO timestamp or Date string
    const d = new Date(str);
    if (!isNaN(d.getTime())) {
        return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: true }).format(d);
    }

    return str;
}

function leaveDayCount(fromStr, toStr) {
    const fromOnly = toDateOnly(fromStr), toOnly = toDateOnly(toStr);
    if (!fromOnly || !toOnly) return 0;
    const a = new Date(fromOnly + 'T00:00:00'), b = new Date(toOnly + 'T00:00:00');
    const n = Math.round((b - a) / 86400000) + 1;
    return n > 0 ? n : 0;
}

function fmtDays(n) {
    if (n === null || n === undefined || isNaN(n)) return '—';
    return Number.isInteger(n * 2) && n !== Math.floor(n) ? n.toFixed(1) : String(n);
}

/* ════════════════════════════════════════════════════════════════════
   VIEW NAVIGATION (REQUESTS vs BRANCH REPORTS)
   ════════════════════════════════════════════════════════════════════ */
let currentView = 'requests';
let currentSubTab = 'balances';

function switchView(view) {
    currentView = view;
    const btnRequests = $('btnViewRequests');
    const btnReports = $('btnViewReports');
    const panelRequests = $('adminRequestsView');
    const panelReports = $('adminReportsView');
    const stepLabel = $('adminStepLabel');
    const mainTitle = $('adminMainTitle');
    const subtitle = $('adminSubtitle');

    if (view === 'requests') {
        btnRequests.classList.add('active');
        btnRequests.setAttribute('aria-selected', 'true');
        btnReports.classList.remove('active');
        btnReports.setAttribute('aria-selected', 'false');

        panelRequests.hidden = false;
        panelReports.hidden = true;

        stepLabel.textContent = 'ADMIN';
        mainTitle.textContent = 'Requests.';
        updateRequestsSubtitle();
    } else {
        btnReports.classList.add('active');
        btnReports.setAttribute('aria-selected', 'true');
        btnRequests.classList.remove('active');
        btnRequests.setAttribute('aria-selected', 'false');

        panelRequests.hidden = true;
        panelReports.hidden = false;

        stepLabel.textContent = 'BRANCH REPORTS';
        mainTitle.textContent = `${adminBranch || 'Branch'} Record.`;
        subtitle.textContent = `Leave breakdown, remaining quota & history for ${adminBranch || 'your branch'}.`;

        loadBranchReports();
    }
}

$('btnViewRequests').addEventListener('click', () => switchView('requests'));
$('btnViewReports').addEventListener('click', () => switchView('reports'));

/* Sub-tabs inside Reports (Balances vs History Log) */
$('subtabBalances').addEventListener('click', () => {
    currentSubTab = 'balances';
    $('subtabBalances').classList.add('active');
    $('subtabHistory').classList.remove('active');
    $('reportBalancesTableWrap').hidden = false;
    $('reportHistoryTableWrap').hidden = true;
    updateReportTableCount();
});

$('subtabHistory').addEventListener('click', () => {
    currentSubTab = 'history';
    $('subtabHistory').classList.add('active');
    $('subtabBalances').classList.remove('active');
    $('reportHistoryTableWrap').hidden = false;
    $('reportBalancesTableWrap').hidden = true;
    updateReportTableCount();
});

/* ════════════════════════════════════════════════════════════════════
   REQUESTS VIEW (Pending Sign-in and Leave approvals)
   ════════════════════════════════════════════════════════════════════ */
let busyRequestId = null;
let busyLeaveId = null;
let pendingSignInCount = 0;
let pendingLeaveCount = 0;

function updateRequestsSubtitle() {
    if (currentView !== 'requests') return;
    const total = pendingSignInCount + pendingLeaveCount;
    $('adminSubtitle').textContent = total > 0
        ? `${total} pending decision${total === 1 ? '' : 's'} (${pendingSignInCount} sign-in, ${pendingLeaveCount} leave) waiting for your review.`
        : 'No pending requests right now.';
}

function updatePendingBadge() {
    const total = pendingSignInCount + pendingLeaveCount;
    const badge = $('requestsTotalBadge');
    if (badge) {
        badge.textContent = total;
        if (total > 0) {
            badge.classList.remove('badge-zero');
        } else {
            badge.classList.add('badge-zero');
        }
    }
    updateRequestsSubtitle();
}

function renderRequests(requests) {
    pendingSignInCount = requests.length || 0;
    updatePendingBadge();

    const countEl = $('signinCount');
    const listEl = $('requestList');
    if (countEl) countEl.textContent = requests.length || '0';

    if (!requests.length) {
        listEl.innerHTML = `
        <div class="empty-row">
            <div class="empty-icon">✓</div>
            <p class="empty-label">All caught up</p>
            <p class="empty-sub">No branch sign-in requests are waiting for approval.</p>
        </div>`;
        return;
    }

    listEl.innerHTML = requests.map(req => `
    <div class="req-row">
        <div class="cell">
            <span class="cell-main">${req.employee}</span>
            <span class="cell-sub">${req.assignedBranch || 'Assigned branch'}</span>
        </div>
        <div class="cell">
            <span class="cell-badge badge-navy">${req.requestedBranch}</span>
        </div>
        <div class="cell">
            <span style="font:600 12px 'DM Mono',monospace;color:var(--ink)">${req.distanceMeters}m</span>
            ${req.accuracyMeters ? `<span class="cell-sub">GPS ±${Math.round(req.accuracyMeters)}m</span>` : ''}
        </div>
        <div class="cell-actions">
            <button class="btn-decline" type="button" data-id="${req.requestId}" data-decision="Reject" ${busyRequestId === req.requestId ? 'disabled' : ''}>DECLINE</button>
            <button class="btn-approve" type="button" data-id="${req.requestId}" data-decision="Approve" ${busyRequestId === req.requestId ? 'disabled' : ''}>APPROVE</button>
        </div>
    </div>`).join('');

    listEl.querySelectorAll('.btn-approve, .btn-decline').forEach(btn => {
        btn.addEventListener('click', () => reviewRequest(btn.dataset.id, btn.dataset.decision));
    });
}

async function loadRequests() {
    try {
        const r = await fetch(`${API_URL}?action=getPendingRequests`);
        const result = await r.json();
        if (result && result.ok) renderRequests(result.requests || []);
    } catch (_) { }
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
            if (typeof SoundFx !== 'undefined') SoundFx.playNotification();
            showToast(decision === 'Approve' ? 'Approved — employee signed in.' : 'Request declined.', decision === 'Approve');
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

function renderLeaveRequests(requests) {
    pendingLeaveCount = requests.length || 0;
    updatePendingBadge();

    const countEl = $('leaveCount');
    const listEl = $('leaveRequestList');
    if (countEl) countEl.textContent = requests.length || '0';

    if (!requests.length) {
        listEl.innerHTML = `
        <div class="empty-row">
            <div class="empty-icon">✓</div>
            <p class="empty-label">All caught up</p>
            <p class="empty-sub">No leave requests from your branch are waiting for approval.</p>
        </div>`;
        return;
    }

    listEl.innerHTML = requests.map(req => {
        const days = leaveDayCount(req.fromDate, req.toDate);
        const timeFormatted = fmtLeaveTime(req.leaveTime);
        const timeBadge = timeFormatted
            ? `<span class="cell-badge badge-navy" style="font-size:10.5px;padding:2px 7px;border-radius:2px;background:#eef1fb;color:#3b4895;border:1px solid #c4cdec;font-weight:700;letter-spacing:.4px">🕒 LEAVING: ${timeFormatted}</span>`
            : '';

        return `
        <div class="req-row">
            <div class="cell">
                <span class="cell-main">${req.employee}</span>
                <div style="display:flex;align-items:center;flex-wrap:wrap;gap:5px;margin-top:4px">
                    <span class="cell-badge badge-amber">${req.leaveType || 'Leave'}</span>
                    ${req.branch ? `<span class="cell-badge badge-navy">${req.branch}</span>` : ''}
                    ${timeBadge}
                </div>
                ${req.reason ? `<span class="reason-text">${req.reason}</span>` : ''}
            </div>
            <div class="cell">
                <span style="font:600 11px 'DM Mono',monospace;color:var(--ink)">${fmtLeaveDate(req.fromDate)}</span>
                <span class="cell-sub">${fmtLeaveDate(req.toDate)}</span>
                ${timeFormatted ? `<span style="font:700 10.5px 'DM Mono',monospace;color:#3b4895;display:block;margin-top:2px">Time: ${timeFormatted}</span>` : ''}
            </div>
            <div class="cell">
                <span class="cell-badge badge-coral">${days}d</span>
            </div>
            <div class="cell-actions">
                <button class="btn-decline" type="button" data-id="${req.leaveId}" data-decision="Reject" ${busyLeaveId === req.leaveId ? 'disabled' : ''}>DECLINE</button>
                <button class="btn-approve" type="button" data-id="${req.leaveId}" data-decision="Approve" ${busyLeaveId === req.leaveId ? 'disabled' : ''}>APPROVE</button>
            </div>
        </div>`;
    }).join('');

    listEl.querySelectorAll('#leaveRequestList .btn-approve, #leaveRequestList .btn-decline').forEach(btn => {
        btn.addEventListener('click', () => reviewLeaveRequest(btn.dataset.id, btn.dataset.decision));
    });
}

async function loadLeaveRequests() {
    try {
        const r = await fetch(`${API_URL}?action=getPendingLeaveRequests&branch=${encodeURIComponent(adminBranch)}`);
        const result = await r.json();
        if (result && result.ok) renderLeaveRequests(result.requests || []);
    } catch (_) { }
}

async function reviewLeaveRequest(leaveId, decision) {
    busyLeaveId = leaveId;
    try {
        const r = await fetch(API_URL, {
            method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ action: 'reviewLeaveRequest', leaveId, decision, reviewer: record.employee })
        });
        const result = await r.json();
        if (result && result.ok) {
            if (typeof SoundFx !== 'undefined') SoundFx.playNotification();
            showToast(decision === 'Approve' ? 'Leave approved.' : 'Leave declined.', decision === 'Approve');
            // Refresh branch reports in background so balances update immediately
            loadBranchReports();
        } else {
            showToast((result && result.message) || 'Could not update the leave request.');
        }
    } catch (_) {
        showToast('Could not reach the server. Try again.');
    } finally {
        busyLeaveId = null;
        loadLeaveRequests();
    }
}

/* ════════════════════════════════════════════════════════════════════
   BRANCH REPORTS & LEAVE BALANCES
   ════════════════════════════════════════════════════════════════════ */
let reportEmployees = [];
let reportLeaves = [];

const reportFilter = {
    employee: 'all',
    rangeType: 'all',
    from: null,
    to: null,
    leaveType: 'all',
    status: 'all',
    search: ''
};

// Set branch badge
if ($('reportBranchBadge')) {
    $('reportBranchBadge').textContent = `📍 ${adminBranch.toUpperCase() || 'BRANCH'}`;
}

/**
 * Calculates leave usage for a set of approved leaves:
 *   Medical / Personal: 1 day per calendar day
 *   Half Day: 0.5 day per application
 *   Early Leave: first 2 approved are free; 0.5 per day beyond 2
 */
function calcLeaveUsage(approvedLeaves) {
    let medical = 0;
    let personal = 0;
    let halfDay = 0;
    let earlyCount = 0;

    approvedLeaves.forEach(r => {
        const type = String(r.leaveType || '').trim().toLowerCase();
        const days = leaveDayCount(r.fromDate, r.toDate);

        if (type === 'medical purpose') {
            medical += days;
        } else if (type === 'personal leave') {
            personal += days;
        } else if (type === 'half day') {
            halfDay += 1;
        } else if (type === 'early leave') {
            earlyCount += 1;
        }
    });

    const earlyFree = Math.min(earlyCount, 2);
    const earlyCharged = Math.max(0, earlyCount - 2);
    const earlyDeducted = earlyCharged * 0.5;
    const used = medical + personal + (halfDay * 0.5) + earlyDeducted;

    return { used, medical, personal, halfDay, earlyCount, earlyFree, earlyCharged, earlyDeducted };
}

/**
 * Calculates leave breakdown and balances per employee for this branch.
 */
function computeEmployeeBalances(employees, leaves, filter) {
    return employees.map(emp => {
        const empName = emp.name;
        const empLeaves = leaves.filter(l => String(l.employee || '').trim().toLowerCase() === empName.toLowerCase());

        // Approved leaves within the active date range (for period deduction)
        const approvedInPeriod = filterLeavesByDate(
            empLeaves.filter(l => String(l.status || '').trim().toLowerCase() === 'approved'),
            filter
        );
        const usage = calcLeaveUsage(approvedInPeriod);

        // All-time approved leaves for true remaining quota
        const allTimeApproved = empLeaves.filter(l => String(l.status || '').trim().toLowerCase() === 'approved');
        const allTimeUsage = calcLeaveUsage(allTimeApproved);

        const pendingCount = empLeaves.filter(l => String(l.status || '').trim().toLowerCase() === 'pending').length;

        const allotted = emp.earnedLeave !== null && emp.earnedLeave !== undefined ? Number(emp.earnedLeave) : null;
        const remaining = allotted !== null ? Math.max(0, allotted - allTimeUsage.used) : null;

        return {
            name: emp.name,
            role: emp.role || 'Employee',
            branch: emp.branch || adminBranch,
            allotted,
            usedInPeriod: usage.used,
            allTimeUsed: allTimeUsage.used,
            remaining,
            medicalDays: usage.medical,
            personalDays: usage.personal,
            halfDays: usage.halfDay,
            earlyCount: usage.earlyCount,
            earlyFree: usage.earlyFree,
            earlyCharged: usage.earlyCharged,
            earlyDeducted: usage.earlyDeducted,
            pendingCount,
            totalLeavesCount: empLeaves.length
        };
    });
}

function filterLeavesByDate(leaves, filter) {
    if (filter.rangeType === 'all' || (!filter.from && !filter.to)) return leaves;

    const from = filter.from, to = filter.to;
    return leaves.filter(r => {
        const leaveFrom = toDateOnly(r.fromDate);
        const leaveTo = toDateOnly(r.toDate);
        const afterStart = !from || leaveTo >= from;
        const beforeEnd = !to || leaveFrom <= to;
        return afterStart && beforeEnd;
    });
}

function getFilteredLeaves() {
    let result = reportLeaves.slice();

    // Employee filter
    if (reportFilter.employee !== 'all') {
        const target = reportFilter.employee.toLowerCase();
        result = result.filter(r => String(r.employee || '').trim().toLowerCase() === target);
    }

    // Date filter
    result = filterLeavesByDate(result, reportFilter);

    // Leave type filter
    if (reportFilter.leaveType !== 'all') {
        const targetType = reportFilter.leaveType.toLowerCase();
        result = result.filter(r => String(r.leaveType || '').trim().toLowerCase() === targetType);
    }

    // Status filter
    if (reportFilter.status !== 'all') {
        const targetStatus = reportFilter.status.toLowerCase();
        result = result.filter(r => String(r.status || '').trim().toLowerCase() === targetStatus);
    }

    // Text search
    if (reportFilter.search) {
        const q = reportFilter.search.toLowerCase();
        result = result.filter(r =>
            String(r.employee || '').toLowerCase().includes(q) ||
            String(r.reason || '').toLowerCase().includes(q) ||
            String(r.leaveType || '').toLowerCase().includes(q)
        );
    }

    return result;
}

function getFilteredEmployees() {
    let list = reportEmployees.slice();
    if (reportFilter.employee !== 'all') {
        const target = reportFilter.employee.toLowerCase();
        list = list.filter(e => String(e.name || '').trim().toLowerCase() === target);
    }
    if (reportFilter.search) {
        const q = reportFilter.search.toLowerCase();
        list = list.filter(e => String(e.name || '').toLowerCase().includes(q) || String(e.role || '').toLowerCase().includes(q));
    }
    return list;
}

/* ── Fetch Branch Reports Data ── */
async function loadBranchReports() {
    try {
        const r = await fetch(`${API_URL}?action=getBranchReports&branch=${encodeURIComponent(adminBranch)}`);
        const result = await r.json();
        if (result && result.ok) {
            reportEmployees = result.employees || [];
            reportLeaves = result.leaves || [];
            populateEmployeeDropdown();
            renderReports();
            return;
        }
    } catch (_) { }

    // Graceful fallback if getBranchReports is not yet active on Google Apps Script
    try {
        const [bootRes, pendingRes] = await Promise.all([
            fetch(`${API_URL}?action=getBootstrap`).then(res => res.json()),
            fetch(`${API_URL}?action=getPendingLeaveRequests&branch=${encodeURIComponent(adminBranch)}`).then(res => res.json())
        ]);

        if (bootRes && bootRes.ok) {
            const branchEmps = (bootRes.employees || []).filter(e =>
                String(e.branch || '').trim().toLowerCase() === adminBranch.toLowerCase()
            );
            reportEmployees = branchEmps.map(e => ({
                name: e.name,
                branch: e.branch,
                role: e.role || 'Employee',
                earnedLeave: e.earned_leave ? Number(e.earned_leave) : null
            }));
        }

        if (pendingRes && pendingRes.ok) {
            reportLeaves = pendingRes.requests || [];
        }

        populateEmployeeDropdown();
        renderReports();
    } catch (_) { }
}

function populateEmployeeDropdown() {
    const sel = $('reportEmployeeFilter');
    if (!sel) return;
    const currentVal = sel.value || 'all';

    sel.innerHTML = `<option value="all">All Employees (${reportEmployees.length})</option>` +
        reportEmployees.map(e => `<option value="${e.name}">${e.name}</option>`).join('');

    if (reportEmployees.some(e => e.name === currentVal)) {
        sel.value = currentVal;
    } else {
        sel.value = 'all';
    }
}

/* ── Render Reports ── */
function renderReports() {
    const filteredLeaves = getFilteredLeaves();
    const filteredEmps = getFilteredEmployees();
    const empBalances = computeEmployeeBalances(filteredEmps, reportLeaves, reportFilter);

    renderReportKpis(empBalances, filteredLeaves);
    renderBalancesTable(empBalances);
    renderHistoryTable(filteredLeaves);
    updateReportTableCount();
}

function renderReportKpis(empBalances, filteredLeaves) {
    // 1. Employees Count
    $('kpiBranchEmployees').textContent = String(empBalances.length);

    // 2. Leave Applications
    $('kpiBranchLeaves').textContent = String(filteredLeaves.length);
    const pendingCount = filteredLeaves.filter(l => String(l.status || '').trim().toLowerCase() === 'pending').length;
    $('kpiBranchLeavesSub').textContent = pendingCount > 0 ? `${pendingCount} pending approval` : 'All reviewed';

    // 3. Days Deducted (Approved in this period)
    const approved = filteredLeaves.filter(l => String(l.status || '').trim().toLowerCase() === 'approved');
    const usage = calcLeaveUsage(approved);
    $('kpiBranchDaysDeducted').textContent = fmtDays(usage.used);

    // 4. Half / Early Leaves
    $('kpiBranchHalfEarly').textContent = `${usage.halfDay} / ${usage.earlyCount}`;
    $('kpiBranchHalfEarlySub').textContent = `${usage.halfDay} half-day · ${usage.earlyCount} early (${usage.earlyFree} free)`;

    // 5. Remaining Quota
    let totalAllotted = 0;
    let totalRemaining = 0;
    let quotaCount = 0;
    empBalances.forEach(e => {
        if (e.allotted !== null) {
            totalAllotted += e.allotted;
            totalRemaining += (e.remaining !== null ? e.remaining : 0);
            quotaCount++;
        }
    });

    if (quotaCount > 0) {
        $('kpiBranchQuotaLeft').textContent = fmtDays(totalRemaining);
        $('kpiBranchQuotaSub').textContent = `of ${fmtDays(totalAllotted)} total quota (${quotaCount} staff)`;
    } else {
        $('kpiBranchQuotaLeft').textContent = '—';
        $('kpiBranchQuotaSub').textContent = 'No quota set in sheet';
    }
}

function renderBalancesTable(empBalances) {
    const tbody = $('reportBalancesBody');
    if (!empBalances.length) {
        tbody.innerHTML = `
        <tr>
            <td colspan="12" style="text-align:center;padding:36px 16px;color:var(--muted)">
                No employees found matching the criteria.
            </td>
        </tr>`;
        return;
    }

    tbody.innerHTML = empBalances.map((emp, i) => {
        let balanceBadge = `<span class="badge-balance-good">${fmtDays(emp.remaining)}d</span>`;
        if (emp.remaining === null) {
            balanceBadge = `<span style="color:var(--muted);font-family:'DM Mono',monospace">—</span>`;
        } else if (emp.remaining <= 0) {
            balanceBadge = `<span class="badge-balance-empty">0d</span>`;
        } else if (emp.remaining <= 5) {
            balanceBadge = `<span class="badge-balance-low">${fmtDays(emp.remaining)}d</span>`;
        }

        const pendingChip = emp.pendingCount > 0
            ? `<span class="cell-badge badge-amber">${emp.pendingCount} pending</span>`
            : `<span style="color:var(--muted);font-size:11px">—</span>`;

        return `
        <tr>
            <td style="color:var(--muted);font-family:'DM Mono',monospace;font-size:11px">${i + 1}</td>
            <td>
                <strong style="color:var(--ink);font-size:13px;display:block">${emp.name}</strong>
            </td>
            <td style="font-family:'DM Mono',monospace;font-size:11px;color:var(--muted)">${emp.role}</td>
            <td style="font-family:'DM Mono',monospace;font-weight:600">${emp.allotted !== null ? `${emp.allotted}d` : '—'}</td>
            <td style="font-family:'DM Mono',monospace;font-weight:700;color:#c1554a">${fmtDays(emp.allTimeUsed)}d</td>
            <td>${balanceBadge}</td>
            <td style="font-family:'DM Mono',monospace">${emp.medicalDays ? `${emp.medicalDays}d` : '0'}</td>
            <td style="font-family:'DM Mono',monospace">${emp.personalDays ? `${emp.personalDays}d` : '0'}</td>
            <td style="font-family:'DM Mono',monospace">${emp.halfDays ? `${emp.halfDays} (${fmtDays(emp.halfDays * 0.5)}d)` : '0'}</td>
            <td style="font-family:'DM Mono',monospace">${emp.earlyCount ? `${emp.earlyCount} (${emp.earlyFree} free, ${fmtDays(emp.earlyDeducted)}d)` : '0'}</td>
            <td>${pendingChip}</td>
            <td style="text-align:right">
                <button class="btn-view-emp-log" type="button" data-emp="${emp.name}" title="View ${emp.name}'s leave history">
                    VIEW LOGS →
                </button>
            </td>
        </tr>`;
    }).join('');

    tbody.querySelectorAll('.btn-view-emp-log').forEach(btn => {
        btn.addEventListener('click', () => {
            const empName = btn.dataset.emp;
            reportFilter.employee = empName;
            $('reportEmployeeFilter').value = empName;
            // Switch to History sub-tab
            $('subtabHistory').click();
            renderReports();
        });
    });
}

function renderHistoryTable(leaves) {
    const tbody = $('reportHistoryBody');
    if (!leaves.length) {
        tbody.innerHTML = `
        <tr>
            <td colspan="9" style="text-align:center;padding:36px 16px;color:var(--muted)">
                No leave records found matching the current filters.
            </td>
        </tr>`;
        return;
    }

    tbody.innerHTML = leaves.map((r, i) => {
        const days = leaveDayCount(r.fromDate, r.toDate);
        const s = String(r.status || '').trim().toLowerCase();
        let statusBadge = '<span class="cell-badge badge-amber">PENDING</span>';
        if (s === 'approved') statusBadge = '<span class="cell-badge" style="background:#e6f5ec;color:#2e7d53;border:1px solid #7fbd9a">APPROVED</span>';
        if (s === 'rejected') statusBadge = '<span class="cell-badge badge-coral">REJECTED</span>';

        const type = String(r.leaveType || 'Leave').trim();
        let typeBadge = `<span class="cell-badge badge-amber">${type}</span>`;
        if (type.toLowerCase() === 'medical purpose') typeBadge = `<span class="cell-badge badge-navy">${type}</span>`;
        if (type.toLowerCase() === 'personal leave') typeBadge = `<span class="cell-badge" style="background:#e8f5ee;color:#2e7a56;border:1px solid #96ccb0">${type}</span>`;
        if (type.toLowerCase() === 'early leave') typeBadge = `<span class="cell-badge" style="background:#f0eef8;color:#6a5fa0;border:1px solid #b8b0de">${type}</span>`;

        const reviewInfo = r.reviewedBy
            ? `<span style="display:block;font-size:10px;color:var(--muted);margin-top:2px">by ${r.reviewedBy}</span>`
            : '';

        return `
        <tr>
            <td style="color:var(--muted);font-family:'DM Mono',monospace;font-size:11px">${i + 1}</td>
            <td>
                <strong style="color:var(--ink);font-size:13px">${r.employee}</strong>
            </td>
            <td>${typeBadge}</td>
            <td style="font-family:'DM Mono',monospace;font-size:11px">${fmtShortDate(r.fromDate)}</td>
            <td style="font-family:'DM Mono',monospace;font-size:11px">${fmtShortDate(r.toDate)}</td>
            <td>
                <strong style="font-family:'Space Grotesk',sans-serif;font-size:13px">${days}d</strong>
                ${r.leaveTime ? `<span style="display:block;font-size:10px;color:var(--muted);font-family:'DM Mono',monospace">${fmtLeaveTime(r.leaveTime)}</span>` : ''}
            </td>
            <td style="font-size:11.5px;max-width:240px;color:var(--ink);line-height:1.4">${r.reason || '—'}</td>
            <td>${statusBadge}</td>
            <td style="font-size:11px;color:var(--ink)">
                ${r.reviewedBy || '—'}
                ${reviewInfo}
            </td>
        </tr>`;
    }).join('');
}

function updateReportTableCount() {
    const el = $('reportTableCount');
    if (!el) return;
    if (currentSubTab === 'balances') {
        const emps = getFilteredEmployees();
        el.textContent = `${emps.length} employee${emps.length === 1 ? '' : 's'} in ${adminBranch || 'branch'}`;
    } else {
        const leaves = getFilteredLeaves();
        el.textContent = `${leaves.length} leave record${leaves.length === 1 ? '' : 's'}`;
    }
}

/* ════════════════════════════════════════════════════════════════════
   FILTER EVENT LISTENERS
   ════════════════════════════════════════════════════════════════════ */
$('reportEmployeeFilter').addEventListener('change', e => {
    reportFilter.employee = e.target.value;
    updateActiveFilterLabel();
    renderReports();
});

$('reportTypeFilter').addEventListener('change', e => {
    reportFilter.leaveType = e.target.value;
    updateActiveFilterLabel();
    renderReports();
});

$('reportStatusFilter').addEventListener('change', e => {
    reportFilter.status = e.target.value;
    updateActiveFilterLabel();
    renderReports();
});

$('reportSearchInput').addEventListener('input', e => {
    reportFilter.search = e.target.value.trim();
    renderReports();
});

function getWeekRange() {
    const now = new Date();
    const day = now.getDay();
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

document.querySelectorAll('.filter-btn[data-report-range]').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-btn[data-report-range]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const range = btn.dataset.reportRange;
        reportFilter.rangeType = range;
        if (range === 'all') {
            reportFilter.from = null;
            reportFilter.to = null;
            $('reportDateFrom').value = '';
            $('reportDateTo').value = '';
        } else if (range === 'thisweek') {
            const { from, to } = getWeekRange();
            reportFilter.from = from;
            reportFilter.to = to;
            $('reportDateFrom').value = from;
            $('reportDateTo').value = to;
        } else if (range === 'thismonth') {
            const { from, to } = getMonthRange();
            reportFilter.from = from;
            reportFilter.to = to;
            $('reportDateFrom').value = from;
            $('reportDateTo').value = to;
        }
        updateActiveFilterLabel();
        renderReports();
    });
});

$('reportApplyRange').addEventListener('click', () => {
    const from = $('reportDateFrom').value;
    const to = $('reportDateTo').value;
    if (!from && !to) return;
    document.querySelectorAll('.filter-btn[data-report-range]').forEach(b => b.classList.remove('active'));
    reportFilter.rangeType = 'custom';
    reportFilter.from = from || null;
    reportFilter.to = to || null;
    updateActiveFilterLabel();
    renderReports();
});

function updateActiveFilterLabel() {
    const el = $('reportActiveFilterText');
    if (!el) return;

    const parts = [];
    if (reportFilter.employee !== 'all') parts.push(`Emp: ${reportFilter.employee}`);
    if (reportFilter.rangeType === 'thisweek') parts.push('This Week');
    else if (reportFilter.rangeType === 'thismonth') parts.push('This Month');
    else if (reportFilter.rangeType === 'custom') parts.push(`${reportFilter.from || 'start'} to ${reportFilter.to || 'now'}`);
    if (reportFilter.leaveType !== 'all') parts.push(`Type: ${reportFilter.leaveType}`);
    if (reportFilter.status !== 'all') parts.push(`Status: ${reportFilter.status}`);

    el.textContent = parts.length ? `Filters: ${parts.join(' · ')}` : 'Showing all branch records';
}

/* ════════════════════════════════════════════════════════════════════
   EXCEL EXPORT (.xlsx)
   ════════════════════════════════════════════════════════════════════ */
$('reportExportBtn').addEventListener('click', () => {
    if (typeof XLSX === 'undefined') {
        showToast('Excel exporter is loading. Try again in a moment.');
        return;
    }

    const filteredLeaves = getFilteredLeaves();
    const filteredEmps = getFilteredEmployees();
    const empBalances = computeEmployeeBalances(filteredEmps, reportLeaves, reportFilter);

    // Sheet 1: Leave Balances
    const balancesData = empBalances.map((e, idx) => ({
        'SL': idx + 1,
        'Employee Name': e.name,
        'Role': e.role,
        'Branch': e.branch,
        'Allotted Earned Leave': e.allotted !== null ? e.allotted : 'N/A',
        'Total Days Used': e.allTimeUsed,
        'Remaining Balance': e.remaining !== null ? e.remaining : 'N/A',
        'Medical (Days)': e.medicalDays,
        'Personal (Days)': e.personalDays,
        'Half Day (Count)': e.halfDays,
        'Early Leave (Count)': e.earlyCount,
        'Early Leave Free': e.earlyFree,
        'Early Leave Deducted (Days)': e.earlyDeducted,
        'Pending Requests': e.pendingCount
    }));

    // Sheet 2: Leave History Log
    const historyData = filteredLeaves.map((l, idx) => ({
        'SL': idx + 1,
        'Employee Name': l.employee,
        'Branch': l.branch,
        'Leave Type': l.leaveType,
        'From Date': l.fromDate,
        'To Date': l.toDate,
        'Days Count': leaveDayCount(l.fromDate, l.toDate),
        'Leave Time': l.leaveTime || '',
        'Reason': l.reason || '',
        'Status': l.status,
        'Reviewed By': l.reviewedBy || '',
        'Applied At': l.appliedAt || ''
    }));

    const wb = XLSX.utils.book_new();

    const wsBalances = XLSX.utils.json_to_sheet(balancesData);
    XLSX.utils.book_append_sheet(wb, wsBalances, 'Leave Balances');

    const wsHistory = XLSX.utils.json_to_sheet(historyData);
    XLSX.utils.book_append_sheet(wb, wsHistory, 'Leave History Log');

    const now = new Date();
    const dateStamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    const branchName = adminBranch.replace(/\s+/g, '_') || 'Branch';
    const fileName = `ATTENZA_${branchName}_Leave_Report_${dateStamp}.xlsx`;

    XLSX.writeFile(wb, fileName);
    showToast(`Excel report downloaded: ${fileName}`, true);
});

/* ════════════════════════════════════════════════════════════════════
   SIGN OUT
   ════════════════════════════════════════════════════════════════════ */
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
        } catch (_) { }
    } else {
        await speechPromise;
    }
    try { sessionStorage.removeItem('attenza_signin'); } catch (_) { }
    window.location.href = 'index.html';
});

/* ════════════════════════════════════════════════════════════════════
   INITIALIZATION & POLLING
   ════════════════════════════════════════════════════════════════════ */
if (isAdmin) {
    loadRequests();
    loadLeaveRequests();
    loadBranchReports();

    setInterval(() => {
        if (currentView === 'requests') {
            loadRequests();
            loadLeaveRequests();
        }
    }, 5000);
}

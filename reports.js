/**
 * ATTENZA — Smart Reports Engine (All Branches Analytics Hub)
 *
 * • Cross-branch workforce analytics & comparisons
 * • Employee Leave Quotas & Balances across all branches
 * • Master Leave History Logs
 * • Attendance & Sign-in Activity Logs
 * • Smart Automated Insights & Quota Depletion Alerts
 * • Enterprise Multi-Sheet Excel (.xlsx) Exporter
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

// Display Date
$('today').textContent = new Intl.DateTimeFormat('en-GB', {
    weekday: 'short', day: '2-digit', month: 'short', year: 'numeric'
}).format(new Date()).toUpperCase();

let record = null;
try {
    const raw = sessionStorage.getItem('attenza_signin');
    record = raw ? JSON.parse(raw) : null;
} catch (_) { record = null; }

const isAdmin = record && String(record.role || '').trim().toLowerCase() === 'admin';
if (!record) {
    window.location.href = 'index.html';
}

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

function fmtAttendanceTime(value) {
    if (!value || value === '—' || value === '-') return '—';
    const str = String(value).trim();
    if (!str) return '—';

    // 12-hour format with AM/PM (e.g. "09:54 pm", "9:54 PM")
    const m12 = str.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*([aApP][mM])$/i);
    if (m12) {
        const hh = String(m12[1]).padStart(2, '0');
        const mm = m12[2];
        const ampm = m12[3].toUpperCase();
        return `${hh}:${mm} ${ampm}`;
    }

    // 24-hour format (e.g. "21:54" or "09:54")
    const m24 = str.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
    if (m24) {
        const h = parseInt(m24[1], 10);
        const mm = m24[2];
        const ampm = h >= 12 ? 'PM' : 'AM';
        const h12 = h % 12 || 12;
        return `${String(h12).padStart(2, '0')}:${mm} ${ampm}`;
    }

    // Full Date / ISO timestamp
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

function getTodayDateStr() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/* ════════════════════════════════════════════════════════════════════
   GLOBAL DATA STORE & FILTERS
   ════════════════════════════════════════════════════════════════════ */
let allBranches = [];
let allEmployees = [];
let allLeaves = [];
let allAttendance = [];

const smartFilter = {
    branch: 'all',
    employee: 'all',
    rangeType: 'all',
    from: null,
    to: null,
    leaveType: 'all',
    status: 'all',
    search: ''
};

let activeTab = 'branches'; // 'branches' | 'balances' | 'history' | 'attendance' | 'insights'

/* ════════════════════════════════════════════════════════════════════
   LEAVE CALCULATION ENGINE (ATTENZA RULES)
   ════════════════════════════════════════════════════════════════════ */
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

function filterAttendanceByDate(attList, filter) {
    if (filter.rangeType === 'all' || (!filter.from && !filter.to)) return attList;

    const from = filter.from, to = filter.to;
    return attList.filter(a => {
        const d = toDateOnly(a.date);
        return (!from || d >= from) && (!to || d <= to);
    });
}

/* ════════════════════════════════════════════════════════════════════
   FILTERED DATA ACCESSORS
   ════════════════════════════════════════════════════════════════════ */
function getFilteredLeaves() {
    let result = allLeaves.slice();

    // Branch filter
    if (smartFilter.branch !== 'all') {
        const targetB = smartFilter.branch.toLowerCase();
        result = result.filter(r => String(r.branch || '').trim().toLowerCase() === targetB);
    }

    // Employee filter
    if (smartFilter.employee !== 'all') {
        const targetEmp = smartFilter.employee.toLowerCase();
        result = result.filter(r => String(r.employee || '').trim().toLowerCase() === targetEmp);
    }

    // Date range filter
    result = filterLeavesByDate(result, smartFilter);

    // Leave type filter
    if (smartFilter.leaveType !== 'all') {
        const targetType = smartFilter.leaveType.toLowerCase();
        result = result.filter(r => String(r.leaveType || '').trim().toLowerCase() === targetType);
    }

    // Status filter
    if (smartFilter.status !== 'all') {
        const targetStatus = smartFilter.status.toLowerCase();
        result = result.filter(r => String(r.status || '').trim().toLowerCase() === targetStatus);
    }

    // Search query
    if (smartFilter.search) {
        const q = smartFilter.search.toLowerCase();
        result = result.filter(r =>
            String(r.employee || '').toLowerCase().includes(q) ||
            String(r.branch || '').toLowerCase().includes(q) ||
            String(r.reason || '').toLowerCase().includes(q) ||
            String(r.leaveType || '').toLowerCase().includes(q) ||
            String(r.status || '').toLowerCase().includes(q)
        );
    }

    return result;
}

function getFilteredEmployees() {
    let list = allEmployees.slice();

    if (smartFilter.branch !== 'all') {
        const targetB = smartFilter.branch.toLowerCase();
        list = list.filter(e => String(e.branch || '').trim().toLowerCase() === targetB);
    }

    if (smartFilter.employee !== 'all') {
        const targetEmp = smartFilter.employee.toLowerCase();
        list = list.filter(e => String(e.name || '').trim().toLowerCase() === targetEmp);
    }

    if (smartFilter.search) {
        const q = smartFilter.search.toLowerCase();
        list = list.filter(e =>
            String(e.name || '').toLowerCase().includes(q) ||
            String(e.branch || '').toLowerCase().includes(q) ||
            String(e.role || '').toLowerCase().includes(q)
        );
    }

    return list;
}

function getFilteredAttendance() {
    let list = allAttendance.slice();

    if (smartFilter.branch !== 'all') {
        const targetB = smartFilter.branch.toLowerCase();
        list = list.filter(a => String(a.branch || '').trim().toLowerCase() === targetB);
    }

    if (smartFilter.employee !== 'all') {
        const targetEmp = smartFilter.employee.toLowerCase();
        list = list.filter(a => String(a.employee || '').trim().toLowerCase() === targetEmp);
    }

    list = filterAttendanceByDate(list, smartFilter);

    if (smartFilter.search) {
        const q = smartFilter.search.toLowerCase();
        list = list.filter(a =>
            String(a.employee || '').toLowerCase().includes(q) ||
            String(a.branch || '').toLowerCase().includes(q) ||
            String(a.type || '').toLowerCase().includes(q) ||
            String(a.status || '').toLowerCase().includes(q)
        );
    }

    return list;
}

function computeAllEmployeeBalances(employees, leaves, filter) {
    return employees.map(emp => {
        const empName = emp.name;
        const empLeaves = leaves.filter(l => String(l.employee || '').trim().toLowerCase() === empName.toLowerCase());

        // Approved in period
        const approvedInPeriod = filterLeavesByDate(
            empLeaves.filter(l => String(l.status || '').trim().toLowerCase() === 'approved'),
            filter
        );
        const usage = calcLeaveUsage(approvedInPeriod);

        // All time approved
        const allTimeApproved = empLeaves.filter(l => String(l.status || '').trim().toLowerCase() === 'approved');
        const allTimeUsage = calcLeaveUsage(allTimeApproved);

        const pendingCount = empLeaves.filter(l => String(l.status || '').trim().toLowerCase() === 'pending').length;

        const allotted = emp.earnedLeave !== null && emp.earnedLeave !== undefined ? Number(emp.earnedLeave) : null;
        const remaining = allotted !== null ? Math.max(0, allotted - allTimeUsage.used) : null;

        return {
            name: emp.name,
            role: emp.role || 'Employee',
            branch: emp.branch || 'Unknown',
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

/* ════════════════════════════════════════════════════════════════════
   DATA LOADING (FAST API + FALLBACK)
   ════════════════════════════════════════════════════════════════════ */
async function loadSmartReportsData() {
    const btn = $('btnRefreshData');
    if (btn) btn.disabled = true;

    try {
        const r = await fetch(`${API_URL}?action=getSmartReports`);
        const result = await r.json();
        if (result && result.ok) {
            allBranches = result.branches || [];
            allEmployees = result.employees || [];
            allLeaves = result.leaves || [];
            allAttendance = result.attendance || [];
            populateBranchSelector();
            populateEmployeeSelector();
            renderAllSmartReports();
            return;
        }
    } catch (_) { }

    // Fallback: load bootstrap + pending
    try {
        const [bootRes, pendingRes] = await Promise.all([
            fetch(`${API_URL}?action=getBootstrap`).then(res => res.json()),
            fetch(`${API_URL}?action=getPendingRequests`).then(res => res.json())
        ]);

        if (bootRes && bootRes.ok) {
            allBranches = bootRes.branches || [];
            allEmployees = (bootRes.employees || []).map(e => ({
                name: e.name,
                branch: e.branch,
                role: e.role || 'Employee',
                earnedLeave: e.earned_leave ? Number(e.earned_leave) : null
            }));
        }

        if (pendingRes && pendingRes.ok) {
            allLeaves = pendingRes.requests || [];
        }

        populateBranchSelector();
        populateEmployeeSelector();
        renderAllSmartReports();
    } catch (_) {
        showToast('Unable to sync with database. Showing cached records.');
    } finally {
        if (btn) btn.disabled = false;
    }
}

function populateBranchSelector() {
    const sel = $('globalBranchFilter');
    if (!sel) return;
    const currentVal = sel.value || 'all';

    // Unique list of branches from GPS + Employees
    const branchSet = new Set();
    allBranches.forEach(b => { if (b.branch) branchSet.add(b.branch); });
    allEmployees.forEach(e => { if (e.branch) branchSet.add(e.branch); });

    const branchesArr = Array.from(branchSet).sort();

    sel.innerHTML = `<option value="all">ALL BRANCHES (${branchesArr.length})</option>` +
        branchesArr.map(b => `<option value="${b}">${b.toUpperCase()}</option>`).join('');

    if (branchesArr.includes(currentVal)) {
        sel.value = currentVal;
    } else {
        sel.value = 'all';
    }
}

function populateEmployeeSelector() {
    const sel = $('filterEmployee');
    if (!sel) return;
    const currentVal = sel.value || 'all';

    let emps = allEmployees;
    if (smartFilter.branch !== 'all') {
        emps = emps.filter(e => String(e.branch || '').toLowerCase() === smartFilter.branch.toLowerCase());
    }

    sel.innerHTML = `<option value="all">All Employees (${emps.length})</option>` +
        emps.map(e => `<option value="${e.name}">${e.name} (${e.branch})</option>`).join('');

    if (emps.some(e => e.name === currentVal)) {
        sel.value = currentVal;
    } else {
        sel.value = 'all';
    }
}

/* ════════════════════════════════════════════════════════════════════
   RENDER ENGINE
   ════════════════════════════════════════════════════════════════════ */
function renderAllSmartReports() {
    const filteredLeaves = getFilteredLeaves();
    const filteredEmps = getFilteredEmployees();
    const filteredAtt = getFilteredAttendance();
    const empBalances = computeAllEmployeeBalances(filteredEmps, allLeaves, smartFilter);

    renderHeroKpis(empBalances, filteredLeaves, filteredAtt);
    renderBranchComparisonTab(empBalances, allLeaves, allAttendance);
    renderBalancesTab(empBalances);
    renderHistoryTab(filteredLeaves);
    renderAttendanceTab(filteredAtt);
    renderInsightsTab(empBalances, filteredLeaves, filteredAtt);
    updateTabBadges(empBalances, filteredLeaves, filteredAtt);
}

/* ── Hero KPI Cards ── */
function renderHeroKpis(empBalances, filteredLeaves, filteredAtt) {
    // 1. Total Workforce
    $('kpiTotalWorkforce').textContent = String(empBalances.length);
    const branchCount = new Set(empBalances.map(e => e.branch)).size;
    $('kpiTotalWorkforceSub').textContent = smartFilter.branch === 'all'
        ? `Across ${branchCount} branch${branchCount === 1 ? '' : 'es'}`
        : `Assigned to ${smartFilter.branch}`;

    // 2. Today's Attendance Pulse
    const todayStr = getTodayDateStr();
    const todaySignIns = new Set(
        allAttendance
            .filter(a => toDateOnly(a.date) === todayStr && (String(a.type || '').toLowerCase().includes('in') || a.status === 'Approved'))
            .map(a => a.employee)
    );
    const presentCount = empBalances.filter(e => todaySignIns.has(e.name)).length;
    const attPct = empBalances.length > 0 ? Math.round((presentCount / empBalances.length) * 100) : 0;
    $('kpiAttendanceRate').textContent = `${presentCount} / ${empBalances.length}`;
    $('kpiAttendanceRateSub').textContent = `${attPct}% workforce present today`;

    // 3. Days Deducted
    const approvedLeaves = filteredLeaves.filter(l => String(l.status || '').trim().toLowerCase() === 'approved');
    const usage = calcLeaveUsage(approvedLeaves);
    $('kpiDaysDeducted').textContent = fmtDays(usage.used);
    $('kpiDaysDeductedSub').textContent = `${usage.halfDay} half · ${usage.earlyCount} early (${usage.earlyFree} free)`;

    // 4. Pending Requests
    const pendingCount = filteredLeaves.filter(l => String(l.status || '').trim().toLowerCase() === 'pending').length;
    $('kpiPendingRequests').textContent = String(pendingCount);
    $('kpiPendingRequestsSub').textContent = pendingCount > 0 ? 'Action required by admin' : 'All requests reviewed';

    // 5. Total Remaining Quota
    let totalAllotted = 0;
    let totalRemaining = 0;
    let staffWithQuota = 0;
    empBalances.forEach(e => {
        if (e.allotted !== null) {
            totalAllotted += e.allotted;
            totalRemaining += (e.remaining !== null ? e.remaining : 0);
            staffWithQuota++;
        }
    });

    if (staffWithQuota > 0) {
        $('kpiTotalQuotaLeft').textContent = fmtDays(totalRemaining);
        $('kpiTotalQuotaLeftSub').textContent = `of ${fmtDays(totalAllotted)} total quota (${staffWithQuota} staff)`;
    } else {
        $('kpiTotalQuotaLeft').textContent = '—';
        $('kpiTotalQuotaLeftSub').textContent = 'No quota set in sheet';
    }
}

/* ── TAB 1: Branch Comparison & Overview ── */
function renderBranchComparisonTab(empBalances, leaves, attendance) {
    const container = $('branchCardsContainer');
    if (!container) return;

    // Group by branch
    const branchMap = {};
    allEmployees.forEach(e => {
        const b = e.branch || 'Unassigned';
        if (!branchMap[b]) {
            branchMap[b] = { branch: b, employees: [], leaves: [], attendance: [] };
        }
        branchMap[b].employees.push(e);
    });

    // Match leaves to branch
    leaves.forEach(l => {
        const b = l.branch || 'Unassigned';
        if (!branchMap[b]) {
            branchMap[b] = { branch: b, employees: [], leaves: [], attendance: [] };
        }
        branchMap[b].leaves.push(l);
    });

    const branchesList = Object.values(branchMap).sort((a, b) => a.branch.localeCompare(b.branch));

    if (!branchesList.length) {
        container.innerHTML = `
        <div class="empty-wrap" style="grid-column:1/-1">
            <div class="e-icon">•</div>
            <p class="e-title">No branches found</p>
            <p class="e-sub">Add branch locations in Google Sheets GPS sheet.</p>
        </div>`;
        return;
    }

    const todayStr = getTodayDateStr();

    container.innerHTML = branchesList.map(b => {
        const emps = b.employees;
        const bBalances = computeAllEmployeeBalances(emps, leaves, smartFilter);

        let totalQuota = 0, quotaLeft = 0;
        bBalances.forEach(e => {
            if (e.allotted !== null) {
                totalQuota += e.allotted;
                quotaLeft += (e.remaining !== null ? e.remaining : 0);
            }
        });

        // Today's present in this branch
        const todayPresent = emps.filter(e =>
            attendance.some(a => a.employee === e.name && toDateOnly(a.date) === todayStr)
        ).length;

        const approvedLeaves = b.leaves.filter(l => String(l.status || '').trim().toLowerCase() === 'approved');
        const usage = calcLeaveUsage(approvedLeaves);
        const pendingCount = b.leaves.filter(l => String(l.status || '').trim().toLowerCase() === 'pending').length;

        const isCurrentFilter = smartFilter.branch.toLowerCase() === b.branch.toLowerCase();

        return `
        <div class="b-card" data-branch="${b.branch}" style="${isCurrentFilter ? 'border-color:var(--navy);box-shadow:0 0 0 2px var(--navy)' : ''}">
            <div class="b-card-head">
                <h3 class="b-card-title">${b.branch.toUpperCase()}</h3>
                <span class="chip-branch">${emps.length} STAFF</span>
            </div>
            <div class="b-card-meta">
                <div class="b-meta-box">
                    <p class="b-meta-lbl">TODAY'S PRESENT</p>
                    <p class="b-meta-val" style="color:#2e7d53">${todayPresent} / ${emps.length}</p>
                </div>
                <div class="b-meta-box">
                    <p class="b-meta-lbl">DAYS DEDUCTED</p>
                    <p class="b-meta-val" style="color:#c1554a">${fmtDays(usage.used)}d</p>
                </div>
                <div class="b-meta-box">
                    <p class="b-meta-lbl">QUOTA REMAINING</p>
                    <p class="b-meta-val" style="color:#3b4895">${totalQuota > 0 ? `${fmtDays(quotaLeft)}d` : '—'}</p>
                </div>
                <div class="b-meta-box">
                    <p class="b-meta-lbl">PENDING REQUESTS</p>
                    <p class="b-meta-val" style="color:${pendingCount > 0 ? '#b8863a' : 'var(--muted)'}">${pendingCount}</p>
                </div>
            </div>
            <div class="b-card-foot">
                <span>Click to filter branch records</span>
                <button class="btn-drilldown" type="button">SELECT →</button>
            </div>
        </div>`;
    }).join('');

    container.querySelectorAll('.b-card').forEach(card => {
        card.addEventListener('click', () => {
            const b = card.dataset.branch;
            smartFilter.branch = b;
            $('globalBranchFilter').value = b;
            populateEmployeeSelector();
            updateFilterSummaryLabel();
            renderAllSmartReports();
            showToast(`Filtered to ${b.toUpperCase()} branch.`);
        });
    });
}

/* ── TAB 2: Employee Leave Balances ── */
function renderBalancesTab(empBalances) {
    const tbody = $('bodyBalances');
    if (!tbody) return;

    if (!empBalances.length) {
        tbody.innerHTML = `
        <tr>
            <td colspan="13" class="empty-wrap">
                <div class="e-icon">•</div>
                <p class="e-title">No employees found</p>
                <p class="e-sub">Try selecting another branch or clearing the search query.</p>
            </td>
        </tr>`;
        return;
    }

    tbody.innerHTML = empBalances.map((emp, idx) => {
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
            <td style="color:var(--muted);font-family:'DM Mono',monospace;font-size:11px">${idx + 1}</td>
            <td>
                <strong style="color:var(--ink);font-size:13px;display:block">${emp.name}</strong>
            </td>
            <td><span class="chip-branch">${emp.branch}</span></td>
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
                <button class="btn-drilldown btn-view-emp-history" type="button" data-emp="${emp.name}" data-branch="${emp.branch}">
                    HISTORY →
                </button>
            </td>
        </tr>`;
    }).join('');

    tbody.querySelectorAll('.btn-view-emp-history').forEach(btn => {
        btn.addEventListener('click', () => {
            const empName = btn.dataset.emp;
            smartFilter.employee = empName;
            $('filterEmployee').value = empName;
            switchTab('history');
            renderAllSmartReports();
        });
    });
}

/* ── TAB 3: Master Leave History Log ── */
function renderHistoryTab(leaves) {
    const tbody = $('bodyHistory');
    if (!tbody) return;

    if (!leaves.length) {
        tbody.innerHTML = `
        <tr>
            <td colspan="11" class="empty-wrap">
                <div class="e-icon">•</div>
                <p class="e-title">No leave records found</p>
                <p class="e-sub">No leave applications match the selected timeframe and filters.</p>
            </td>
        </tr>`;
        return;
    }

    tbody.innerHTML = leaves.map((r, idx) => {
        const days = leaveDayCount(r.fromDate, r.toDate);
        const s = String(r.status || '').trim().toLowerCase();
        let statusBadge = '<span class="cell-badge badge-amber">PENDING</span>';
        if (s === 'approved') statusBadge = '<span class="cell-badge" style="background:#e6f5ec;color:#2e7d53;border:1px solid #7fbd9a">APPROVED</span>';
        if (s === 'rejected') statusBadge = '<span class="cell-badge badge-coral">REJECTED</span>';

        const type = String(r.leaveType || 'Leave').trim();
        let typeBadge = `<span class="chip-type">${type}</span>`;
        if (type.toLowerCase() === 'medical purpose') typeBadge = `<span class="chip-type chip-medical">${type}</span>`;
        if (type.toLowerCase() === 'personal leave') typeBadge = `<span class="chip-type chip-personal">${type}</span>`;
        if (type.toLowerCase() === 'half day') typeBadge = `<span class="chip-type chip-halfday">${type}</span>`;
        if (type.toLowerCase() === 'early leave') typeBadge = `<span class="chip-type chip-early">${type}</span>`;

        return `
        <tr>
            <td style="color:var(--muted);font-family:'DM Mono',monospace;font-size:11px">${idx + 1}</td>
            <td>
                <strong style="color:var(--ink);font-size:13px">${r.employee}</strong>
            </td>
            <td><span class="chip-branch">${r.branch || '—'}</span></td>
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
                ${r.reviewedAt ? `<span style="display:block;font-size:10px;color:var(--muted)">${fmtShortDate(r.reviewedAt)}</span>` : ''}
            </td>
            <td style="font-size:10px;color:var(--muted);font-family:'DM Mono',monospace">${fmtShortDate(r.appliedAt)}</td>
        </tr>`;
    }).join('');
}

/* ── TAB 4: Attendance & Sign-In Logs ── */
function renderAttendanceTab(attList) {
    const tbody = $('bodyAttendance');
    if (!tbody) return;

    if (!attList.length) {
        tbody.innerHTML = `
        <tr>
            <td colspan="8" class="empty-wrap">
                <div class="e-icon">•</div>
                <p class="e-title">No attendance records found</p>
                <p class="e-sub">No attendance events recorded in this period.</p>
            </td>
        </tr>`;
        return;
    }

    tbody.innerHTML = attList.map((a, idx) => {
        const typeStr = String(a.type || 'Sign In');
        let statusBadge = '<span class="cell-badge" style="background:#e6f5ec;color:#2e7d53;border:1px solid #7fbd9a">VERIFIED</span>';
        if (String(a.status).toLowerCase() === 'pending') {
            statusBadge = '<span class="cell-badge badge-amber">PENDING APPROVAL</span>';
        } else if (String(a.status).toLowerCase() === 'rejected') {
            statusBadge = '<span class="cell-badge badge-coral">REJECTED</span>';
        }

        const timeDisplay = fmtAttendanceTime(a.time);
        const hasDist = a.distance !== null && a.distance !== undefined && a.distance !== '' && !isNaN(Number(a.distance));
        const distNum = hasDist ? Math.round(Number(a.distance)) : null;
        const hasAcc = a.accuracy !== null && a.accuracy !== undefined && a.accuracy !== '' && !isNaN(Number(a.accuracy));
        const accNum = hasAcc ? Math.round(Number(a.accuracy)) : null;

        const isSignOut = typeStr.toLowerCase().includes('out');
        const typeBadge = isSignOut
            ? `<span class="chip-signout">${typeStr}</span>`
            : `<span class="chip-signin">${typeStr}</span>`;

        return `
        <tr>
            <td style="color:var(--muted);font-family:'DM Mono',monospace;font-size:11px">${idx + 1}</td>
            <td>
                <strong style="color:var(--ink);font-size:13px">${a.employee}</strong>
            </td>
            <td><span class="chip-branch">${a.branch || '—'}</span></td>
            <td style="font-family:'DM Mono',monospace;font-size:11px">${fmtShortDate(a.date)}</td>
            <td style="font-family:'DM Mono',monospace;font-weight:600;color:var(--ink)">${timeDisplay}</td>
            <td>${typeBadge}</td>
            <td style="font-family:'DM Mono',monospace;font-size:11px">
                ${distNum !== null ? `${distNum}m` : '—'}
                ${accNum !== null ? `<span style="font-size:10px;color:var(--muted)"> (±${accNum}m)</span>` : ''}
            </td>
            <td>${statusBadge}</td>
        </tr>`;
    }).join('');
}

/* ── TAB 5: Smart Insights & Automated Alerts ── */
function renderInsightsTab(empBalances, filteredLeaves, attendance) {
    const container = $('insightsContainer');
    if (!container) return;

    const insights = [];

    // Insight 1: Low quota alerts
    const lowQuotaStaff = empBalances.filter(e => e.allotted !== null && e.remaining <= 2 && e.remaining > 0);
    if (lowQuotaStaff.length > 0) {
        insights.push({
            type: 'warning',
            icon: '!',
            title: `Low Leave Quota Alert (${lowQuotaStaff.length} Employees)`,
            desc: `${lowQuotaStaff.map(e => `<strong>${e.name}</strong> (${e.branch}: ${fmtDays(e.remaining)}d remaining)`).join(', ')} are running out of Earned Leave quota.`
        });
    }

    // Insight 2: Exhausted quota alerts
    const exhaustedStaff = empBalances.filter(e => e.allotted !== null && e.remaining <= 0);
    if (exhaustedStaff.length > 0) {
        insights.push({
            type: 'alert',
            icon: '!',
            title: `Earned Leave Quota Exhausted (${exhaustedStaff.length} Employees)`,
            desc: `${exhaustedStaff.map(e => `<strong>${e.name}</strong> (${e.branch})`).join(', ')} have fully utilized their allocated leave quota for the year.`
        });
    }

    // Insight 3: Pending review reminder
    const pendingLeaves = filteredLeaves.filter(l => String(l.status).toLowerCase() === 'pending');
    if (pendingLeaves.length > 0) {
        insights.push({
            type: 'alert',
            icon: '!',
            title: `${pendingLeaves.length} Pending Leave Decisions Waiting`,
            desc: `Staff members have pending leave applications waiting for admin approval across branches. Go to the Admin panel to review.`
        });
    }

    // Insight 4: Frequent Early Leave users
    const earlyUsers = empBalances.filter(e => e.earlyCount >= 3);
    if (earlyUsers.length > 0) {
        insights.push({
            type: 'info',
            icon: 'i',
            title: `Frequent Early Leave Usage (${earlyUsers.length} Staff)`,
            desc: `${earlyUsers.map(e => `<strong>${e.name}</strong> (${e.earlyCount} times, ${fmtDays(e.earlyDeducted)}d deducted)`).join(', ')} have exceeded the 2 free monthly early leaves.`
        });
    }

    // Insight 5: Branch attendance health
    const todayStr = getTodayDateStr();
    const todaySignIns = new Set(
        attendance.filter(a => toDateOnly(a.date) === todayStr).map(a => a.employee)
    );
    const presentCount = empBalances.filter(e => todaySignIns.has(e.name)).length;
    const attPct = empBalances.length > 0 ? Math.round((presentCount / empBalances.length) * 100) : 0;

    insights.push({
        type: attPct >= 80 ? 'success' : 'info',
        icon: 'i',
        title: `Workforce Attendance Health (${attPct}%)`,
        desc: `Today, ${presentCount} of ${empBalances.length} active employees have signed in across all monitored branches.`
    });

    container.innerHTML = insights.map(i => `
    <div class="insight-card i-${i.type}">
        <div class="insight-icon" style="font-weight:bold;font-family:'DM Mono',monospace">${i.icon}</div>
        <div class="insight-content">
            <h4>${i.title}</h4>
            <p>${i.desc}</p>
        </div>
    </div>`).join('');
}

function updateTabBadges(empBalances, filteredLeaves, filteredAtt) {
    const branchCount = new Set(allEmployees.map(e => e.branch)).size;
    $('tabBadgeBranches').textContent = String(branchCount);
    $('tabBadgeBalances').textContent = String(empBalances.length);
    $('tabBadgeHistory').textContent = String(filteredLeaves.length);
    $('tabBadgeAttendance').textContent = String(filteredAtt.length);

    const alertCount = empBalances.filter(e => e.allotted !== null && e.remaining <= 2).length +
        filteredLeaves.filter(l => String(l.status).toLowerCase() === 'pending').length;
    $('tabBadgeInsights').textContent = String(alertCount);
}

/* ════════════════════════════════════════════════════════════════════
   TAB NAVIGATION
   ════════════════════════════════════════════════════════════════════ */
const tabButtons = {
    branches: $('tabBtnBranches'),
    balances: $('tabBtnBalances'),
    history: $('tabBtnHistory'),
    attendance: $('tabBtnAttendance'),
    insights: $('tabBtnInsights')
};

const tabPanels = {
    branches: $('panelBranches'),
    balances: $('panelBalances'),
    history: $('panelHistory'),
    attendance: $('panelAttendance'),
    insights: $('panelInsights')
};

function switchTab(tabKey) {
    activeTab = tabKey;
    Object.keys(tabButtons).forEach(k => {
        if (tabButtons[k]) {
            if (k === tabKey) {
                tabButtons[k].classList.add('active');
                tabButtons[k].setAttribute('aria-selected', 'true');
            } else {
                tabButtons[k].classList.remove('active');
                tabButtons[k].setAttribute('aria-selected', 'false');
            }
        }
        if (tabPanels[k]) {
            tabPanels[k].hidden = (k !== tabKey);
        }
    });
}

Object.keys(tabButtons).forEach(k => {
    if (tabButtons[k]) {
        tabButtons[k].addEventListener('click', () => switchTab(k));
    }
});

/* ════════════════════════════════════════════════════════════════════
   FILTER EVENT LISTENERS
   ════════════════════════════════════════════════════════════════════ */
$('globalBranchFilter').addEventListener('change', e => {
    smartFilter.branch = e.target.value;
    populateEmployeeSelector();
    updateFilterSummaryLabel();
    renderAllSmartReports();
});

$('filterEmployee').addEventListener('change', e => {
    smartFilter.employee = e.target.value;
    updateFilterSummaryLabel();
    renderAllSmartReports();
});

$('filterLeaveType').addEventListener('change', e => {
    smartFilter.leaveType = e.target.value;
    updateFilterSummaryLabel();
    renderAllSmartReports();
});

$('filterStatus').addEventListener('change', e => {
    smartFilter.status = e.target.value;
    updateFilterSummaryLabel();
    renderAllSmartReports();
});

$('filterSearch').addEventListener('input', e => {
    smartFilter.search = e.target.value.trim();
    renderAllSmartReports();
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

function getYearRange() {
    const y = new Date().getFullYear();
    return { from: `${y}-01-01`, to: `${y}-12-31` };
}

document.querySelectorAll('.filter-btn[data-range]').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-btn[data-range]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const range = btn.dataset.range;
        smartFilter.rangeType = range;

        if (range === 'all') {
            smartFilter.from = null;
            smartFilter.to = null;
            $('filterDateFrom').value = '';
            $('filterDateTo').value = '';
        } else if (range === 'today') {
            const t = getTodayDateStr();
            smartFilter.from = t;
            smartFilter.to = t;
            $('filterDateFrom').value = t;
            $('filterDateTo').value = t;
        } else if (range === 'thisweek') {
            const { from, to } = getWeekRange();
            smartFilter.from = from;
            smartFilter.to = to;
            $('filterDateFrom').value = from;
            $('filterDateTo').value = to;
        } else if (range === 'thismonth') {
            const { from, to } = getMonthRange();
            smartFilter.from = from;
            smartFilter.to = to;
            $('filterDateFrom').value = from;
            $('filterDateTo').value = to;
        } else if (range === 'thisyear') {
            const { from, to } = getYearRange();
            smartFilter.from = from;
            smartFilter.to = to;
            $('filterDateFrom').value = from;
            $('filterDateTo').value = to;
        }

        updateFilterSummaryLabel();
        renderAllSmartReports();
    });
});

$('btnApplyCustomDate').addEventListener('click', () => {
    const from = $('filterDateFrom').value;
    const to = $('filterDateTo').value;
    if (!from && !to) return;
    document.querySelectorAll('.filter-btn[data-range]').forEach(b => b.classList.remove('active'));
    smartFilter.rangeType = 'custom';
    smartFilter.from = from || null;
    smartFilter.to = to || null;
    updateFilterSummaryLabel();
    renderAllSmartReports();
});

function updateFilterSummaryLabel() {
    const el = $('smartFilterSummary');
    if (!el) return;

    const parts = [];
    if (smartFilter.branch !== 'all') parts.push(`Branch: ${smartFilter.branch.toUpperCase()}`);
    if (smartFilter.employee !== 'all') parts.push(`Emp: ${smartFilter.employee}`);
    if (smartFilter.rangeType === 'today') parts.push('Today');
    else if (smartFilter.rangeType === 'thisweek') parts.push('This Week');
    else if (smartFilter.rangeType === 'thismonth') parts.push('This Month');
    else if (smartFilter.rangeType === 'thisyear') parts.push('This Year');
    else if (smartFilter.rangeType === 'custom') parts.push(`${smartFilter.from || 'start'} to ${smartFilter.to || 'now'}`);

    if (smartFilter.leaveType !== 'all') parts.push(`Type: ${smartFilter.leaveType}`);
    if (smartFilter.status !== 'all') parts.push(`Status: ${smartFilter.status}`);

    el.textContent = parts.length ? `Filtered: ${parts.join(' · ')}` : 'Showing all branch records';
}

/* ════════════════════════════════════════════════════════════════════
   MULTI-SHEET EXCEL EXPORT (.xlsx)
   ════════════════════════════════════════════════════════════════════ */
$('btnExportExcel').addEventListener('click', () => {
    if (typeof XLSX === 'undefined') {
        showToast('Excel exporter is loading. Please try again.');
        return;
    }

    const filteredLeaves = getFilteredLeaves();
    const filteredEmps = getFilteredEmployees();
    const filteredAtt = getFilteredAttendance();
    const empBalances = computeAllEmployeeBalances(filteredEmps, allLeaves, smartFilter);

    const wb = XLSX.utils.book_new();

    // Sheet 1: Executive Overview
    const todayStr = getTodayDateStr();
    const todaySignIns = new Set(allAttendance.filter(a => toDateOnly(a.date) === todayStr).map(a => a.employee));
    const presentCount = empBalances.filter(e => todaySignIns.has(e.name)).length;
    const approvedUsage = calcLeaveUsage(filteredLeaves.filter(l => String(l.status).toLowerCase() === 'approved'));

    const overviewData = [
        ['ATTENZA ENTERPRISE SMART REPORT'],
        ['Generated At', new Date().toLocaleString()],
        ['Selected Branch', smartFilter.branch.toUpperCase()],
        ['Selected Timeframe', smartFilter.rangeType],
        [],
        ['KEY PERFORMANCE INDICATORS', 'VALUE'],
        ['Total Monitored Workforce', empBalances.length],
        ['Today Present Workforce', presentCount],
        ['Attendance Rate (%)', empBalances.length > 0 ? Math.round((presentCount / empBalances.length) * 100) + '%' : '0%'],
        ['Total Leave Days Deducted', approvedUsage.used],
        ['Medical Leave Days', approvedUsage.medical],
        ['Personal Leave Days', approvedUsage.personal],
        ['Half Day Applications', approvedUsage.halfDay],
        ['Early Leave Applications', approvedUsage.earlyCount],
        ['Pending Leave Requests', filteredLeaves.filter(l => String(l.status).toLowerCase() === 'pending').length]
    ];
    const wsOverview = XLSX.utils.aoa_to_sheet(overviewData);
    XLSX.utils.book_append_sheet(wb, wsOverview, 'Executive Overview');

    // Sheet 2: Branch Comparison
    const branchMap = {};
    allEmployees.forEach(e => {
        const b = e.branch || 'Unassigned';
        if (!branchMap[b]) branchMap[b] = { branch: b, employees: [], leaves: [] };
        branchMap[b].employees.push(e);
    });
    allLeaves.forEach(l => {
        const b = l.branch || 'Unassigned';
        if (!branchMap[b]) branchMap[b] = { branch: b, employees: [], leaves: [] };
        branchMap[b].leaves.push(l);
    });

    const branchData = Object.values(branchMap).map((b, idx) => {
        const bUsage = calcLeaveUsage(b.leaves.filter(l => String(l.status).toLowerCase() === 'approved'));
        let quota = 0, remaining = 0;
        b.employees.forEach(e => {
            if (e.earnedLeave !== null) {
                quota += e.earnedLeave;
                remaining += Math.max(0, e.earnedLeave - bUsage.used);
            }
        });
        return {
            'SL': idx + 1,
            'Branch Name': b.branch,
            'Staff Count': b.employees.length,
            'Leave Days Taken': bUsage.used,
            'Total Allocated Quota': quota,
            'Pending Requests': b.leaves.filter(l => String(l.status).toLowerCase() === 'pending').length
        };
    });
    const wsBranch = XLSX.utils.json_to_sheet(branchData);
    XLSX.utils.book_append_sheet(wb, wsBranch, 'Branch Comparison');

    // Sheet 3: Employee Leave Balances
    const balancesData = empBalances.map((e, idx) => ({
        'SL': idx + 1,
        'Employee Name': e.name,
        'Branch': e.branch,
        'Role': e.role,
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
    const wsBalances = XLSX.utils.json_to_sheet(balancesData);
    XLSX.utils.book_append_sheet(wb, wsBalances, 'Employee Balances');

    // Sheet 4: Master Leave History
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
    const wsHistory = XLSX.utils.json_to_sheet(historyData);
    XLSX.utils.book_append_sheet(wb, wsHistory, 'Leave History Log');

    // Sheet 5: Attendance Logs
    const attData = filteredAtt.map((a, idx) => ({
        'SL': idx + 1,
        'Employee Name': a.employee,
        'Branch': a.branch,
        'Date': a.date,
        'Time': fmtAttendanceTime(a.time),
        'Type': a.type,
        'Distance (m)': (a.distance !== null && a.distance !== undefined && a.distance !== '' && !isNaN(Number(a.distance))) ? Math.round(Number(a.distance)) : '',
        'Accuracy (m)': (a.accuracy !== null && a.accuracy !== undefined && a.accuracy !== '' && !isNaN(Number(a.accuracy))) ? Math.round(Number(a.accuracy)) : '',
        'Status': a.status
    }));
    const wsAtt = XLSX.utils.json_to_sheet(attData);
    XLSX.utils.book_append_sheet(wb, wsAtt, 'Attendance Log');

    const dateStamp = getTodayDateStr().replace(/-/g, '');
    const fileName = `ATTENZA_Smart_Reports_Enterprise_${dateStamp}.xlsx`;
    XLSX.writeFile(wb, fileName);
    showToast(`Enterprise Excel report downloaded: ${fileName}`, true);
});

/* ════════════════════════════════════════════════════════════════════
   PRINT & SYNC BUTTONS
   ════════════════════════════════════════════════════════════════════ */
$('btnPrintReport').addEventListener('click', () => {
    window.print();
});

$('btnRefreshData').addEventListener('click', () => {
    loadSmartReportsData();
    showToast('Syncing live branch data…');
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
   INITIALIZATION & AUTO-POLL
   ════════════════════════════════════════════════════════════════════ */
loadSmartReportsData();
setInterval(loadSmartReportsData, 20000);

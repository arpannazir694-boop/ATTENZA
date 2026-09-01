/**
 * ATTENZA — Attendance History
 *
 * Fetches the employee's full attendance log from the backend (getHistory
 * action in Code.gs) and renders it in two views:
 *   • Week view  — 7-day strip with day-level session details
 *   • Month view — heatmap calendar for the chosen month
 *
 * All date arithmetic is done in LOCAL time (new Date() etc.) because the
 * sheet already stores dates in the script's timezone and the server formats
 * them as ISO strings before sending. No timezone conversion is needed here.
 */

const API_URL = 'https://script.google.com/macros/s/AKfycbwpuED8aHh5bs_ljk9tFDTITHUmmkCS6HGn3uhE7xvYUqjFDTLMI_H5bMOTiis_8QJY/exec';
const $ = id => document.getElementById(id);

/* ── Toast ── */
function showToast(message, success = false) {
    const t = $('toast');
    t.textContent = message;
    t.className = `toast show${success ? ' success' : ''}`;
    setTimeout(() => t.className = 'toast', 3000);
}

/* ── Date helpers ── */
function ymd(date) {
    // Returns 'YYYY-MM-DD' from a Date (local time).
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function addDays(date, n) {
    const d = new Date(date);
    d.setDate(d.getDate() + n);
    return d;
}

function startOfWeek(date) {
    // Monday-first week.
    const d = new Date(date);
    const dow = d.getDay(); // 0=Sun … 6=Sat
    const diff = (dow === 0 ? -6 : 1 - dow);
    d.setDate(d.getDate() + diff);
    d.setHours(0, 0, 0, 0);
    return d;
}

function startOfMonth(date) {
    return new Date(date.getFullYear(), date.getMonth(), 1);
}

function fmtTime(isoString) {
    if (!isoString || isoString === '—' || isoString === '-') return '—';
    const str = String(isoString).trim();
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

    try {
        const d = new Date(str);
        if (!isNaN(d.getTime())) {
            return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: true }).format(d);
        }
    } catch (_) { }
    return str;
}

function fmtDuration(ms) {
    if (!isFinite(ms) || ms < 0) return '—';
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
}

function fmtHours(ms) {
    if (!isFinite(ms) || ms <= 0) return '0h';
    const h = (ms / 3_600_000).toFixed(1);
    return `${h}h`;
}

const DAY_NAMES = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];

/* ── Auth guard ── */
$('today').textContent = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }).format(new Date()).toUpperCase();

let record = null;
try {
    const raw = sessionStorage.getItem('attenza_signin');
    record = raw ? JSON.parse(raw) : null;
} catch (_) { record = null; }

if (!record || !record.employee) {
    // No active session — redirect to sign-in.
    window.location.href = 'index.html';
}

const isAdmin = record && String(record.role || '').trim().toLowerCase() === 'admin';
if (isAdmin && $('adminLink')) $('adminLink').hidden = false;

/* ── Personalise header ── */
const firstName = String(record.employee).trim().split(' ')[0];
$('histTitle').innerHTML = `Your record,<br><em style="color:var(--coral);font-style:normal">${firstName}</em>.`;

/* ── State ── */
let allEvents = [];       // raw rows from the server [{date, time, type, branch, distance, accuracy, status}, …]
let dayMap = {};           // 'YYYY-MM-DD' → { sessions: [{in, out, durationMs, branch, type, distance, accuracy}], totalMs }
let viewMode = 'week';     // 'week' | 'month' | 'day'
let weekStart = startOfWeek(new Date());
let monthStart = startOfMonth(new Date());
let selectedDay = new Date();

/* ── Sidebar wiring ── */
document.querySelectorAll('.sidebar-link[data-soon]').forEach(btn => {
    btn.addEventListener('click', () => showToast(`${btn.dataset.soon} is coming soon.`));
});
if ($('adminLink')) $('adminLink').addEventListener('click', () => { window.location.href = 'admin.html'; });

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
        } catch (_) {
            await speechPromise;
        }
    } else {
        await speechPromise;
    }
    try { sessionStorage.removeItem('attenza_signin'); } catch (_) { /* ignore */ }
    window.location.href = 'index.html';
});

/* ── Fetch history from backend ── */
async function loadHistory() {
    $('histSub').textContent = 'Fetching your attendance records…';
    try {
        const r = await fetch(`${API_URL}?action=getHistory&employee=${encodeURIComponent(record.employee)}`);
        const result = await r.json();
        if (!result || !result.ok) {
            showToast(result.message || 'Could not load history.');
            $('histSub').textContent = 'Could not load your attendance history.';
            return;
        }
        allEvents = result.events || [];
        buildDayMap();
        renderKPIs();
        renderCurrentView();
        $('histSub').textContent = `${Object.keys(dayMap).length} day${Object.keys(dayMap).length === 1 ? '' : 's'} with attendance on record.`;
    } catch (_) {
        showToast('Could not reach the server.');
        $('histSub').textContent = 'Could not load your attendance history.';
    }
}

/**
 * Parse an event time string (which may be just "hh:mm a" / "HH:mm" with
 * no date component) into a full Date using the event's date string.
 * Falls back to ISO parsing if the value already contains a date portion.
 *
 * @param {string} dateStr - 'YYYY-MM-DD'
 * @param {string} timeStr - raw time from server, e.g. "09:54 pm", "21:54", ISO
 * @returns {Date}
 */
function parseEventTime(dateStr, timeStr) {
    if (!timeStr || !dateStr) return new Date(NaN);
    const str = String(timeStr).trim();

    // Already a full ISO / date-time string — use directly.
    if (str.includes('T') || /^\d{4}-\d{2}-\d{2}/.test(str)) {
        const d = new Date(str);
        if (!isNaN(d.getTime())) return d;
    }

    // 12-hour "hh:mm am/pm" (e.g. "09:54 pm", "9:54 PM")
    const m12 = str.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*([aApP][mM])$/i);
    if (m12) {
        let h = parseInt(m12[1], 10);
        const min = parseInt(m12[2], 10);
        const ampm = m12[3].toLowerCase();
        if (ampm === 'am' && h === 12) h = 0;
        if (ampm === 'pm' && h !== 12) h += 12;
        return new Date(`${dateStr}T${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}:00`);
    }

    // 24-hour "HH:mm" or "HH:mm:ss"
    const m24 = str.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (m24) {
        const h = String(m24[1]).padStart(2, '0');
        const min = String(m24[2]).padStart(2, '0');
        const sec = String(m24[3] || '00').padStart(2, '0');
        return new Date(`${dateStr}T${h}:${min}:${sec}`);
    }

    // Last resort
    return new Date(str);
}

/* ── Build dayMap from flat events list ── */
function buildDayMap() {
    dayMap = {};

    // Sort chronologically using robust date+time parsing.
    const sorted = [...allEvents].sort((a, b) =>
        parseEventTime(a.date, a.time) - parseEventTime(b.date, b.time)
    );

    // Walk through events, pairing Sign In / Sign Out rows into sessions.
    const pending = {}; // date → open sign-in event (we only care about one employee here)

    sorted.forEach(ev => {
        const d = ev.date; // 'YYYY-MM-DD'
        if (!dayMap[d]) dayMap[d] = { sessions: [], totalMs: 0 };

        const isIn = String(ev.type || '').toLowerCase().startsWith('sign in');
        const isOut = String(ev.type || '').toLowerCase().startsWith('sign out');

        if (isIn) {
            pending[d] = ev;
        } else if (isOut && pending[d]) {
            const inEv = pending[d];
            const inTime = parseEventTime(inEv.date, inEv.time);
            const outTime = parseEventTime(ev.date, ev.time);
            const ms = Math.max(0, outTime - inTime);
            dayMap[d].sessions.push({
                in: inEv.time,
                out: ev.time,
                durationMs: ms,
                branch: inEv.branch,
                type: inEv.type,
                distance: inEv.distance,
                accuracy: inEv.accuracy
            });
            dayMap[d].totalMs += ms;
            delete pending[d];
        }
    });

    // Any still-open sessions (no sign-out yet, i.e. today's active session).
    Object.keys(pending).forEach(d => {
        const inEv = pending[d];
        const inTime = parseEventTime(inEv.date, inEv.time);
        const ms = Math.max(0, Date.now() - inTime);
        if (!dayMap[d]) dayMap[d] = { sessions: [], totalMs: 0 };
        dayMap[d].sessions.push({
            in: inEv.time,
            out: null,          // still open
            durationMs: ms,
            branch: inEv.branch,
            type: inEv.type,
            distance: inEv.distance,
            accuracy: inEv.accuracy,
            isOpen: true
        });
        dayMap[d].totalMs += ms;
    });
}

/* ── KPI strip ── */
function renderKPIs() {
    const todayDate = new Date();
    const thisMonthStr = `${todayDate.getFullYear()}-${String(todayDate.getMonth() + 1).padStart(2, '0')}`;
    const thisWeekStart = ymd(startOfWeek(todayDate));
    const thisWeekEnd = ymd(addDays(startOfWeek(todayDate), 6));

    let monthDays = 0, monthTotalMs = 0, weekDays = 0;

    Object.entries(dayMap).forEach(([d, data]) => {
        if (data.totalMs <= 0) return;
        if (d.startsWith(thisMonthStr)) {
            monthDays++;
            monthTotalMs += data.totalMs;
        }
        if (d >= thisWeekStart && d <= thisWeekEnd) weekDays++;
    });

    const avgMs = monthDays > 0 ? monthTotalMs / monthDays : 0;

    $('kpiMonthDays').textContent = monthDays || '0';
    $('kpiWeekDays').textContent = weekDays || '0';
    $('kpiAvgTime').textContent = avgMs > 0 ? fmtDuration(avgMs) : '—';
    $('kpiTotalHours').textContent = monthTotalMs > 0 ? fmtDuration(monthTotalMs) : '—';
}

/* ── View toggle ── */
$('tabWeek').addEventListener('click', () => {
    viewMode = 'week';
    $('tabWeek').classList.add('active');
    $('tabMonth').classList.remove('active');
    $('tabDay').classList.remove('active');
    $('weekNav').hidden = false;
    $('monthNav').hidden = true;
    $('dayNav').hidden = true;
    renderLogView();
});

$('tabMonth').addEventListener('click', () => {
    viewMode = 'month';
    $('tabMonth').classList.add('active');
    $('tabWeek').classList.remove('active');
    $('tabDay').classList.remove('active');
    $('monthNav').hidden = false;
    $('weekNav').hidden = true;
    $('dayNav').hidden = true;
    renderLogView();
});

$('tabDay').addEventListener('click', () => {
    viewMode = 'day';
    $('tabDay').classList.add('active');
    $('tabWeek').classList.remove('active');
    $('tabMonth').classList.remove('active');
    $('dayNav').hidden = false;
    $('weekNav').hidden = true;
    $('monthNav').hidden = true;
    $('daySelect').value = ymd(selectedDay);
    renderLogView();
});

/* ── Week nav ── */
$('prevWeek').addEventListener('click', () => {
    weekStart = addDays(weekStart, -7);
    renderLogView();
});
$('nextWeek').addEventListener('click', () => {
    weekStart = addDays(weekStart, 7);
    renderLogView();
});

/* ── Month nav ── */
$('prevMonth').addEventListener('click', () => {
    monthStart = new Date(monthStart.getFullYear(), monthStart.getMonth() - 1, 1);
    renderLogView();
});
$('nextMonth').addEventListener('click', () => {
    monthStart = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1);
    renderLogView();
});

/* ── Day nav — pick any particular date to find that day's log ── */
$('prevDay').addEventListener('click', () => {
    selectedDay = addDays(selectedDay, -1);
    $('daySelect').value = ymd(selectedDay);
    renderLogView();
});
$('nextDay').addEventListener('click', () => {
    const candidate = addDays(selectedDay, 1);
    if (ymd(candidate) > ymd(new Date())) return; // don't navigate into the future
    selectedDay = candidate;
    $('daySelect').value = ymd(selectedDay);
    renderLogView();
});
$('daySelect').addEventListener('change', () => {
    const val = $('daySelect').value; // 'YYYY-MM-DD'
    if (!val) return;
    const picked = new Date(`${val}T00:00:00`);
    if (isNaN(picked)) return;
    selectedDay = picked;
    renderLogView();
});

function renderCurrentView() {
    renderLogView();
}

/* ── Excel export — downloads exactly what's on screen for the
   currently selected week/month, one row per sign-in/out session. ── */
let lastExportEntries = [];
let lastExportTitle = '';

function exportCurrentViewToExcel() {
    if (!lastExportEntries.length) {
        showToast('No data to export for this ' + viewMode + '.');
        return;
    }
    if (typeof XLSX === 'undefined') {
        showToast('Excel export is unavailable right now.');
        return;
    }

    const rows = [];
    lastExportEntries.forEach(e => {
        const dayLabel = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(e.date);
        e.data.sessions.forEach(s => {
            rows.push({
                'Date': dayLabel,
                'Sign In': fmtTime(s.in),
                'Sign Out': s.out ? fmtTime(s.out) : (s.isOpen ? 'Active' : '—'),
                'Duration': fmtDuration(s.isOpen ? Date.now() - new Date(s.in) : s.durationMs),
                'Branch': s.branch || '—',
                'Type': sessionTypeLabel(s.type).text,
                'Distance (m)': typeof s.distance === 'number' && isFinite(s.distance) ? Math.round(s.distance) : '',
                'GPS Accuracy (m)': typeof s.accuracy === 'number' && isFinite(s.accuracy) ? Math.round(s.accuracy) : ''
            });
        });
    });

    const sheet = XLSX.utils.json_to_sheet(rows);
    sheet['!cols'] = [
        { wch: 18 }, { wch: 10 }, { wch: 10 }, { wch: 10 },
        { wch: 20 }, { wch: 10 }, { wch: 13 }, { wch: 16 }
    ];

    const wb = XLSX.utils.book_new();
    const sheetName = viewMode === 'week' ? 'Week' : (viewMode === 'month' ? 'Month' : 'Day');
    XLSX.utils.book_append_sheet(wb, sheet, sheetName);

    const safeEmployee = String(record.employee || 'Employee').trim().replace(/[^a-z0-9]+/gi, '-');
    const safeTitle = lastExportTitle.replace(/[^a-z0-9]+/gi, '-');
    XLSX.writeFile(wb, `Attenza-${safeEmployee}-${safeTitle}.xlsx`);
}

if ($('exportExcelBtn')) {
    $('exportExcelBtn').addEventListener('click', exportCurrentViewToExcel);
}

/* ── Helpers for the combined log table ── */
function periodDays(start, end) {
    const days = [];
    let d = new Date(start);
    while (d <= end) { days.push(new Date(d)); d = addDays(d, 1); }
    return days;
}

function sessionRowHtml(s) {
    const typeLabel = sessionTypeLabel(s.type);
    const distText = typeof s.distance === 'number' && isFinite(s.distance)
        ? `${Math.round(s.distance)}m from office` : '';
    const accText = typeof s.accuracy === 'number' && isFinite(s.accuracy)
        ? `GPS ±${Math.round(s.accuracy)}m` : '';
    const sub = [distText, accText].filter(Boolean).join(' · ');

    return `
        <div class="session-item">
            <div class="session-time-col">
                <span class="session-time-range">${fmtTime(s.in)} → ${s.out ? fmtTime(s.out) : 'Now'}</span>
                <span class="session-time-dur">${fmtDuration(s.isOpen ? Date.now() - new Date(s.in) : s.durationMs)}</span>
            </div>
            <div>
                <span class="session-info-main">${s.branch || '—'}${s.isOpen ? ' <span style="color:var(--coral);font-size:10px">● LIVE</span>' : ''}</span>
                ${sub ? `<span class="session-info-sub">${sub}</span>` : ''}
            </div>
            <span class="session-type-chip ${typeLabel.cls}">${typeLabel.text}</span>
        </div>`;
}

function sessionTypeLabel(type) {
    const t = String(type || '').toLowerCase();
    if (t.includes('qr')) return { cls: 'chip-qr', text: 'QR' };
    if (t.includes('admin')) return { cls: 'chip-admin', text: 'ADMIN' };
    if (t.includes('sign out')) return { cls: 'chip-out', text: 'SIGN OUT' };
    return { cls: 'chip-normal', text: 'GPS' };
}

/* ── Combined log view — shows the selected week's or month's data as a
   single scrollable table inside the fixed card. No calendar grid. ── */
function renderLogView() {
    const todayStr = ymd(new Date());
    let start, end, title;

    if (viewMode === 'week') {
        start = weekStart;
        end = addDays(weekStart, 6);
        const fmt = d => new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short' }).format(d);
        title = `${fmt(start)} — ${fmt(end)} ${end.getFullYear()}`;
        $('weekLabel').textContent = title;
        $('nextWeek').disabled = end >= new Date();
    } else if (viewMode === 'month') {
        start = monthStart;
        end = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0);
        title = `${MONTH_NAMES[monthStart.getMonth()]} ${monthStart.getFullYear()}`;
        $('monthLabel').textContent = title;
        $('nextMonth').disabled = monthStart.getMonth() >= new Date().getMonth() && monthStart.getFullYear() >= new Date().getFullYear();
    } else {
        // 'day' — a single specific date the user picked.
        start = selectedDay;
        end = selectedDay;
        title = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }).format(selectedDay);
        $('nextDay').disabled = ymd(selectedDay) >= todayStr;
    }

    $('dayDetailTitle').textContent = title;

    // Days in range that aren't in the future, most recent first.
    const entries = periodDays(start, end)
        .filter(d => ymd(d) <= todayStr)
        .map(d => ({ dStr: ymd(d), date: d, data: dayMap[ymd(d)] }))
        .filter(e => e.data && e.data.sessions.length)
        .sort((a, b) => b.dStr.localeCompare(a.dStr));

    const badgeEl = $('dayDetailBadge');
    const bodyEl = $('dayDetailBody');

    const totalMs = entries.reduce((acc, e) => acc + e.data.totalMs, 0);
    const daysPresent = entries.length;
    const openEntry = entries.find(e => e.dStr === todayStr && e.data.sessions.some(s => s.isOpen));

    if (openEntry) {
        badgeEl.className = 'day-detail-badge badge-today';
        badgeEl.textContent = 'ACTIVE SESSION';
    } else if (daysPresent > 0) {
        badgeEl.className = 'day-detail-badge badge-present';
        badgeEl.textContent = `${daysPresent} DAY${daysPresent === 1 ? '' : 'S'} PRESENT`;
    } else {
        badgeEl.className = 'day-detail-badge badge-absent';
        badgeEl.textContent = 'NO DATA';
    }

    lastExportEntries = entries;
    lastExportTitle = title;
    if ($('exportExcelBtn')) $('exportExcelBtn').disabled = !entries.length;

    if (!entries.length) {
        bodyEl.innerHTML = `<p class="no-session-note">No attendance recorded for this ${viewMode}.</p>`;
        return;
    }

    const branchSet = new Set();
    entries.forEach(e => e.data.sessions.forEach(s => { if (s.branch) branchSet.add(s.branch); }));
    const branchText = branchSet.size === 1 ? [...branchSet][0] : (branchSet.size > 1 ? `${branchSet.size} branches` : '—');

    bodyEl.innerHTML = `
        <div class="day-totals">
            <div class="day-total-item">
                <span class="day-total-label">TOTAL TIME</span>
                <span class="day-total-val coral" id="dayTotalVal">${fmtDuration(totalMs)}</span>
            </div>
            <div class="day-total-item">
                <span class="day-total-label">DAYS PRESENT</span>
                <span class="day-total-val">${daysPresent}</span>
            </div>
            <div class="day-total-item">
                <span class="day-total-label">BRANCH</span>
                <span class="day-total-val" style="font-size:16px">${branchText}</span>
            </div>
        </div>
        <div class="session-list" id="sessionList"></div>`;

    const list = $('sessionList');
    let html = '';
    entries.forEach(e => {
        const dayLabel = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).format(e.date);
        html += `
            <div class="session-date-header">
                <span>${dayLabel}${e.dStr === todayStr ? ' · Today' : ''}</span>
                <span class="session-date-total">${fmtDuration(e.data.totalMs)}</span>
            </div>`;
        e.data.sessions.forEach(s => { html += sessionRowHtml(s); });
    });
    list.innerHTML = html;

    // Live-tick the total if there's an open session today in range.
    if (openEntry) {
        const openSession = openEntry.data.sessions.find(s => s.isOpen);
        const startMs = new Date(openSession.in).getTime();
        const closedMs = totalMs - openSession.durationMs; // strip the stale snapshot, re-add live below
        let liveTick = setInterval(() => {
            const el = $('dayTotalVal');
            if (!el) { clearInterval(liveTick); return; }
            el.textContent = fmtDuration(closedMs + (Date.now() - startMs));
        }, 1000);
    }
}

/* ── Boot ── */
if ($('daySelect')) {
    $('daySelect').max = ymd(new Date());
    $('daySelect').value = ymd(selectedDay);
}
loadHistory();

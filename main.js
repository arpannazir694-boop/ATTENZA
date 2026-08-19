const API_URL = 'https://script.google.com/macros/s/AKfycbwpuED8aHh5bs_ljk9tFDTITHUmmkCS6HGn3uhE7xvYUqjFDTLMI_H5bMOTiis_8QJY/exec', MAX_DISTANCE_METERS = 150;
const fallbackData = { gps: [{ branch: 'P-35', latitude: 22.5140997, longitude: 88.4082414 }], employees: [{ name: 'Arpan Nazir', branch: 'P-35' }] };
let data = fallbackData, verified = null;
const $ = id => document.getElementById(id), employee = $('employee'), locationCard = $('locationCard'), signIn = $('signIn');

function showToast(message, success = false) { const t = $('toast'); t.textContent = message; t.className = `toast show${success ? ' success' : ''}`; setTimeout(() => t.className = 'toast', 3500) }
function normalise(raw) { const s = raw.data || raw; return { gps: s.gps || s.GPS || s.branches || [], employees: s.employees || s.employee || s.Employee || [] } }
async function loadData() { try { const r = await fetch(`${API_URL}?action=getBootstrap`, { redirect: 'follow' }); if (!r.ok) throw Error(); const incoming = normalise(await r.json()); if (incoming.gps.length && incoming.employees.length) data = incoming } catch (_) {/* works with screenshot-provided setup if endpoint is not configured */ } employee.innerHTML = '<option value="">Choose your profile</option>' + data.employees.map((e, i) => `<option value="${i}">${e.name || e['Employee Name']}</option>`).join('') }
function selectedEmployee() { return data.employees[employee.value] }
function field(item, names) { for (const n of names) if (item && item[n] !== undefined) return item[n] }
function distanceMeters(a, b, c, d) { const r = 6371e3, p = Math.PI / 180, x = Math.sin((c - a) * p / 2) ** 2 + Math.cos(a * p) * Math.cos(c * p) * Math.sin((d - b) * p / 2) ** 2; return r * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x)) }
function setLocation(title, text, state = '') { $('locationTitle').textContent = title; $('locationText').textContent = text; locationCard.className = `location-card ${state}` }

// ---- Are we the phone that just scanned a desktop's QR code? ----
const qp = new URLSearchParams(window.location.search);
const qrEmployeeParam = qp.get('employee'), qrBranchParam = qp.get('branch'), qrSessionParam = qp.get('qrsession');
const isMobileQrFlow = !!(qrEmployeeParam && qrBranchParam && qrSessionParam);

if (isMobileQrFlow) {
    runMobileConfirmFlow(qrEmployeeParam, qrBranchParam, qrSessionParam);
} else {
    runDesktopFlow();
}

function runDesktopFlow() {
    employee.addEventListener('change', () => {
        verified = null; signIn.disabled = true;
        const e = selectedEmployee(), branch = e && field(e, ['branch', 'Branch']);
        $('employeeInfo').textContent = branch ? `Assigned to ${branch}` : '';
        setLocation('Location not checked', 'We need your location to sign you in.');
    });

    $('checkLocation').addEventListener('click', () => {
        if (!selectedEmployee()) return showToast('Please select your profile first.');
        if (!navigator.geolocation) return setLocation('Location unavailable', 'This browser does not support location.', 'error');
        setLocation('Checking GPS signal…', 'Please allow precise location access when prompted.');
        navigator.geolocation.getCurrentPosition(pos => {
            const e = selectedEmployee(), branch = field(e, ['branch', 'Branch']), office = data.gps.find(x => String(field(x, ['branch', 'Branch Name', 'Branch'])).trim() === String(branch).trim());
            if (!office) return setLocation('Office location unavailable', `No GPS record found for ${branch}.`, 'error');
            const accuracy = Math.round(pos.coords.accuracy || 0), meters = distanceMeters(pos.coords.latitude, pos.coords.longitude, Number(field(office, ['latitude', 'Latitude'])), Number(field(office, ['longitude', 'Longitude'])));
            if (accuracy > 200) { verified = null; signIn.disabled = true; return setLocation('GPS signal is not precise enough', `Current accuracy is ±${accuracy}m. Turn on Precise location, then check again.`, 'error') }
            if (meters <= MAX_DISTANCE_METERS) {
                verified = { latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracy: pos.coords.accuracy, distance: Math.round(meters) };
                setLocation('You’re at the right place', `${Math.round(meters)}m from ${branch} · GPS accuracy ±${accuracy}m`, 'ready');
                signIn.disabled = false;
            } else {
                verified = null; signIn.disabled = true;
                setLocation('Outside sign-in area', `GPS says ${Math.round(meters)}m from ${branch} (accuracy ±${accuracy}m). Check phone location settings.`, 'error');
            }
        }, err => setLocation('Location access needed', err.code === 1 ? 'Allow precise location permission, then try again.' : 'Could not get your location. Try again outdoors.', 'error'), { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
    });

    signIn.addEventListener('click', async () => {
        if (!verified) return;
        const e = selectedEmployee();
        signIn.disabled = true; signIn.querySelector('span').textContent = 'Signing you in…';
        const payload = { action: 'signIn', employee: field(e, ['name', 'Employee Name']), branch: field(e, ['branch', 'Branch']), ...verified, signedInAt: new Date().toISOString() };
        try {
            await fetch(API_URL, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(payload) });
            showToast(`Welcome, ${payload.employee}. Your sign-in is recorded.`, true);
        } catch (_) {
            showToast('Location verified. Could not reach the attendance sheet.');
            signIn.disabled = false;
        }
        signIn.querySelector('span').textContent = 'Sign in to office';
    });

    initQrModal();

    $('year').textContent = new Date().getFullYear();
    $('today').textContent = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }).format(new Date()).toUpperCase();
    loadData();
}

// ---- Desktop side: generate a QR code that a phone scans ----
function initQrModal() {
    const qrModal = $('qrModal'), openQrBtn = $('openQr'), closeQrBtn = $('closeQr'), qrCodeCanvas = $('qrCodeCanvas'), qrStatus = $('qrStatus');
    let qrCodeWidget = null, pollTimer = null, currentSession = null;

    function makeSessionId() {
        if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
        return 'qr-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
    }

    function openQrModal() {
        const e = selectedEmployee();
        if (!e) return showToast('Please select your profile first.');
        const name = field(e, ['name', 'Employee Name']), branch = field(e, ['branch', 'Branch']);
        currentSession = makeSessionId();
        const url = `${location.origin}${location.pathname}?employee=${encodeURIComponent(name)}&branch=${encodeURIComponent(branch)}&qrsession=${encodeURIComponent(currentSession)}`;

        qrCodeCanvas.innerHTML = '';
        if (typeof QRCode !== 'undefined') {
            qrCodeWidget = new QRCode(qrCodeCanvas, { text: url, width: 190, height: 190, correctLevel: QRCode.CorrectLevel.M });
        } else {
            qrCodeCanvas.textContent = 'QR library failed to load — use the link below instead.';
        }
        qrStatus.textContent = 'Waiting for you to scan…';
        qrStatus.className = 'qr-status';

        qrModal.classList.add('open');
        qrModal.setAttribute('aria-hidden', 'false');
        startPolling();
    }

    function closeQrModal() {
        stopPolling();
        qrModal.classList.remove('open');
        qrModal.setAttribute('aria-hidden', 'true');
    }

    function startPolling() {
        stopPolling();
        pollTimer = setInterval(async () => {
            if (!currentSession) return;
            try {
                const r = await fetch(`${API_URL}?action=checkSession&session=${encodeURIComponent(currentSession)}`);
                const result = await r.json();
                if (result && result.ok && result.found) {
                    qrStatus.textContent = `Signed in as ${result.employee} ✓`;
                    qrStatus.className = 'qr-status found';
                    stopPolling();
                    setTimeout(closeQrModal, 2200);
                }
            } catch (_) {/* keep polling silently */ }
        }, 3000);
    }
    function stopPolling() { if (pollTimer) { clearInterval(pollTimer); pollTimer = null } }

    openQrBtn.addEventListener('click', openQrModal);
    closeQrBtn.addEventListener('click', closeQrModal);
    qrModal.addEventListener('click', e => { if (e.target === qrModal) closeQrModal() });
}

// ---- Phone side: the page that opens after scanning the QR ----
function runMobileConfirmFlow(employeeName, branch, qrSession) {
    document.querySelector('.app-shell').style.display = 'none';
    const screen = $('mobileConfirm');
    screen.hidden = false;
    screen.style.display = 'flex';
    $('mobileEmployeeName').textContent = employeeName;
    $('mobileBranchName').textContent = branch;
    $('mobileToday').textContent = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }).format(new Date()).toUpperCase();

    const btn = $('mobileSignIn'), titleEl = $('mobileLocationTitle'), textEl = $('mobileLocationText'), cardEl = $('mobileLocationCard');
    function setMobileLocation(title, text, state = '') { titleEl.textContent = title; textEl.textContent = text; cardEl.className = `location-card ${state}` }

    async function findOffice() {
        try {
            const r = await fetch(`${API_URL}?action=getBootstrap`);
            const raw = await r.json();
            const s = raw.data || raw;
            const gps = s.gps || s.GPS || s.branches || [];
            return gps.find(x => String(field(x, ['branch', 'Branch Name', 'Branch'])).trim() === String(branch).trim());
        } catch (_) {
            return fallbackData.gps.find(x => x.branch === branch);
        }
    }

    btn.addEventListener('click', async () => {
        if (!navigator.geolocation) return setMobileLocation('Location unavailable', 'This browser does not support location.', 'error');
        btn.disabled = true;
        setMobileLocation('Checking GPS signal…', 'Please allow precise location access when prompted.');
        const office = await findOffice();
        if (!office) { btn.disabled = false; return setMobileLocation('Office location unavailable', `No GPS record found for ${branch}.`, 'error') }

        navigator.geolocation.getCurrentPosition(async pos => {
            const accuracy = Math.round(pos.coords.accuracy || 0);
            const meters = distanceMeters(pos.coords.latitude, pos.coords.longitude, Number(field(office, ['latitude', 'Latitude'])), Number(field(office, ['longitude', 'Longitude'])));
            if (accuracy > 200) { btn.disabled = false; return setMobileLocation('GPS signal is not precise enough', `Current accuracy is ±${accuracy}m. Turn on Precise location, then try again.`, 'error') }
            if (meters > MAX_DISTANCE_METERS) { btn.disabled = false; return setMobileLocation('Outside sign-in area', `GPS says ${Math.round(meters)}m from ${branch} (accuracy ±${accuracy}m).`, 'error') }

            setMobileLocation('Signing you in…', `${Math.round(meters)}m from ${branch} · GPS accuracy ±${accuracy}m`, 'ready');
            const payload = { action: 'signIn', employee: employeeName, branch: branch, latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracy: pos.coords.accuracy, qrSession: qrSession, signedInAt: new Date().toISOString() };
            try {
                const r = await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(payload) });
                const result = await r.json();
                if (result && result.ok) {
                    setMobileLocation('You’re signed in ✓', `${Math.round(meters)}m from ${branch} · Recorded successfully.`, 'ready');
                    btn.querySelector('span').textContent = 'Signed in';
                } else {
                    btn.disabled = false;
                    setMobileLocation('Sign-in failed', (result && result.message) || 'Please try again.', 'error');
                }
            } catch (_) {
                btn.disabled = false;
                setMobileLocation('Could not reach the attendance sheet', 'Check your connection and try again.', 'error');
            }
        }, err => {
            btn.disabled = false;
            setMobileLocation('Location access needed', err.code === 1 ? 'Allow precise location permission, then try again.' : 'Could not get your location. Try again outdoors.', 'error');
        }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
    });
}

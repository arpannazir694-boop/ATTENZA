const API_URL = 'https://script.google.com/macros/s/AKfycbwpuED8aHh5bs_ljk9tFDTITHUmmkCS6HGn3uhE7xvYUqjFDTLMI_H5bMOTiis_8QJY/exec', MAX_DISTANCE_METERS = 150;
const fallbackData = { gps: [{ branch: 'P-35', latitude: 22.5140997, longitude: 88.4082414 }], employees: [{ name: 'Arpan Nazir', branch: 'P-35' }] };
let data = fallbackData, verified = null, selectedEmployeeIndex = null, passwordVerified = false, verifiedRole = null;
let autoSignInInfo = null; // set when the server says this employee already signed in today — skips the location step
let verifiedBranchRequest = null, branchRequestPollTimer = null;
const $ = id => document.getElementById(id), locationCard = $('locationCard'), signIn = $('signIn');
const employeeSearch = $('employeeSearch'), employeeCombo = $('employeeCombo'), employeeList = $('employeeList');
const passwordCard = $('passwordCard'), employeePasswordInput = $('employeePassword'), verifyPasswordBtn = $('verifyPassword'), passwordStatus = $('passwordStatus'), checkLocationBtn = $('checkLocation');
const toggleBranchRequestBtn = $('toggleBranchRequest'), branchRequestBlock = $('branchRequestBlock'), branchSelect = $('branchSelect');
const branchLocationCard = $('branchLocationCard'), checkBranchLocationBtn = $('checkBranchLocation'), requestApprovalBtn = $('requestApprovalBtn'), branchRequestStatus = $('branchRequestStatus');

function showToast(message, success = false) { const t = $('toast'); t.textContent = message; t.className = `toast show${success ? ' success' : ''}`; setTimeout(() => t.className = 'toast', 3500) }
function normalise(raw) { const s = raw.data || raw; return { gps: s.gps || s.GPS || s.branches || [], employees: s.employees || s.employee || s.Employee || [] } }
async function loadData() { try { const r = await fetch(`${API_URL}?action=getBootstrap`, { redirect: 'follow' }); if (!r.ok) throw Error(); const incoming = normalise(await r.json()); if (incoming.gps.length && incoming.employees.length) data = incoming } catch (_) {/* works with screenshot-provided setup if endpoint is not configured */ } }
function selectedEmployee() { return selectedEmployeeIndex !== null ? data.employees[selectedEmployeeIndex] : null }
function field(item, names) { for (const n of names) if (item && item[n] !== undefined) return item[n] }
function distanceMeters(a, b, c, d) { const r = 6371e3, p = Math.PI / 180, x = Math.sin((c - a) * p / 2) ** 2 + Math.cos(a * p) * Math.cos(c * p) * Math.sin((d - b) * p / 2) ** 2; return r * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x)) }
function setLocation(title, text, state = '') { $('locationTitle').textContent = title; $('locationText').textContent = text; locationCard.className = `location-card ${state}` }

// Persist the sign-in result so home.html can greet the employee, then move
// them on to the home screen a moment after the confirmation is shown.
function saveSignInAndRedirect(payload, delay = 1100) {
    try {
        sessionStorage.setItem('attenza_signin', JSON.stringify({
            employee: payload.employee,
            branch: payload.branch,
            distance: payload.distance,
            accuracy: payload.accuracy,
            signedInAt: payload.signedInAt || new Date().toISOString(),
            viaQr: !!payload.qrSession,
            viaApproval: !!payload.viaApproval,
            role: payload.role || null
        }));
    } catch (_) {/* sessionStorage unavailable — home.html falls back to a generic greeting */ }
    setTimeout(() => { window.location.href = 'home.html'; }, delay);
}

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
    function renderEmployeeList(filter = '') {
        const q = filter.trim().toLowerCase();
        const items = data.employees
            .map((e, i) => ({ i, name: field(e, ['name', 'Employee Name']) || '' }))
            .filter(x => x.name.toLowerCase().includes(q));
        employeeList.innerHTML = items.length
            ? items.map(x => `<li role="option" data-index="${x.i}">${x.name}</li>`).join('')
            : '<li class="combo-empty">No matches found</li>';
    }
    function openEmployeeList() { employeeCombo.classList.add('open'); employeeSearch.setAttribute('aria-expanded', 'true') }
    function closeEmployeeList() { employeeCombo.classList.remove('open'); employeeSearch.setAttribute('aria-expanded', 'false') }

    function resetPasswordStep() {
        passwordVerified = false; verifiedRole = null; autoSignInInfo = null;
        employeePasswordInput.value = ''; employeePasswordInput.disabled = false; employeePasswordInput.type = 'password';
        $('togglePassword').setAttribute('aria-pressed', 'false'); $('togglePassword').setAttribute('aria-label', 'Show password');
        passwordStatus.textContent = ''; passwordStatus.className = 'password-status';
        verifyPasswordBtn.disabled = false; verifyPasswordBtn.textContent = 'VERIFY';
        verified = null; signIn.disabled = true;
        checkLocationBtn.disabled = true; checkLocationBtn.hidden = false;
        signIn.querySelector('span').textContent = 'Sign in to office';
        setLocation('Location not checked', 'We need your location to sign you in.');
        resetBranchRequest();
    }

    function selectEmployee(index) {
        selectedEmployeeIndex = index;
        const e = data.employees[index], branch = field(e, ['branch', 'Branch']);
        employeeSearch.value = field(e, ['name', 'Employee Name']) || '';
        $('employeeInfo').textContent = branch ? `Assigned to ${branch}` : '';
        closeEmployeeList();
        passwordCard.hidden = false;
        resetPasswordStep();
    }

    employeeSearch.addEventListener('focus', () => { renderEmployeeList(employeeSearch.value); openEmployeeList(); });
    employeeSearch.addEventListener('input', () => {
        if (selectedEmployeeIndex !== null) { selectedEmployeeIndex = null; passwordCard.hidden = true; resetPasswordStep(); }
        renderEmployeeList(employeeSearch.value); openEmployeeList();
    });
    employeeSearch.addEventListener('keydown', ev => {
        if (ev.key === 'Enter') { ev.preventDefault(); const first = employeeList.querySelector('li[data-index]'); if (first) selectEmployee(Number(first.dataset.index)); }
        else if (ev.key === 'Escape') closeEmployeeList();
    });
    employeeList.addEventListener('click', ev => { const li = ev.target.closest('li[data-index]'); if (li) selectEmployee(Number(li.dataset.index)); });
    document.addEventListener('click', ev => { if (!employeeCombo.contains(ev.target)) closeEmployeeList(); });

    $('togglePassword').addEventListener('click', () => {
        const btn = $('togglePassword');
        const showing = employeePasswordInput.type === 'text';
        employeePasswordInput.type = showing ? 'password' : 'text';
        btn.setAttribute('aria-pressed', String(!showing));
        btn.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
    });

    verifyPasswordBtn.addEventListener('click', async () => {
        const e = selectedEmployee();
        if (!e) return showToast('Please select your profile first.');
        const password = employeePasswordInput.value.trim();
        if (!password) { passwordStatus.textContent = 'Please enter your password.'; passwordStatus.className = 'password-status error'; return; }
        verifyPasswordBtn.disabled = true;
        passwordStatus.textContent = 'Verifying…'; passwordStatus.className = 'password-status';
        try {
            const r = await fetch(API_URL, {
                method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({ action: 'verifyPassword', employee: field(e, ['name', 'Employee Name']), branch: field(e, ['branch', 'Branch']), password })
            });
            const result = await r.json();
            if (result && result.ok) {
                passwordVerified = true;
                verifiedRole = result.role || null;
                passwordStatus.textContent = 'Password verified ✓'; passwordStatus.className = 'password-status success';
                employeePasswordInput.disabled = true;
                verifyPasswordBtn.textContent = 'VERIFIED';

                if (result.alreadySignedInToday && result.previousSignIn) {
                    // Already checked in once today — no need to check location again,
                    // just let them confirm and sign in using that earlier check-in.
                    autoSignInInfo = result.previousSignIn;
                    checkLocationBtn.disabled = true; checkLocationBtn.hidden = true;
                    setLocation('Already signed in today', `You checked in earlier today at ${autoSignInInfo.branch}${typeof autoSignInInfo.distance === 'number' ? ` · ${autoSignInInfo.distance}m from office` : ''}. Tap below to sign in again — no need to check location.`, 'ready');
                    signIn.disabled = false;
                } else {
                    autoSignInInfo = null;
                    checkLocationBtn.disabled = false; checkLocationBtn.hidden = false;
                    setLocation('Location not checked', 'We need your location to sign you in.');
                    signIn.disabled = true;
                }
            } else {
                passwordVerified = false; verifyPasswordBtn.disabled = false;
                passwordStatus.textContent = (result && result.message) || 'Incorrect password.';
                passwordStatus.className = 'password-status error';
            }
        } catch (_) {
            verifyPasswordBtn.disabled = false;
            passwordStatus.textContent = 'Could not reach the server. Try again.';
            passwordStatus.className = 'password-status error';
        }
    });

    checkLocationBtn.addEventListener('click', () => {
        if (!selectedEmployee()) return showToast('Please select your profile first.');
        if (!passwordVerified) return showToast('Please verify your password first.');
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
        const e = selectedEmployee();
        if (!e) return;

        // Already signed in once today — skip location entirely and reuse
        // the earlier check-in's location/distance instead of recalculating it.
        if (autoSignInInfo) {
            signIn.disabled = true; signIn.querySelector('span').textContent = 'Signing you in…';
            const payload = { action: 'autoSignIn', employee: field(e, ['name', 'Employee Name']), branch: autoSignInInfo.branch, signedInAt: new Date().toISOString(), role: verifiedRole };
            try {
                const r = await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(payload) });
                const result = await r.json();
                if (result && result.ok) {
                    showToast(`Welcome back, ${payload.employee}. Signed in.`, true);
                    saveSignInAndRedirect({ ...payload, distance: autoSignInInfo.distance, accuracy: autoSignInInfo.accuracy });
                } else {
                    showToast((result && result.message) || 'Could not sign in.');
                    signIn.disabled = false; signIn.querySelector('span').textContent = 'Sign in to office';
                }
            } catch (_) {
                showToast('Could not reach the server. Try again.');
                signIn.disabled = false; signIn.querySelector('span').textContent = 'Sign in to office';
            }
            return;
        }

        if (!verified) return;
        signIn.disabled = true; signIn.querySelector('span').textContent = 'Signing you in…';
        const payload = { action: 'signIn', employee: field(e, ['name', 'Employee Name']), branch: field(e, ['branch', 'Branch']), ...verified, signedInAt: new Date().toISOString(), role: verifiedRole };
        try {
            await fetch(API_URL, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(payload) });
            showToast(`Welcome, ${payload.employee}. Your sign-in is recorded.`, true);
            saveSignInAndRedirect(payload);
        } catch (_) {
            showToast('Location verified. Could not reach the attendance sheet.');
            signIn.disabled = false;
            signIn.querySelector('span').textContent = 'Sign in to office';
        }
    });

    initQrModal();
    initBranchRequestFlow();

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
                    saveSignInAndRedirect({ employee: result.employee, branch: result.branch, signedInAt: result.time, qrSession: currentSession, role: result.role }, 1400);
                }
            } catch (_) {/* keep polling silently */ }
        }, 3000);
    }
    function stopPolling() { if (pollTimer) { clearInterval(pollTimer); pollTimer = null } }

    openQrBtn.addEventListener('click', openQrModal);
    closeQrBtn.addEventListener('click', closeQrModal);
    qrModal.addEventListener('click', e => { if (e.target === qrModal) closeQrModal() });
}

// ---- Employee at a branch other than their assigned one: request approval ----
function resetBranchRequest() {
    verifiedBranchRequest = null;
    if (branchRequestPollTimer) { clearInterval(branchRequestPollTimer); branchRequestPollTimer = null; }
    branchRequestBlock.hidden = true;
    branchRequestStatus.textContent = ''; branchRequestStatus.className = 'password-status';
    requestApprovalBtn.disabled = true;
    requestApprovalBtn.querySelector('span').textContent = 'Request approval from admin';
    setBranchLocation('Location not checked', 'Pick a branch above, then check your location.');
    populateBranchSelect();
}

function setBranchLocation(title, text, state = '') {
    $('branchLocationTitle').textContent = title;
    $('branchLocationText').textContent = text;
    branchLocationCard.className = `location-card ${state}`;
}

function populateBranchSelect() {
    const e = selectedEmployee();
    const assignedBranch = e ? field(e, ['branch', 'Branch']) : null;
    const options = data.gps
        .map(g => field(g, ['branch', 'Branch Name', 'Branch']))
        .filter(b => b && String(b).trim() !== String(assignedBranch || '').trim());
    branchSelect.innerHTML = options.length
        ? options.map(b => `<option value="${b}">${b}</option>`).join('')
        : '<option value="">No other branches available</option>';
}

function initBranchRequestFlow() {
    toggleBranchRequestBtn.addEventListener('click', () => {
        if (!selectedEmployee()) return showToast('Please select your profile first.');
        if (!passwordVerified) return showToast('Please verify your password first.');
        branchRequestBlock.hidden = !branchRequestBlock.hidden;
        if (!branchRequestBlock.hidden) populateBranchSelect();
    });

    branchSelect.addEventListener('change', () => {
        verifiedBranchRequest = null;
        requestApprovalBtn.disabled = true;
        setBranchLocation('Location not checked', 'Pick a branch above, then check your location.');
    });

    checkBranchLocationBtn.addEventListener('click', () => {
        if (!branchSelect.value) return showToast('No other branch is available to select.');
        if (!navigator.geolocation) return setBranchLocation('Location unavailable', 'This browser does not support location.', 'error');
        setBranchLocation('Checking GPS signal…', 'Please allow precise location access when prompted.');
        navigator.geolocation.getCurrentPosition(pos => {
            const branch = branchSelect.value;
            const office = data.gps.find(x => String(field(x, ['branch', 'Branch Name', 'Branch'])).trim() === String(branch).trim());
            if (!office) return setBranchLocation('Branch location unavailable', `No GPS record found for ${branch}.`, 'error');
            const accuracy = Math.round(pos.coords.accuracy || 0), meters = distanceMeters(pos.coords.latitude, pos.coords.longitude, Number(field(office, ['latitude', 'Latitude'])), Number(field(office, ['longitude', 'Longitude'])));
            if (accuracy > 200) { verifiedBranchRequest = null; requestApprovalBtn.disabled = true; return setBranchLocation('GPS signal is not precise enough', `Current accuracy is ±${accuracy}m. Turn on Precise location, then check again.`, 'error') }
            if (meters <= MAX_DISTANCE_METERS) {
                verifiedBranchRequest = { branch, latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracy: pos.coords.accuracy, distance: Math.round(meters) };
                setBranchLocation('You’re at this branch', `${Math.round(meters)}m from ${branch} · GPS accuracy ±${accuracy}m`, 'ready');
                requestApprovalBtn.disabled = false;
            } else {
                verifiedBranchRequest = null; requestApprovalBtn.disabled = true;
                setBranchLocation('Not within range', `GPS says ${Math.round(meters)}m from ${branch} (accuracy ±${accuracy}m).`, 'error');
            }
        }, err => setBranchLocation('Location access needed', err.code === 1 ? 'Allow precise location permission, then try again.' : 'Could not get your location. Try again outdoors.', 'error'), { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
    });

    requestApprovalBtn.addEventListener('click', async () => {
        if (!verifiedBranchRequest) return;
        const e = selectedEmployee();
        requestApprovalBtn.disabled = true;
        requestApprovalBtn.querySelector('span').textContent = 'Sending request…';
        branchRequestStatus.textContent = ''; branchRequestStatus.className = 'password-status';
        try {
            const r = await fetch(API_URL, {
                method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({
                    action: 'requestBranchSignIn',
                    employee: field(e, ['name', 'Employee Name']),
                    requestedBranch: verifiedBranchRequest.branch,
                    latitude: verifiedBranchRequest.latitude,
                    longitude: verifiedBranchRequest.longitude,
                    accuracy: verifiedBranchRequest.accuracy
                })
            });
            const result = await r.json();
            if (result && result.ok) {
                branchRequestStatus.textContent = result.alreadyPending ? 'Already waiting for admin approval…' : 'Request sent — waiting for admin approval…';
                branchRequestStatus.className = 'password-status success';
                requestApprovalBtn.querySelector('span').textContent = 'Waiting for approval…';
                pollRequestStatus(result.requestId, field(e, ['name', 'Employee Name']), verifiedBranchRequest.branch, verifiedBranchRequest.distance, verifiedBranchRequest.accuracy);
            } else {
                requestApprovalBtn.disabled = false;
                requestApprovalBtn.querySelector('span').textContent = 'Request approval from admin';
                branchRequestStatus.textContent = (result && result.message) || 'Could not send the request.';
                branchRequestStatus.className = 'password-status error';
            }
        } catch (_) {
            requestApprovalBtn.disabled = false;
            requestApprovalBtn.querySelector('span').textContent = 'Request approval from admin';
            branchRequestStatus.textContent = 'Could not reach the server. Try again.';
            branchRequestStatus.className = 'password-status error';
        }
    });
}

function pollRequestStatus(requestId, employeeName, branch, distance, accuracy) {
    if (branchRequestPollTimer) clearInterval(branchRequestPollTimer);
    branchRequestPollTimer = setInterval(async () => {
        try {
            const r = await fetch(`${API_URL}?action=checkRequestStatus&requestId=${encodeURIComponent(requestId)}`);
            const result = await r.json();
            if (result && result.ok && result.found) {
                if (result.status === 'Approved') {
                    clearInterval(branchRequestPollTimer); branchRequestPollTimer = null;
                    branchRequestStatus.textContent = 'Approved ✓ Signing you in…';
                    branchRequestStatus.className = 'password-status success';
                    saveSignInAndRedirect({
                        employee: employeeName, branch: branch, distance: distance, accuracy: accuracy,
                        signedInAt: result.reviewedAt || new Date().toISOString(), role: verifiedRole, viaApproval: true
                    }, 1200);
                } else if (result.status === 'Rejected') {
                    clearInterval(branchRequestPollTimer); branchRequestPollTimer = null;
                    requestApprovalBtn.disabled = false;
                    requestApprovalBtn.querySelector('span').textContent = 'Request approval from admin';
                    branchRequestStatus.textContent = 'Your admin declined this request.';
                    branchRequestStatus.className = 'password-status error';
                }
            }
        } catch (_) {/* keep polling silently */ }
    }, 3000);
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
                    setMobileLocation('You’re signed in ✓', `${Math.round(meters)}m from ${branch} · Check the desktop screen to continue.`, 'ready');
                    btn.querySelector('span').textContent = 'Signed in';
                    // Mobile stays here — it was only used to verify location.
                    // The desktop (polling checkSession) is what moves on to home.html.
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

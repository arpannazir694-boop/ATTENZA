/**
 * ATTENZA — Smart Reports Security & Password Gate
 *
 * Password required to access Smart Reports & Analytics: "Attenza#0000"
 */

const REPORTS_PASSWORD = 'Attenza#0000';

function isReportsUnlocked() {
    try {
        return sessionStorage.getItem('attenza_reports_unlocked') === '1';
    } catch (_) {
        return false;
    }
}

function setReportsUnlocked() {
    try {
        sessionStorage.setItem('attenza_reports_unlocked', '1');
    } catch (_) { }
}

function clearReportsUnlocked() {
    try {
        sessionStorage.removeItem('attenza_reports_unlocked');
    } catch (_) { }
}

function ensureReportsAuthModal() {
    let modal = document.getElementById('reportsAuthModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'reportsAuthModal';
        modal.className = 'modal';
        modal.setAttribute('aria-hidden', 'true');
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.setAttribute('aria-labelledby', 'reportsAuthTitle');

        modal.innerHTML = `
            <div class="modal-card reports-auth-card" id="reportsAuthCard">
                <button class="modal-close" id="closeReportsAuth" type="button" aria-label="Close">×</button>
                <p class="step-label" style="margin-bottom:10px">RESTRICTED ACCESS · SMART REPORTS</p>
                <h3 id="reportsAuthTitle" style="font-size:24px;margin-bottom:8px">Enter Password</h3>
                <p class="modal-copy" style="margin-bottom:16px">Enter the security password to unlock Smart Reports & All Branches Analytics.</p>
                
                <form id="reportsAuthForm" onsubmit="return false;">
                    <div class="password-card" style="margin:0 0 8px;background:#fff;padding:12px">
                        <label for="reportsAuthPassword" style="font-size:9.5px;margin-bottom:6px">ADMIN PASSWORD</label>
                        <div class="password-row">
                            <div class="password-field">
                                <input type="password" id="reportsAuthPassword" placeholder="Enter password" autocomplete="off" />
                                <button class="eye-btn" id="toggleReportsAuthPassword" type="button" aria-label="Show password" aria-pressed="false">
                                    <svg class="eye-icon eye-open" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                        <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z" />
                                        <circle cx="12" cy="12" r="3" />
                                    </svg>
                                    <svg class="eye-icon eye-closed" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                        <path d="M17.94 17.94A10.94 10.94 0 0 1 12 19c-7 0-11-7-11-7a20.3 20.3 0 0 1 5.06-5.94M9.9 4.24A10.4 10.4 0 0 1 12 4c7 0 11 7 11 7a20.3 20.3 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                                        <path d="M1 1l22 22" />
                                    </svg>
                                </button>
                            </div>
                            <button class="verify-btn" id="submitReportsAuth" type="button">UNLOCK</button>
                        </div>
                        <p class="password-status" id="reportsAuthStatus" aria-live="polite" style="margin-top:8px;font-size:11.5px"></p>
                    </div>
                </form>
            </div>
        `;
        document.body.appendChild(modal);
    }
    bindReportsAuthEvents(modal);
    return modal;
}

function bindReportsAuthEvents(modal) {
    if (modal._eventsBound) return;
    modal._eventsBound = true;

    const closeBtn = modal.querySelector('#closeReportsAuth');
    const input = modal.querySelector('#reportsAuthPassword');
    const toggleBtn = modal.querySelector('#toggleReportsAuthPassword');
    const submitBtn = modal.querySelector('#submitReportsAuth');
    const status = modal.querySelector('#reportsAuthStatus');
    const card = modal.querySelector('#reportsAuthCard');

    function closeModal() {
        modal.classList.remove('open');
        modal.setAttribute('aria-hidden', 'true');
        if (input) input.value = '';
        if (status) {
            status.textContent = '';
            status.className = 'password-status';
        }
        const isReportsPage = window.location.pathname.endsWith('reports.html') || window.location.href.includes('reports.html');
        if (isReportsPage && !isReportsUnlocked()) {
            window.location.href = 'home.html';
        }
    }

    if (closeBtn) closeBtn.addEventListener('click', closeModal);

    modal.addEventListener('click', e => {
        if (e.target === modal) closeModal();
    });

    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && modal.classList.contains('open')) {
            closeModal();
        }
    });

    if (toggleBtn && input) {
        toggleBtn.addEventListener('click', () => {
            const isPressed = toggleBtn.getAttribute('aria-pressed') === 'true';
            toggleBtn.setAttribute('aria-pressed', String(!isPressed));
            input.type = isPressed ? 'password' : 'text';
            toggleBtn.setAttribute('aria-label', isPressed ? 'Show password' : 'Hide password');
        });
    }

    function verifyAndUnlock() {
        const val = (input ? input.value : '').trim();
        if (!val) {
            if (status) {
                status.textContent = 'Please enter the password.';
                status.className = 'password-status error';
            }
            if (input) input.focus();
            return;
        }

        if (val === REPORTS_PASSWORD) {
            setReportsUnlocked();
            try { sessionStorage.setItem('attenza_speak_welcome', '1'); } catch (_) { }

            if (status) {
                status.textContent = '✓ Access granted. Opening reports…';
                status.className = 'password-status success';
            }
            if (typeof SoundFx !== 'undefined') {
                if (SoundFx.speak) SoundFx.speak('Welcome to Attenza Smart Reports');
            }

            const isReportsPage = window.location.pathname.endsWith('reports.html') || window.location.href.includes('reports.html');

            setTimeout(() => {
                modal.classList.remove('open');
                modal.setAttribute('aria-hidden', 'true');
                if (isReportsPage) {
                    if (typeof window.onReportsUnlocked === 'function') {
                        window.onReportsUnlocked();
                    } else {
                        window.location.reload();
                    }
                } else {
                    const main = document.querySelector('.home-main');
                    if (main) main.classList.add('page-leaving');
                    setTimeout(() => {
                        window.location.href = 'reports.html';
                    }, 150);
                }
            }, 400);
        } else {
            if (status) {
                status.textContent = 'Incorrect password. Access denied.';
                status.className = 'password-status error';
            }
            if (card) {
                card.classList.remove('shake');
                void card.offsetWidth;
                card.classList.add('shake');
            }
            if (input) {
                input.value = '';
                input.focus();
            }
        }
    }

    if (submitBtn) submitBtn.addEventListener('click', verifyAndUnlock);
    if (input) {
        input.addEventListener('keydown', e => {
            if (e.key === 'Enter') {
                e.preventDefault();
                verifyAndUnlock();
            }
        });
    }
}

function openReportsAuthModal() {
    const modal = ensureReportsAuthModal();
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    const input = modal.querySelector('#reportsAuthPassword');
    const status = modal.querySelector('#reportsAuthStatus');
    if (status) {
        status.textContent = '';
        status.className = 'password-status';
    }
    if (input) {
        input.value = '';
        setTimeout(() => input.focus(), 80);
    }
}

function initReportsAuthGuard() {
    ensureReportsAuthModal();

    document.querySelectorAll('a[href="reports.html"], #smartReportsLink').forEach(link => {
        link.addEventListener('click', e => {
            if (!isReportsUnlocked()) {
                e.preventDefault();
                e.stopImmediatePropagation();
                openReportsAuthModal();
            }
        }, true);
    });

    const signOutBtn = document.getElementById('signOut');
    if (signOutBtn) {
        signOutBtn.addEventListener('click', () => {
            clearReportsUnlocked();
        });
    }

    const isReportsPage = window.location.pathname.endsWith('reports.html') || window.location.href.includes('reports.html');
    if (isReportsPage) {
        if (!isReportsUnlocked()) {
            openReportsAuthModal();
        } else {
            try {
                if (sessionStorage.getItem('attenza_speak_welcome') === '1') {
                    sessionStorage.removeItem('attenza_speak_welcome');
                    setTimeout(() => {
                        if (typeof SoundFx !== 'undefined' && SoundFx.speak) {
                            SoundFx.speak('Welcome to Attenza Smart Reports');
                        }
                    }, 350);
                }
            } catch (_) { }
        }
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initReportsAuthGuard);
} else {
    initReportsAuthGuard();
}

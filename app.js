// Firebase configuration - Load from config.js file
let firebaseConfig;
let db;

try {
    // eslint-disable-next-line no-undef
    firebaseConfig = window.firebaseConfig;
    if (!firebaseConfig || !firebaseConfig.apiKey || firebaseConfig.apiKey === 'YOUR_API_KEY') {
        throw new Error('Firebase config not properly set');
    }
    
    // Initialize Firebase
    firebase.initializeApp(firebaseConfig);
    db = firebase.firestore();
} catch (error) {
    console.error('Firebase configuration error:', error);
    document.body.innerHTML = `
        <div style="display: flex; justify-content: center; align-items: center; min-height: 100vh; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px;">
            <div style="background: white; padding: 40px; border-radius: 16px; max-width: 600px; box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);">
                <h2 style="color: #667eea; margin-bottom: 20px;">⚠️ Setup Required</h2>
                <p style="margin-bottom: 15px; line-height: 1.6;">You need to configure Firebase before using the app.</p>
                <ol style="margin-left: 20px; margin-bottom: 20px; line-height: 2;">
                    <li>Create a file named <strong>config.js</strong> in your project folder</li>
                    <li>Add your Firebase configuration to it</li>
                    <li>Update <strong>index.html</strong> to include config.js</li>
                </ol>
                <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
                    <p style="margin-bottom: 10px; font-weight: bold;">Example config.js content:</p>
                    <pre style="background: white; padding: 10px; border-radius: 4px; overflow-x: auto;"><code>window.firebaseConfig = {
  apiKey: "your-api-key-here",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "your-app-id"
};</code></pre>
                </div>
                <p style="line-height: 1.6;">📖 See README.md for detailed Firebase setup instructions.</p>
            </div>
        </div>
    `;
}

// State management
let currentDate = new Date();
let currentUser = localStorage.getItem('currentUser') || '';
let currentUserData = null;
let currentUserDataPromise = null;
let currentUserDocUnsubscribe = null;
let selectedDate = null;
let stravaActivities = {}; // Cache of activities by date (YYYY-MM-DD)
let activeFilters = {
    work: true,
    health: true
}; // Track which filters are active

let hideWeekends = localStorage.getItem('hideWeekends') === 'true';

// What-If mode: tentative location overrides not persisted to Firebase
let whatIfMode = false;
let whatIfData = {}; // dateKey -> 'home' | 'office' | 'nonworkday' | null (clear)
let whatIfWindowEnd = null; // Date (Monday of the chosen end week) or null for auto

// Returns true if the given Date is today or in the future (date-only comparison)
function isFutureOrToday(date) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d.getTime() >= today.getTime();
}

// Returns a merged data view (real user data + what-if overlay) for rendering & stats.
// If whatIfData[key] === null, treat as a "clear" override (overrides any real value).
function getEffectiveData(baseData) {
    const base = baseData || currentUserData || {};
    if (!whatIfMode) return base;
    const merged = Object.assign({}, base);
    Object.keys(whatIfData).forEach(key => {
        const v = whatIfData[key];
        if (v === null) {
            delete merged[key];
        } else {
            merged[key] = v;
        }
    });
    return merged;
}

function clearCurrentUserData() {
    currentUserData = null;
    currentUserDataPromise = null;
}

function getCurrentUserData() {
    if (!currentUser || !db) {
        return Promise.resolve({});
    }
    if (currentUserData) {
        return Promise.resolve(currentUserData);
    }
    if (currentUserDataPromise) {
        return currentUserDataPromise;
    }

    currentUserDataPromise = db.collection('users').doc(currentUser).get()
        .then(doc => {
            currentUserData = doc.exists ? doc.data() : {};
            return currentUserData;
        })
        .catch(error => {
            console.error('Error loading user data:', error);
            currentUserData = {};
            return currentUserData;
        })
        .finally(() => {
            currentUserDataPromise = null;
        });

    return currentUserDataPromise;
}

function subscribeToUserDoc() {
    if (!currentUser || !db) return;

    if (typeof currentUserDocUnsubscribe === 'function') {
        currentUserDocUnsubscribe();
        currentUserDocUnsubscribe = null;
    }

    clearCurrentUserData();

    currentUserDocUnsubscribe = db.collection('users').doc(currentUser).onSnapshot(doc => {
        currentUserData = doc.exists ? doc.data() : {};
        renderCalendar();
        updateStats();
    }, error => {
        console.error('User document snapshot error:', error);
    });
}

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    // Check if we're returning from Strava OAuth
    handleStravaOAuthCallback();
    initializeApp();
    setupAccessibleModals();
});

// Centralized accessibility behavior for all `.modal` dialogs: focus is moved
// into a dialog when it opens and restored when it closes, Tab is trapped
// inside the open dialog, and Escape (or Enter/Space on the × control) closes
// it. A MutationObserver watches each modal's inline display so we don't have
// to hook the ~15 scattered show/hide call sites.
function setupAccessibleModals() {
    let lastFocused = null;

    const isVisible = (el) => !!el && el.style.display !== 'none' && el.offsetParent !== null;

    // The most recently shown visible modal is the active one (modals don't stack
    // here, but this is robust if one is opened from another).
    const activeModal = () =>
        Array.from(document.querySelectorAll('.modal')).filter(isVisible).pop() || null;

    const focusableIn = (modal) =>
        Array.from(modal.querySelectorAll(
            'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )).filter(el => el.offsetParent !== null);

    document.querySelectorAll('.modal').forEach((modal) => {
        // Make the dialog container itself programmatically focusable so that,
        // on open, focus lands on it and screen readers announce the dialog's
        // accessible name (aria-labelledby) rather than the × button.
        const dialog = modal.querySelector('[role="dialog"]') || modal;
        if (!dialog.hasAttribute('tabindex')) dialog.setAttribute('tabindex', '-1');

        let wasVisible = isVisible(modal);
        new MutationObserver(() => {
            const visible = isVisible(modal);
            if (visible && !wasVisible) {
                lastFocused = document.activeElement;
                dialog.focus();
            } else if (!visible && wasVisible) {
                if (lastFocused && typeof lastFocused.focus === 'function') lastFocused.focus();
                lastFocused = null;
            }
            wasVisible = visible;
        }).observe(modal, { attributes: true, attributeFilter: ['style'] });
    });

    document.addEventListener('keydown', (e) => {
        // Activate the × close control with the keyboard.
        if ((e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') &&
            e.target.classList && e.target.classList.contains('close')) {
            e.preventDefault();
            e.target.click();
            return;
        }

        const modal = activeModal();
        if (!modal) return;

        if (e.key === 'Escape') {
            e.preventDefault();
            modal.style.display = 'none';
            return;
        }

        if (e.key === 'Tab') {
            const f = focusableIn(modal);
            if (f.length === 0) { e.preventDefault(); return; }
            const first = f[0];
            const last = f[f.length - 1];
            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first.focus();
            }
        }
    });
}

// Handle OAuth callback from Strava
function handleStravaOAuthCallback() {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const error = urlParams.get('error');
    
    if (error) {
        console.error('Strava OAuth error:', error);
        // Show error in settings modal if it's open
        const statusDiv = document.getElementById('stravaAuthStatus');
        if (statusDiv) {
            statusDiv.style.display = 'block';
            statusDiv.style.background = '#ffebee';
            statusDiv.style.color = '#c62828';
            statusDiv.innerHTML = `❌ Authorization failed: ${error}`;
        } else {
        alert(`Strava authorization failed: ${error}`);
        }
        // Clean up URL
        window.history.replaceState({}, document.title, window.location.pathname);
        return;
    }
    
    if (code) {
        // Try to automatically exchange code for token using stored credentials
        const storedClientId = sessionStorage.getItem('stravaClientId');
        const storedClientSecret = sessionStorage.getItem('stravaClientSecret');
        
        if (storedClientId && storedClientSecret) {
            // Open settings modal if not already open to show status
            const settingsModal = document.getElementById('settingsModal');
            const configSection = document.getElementById('stravaConfigSection');
            if (settingsModal && configSection) {
                settingsModal.style.display = 'block';
                configSection.style.display = 'block';
            }
            // Automatically exchange code for token
            exchangeStravaCodeForToken(code, storedClientId, storedClientSecret);
        } else {
            // Fallback to old manual method if credentials not stored
        const modal = document.getElementById('stravaModal');
        if (modal) {
            modal.style.display = 'block';
            const tokenInput = document.getElementById('stravaTokenInput');
            if (tokenInput) {
                tokenInput.placeholder = 'Authorization code received! Follow the steps below to exchange it for a token.';
            }
            
            // Show instructions for exchanging code
            const instructions = document.querySelector('.strava-connect-section');
            if (instructions) {
                instructions.innerHTML = `
                    <p style="color: #4caf50; font-weight: 600;">✅ Authorization code received!</p>
                    <p>Your authorization code: <code style="background: #f5f5f5; padding: 4px 8px; border-radius: 4px;">${code}</code></p>
                    <p>To exchange this code for an access token, you need to make a POST request:</p>
                    <div style="background: #f5f5f5; padding: 15px; border-radius: 8px; margin: 15px 0; font-family: monospace; font-size: 0.9em;">
                        <strong>POST</strong> https://www.strava.com/oauth/token<br><br>
                        <strong>Body (form-data or JSON):</strong><br>
                        client_id: YOUR_CLIENT_ID<br>
                        client_secret: YOUR_CLIENT_SECRET<br>
                        code: ${code}<br>
                        grant_type: authorization_code
                    </div>
                    <p>You can use <a href="https://www.postman.com/" target="_blank">Postman</a>, <a href="https://httpie.io/" target="_blank">HTTPie</a>, or curl to make this request.</p>
                    <p style="margin-top: 15px; padding: 10px; background: #e3f2fd; border-radius: 8px; font-size: 0.9rem;">
                        <strong>Example with curl:</strong><br>
                        <code style="font-size: 0.85em; display: block; margin-top: 5px;">
                            curl -X POST https://www.strava.com/oauth/token \\<br>
                            &nbsp;&nbsp;-d client_id=YOUR_CLIENT_ID \\<br>
                            &nbsp;&nbsp;-d client_secret=YOUR_CLIENT_SECRET \\<br>
                            &nbsp;&nbsp;-d code=${code} \\<br>
                            &nbsp;&nbsp;-d grant_type=authorization_code
                        </code>
                    </p>
                    <p>Once you get the response, paste the <strong>access_token</strong> below:</p>
                    <div style="margin: 20px 0;">
                        <label for="stravaTokenInput" style="display: block; margin-bottom: 8px; font-weight: 600;">Access Token:</label>
                        <input type="text" id="stravaTokenInput" placeholder="Paste your access token here" 
                               style="width: 100%; padding: 10px; border: 2px solid #e0e0e0; border-radius: 8px; font-size: 14px;">
                    </div>
                    <button id="saveStravaToken" class="location-btn office-btn" style="width: 100%; margin-top: 10px;">
                        Save Token
                    </button>
                `;
                
                // Re-initialize the save button listener after innerHTML replacement
                setTimeout(() => {
                    const saveBtn = document.getElementById('saveStravaToken');
                    if (saveBtn) {
                        // Remove any existing listeners by cloning
                        const newSaveBtn = saveBtn.cloneNode(true);
                        saveBtn.replaceWith(newSaveBtn);
                        // Add event listener to the new button
                        newSaveBtn.addEventListener('click', () => {
                            const token = document.getElementById('stravaTokenInput').value.trim();
                            if (token) {
                                saveStravaToken(token, null);
                            } else {
                                alert('Please enter an access token');
                            }
                        });
                    }
                }, 0);
                }
            }
        }
        
        // Clean up URL
        window.history.replaceState({}, document.title, window.location.pathname);
    }
}


function initializeApp() {
    // Load saved user name
    if (currentUser) {
        document.getElementById('userName').value = currentUser;
        updateUserStatus();
    }

    // Event listeners
    document.getElementById('setUserName').addEventListener('click', setUserName);
    document.getElementById('prevMonth').addEventListener('click', () => changeMonth(-1));
    document.getElementById('nextMonth').addEventListener('click', () => changeMonth(1));
    
    // Filter button listeners
    document.getElementById('workFilter').addEventListener('click', () => toggleFilter('work'));
    document.getElementById('healthFilter').addEventListener('click', () => toggleFilter('health'));

    // What-If mode listeners
    document.getElementById('whatIfToggle').addEventListener('click', toggleWhatIfMode);
    document.getElementById('clearWhatIf').addEventListener('click', clearWhatIf);

    // BELT overview modal
    document.getElementById('beltOverviewBtn').addEventListener('click', openBeltOverview);
    document.getElementById('beltOverviewClose').addEventListener('click', closeBeltOverview);

    // Hide-weekends toggle
    document.getElementById('hideWeekendsToggle').addEventListener('click', toggleHideWeekends);
    applyHideWeekends();

    // Close modal when clicking outside
    window.addEventListener('click', (e) => {
        const modal = document.getElementById('modal');
        if (e.target === modal) {
            closeModal();
        }
        const beltModal = document.getElementById('beltOverviewModal');
        if (e.target === beltModal) {
            closeBeltOverview();
        }
    });

    // Render calendar
    renderCalendar();
    
    // Initialize modal listeners
    initializeModalListeners();
    
    // Initialize Strava buttons
    initializeStravaButtons();
    
    // Initialize Garmin buttons
    initializeGarminButtons();
    
    // Initialize Settings modal
    initializeSettingsModal();
    
    // Subscribe to live user data updates if a user is already selected
    if (currentUser) {
        subscribeToUserDoc();
    }

    // Load Strava connection status
    if (currentUser) {
        checkStravaConnection();
    }
    
    // Load Garmin connection status
    if (currentUser) {
        checkGarminConnection();
    }
    
    // Update stats (even if no user, to show "-")
    updateStats();
}

function initializeModalListeners() {
    // Close button
    const closeBtn = document.querySelector('.close');
    if (closeBtn) {
        const newCloseBtn = closeBtn.cloneNode(true);
        closeBtn.replaceWith(newCloseBtn);
        newCloseBtn.addEventListener('click', closeModal);
    }
    
    // Location buttons
    document.querySelectorAll('.location-btn').forEach(btn => {
        const newBtn = btn.cloneNode(true);
        btn.replaceWith(newBtn);
    });
    document.querySelectorAll('.location-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const location = e.currentTarget.getAttribute('data-location');
            saveLocation(selectedDate, location);
        });
    });
}

// Hash a (username, password) pair with SHA-256 using a fixed app salt + the
// normalized username as an additional per-user salt. Returns hex string.
async function hashPassword(name, password) {
    const salt = 'wlc::v1::' + name.trim().toLowerCase();
    const encoder = new TextEncoder();
    const data = encoder.encode(salt + '::' + password);
    const buf = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(buf))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}

async function setUserName() {
    const userNameInput = document.getElementById('userName');
    const name = userNameInput.value.trim();

    if (!name) {
        alert('Please enter your name');
        return;
    }

    if (!db) {
        alert('Database not initialized — cannot verify password.');
        return;
    }

    // Look up the user's doc to decide between verify and first-time setup.
    let docSnap;
    try {
        docSnap = await db.collection('users').doc(name).get();
    } catch (err) {
        console.error('Error reading user doc:', err);
        alert('Could not reach the database. Please try again.');
        return;
    }

    const existingHash = docSnap.exists ? docSnap.data().passwordHash : null;

    if (existingHash) {
        // Existing protected user → verify
        const entered = window.prompt(`Enter password for "${name}":`);
        if (entered === null) return; // cancelled
        const enteredHash = await hashPassword(name, entered);
        if (enteredHash !== existingHash) {
            alert('Incorrect password.');
            return;
        }
    } else {
        // First-time setup (or pre-existing user without a password) → create one.
        const msg = docSnap.exists
            ? `User "${name}" doesn't have a password yet. Set one now:`
            : `Create a password for new user "${name}":`;
        const newPwd = window.prompt(msg);
        if (newPwd === null) return; // cancelled
        if (!newPwd || newPwd.length < 4) {
            alert('Password must be at least 4 characters.');
            return;
        }
        const confirmPwd = window.prompt('Confirm password:');
        if (confirmPwd === null) return;
        if (confirmPwd !== newPwd) {
            alert('Passwords do not match.');
            return;
        }
        const newHash = await hashPassword(name, newPwd);
        try {
            await db.collection('users').doc(name).set({ passwordHash: newHash }, { merge: true });
        } catch (err) {
            console.error('Error saving password:', err);
            alert('Could not save password. Please try again.');
            return;
        }
    }

    currentUser = name;
    localStorage.setItem('currentUser', currentUser);
    updateUserStatus();
    clearCurrentUserData();
    subscribeToUserDoc();

    // Check Strava and Garmin connection status after setting user
    checkStravaConnection();
    checkGarminConnection();

    renderCalendar(); // This will also update stats
    updateStats(); // Also update stats directly
}

function updateUserStatus() {
    const statusDiv = document.getElementById('userStatus');
    if (currentUser) {
        statusDiv.textContent = `Logged in as: ${currentUser}`;
        statusDiv.style.display = 'block';
    } else {
        statusDiv.style.display = 'none';
    }
}

function changeMonth(direction) {
    currentDate.setMonth(currentDate.getMonth() + direction);
    renderCalendar();
}

function toggleFilter(filterType) {
    activeFilters[filterType] = !activeFilters[filterType];
    
    // Update button appearance
    const button = document.getElementById(filterType + 'Filter');
    if (activeFilters[filterType]) {
        button.classList.add('active');
    } else {
        button.classList.remove('active');
    }
    
    // Re-render calendar to update stats
    renderCalendar();
}

function toggleWhatIfMode() {
    whatIfMode = !whatIfMode;
    const toggleBtn = document.getElementById('whatIfToggle');
    const clearBtn = document.getElementById('clearWhatIf');
    const banner = document.getElementById('whatIfBanner');
    const beltCard = document.getElementById('beltCard');
    const beltLabel = document.getElementById('beltLabel');
    const windowInput = document.getElementById('whatIfWindowEnd');

    if (whatIfMode) {
        toggleBtn.classList.add('active');
        clearBtn.style.display = '';
        banner.style.display = '';
        beltCard.classList.add('what-if-active');
        beltLabel.textContent = 'BELT (What-If)';

        // Default window end = current week's Monday on first activation
        if (!whatIfWindowEnd) {
            whatIfWindowEnd = getMondayOfWeek(new Date());
        }
        if (windowInput && !windowInput.dataset.bound) {
            windowInput.addEventListener('change', onWhatIfWindowChange);
            windowInput.dataset.bound = 'true';
        }
        if (windowInput) {
            windowInput.value = formatDateKey(whatIfWindowEnd);
        }
        updateWhatIfWindowRangeDisplay();
    } else {
        toggleBtn.classList.remove('active');
        clearBtn.style.display = 'none';
        banner.style.display = 'none';
        beltCard.classList.remove('what-if-active');
        beltLabel.textContent = 'BELT';
    }
    renderCalendar();
}

function onWhatIfWindowChange(e) {
    const value = e.target.value;
    if (!value) return;
    const picked = parseDateKey(value);
    if (isNaN(picked.getTime())) return;
    whatIfWindowEnd = getMondayOfWeek(picked);
    // Normalize the input back to the Monday of the picked week
    e.target.value = formatDateKey(whatIfWindowEnd);
    updateWhatIfWindowRangeDisplay();
    renderCalendar();
}

function updateWhatIfWindowRangeDisplay() {
    const rangeEl = document.getElementById('whatIfWindowRange');
    if (!rangeEl || !whatIfWindowEnd) return;
    const end = new Date(whatIfWindowEnd);
    const endSunday = new Date(end);
    endSunday.setDate(endSunday.getDate() + 6);
    const start = new Date(end);
    start.setDate(start.getDate() - 11 * 7);
    const fmt = d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    rangeEl.textContent = `(window: ${fmt(start)} → ${fmt(endSunday)})`;
}

function clearWhatIf() {
    whatIfData = {};
    if (whatIfMode) {
        renderCalendar();
    }
}

function toggleHideWeekends() {
    hideWeekends = !hideWeekends;
    localStorage.setItem('hideWeekends', hideWeekends ? 'true' : 'false');
    applyHideWeekends();
}

function applyHideWeekends() {
    const container = document.querySelector('.calendar-container');
    const btn = document.getElementById('hideWeekendsToggle');
    const label = document.getElementById('hideWeekendsLabel');
    if (!container) return;
    if (hideWeekends) {
        container.classList.add('hide-weekends');
        if (btn) btn.classList.add('active');
        if (label) label.textContent = 'Show Weekends';
    } else {
        container.classList.remove('hide-weekends');
        if (btn) btn.classList.remove('active');
        if (label) label.textContent = 'Hide Weekends';
    }
}

async function openBeltOverview() {
    const modal = document.getElementById('beltOverviewModal');
    const title = document.getElementById('beltOverviewTitle');
    const summary = document.getElementById('beltOverviewSummary');
    const body = document.getElementById('beltOverviewBody');
    if (!modal) return;

    body.innerHTML = '';
    summary.innerHTML = 'Loading…';
    title.textContent = whatIfMode ? 'BELT Overview (What-If)' : 'BELT Overview';
    modal.style.display = 'block';

    if (!currentUser || !db) {
        summary.innerHTML = 'Set your name to see your BELT breakdown.';
        return;
    }

    const rawData = currentUserData || await getCurrentUserData();
    const stats = whatIfMode
        ? computeWorkStats(getEffectiveData(rawData || {}), true, whatIfWindowEnd)
        : computeWorkStats(rawData || {});

    const fmtDate = d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const windowEndSunday = new Date(stats.windowEnd);
    windowEndSunday.setDate(windowEndSunday.getDate() + 6);

    const beltText = whatIfMode
        ? stats.beltAverage.toFixed(2)
        : (stats.best8WeeksCount > 0 ? stats.beltAverage.toFixed(2) : '-');
    summary.innerHTML = `
        <div><strong>Window:</strong> ${fmtDate(stats.windowStart)} → ${fmtDate(windowEndSunday)}</div>
        <div><strong>BELT:</strong> ${beltText}
            (best ${stats.best8WeeksCount} of ${stats.last12Weeks.length} weeks)</div>
        ${whatIfMode ? '<div><em>Highlighted rows are the weeks counted in BELT.</em></div>' : ''}
    `;

    const fmtShort = d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    body.innerHTML = stats.last12Weeks
        .map((w, i) => {
            const weekStart = w.weekStart;
            const weekEnd = new Date(weekStart);
            weekEnd.setDate(weekEnd.getDate() + 6);
            const rowClass = !w.hasData ? 'no-data' : (w.inBest8 ? 'in-best8' : '');
            const officeDisplay = w.hasData ? w.officeDays : '—';
            const badge = w.inBest8
                ? '<span class="badge yes">✓ counted</span>'
                : '<span class="badge no">—</span>';
            return `
                <tr class="${rowClass}">
                    <td>${i + 1}</td>
                    <td>${fmtShort(weekStart)} – ${fmtShort(weekEnd)}</td>
                    <td>${officeDisplay}</td>
                    <td>${badge}</td>
                </tr>
            `;
        })
        .join('');
}

function closeBeltOverview() {
    const modal = document.getElementById('beltOverviewModal');
    if (modal) modal.style.display = 'none';
}

async function renderCalendar() {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const rawUserData = currentUser ? await getCurrentUserData() : null;
    const userData = getEffectiveData(rawUserData);
    
    // Update month/year display
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'];
    document.getElementById('currentMonthYear').textContent = `${monthNames[month]} ${year}`;
    
    // Update navigation button text with month names
    const prevMonthIndex = month === 0 ? 11 : month - 1;
    const nextMonthIndex = month === 11 ? 0 : month + 1;
    document.getElementById('prevMonth').textContent = `← ${monthNames[prevMonthIndex]}`;
    document.getElementById('nextMonth').textContent = `${monthNames[nextMonthIndex]} →`;

    // Get first day of month and number of days
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    // Adjust for Monday as first day: 0 (Sunday) becomes 6, other days shift
    const startingDayOfWeek = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;

    const calendarGrid = document.getElementById('calendarGrid');
    calendarGrid.innerHTML = '';

    // Calculate previous month's days to show
    const prevMonth = month === 0 ? 11 : month - 1;
    const prevYear = month === 0 ? year - 1 : year;
    const prevMonthLastDay = new Date(year, month, 0); // Last day of previous month
    const daysInPrevMonth = prevMonthLastDay.getDate();

    // Helper function to create placeholder stats cell
    function createPlaceholderStatsCell() {
        const statsCell = document.createElement('div');
        statsCell.className = 'week-stats-cell';
        statsCell.innerHTML = '<div class="stat-item"><span class="stat-label">Loading...</span></div>';
        statsCell.dataset.statsPlaceholder = 'true';
        return statsCell;
    }
    
    // Track total day elements added (not including stats cells)
    let dayElementsAdded = 0;
    
    // Add previous month's days to complete the first week
    const today = new Date();
    for (let i = 0; i < startingDayOfWeek; i++) {
        const prevDay = daysInPrevMonth - startingDayOfWeek + i + 1;
        const prevDate = new Date(prevYear, prevMonth, prevDay);
        const prevDayElement = createDayElement(prevDay, prevYear, prevMonth);
        prevDayElement.classList.add('other-month');
        
        // Highlight today if it falls in previous month
        if (prevDate.toDateString() === today.toDateString()) {
            prevDayElement.classList.add('today');
        }
        
        // Load location data for previous month day
        loadDayLocation(prevYear, prevMonth, prevDay, prevDayElement, userData);
        
        // Load Strava workout data
        loadStravaWorkout(prevYear, prevMonth, prevDay, prevDayElement);
        
        // Load Garmin workout data
        loadGarminWorkout(prevYear, prevMonth, prevDay, prevDayElement);
        
        calendarGrid.appendChild(prevDayElement);
        dayElementsAdded++;
        
        // Insert stats cell after Sunday (every 7 day elements)
        if (dayElementsAdded % 7 === 0) {
            calendarGrid.appendChild(createPlaceholderStatsCell());
        }
    }

    // Add days of the current month
    for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(year, month, day);
        const dayElement = createDayElement(day, year, month);
        
        // Highlight today
        if (date.toDateString() === today.toDateString()) {
            dayElement.classList.add('today');
        }

        // Load location data for this day
        loadDayLocation(year, month, day, dayElement, userData);
        
        // Load Strava workout data
        loadStravaWorkout(year, month, day, dayElement);
        
        // Load Garmin workout data
        loadGarminWorkout(year, month, day, dayElement);

        calendarGrid.appendChild(dayElement);
        dayElementsAdded++;
        
        // Insert stats cell after Sunday (every 7 day elements)
        if (dayElementsAdded % 7 === 0) {
            calendarGrid.appendChild(createPlaceholderStatsCell());
        }
    }

    // Add next month's days to complete the last week (always show complete weeks)
    const totalCells = startingDayOfWeek + daysInMonth;
    const remainingCells = 7 - (totalCells % 7);
    
    if (remainingCells > 0 && remainingCells < 7) {
        const nextMonth = month === 11 ? 0 : month + 1;
        const nextYear = month === 11 ? year + 1 : year;
        for (let i = 1; i <= remainingCells; i++) {
            const nextDate = new Date(nextYear, nextMonth, i);
            const nextDayElement = createDayElement(i, nextYear, nextMonth);
            nextDayElement.classList.add('other-month');
            
            // Highlight today if it falls in next month
            if (nextDate.toDateString() === today.toDateString()) {
                nextDayElement.classList.add('today');
            }
            
            // Load location data for next month day
            loadDayLocation(nextYear, nextMonth, i, nextDayElement, userData);
            
            calendarGrid.appendChild(nextDayElement);
            dayElementsAdded++;
            
            // Insert stats cell after Sunday (every 7 day elements)
            if (dayElementsAdded % 7 === 0) {
                calendarGrid.appendChild(createPlaceholderStatsCell());
            }
        }
    }
    
    // After all days are added, remove weeks that are entirely from next month or previous month
    const allDayElements = Array.from(calendarGrid.querySelectorAll('.calendar-day'));
    const allChildren = Array.from(calendarGrid.children);
    const statsElements = allChildren.filter(child => child.classList.contains('week-stats-cell'));
    
    // Group days into weeks (7 days per week) and track their original positions
    const weeks = [];
    for (let i = 0; i < allDayElements.length; i += 7) {
        weeks.push({
            days: allDayElements.slice(i, i + 7),
            startIndex: i
        });
    }
    
    // Check each week and remove if entirely from next month or previous month
    for (let weekIndex = weeks.length - 1; weekIndex >= 0; weekIndex--) {
        const week = weeks[weekIndex];
        const weekDays = week.days;
        
        // Check if all days are from next month (they're at the end and have other-month class)
        const allFromNextMonth = weekDays.every(dayElement => {
            return dayElement.classList.contains('other-month') && 
                   !dayElement.classList.contains('today');
        }) && week.startIndex >= startingDayOfWeek + daysInMonth;
        
        // Check if all days are from previous month (they're at the beginning and have other-month class)
        const allFromPrevMonth = weekDays.every(dayElement => {
            return dayElement.classList.contains('other-month') && 
                   !dayElement.classList.contains('today');
        }) && week.startIndex < startingDayOfWeek;
        
        if (allFromNextMonth || allFromPrevMonth) {
            // Remove this week's days
            weekDays.forEach(dayElement => dayElement.remove());
            
            // Remove corresponding stats cell
            // Stats cells are inserted after every 7 days, so weekIndex corresponds to statsElements index
            if (weekIndex < statsElements.length) {
                statsElements[weekIndex].remove();
            }
        }
    }
    
    // Add week stats cells after rendering is complete
    addWeekStatsCells(year, month, startingDayOfWeek, daysInMonth, userData);
    
    // Update stats
    updateStats();
    updateMonthlyStatus(year, month, userData);
    updateYearToDateStatus(userData);
}

// Counts of weekday placements for the visible month (excludes Sat/Sun).
// Uses the effective data view so what-if scenarios are reflected.
function updateMonthlyStatus(year, month, effectiveData) {
    const officeEl = document.getElementById('monthOfficeCount');
    const homeEl = document.getElementById('monthHomeCount');
    const vacationEl = document.getElementById('monthVacationCount');
    const unsetEl = document.getElementById('monthUnsetCount');
    if (!officeEl) return;

    const data = effectiveData || {};
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let office = 0, home = 0, vacation = 0, unset = 0;

    for (let d = 1; d <= daysInMonth; d++) {
        const date = new Date(year, month, d);
        const dow = date.getDay();
        if (dow === 0 || dow === 6) continue; // skip weekends
        const key = formatDateKey(date);
        const loc = data[key];
        if (loc === 'office') office++;
        else if (loc === 'home') home++;
        else if (loc === 'nonworkday') vacation++;
        else if (date <= today) unset++; // only count unset for past / today
    }

    officeEl.textContent = office;
    homeEl.textContent = home;
    vacationEl.textContent = vacation;
    unsetEl.textContent = unset;
}

// Year-to-date counts: Jan 1 of current calendar year through today, weekdays only.
// Uses the effective data view so what-if scenarios are reflected.
function updateYearToDateStatus(effectiveData) {
    const officeEl = document.getElementById('ytdOfficeCount');
    const homeEl = document.getElementById('ytdHomeCount');
    const vacationEl = document.getElementById('ytdVacationCount');
    const unsetEl = document.getElementById('ytdUnsetCount');
    const yearLabel = document.getElementById('ytdYear');
    if (!officeEl) return;

    const data = effectiveData || {};
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const year = today.getFullYear();
    if (yearLabel) yearLabel.textContent = year;

    const jan1 = new Date(year, 0, 1);
    let office = 0, home = 0, vacation = 0, unset = 0;

    for (let d = new Date(jan1); d <= today; d.setDate(d.getDate() + 1)) {
        const dow = d.getDay();
        if (dow === 0 || dow === 6) continue;
        const key = formatDateKey(d);
        const loc = data[key];
        if (loc === 'office') office++;
        else if (loc === 'home') home++;
        else if (loc === 'nonworkday') vacation++;
        else unset++;
    }

    officeEl.textContent = office;
    homeEl.textContent = home;
    vacationEl.textContent = vacation;
    unsetEl.textContent = unset;
}

function createDayElement(day, year, month) {
    const dayDiv = document.createElement('div');
    dayDiv.className = 'calendar-day';
    
    if (day !== null) {
        const date = new Date(year, month, day);
        const dow = date.getDay();
        if (dow === 0 || dow === 6) {
            dayDiv.classList.add('weekend-cell');
        }
        dayDiv.innerHTML = `
            <div class="day-number">${day}</div>
            <div class="location-indicator" data-location="none"></div>
        `;

        // Make the cell a real, keyboard-operable control so it can be reached
        // and activated without a mouse. The label is filled in with the current
        // status by updateDayElement once data loads.
        dayDiv.setAttribute('role', 'button');
        dayDiv.setAttribute('tabindex', '0');
        const fullDate = date.toLocaleDateString('en-US', {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
        });
        dayDiv.setAttribute('aria-label', `${fullDate}, no location set`);

        const activate = () => {
            if (!currentUser) {
                alert('Please enter your name first');
                return;
            }
            if (whatIfMode && !isFutureOrToday(date)) {
                alert('What-If mode only lets you set today or future days.');
                return;
            }
            selectedDate = date;
            openModal(selectedDate);
        };

        dayDiv.addEventListener('click', activate);
        dayDiv.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
                e.preventDefault();
                activate();
            }
        });
    }

    return dayDiv;
}

function openModal(date) {
    const modal = document.getElementById('modal');
    const modalDate = document.getElementById('modalDate');
    
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    modalDate.textContent = date.toLocaleDateString('en-US', options);
    
    modal.style.display = 'block';
    
    // Load current location for this date
    loadLocationForDate(date).then(location => {
        // Highlight current selection
        document.querySelectorAll('.location-btn').forEach(btn => {
            btn.style.background = 'white';
            btn.style.borderColor = '#e0e0e0';
        });
        
        if (location && location !== 'none') {
            const activeBtn = document.querySelector(`[data-location="${location}"]`);
            if (activeBtn) {
                const colors = {
                    home: { bg: '#f1f8f4', border: '#4caf50' },
                    office: { bg: '#f0f7ff', border: '#2196f3' },
                    nonworkday: { bg: '#fff8e1', border: '#ff9800' }
                };
                const c = colors[location] || colors.office;
                activeBtn.style.background = c.bg;
                activeBtn.style.borderColor = c.border;
            }
        }
    });
}

function closeModal() {
    document.getElementById('modal').style.display = 'none';
}

function saveLocation(date, location) {
    if (!currentUser) {
        alert('Please enter your name first');
        return;
    }

    const dateStr = formatDateKey(date);
    const value = location === 'none' ? null : location;

    // What-If mode: store override in-memory only, never persist to Firebase
    if (whatIfMode) {
        if (!isFutureOrToday(date)) {
            alert('What-If mode only lets you set today or future days.');
            return;
        }
        whatIfData[dateStr] = value;
        closeModal();
        renderCalendar();
        return;
    }

    const userDocRef = db.collection('users').doc(currentUser);
    const update = { [dateStr]: value };

    userDocRef.set(update, { merge: true })
        .then(() => {
            if (currentUserData) {
                currentUserData[dateStr] = value;
            }
            closeModal();
            renderCalendar(); // Refresh calendar to show updated location
        })
        .catch(error => {
            console.error('Error saving location:', error);
            alert('Error saving location. Please try again.');
        });
}

function loadDayLocation(year, month, day, dayElement, userData = null) {
    if (!currentUser) return;

    const date = new Date(year, month, day);
    const dateStr = formatDateKey(date);
    const dayOfWeek = date.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6; // Sunday or Saturday

    const updateElement = (data = {}) => {
        const effective = getEffectiveData(data);
        const location = effective[dateStr] || (isWeekend ? 'nonworkday' : 'none');
        updateDayElement(dayElement, location);
        if (whatIfMode && Object.prototype.hasOwnProperty.call(whatIfData, dateStr)) {
            dayElement.classList.add('what-if-day');
        } else {
            dayElement.classList.remove('what-if-day');
        }
    };

    if (userData) {
        // userData passed in may already be the effective view from renderCalendar — re-derive
        // from raw cache to keep what-if overlay consistent.
        updateElement(currentUserData || userData);
        return;
    }

    getCurrentUserData().then(updateElement).catch(() => updateElement({}));
}

function loadLocationForDate(date) {
    if (!currentUser) return Promise.resolve('none');

    const dateStr = formatDateKey(date);
    const dayOfWeek = date.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6; // Sunday or Saturday

    if (currentUserData) {
        const eff = getEffectiveData(currentUserData);
        return Promise.resolve(eff[dateStr] || (isWeekend ? 'nonworkday' : 'none'));
    }

    return getCurrentUserData().then(data => {
        const eff = getEffectiveData(data);
        return eff[dateStr] || (isWeekend ? 'nonworkday' : 'none');
    });
}

function updateDayElement(dayElement, location) {
    const indicator = dayElement.querySelector('.location-indicator');

    let statusText;
    if (location === 'home') {
        indicator.className = 'location-indicator home';
        indicator.textContent = '🏠';
        statusText = 'working from home';
    } else if (location === 'office') {
        indicator.className = 'location-indicator office';
        indicator.textContent = '🏢';
        statusText = 'working from office';
    } else if (location === 'nonworkday') {
        indicator.className = 'location-indicator nonworkday';
        indicator.textContent = '🌴';
        statusText = 'non-work day';
    } else {
        indicator.className = 'location-indicator';
        indicator.textContent = '';
        statusText = 'no location set';
    }

    // Keep the accessible label's status in sync with the visual indicator,
    // preserving the date portion set in createDayElement.
    const existing = dayElement.getAttribute('aria-label');
    if (existing) {
        const datePart = existing.split(',').slice(0, -1).join(',');
        dayElement.setAttribute('aria-label', `${datePart}, ${statusText}`);
    }
}

function formatDateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// Helper function to check if an activity is running
function isRunningActivity(activity) {
    const activityType = activity.type || 'Run';
    return activityType === 'Run' || activityType === 'VirtualRun';
}

// Helper function to check if an activity is weight training
function isWeightTrainingActivity(activity) {
    const activityType = activity.type || 'Run';
    const activityName = (activity.name || '').toLowerCase();
    return activityType === 'WeightTraining' || 
           activityType === 'Crossfit' ||
           activityName.includes('weight') ||
           activityName.includes('f45') ||
           activityName.includes('crossfit') ||
           activityName.includes('gym');
}

// Helper function to check if an activity is yoga
function isYogaActivity(activity) {
    const activityType = activity.type || 'Run';
    const activityName = (activity.name || '').toLowerCase();
    return activityType === 'Yoga' ||
           activityName.includes('yoga') ||
           activityName.includes('stretching') ||
           activityName.includes('meditation');
}

// Helper function to check if an activity is cold plunge
function isColdPlungeActivity(activity) {
    const activityType = activity.type || 'Run';
    const activityName = (activity.name || '').toLowerCase();
    // Check if it's a Workout type with "plunge" in the name
    return (activityType === 'Workout' && activityName.includes('plunge')) ||
           activityName.includes('cold plunge') ||
           activityName.includes('coldplunge');
}

// Helper function to check if an activity is hiking
function isHikingActivity(activity) {
    const activityType = activity.type || 'Run';
    const activityName = (activity.name || '').toLowerCase();
    return activityType === 'Hike' ||
           activityType === 'Walk' && activityName.includes('hike') ||
           activityName.includes('hiking');
}

// Helper function to check if an activity is skiing
function isSkiActivity(activity) {
    const activityType = activity.type || 'Run';
    const activityName = (activity.name || '').toLowerCase();
    return activityType === 'Snowshoe' ||
           activityType === 'AlpineSki' ||
           activityType === 'BackcountrySki' ||
           activityType === 'NordicSki' ||
           activityName.includes('ski') ||
           activityName.includes('snowshoe') ||
           activityName.includes('snow shoe');
}

function addWeekStatsCells(year, month, startingDayOfWeek, daysInMonth, locationData = null) {
    if (!currentUser || !db) return;
    
    const calendarGrid = document.getElementById('calendarGrid');
    const allChildren = Array.from(calendarGrid.children);
    const statsPlaceholders = Array.from(calendarGrid.querySelectorAll('[data-stats-placeholder="true"]'));
    
    // Calculate previous and next month info
    const prevMonth = month === 0 ? 11 : month - 1;
    const prevYear = month === 0 ? year - 1 : year;
    const nextMonth = month === 11 ? 0 : month + 1;
    const nextYear = month === 11 ? year + 1 : year;
    
    const locationPromise = locationData ? Promise.resolve(locationData) : getCurrentUserData().then(d => getEffectiveData(d));
    locationPromise.then(locationData => {
        locationData = locationData || {};
        const userGoals = locationData.weeklyGoals ? locationData.weeklyGoals : {
            office: 3,
            running: 0,
            weights: 0,
            coldPlunge: 0,
            yoga: 0,
            hiking: 0,
            ski: 0
        };
        
        // Find all stats placeholders and calculate stats for their corresponding weeks
        statsPlaceholders.forEach((statsPlaceholder) => {
            // Find the index of this stats placeholder in the children array
            const placeholderIndex = allChildren.indexOf(statsPlaceholder);
            
            // The week's 7 days are the 7 elements before this stats placeholder
            // So we get elements from (placeholderIndex - 7) to (placeholderIndex - 1)
            const weekStartIndex = placeholderIndex - 7;
            const weekChildren = allChildren.slice(weekStartIndex, placeholderIndex);
            
            // Filter to only get day elements (not other stats cells)
            const weekDays = weekChildren.filter(child => child.classList.contains('calendar-day'));
            
            let officeDays = 0;
            const daysWithRunning = new Set();
            const daysWithWeightTraining = new Set();
            const daysWithColdPlunge = new Set();
            const daysWithYoga = new Set();
            const daysWithHiking = new Set();
            const daysWithSki = new Set();
            let weekHasStarted = false;
            let allDaysFromNextMonth = true;
            
            // Get today's date at midnight for comparison
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            
            // Process each day in the week
            weekDays.forEach((dayElement, dayIndex) => {
                const dayNumber = dayElement.querySelector('.day-number');
                if (!dayNumber) return;
                
                const day = parseInt(dayNumber.textContent);
                if (isNaN(day)) return;
                
                // Determine if this is from previous month, current month, or next month
                const isOtherMonth = dayElement.classList.contains('other-month');
                let date;
                let isFromNextMonth = false;
                
                // Calculate global index in the grid (only counting day elements)
                // We need to count how many day elements come before this one in the full grid
                let globalDayIndex = 0;
                for (let i = 0; i < weekStartIndex; i++) {
                    if (allChildren[i].classList.contains('calendar-day')) {
                        globalDayIndex++;
                    }
                }
                globalDayIndex += dayIndex;
                
                if (isOtherMonth) {
                    // First startingDayOfWeek cells with other-month are from previous month
                    // The rest are from next month
                    if (globalDayIndex < startingDayOfWeek) {
                        date = new Date(prevYear, prevMonth, day);
                    } else {
                        date = new Date(nextYear, nextMonth, day);
                        isFromNextMonth = true;
                    }
                } else {
                    date = new Date(year, month, day);
                }
                
                // If any day is not from next month, then not all days are from next month
                if (!isFromNextMonth) {
                    allDaysFromNextMonth = false;
                }
                
                // Check if this day has occurred (is today or in the past)
                if (date <= today) {
                    weekHasStarted = true;
                }
                
                const dateKey = formatDateKey(date);
                
                // Check office location
                // Only explicitly-marked days count toward the weekly stats.
                // Unmarked days (including weekends) contribute nothing, matching
                // computeWorkStats / updateMonthlyStatus / updateYearToDateStatus,
                // which all ignore unmarked weekends rather than defaulting them.
                const location = locationData[dateKey] || 'none';
                
                if (location === 'office') {
                    officeDays++;
                }

                // Check Strava activities
                if (stravaActivities[dateKey] && stravaActivities[dateKey].length > 0) {
                    const activities = stravaActivities[dateKey];
                    
                    activities.forEach(activity => {
                        if (isRunningActivity(activity)) {
                            daysWithRunning.add(dateKey);
                        }
                        if (isWeightTrainingActivity(activity)) {
                            daysWithWeightTraining.add(dateKey);
                        }
                        if (isColdPlungeActivity(activity)) {
                            daysWithColdPlunge.add(dateKey);
                        }
                        if (isYogaActivity(activity)) {
                            daysWithYoga.add(dateKey);
                        }
                        if (isHikingActivity(activity)) {
                            daysWithHiking.add(dateKey);
                        }
                        if (isSkiActivity(activity)) {
                            daysWithSki.add(dateKey);
                        }
                    });
                }
                
                // Check Garmin activities
                if (garminActivities[dateKey] && garminActivities[dateKey].length > 0) {
                    const activities = garminActivities[dateKey];
                    
                    activities.forEach(activity => {
                        const activityType = (activity.activityType?.typeKey || activity.type || 'running').toLowerCase();
                        const activityName = (activity.activityName || activity.name || '').toLowerCase();
                        
                        // Check for running activities
                        if (activityType === 'running' || activityType === 'walking' || activityType === 'elliptical' ||
                            activityName.includes('run') || activityName.includes('jog')) {
                            daysWithRunning.add(dateKey);
                        }
                        // Check for weight training
                        if (activityType === 'strength_training' || activityType === 'weight_training' || activityType === 'crossfit' ||
                            activityName.includes('weight') || activityName.includes('f45') || activityName.includes('crossfit') || activityName.includes('gym')) {
                            daysWithWeightTraining.add(dateKey);
                        }
                        // Check for cold plunge
                        if ((activityType === 'workout' && activityName.includes('plunge')) || 
                            activityName.includes('cold plunge') || 
                            activityName.includes('coldplunge')) {
                            daysWithColdPlunge.add(dateKey);
                        }
                        // Check for yoga
                        if (activityType === 'yoga' || 
                            activityName.includes('yoga') || 
                            activityName.includes('stretching') || 
                            activityName.includes('meditation')) {
                            daysWithYoga.add(dateKey);
                        }
                        // Check for hiking
                        if (activityType === 'hiking' || 
                            (activityType === 'walking' && activityName.includes('hike')) ||
                            activityName.includes('hiking')) {
                            daysWithHiking.add(dateKey);
                        }
                        // Check for skiing
                        if (activityType === 'skiing' || 
                            activityType === 'alpine_skiing' || 
                            activityType === 'backcountry_skiing' || 
                            activityType === 'nordic_skiing' ||
                            activityName.includes('ski') || 
                            activityName.includes('snowshoe') || 
                            activityName.includes('snow shoe')) {
                            daysWithSki.add(dateKey);
                        }
                    });
                }
            });
            
            // Only show stats if the week has started AND not all days are from next month
            if (weekHasStarted && !allDaysFromNextMonth) {
                const runningDays = daysWithRunning.size;
                const weightTrainingDays = daysWithWeightTraining.size;
                const coldPlungeDays = daysWithColdPlunge.size;
                const yogaDays = daysWithYoga.size;
                const hikingDays = daysWithHiking.size;
                const skiDays = daysWithSki.size;
                
                // Check if goals are met
                const officeGoalMet = userGoals.office > 0 && officeDays >= userGoals.office;
                const runningGoalMet = userGoals.running > 0 && runningDays >= userGoals.running;
                const weightsGoalMet = userGoals.weights > 0 && weightTrainingDays >= userGoals.weights;
                const coldPlungeGoalMet = userGoals.coldPlunge > 0 && coldPlungeDays >= userGoals.coldPlunge;
                const yogaGoalMet = userGoals.yoga > 0 && yogaDays >= userGoals.yoga;
                const hikingGoalMet = userGoals.hiking > 0 && hikingDays >= userGoals.hiking;
                const skiGoalMet = userGoals.ski > 0 && skiDays >= userGoals.ski;
                
                // Build stats HTML based on active filters
                let statsHTML = '';
                
                // Work stats (office) - only show if goal > 0
                if (activeFilters.work && userGoals.office > 0) {
                    const officeGoalClass = officeGoalMet ? 'goal-met' : 'goal-not-met';
                    const officeTooltip = `Work Days: ${officeDays}/${userGoals.office}${officeGoalMet ? ' ✓ Goal Met' : ''}`;
                    statsHTML += `
                        <div class="stat-row">
                            <div class="stat-item">
                                <span class="stat-label ${officeGoalClass}" title="${officeTooltip}">
                                    🏢
                                    <span class="stat-badge-number">${officeDays}</span>
                                </span>
                            </div>
                        </div>
                    `;
                }
                
                // Health stats - only show activities with goals > 0
                if (activeFilters.health) {
                    // Collect all activities with goals > 0
                    const healthStats = [];
                    
                    if (userGoals.running > 0) {
                        const goalClass = runningGoalMet ? 'goal-met' : 'goal-not-met';
                        const tooltip = `Running Days: ${runningDays}/${userGoals.running}${runningGoalMet ? ' ✓ Goal Met' : ''}`;
                        healthStats.push({ icon: '🏃', days: runningDays, goalClass, tooltip });
                    }
                    
                    if (userGoals.weights > 0) {
                        const goalClass = weightsGoalMet ? 'goal-met' : 'goal-not-met';
                        const tooltip = `Weight Training Days: ${weightTrainingDays}/${userGoals.weights}${weightsGoalMet ? ' ✓ Goal Met' : ''}`;
                        healthStats.push({ icon: '🏋️', days: weightTrainingDays, goalClass, tooltip });
                    }
                    
                    if (userGoals.coldPlunge > 0) {
                        const goalClass = coldPlungeGoalMet ? 'goal-met' : 'goal-not-met';
                        const tooltip = `Cold Plunge Days: ${coldPlungeDays}/${userGoals.coldPlunge}${coldPlungeGoalMet ? ' ✓ Goal Met' : ''}`;
                        healthStats.push({ icon: '🧊', days: coldPlungeDays, goalClass, tooltip });
                    }
                    
                    if (userGoals.yoga > 0) {
                        const goalClass = yogaGoalMet ? 'goal-met' : 'goal-not-met';
                        const tooltip = `Yoga Days: ${yogaDays}/${userGoals.yoga}${yogaGoalMet ? ' ✓ Goal Met' : ''}`;
                        healthStats.push({ icon: '🧘', days: yogaDays, goalClass, tooltip });
                    }
                    
                    if (userGoals.hiking > 0) {
                        const goalClass = hikingGoalMet ? 'goal-met' : 'goal-not-met';
                        const tooltip = `Hiking Days: ${hikingDays}/${userGoals.hiking}${hikingGoalMet ? ' ✓ Goal Met' : ''}`;
                        healthStats.push({ icon: '🥾', days: hikingDays, goalClass, tooltip });
                    }
                    
                    if (userGoals.ski > 0) {
                        const goalClass = skiGoalMet ? 'goal-met' : 'goal-not-met';
                        const tooltip = `Ski Days: ${skiDays}/${userGoals.ski}${skiGoalMet ? ' ✓ Goal Met' : ''}`;
                        healthStats.push({ icon: '🎿', days: skiDays, goalClass, tooltip });
                    }
                    
                    // Only show health stats if there are any goals set
                    if (healthStats.length > 0) {
                        statsHTML += '<div class="stat-row">';
                        healthStats.forEach(stat => {
                            statsHTML += `
                                <div class="stat-item">
                                    <span class="stat-label ${stat.goalClass}" title="${stat.tooltip}">
                                        ${stat.icon}
                                        <span class="stat-badge-number">${stat.days}</span>
                                    </span>
                                </div>
                            `;
                        });
                        statsHTML += '</div>';
                    }
                }
                
                // Update the placeholder with filtered stats
                statsPlaceholder.innerHTML = statsHTML;
            } else {
                // Week hasn't started yet - leave it empty
                statsPlaceholder.innerHTML = '';
            }
            statsPlaceholder.removeAttribute('data-stats-placeholder');
        });
    }).catch(error => {
        console.error('Error calculating week stats:', error);
    });
}

// Helper function to get Monday of the week for a given date
function getMondayOfWeek(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
    return new Date(d.setDate(diff));
}

// Helper function to parse date string (YYYY-MM-DD) to Date object
function parseDateKey(dateKey) {
    const [year, month, day] = dateKey.split('-').map(Number);
    return new Date(year, month - 1, day);
}

// Compute the average-weekly-office-days and BELT (best 8 of last 12 weeks)
// given an arbitrary user-data dictionary keyed by YYYY-MM-DD.
// When `includeFuture` is true (what-if mode), the 12-week window slides forward
// to end at the latest week that has data, and the "current week needs Friday data"
// exclusion is dropped so projected weeks count.
// `customWindowEnd` (a Date, ideally a Monday) explicitly pins the end of the 12-week
// BELT window and overrides the auto-derived endpoint.
function computeWorkStats(data, includeFuture = false, customWindowEnd = null) {
    const weeksMap = new Map();

    Object.keys(data).forEach(dateKey => {
        if (!data[dateKey]) return;
        const date = parseDateKey(dateKey);
        if (isNaN(date.getTime())) return;

        const monday = getMondayOfWeek(date);
        const weekKey = formatDateKey(monday);

        if (!weeksMap.has(weekKey)) {
            weeksMap.set(weekKey, { weekStart: monday, days: new Map() });
        }
        weeksMap.get(weekKey).days.set(dateKey, data[dateKey]);
    });

    const weeks = Array.from(weeksMap.values()).map(week => {
        let officeDays = 0;
        let hasData = false;
        week.days.forEach(location => {
            if (location === 'home' || location === 'office' || location === 'nonworkday') {
                hasData = true;
            }
            if (location === 'office') officeDays++;
        });
        return { weekStart: week.weekStart, officeDays, hasData };
    });

    const today = new Date();
    const currentWeekMonday = getMondayOfWeek(today);
    const currentWeekFriday = new Date(currentWeekMonday);
    currentWeekFriday.setDate(currentWeekFriday.getDate() + 4);
    const currentWeekFridayKey = formatDateKey(currentWeekFriday);
    const hasCurrentWeekFridayData = !!data[currentWeekFridayKey];

    // Average weekly office days
    const weeksWithData = weeks.filter(w => {
        if (!w.hasData) return false;
        if (includeFuture) return true; // projected weeks count as-is
        // Actual mode: exclude current week unless Friday is filled, and exclude future weeks
        if (w.weekStart.getTime() > currentWeekMonday.getTime()) return false;
        if (w.weekStart.getTime() === currentWeekMonday.getTime()) {
            return hasCurrentWeekFridayData;
        }
        return true;
    });

    let avgWeeklyOffice = 0;
    if (weeksWithData.length > 0) {
        const totalOfficeDays = weeksWithData.reduce((sum, w) => sum + w.officeDays, 0);
        avgWeeklyOffice = totalOfficeDays / weeksWithData.length;
    }

    // BELT window: last 12 weeks ending at currentWeekMonday (actual) or at the
    // latest week with data (what-if, so future scenarios count).
    let windowEnd = currentWeekMonday;
    if (customWindowEnd) {
        windowEnd = getMondayOfWeek(customWindowEnd);
    } else if (includeFuture) {
        const latestWeekWithData = weeks
            .filter(w => w.hasData)
            .reduce((latest, w) => (!latest || w.weekStart > latest ? w.weekStart : latest), null);
        if (latestWeekWithData && latestWeekWithData > currentWeekMonday) {
            windowEnd = latestWeekWithData;
        }
    }

    const twelveWeeksAgo = new Date(windowEnd);
    twelveWeeksAgo.setDate(twelveWeeksAgo.getDate() - 11 * 7);

    // Build a full 12-slot list of weeks (including weeks with no data) so the
    // breakdown view can show every week in the window, not just the ones that
    // appear in the data map.
    const last12Weeks = [];
    const existingByKey = new Map(weeks.map(w => [formatDateKey(w.weekStart), w]));
    for (let i = 0; i < 12; i++) {
        const weekStart = new Date(twelveWeeksAgo);
        weekStart.setDate(weekStart.getDate() + i * 7);
        const key = formatDateKey(weekStart);
        const existing = existingByKey.get(key);
        last12Weeks.push(existing || { weekStart, officeDays: 0, hasData: false });
    }

    const best8Weeks = last12Weeks
        .filter(w => w.hasData)
        .sort((a, b) => b.officeDays - a.officeDays)
        .slice(0, 8);
    const best8Set = new Set(best8Weeks.map(w => formatDateKey(w.weekStart)));
    const annotated12Weeks = last12Weeks.map(w => Object.assign({}, w, {
        inBest8: best8Set.has(formatDateKey(w.weekStart))
    }));

    let beltAverage = 0;
    if (best8Weeks.length > 0) {
        const totalOfficeDays = best8Weeks.reduce((sum, w) => sum + w.officeDays, 0);
        beltAverage = totalOfficeDays / 8;
    }

    return {
        avgWeeklyOffice,
        weeksWithDataCount: weeksWithData.length,
        beltAverage,
        best8WeeksCount: best8Weeks.length,
        windowStart: twelveWeeksAgo,
        windowEnd,
        last12Weeks: annotated12Weeks
    };
}

// Calculate and display stats
async function updateStats() {
    const avgElement = document.getElementById('avgWeeklyOffice');
    const beltElement = document.getElementById('beltValue');
    const beltActualSub = document.getElementById('beltActualSub');

    if (!currentUser || !db) {
        if (avgElement) avgElement.textContent = '-';
        if (beltElement) beltElement.textContent = '-';
        if (beltActualSub) beltActualSub.style.display = 'none';
        return;
    }

    const rawData = currentUserData || await getCurrentUserData();

    try {
        const actual = computeWorkStats(rawData || {});
        const displayed = whatIfMode
            ? computeWorkStats(getEffectiveData(rawData || {}), true, whatIfWindowEnd)
            : actual;

        if (avgElement) {
            avgElement.textContent = displayed.weeksWithDataCount > 0
                ? displayed.avgWeeklyOffice.toFixed(2)
                : '-';
        }

        if (beltElement) {
            if (whatIfMode) {
                // In what-if mode, always show a numeric BELT (divided by 8) so the
                // user can see how far they are from the policy even with sparse data.
                beltElement.textContent = displayed.beltAverage.toFixed(2);
            } else {
                beltElement.textContent = displayed.best8WeeksCount > 0
                    ? displayed.beltAverage.toFixed(2)
                    : '-';
            }
        }

        if (beltActualSub) {
            if (whatIfMode) {
                const actualText = actual.best8WeeksCount > 0 ? actual.beltAverage.toFixed(2) : '-';
                beltActualSub.textContent = `Actual BELT: ${actualText}`;
                beltActualSub.style.display = '';
            } else {
                beltActualSub.style.display = 'none';
            }
        }
    } catch (error) {
        console.error('Error calculating stats:', error);
        if (avgElement) avgElement.textContent = '-';
        if (beltElement) beltElement.textContent = '-';
        if (beltActualSub) beltActualSub.style.display = 'none';
    }
}

// ==================== STRAVA INTEGRATION ====================

function initializeStravaButtons() {
    const connectBtn = document.getElementById('stravaConnectBtn');
    const disconnectBtn = document.getElementById('stravaDisconnectBtn');
    const stravaModal = document.getElementById('stravaModal');
    const stravaModalClose = document.getElementById('stravaModalClose');
    const saveTokenBtn = document.getElementById('saveStravaToken');
    const configSection = document.getElementById('stravaConfigSection');
    const startAuthBtn = document.getElementById('stravaStartAuth');
    const cancelConfigBtn = document.getElementById('stravaCancelConfig');
    const currentUrlDisplay = document.getElementById('currentUrlDisplay');
    
    // Set current URL as default redirect URI
    if (currentUrlDisplay) {
        const currentUrl = window.location.origin + window.location.pathname;
        currentUrlDisplay.textContent = currentUrl;
    }
    
    if (connectBtn) {
        connectBtn.addEventListener('click', () => {
            if (!currentUser) {
                alert('Please enter your name first');
                return;
            }
            // Show configuration section instead of opening separate modal
            if (configSection) {
                configSection.style.display = 'block';
                // Scroll to the config section
                configSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        });
    }
    
    if (disconnectBtn) {
        disconnectBtn.addEventListener('click', () => {
            if (confirm('Are you sure you want to disconnect Strava?')) {
                disconnectStrava();
            }
        });
    }
    
    if (stravaModalClose) {
        stravaModalClose.addEventListener('click', () => {
            stravaModal.style.display = 'none';
        });
    }
    
    if (saveTokenBtn) {
        saveTokenBtn.addEventListener('click', () => {
            const token = document.getElementById('stravaTokenInput').value.trim();
            const refreshToken = document.getElementById('stravaRefreshTokenInput').value.trim();
            
            if (!token) {
                alert('Please enter an access token');
                return;
            }
            
            saveStravaToken(token, refreshToken);
        });
    }
    
    // Handle Start Authorization button
    if (startAuthBtn) {
        startAuthBtn.addEventListener('click', () => {
            startStravaOAuth();
        });
    }
    
    // Handle Cancel button
    if (cancelConfigBtn) {
        cancelConfigBtn.addEventListener('click', () => {
            if (configSection) {
                configSection.style.display = 'none';
                // Clear form fields
                document.getElementById('stravaClientId').value = '';
                document.getElementById('stravaClientSecret').value = '';
                document.getElementById('stravaRedirectUri').value = '';
                const statusDiv = document.getElementById('stravaAuthStatus');
                if (statusDiv) {
                    statusDiv.style.display = 'none';
                    statusDiv.innerHTML = '';
                }
            }
        });
    }
    
    // Close modal when clicking outside
    window.addEventListener('click', (e) => {
        if (e.target === stravaModal) {
            stravaModal.style.display = 'none';
        }
    });
}

// Start Strava OAuth flow
function startStravaOAuth() {
    const clientId = document.getElementById('stravaClientId').value.trim();
    const clientSecret = document.getElementById('stravaClientSecret').value.trim();
    const redirectUri = document.getElementById('stravaRedirectUri').value.trim() || 
                        (window.location.origin + window.location.pathname);
    const statusDiv = document.getElementById('stravaAuthStatus');
    
    // Validate inputs
    if (!clientId) {
        if (statusDiv) {
            statusDiv.style.display = 'block';
            statusDiv.style.background = '#ffebee';
            statusDiv.style.color = '#c62828';
            statusDiv.innerHTML = '❌ Please enter your Client ID';
        } else {
            alert('Please enter your Client ID');
        }
        return;
    }
    
    if (!clientSecret) {
        if (statusDiv) {
            statusDiv.style.display = 'block';
            statusDiv.style.background = '#ffebee';
            statusDiv.style.color = '#c62828';
            statusDiv.innerHTML = '❌ Please enter your Client Secret';
        } else {
            alert('Please enter your Client Secret');
        }
        return;
    }
    
    // Store credentials and redirect URI in sessionStorage for token exchange
    sessionStorage.setItem('stravaClientId', clientId);
    sessionStorage.setItem('stravaClientSecret', clientSecret);
    sessionStorage.setItem('stravaRedirectUri', redirectUri);
    
    // Show status with redirect URI info
    if (statusDiv) {
        statusDiv.style.display = 'block';
        statusDiv.style.background = '#e3f2fd';
        statusDiv.style.color = '#1565c0';
        statusDiv.innerHTML = `⏳ Redirecting to Strava for authorization...<br><small style="font-size: 0.85em; margin-top: 5px; display: block;">Using redirect URI: ${redirectUri}</small>`;
    }
    
    // Build OAuth URL
    const oauthUrl = `https://www.strava.com/oauth/authorize?` +
        `client_id=${encodeURIComponent(clientId)}&` +
        `response_type=code&` +
        `redirect_uri=${encodeURIComponent(redirectUri)}&` +
        `approval_prompt=force&` +
        `scope=activity:read_all`;
    
    console.log('Strava OAuth URL:', oauthUrl);
    console.log('Redirect URI being used:', redirectUri);
    
    // Redirect to Strava
    window.location.href = oauthUrl;
}

// Exchange authorization code for access token
async function exchangeStravaCodeForToken(code, clientId, clientSecret) {
    const statusDiv = document.getElementById('stravaAuthStatus');
    
    // Show status
    if (statusDiv) {
        statusDiv.style.display = 'block';
        statusDiv.style.background = '#e3f2fd';
        statusDiv.style.color = '#1565c0';
        statusDiv.innerHTML = '⏳ Exchanging authorization code for access token...';
    }
    
    try {
        // Get the redirect URI that was used (from sessionStorage or current URL)
        const redirectUri = sessionStorage.getItem('stravaRedirectUri') || 
                           (window.location.origin + window.location.pathname);
        
        // Exchange code for token (Strava API requires form-data)
        const formData = new URLSearchParams();
        formData.append('client_id', clientId);
        formData.append('client_secret', clientSecret);
        formData.append('code', code);
        formData.append('grant_type', 'authorization_code');
        formData.append('redirect_uri', redirectUri); // Required by Strava
        
        const response = await fetch('https://www.strava.com/oauth/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: formData.toString()
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            let errorMessage = errorData.message || `HTTP ${response.status}: ${response.statusText}`;
            
            // Provide more helpful error message for redirect_uri errors
            if (errorData.errors && errorData.errors.length > 0) {
                const redirectError = errorData.errors.find(e => e.field === 'redirect_uri');
                if (redirectError) {
                    errorMessage = `Redirect URI mismatch. The redirect URI "${redirectUri}" must exactly match what's configured in your Strava app settings. Please check your Strava API settings at https://www.strava.com/settings/api and ensure the redirect URI matches exactly (including http/https, trailing slashes, etc.).`;
                }
            }
            
            throw new Error(errorMessage);
        }
        
        const data = await response.json();
        
        // Clear stored credentials from sessionStorage
        sessionStorage.removeItem('stravaClientId');
        sessionStorage.removeItem('stravaClientSecret');
        sessionStorage.removeItem('stravaRedirectUri');
        
        // Save tokens
        if (data.access_token) {
            saveStravaToken(data.access_token, data.refresh_token || null);
            
            // Show success message
            if (statusDiv) {
                statusDiv.style.display = 'block';
                statusDiv.style.background = '#e8f5e9';
                statusDiv.style.color = '#2e7d32';
                statusDiv.innerHTML = '✅ Successfully connected to Strava!';
            }
            
            // Hide config section after a short delay
            setTimeout(() => {
                const configSection = document.getElementById('stravaConfigSection');
                if (configSection) {
                    configSection.style.display = 'none';
                    // Clear form fields
                    document.getElementById('stravaClientId').value = '';
                    document.getElementById('stravaClientSecret').value = '';
                    document.getElementById('stravaRedirectUri').value = '';
                    if (statusDiv) {
                        statusDiv.style.display = 'none';
                        statusDiv.innerHTML = '';
                    }
                }
            }, 2000);
        } else {
            throw new Error('No access token in response');
        }
    } catch (error) {
        console.error('Error exchanging code for token:', error);
        
        // Clear stored credentials
        sessionStorage.removeItem('stravaClientId');
        sessionStorage.removeItem('stravaClientSecret');
        sessionStorage.removeItem('stravaRedirectUri');
        
        // Show error
        if (statusDiv) {
            statusDiv.style.display = 'block';
            statusDiv.style.background = '#ffebee';
            statusDiv.style.color = '#c62828';
            statusDiv.innerHTML = `❌ Error: ${error.message}. Please try again.`;
        } else {
            alert(`Error exchanging authorization code: ${error.message}`);
        }
    }
}

function initializeSettingsModal() {
    const settingsBtn = document.getElementById('settingsBtn');
    const settingsModal = document.getElementById('settingsModal');
    const settingsModalClose = document.getElementById('settingsModalClose');
    const saveGoalsBtn = document.getElementById('saveGoals');
    
    if (settingsBtn) {
        settingsBtn.addEventListener('click', () => {
            if (!currentUser) {
                alert('Please enter your name first');
                return;
            }
            loadUserGoals();
            checkStravaConnection(); // Update Strava button status when opening settings
            checkGarminConnection(); // Update Garmin button status when opening settings
            settingsModal.style.display = 'block';
        });
    }
    
    if (settingsModalClose) {
        settingsModalClose.addEventListener('click', () => {
            settingsModal.style.display = 'none';
        });
    }
    
    if (saveGoalsBtn) {
        saveGoalsBtn.addEventListener('click', () => {
            saveUserGoals();
        });
    }
    
    // Close modal when clicking outside
    window.addEventListener('click', (e) => {
        if (e.target === settingsModal) {
            settingsModal.style.display = 'none';
        }
    });
}

function loadUserGoals() {
    if (!currentUser || !db) return;
    
    const userDocRef = db.collection('users').doc(currentUser);
    userDocRef.get().then(doc => {
        if (doc.exists) {
            const data = doc.data();
            const goals = data.weeklyGoals || {};
            
            document.getElementById('officeGoal').value = goals.office || 3;
            document.getElementById('runningGoal').value = goals.running || 0;
            document.getElementById('weightsGoal').value = goals.weights || 0;
            document.getElementById('coldPlungeGoal').value = goals.coldPlunge || 0;
            document.getElementById('yogaGoal').value = goals.yoga || 0;
            document.getElementById('hikingGoal').value = goals.hiking || 0;
            document.getElementById('skiGoal').value = goals.ski || 0;
        }
    }).catch(error => {
        console.error('Error loading goals:', error);
    });
}

function saveUserGoals() {
    if (!currentUser || !db) return;
    
    const officeGoal = parseInt(document.getElementById('officeGoal').value) || 0;
    const runningGoal = parseInt(document.getElementById('runningGoal').value) || 0;
    const weightsGoal = parseInt(document.getElementById('weightsGoal').value) || 0;
    const coldPlungeGoal = parseInt(document.getElementById('coldPlungeGoal').value) || 0;
    const yogaGoal = parseInt(document.getElementById('yogaGoal').value) || 0;
    const hikingGoal = parseInt(document.getElementById('hikingGoal').value) || 0;
    const skiGoal = parseInt(document.getElementById('skiGoal').value) || 0;
    
    // Validate inputs
    if (officeGoal < 0 || officeGoal > 5) {
        alert('Office days must be between 0 and 5');
        return;
    }
    if (runningGoal < 0 || runningGoal > 7) {
        alert('Running days must be between 0 and 7');
        return;
    }
    if (weightsGoal < 0 || weightsGoal > 7) {
        alert('Weight training days must be between 0 and 7');
        return;
    }
    if (coldPlungeGoal < 0 || coldPlungeGoal > 7) {
        alert('Cold plunge days must be between 0 and 7');
        return;
    }
    if (yogaGoal < 0 || yogaGoal > 7) {
        alert('Yoga days must be between 0 and 7');
        return;
    }
    if (hikingGoal < 0 || hikingGoal > 7) {
        alert('Hiking days must be between 0 and 7');
        return;
    }
    if (skiGoal < 0 || skiGoal > 7) {
        alert('Ski days must be between 0 and 7');
        return;
    }
    
    const goals = {
        office: officeGoal,
        running: runningGoal,
        weights: weightsGoal,
        coldPlunge: coldPlungeGoal,
        yoga: yogaGoal,
        hiking: hikingGoal,
        ski: skiGoal
    };
    
    const userDocRef = db.collection('users').doc(currentUser);
    userDocRef.get().then(doc => {
        const data = doc.exists ? doc.data() : {};
        data.weeklyGoals = goals;
        
        userDocRef.set(data, { merge: true })
            .then(() => {
                console.log('Weekly goals saved successfully');
                // Close the settings modal
                document.getElementById('settingsModal').style.display = 'none';
                renderCalendar(); // Re-render to show any visual changes
            })
            .catch(error => {
                console.error('Error saving goals:', error);
                alert('Failed to save goals. Please try again.');
            });
    }).catch(error => {
        console.error('Error saving goals:', error);
        alert('Failed to save goals. Please try again.');
    });
}

function checkStravaConnection() {
    if (!currentUser || !db) {
        const connectBtn = document.getElementById('stravaConnectBtn');
        const disconnectBtn = document.getElementById('stravaDisconnectBtn');
        if (connectBtn) connectBtn.style.display = 'none';
        if (disconnectBtn) disconnectBtn.style.display = 'none';
        return;
    }
    
    db.collection('users').doc(currentUser).get().then(doc => {
        if (doc.exists) {
            const data = doc.data();
            const hasToken = data.stravaAccessToken && data.stravaAccessToken.trim() !== '';
            
            console.log('Checking Strava connection - hasToken:', hasToken);
            
            const connectBtn = document.getElementById('stravaConnectBtn');
            const disconnectBtn = document.getElementById('stravaDisconnectBtn');
            
            if (connectBtn) {
                connectBtn.style.display = hasToken ? 'none' : 'inline-flex';
            }
            if (disconnectBtn) {
                disconnectBtn.style.display = hasToken ? 'inline-flex' : 'none';
            }
            
            // Always load activities from database, regardless of token status
            loadStravaActivitiesFromDB().then(() => {
                if (hasToken) {
                    console.log('Loaded activities from database, now syncing new ones...');
                    // Then fetch new activities from Strava API
                    fetchStravaActivities(data.stravaAccessToken, data.stravaRefreshToken);
                } else {
                    console.log('No token found, but loaded existing activities from database');
                }
            }).catch(error => {
                console.error('Error loading activities from database:', error);
                if (hasToken) {
                    // Still try to fetch from API if we have a token
                    fetchStravaActivities(data.stravaAccessToken, data.stravaRefreshToken);
                }
            });
        } else {
            console.log('No user document found');
            const connectBtn = document.getElementById('stravaConnectBtn');
            const disconnectBtn = document.getElementById('stravaDisconnectBtn');
            if (connectBtn) connectBtn.style.display = 'inline-flex';
            if (disconnectBtn) disconnectBtn.style.display = 'none';
        }
    }).catch(error => {
        console.error('Error checking Strava connection:', error);
    });
}

// Load Strava activities from Firestore
async function loadStravaActivitiesFromDB() {
    if (!currentUser || !db) {
        return Promise.resolve();
    }
    
    try {
        const userDoc = await db.collection('users').doc(currentUser).get();
        if (userDoc.exists) {
            const data = userDoc.data();
            const storedActivities = data.stravaActivities || {};
            
            // Convert stored activities back to the stravaActivities format
            stravaActivities = {};
            Object.keys(storedActivities).forEach(dateKey => {
                stravaActivities[dateKey] = storedActivities[dateKey];
            });
            
            console.log(`Loaded ${Object.keys(stravaActivities).length} days with activities from database`);
            
            // Update calendar to show loaded activities
            renderCalendar();
        }
    } catch (error) {
        console.error('Error loading Strava activities from database:', error);
        throw error;
    }
}

// Save Strava activities to Firestore
async function saveStravaActivitiesToDB(newActivities) {
    if (!currentUser || !db) {
        return;
    }
    
    try {
        const userDocRef = db.collection('users').doc(currentUser);
        const userDoc = await userDocRef.get();
        
        const existingData = userDoc.exists ? userDoc.data() : {};
        const existingActivities = existingData.stravaActivities || {};
        
        // Merge new activities with existing ones
        // For each date, merge activity arrays (avoiding duplicates by activity ID)
        const mergedActivities = { ...existingActivities };
        
        Object.keys(newActivities).forEach(dateKey => {
            if (!mergedActivities[dateKey]) {
                mergedActivities[dateKey] = [];
            }
            
            // Get existing activity IDs for this date
            const existingIds = new Set(mergedActivities[dateKey].map(a => a.id));
            
            // Add new activities that don't already exist
            newActivities[dateKey].forEach(activity => {
                if (!existingIds.has(activity.id)) {
                    mergedActivities[dateKey].push(activity);
                }
            });
        });
        
        // Update the document with merged activities
        await userDocRef.set({
            stravaActivities: mergedActivities
        }, { merge: true });
        
        console.log('Saved Strava activities to database');
        
        // Update in-memory cache
        stravaActivities = mergedActivities;
        
    } catch (error) {
        console.error('Error saving Strava activities to database:', error);
        throw error;
    }
}

function saveStravaToken(accessToken, refreshToken) {
    if (!currentUser || !db) {
        alert('Please enter your name first');
        return;
    }
    
    if (!accessToken || accessToken.trim() === '') {
        alert('Please enter a valid access token');
        return;
    }
    
    const userDocRef = db.collection('users').doc(currentUser);
    
    userDocRef.get().then(doc => {
        const data = doc.exists ? doc.data() : {};
        data.stravaAccessToken = accessToken.trim();
        if (refreshToken && refreshToken.trim() !== '') {
            data.stravaRefreshToken = refreshToken.trim();
        }
        
        userDocRef.set(data, { merge: true })
            .then(() => {
                console.log('Strava token saved successfully');
                document.getElementById('stravaModal').style.display = 'none';
                document.getElementById('stravaTokenInput').value = '';
                document.getElementById('stravaRefreshTokenInput').value = '';
                
                // Update UI immediately
                document.getElementById('stravaConnectBtn').style.display = 'none';
                document.getElementById('stravaDisconnectBtn').style.display = 'inline-flex';
                
                // Load existing activities from database first, then fetch new ones
                loadStravaActivitiesFromDB().then(() => {
                    // Fetch new activities from Strava API
                fetchStravaActivities(accessToken.trim(), refreshToken ? refreshToken.trim() : null);
                }).catch(error => {
                    console.error('Error loading activities from database:', error);
                    // Still try to fetch from API
                    fetchStravaActivities(accessToken.trim(), refreshToken ? refreshToken.trim() : null);
                });
                
                // Also check connection to ensure consistency
                setTimeout(() => {
                    checkStravaConnection();
                }, 500);
            })
            .catch(error => {
                console.error('Error saving Strava token:', error);
                alert('Error saving token. Please try again.');
            });
    }).catch(error => {
        console.error('Error accessing database:', error);
        alert('Error accessing database. Please try again.');
    });
}

function disconnectStrava(silent = false) {
    if (!currentUser || !db) return;
    
    const userDocRef = db.collection('users').doc(currentUser);
    
    userDocRef.get().then(doc => {
        const data = doc.exists ? doc.data() : {};
        data.stravaAccessToken = null;
        data.stravaRefreshToken = null;
        // Keep activities in database - don't clear them
        
        userDocRef.set(data, { merge: true })
            .then(() => {
                // Reload activities from database (they should still be there)
                loadStravaActivitiesFromDB().then(() => {
                    checkStravaConnection();
                    renderCalendar();
                    if (!silent) {
                        // Only show message if user manually disconnected
                        console.log('Strava disconnected, but activities remain in database');
                    }
                }).catch(error => {
                    console.error('Error loading activities after disconnect:', error);
                    checkStravaConnection();
                    renderCalendar();
                });
            })
            .catch(error => {
                console.error('Error disconnecting Strava:', error);
                if (!silent) {
                    alert('Error disconnecting Strava. Please try again.');
                }
            });
    });
}

async function fetchStravaActivities(accessToken, refreshToken) {
    if (!accessToken || accessToken.trim() === '') {
        console.log('No access token provided');
        return;
    }
    
    try {
        // Get existing activities to find the latest timestamp
        let latestActivityTimestamp = 0;
        const existingActivityIds = new Set();
        
        // Find the latest activity timestamp from existing activities
        Object.keys(stravaActivities).forEach(dateKey => {
            stravaActivities[dateKey].forEach(activity => {
                existingActivityIds.add(activity.id);
                // Use start_date (UTC timestamp) if available, otherwise parse start_date_local
                if (activity.start_date) {
                    const timestamp = new Date(activity.start_date).getTime() / 1000;
                    if (timestamp > latestActivityTimestamp) {
                        latestActivityTimestamp = timestamp;
                    }
                } else if (activity.start_date_local) {
                    // Parse the timestamp from start_date_local
                    const date = new Date(activity.start_date_local);
                    const timestamp = date.getTime() / 1000;
                    if (timestamp > latestActivityTimestamp) {
                        latestActivityTimestamp = timestamp;
                    }
                }
            });
        });
        
        // Calculate date range
        const now = new Date();
        const nextMonth = new Date(now);
        nextMonth.setMonth(now.getMonth() + 1);
        const before = Math.floor(nextMonth.getTime() / 1000);
        
        // If we have existing activities, only fetch new ones (after latest timestamp)
        // Otherwise, fetch last 3 months worth
        let after;
        if (latestActivityTimestamp > 0) {
            // Fetch activities after the latest one we have (subtract 1 day to be safe)
            after = latestActivityTimestamp - 86400; // 1 day in seconds
            console.log(`Fetching new Strava activities after timestamp: ${after} (${new Date(after * 1000).toISOString()})`);
        } else {
            // First time fetching - get last 3 months
            const threeMonthsAgo = new Date(now);
            threeMonthsAgo.setMonth(now.getMonth() - 3);
            after = Math.floor(threeMonthsAgo.getTime() / 1000);
            console.log('First time fetching Strava activities - getting last 3 months');
        }
        
        // Fetch activities from Strava API
        const response = await fetch(`https://www.strava.com/api/v3/athlete/activities?after=${after}&before=${before}&per_page=200`, {
            headers: {
                'Authorization': `Bearer ${accessToken.trim()}`
            }
        });
        
        if (response.status === 401) {
            // Token expired or invalid - silently handle by clearing token and showing connect button
            console.log('Strava token expired or invalid - reconnecting required');
            disconnectStrava(true); // Silent disconnect
            alert('Strava token is invalid or expired. Please reconnect with a valid token.');
            return;
        }
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('Strava API error:', response.status, errorText);
            throw new Error(`Strava API error: ${response.status} - ${errorText}`);
        }
        
        const activities = await response.json();
        console.log(`Fetched ${activities.length} Strava activities from API`);
        
        // Filter out activities we already have
        const newActivities = activities.filter(activity => !existingActivityIds.has(activity.id));
        console.log(`${newActivities.length} new activities (${activities.length - newActivities.length} already exist)`);
        
        if (newActivities.length === 0) {
            console.log('No new activities to sync');
            // Still update calendar in case we loaded from DB
            renderCalendar();
            return;
        }
        
        // Group new activities by date
        const newActivitiesByDate = {};
        newActivities.forEach(activity => {
            // Parse start_date_local directly from the string to avoid timezone issues
            const dateString = activity.start_date_local;
            
            // Parse the date string: "2025-11-05T06:00:00" or "2025-11-05T06:00:00Z" or similar
            // Extract YYYY-MM-DD part directly
            const dateMatch = dateString.match(/^(\d{4})-(\d{2})-(\d{2})/);
            
            if (dateMatch) {
                // Extract year, month, day directly from the string (no timezone conversion)
                const year = dateMatch[1];
                const month = dateMatch[2];
                const day = dateMatch[3];
                
                // Create a date key using the extracted components
                const dateKey = `${year}-${month}-${day}`;
                
                if (!newActivitiesByDate[dateKey]) {
                    newActivitiesByDate[dateKey] = [];
                }
                newActivitiesByDate[dateKey].push(activity);
            } else {
                // Fallback to old method if string format is unexpected
                console.warn('Unexpected date format:', dateString);
                const activityDate = new Date(activity.start_date_local);
                const year = activityDate.getFullYear();
                const month = activityDate.getMonth();
                const day = activityDate.getDate();
                const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                
                if (!newActivitiesByDate[dateKey]) {
                    newActivitiesByDate[dateKey] = [];
                }
                newActivitiesByDate[dateKey].push(activity);
            }
        });
        
        // Save new activities to database
        await saveStravaActivitiesToDB(newActivitiesByDate);
        
        console.log('New activities grouped by date:', Object.keys(newActivitiesByDate).length, 'days with new activities');
        
        // Update calendar to show workout icons
        renderCalendar();
        
    } catch (error) {
        console.error('Error fetching Strava activities:', error);
        // Show alert for errors so user knows what went wrong
        alert(`Error fetching Strava activities: ${error.message}. Please check your token and try again.`);
    }
}

// Token refresh is not implemented client-side as it requires a client secret
// which should be kept on a backend server for security
// Users need to reconnect when their token expires (tokens expire after 6 hours)

// Helper function to get icon for a specific activity
function getActivityIcon(activity) {
    const activityType = activity.type || 'Run';
    const activityName = (activity.name || '').toLowerCase();
    
    // Check if activity name contains yoga keywords (even if type is "Workout")
    const isYoga = activityName.includes('yoga') || 
                   activityName.includes('stretching') || 
                   activityName.includes('meditation') ||
                   activityType === 'Yoga';
    
    // Check if activity name contains cold plunge keywords (even if type is "Workout")
    const isColdPlunge = (activityType === 'Workout' && activityName.includes('plunge')) ||
                         activityName.includes('cold plunge') ||
                         activityName.includes('coldplunge');
    
    // Check if activity name contains snowshoe keywords (even if type is "Hike" or "Walk")
    const isSnowshoe = activityName.includes('snowshoe') || 
                      activityName.includes('snow shoe') ||
                      activityType === 'Snowshoe';
    
    // Check if activity is a water sport (standup paddling, kayaking, etc.)
    const isWaterSport = activityName.includes('paddling') || 
                        activityName.includes('paddle') ||
                        activityName.includes('sup') ||
                        activityName.includes('stand up') ||
                        activityName.includes('kayak') ||
                        activityName.includes('canoe') ||
                        activityType === 'WaterSport' ||
                        activityType === 'Kayaking' ||
                        activityType === 'Canoeing' ||
                        activityType === 'StandUpPaddling';
    
    // Map activity types to icons
    const typeIcons = {
        'Run': '🏃',
        'Ride': '🚴',
        'Walk': isSnowshoe ? '🎿' : '🚶', // Use skis icon for snowshoeing
        'Swim': '🏊',
        'Hike': isSnowshoe ? '🎿' : '🥾', // Use skis icon for snowshoeing
        'Workout': isColdPlunge ? '🧊' : (isYoga ? '🧘' : '💪'), // Use cold plunge or yoga icon if applicable
        'Yoga': '🧘',
        'Snowshoe': '🎿',
        'WaterSport': '🚣', // Standup paddle icon (rowing/paddling)
        'Kayaking': '🚣',
        'Canoeing': '🚣',
        'StandUpPaddling': '🚣',
        'Crossfit': '🏋️',
        'WeightTraining': '🏋️',
        'VirtualRide': '🚴',
        'VirtualRun': '🏃'
    };
    
    // If it's a water sport, use paddling/rowing icon
    if (isWaterSport) {
        return '🚣';
    }
    
    return typeIcons[activityType] || (isColdPlunge ? '🧊' : (isYoga ? '🧘' : (isSnowshoe ? '🎿' : '🏃')));
}

function loadStravaWorkout(year, month, day, dayElement) {
    const date = new Date(year, month, day);
    const dateKey = formatDateKey(date);
    
    // Remove any existing workout indicators
    const existingIndicators = dayElement.querySelectorAll('.workout-indicator');
    existingIndicators.forEach(indicator => indicator.remove());
    
    if (stravaActivities[dateKey] && stravaActivities[dateKey].length > 0) {
        const activities = stravaActivities[dateKey];
        
        // Create one indicator per activity
        activities.forEach((activity, index) => {
            const workoutIndicator = document.createElement('div');
            workoutIndicator.className = 'workout-indicator';
            
            // Position indicators: first one top-right, second top-left, third bottom-right, etc.
            const positions = [
                { top: '2px', right: '2px', left: 'auto' }, // top-right
                { top: '2px', left: '2px', right: 'auto' },  // top-left
                { top: 'auto', right: '2px', bottom: '2px', left: 'auto' }, // bottom-right
                { top: 'auto', left: '2px', bottom: '2px', right: 'auto' }   // bottom-left
            ];
            const position = positions[Math.min(index, positions.length - 1)];
            
            Object.assign(workoutIndicator.style, {
                position: 'absolute',
                top: position.top || 'auto',
                right: position.right || 'auto',
                left: position.left || 'auto',
                bottom: position.bottom || 'auto',
                fontSize: '0.85rem',
                background: 'rgba(255, 255, 255, 0.9)',
                borderRadius: '50%',
                width: '18px',
                height: '18px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)',
                zIndex: '5',
                cursor: 'help'
            });
            
            const icon = getActivityIcon(activity);
            const activityType = activity.type || 'Run';
            workoutIndicator.textContent = icon;
            workoutIndicator.title = `${activityType} - ${activity.name || 'Activity'}`;
            
            dayElement.appendChild(workoutIndicator);
        });
    }
}

// ==================== GARMIN INTEGRATION ====================

let garminActivities = {}; // Cache of activities by date (YYYY-MM-DD)

function initializeGarminButtons() {
    const connectBtn = document.getElementById('garminConnectBtn');
    const disconnectBtn = document.getElementById('garminDisconnectBtn');
    const configSection = document.getElementById('garminConfigSection');
    const saveTokenBtn = document.getElementById('garminSaveToken');
    const cancelConfigBtn = document.getElementById('garminCancelConfig');
    
    if (connectBtn) {
        connectBtn.addEventListener('click', () => {
            if (!currentUser) {
                alert('Please enter your name first');
                return;
            }
            // Show configuration section
            if (configSection) {
                configSection.style.display = 'block';
                configSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        });
    }
    
    if (disconnectBtn) {
        disconnectBtn.addEventListener('click', () => {
            if (confirm('Are you sure you want to disconnect Garmin?')) {
                disconnectGarmin();
            }
        });
    }
    
    // Handle Save Token button
    if (saveTokenBtn) {
        saveTokenBtn.addEventListener('click', () => {
            const sessionToken = document.getElementById('garminSessionToken').value.trim();
            if (!sessionToken) {
                alert('Please enter a session token');
                return;
            }
            saveGarminToken(sessionToken);
        });
    }
    
    // Handle Cancel button
    if (cancelConfigBtn) {
        cancelConfigBtn.addEventListener('click', () => {
            if (configSection) {
                configSection.style.display = 'none';
                // Clear form fields
                document.getElementById('garminEmail').value = '';
                document.getElementById('garminPassword').value = '';
                document.getElementById('garminSessionToken').value = '';
                const statusDiv = document.getElementById('garminAuthStatus');
                if (statusDiv) {
                    statusDiv.style.display = 'none';
                    statusDiv.innerHTML = '';
                }
            }
        });
    }
}


function checkGarminConnection() {
    if (!currentUser || !db) {
        const connectBtn = document.getElementById('garminConnectBtn');
        const disconnectBtn = document.getElementById('garminDisconnectBtn');
        if (connectBtn) connectBtn.style.display = 'none';
        if (disconnectBtn) disconnectBtn.style.display = 'none';
        return;
    }
    
    db.collection('users').doc(currentUser).get().then(doc => {
        if (doc.exists) {
            const data = doc.data();
            const hasToken = data.garminSessionToken && data.garminSessionToken.trim() !== '';
            
            console.log('Checking Garmin connection - hasToken:', hasToken);
            
            const connectBtn = document.getElementById('garminConnectBtn');
            const disconnectBtn = document.getElementById('garminDisconnectBtn');
            
            if (connectBtn) {
                connectBtn.style.display = hasToken ? 'none' : 'inline-flex';
            }
            if (disconnectBtn) {
                disconnectBtn.style.display = hasToken ? 'inline-flex' : 'none';
            }
            
            if (hasToken) {
                // Load existing activities from database first
                loadGarminActivitiesFromDB().then(() => {
                    console.log('Loaded activities from database, now syncing new ones...');
                    // Then fetch new activities from Garmin API
                    fetchGarminActivities(data.garminSessionToken);
                }).catch(error => {
                    console.error('Error loading activities from database:', error);
                    // Still try to fetch from API
                    fetchGarminActivities(data.garminSessionToken);
                });
            } else {
                console.log('No token found');
            }
        } else {
            console.log('No user document found');
            const connectBtn = document.getElementById('garminConnectBtn');
            const disconnectBtn = document.getElementById('garminDisconnectBtn');
            if (connectBtn) connectBtn.style.display = 'inline-flex';
            if (disconnectBtn) disconnectBtn.style.display = 'none';
        }
    }).catch(error => {
        console.error('Error checking Garmin connection:', error);
    });
}

// Load Garmin activities from Firestore
async function loadGarminActivitiesFromDB() {
    if (!currentUser || !db) {
        return Promise.resolve();
    }
    
    try {
        const userDoc = await db.collection('users').doc(currentUser).get();
        if (userDoc.exists) {
            const data = userDoc.data();
            const storedActivities = data.garminActivities || {};
            
            // Convert stored activities back to the garminActivities format
            garminActivities = {};
            Object.keys(storedActivities).forEach(dateKey => {
                garminActivities[dateKey] = storedActivities[dateKey];
            });
            
            console.log(`Loaded ${Object.keys(garminActivities).length} days with activities from database`);
            
            // Update calendar to show loaded activities
            renderCalendar();
        }
    } catch (error) {
        console.error('Error loading Garmin activities from database:', error);
        throw error;
    }
}

// Save Garmin activities to Firestore
async function saveGarminActivitiesToDB(newActivities) {
    if (!currentUser || !db) {
        return;
    }
    
    try {
        const userDocRef = db.collection('users').doc(currentUser);
        const userDoc = await userDocRef.get();
        
        const existingData = userDoc.exists ? userDoc.data() : {};
        const existingActivities = existingData.garminActivities || {};
        
        // Merge new activities with existing ones
        const mergedActivities = { ...existingActivities };
        
        Object.keys(newActivities).forEach(dateKey => {
            if (!mergedActivities[dateKey]) {
                mergedActivities[dateKey] = [];
            }
            
            // Get existing activity IDs for this date
            const existingIds = new Set(mergedActivities[dateKey].map(a => a.activityId || a.id));
            
            // Add new activities that don't already exist
            newActivities[dateKey].forEach(activity => {
                const activityId = activity.activityId || activity.id;
                if (!existingIds.has(activityId)) {
                    mergedActivities[dateKey].push(activity);
                }
            });
        });
        
        // Preserve all existing data (including home office data) when updating
        // Get all existing fields to preserve them
        const updatedData = { ...existingData };
        updatedData.garminActivities = mergedActivities;
        
        // Update the document with merged activities while preserving all other data
        await userDocRef.set(updatedData, { merge: true });
        
        console.log('Saved Garmin activities to database');
        
        // Update in-memory cache
        garminActivities = mergedActivities;
        
    } catch (error) {
        console.error('Error saving Garmin activities to database:', error);
        throw error;
    }
}

function saveGarminToken(sessionToken) {
    if (!currentUser || !db) {
        alert('Please enter your name first');
        return;
    }
    
    if (!sessionToken || sessionToken.trim() === '') {
        alert('Please enter a valid session token');
        return;
    }
    
    const statusDiv = document.getElementById('garminAuthStatus');
    
    // Show status
    if (statusDiv) {
        statusDiv.style.display = 'block';
        statusDiv.style.background = '#e3f2fd';
        statusDiv.style.color = '#1565c0';
        statusDiv.innerHTML = '⏳ Saving token and testing connection...';
    }
    
    const userDocRef = db.collection('users').doc(currentUser);
    
    userDocRef.get().then(doc => {
        const data = doc.exists ? doc.data() : {};
        data.garminSessionToken = sessionToken.trim();
        
        userDocRef.set(data, { merge: true })
            .then(() => {
                console.log('Garmin token saved successfully');
                
                // Update UI immediately
                document.getElementById('garminConnectBtn').style.display = 'none';
                document.getElementById('garminDisconnectBtn').style.display = 'inline-flex';
                
                // Show success
                if (statusDiv) {
                    statusDiv.style.display = 'block';
                    statusDiv.style.background = '#e8f5e9';
                    statusDiv.style.color = '#2e7d32';
                    statusDiv.innerHTML = '✅ Token saved! Importing all Garmin activities...';
                }
                
                // Load existing activities from database first, then fetch new ones
                loadGarminActivitiesFromDB().then(() => {
                    // Fetch new activities from Garmin API
                    fetchGarminActivities(sessionToken.trim());
                }).catch(error => {
                    console.error('Error loading activities from database:', error);
                    // Still try to fetch from API
                    fetchGarminActivities(sessionToken.trim());
                });
                
                // Hide config section after a short delay
                setTimeout(() => {
                    const configSection = document.getElementById('garminConfigSection');
                    if (configSection) {
                        configSection.style.display = 'none';
                        // Clear form fields
                        document.getElementById('garminEmail').value = '';
                        document.getElementById('garminPassword').value = '';
                        document.getElementById('garminSessionToken').value = '';
                        if (statusDiv) {
                            statusDiv.style.display = 'none';
                            statusDiv.innerHTML = '';
                        }
                    }
                }, 3000);
                
                // Also check connection to ensure consistency
                setTimeout(() => {
                    checkGarminConnection();
                }, 500);
            })
            .catch(error => {
                console.error('Error saving Garmin token:', error);
                if (statusDiv) {
                    statusDiv.style.display = 'block';
                    statusDiv.style.background = '#ffebee';
                    statusDiv.style.color = '#c62828';
                    statusDiv.innerHTML = '❌ Error saving token. Please try again.';
                } else {
                    alert('Error saving token. Please try again.');
                }
            });
    }).catch(error => {
        console.error('Error accessing database:', error);
        if (statusDiv) {
            statusDiv.style.display = 'block';
            statusDiv.style.background = '#ffebee';
            statusDiv.style.color = '#c62828';
            statusDiv.innerHTML = '❌ Error accessing database. Please try again.';
        } else {
            alert('Error accessing database. Please try again.');
        }
    });
}

function disconnectGarmin(silent = false) {
    if (!currentUser || !db) return;
    
    const userDocRef = db.collection('users').doc(currentUser);
    
    userDocRef.get().then(doc => {
        const data = doc.exists ? doc.data() : {};
        data.garminSessionToken = null;
        data.garminActivities = null; // Clear activities from database
        
        userDocRef.set(data, { merge: true })
            .then(() => {
                garminActivities = {};
                checkGarminConnection();
                renderCalendar();
                if (!silent) {
                    console.log('Garmin disconnected');
                }
            })
            .catch(error => {
                console.error('Error disconnecting Garmin:', error);
                if (!silent) {
                    alert('Error disconnecting Garmin. Please try again.');
                }
            });
    });
}

// Helper function to fetch a single page of Garmin activities
async function fetchGarminActivitiesPage(sessionToken, startTimestamp, limit = 200) {
    const response = await fetch(`https://connectapi.garmin.com/activitylist-service/activities/search/activities?start=${startTimestamp}&limit=${limit}`, {
        method: 'GET',
        headers: {
            'Cookie': `SESSIONID=${sessionToken.trim()}`,
            'Accept': 'application/json',
            'Referer': 'https://connect.garmin.com/'
        },
        credentials: 'include'
    });
    
    if (response.status === 401 || response.status === 403) {
        // Token expired or invalid
        console.log('Garmin token expired or invalid - reconnecting required');
        disconnectGarmin(true); // Silent disconnect
        throw new Error('Garmin session token is invalid or expired. Please run the Python script again to get a new token.');
    }
    
    if (!response.ok) {
        const errorText = await response.text();
        console.error('Garmin API error:', response.status, errorText);
        
        // If CORS error, provide helpful message
        if (response.status === 0 || errorText.includes('CORS')) {
            throw new Error('CORS error: Garmin API cannot be accessed directly from browser. You may need a backend proxy service.');
        }
        
        throw new Error(`Garmin API error: ${response.status} - ${errorText}`);
    }
    
    return await response.json();
}

async function fetchGarminActivities(sessionToken) {
    if (!sessionToken || sessionToken.trim() === '') {
        console.log('No session token provided');
        return;
    }
    
    try {
        // Get existing activities to find the latest timestamp
        let latestActivityTimestamp = 0;
        let earliestActivityTimestamp = Infinity;
        const existingActivityIds = new Set();
        
        // Find the latest and earliest activity timestamps from existing activities
        Object.keys(garminActivities).forEach(dateKey => {
            garminActivities[dateKey].forEach(activity => {
                const activityId = activity.activityId || activity.id;
                existingActivityIds.add(activityId);
                // Use startTimeGMT if available, otherwise parse startTimeLocal
                let timestamp = 0;
                if (activity.startTimeGMT) {
                    timestamp = new Date(activity.startTimeGMT).getTime() / 1000;
                } else if (activity.startTimeLocal) {
                    timestamp = new Date(activity.startTimeLocal).getTime() / 1000;
                }
                
                if (timestamp > 0) {
                    if (timestamp > latestActivityTimestamp) {
                        latestActivityTimestamp = timestamp;
                    }
                    if (timestamp < earliestActivityTimestamp) {
                        earliestActivityTimestamp = timestamp;
                    }
                }
            });
        });
        
        const now = new Date();
        const nextMonth = new Date(now);
        nextMonth.setMonth(now.getMonth() + 1);
        const before = Math.floor(nextMonth.getTime() / 1000);
        
        // Determine if this is the first import (no existing activities)
        const isFirstImport = latestActivityTimestamp === 0;
        
        let after;
        let shouldFetchAll = false;
        
        if (isFirstImport) {
            // First time fetching - import ALL historical data
            // Go back 10 years to get all activities (adjust if needed)
            const tenYearsAgo = new Date(now);
            tenYearsAgo.setFullYear(now.getFullYear() - 10);
            after = Math.floor(tenYearsAgo.getTime() / 1000);
            shouldFetchAll = true;
            console.log('First time importing Garmin data - fetching ALL historical activities (last 10 years)');
        } else {
            // Fetch activities after the latest one we have (subtract 1 day to be safe)
            after = latestActivityTimestamp - 86400; // 1 day in seconds
            console.log(`Fetching new Garmin activities after timestamp: ${after} (${new Date(after * 1000).toISOString()})`);
        }
        
        // Fetch activities with pagination
        let allActivities = [];
        let currentStart = after;
        let hasMore = true;
        const limit = 200;
        let pageCount = 0;
        const maxPages = shouldFetchAll ? 100 : 10; // Limit pages to avoid infinite loops
        
        while (hasMore && pageCount < maxPages) {
            pageCount++;
            console.log(`Fetching Garmin activities page ${pageCount} (start: ${currentStart}, ${new Date(currentStart * 1000).toISOString()})`);
            
            const activities = await fetchGarminActivitiesPage(sessionToken, currentStart, limit);
            
            if (activities.length === 0) {
                hasMore = false;
                break;
            }
            
            allActivities = allActivities.concat(activities);
            console.log(`Fetched ${activities.length} activities (total so far: ${allActivities.length})`);
            
            // If we got fewer than the limit, we've reached the end
            if (activities.length < limit) {
                hasMore = false;
            } else {
                // For next page, use the timestamp of the last activity (oldest in this batch)
                // Activities are typically returned in reverse chronological order (newest first)
                const lastActivity = activities[activities.length - 1];
                let lastTimestamp = 0;
                if (lastActivity.startTimeGMT) {
                    lastTimestamp = new Date(lastActivity.startTimeGMT).getTime() / 1000;
                } else if (lastActivity.startTimeLocal) {
                    lastTimestamp = new Date(lastActivity.startTimeLocal).getTime() / 1000;
                } else if (lastActivity.beginTimestamp) {
                    lastTimestamp = lastActivity.beginTimestamp;
                }
                
                // Check if we've reached the current time (for full import)
                if (shouldFetchAll && lastTimestamp >= before) {
                    hasMore = false;
                    console.log('Reached current time, stopping import');
                } else if (lastTimestamp > 0 && lastTimestamp > currentStart) {
                    // Use the last activity's timestamp + 1 second as the next start
                    // This ensures we don't miss any activities and don't get duplicates
                    currentStart = lastTimestamp + 1;
                } else {
                    // No valid timestamp found or timestamp didn't advance - stop fetching
                    hasMore = false;
                    console.log('No more activities to fetch or timestamp did not advance');
                }
            }
            
            // Add a small delay to avoid rate limiting
            if (hasMore) {
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }
        
        console.log(`Fetched ${allActivities.length} total Garmin activities from API`);
        
        // Filter out activities we already have
        const newActivities = allActivities.filter(activity => {
            const activityId = activity.activityId || activity.id;
            return !existingActivityIds.has(activityId);
        });
        console.log(`${newActivities.length} new activities (${allActivities.length - newActivities.length} already exist)`);
        
        if (newActivities.length === 0) {
            console.log('No new activities to sync');
            renderCalendar();
            return;
        }
        
        // Group new activities by date
        const newActivitiesByDate = {};
        newActivities.forEach(activity => {
            // Parse startTimeLocal or startTimeGMT
            const dateString = activity.startTimeLocal || activity.startTimeGMT || activity.beginTimestamp;
            
            // Parse the date string
            const dateMatch = dateString ? dateString.match(/^(\d{4})-(\d{2})-(\d{2})/) : null;
            
            if (dateMatch) {
                const year = dateMatch[1];
                const month = dateMatch[2];
                const day = dateMatch[3];
                const dateKey = `${year}-${month}-${day}`;
                
                if (!newActivitiesByDate[dateKey]) {
                    newActivitiesByDate[dateKey] = [];
                }
                newActivitiesByDate[dateKey].push(activity);
            } else {
                // Fallback to old method if string format is unexpected
                console.warn('Unexpected date format:', dateString);
                const activityDate = dateString ? new Date(dateString) : new Date(activity.beginTimestamp * 1000);
                const year = activityDate.getFullYear();
                const month = activityDate.getMonth();
                const day = activityDate.getDate();
                const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                
                if (!newActivitiesByDate[dateKey]) {
                    newActivitiesByDate[dateKey] = [];
                }
                newActivitiesByDate[dateKey].push(activity);
            }
        });
        
        // Save new activities to database (this will preserve home office data)
        await saveGarminActivitiesToDB(newActivitiesByDate);
        
        console.log('New activities grouped by date:', Object.keys(newActivitiesByDate).length, 'days with new activities');
        
        // Update calendar to show workout icons
        renderCalendar();
        
        // Show success message for first import
        if (isFirstImport && newActivities.length > 0) {
            const statusDiv = document.getElementById('garminAuthStatus');
            if (statusDiv) {
                statusDiv.style.display = 'block';
                statusDiv.style.background = '#e8f5e9';
                statusDiv.style.color = '#2e7d32';
                statusDiv.innerHTML = `✅ Successfully imported ${newActivities.length} Garmin activities!`;
            }
        }
        
    } catch (error) {
        console.error('Error fetching Garmin activities:', error);
        
        // Show helpful error message
        const errorMsg = error.message.includes('CORS') 
            ? 'Garmin API cannot be accessed directly from browser due to CORS restrictions. You may need to set up a backend proxy service that uses the garminconnect Python library.'
            : `Error fetching Garmin activities: ${error.message}. Please check your token and try again.`;
        
        alert(errorMsg);
        
        // Update status div if it exists
        const statusDiv = document.getElementById('garminAuthStatus');
        if (statusDiv) {
            statusDiv.style.display = 'block';
            statusDiv.style.background = '#ffebee';
            statusDiv.style.color = '#c62828';
            statusDiv.innerHTML = `❌ ${errorMsg}`;
        }
    }
}

// Load Garmin workout data for a specific day
function loadGarminWorkout(year, month, day, dayElement) {
    const date = new Date(year, month, day);
    const dateKey = formatDateKey(date);
    
    // Get existing workout indicators (we'll add Garmin activities alongside Strava)
    const existingIndicators = dayElement.querySelectorAll('.workout-indicator');
    let indicatorCount = existingIndicators.length;
    
    if (garminActivities[dateKey] && garminActivities[dateKey].length > 0) {
        const activities = garminActivities[dateKey];
        
        // Create one indicator per activity
        activities.forEach((activity, index) => {
            const workoutIndicator = document.createElement('div');
            workoutIndicator.className = 'workout-indicator';
            
            // Position indicators: continue from where Strava indicators left off
            const positions = [
                { top: '2px', right: '2px', left: 'auto' }, // top-right
                { top: '2px', left: '2px', right: 'auto' },  // top-left
                { top: 'auto', right: '2px', bottom: '2px', left: 'auto' }, // bottom-right
                { top: 'auto', left: '2px', bottom: '2px', right: 'auto' }   // bottom-left
            ];
            const position = positions[Math.min((indicatorCount + index) % 4, positions.length - 1)];
            
            Object.assign(workoutIndicator.style, {
                position: 'absolute',
                top: position.top || 'auto',
                right: position.right || 'auto',
                left: position.left || 'auto',
                bottom: position.bottom || 'auto',
                fontSize: '0.85rem',
                background: 'rgba(0, 124, 195, 0.9)', // Garmin blue
                borderRadius: '50%',
                width: '18px',
                height: '18px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)',
                zIndex: '5',
                cursor: 'help'
            });
            
            const icon = getGarminActivityIcon(activity);
            const activityType = activity.activityType?.typeKey || activity.type || 'running';
            workoutIndicator.textContent = icon;
            workoutIndicator.title = `${activityType} - ${activity.activityName || activity.name || 'Activity'}`;
            
            dayElement.appendChild(workoutIndicator);
        });
    }
}

// Helper function to get icon for a Garmin activity
function getGarminActivityIcon(activity) {
    const activityType = (activity.activityType?.typeKey || activity.type || 'running').toLowerCase();
    const activityName = (activity.activityName || activity.name || '').toLowerCase();
    
    // Map Garmin activity types to icons (similar to Strava)
    const typeIcons = {
        'running': '🏃',
        'cycling': '🚴',
        'walking': '🚶',
        'swimming': '🏊',
        'hiking': '🥾',
        'yoga': '🧘',
        'strength_training': '🏋️',
        'weight_training': '🏋️',
        'crossfit': '🏋️',
        'elliptical': '🏃',
        'rowing': '🚣',
        'indoor_rowing': '🚣'
    };
    
    // Check for cold plunge keywords
    if ((activityType === 'workout' && activityName.includes('plunge')) ||
        activityName.includes('cold plunge') ||
        activityName.includes('coldplunge')) {
        return '🧊';
    }
    
    // Check for yoga keywords
    if (activityName.includes('yoga') || activityName.includes('stretching') || activityName.includes('meditation')) {
        return '🧘';
    }
    
    // Check for weight training keywords
    if (activityName.includes('weight') || activityName.includes('f45') || activityName.includes('crossfit') || activityName.includes('gym')) {
        return '🏋️';
    }
    
    return typeIcons[activityType] || '🏃';
}


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
let selectedDate = null;
let stravaActivities = {}; // Cache of activities by date (YYYY-MM-DD)
let activeFilters = {
    work: true,
    health: true
}; // Track which filters are active

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    // Check if we're returning from Strava OAuth
    handleStravaOAuthCallback();
    initializeApp();
});

// Handle OAuth callback from Strava
function handleStravaOAuthCallback() {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const error = urlParams.get('error');
    
    if (error) {
        console.error('Strava OAuth error:', error);
        alert(`Strava authorization failed: ${error}`);
        // Clean up URL
        window.history.replaceState({}, document.title, window.location.pathname);
        return;
    }
    
    if (code) {
        // Show the code to the user with instructions
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

    // Close modal when clicking outside
    window.addEventListener('click', (e) => {
        const modal = document.getElementById('modal');
        if (e.target === modal) {
            closeModal();
        }
    });

    // Render calendar
    renderCalendar();
    
    // Initialize modal listeners
    initializeModalListeners();
    
    // Initialize Strava buttons
    initializeStravaButtons();
    
    // Initialize Settings modal
    initializeSettingsModal();
    
    // Load Strava connection status
    if (currentUser) {
        checkStravaConnection();
    }
    
    // Update stats (even if no user, to show "-")
    updateStats();
}

function initializeModalListeners() {
    // Close button
    const closeBtn = document.querySelector('.close');
    closeBtn.replaceWith(closeBtn.cloneNode(true));
    document.querySelector('.close').addEventListener('click', closeModal);
    
    // Location buttons
    document.querySelectorAll('.location-btn').forEach(btn => {
        btn.replaceWith(btn.cloneNode(true));
    });
    document.querySelectorAll('.location-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const location = e.currentTarget.getAttribute('data-location');
            saveLocation(selectedDate, location);
        });
    });
}

function setUserName() {
    const userNameInput = document.getElementById('userName');
    const name = userNameInput.value.trim();
    
    if (!name) {
        alert('Please enter your name');
        return;
    }

    currentUser = name;
    localStorage.setItem('currentUser', currentUser);
    updateUserStatus();
    
    // Check Strava connection status after setting user
    setTimeout(() => {
        checkStravaConnection();
    }, 100);
    
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

function renderCalendar() {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    
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
        loadDayLocation(prevYear, prevMonth, prevDay, prevDayElement);
        
        // Load Strava workout data
        loadStravaWorkout(prevYear, prevMonth, prevDay, prevDayElement);
        
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
        loadDayLocation(year, month, day, dayElement);
        
        // Load Strava workout data
        loadStravaWorkout(year, month, day, dayElement);

        calendarGrid.appendChild(dayElement);
        dayElementsAdded++;
        
        // Insert stats cell after Sunday (every 7 day elements)
        if (dayElementsAdded % 7 === 0) {
            calendarGrid.appendChild(createPlaceholderStatsCell());
        }
    }

    // Add next month's days for remaining cells in the last week
    const totalCells = startingDayOfWeek + daysInMonth;
    const remainingCells = 7 - (totalCells % 7);
    if (remainingCells < 7 && remainingCells > 0) {
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
            loadDayLocation(nextYear, nextMonth, i, nextDayElement);
            
            calendarGrid.appendChild(nextDayElement);
            dayElementsAdded++;
            
            // Insert stats cell after Sunday (every 7 day elements)
            if (dayElementsAdded % 7 === 0) {
                calendarGrid.appendChild(createPlaceholderStatsCell());
            }
        }
    }
    
    // Ensure we always show complete weeks (at least 6 weeks = 42 day cells)
    // If we have less than 42 day cells, add more days from next month
    const dayElementsCount = calendarGrid.querySelectorAll('.calendar-day').length;
    if (dayElementsCount < 42) {
        const nextMonth = month === 11 ? 0 : month + 1;
        const nextYear = month === 11 ? year + 1 : year;
        const nextMonthFirstDay = new Date(nextYear, nextMonth, 1);
        const daysInNextMonth = new Date(nextYear, nextMonth + 1, 0).getDate();
        
        // Calculate how many days we've already added from next month
        const alreadyAddedNextMonthDays = remainingCells > 0 && remainingCells < 7 ? remainingCells : 0;
        const startDay = alreadyAddedNextMonthDays + 1;
        const cellsToAdd = 42 - dayElementsCount;
        
        for (let i = 0; i < cellsToAdd && (startDay + i) <= daysInNextMonth; i++) {
            const dayNum = startDay + i;
            const nextDate = new Date(nextYear, nextMonth, dayNum);
            const nextDayElement = createDayElement(dayNum, nextYear, nextMonth);
            nextDayElement.classList.add('other-month');
            
            // Highlight today if it falls in next month
            if (nextDate.toDateString() === today.toDateString()) {
                nextDayElement.classList.add('today');
            }
            
            // Load location data for next month day
            loadDayLocation(nextYear, nextMonth, dayNum, nextDayElement);
            
            // Load Strava workout data
            loadStravaWorkout(nextYear, nextMonth, dayNum, nextDayElement);
            
            calendarGrid.appendChild(nextDayElement);
            dayElementsAdded++;
            
            // Insert stats cell after Sunday (every 7 day elements)
            if (dayElementsAdded % 7 === 0) {
                calendarGrid.appendChild(createPlaceholderStatsCell());
            }
        }
    }
    
    // Add week summary badges after rendering is complete
    addWeekSummaries(year, month, startingDayOfWeek, daysInMonth);
    
    // Add week stats cells after rendering is complete
    addWeekStatsCells(year, month, startingDayOfWeek, daysInMonth);
    
    // Update stats
    updateStats();
}

function createDayElement(day, year, month) {
    const dayDiv = document.createElement('div');
    dayDiv.className = 'calendar-day';
    
    if (day !== null) {
        dayDiv.innerHTML = `
            <div class="day-number">${day}</div>
            <div class="location-indicator" data-location="none"></div>
        `;
        
        dayDiv.addEventListener('click', () => {
            if (!currentUser) {
                alert('Please enter your name first');
                return;
            }
            
            const date = new Date(year, month, day);
            selectedDate = date;
            openModal(selectedDate);
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
                activeBtn.style.background = location === 'home' ? '#f1f8f4' : '#f0f7ff';
                activeBtn.style.borderColor = location === 'home' ? '#4caf50' : '#2196f3';
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
    const userDocRef = db.collection('users').doc(currentUser);
    
    userDocRef.get().then(doc => {
        const data = doc.exists ? doc.data() : {};
        data[dateStr] = location === 'none' ? null : location;
        
        userDocRef.set(data, { merge: true })
            .then(() => {
                closeModal();
                renderCalendar(); // Refresh calendar to show updated location
            })
            .catch(error => {
                console.error('Error saving location:', error);
                alert('Error saving location. Please try again.');
            });
    }).catch(error => {
        console.error('Error accessing database:', error);
        alert('Error accessing database. Please try again.');
    });
}

function loadDayLocation(year, month, day, dayElement) {
    if (!currentUser) return;

    const date = new Date(year, month, day);
    const dateStr = formatDateKey(date);
    const dayOfWeek = date.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6; // Sunday or Saturday
    
    db.collection('users').doc(currentUser).get().then(doc => {
        if (doc.exists) {
            const data = doc.data();
            // For weekends, default to 'home' if not explicitly set
            const location = data[dateStr] || (isWeekend ? 'home' : 'none');
            updateDayElement(dayElement, location);
        } else {
            // First time user - auto-set weekends to home
            if (isWeekend) {
                updateDayElement(dayElement, 'home');
            } else {
                updateDayElement(dayElement, 'none');
            }
        }
    });
}

function loadLocationForDate(date) {
    if (!currentUser) return Promise.resolve('none');

    const dateStr = formatDateKey(date);
    const dayOfWeek = date.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6; // Sunday or Saturday
    
    return db.collection('users').doc(currentUser).get().then(doc => {
        if (doc.exists) {
            const data = doc.data();
            // For weekends, default to 'home' if not explicitly set
            return data[dateStr] || (isWeekend ? 'home' : 'none');
        }
        // First time user - weekends default to home
        return isWeekend ? 'home' : 'none';
    });
}

function updateDayElement(dayElement, location) {
    const indicator = dayElement.querySelector('.location-indicator');
    
    if (location === 'home') {
        indicator.className = 'location-indicator home';
        indicator.textContent = '🏠';
    } else if (location === 'office') {
        indicator.className = 'location-indicator office';
        indicator.textContent = '🏢';
    } else {
        indicator.className = 'location-indicator';
        indicator.textContent = '';
    }
}

function formatDateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function addWeekSummaries(year, month, startingDayOfWeek, daysInMonth) {
    if (!currentUser) return;
    
    // Calculate previous and next month info
    const prevMonth = month === 0 ? 11 : month - 1;
    const prevYear = month === 0 ? year - 1 : year;
    const nextMonth = month === 11 ? 0 : month + 1;
    const nextYear = month === 11 ? year + 1 : year;
    
    // Get all user data once
    db.collection('users').doc(currentUser).get().then(doc => {
        const allDays = document.querySelectorAll('.calendar-day');
        const data = doc.exists ? doc.data() : {};
        
        // Group days into weeks based on calendar grid position (not date's day of week)
        // Sunday is always in column 7, which is index 6, 13, 20, 27, etc. (index % 7 === 6)
        let currentWeek = [];
        let weekStartIndex = 0;
        
        allDays.forEach((dayElement, index) => {
            const dayNumber = dayElement.querySelector('.day-number');
            
            // Check if this is Sunday column in the grid (7th column, index % 7 === 6)
            const isSundayColumn = (index % 7) === 6;
            
            if (dayNumber) {
                const day = parseInt(dayNumber.textContent);
                if (!isNaN(day)) {
                    // Determine if this is from previous month, current month, or next month
                    const isOtherMonth = dayElement.classList.contains('other-month');
                    let date;
                    
                    if (isOtherMonth) {
                        // First startingDayOfWeek cells with other-month are from previous month
                        // The rest are from next month
                        if (index < startingDayOfWeek) {
                            // Previous month
                            date = new Date(prevYear, prevMonth, day);
                        } else {
                            // Next month
                            date = new Date(nextYear, nextMonth, day);
                        }
                    } else {
                        // Current month
                        date = new Date(year, month, day);
                    }
                    
                    // Get location for this day
                    const dateKey = formatDateKey(date);
                    const explicitLocation = data[dateKey]; // The actual value from Firestore (or undefined)
                    
                    // Handle weekend defaults for display
                    let location = explicitLocation;
                    if (!location) {
                        const dayOfWeek = date.getDay();
                        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
                        location = isWeekend ? 'home' : 'none';
                    }
                    
                    currentWeek.push({ location, explicitLocation, date, element: dayElement });
                }
            } else {
                // Empty cell - add placeholder but don't count it
                currentWeek.push({ location: null, explicitLocation: null, date: null, element: dayElement });
            }
            
            // If this is Sunday column (7th column) or last cell, add summary badge
            if (isSundayColumn || index === allDays.length - 1) {
                countAndDisplayWeekSummary(currentWeek, weekStartIndex);
                currentWeek = [];
                weekStartIndex = index + 1;
            }
        });
    });
}

function countAndDisplayWeekSummary(weekDays, startIndex) {
    // Count office days (including previous and next month's days)
    let officeDays = 0;
    let hasExplicitWeekdayData = false; // Check if at least one weekday (Mon-Fri) has explicit data
    
    weekDays.forEach(({ location, explicitLocation, date, element }) => {
        // Count all days in the week, even if they're from previous or next month
        // Only count if location is not null (skip empty placeholder cells)
        if (location !== null && element.querySelector('.day-number')) {
            if (location === 'office') {
                officeDays++;
            }
            
            // Check if it's a weekday (Mon-Fri) with an explicit location set
            if (date) {
                const dayOfWeek = date.getDay(); // 0 for Sunday, 1 for Monday, ..., 6 for Saturday
                if (dayOfWeek >= 1 && dayOfWeek <= 5) { // Monday to Friday
                    // Only count if explicitly set in Firestore (not defaulted)
                    if (explicitLocation === 'home' || explicitLocation === 'office') {
                        hasExplicitWeekdayData = true;
                    }
                }
            }
        }
    });
    
    // Office badge removed from Sunday cells - office count is now shown in Stats column only
    // Removed code that displayed badge on Sunday cells
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

function addWeekStatsCells(year, month, startingDayOfWeek, daysInMonth) {
    if (!currentUser || !db) return;
    
    const calendarGrid = document.getElementById('calendarGrid');
    const allChildren = Array.from(calendarGrid.children);
    const statsPlaceholders = Array.from(calendarGrid.querySelectorAll('[data-stats-placeholder="true"]'));
    
    // Calculate previous and next month info
    const prevMonth = month === 0 ? 11 : month - 1;
    const prevYear = month === 0 ? year - 1 : year;
    const nextMonth = month === 11 ? 0 : month + 1;
    const nextYear = month === 11 ? year + 1 : year;
    
    // Get location data and goals
    db.collection('users').doc(currentUser).get().then(doc => {
        const locationData = doc.exists ? doc.data() : {};
        const userGoals = (doc.exists && doc.data().weeklyGoals) ? doc.data().weeklyGoals : {
            office: 3,
            running: 0,
            weights: 0,
            yoga: 0
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
            let homeDays = 0;
            const daysWithRunning = new Set();
            const daysWithWeightTraining = new Set();
            const daysWithYoga = new Set();
            let weekHasStarted = false;
            
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
                    }
                } else {
                    date = new Date(year, month, day);
                }
                
                // Check if this day has occurred (is today or in the past)
                if (date <= today) {
                    weekHasStarted = true;
                }
                
                const dateKey = formatDateKey(date);
                
                // Check office location
                const explicitLocation = locationData[dateKey];
                const dayOfWeek = date.getDay();
                const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
                const location = explicitLocation || (isWeekend ? 'home' : 'none');
                
                if (location === 'office') {
                    officeDays++;
                } else if (location === 'home') {
                    homeDays++;
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
                        if (isYogaActivity(activity)) {
                            daysWithYoga.add(dateKey);
                        }
                    });
                }
            });
            
            // Only show stats if the week has started
            if (weekHasStarted) {
                const runningDays = daysWithRunning.size;
                const weightTrainingDays = daysWithWeightTraining.size;
                const yogaDays = daysWithYoga.size;
                
                // Check if goals are met
                const officeGoalMet = userGoals.office > 0 && officeDays >= userGoals.office;
                const runningGoalMet = userGoals.running > 0 && runningDays >= userGoals.running;
                const weightsGoalMet = userGoals.weights > 0 && weightTrainingDays >= userGoals.weights;
                const yogaGoalMet = userGoals.yoga > 0 && yogaDays >= userGoals.yoga;
                
                // Build stats HTML based on active filters
                let statsHTML = '';
                
                // Work stats (office and home) - upper half, one line
                if (activeFilters.work) {
                    statsHTML += `
                        <div class="stat-row">
                            <div class="stat-item">
                                <span class="stat-label">🏢</span>
                                <span class="stat-value">${officeDays}${officeGoalMet ? '<span class="goal-met">✓</span>' : ''}</span>
                            </div>
                            <div class="stat-item">
                                <span class="stat-label">🏠</span>
                                <span class="stat-value">${homeDays}</span>
                            </div>
                        </div>
                    `;
                }
                
                // Health stats (running, weights, yoga) - lower half, one line
                if (activeFilters.health) {
                    statsHTML += `
                        <div class="stat-row">
                            <div class="stat-item">
                                <span class="stat-label">🏃</span>
                                <span class="stat-value">${runningDays}${runningGoalMet ? '<span class="goal-met">✓</span>' : ''}</span>
                            </div>
                            <div class="stat-item">
                                <span class="stat-label">🏋️</span>
                                <span class="stat-value">${weightTrainingDays}${weightsGoalMet ? '<span class="goal-met">✓</span>' : ''}</span>
                            </div>
                            <div class="stat-item">
                                <span class="stat-label">🧘</span>
                                <span class="stat-value">${yogaDays}${yogaGoalMet ? '<span class="goal-met">✓</span>' : ''}</span>
                            </div>
                        </div>
                    `;
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

// Calculate and display stats
function updateStats() {
    // Always update UI elements, even if no user or data
    const avgElement = document.getElementById('avgWeeklyOffice');
    const beltElement = document.getElementById('beltValue');
    
    // Default to "-" if no user or db
    if (!currentUser || !db) {
        if (avgElement) avgElement.textContent = '-';
        if (beltElement) beltElement.textContent = '-';
        return;
    }
    
    db.collection('users').doc(currentUser).get().then(doc => {
        const data = doc.exists ? doc.data() : {};
        
        // Group all days into weeks (only explicitly saved data)
        const weeksMap = new Map(); // Map of week key (Monday date string) to week data
        
        // Process all dates in the data
        Object.keys(data).forEach(dateKey => {
            // Skip null values (cleared locations)
            if (!data[dateKey]) return;
            
            const date = parseDateKey(dateKey);
            if (isNaN(date.getTime())) return; // Invalid date
            
            const monday = getMondayOfWeek(date);
            const weekKey = formatDateKey(monday);
            
            if (!weeksMap.has(weekKey)) {
                weeksMap.set(weekKey, {
                    weekStart: monday,
                    days: new Map() // Map of date key to location
                });
            }
            
            weeksMap.get(weekKey).days.set(dateKey, data[dateKey]);
        });
        
        // Convert weeks map to array and calculate office days per week
        const weeks = Array.from(weeksMap.values()).map(week => {
            let officeDays = 0;
            let hasData = false; // Track if week has any home or office days
            
            week.days.forEach(location => {
                if (location === 'home' || location === 'office') {
                    hasData = true;
                }
                if (location === 'office') {
                    officeDays++;
                }
            });
            
            return {
                weekStart: week.weekStart,
                officeDays: officeDays,
                hasData: hasData
            };
        });
        
        // Calculate average weekly office days (only weeks with data)
        // Exclude current week if it doesn't have data through Friday
        const today = new Date();
        const currentWeekMonday = getMondayOfWeek(today);
        const currentWeekFriday = new Date(currentWeekMonday);
        currentWeekFriday.setDate(currentWeekFriday.getDate() + 4); // Friday is 4 days after Monday
        const currentWeekFridayKey = formatDateKey(currentWeekFriday);
        const hasCurrentWeekFridayData = !!data[currentWeekFridayKey];
        
        const weeksWithData = weeks.filter(w => {
            // Exclude current week if it doesn't have Friday data
            if (w.weekStart.getTime() === currentWeekMonday.getTime()) {
                return hasCurrentWeekFridayData && w.hasData;
            }
            return w.hasData;
        });
        
        let avgWeeklyOffice = 0;
        if (weeksWithData.length > 0) {
            const totalOfficeDays = weeksWithData.reduce((sum, w) => sum + w.officeDays, 0);
            avgWeeklyOffice = totalOfficeDays / weeksWithData.length;
        }
        
        // Calculate BELT: Best 8 weeks from last 12 weeks
        const todayMonday = getMondayOfWeek(today);
        const twelveWeeksAgo = new Date(todayMonday);
        twelveWeeksAgo.setDate(twelveWeeksAgo.getDate() - 11 * 7); // 11 weeks back (12 weeks total)
        
        const last12Weeks = weeks.filter(w => {
            return w.weekStart >= twelveWeeksAgo && w.weekStart <= todayMonday;
        });
        
        // Sort by office days (descending) and take best 8
        const best8Weeks = last12Weeks
            .filter(w => w.hasData)
            .sort((a, b) => b.officeDays - a.officeDays)
            .slice(0, 8);
        
        let beltAverage = 0;
        if (best8Weeks.length > 0) {
            const totalOfficeDays = best8Weeks.reduce((sum, w) => sum + w.officeDays, 0);
            beltAverage = totalOfficeDays / best8Weeks.length;
        }
        
        // Update UI
        if (avgElement) {
            avgElement.textContent = weeksWithData.length > 0 
                ? avgWeeklyOffice.toFixed(2) 
                : '-';
        }
        
        if (beltElement) {
            beltElement.textContent = best8Weeks.length > 0 
                ? beltAverage.toFixed(2) 
                : '-';
        }
    }).catch(error => {
        console.error('Error calculating stats:', error);
        // On error, show "-"
        if (avgElement) avgElement.textContent = '-';
        if (beltElement) beltElement.textContent = '-';
    });
}

// Real-time updates - listen for changes from other devices
if (currentUser && db) {
    db.collection('users').doc(currentUser).onSnapshot(doc => {
        if (doc.exists) {
            renderCalendar(); // Refresh calendar when data changes (which also updates stats)
        } else {
            updateStats(); // Update stats even if no data exists
        }
    });
}

// ==================== STRAVA INTEGRATION ====================

function initializeStravaButtons() {
    const connectBtn = document.getElementById('stravaConnectBtn');
    const disconnectBtn = document.getElementById('stravaDisconnectBtn');
    const stravaModal = document.getElementById('stravaModal');
    const stravaModalClose = document.getElementById('stravaModalClose');
    const saveTokenBtn = document.getElementById('saveStravaToken');
    
    if (connectBtn) {
        connectBtn.addEventListener('click', () => {
            if (!currentUser) {
                alert('Please enter your name first');
                return;
            }
            stravaModal.style.display = 'block';
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
    
    // Close modal when clicking outside
    window.addEventListener('click', (e) => {
        if (e.target === stravaModal) {
            stravaModal.style.display = 'none';
        }
    });
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
            document.getElementById('yogaGoal').value = goals.yoga || 0;
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
    const yogaGoal = parseInt(document.getElementById('yogaGoal').value) || 0;
    
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
    if (yogaGoal < 0 || yogaGoal > 7) {
        alert('Yoga days must be between 0 and 7');
        return;
    }
    
    const goals = {
        office: officeGoal,
        running: runningGoal,
        weights: weightsGoal,
        yoga: yogaGoal
    };
    
    const userDocRef = db.collection('users').doc(currentUser);
    userDocRef.get().then(doc => {
        const data = doc.exists ? doc.data() : {};
        data.weeklyGoals = goals;
        
        userDocRef.set(data, { merge: true })
            .then(() => {
                console.log('Weekly goals saved successfully');
                document.getElementById('settingsModal').style.display = 'none';
                alert('Goals saved successfully!');
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
            
            if (hasToken) {
                console.log('Token found, fetching activities...');
                // Fetch activities
                fetchStravaActivities(data.stravaAccessToken, data.stravaRefreshToken);
            } else {
                console.log('No token found');
            }
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
                
                // Fetch activities
                fetchStravaActivities(accessToken.trim(), refreshToken ? refreshToken.trim() : null);
                
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
        
        userDocRef.set(data, { merge: true })
            .then(() => {
                stravaActivities = {};
                checkStravaConnection();
                renderCalendar();
                if (!silent) {
                    // Only show message if user manually disconnected
                    console.log('Strava disconnected');
                }
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
    
    console.log('Fetching Strava activities...');
    
    try {
        // Calculate date range (last 3 months and next month)
        const now = new Date();
        const threeMonthsAgo = new Date(now);
        threeMonthsAgo.setMonth(now.getMonth() - 3);
        const nextMonth = new Date(now);
        nextMonth.setMonth(now.getMonth() + 1);
        
        const after = Math.floor(threeMonthsAgo.getTime() / 1000);
        const before = Math.floor(nextMonth.getTime() / 1000);
        
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
        console.log(`Fetched ${activities.length} Strava activities`);
        
        // Group activities by date
        stravaActivities = {};
        activities.forEach(activity => {
            // Parse start_date_local directly from the string to avoid timezone issues
            // start_date_local from Strava is in format "YYYY-MM-DDTHH:mm:ss" in local timezone
            // Extract date components directly from the string to avoid timezone conversion issues
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
                
                if (!stravaActivities[dateKey]) {
                    stravaActivities[dateKey] = [];
                }
                stravaActivities[dateKey].push(activity);
            } else {
                // Fallback to old method if string format is unexpected
                console.warn('Unexpected date format:', dateString);
                const activityDate = new Date(activity.start_date_local);
                const year = activityDate.getFullYear();
                const month = activityDate.getMonth();
                const day = activityDate.getDate();
                const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                
                if (!stravaActivities[dateKey]) {
                    stravaActivities[dateKey] = [];
                }
                stravaActivities[dateKey].push(activity);
            }
        });
        
        // Debug: Log activities for Nov 3rd, 4th, and 5th, 2025
        const debugDates = ['2025-11-03', '2025-11-04', '2025-11-05'];
        debugDates.forEach(dateKey => {
            if (stravaActivities[dateKey]) {
                console.log(`${dateKey} activities (${stravaActivities[dateKey].length}):`, 
                    stravaActivities[dateKey].map(a => ({
                        type: a.type,
                        name: a.name,
                        start_date_local: a.start_date_local,
                        id: a.id,
                        parsed_date: formatDateKey(new Date(a.start_date_local))
                    })));
            }
        });
        
        console.log('Activities grouped by date:', Object.keys(stravaActivities).length, 'days with activities');
        
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
        'Workout': isYoga ? '🧘' : '💪', // Use yoga icon if it's yoga-related
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
    
    return typeIcons[activityType] || (isYoga ? '🧘' : (isSnowshoe ? '🎿' : '🏃'));
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


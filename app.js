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

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
});

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

function renderCalendar() {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    
    // Update month/year display
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'];
    document.getElementById('currentMonthYear').textContent = `${monthNames[month]} ${year}`;

    // Get first day of month and number of days
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    // Adjust for Monday as first day: 0 (Sunday) becomes 6, other days shift
    const startingDayOfWeek = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;

    const calendarGrid = document.getElementById('calendarGrid');
    calendarGrid.innerHTML = '';

    // Add empty cells for days before the first day of the month
    for (let i = 0; i < startingDayOfWeek; i++) {
        const emptyDay = createDayElement(null, year, month);
        emptyDay.classList.add('other-month');
        calendarGrid.appendChild(emptyDay);
    }

    // Add days of the month
    const today = new Date();
    for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(year, month, day);
        const dayElement = createDayElement(day, year, month);
        
        // Highlight today
        if (date.toDateString() === today.toDateString()) {
            dayElement.classList.add('today');
        }

        // Load location data for this day
        loadDayLocation(year, month, day, dayElement);

        calendarGrid.appendChild(dayElement);
    }

    // Add next month's days for remaining cells in the last week
    const totalCells = startingDayOfWeek + daysInMonth;
    const remainingCells = 7 - (totalCells % 7);
    if (remainingCells < 7) {
        const nextMonth = month === 11 ? 0 : month + 1;
        const nextYear = month === 11 ? year + 1 : year;
        for (let i = 1; i <= remainingCells; i++) {
            const nextDayElement = createDayElement(i, nextYear, nextMonth);
            nextDayElement.classList.add('other-month');
            calendarGrid.appendChild(nextDayElement);
        }
    }
    
    // Add week summary badges after rendering is complete
    addWeekSummaries(year, month, startingDayOfWeek, daysInMonth);
    
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
    
    // Get all user data once
    db.collection('users').doc(currentUser).get().then(doc => {
        const allDays = document.querySelectorAll('.calendar-day');
        const data = doc.exists ? doc.data() : {};
        
        // Group days into weeks
        let currentWeek = [];
        let weekStartIndex = 0;
        
        allDays.forEach((dayElement, index) => {
            const dayNumber = dayElement.querySelector('.day-number');
            if (!dayNumber) {
                // Empty cell - don't count it
                return;
            }
            
            const day = parseInt(dayNumber.textContent);
            if (isNaN(day)) return;
            
            const date = new Date(year, month, day);
            const dayOfWeek = date.getDay();
            
            // Check if this is the last day of a week (Sunday)
            const isLastDayOfWeek = dayOfWeek === 0;
            
            // Get location for this day
            const dateKey = formatDateKey(date);
            let location = data[dateKey];
            
            // Handle weekend defaults
            if (!location) {
                const dayOfWeek = date.getDay();
                const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
                location = isWeekend ? 'home' : 'none';
            }
            
            currentWeek.push({ location, element: dayElement });
            
            // If this is Sunday (end of week), add summary badge
            if (isLastDayOfWeek || index === allDays.length - 1) {
                countAndDisplayWeekSummary(currentWeek, weekStartIndex);
                currentWeek = [];
                weekStartIndex = index + 1;
            }
        });
    });
}

function countAndDisplayWeekSummary(weekDays, startIndex) {
    // Count office days (including next month's days)
    let officeDays = 0;
    let hasValidDays = false;
    
    weekDays.forEach(({ location, element }) => {
        // Count all days in the week, even if they're from next month
        if (element.querySelector('.day-number')) {
            hasValidDays = true;
            if (location === 'office') {
                officeDays++;
            }
        }
    });
    
    // Always show badge if there are valid days in the week
    if (hasValidDays) {
        // Find the last day of the week (Sunday)
        const allDays = document.querySelectorAll('.calendar-day');
        const weekEndCell = allDays[startIndex + weekDays.length - 1];
        
        if (weekEndCell) {
            // Create badge
            const badge = document.createElement('div');
            badge.className = 'week-summary-badge';
            badge.textContent = `${officeDays} office`;
            
            // Append to the Sunday cell
            weekEndCell.appendChild(badge);
        }
    }
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
        const weeksWithData = weeks.filter(w => w.hasData);
        let avgWeeklyOffice = 0;
        if (weeksWithData.length > 0) {
            const totalOfficeDays = weeksWithData.reduce((sum, w) => sum + w.officeDays, 0);
            avgWeeklyOffice = totalOfficeDays / weeksWithData.length;
        }
        
        // Calculate BELT: Best 8 weeks from last 12 weeks
        const today = new Date();
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


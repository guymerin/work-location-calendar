# Work Location Calendar

A web-based calendar application that allows multiple users to track and update their work location (Home or Office) for each day of the month. The app syncs data in real-time across all devices using Firebase Firestore.

## Features

- 📅 Monthly calendar view with navigation
- 🏠/🏢 Mark work location (Home or Office) for each day
- 👥 Multi-user support - each user has their own calendar
- 📱 Responsive design - works on desktop, tablet, and mobile
- 🔄 Real-time synchronization across devices
- 💾 Data persists in cloud database

## Setup Instructions

### 1. Firebase Setup

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project (or use an existing one)
3. Enable **Firestore Database**:
   - Click on "Firestore Database" in the left menu
   - Click "Create database"
   - Start in **Test mode** (for development)
   - Choose a location for your database
4. Get your Firebase configuration:
   - Click the gear icon ⚙️ next to "Project Overview"
   - Select "Project settings"
   - Scroll down to "Your apps" section
   - Click the web icon `</>` to add a web app
   - Copy the `firebaseConfig` object

### 2. Configure the App

1. **Copy the example configuration file:**
   
   **Option A - Using the setup script (Windows):**
   ```powershell
   .\setup.ps1
   ```
   
   **Option B - Manual copy:**
   ```bash
   # On Windows PowerShell:
   Copy-Item config.example.js config.js
   
   # On Mac/Linux:
   cp config.example.js config.js
   ```

2. **Open `config.js`** and replace the placeholder values with your Firebase credentials:

```javascript
window.firebaseConfig = {
    apiKey: "AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
    authDomain: "my-calendar-app.firebaseapp.com",
    projectId: "my-calendar-app",
    storageBucket: "my-calendar-app.appspot.com",
    messagingSenderId: "123456789012",
    appId: "1:123456789012:web:abcdef1234567890"
};
```

**⚠️ Important:** Make sure `config.js` is properly configured. The app will show a setup screen if Firebase is not configured correctly.

### 3. Firestore Security Rules (Important!)

For production use, you should set up proper security rules. In Firebase Console:

1. Go to Firestore Database → Rules
2. Update the rules to allow read/write access (for development/test):

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      // Allow users to read/write their own data
      allow read, write: if true; // For testing - restrict this in production!
    }
  }
}
```

**⚠️ Security Note:** The rule above allows anyone to read/write data. For production, implement proper authentication (e.g., Firebase Authentication) and restrict access accordingly.

### 4. Testing the Setup

1. **Check the app loads:** Open `index.html` in a web browser
2. **If you see an error message:** Make sure `config.js` is configured correctly
3. **If it loads successfully:** Enter your name and start marking your work location!

**💡 Tip:** If you need to verify your setup, open the browser's developer console (F12) to check for any Firebase connection errors.

## Deployment Options

**⚠️ Before deploying:** Make sure you've configured `config.js` with your Firebase credentials. Since `config.js` is in `.gitignore`, you won't need to worry about exposing secrets when pushing to Git, but you'll need to configure it separately on your hosting platform.

### Option 1: GitHub Pages (Recommended for Free Hosting)

1. Create a new GitHub repository
2. Push your files to the repository (remember, `config.js` is ignored!)
3. Go to repository Settings → Pages
4. Select your branch (usually `main` or `master`)
5. Your site will be available at `https://YOUR_USERNAME.github.io/YOUR_REPO_NAME/`

**Note:** For GitHub Pages, you'll need to either:
- Add `config.js` manually to the deployed files, or
- Use repository secrets and set up a build process to inject the config

### Option 2: Netlify (Free Hosting)

1. Go to [Netlify](https://www.netlify.com/)
2. Sign up/login
3. Drag and drop your project folder, or connect your GitHub repository
4. Your site will be deployed automatically!

### Option 3: Vercel (Free Hosting)

1. Go to [Vercel](https://vercel.com/)
2. Sign up/login
3. Import your project from GitHub or upload files
4. Deploy!

## Usage

1. **Set Your Name**: Enter your name in the input field at the top
2. **Navigate Months**: Use "Previous" and "Next" buttons to move between months
3. **Mark Location**: Click on any day to open the location selector
4. **Choose Location**: Select Home 🏠, Office 🏢, or Clear ❌
5. **View Calendar**: Your locations are saved and synced across all devices

## Data Structure

The app stores data in Firestore with the following structure:
- Collection: `users`
- Document ID: User's name (the name they enter)
- Fields: Date keys (YYYY-MM-DD format) with values "home" or "office"

Example:
```
users/
  └── John Doe/
      ├── 2025-11-01: "home"
      ├── 2025-11-02: "office"
      └── 2025-11-03: "home"
```

## Browser Compatibility

- Chrome/Edge (recommended)
- Firefox
- Safari
- Mobile browsers (iOS Safari, Chrome Mobile)

## Future Enhancements (Optional)

- Add user authentication for better security
- Add ability to view other users' calendars
- Export calendar data
- Add notes/comments for each day
- Weekly view option
- Recurring location patterns

## Support

If you encounter any issues:
1. Make sure Firebase configuration is correct
2. Check browser console for errors (F12)
3. Verify Firestore database is enabled and rules allow access
4. Ensure you have an internet connection (for Firebase sync)

## License

Free to use and modify for personal or commercial projects.


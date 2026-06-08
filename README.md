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

### 3. Authentication (Google Sign-In)

The app authenticates with **Google Sign-In** via Firebase Authentication. Each
user's data is stored under their Firebase `uid`, and the security rules in
[`firestore.rules`](./firestore.rules) restrict every document to its owner:

```
match /users/{userId} {
  allow read, write: if request.auth != null && request.auth.uid == userId;
}
```

**Enable it in the Firebase Console (only you can do this):**

1. **Authentication → Sign-in method → Add provider → Google → Enable**, then
   save. Set a support email if prompted.
2. **Authentication → Settings → Authorized domains** → add the domain you serve
   from (e.g. `<your-username>.github.io`). `localhost` is authorized by default
   for local testing.

### 4. Migration + cutover sequence (do this in order)

Older data was keyed by a typed name; the app now keys it by Google `uid`, so
existing history must be copied once. **The in-app importer reads your old
name-keyed document, which the strict owner-only rules forbid — so migrate while
Firestore is still in open/test mode, then lock the rules.**

1. Deploy this version of the app (rules still open / test mode for now).
2. Enable Google sign-in + authorized domains (step 3 above).
3. Open the app, click **Sign in with Google**. On first sign-in it offers to
   **Import your existing data** — enter your old name (e.g. `Guy`) and import.
   Confirm your calendar, activities, and goals appear.
4. **Now** publish the strict rules: Firebase Console → Firestore Database →
   Rules → paste the contents of `firestore.rules` → Publish.
5. Verify the app still reads/writes after the rules go live.

**⚠️ Do not leave `allow read, write: if true` in production.** Your Firebase web
config is public (bundled into the deployed site), so open rules let anyone read
or wipe every user's data. Open mode is only acceptable for the brief migration
window in step 1–3.

### 5. Testing the Setup

1. **Check the app loads:** Open `index.html` in a web browser
2. **If you see an error message:** Make sure `config.js` is configured correctly
3. **If it loads successfully:** click **Sign in with Google** and start marking
   your work location.

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

1. **Sign In**: Click **Sign in with Google** at the top
2. **Navigate Months**: Use "Previous" and "Next" buttons to move between months
3. **Mark Location**: Click on any day to open the location selector
4. **Choose Location**: Select Home 🏠, Office 🏢, or Clear ❌
5. **View Calendar**: Your locations are saved and synced across all devices

## Data Structure

The app stores data in Firestore with the following structure:
- Collection: `users`
- Document ID: The signed-in user's Firebase Authentication `uid`
- Fields: Date keys (YYYY-MM-DD format) with values "home", "office", or "nonworkday"

Example:
```
users/
  └── a1B2c3D4e5...(uid)/
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


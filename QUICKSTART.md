# Quick Start Guide

Get your Work Location Calendar up and running in 5 minutes!

## Prerequisites

- A Firebase account (free tier works great!)
- A modern web browser

## Setup Steps

### 1️⃣ Create Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click "Add project"
3. Enter a project name and follow the wizard
4. Enable **Firestore Database** (Test mode is fine for development)

### 2️⃣ Get Your Firebase Config

1. In Firebase Console, click the gear icon ⚙️ → "Project settings"
2. Scroll down to "Your apps" section
3. Click the web icon `</>`
4. Register your app (give it any name)
5. Copy the `firebaseConfig` object

### 3️⃣ Configure This App

**Windows users:**
```powershell
.\setup.ps1
```

**Mac/Linux users:**
```bash
cp config.example.js config.js
```

Then open `config.js` and paste your Firebase config:
```javascript
window.firebaseConfig = {
    apiKey: "paste your apiKey here",
    authDomain: "paste your authDomain here",
    projectId: "paste your projectId here",
    storageBucket: "paste your storageBucket here",
    messagingSenderId: "paste your messagingSenderId here",
    appId: "paste your appId here"
};
```

### 4️⃣ Test It!

1. Open `index.html` in your browser
2. Enter your name
3. Click on any day to mark it as Home 🏠 or Office 🏢

## Troubleshooting

**"Setup Required" message appears:**
- Make sure `config.js` exists and has your Firebase credentials
- Check that all values in the config object are filled in
- Open browser console (F12) to see detailed errors

**Can't save locations:**
- Make sure Firestore Database is enabled in Firebase Console
- Check Firestore security rules allow read/write access
- Verify your internet connection

## Next Steps

- Read `README.md` for more detailed information
- Set up proper Firestore security rules for production
- Deploy to GitHub Pages, Netlify, or Vercel

## Need Help?

- Check the browser console (F12) for errors
- Verify Firebase config is correct
- Make sure Firestore is enabled and accessible
- See full documentation in `README.md`

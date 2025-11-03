# Firebase Setup Checklist

Follow these steps to ensure your Firebase is properly configured:

## ✅ Step 1: Enable Firestore Database

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project (`rto-db`)
3. Click "Firestore Database" in the left sidebar
4. Click "Create database"
5. Select "Start in test mode"
6. Choose a location (select the one closest to you)
7. Click "Enable"

## ✅ Step 2: Set Firestore Security Rules

1. In Firestore Database, click the "Rules" tab
2. Replace the default rules with:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read, write: if true;
    }
  }
}
```

3. Click "Publish"

## ✅ Step 3: Verify Config

Your `config.js` should have your actual Firebase credentials (not placeholders).

## ✅ Step 4: Test the App

1. Open `index.html` in your browser
2. Enter your name in the input field
3. Click "Set Name"
4. Click on any day in the calendar
5. Select "Home" or "Office"
6. The modal should close and the emoji should appear on that day

## 🐛 Troubleshooting

**If clicking on days doesn't open the modal:**
- Check browser console (F12) for errors
- Make sure your name is set

**If the emoji doesn't appear after selecting:**
- Firestore might not be enabled - go back to Step 1
- Security rules might be blocking - go back to Step 2
- Check browser console for permission errors

**If you see "Setup Required" error:**
- Make sure `config.js` exists and has your Firebase config
- Refresh the page after updating config.js

## 📝 Common Errors

- **"Missing or insufficient permissions"** → Check Firestore security rules
- **"Firestore is not enabled"** → Enable Firestore Database
- **"network timeout"** → Check internet connection
- **"permission-denied"** → Security rules need to allow read/write

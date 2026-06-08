# Firebase Setup Checklist

Follow these steps to ensure your Firebase is properly configured.

## ✅ Step 1: Enable Firestore Database

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project (`rto-db`)
3. Click "Firestore Database" in the left sidebar
4. Click "Create database"
5. Select "Start in test mode" (temporary — locked down in Step 4)
6. Choose a location (select the one closest to you)
7. Click "Enable"

## ✅ Step 2: Enable Google Sign-In

1. In the left sidebar, click **Authentication → Get started**
2. **Sign-in method → Add new provider → Google → Enable**, set a support email, Save
3. **Authentication → Settings → Authorized domains** → add your site's domain
   (e.g. `<your-username>.github.io`). `localhost` is allowed by default.

## ✅ Step 3: Sign in and migrate your data (while still in test mode)

The app stores data under your Google `uid`. If you used the old name-based
version, import that history **before** locking the rules (the strict rules block
reading the old name-keyed document):

1. Open the app and click **Sign in with Google**
2. On first sign-in, the **Import your existing data** dialog appears — enter your
   old name (e.g. `Guy`) and click **Import data**
3. Confirm your calendar, activities, and goals show up

## ✅ Step 4: Lock down Firestore Security Rules

Once migration is verified, replace the test-mode rules with the owner-only rules.
In Firestore Database → **Rules**, paste the contents of
[`firestore.rules`](./firestore.rules) and click **Publish**:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
      match /{sub=**} {
        allow read, write: if request.auth != null && request.auth.uid == userId;
      }
    }
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

> ⚠️ **Never leave `allow read, write: if true` in production.** The Firebase web
> config is public, so open rules let anyone read or wipe everyone's data. Test
> mode is only acceptable for the brief migration window in Step 3.

## ✅ Step 5: Test the App

1. Open `index.html` in your browser
2. Click **Sign in with Google**
3. Click on any day in the calendar
4. Select "Home" or "Office"
5. The modal should close and the emoji should appear on that day
6. Refresh — your data should persist (and still work after Step 4's rules)

## 🐛 Troubleshooting

**If sign-in fails or the popup is blocked:**
- Make sure Google is enabled in Authentication → Sign-in method
- Make sure your domain is in Authentication → Settings → Authorized domains
- Allow popups for the site

**If clicking on days doesn't open the modal:**
- Check browser console (F12) for errors
- Make sure you're signed in

**If you see "Setup Required" error:**
- Make sure `config.js` exists and has your Firebase config
- Refresh the page after updating config.js

## 📝 Common Errors

- **"Missing or insufficient permissions"** → After Step 4, make sure you're signed
  in and using your own `uid` document (the app does this automatically). If you
  hit this during migration, you locked the rules too early — re-open test mode,
  migrate, then re-lock.
- **"auth/unauthorized-domain"** → Add your domain in Authentication → Settings
- **"Firestore is not enabled"** → Enable Firestore Database (Step 1)
- **"network timeout"** → Check internet connection

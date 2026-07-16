// Firebase Configuration Example
// Copy this file to config.js and fill in your actual Firebase credentials

window.firebaseConfig = {
    apiKey: "AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
    authDomain: "my-calendar-app.firebaseapp.com",
    projectId: "my-calendar-app",
    storageBucket: "my-calendar-app.appspot.com",
    messagingSenderId: "123456789012",
    appId: "1:123456789012:web:abcdef1234567890"
};

// Strava OAuth (shared app). clientId is public; the client secret lives in
// the Cloudflare Worker at tokenEndpoint — see strava-worker/README.md.
window.stravaConfig = {
    clientId: "",      // e.g. "123456" from https://www.strava.com/settings/api
    tokenEndpoint: ""  // e.g. "https://strava-token.<subdomain>.workers.dev"
};

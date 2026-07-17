// Firebase Configuration
// REPLACE THESE VALUES WITH YOUR OWN FIREBASE CONFIGURATION
// Get your config from: https://console.firebase.google.com/


window.firebaseConfig = {
    apiKey: "AIzaSyCrD-e5rZczj98WfTn1H3mRS7klSWZz9j0",
    authDomain: "rto-db.firebaseapp.com",
    projectId: "rto-db",
    storageBucket: "rto-db.appspot.com",
    messagingSenderId: "361275779673",
    appId: "1:361275779673:web:d65a7126821f57e54a1f48"
};

// Strava OAuth (shared app). clientId is public; the client secret lives in
// the Cloudflare Worker at tokenEndpoint — see strava-worker/README.md.
// Until both values are filled in, the Connect Strava button explains that
// Strava isn't configured for this deployment.
window.stravaConfig = {
    clientId: "184154",
    tokenEndpoint: "https://strava-token.guy-merin.workers.dev"
};

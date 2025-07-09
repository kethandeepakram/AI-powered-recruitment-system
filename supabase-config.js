// firebase-config.js
const { initializeApp } = require('firebase/app');
const { getStorage } = require('firebase/storage');

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAuHq794oykXaNPLSqhji-S5e9wOG671WE",
  authDomain: "hrxsuite.firebaseapp.com",
  projectId: "hrxsuite",
  storageBucket: "hrxsuite.appspot.com", // Note: changed from firebasestorage.app to appspot.com
  messagingSenderId: "989529616779",
  appId: "1:989529616779:web:9f7c745590963d7510bf8e"
  // We don't need analytics for the Electron app
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const storage = getStorage(app);

module.exports = { storage };
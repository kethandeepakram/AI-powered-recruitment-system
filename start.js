// start.js - Simple script for the start page
document.addEventListener('DOMContentLoaded', function() {
  console.log("Start page loaded");
  
  const startBtn = document.getElementById('startBtn');
  if (startBtn) {
    startBtn.addEventListener('click', function() {
      console.log("Start button clicked");
      window.location.href = "index.html";
    });
  } else {
    console.error("Start button not found!");
  }
});
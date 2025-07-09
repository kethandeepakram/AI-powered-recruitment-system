// minimal-lobby.js - replace your existing lobby.js with this file
const fs = require('fs');
const path = require('path');

// Initialize variables
const candidateName = localStorage.getItem('candidateName') || 'TestCandidate';
let countdownValue = 10;
let countdownInterval;

// DOM ready handler
document.addEventListener('DOMContentLoaded', function() {
  const countdown = document.getElementById('countdown');
  const statusMessage = document.getElementById('statusMessage');
  
  // Prepare environment
  try {
    prepareEnvironment();
    
    if (statusMessage) {
      statusMessage.textContent = "Environment ready. Starting in a moment...";
    }
    
    // Start countdown immediately
    startCountdown();
  } catch (error) {
    console.error("Setup error:", error);
    
    if (statusMessage) {
      statusMessage.textContent = "Error preparing environment. Starting anyway...";
    }
    
    // Start countdown with delay
    setTimeout(startCountdown, 1000);
  }
});

// Create basic environment
function prepareEnvironment() {
  // Create database directory
  try {
    const dirs = [
      path.join(process.cwd(), 'database'),
      path.join(process.cwd(), 'database', 'candidates'),
      path.join(process.cwd(), 'database', 'candidates', candidateName)
    ];
    
    dirs.forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
    
    // Create REPORT.txt if it doesn't exist
    const reportPath = path.join(process.cwd(), 'database', 'candidates', candidateName, 'REPORT.txt');
    if (!fs.existsSync(reportPath)) {
      fs.writeFileSync(reportPath, `INTERVIEW REPORT FOR: ${candidateName}\nGenerated: ${new Date().toISOString()}\n\n`);
    }
  } catch (error) {
    console.error("Error creating directories:", error);
  }
}

// Start countdown
function startCountdown() {
  const countdown = document.getElementById('countdown');
  const statusMessage = document.getElementById('statusMessage');
  
  if (!countdown) return;
  
  countdown.textContent = countdownValue;
  
  countdownInterval = setInterval(() => {
    countdownValue--;
    
    if (countdown) {
      countdown.textContent = countdownValue;
    }
    
    if (countdownValue <= 0) {
      clearInterval(countdownInterval);
      
      if (statusMessage) {
        statusMessage.textContent = 'Starting interview...';
      }
      
      // Redirect to aptitude.html
      setTimeout(() => {
        window.location.href = 'aptitude.html';
      }, 500);
    }
  }, 1000);
}
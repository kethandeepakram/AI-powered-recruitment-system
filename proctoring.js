// proctoring.js - Eye tracking proctoring system
const { ipcRenderer } = require('electron');
const path = require('path');
const fs = require('fs');

class ProctoringSystem {
  constructor(options = {}) {
    this.options = {
      candidateName: localStorage.getItem('candidateName') || 'Unknown',
      candidateId: localStorage.getItem('candidateId') || 'unknown',
      captureInterval: 2000, // ms between captures
      warningTimeout: 5000, // ms to show warnings
      logCheating: true,
      showVideo: true,
      ...options
    };
    
    this.video = null;
    this.canvas = null;
    this.captureContext = null;
    this.stream = null;
    this.captureTimer = null;
    this.warningTimer = null;
    this.isCheating = false;
    this.cheatingCounter = 0;
    this.lastWarningTime = 0;
    this.isRunning = false;
    this.videoOverlay = null;
    this.warningOverlay = null;
    this.eyePositions = { left: null, right: null };
  }

  async init(videoContainer) {
    try {
      // Create proctoring container
      const container = document.createElement('div');
      container.className = 'proctoring-container';
      container.style.position = 'relative';
      container.style.width = '100%';
      container.style.height = '100%';
      container.style.overflow = 'hidden';
      
      // Create video element
      this.video = document.createElement('video');
      this.video.autoplay = true;
      this.video.muted = true;
      this.video.playsInline = true;
      this.video.style.width = '100%';
      this.video.style.height = '100%';
      this.video.style.objectFit = 'cover';
      this.video.style.transform = 'scaleX(-1)'; // Mirror for selfie view
      
      // Create eye position indicators
      this.eyeOverlay = document.createElement('div');
      this.eyeOverlay.className = 'eye-overlay';
      this.eyeOverlay.style.position = 'absolute';
      this.eyeOverlay.style.top = '0';
      this.eyeOverlay.style.left = '0';
      this.eyeOverlay.style.width = '100%';
      this.eyeOverlay.style.height = '100%';
      this.eyeOverlay.style.pointerEvents = 'none';
      
      // Create warning overlay
      this.warningOverlay = document.createElement('div');
      this.warningOverlay.className = 'warning-overlay';
      this.warningOverlay.style.position = 'absolute';
      this.warningOverlay.style.top = '0';
      this.warningOverlay.style.left = '0';
      this.warningOverlay.style.width = '100%';
      this.warningOverlay.style.height = '100%';
      this.warningOverlay.style.backgroundColor = 'rgba(255, 0, 0, 0.3)';
      this.warningOverlay.style.display = 'flex';
      this.warningOverlay.style.justifyContent = 'center';
      this.warningOverlay.style.alignItems = 'center';
      this.warningOverlay.style.opacity = '0';
      this.warningOverlay.style.transition = 'opacity 0.3s';
      this.warningOverlay.style.pointerEvents = 'none';
      this.warningOverlay.style.zIndex = '10';
      
      const warningText = document.createElement('div');
      warningText.className = 'warning-text';
      warningText.style.color = 'white';
      warningText.style.fontSize = '24px';
      warningText.style.fontWeight = 'bold';
      warningText.style.textShadow = '0 0 4px black';
      warningText.style.padding = '20px';
      warningText.style.borderRadius = '10px';
      warningText.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
      warningText.textContent = 'EYES ON SCREEN';
      
      this.warningOverlay.appendChild(warningText);
      
      // Create canvas for capturing frames
      this.canvas = document.createElement('canvas');
      this.canvas.width = 640;
      this.canvas.height = 480;
      this.canvas.style.display = 'none';
      this.captureContext = this.canvas.getContext('2d');
      
      // Append elements to container
      container.appendChild(this.video);
      container.appendChild(this.eyeOverlay);
      container.appendChild(this.warningOverlay);
      container.appendChild(this.canvas);
      
      if (videoContainer) {
        videoContainer.innerHTML = '';
        videoContainer.appendChild(container);
      }
      
      // Get camera access
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: 'user' },
        audio: false
      });
      
      this.video.srcObject = this.stream;
      this.isRunning = true;
      
      // Create proctoring directory if needed
      try {
        const proctoringDir = path.join(process.cwd(), 'database', 'proctoring');
        if (!fs.existsSync(proctoringDir)) {
          fs.mkdirSync(proctoringDir, { recursive: true });
        }
        
        const candidateDir = path.join(proctoringDir, this.options.candidateName);
        if (!fs.existsSync(candidateDir)) {
          fs.mkdirSync(candidateDir, { recursive: true });
        }
      } catch (err) {
        console.error('Error creating proctoring directories:', err);
      }
      
      return true;
    } catch (error) {
      console.error('Proctoring initialization error:', error);
      return false;
    }
  }
  
  start() {
    if (!this.isRunning) return false;
    
    // Start periodic frame capture
    this.captureTimer = setInterval(() => {
      this.captureAndAnalyze();
    }, this.options.captureInterval);
    
    return true;
  }
  
  stop() {
    if (this.captureTimer) {
      clearInterval(this.captureTimer);
      this.captureTimer = null;
    }
    
    if (this.warningTimer) {
      clearTimeout(this.warningTimer);
      this.warningTimer = null;
    }
    
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    
    this.isRunning = false;
    return true;
  }
  
  captureAndAnalyze() {
    if (!this.isRunning || !this.video || !this.captureContext) return;
    
    try {
      // Draw video frame to canvas
      this.captureContext.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);
      
      // Convert canvas to data URL
      const dataURL = this.canvas.toDataURL('image/jpeg', 0.7);
      
      // Send to eye tracking API
      // For the demo, we'll simulate the API response
      this.analyzeFrame(dataURL);
    } catch (error) {
      console.error('Frame capture error:', error);
    }
  }
  
  async analyzeFrame(dataURL) {
    try {
      // Simulate API call to eye_tracker.py
      // In production, this would be an actual API call
      
      // For demo purposes, randomly simulate cheating (10% chance)
      const randomResult = Math.random();
      let simulatedResponse;
      
      if (randomResult < 0.1) {
        // Simulate detected cheating
        simulatedResponse = {
          cheating: true,
          message: randomResult < 0.05 ? 
            "LOOK AT THE SCREEN. KEEP YOUR EYES ON THE SCREEN." : 
            "EYES DETECTED AS CLOSED. PLEASE OPEN YOUR EYES.",
          left_eye: {x: 0.3, y: 0.4},
          right_eye: {x: 0.4, y: 0.4},
          reason: randomResult < 0.05 ? "looking_away" : "eyes_closed"
        };
      } else {
        // Simulate normal behavior
        simulatedResponse = {
          cheating: false,
          message: "Eyes on screen.",
          left_eye: {x: 0.3, y: 0.3},
          right_eye: {x: 0.4, y: 0.3},
          reason: null
        };
      }
      
      // Handle the response
      this.handleEyeTrackingResult(simulatedResponse);
      
      // In production, this would be the actual API call:
      /*
      const response = await fetch('http://localhost:8000/eye_tracker', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          image: dataURL,
          candidate: this.options.candidateId
        })
      });
      
      if (!response.ok) {
        throw new Error(`Eye tracking API error: ${response.statusText}`);
      }
      
      const result = await response.json();
      this.handleEyeTrackingResult(result);
      */
    } catch (error) {
      console.error('Eye tracking analysis error:', error);
    }
  }
  
  handleEyeTrackingResult(result) {
    if (!this.isRunning) return;
    
    // Update eye positions
    if (result.left_eye) this.eyePositions.left = result.left_eye;
    if (result.right_eye) this.eyePositions.right = result.right_eye;
    
    // Update eye position indicators
    this.updateEyeIndicators();
    
    // Handle cheating detection
    if (result.cheating) {
      this.cheatingCounter++;
      
      // Show warning if not already showing
      if (!this.isCheating) {
        this.isCheating = true;
        this.showWarning(result.message);
        
        // Log cheating incident
        if (this.options.logCheating) {
          this.logCheatingIncident(result.reason, result.message);
        }
      }
    } else {
      this.cheatingCounter = 0;
      
      // Hide warning if showing
      if (this.isCheating) {
        this.isCheating = false;
        this.hideWarning();
      }
    }
  }
  
  updateEyeIndicators() {
    if (!this.eyeOverlay) return;
    
    // Clear existing indicators
    this.eyeOverlay.innerHTML = '';
    
    // Create indicators for both eyes
    [this.eyePositions.left, this.eyePositions.right].forEach(eye => {
      if (!eye) return;
      
      const indicator = document.createElement('div');
      indicator.style.position = 'absolute';
      indicator.style.width = '10px';
      indicator.style.height = '10px';
      indicator.style.borderRadius = '50%';
      indicator.style.backgroundColor = this.isCheating ? 'red' : 'green';
      indicator.style.left = `${eye.x * 100}%`;
      indicator.style.top = `${eye.y * 100}%`;
      indicator.style.transform = 'translate(-50%, -50%)';
      indicator.style.transition = 'all 0.3s ease';
      
      this.eyeOverlay.appendChild(indicator);
    });
  }
  
  showWarning(message) {
    if (!this.warningOverlay) return;
    
    // Update warning message
    const warningText = this.warningOverlay.querySelector('.warning-text');
    if (warningText) {
      warningText.textContent = message;
    }
    
    // Show warning overlay
    this.warningOverlay.style.opacity = '1';
    
    // Speak warning if enough time has passed since last warning
    const now = Date.now();
    if (now - this.lastWarningTime > 5000) {
      this.speakWarning(message);
      this.lastWarningTime = now;
    }
    
    // Hide warning after timeout
    if (this.warningTimer) {
      clearTimeout(this.warningTimer);
    }
    
    this.warningTimer = setTimeout(() => {
      if (this.warningOverlay) {
        this.warningOverlay.style.opacity = '0';
      }
    }, this.options.warningTimeout);
  }
  
  hideWarning() {
    if (!this.warningOverlay) return;
    this.warningOverlay.style.opacity = '0';
    
    if (this.warningTimer) {
      clearTimeout(this.warningTimer);
      this.warningTimer = null;
    }
  }
  
  speakWarning(message) {
    try {
      // Send TTS request to main process
      ipcRenderer.send('speak-warning', message);
    } catch (error) {
      console.error('TTS error:', error);
    }
  }
  
  logCheatingIncident(reason, message) {
    try {
      const timestamp = new Date().toISOString();
      const logEntry = `${timestamp} - ${reason}: ${message}\n`;
      
      const logDir = path.join(process.cwd(), 'database', 'proctoring', this.options.candidateName);
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }
      
      const logPath = path.join(logDir, 'cheating_log.txt');
      fs.appendFileSync(logPath, logEntry);
    } catch (error) {
      console.error('Error logging cheating incident:', error);
    }
  }
}

module.exports = ProctoringSystem;
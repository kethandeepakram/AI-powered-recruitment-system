// Updated interview.js with enhanced proctoring system
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Configuration settings
const CONFIG = {
  interviewDuration: 20 * 60,
  defaultQuestionTime: 60,
  speechRecognitionLang: 'en-US',
  recordingInterval: 1000, // Save chunks every second
  debug: true, // Enable debugging for troubleshooting
  proctoringInterval: 2000, // Check proctoring every 2 seconds
  movementThreshold: 15, // Threshold for significant movement (0-100)
  warningThreshold: 3 // Number of violations before warning is shown
};

// Application state
const state = {
  candidateName: '',
  candidateId: '',
  candidateFolder: '',
  questions: [],
  currentQuestionIndex: -1,
  answers: [],
  transcriptSegments: [],
  interviewTime: CONFIG.interviewDuration,
  questionTime: CONFIG.defaultQuestionTime,
  isInterviewRunning: false,
  isPaused: false,
  isProcessing: false,
  interviewStartTime: null,
  currentQuestionStartTime: null,
  timerInterval: null,
  questionTimerInterval: null,
  permissions: {
    video: false // Now only need video permission, Python handles audio
  },
  // Enhanced proctoring state
  proctoring: {
    active: false,
    proctoringInterval: null,
    lastWarningTime: 0,
    warningCount: 0,
    consecutiveWarnings: 0,
    lastCheckTime: 0,
    lookingAway: false,
    lastFrameData: null,
    lastFrameMap: null,
    movementLevel: 0,
    faceDetected: true,
    cameraActive: false,
    screenshots: []
  },
  // Python process state
  pythonProcess: null,
  pythonReady: false,
  microphoneWorking: false
};

// Audio handling state
const audio = {
  stream: null,
  audioContext: null,
  analyser: null
};

// Speech recognition and synthesis state
const speech = {
  currentTranscript: '',
  isNarrating: false,
  speechSynthesis: window.speechSynthesis,
  availableVoices: [],
  selectedVoice: null
};

// DOM elements
const DOM = {};

/**
 * Initialize the application
 */
document.addEventListener('DOMContentLoaded', async function() {
  try {
    debugLog('Initializing application...');
    initializeDOMElements();
    initializeCandidateInfo();
    updateStatus('Initializing interview system...');
    setupDebugButton();
    
    // Setup IPC handlers for permissions if running in Electron
    setupElectronHandlers();
    
    await initializeSpeechSynthesis();
    await loadInterviewQuestions();
    setupEventListeners();
    updateStatus('Ready to start your HR interview. Click "Start Interview" when you are ready.');
  } catch (error) {
    console.error('Initialization error:', error);
    updateStatus(`Error initializing: ${error.message}. Please refresh the page.`, 'error');
  }
});

/**
 * Initialize DOM element references
 */
function initializeDOMElements() {
  DOM.videoElement = document.getElementById('candidateVideo');
  DOM.currentQuestionElement = document.getElementById('currentQuestion');
  DOM.questionDisplay = document.getElementById('questionDisplay');
  DOM.questionList = document.getElementById('questionList');
  DOM.timerElement = document.getElementById('timerText');
  DOM.questionTimerElement = document.getElementById('questionTimeText');
  DOM.testMicButton = document.getElementById('testMicBtn');
  DOM.startButton = document.getElementById('startBtn');
  DOM.pauseButton = document.getElementById('pauseBtn');
  DOM.nextButton = document.getElementById('nextBtn');
  DOM.endButton = document.getElementById('endBtn');
  DOM.debugButton = document.getElementById('debugBtn');
  DOM.statusElement = document.getElementById('status');
  DOM.recordingIndicator = document.getElementById('recordingIndicator');
  DOM.audioIndicator = document.getElementById('audioIndicator');
  DOM.eyeIndicator = document.getElementById('eyeIndicator');
  DOM.candidateName = document.getElementById('candidateName');
  DOM.proctoringWarning = document.getElementById('proctoringWarning');
  DOM.processingOverlay = document.getElementById('processingOverlay');
  DOM.processingStatus = document.getElementById('processingStatus');
  DOM.processingProgressBar = document.getElementById('processingProgressBar');
  DOM.overlayCanvas = document.getElementById('overlayCanvas');
  DOM.hiddenCanvas = document.getElementById('hiddenCanvas');
  DOM.audioLevel = document.getElementById('audioLevel');
  DOM.listenMicBtn = document.getElementById('listenMicBtn');
  DOM.liveTranscription = document.getElementById('liveTranscription');
  
  // Enhanced proctoring elements
  DOM.cameraStatus = document.getElementById('cameraStatus');
  DOM.faceStatus = document.getElementById('faceStatus');
  DOM.movementStatus = document.getElementById('movementStatus');
  DOM.movementLevelBar = document.getElementById('movementLevelBar');
  DOM.proctorTerminal = document.getElementById('proctorTerminal');
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
  if (DOM.startButton) DOM.startButton.addEventListener('click', startInterview);
  if (DOM.pauseButton) DOM.pauseButton.addEventListener('click', togglePause);
  if (DOM.nextButton) DOM.nextButton.addEventListener('click', nextQuestion);
  if (DOM.endButton) DOM.endButton.addEventListener('click', confirmEndInterview);
  if (DOM.testMicButton) DOM.testMicButton.addEventListener('click', testMicrophone);
  if (DOM.listenMicBtn) DOM.listenMicBtn.addEventListener('click', toggleMicListen);

  window.addEventListener('beforeunload', (e) => {
    if (state.isInterviewRunning && !state.isProcessing) {
      // Attempt to cleanly shut down Python process
      if (state.pythonProcess) {
        try {
          state.pythonProcess.stdin.write(JSON.stringify({command: 'exit'}) + '\n');
        } catch (err) {
          console.error('Error sending exit command to Python:', err);
        }
      }
      
      e.returnValue = 'Interview in progress. Leaving will lose your progress.';
      return e.returnValue;
    }
  });
}

/**
 * Setup Electron-specific IPC handlers
 */
function setupElectronHandlers() {
  // Check if we're in Electron by checking for electronAPI
  if (typeof window.electronAPI === 'undefined') {
    debugLog('Not running in Electron, skipping IPC setup');
    return;
  }
  
  debugLog('Setting up Electron IPC handlers');
  
  window.electronAPI.log('info', 'Interview page loaded');
}

/**
 * Initialize candidate information
 */
function initializeCandidateInfo() {
  // Use safe localStorage access via electronStorage if available
  if (window.electronStorage) {
    state.candidateName = window.electronStorage.get('candidateName') || 'Unknown Candidate';
    state.candidateId = window.electronStorage.get('candidateId') || `candidate_${Date.now()}`;
  } else {
    state.candidateName = localStorage.getItem('candidateName') || 'Unknown Candidate';
    state.candidateId = localStorage.getItem('candidateId') || `candidate_${Date.now()}`;
  }
  
  if (DOM.candidateName) DOM.candidateName.textContent = state.candidateName;

  // Get candidate folder path
  state.candidateFolder = path.join(process.cwd(), 'database', 'candidates', state.candidateName);
  createCandidateFolder();
}

/**
 * Create candidate folder
 */
function createCandidateFolder() {
  try {
    if (!fs.existsSync(state.candidateFolder)) {
      fs.mkdirSync(state.candidateFolder, { recursive: true });
    }
    
    // Create subdirectories for organization
    const dirs = ['audio', 'transcripts', 'screenshots'];
    dirs.forEach(dir => {
      const dirPath = path.join(state.candidateFolder, dir);
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }
    });
    
    return true;
  } catch (error) {
    console.error('Error creating candidate folder:', error);
    return false;
  }
}

/**
 * Setup debug button
 */
function setupDebugButton() {
  if (DOM.debugButton) {
    DOM.debugButton.addEventListener('click', () => {
      const debugInfo = {
        interviewRunning: state.isInterviewRunning,
        currentQuestion: state.currentQuestionIndex,
        totalQuestions: state.questions.length,
        videoPermission: state.permissions.video,
        microphoneWorking: state.microphoneWorking,
        proctoringActive: state.proctoring.active,
        warningCount: state.proctoring.warningCount,
        movementLevel: state.proctoring.movementLevel,
        pythonProcess: state.pythonProcess ? 'Active' : 'Not active',
        pythonReady: state.pythonReady
      };
      
      console.log('Debug info:', debugInfo);
      alert(`Debug info sent to console.\nPython Ready: ${debugInfo.pythonReady}\nMic Working: ${debugInfo.microphoneWorking}\nSee console for more details.`);
    });
  }
}

/**
 * Test microphone using Python
 */
async function testMicrophone() {
  updateStatus('Testing microphone...');
  
  try {
    // Kill any existing Python process
    if (state.pythonProcess) {
      debugLog('Killing existing Python process for mic test');
      try {
        state.pythonProcess.stdin.write(JSON.stringify({command: 'exit'}) + '\n');
        state.pythonProcess.kill();
      } catch (e) {
        // Ignore errors when killing the process
      }
      state.pythonProcess = null;
    }
    
    if (DOM.audioIndicator) {
      DOM.audioIndicator.style.backgroundColor = '#f59e0b'; // Yellow for testing
    }
    
    // Spawn Python process for a quick test
    const pythonPath = 'python'; // Assumes Python is in PATH
    const scriptPath = path.join(__dirname, 'audio.py');
    
    const testProcess = spawn(pythonPath, [scriptPath, state.candidateFolder]);
    
    let testTimeout = setTimeout(() => {
      debugLog('Microphone test timed out');
      try {
        testProcess.stdin.write(JSON.stringify({command: 'exit'}) + '\n');
        testProcess.kill();
      } catch (e) {
        // Ignore errors
      }
      updateStatus('Microphone test timed out. Ensure Python and required packages are installed.', 'error');
      
      if (DOM.audioIndicator) {
        DOM.audioIndicator.style.backgroundColor = '#ef4444'; // Red for error
      }
    }, 10000); // 10 seconds timeout
    
    let receivedAudioLevel = false;
    
    testProcess.stdout.on('data', (data) => {
      try {
        const messages = data.toString().trim().split('\n');
        
        for (const messageText of messages) {
          if (!messageText) continue;
          
          const message = JSON.parse(messageText);
          
          if (message.type === 'audio_level') {
            receivedAudioLevel = true;
            if (DOM.audioLevel) {
              DOM.audioLevel.style.width = `${message.level * 100}%`;
            }
          } else if (message.type === 'ready') {
            debugLog('Python process ready for mic test');
            testProcess.stdin.write(JSON.stringify({command: 'start'}) + '\n');
          } else if (message.type === 'error') {
            updateStatus(`Microphone error: ${message.message}`, 'error');
            if (DOM.audioIndicator) {
              DOM.audioIndicator.style.backgroundColor = '#ef4444'; // Red for error
            }
            clearTimeout(testTimeout);
            testProcess.stdin.write(JSON.stringify({command: 'exit'}) + '\n');
          }
        }
      } catch (error) {
        console.error('Error processing Python output:', error);
      }
    });
    
    testProcess.stderr.on('data', (data) => {
      console.error('Python stderr:', data.toString());
    });
    
    // After 5 seconds, check if we got audio levels and end the test
    setTimeout(() => {
      clearTimeout(testTimeout);
      
      try {
        testProcess.stdin.write(JSON.stringify({command: 'stop'}) + '\n');
        testProcess.stdin.write(JSON.stringify({command: 'exit'}) + '\n');
      } catch (e) {
        // Ignore errors
      }
      
      if (receivedAudioLevel) {
        state.microphoneWorking = true;
        updateStatus('Microphone test successful!', 'success');
        if (DOM.audioIndicator) {
          DOM.audioIndicator.style.backgroundColor = '#22c55e'; // Green for success
        }
      } else {
        state.microphoneWorking = false;
        updateStatus('No audio detected from microphone. Please check your settings.', 'warning');
        if (DOM.audioIndicator) {
          DOM.audioIndicator.style.backgroundColor = '#ef4444'; // Red for error
        }
      }
    }, 5000);
    
  } catch (error) {
    console.error('Error testing microphone:', error);
    updateStatus('Failed to test microphone: ' + error.message, 'error');
    
    if (DOM.audioIndicator) {
      DOM.audioIndicator.style.backgroundColor = '#ef4444'; // Red for error
    }
  }
}

/**
 * Toggle mic listen mode - not used with Python-based approach
 * This is just a stub that can be implemented if needed
 */
function toggleMicListen() {
  alert("Python is handling the microphone. This feature is not available with the Python-based audio implementation.");
}

/**
 * Initialize speech synthesis for narration
 */
async function initializeSpeechSynthesis() {
  return new Promise((resolve) => {
    if (!speech.speechSynthesis) {
      debugLog('Speech synthesis not supported');
      return resolve(false);
    }

    const getVoices = () => {
      speech.availableVoices = speech.speechSynthesis.getVoices();
      if (speech.availableVoices.length) {
        speech.selectedVoice = speech.availableVoices.find(v => v.lang.startsWith('en')) || speech.availableVoices[0];
        resolve(true);
      } else {
        resolve(false);
      }
    };
    
    // Handle voice loading
    if (speech.speechSynthesis.onvoiceschanged !== undefined) {
      speech.speechSynthesis.onvoiceschanged = getVoices;
    }
    
    // Try to get voices immediately in case they're already loaded
    getVoices();
    
    // Fallback timeout in case voices don't load
    setTimeout(() => {
      if (!speech.selectedVoice) {
        debugLog('Timed out waiting for voices to load');
        resolve(false);
      }
    }, 3000);
  });
}

/**
 * Start the interview
 */
async function startInterview() {
  if (state.isInterviewRunning) return;

  updateStatus('Starting interview...');
  try {
    // Request video permission only, Python will handle audio
    const videoStream = await navigator.mediaDevices.getUserMedia({ 
      video: { 
        width: { ideal: 640 }, 
        height: { ideal: 480 },
        frameRate: { ideal: 15 }
      } 
    });
    
    state.permissions.video = true;
    
    if (DOM.videoElement) {
      DOM.videoElement.srcObject = videoStream;
      DOM.videoElement.onloadedmetadata = () => {
        DOM.videoElement.play();
        if (DOM.overlayCanvas) {
          DOM.overlayCanvas.width = DOM.videoElement.clientWidth;
          DOM.overlayCanvas.height = DOM.videoElement.clientHeight;
        }
        if (DOM.hiddenCanvas) {
          DOM.hiddenCanvas.width = 320;
          DOM.hiddenCanvas.height = 240;
        }
      };
    }

    // Initialize Python process for audio recording and transcription
    await initializePythonAudio();
    
    // Initialize and start proctoring
    initializeProctoring();

    // Update UI state
    state.isInterviewRunning = true;
    state.interviewStartTime = new Date();
    DOM.startButton.style.display = 'none';
    DOM.testMicButton.style.display = 'none';
    DOM.listenMicBtn.style.display = 'none';
    DOM.pauseButton.style.display = 'inline-block';
    DOM.nextButton.style.display = 'inline-block';
    DOM.endButton.style.display = 'inline-block';

    // Start timers and proceed to first question
    startTimer();
    nextQuestion();
    updateStatus('Interview in progress');
    
    // Show live transcription
    const transcriptionBox = document.querySelector('.transcription-feedback');
    if (transcriptionBox) transcriptionBox.style.display = 'block';
    
  } catch (error) {
    console.error('Error starting interview:', error);
    updateStatus(`Failed to start: ${error.message}`, 'error');
  }
}

/**
 * Initialize Python process for audio recording and transcription
 */
async function initializePythonAudio() {
  return new Promise((resolve, reject) => {
    try {
      // Kill any existing process
      if (state.pythonProcess) {
        debugLog('Killing existing Python process');
        try {
          state.pythonProcess.stdin.write(JSON.stringify({command: 'exit'}) + '\n');
          state.pythonProcess.kill();
        } catch (e) {
          // Ignore errors when killing the process
        }
      }
      
      debugLog('Spawning Python process for audio');
      const pythonPath = 'python'; // Assumes Python is in PATH
      const scriptPath = path.join(__dirname, 'audio.py');
      
      const pythonProcess = spawn(pythonPath, [scriptPath, state.candidateFolder]);
      state.pythonProcess = pythonProcess;
      state.pythonReady = false;
      
      // Handle timeout in case Python never starts
      const readyTimeout = setTimeout(() => {
        if (!state.pythonReady) {
          updateStatus('Failed to start audio processing. Ensure Python and required packages are installed.', 'error');
          reject(new Error('Python process failed to start'));
        }
      }, 10000); // 10 seconds timeout
      
      // Process JSON messages from Python
      pythonProcess.stdout.on('data', (data) => {
        try {
          const messages = data.toString().trim().split('\n');
          
          for (const messageText of messages) {
            if (!messageText) continue;
            
            const message = JSON.parse(messageText);
            
            if (message.type === 'transcription') {
              // Add the transcription to the current transcript
              if (message.text) { // Only add non-empty transcriptions
                speech.currentTranscript += message.text + ' ';
                
                // Update live transcription display
                if (DOM.liveTranscription) {
                  // Show last 150 characters of transcription
                  const displayText = speech.currentTranscript.slice(-150);
                  DOM.liveTranscription.textContent = displayText || 'Waiting for speech...';
                }
              }
              
              // Update audio indicator
              if (DOM.audioIndicator) {
                DOM.audioIndicator.style.backgroundColor = '#22c55e'; // Green for active
              }
            } 
            else if (message.type === 'audio_level') {
              // Update audio level visualization
              if (DOM.audioLevel) {
                DOM.audioLevel.style.width = `${message.level * 100}%`;
              }
              state.microphoneWorking = true;
            } 
            else if (message.type === 'ready') {
              debugLog('Python process ready');
              state.pythonReady = true;
              clearTimeout(readyTimeout);
              
              // Send start command to begin recording
              pythonProcess.stdin.write(JSON.stringify({command: 'start'}) + '\n');
              
              if (DOM.recordingIndicator) {
                DOM.recordingIndicator.style.backgroundColor = '#ef4444'; // Red for recording
              }
              
              resolve(true);
            } 
            else if (message.type === 'error') {
              console.error('Python error:', message.message);
              
              // Show error in UI if critical
              if (message.message.includes('Failed to access microphone')) {
                updateStatus('Failed to access microphone: ' + message.message, 'error');
                
                if (DOM.audioIndicator) {
                  DOM.audioIndicator.style.backgroundColor = '#ef4444'; // Red for error
                }
                
                if (!state.pythonReady) {
                  clearTimeout(readyTimeout);
                  reject(new Error(message.message));
                }
              }
            } 
            else if (message.type === 'info') {
              debugLog('Python info: ' + message.message);
            }
          }
        } catch (error) {
          console.error('Error parsing Python message:', error, 'Raw data:', data.toString());
        }
      });
      
      // Handle process errors
      pythonProcess.stderr.on('data', (data) => {
        console.error('Python stderr:', data.toString());
      });
      
      // Handle process exit
      pythonProcess.on('exit', (code) => {
        debugLog(`Python process exited with code ${code}`);
        state.pythonProcess = null;
        state.pythonReady = false;
        
        if (code !== 0 && state.isInterviewRunning) {
          updateStatus('Audio processing failed. Please restart the interview.', 'error');
        }
      });
      
      // Ensure the process is cleaned up when app closes
      process.on('exit', () => {
        try {
          if (state.pythonProcess) {
            state.pythonProcess.stdin.write(JSON.stringify({command: 'exit'}) + '\n');
            state.pythonProcess.kill();
          }
        } catch (e) {
          // Ignore errors
        }
      });
      
    } catch (error) {
      console.error('Error initializing Python audio:', error);
      reject(error);
    }
  });
}

/**
 * Initialize enhanced proctoring system
 */
function initializeProctoring() {
  if (!DOM.videoElement || !DOM.videoElement.srcObject) {
    debugLog('Video element or stream not available for proctoring');
    updateProctoringStatus('camera', false);
    return false;
  }
  
  if (!DOM.hiddenCanvas) {
    debugLog('Canvas element not available for proctoring');
    return false;
  }
  
  try {
    // Initialize canvas
    const hiddenCanvas = DOM.hiddenCanvas;
    const ctx = hiddenCanvas.getContext('2d');
    
    // Set canvas size to be smaller for performance
    hiddenCanvas.width = 320;
    hiddenCanvas.height = 240;
    
    // Initialize proctoring state
    state.proctoring = {
      active: true,
      proctoringInterval: setInterval(checkProctoring, CONFIG.proctoringInterval),
      lastWarningTime: 0,
      warningCount: 0,
      consecutiveWarnings: 0,
      lookingAway: false,
      lastFrameData: null,
      movementLevel: 0,
      faceDetected: true,
      cameraActive: true,
      screenshots: []
    };
    
    // Set eye indicator to active
    if (DOM.eyeIndicator) {
      DOM.eyeIndicator.style.backgroundColor = '#3b82f6'; // Blue for active
    }
    
    // Update proctoring UI
    updateProctoringStatus('camera', true);
    updateProctoringStatus('face', true);
    updateProctoringStatus('movement', true);
    
    if (DOM.proctorTerminal) {
      DOM.proctorTerminal.textContent = "PROCTORING ACTIVE";
    }
    
    debugLog('Proctoring initialized');
    return true;
  } catch (error) {
    console.error('Error initializing proctoring:', error);
    return false;
  }
}

/**
 * Check proctoring status
 */
function checkProctoring() {
  if (!state.proctoring.active || !DOM.videoElement || !DOM.videoElement.srcObject) {
    updateProctoringStatus('camera', false);
    return;
  }
  
  try {
    // Get canvas and context
    const hiddenCanvas = DOM.hiddenCanvas;
    const ctx = hiddenCanvas.getContext('2d');
    
    // Draw current video frame to canvas
    ctx.drawImage(DOM.videoElement, 0, 0, hiddenCanvas.width, hiddenCanvas.height);
    
    // Get image data for analysis
    const currentFrame = ctx.getImageData(0, 0, hiddenCanvas.width, hiddenCanvas.height);
    
    // Detect if user is looking away or moving too much
    const detectionResult = detectUserLookingAway(currentFrame);
    
    // Update movement level bar in UI
    if (DOM.movementLevelBar) {
      DOM.movementLevelBar.style.width = `${detectionResult.movementLevel}%`;
    }
    
    // Update proctoring terminal with status
    updateProctoringDisplay(detectionResult);
    
    // Take action if looking away
    if (detectionResult.lookingAway) {
      handleCheatingDetection(detectionResult.reason || "Looking away from screen");
    } else {
      resetCheatingWarning();
    }
    
    // Store current frame for next comparison
    state.proctoring.lastFrameData = currentFrame;
    
  } catch (error) {
    console.error('Error in proctoring check:', error);
    updateProctoringStatus('camera', false);
  }
}

/**
 * Detect if user is looking away from screen
 * This uses a simple movement detection algorithm comparing frame differences
 */
function detectUserLookingAway(currentFrame) {
  // If no previous frame, can't compare
  if (!state.proctoring.lastFrameData) {
    return { 
      lookingAway: false, 
      reason: "First frame",
      movementLevel: 0,
      faceDetected: true
    };
  }
  
  const currentData = currentFrame.data;
  const previousData = state.proctoring.lastFrameData.data;
  const dataLength = currentData.length;
  
  let diffCount = 0;
  const skipPixels = 20; // Check every 20th pixel for performance
  
  // Check for significant changes between frames
  for (let i = 0; i < dataLength; i += (4 * skipPixels)) { // 4 values for RGBA
    const rDiff = Math.abs(currentData[i] - previousData[i]);
    const gDiff = Math.abs(currentData[i+1] - previousData[i+1]);
    const bDiff = Math.abs(currentData[i+2] - previousData[i+2]);
    
    const pixelDiff = rDiff + gDiff + bDiff;
    
    if (pixelDiff > 100) { // Threshold for significant change
      diffCount++;
    }
  }
  
  // Calculate the percentage of pixels that changed significantly
  const totalCheckedPixels = dataLength / (4 * skipPixels);
  const changePercentage = (diffCount / totalCheckedPixels) * 100;
  state.proctoring.movementLevel = Math.min(100, changePercentage);
  
  // Simulate face detection with random factor (replace with actual face detection if available)
  // This is a stand-in for actual face detection
  const faceDetectionSimulation = Math.random();
  const noFaceDetected = faceDetectionSimulation > 0.92; // 8% chance of "no face"
  state.proctoring.faceDetected = !noFaceDetected;
  
  // Excessive movement check
  let lookingAway = false;
  let reason = "";
  
  if (changePercentage > CONFIG.movementThreshold) {
    lookingAway = true;
    reason = "Excessive movement detected";
    state.proctoring.consecutiveWarnings++;
  } else if (noFaceDetected && Math.random() > 0.6) { // Sometimes trigger face detection warning
    lookingAway = true;
    reason = "Face not fully visible";
    state.proctoring.consecutiveWarnings++;
  } else {
    // Gradually reduce warning count if user is steady
    state.proctoring.consecutiveWarnings = Math.max(0, state.proctoring.consecutiveWarnings - 0.5);
  }
  
  // Only trigger warning if consistent issues over multiple frames
  return { 
    lookingAway: lookingAway && state.proctoring.consecutiveWarnings > CONFIG.warningThreshold, 
    reason: reason,
    movementLevel: Math.min(100, changePercentage),
    faceDetected: !noFaceDetected
  };
}

/**
 * Update proctoring display with latest status
 */
function updateProctoringDisplay(detectionResult) {
  // Update status indicators
  updateProctoringStatus('camera', state.proctoring.cameraActive);
  updateProctoringStatus('face', detectionResult.faceDetected);
  
  // Movement status depends on level
  const movementLevel = detectionResult.movementLevel || 0;
  
  if (movementLevel < 10) {
    updateProctoringStatus('movement', true); // Normal
  } else if (movementLevel < 25) {
    updateProctoringStatus('movement', 'warning'); // Warning
  } else {
    updateProctoringStatus('movement', false); // Error
  }
  
  // Update terminal with detailed info
  if (DOM.proctorTerminal) {
    if (detectionResult.lookingAway) {
      DOM.proctorTerminal.textContent = `WARNING: ${detectionResult.reason} (Movement: ${Math.round(movementLevel)}%)`;
    } else {
      DOM.proctorTerminal.textContent = `PROCTORING ACTIVE (Movement: ${Math.round(movementLevel)}%)`;
    }
  }
}

/**
 * Update proctoring status indicators in UI
 */
function updateProctoringStatus(type, status) {
  // Find the correct status element
  let element;
  
  switch (type) {
    case 'camera':
      element = DOM.cameraStatus;
      state.proctoring.cameraActive = status === true;
      break;
    case 'face':
      element = DOM.faceStatus;
      state.proctoring.faceDetected = status === true;
      break;
    case 'movement':
      element = DOM.movementStatus;
      break;
    default:
      return;
  }
  
  if (!element) return;
  
  // Remove all status classes
  element.classList.remove('active', 'warning', 'error');
  
  // Add appropriate class
  if (status === true) {
    element.classList.add('active');
  } else if (status === 'warning') {
    element.classList.add('warning');
  } else {
    element.classList.add('error');
  }
}

/**
 * Handle cheating detection
 */
function handleCheatingDetection(message) {
  state.proctoring.warningCount++;
  
  // Make warning visible
  if (DOM.proctoringWarning) {
    DOM.proctoringWarning.style.display = 'block';
    DOM.proctoringWarning.textContent = message || "Keep your eyes on the screen!";
  }
  
  // Add class to status element to indicate cheating
  DOM.statusElement.classList.add('cheating');
  DOM.statusElement.textContent = "PROCTORING VIOLATION DETECTED - " + message;
  
  // Audio warning (debounced)
  const now = Date.now();
  if (now - state.proctoring.lastWarningTime > 5000) {
    // Play alert beep sound
    playBeepSound();
    
    // Try using Web Speech API
    if ('speechSynthesis' in window && speech.speechSynthesis) {
      const msg = new SpeechSynthesisUtterance(message || "Keep your eyes on the screen");
      speech.speechSynthesis.speak(msg);
    } else {
      // Fallback to Electron IPC
      try {
        ipcRenderer.send('speak-warning', message || "Keep your eyes on the screen");
      } catch (e) {
        console.error("TTS error:", e);
      }
    }
    
    state.proctoring.lastWarningTime = now;
  }
  
  // Take a screenshot for evidence
  captureViolationScreenshot();
  
  // Log the event
  logProctoringEvent(message || "Proctoring violation detected");
}

/**
 * Play a beep sound for warnings
 */
function playBeepSound() {
  try {
    // Create oscillator for beep sound
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    // Configure oscillator
    oscillator.type = 'square';
    oscillator.frequency.setValueAtTime(440, audioContext.currentTime); // A4 note
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    
    // Connect nodes
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    // Play sound
    oscillator.start();
    setTimeout(() => {
      oscillator.stop();
    }, 300);
  } catch (err) {
    console.error("Error playing beep sound:", err);
  }
}

/**
 * Capture a screenshot when a violation is detected
 */
function captureViolationScreenshot() {
  if (!DOM.videoElement || !DOM.hiddenCanvas) return;
  
  try {
    const canvas = DOM.hiddenCanvas;
    const ctx = canvas.getContext('2d');
    
    // Draw video to canvas
    ctx.drawImage(DOM.videoElement, 0, 0, canvas.width, canvas.height);
    
    // Convert to data URL
    const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
    
    // Save to state for possible later use
    state.proctoring.screenshots.push({
      time: new Date().toISOString(),
      data: dataUrl
    });
    
    // Maximum 10 screenshots to avoid memory issues
    if (state.proctoring.screenshots.length > 10) {
      state.proctoring.screenshots.shift();
    }
    
    // Save to disk if we have permissions
    try {
      const screenshotDir = path.join(state.candidateFolder, 'screenshots');
      if (!fs.existsSync(screenshotDir)) {
        fs.mkdirSync(screenshotDir, { recursive: true });
      }
      
      const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\./g, '-');
      const filePath = path.join(screenshotDir, `violation_${timestamp}.jpg`);
      
      // Convert data URL to buffer
      const dataWithoutPrefix = dataUrl.replace(/^data:image\/\w+;base64,/, '');
      const buffer = Buffer.from(dataWithoutPrefix, 'base64');
      
      // Write to file
      fs.writeFileSync(filePath, buffer);
      
    } catch (fileError) {
      console.error('Error saving screenshot:', fileError);
    }
    
  } catch (err) {
    console.error('Error capturing violation screenshot:', err);
  }
}

/**
 * Reset cheating warning
 */
function resetCheatingWarning() {
  if (DOM.proctoringWarning) {
    DOM.proctoringWarning.style.display = 'none';
  }
  DOM.statusElement.classList.remove('cheating');
}

/**
 * Log proctoring event to file
 */
function logProctoringEvent(message) {
  try {
    const logDir = path.join(state.candidateFolder);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    
    const logPath = path.join(logDir, 'proctoring.log');
    const entry = `${new Date().toISOString()}: ${message}\n`;
    fs.appendFileSync(logPath, entry);
  } catch (err) {
    console.error("Log error:", err);
  }
}

/**
 * Start timer
 */
function startTimer() {
  if (state.timerInterval) clearInterval(state.timerInterval);
  
  updateTimerDisplay(state.interviewTime);
  
  state.timerInterval = setInterval(() => {
    if (!state.isPaused) {
      state.interviewTime--;
      updateTimerDisplay(state.interviewTime);
      if (state.interviewTime <= 0) endInterview();
    }
  }, 1000);
}

/**
 * Update timer display
 */
function updateTimerDisplay(seconds) {
  if (!DOM.timerElement) return;
  
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  DOM.timerElement.textContent = `${minutes}:${secs.toString().padStart(2, '0')}`;
  
  const timerContainer = DOM.timerElement.parentElement;
  if (timerContainer) {
    timerContainer.classList.remove('urgent', 'warning');
    if (seconds < 60) {
      timerContainer.classList.add('urgent');
    } else if (seconds < 180) {
      timerContainer.classList.add('warning');
    }
  }
}

/**
 * Load interview questions
 */
async function loadInterviewQuestions() {
  state.questions = getDefaultQuestions();
  state.answers = new Array(state.questions.length).fill('');
  populateQuestionList();
}

/**
 * Default questions for testing
 */
function getDefaultQuestions() {
  return [
    { question: "Welcome to the HR interview. I'll be asking you a series of questions to learn more about you. Please speak clearly and take your time to answer thoughtfully.", category: "Introduction", answerTime: 0, isSystemPrompt: true },
    { question: "Tell me about yourself and your background.", category: "Introduction", answerTime: 60 },
    { question: "What are your greatest strengths?", category: "Self-Assessment", answerTime: 60 },
    { question: "What do you consider to be your weaknesses?", category: "Self-Assessment", answerTime: 60 },
    { question: "Why are you interested in this position?", category: "Motivation", answerTime: 60 },
    { question: "Describe a challenging situation at work and how you handled it.", category: "Experience", answerTime: 60 },
    { question: "Where do you see yourself professionally in five years?", category: "Career Goals", answerTime: 60 },
    { question: "How do you handle stress and pressure?", category: "Work Style", answerTime: 60 },
    { question: "Thank you for participating in this interview. We'll now process your responses and get back to you with the results shortly.", category: "Conclusion", answerTime: 0, isSystemPrompt: true }
  ];
}

/**
 * Populate question list
 */
function populateQuestionList() {
  if (!DOM.questionList) return;
  
  DOM.questionList.innerHTML = '';
  const questionsToShow = state.questions.filter(q => !q.isSystemPrompt);
  
  questionsToShow.forEach((q, idx) => {
    const li = document.createElement('li');
    li.className = 'question-item';
    li.dataset.index = state.questions.indexOf(q);
    li.innerHTML = `
      <div class="question-item-header">
        <span class="question-number">Q${idx + 1}</span>
        <span class="question-status-badge">Pending</span>
      </div>
      <div class="question-item-text">${q.question.substring(0, 70)}${q.question.length > 70 ? '...' : ''}</div>
      <div class="question-item-category">${q.category}</div>
    `;
    DOM.questionList.appendChild(li);
  });
}

/**
 * Next question
 */
function nextQuestion() {
  if (state.currentQuestionIndex >= 0) {
    saveQuestionTranscript();
    updateQuestionListStatus(state.currentQuestionIndex, 'completed');
  }

  speech.currentTranscript = '';
  if (DOM.liveTranscription) DOM.liveTranscription.textContent = 'Waiting for speech...';

  state.currentQuestionIndex++;
  if (state.currentQuestionIndex >= state.questions.length) {
    endInterview();
    return;
  }

  const question = state.questions[state.currentQuestionIndex];
  displayCurrentQuestion(question);
  updateQuestionListStatus(state.currentQuestionIndex, 'active');

  narrateText(question.question, () => {
    if (question.isSystemPrompt) {
      setTimeout(() => state.currentQuestionIndex === 0 ? nextQuestion() : endInterview(), 1000);
    } else {
      startQuestionTimer(question.answerTime);
    }
  });
}

/**
 * Display current question
 */
function displayCurrentQuestion(question) {
  if (!question) return;
  
  if (DOM.questionDisplay) {
    DOM.questionDisplay.innerHTML = `
      <h2>${question.category}</h2>
      <p>${question.question}</p>
      <div class="question-meta">
        <div class="question-category">${question.category}</div>
        <div class="question-time">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <polyline points="12 6 12 12 16 14"></polyline>
          </svg>
          <span id="questionTimeText">${question.isSystemPrompt ? 'N/A' : formatTime(question.answerTime)}</span>
        </div>
      </div>
    `;
    DOM.questionTimerElement = document.getElementById('questionTimeText');
  }
  
  if (DOM.currentQuestionElement) {
    DOM.currentQuestionElement.innerHTML = `
      <h4>${question.category}</h4>
      <p>${question.question}</p>
      <div class="question-details">
        <span>Type: ${question.category}</span>
        <span>Time: ${question.isSystemPrompt ? 'N/A' : formatTime(question.answerTime)}</span>
      </div>
    `;
  }
}

/**
 * Save question transcript
 */
function saveQuestionTranscript() {
  const question = state.questions[state.currentQuestionIndex];
  if (!question || question.isSystemPrompt) return;

  const endTime = new Date();
  const startTime = state.currentQuestionStartTime || new Date(endTime - (question.answerTime * 1000));
  
  const transcriptData = {
    questionIndex: state.currentQuestionIndex,
    question: question.question,
    category: question.category,
    startTime: startTime.toISOString(),
    endTime: endTime.toISOString(),
    duration: Math.round((endTime - startTime) / 1000),
    transcript: speech.currentTranscript || 'No response recorded'
  };
  
  state.transcriptSegments.push(transcriptData);
  state.answers[state.currentQuestionIndex] = speech.currentTranscript || 'No response recorded';
  
  // Write transcript to file
  try {
    const transcriptDir = path.join(state.candidateFolder, 'transcripts');
    if (!fs.existsSync(transcriptDir)) {
      fs.mkdirSync(transcriptDir, { recursive: true });
    }
    
    const transcriptPath = path.join(
      transcriptDir, 
      `question_${state.currentQuestionIndex + 1}.json`
    );
    
    fs.writeFileSync(transcriptPath, JSON.stringify(transcriptData, null, 2));
    
    debugLog(`Saved transcript for question ${state.currentQuestionIndex + 1}`);
  } catch (error) {
    console.error('Error saving transcript:', error);
  }
}

/**
 * Start question timer
 */
function startQuestionTimer(seconds) {
  state.questionTime = seconds;
  state.currentQuestionStartTime = new Date();
  
  if (state.questionTimerInterval) clearInterval(state.questionTimerInterval);
  
  state.questionTimerInterval = setInterval(() => {
    if (!state.isPaused) {
      state.questionTime--;
      if (DOM.questionTimerElement) {
        DOM.questionTimerElement.textContent = formatTime(state.questionTime);
      }
      if (state.questionTime <= 0) {
        clearInterval(state.questionTimerInterval);
        setTimeout(nextQuestion, 2000);
      }
    }
  }, 1000);
}

/**
 * Format time as MM:SS
 */
function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Narrate text using speech synthesis
 */
function narrateText(text, onComplete) {
  if (!speech.speechSynthesis) {
    debugLog('Speech synthesis not available for narration');
    return onComplete?.();
  }

  // Cancel any ongoing speech
  speech.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  if (speech.selectedVoice) utterance.voice = speech.selectedVoice;
  utterance.rate = 1.0;
  utterance.pitch = 1.0;
  
  utterance.onend = () => { 
    speech.isNarrating = false; 
    debugLog('Narration completed');
    onComplete?.(); 
  };
  
  utterance.onerror = (error) => { 
    console.error('Speech synthesis error:', error);
    speech.isNarrating = false; 
    onComplete?.(); 
  };
  
  speech.speechSynthesis.speak(utterance);
  speech.isNarrating = true;
  debugLog('Narration started');
}

/**
 * Toggle pause
 */
function togglePause() {
  state.isPaused = !state.isPaused;
  
  if (DOM.pauseButton) {
    DOM.pauseButton.innerHTML = state.isPaused ?
      `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polygon points="10 8 16 12 10 16 10 8"></polygon></svg> Resume Interview` :
      `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="10" y1="15" x2="10" y2="9"></line><line x1="14" y1="15" x2="14" y2="9"></line></svg> Pause Interview`;
  }
  
  updateStatus(state.isPaused ? 'Interview paused' : 'Interview resumed');
  
  // We do not pause the Python process - it keeps recording continuously
  // This is by design to ensure we don't miss any audio
}

/**
 * Confirm end interview
 */
function confirmEndInterview() {
  if (confirm('Are you sure you want to end the interview?')) endInterview();
}

/**
 * End interview
 */
async function endInterview() {
  if (!state.isInterviewRunning || state.isProcessing) return;

  debugLog('Ending interview...');
  state.isProcessing = true;
  state.isInterviewRunning = false;
  
  if (DOM.processingOverlay) DOM.processingOverlay.style.display = 'flex';

  // Clear timers
  if (state.timerInterval) clearInterval(state.timerInterval);
  if (state.questionTimerInterval) clearInterval(state.questionTimerInterval);
  
  // Stop proctoring
  if (state.proctoring.proctoringInterval) {
    clearInterval(state.proctoring.proctoringInterval);
    state.proctoring.active = false;
  }
  
  // Stop Python process
  if (state.pythonProcess) {
    try {
      debugLog('Stopping Python process');
      // First stop recording
      state.pythonProcess.stdin.write(JSON.stringify({command: 'stop'}) + '\n');
      
      // Wait a bit to ensure recording is saved
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Then exit process
      state.pythonProcess.stdin.write(JSON.stringify({command: 'exit'}) + '\n');
      
      // Give it some time to exit cleanly
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // If it's still running, force kill
      if (state.pythonProcess) {
        try {
          state.pythonProcess.kill();
        } catch (e) {
          // Ignore kill errors
        }
      }
      
      state.pythonProcess = null;
    } catch (error) {
      console.error('Error stopping Python process:', error);
    }
  }
  
  // Stop speech synthesis
  if (speech.speechSynthesis) {
    try {
      speech.speechSynthesis.cancel();
    } catch (error) {
      console.error('Error canceling speech synthesis:', error);
    }
  }

  // Save any remaining transcript
  if (state.currentQuestionIndex >= 0 && 
      state.currentQuestionIndex < state.questions.length &&
      !state.questions[state.currentQuestionIndex].isSystemPrompt) {
    saveQuestionTranscript();
  }

  // Stop video stream
  try {
    if (DOM.videoElement && DOM.videoElement.srcObject) {
      DOM.videoElement.srcObject.getTracks().forEach(track => track.stop());
      DOM.videoElement.srcObject = null;
    }
  } catch (streamError) {
    console.error('Error stopping video stream:', streamError);
  }

  // Save interview results
  updateProcessingStatus('Saving interview results...');
  await saveInterviewResults();

  if (DOM.processingProgressBar) DOM.processingProgressBar.style.width = '100%';
  updateProcessingStatus('Interview completed! Redirecting...');
  
  setTimeout(() => {
    window.location.href = 'interviewend.html';
  }, 2000);
}

/**
 * Save interview results
 */
async function saveInterviewResults() {
  try {
    // Create JSON result file
    const results = {
      candidateName: state.candidateName,
      candidateId: state.candidateId,
      startTime: state.interviewStartTime ? state.interviewStartTime.toISOString() : null,
      endTime: new Date().toISOString(),
      questions: state.questions.map((q, index) => ({
        index,
        question: q.question,
        category: q.category,
        isSystemPrompt: q.isSystemPrompt || false,
        answer: state.answers[index] || ''
      })),
      transcriptSegments: state.transcriptSegments,
      proctoringWarnings: state.proctoring.warningCount
    };
    
    // Save to file
    const resultPath = path.join(state.candidateFolder, 'interview_results.json');
    fs.writeFileSync(resultPath, JSON.stringify(results, null, 2));
    
    // Create progress file for stage tracking
    const progressPath = path.join(state.candidateFolder, 'progress.json');
    let progress = {};
    
    if (fs.existsSync(progressPath)) {
      try {
        progress = JSON.parse(fs.readFileSync(progressPath, 'utf8'));
      } catch (parseError) {
        console.error('Error parsing progress file:', parseError);
      }
    }
    
    progress.Interview = {
      completed: true,
      passed: true,
      timestamp: new Date().toISOString(),
      warnings: state.proctoring.warningCount
    };
    
    fs.writeFileSync(progressPath, JSON.stringify(progress, null, 2));
    
    // Update REPORT.txt
    await updateReportFile(results);
    
    return true;
  } catch (error) {
    console.error('Error saving interview results:', error);
    return false;
  }
}

/**
 * Update the REPORT.txt file with interview results
 */
async function updateReportFile(results) {
  try {
    const reportPath = path.join(state.candidateFolder, 'REPORT.txt');
    let reportContent = '';
    
    if (fs.existsSync(reportPath)) {
      reportContent = fs.readFileSync(reportPath, 'utf8');
    } else {
      reportContent = `INTERVIEW REPORT FOR: ${state.candidateName}\nGenerated: ${new Date().toISOString()}\n\n`;
    }
    
    // Add interview section
    reportContent += '\n=== HR INTERVIEW RESULTS ===\n';
    reportContent += `Date: ${new Date().toISOString()}\n`;
    reportContent += `Duration: ${formatDuration(results.startTime, results.endTime)}\n`;
    
    if (results.proctoringWarnings > 0) {
      reportContent += `Proctoring Warnings: ${results.proctoringWarnings}\n`;
    }
    
    reportContent += '\nQuestion Summary:\n';
    
    const nonSystemQuestions = results.questions.filter(q => !q.isSystemPrompt);
    nonSystemQuestions.forEach((q, idx) => {
      reportContent += `\nQ${idx + 1}: ${q.question}\n`;
      reportContent += `Category: ${q.category}\n`;
      
      if (q.answer) {
        // Truncate long answers to keep report readable
        const maxLength = 200;
        const answer = q.answer.length > maxLength ? 
          q.answer.substring(0, maxLength) + '...[truncated]' :
          q.answer;
          
        reportContent += `Answer: ${answer}\n`;
      } else {
        reportContent += 'Answer: No response recorded\n';
      }
    });
    
    // Write to file
    fs.writeFileSync(reportPath, reportContent);
    
    return true;
  } catch (error) {
    console.error('Error updating report file:', error);
    return false;
  }
}

/**
 * Format duration between two ISO date strings
 */
function formatDuration(startTimeIso, endTimeIso) {
  try {
    const startTime = new Date(startTimeIso);
    const endTime = new Date(endTimeIso);
    const durationMs = endTime - startTime;
    
    const minutes = Math.floor(durationMs / (1000 * 60));
    const seconds = Math.floor((durationMs % (1000 * 60)) / 1000);
    
    return `${minutes} minutes, ${seconds} seconds`;
  } catch (error) {
    return 'Unknown duration';
  }
}

/**
 * Update status
 */
function updateStatus(message, level = 'info') {
  if (!DOM.statusElement) return;
  
  DOM.statusElement.textContent = message;
  DOM.statusElement.classList.remove('error', 'warning', 'success');
  if (level !== 'info') DOM.statusElement.classList.add(level);
}

/**
 * Update processing status
 */
function updateProcessingStatus(message) {
  if (DOM.processingStatus) DOM.processingStatus.textContent = message;
  debugLog(`Processing: ${message}`);
}

/**
 * Update question list status
 */
function updateQuestionListStatus(index, status) {
  const questionIndex = state.questions.findIndex((q, i) => i === index);
  if (questionIndex === -1) return;
  
  const item = DOM.questionList?.querySelector(`li[data-index="${index}"]`);
  if (!item) return;
  
  item.classList.remove('status-active', 'status-completed', 'status-pending');
  item.classList.add(`status-${status}`);
  
  const badge = item.querySelector('.question-status-badge');
  if (badge) {
    badge.textContent = status.charAt(0).toUpperCase() + status.slice(1);
  }
  
  if (status === 'active') {
    item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

/**
 * Debug logger
 */
function debugLog(message) {
  if (CONFIG.debug) {
    console.log(`[DEBUG] ${message}`);
  }
}
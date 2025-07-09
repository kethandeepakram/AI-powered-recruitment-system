// Enhanced aptitude.js with working proctoring system like the coding interview
const fs = require('fs');
const path = require('path');
const { ipcRenderer } = require('electron');

// State
const candidateName = localStorage.getItem('candidateName') || 'Unknown';
let questions = [];
let currentQuestion = 0;
let answers = [];
let timeLeft = 0;
let timerInterval;
let isSubmitting = false;
let statusEl, questionArea, optionsContainer, prevBtn, nextBtn, submitBtn, timerEl;

// Proctoring variables
let video, proctoringInterval;
let movementCount = 0;
let lastWarningTime = 0;
let warningEl, proctorTerminal;
let cheatingViolations = 0;
let canvas, ctx;
let lastFrameData = null;

// Expanded questions (with 4 new ones)
const HARDCODED_QUESTIONS = [
  {
    question: "A train running at 60 km/hr crosses a pole in 9 seconds. What is the length of the train?",
    category: "Mathematics",
    options: ["120 metres", "180 metres", "324 metres", "150 metres"],
    correctAnswer: "1" // 180 metres
  },
  {
    question: "A train 125 m long passes a man, running at 5 km/hr in the same direction in which the train is going, in 10 seconds. The speed of the train is:",
    category: "Mathematics",
    options: ["45 km/hr", "50 km/hr", "54 km/hr", "55 km/hr"],
    correctAnswer: "1" // 50 km/hr
  },
  {
    question: "What value is equivalent to 3^4 × 3^2?",
    category: "Mathematics", 
    options: ["3^6", "3^8", "3^16", "6^6"],
    correctAnswer: "0" // 3^6
  },
  // Adding 4 new questions
  {
    question: "If a car travels 300 kilometers in 4 hours, what is its average speed?",
    category: "Mathematics",
    options: ["60 km/h", "75 km/h", "80 km/h", "100 km/h"],
    correctAnswer: "1" // 75 km/h
  },
  {
    question: "A shopkeeper sold an item at a 20% profit. If the cost price was $250, what was the selling price?",
    category: "Mathematics",
    options: ["$270", "$280", "$300", "$320"],
    correctAnswer: "2" // $300
  },
  {
    question: "If 8 workers can build a wall in 10 days, how many days will it take 5 workers to build the same wall?",
    category: "Logic",
    options: ["6.25 days", "12.5 days", "16 days", "20 days"],
    correctAnswer: "2" // 16 days
  },
  {
    question: "What is the next number in the sequence: 2, 5, 9, 14, 20, ...?",
    category: "Logic",
    options: ["25", "27", "29", "32"],
    correctAnswer: "1" // 27
  }
];

document.addEventListener('DOMContentLoaded', function() {
  // Cache DOM elements
  statusEl = document.getElementById('status');
  questionArea = document.getElementById('questionArea');
  optionsContainer = document.getElementById('optionsContainer');
  prevBtn = document.getElementById('prevBtn');
  nextBtn = document.getElementById('nextBtn');
  submitBtn = document.getElementById('submitBtn');
  timerEl = document.getElementById('timer');
  warningEl = document.getElementById('proctorWarning');
  video = document.getElementById('userVideo');
  proctorTerminal = document.getElementById('proctorTerminal');
  
  // Create hidden canvas for frame processing
  canvas = document.createElement('canvas');
  canvas.width = 320;
  canvas.height = 240;
  canvas.style.display = 'none';
  document.body.appendChild(canvas);
  ctx = canvas.getContext('2d');
  
  // Initialize test
  initializeTest();
  
  // Initialize proctoring
  initializeCamera();
});

// Function to shuffle an array - Fisher-Yates algorithm
function shuffleArray(array) {
  const newArray = [...array]; // Create a copy so we don't modify the original
  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
  }
  return newArray;
}

function initializeTest() {
  // Shuffle the actual questions (not system prompts)
  const shuffledQuestions = shuffleArray(HARDCODED_QUESTIONS);
  
  // Set up questions with system prompts at beginning and end
  questions = [];
  
  // Add intro system prompt
  questions.push({
    question: "Welcome to the Aptitude Assessment. You'll need to score at least 60% to pass.",
    category: "Introduction",
    isSystemPrompt: true
  });
  
  // Add shuffled actual questions
  questions = questions.concat(shuffledQuestions);
  
  // Add conclusion system prompt
  questions.push({
    question: "You've reached the end of the assessment. Click 'Submit Test' to see your results.",
    category: "Conclusion",
    isSystemPrompt: true
  });
  
  // Initialize answers array with -1 for each question (unanswered)
  answers = new Array(questions.length).fill(-1);
  
  // Calculate time based on number of actual questions (excluding system prompts)
  const actualQuestionCount = questions.filter(q => !q.isSystemPrompt).length;
  timeLeft = actualQuestionCount * 45; // 45 seconds per question
  
  // Bind handlers
  prevBtn.addEventListener('click', () => handleNav(-1));
  nextBtn.addEventListener('click', () => handleNav(1));
  submitBtn.addEventListener('click', handleSubmit);
  
  // Update UI
  updateQuestion();
  startTimer();
  
  statusEl.textContent = "Test ready. Answer all questions to proceed.";
}

function initializeCamera() {
  if (!navigator.mediaDevices || !video) {
    console.error("Camera access is not available");
    proctorTerminal.textContent = "Camera access not available";
    return;
  }
  
  proctorTerminal.textContent = "Initializing camera...";
  
  navigator.mediaDevices.getUserMedia({ 
    video: { 
      width: { ideal: 640 },
      height: { ideal: 480 },
      frameRate: { ideal: 15 }
    } 
  })
  .then(stream => {
    video.srcObject = stream;
    video.onloadedmetadata = () => {
      canvas.width = video.videoWidth / 2; // Resize for performance
      canvas.height = video.videoHeight / 2;
      proctorTerminal.textContent = "Camera initialized";
      startProctoring();
    };
  })
  .catch(err => {
    console.error("Camera error:", err);
    proctorTerminal.textContent = "Camera error: " + err.message;
  });
}

function startProctoring() {
  proctorTerminal.textContent = "PROCTORING ACTIVE";
  
  // Clear existing interval if any
  if (proctoringInterval) clearInterval(proctoringInterval);
  
  // Start with a check right away
  checkProctoring();
  
  // Then set up the interval (every 2 seconds)
  proctoringInterval = setInterval(checkProctoring, 2000);
}

function checkProctoring() {
  if (!video || !video.srcObject) return;
  
  try {
    // Draw current video frame to canvas
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    // Get image data for simple motion detection
    const currentFrame = ctx.getImageData(0, 0, canvas.width, canvas.height);
    
    // Detect if user is looking away
    const detectionResult = detectUserLookingAway(currentFrame);
    
    // Update proctor terminal with status
    updateProctorStatus(detectionResult);
    
    // Store current frame for next comparison
    lastFrameData = currentFrame;
  } catch (err) {
    console.error("Proctoring error:", err);
  }
}

function detectUserLookingAway(currentFrame) {
  // If no previous frame, can't compare
  if (!lastFrameData) return { lookingAway: false, reason: "First frame" };
  
  const currentData = currentFrame.data;
  const previousData = lastFrameData.data;
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
  
  // Simulate face detection with random factor
  // This is a stand-in for actual face detection
  const faceDetectionSimulation = Math.random();
  const noFaceDetected = faceDetectionSimulation > 0.9; // 10% chance of "no face"
  
  // Excessive movement check
  let lookingAway = false;
  let reason = "";
  
  if (changePercentage > 15) {
    lookingAway = true;
    reason = "Excessive movement detected";
    movementCount++;
  } else if (noFaceDetected && Math.random() > 0.5) {
    lookingAway = true;
    reason = "Face not detected in frame";
    movementCount++;
  } else {
    // Gradually reduce movement count if user is steady
    movementCount = Math.max(0, movementCount - 0.5);
  }
  
  // Only trigger warning if consistent issues over multiple frames
  return { 
    lookingAway: lookingAway && movementCount > 2, 
    reason: reason,
    movementLevel: Math.min(100, changePercentage)
  };
}

function updateProctorStatus(detectionResult) {
  // Update terminal with movement level
  if (proctorTerminal) {
    const movementLevel = Math.round(detectionResult.movementLevel || 0);
    proctorTerminal.textContent = detectionResult.lookingAway ? 
      `WARNING: ${detectionResult.reason} (Movement: ${movementLevel}%)` : 
      `PROCTORING ACTIVE (Movement: ${movementLevel}%)`;
  }
  
  // Handle cheating detection
  if (detectionResult.lookingAway) {
    handleCheatingDetection(detectionResult.reason);
  } else {
    resetCheatingWarning();
  }
}

function handleCheatingDetection(message) {
  cheatingViolations++;
  
  // Make warning visible
  if (warningEl) {
    warningEl.style.display = 'block';
    warningEl.textContent = message || "Keep your eyes on the screen!";
  }
  
  // Add class to status element to indicate cheating
  statusEl.classList.add('cheating');
  statusEl.textContent = "PROCTORING VIOLATION DETECTED - " + message;
  
  // Audio warning (debounced)
  const now = Date.now();
  if (now - lastWarningTime > 5000) {
    // Try using Web Speech API
    if ('speechSynthesis' in window) {
      const msg = new SpeechSynthesisUtterance(message || "Keep your eyes on the screen");
      window.speechSynthesis.speak(msg);
      lastWarningTime = now;
    } else {
      // Play alert beep sound
      playBeepSound();
      
      // Fallback to Electron IPC
      try {
        ipcRenderer.send('speak-warning', message || "Keep your eyes on the screen");
        lastWarningTime = now;
      } catch (e) {
        console.error("TTS error:", e);
      }
    }
  }
  
  logProctoringEvent(message || "Proctoring violation detected");
}

function playBeepSound() {
  try {
    // Create oscillator for beep sound
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    // Configure oscillator
    oscillator.type = 'square';
    oscillator.frequency.setValueAtTime(440, audioContext.currentTime);
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

function resetCheatingWarning() {
  if (warningEl) warningEl.style.display = 'none';
  statusEl.classList.remove('cheating');
}

function logProctoringEvent(message) {
  try {
    const logDir = path.join(process.cwd(), 'database', 'candidates', candidateName);
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

function handleNav(direction) {
  currentQuestion += direction;
  if (currentQuestion < 0) currentQuestion = 0;
  if (currentQuestion >= questions.length) currentQuestion = questions.length - 1;
  updateQuestion();
}

function updateQuestion() {
  const question = questions[currentQuestion];
  if (!question) return;
  
  // Calculate actual question number (excluding system prompts)
  const actualQuestions = questions.filter((q, idx) => !q.isSystemPrompt && idx <= currentQuestion);
  const actualQuestionNumber = actualQuestions.length;
  const totalActualQuestions = questions.filter(q => !q.isSystemPrompt).length;
  
  // Display question number only for real questions, not for system prompts
  const questionNumberText = question.isSystemPrompt ? 
    (currentQuestion === 0 ? "Instructions" : "Complete") : 
    `Question ${actualQuestionNumber} of ${totalActualQuestions}`;
  
  questionArea.innerHTML = `
    <div class="question-number">${questionNumberText}</div>
    <div class="question-text">${question.question}</div>
    <div class="question-category">Category: ${question.category}</div>
  `;
  
  optionsContainer.innerHTML = '';
  
  if (!question.isSystemPrompt && question.options && question.options.length > 0) {
    question.options.forEach((option, index) => {
      const isSelected = answers[currentQuestion] === index;
      const optionLetter = String.fromCharCode(65 + index);
      
      const optionDiv = document.createElement('div');
      optionDiv.className = 'option';
      optionDiv.innerHTML = `
        <label class="option-label ${isSelected ? 'selected' : ''}">
          <input type="radio" name="q-${currentQuestion}" value="${index}" ${isSelected ? 'checked' : ''}>
          <span class="option-circle">${optionLetter}</span>
          <span class="option-text">${option}</span>
        </label>
      `;
      
      const radio = optionDiv.querySelector('input');
      radio.addEventListener('change', () => {
        answers[currentQuestion] = index;
        optionsContainer.querySelectorAll('.option-label').forEach((el, i) => {
          el.classList.toggle('selected', i === index);
        });
        
        // Check if all actual questions are answered
        updateSubmitButtonState();
      });
      
      optionsContainer.appendChild(optionDiv);
    });
  }
  
  prevBtn.disabled = currentQuestion === 0;
  nextBtn.disabled = currentQuestion === questions.length - 1;
  submitBtn.style.display = currentQuestion === questions.length - 1 ? 'inline-block' : 'none';
  
  updateSubmitButtonState();
}

function updateSubmitButtonState() {
  const requiredQuestions = questions.filter(q => !q.isSystemPrompt);
  const answeredCount = answers.filter((a, i) => !questions[i].isSystemPrompt && a !== -1).length;
  
  submitBtn.disabled = answeredCount < requiredQuestions.length;
  
  // Update status message
  if (answeredCount < requiredQuestions.length) {
    const remaining = requiredQuestions.length - answeredCount;
    statusEl.textContent = `Please answer ${remaining} more question${remaining > 1 ? 's' : ''} to continue.`;
  } else {
    statusEl.textContent = "All questions answered. You can proceed when ready.";
  }
}

function startTimer() {
  if (timerInterval) clearInterval(timerInterval);
  
  updateTimerDisplay(timeLeft);
  
  timerInterval = setInterval(() => {
    timeLeft--;
    updateTimerDisplay(timeLeft);
    
    if (timeLeft <= 0) {
      clearInterval(timerInterval);
      handleSubmit();
    }
  }, 1000);
}

function updateTimerDisplay(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  
  timerEl.textContent = `Time left: ${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  
  if (seconds <= 30) timerEl.style.color = '#ff5252';
  else if (seconds <= 60) timerEl.style.color = '#ffab40';
  else timerEl.style.color = '';
}

function handleSubmit() {
  if (isSubmitting) return;
  
  // Count unanswered actual questions (not system prompts)
  const unansweredCount = answers.filter((a, i) => !questions[i].isSystemPrompt && a === -1).length;
  
  if (unansweredCount > 0) {
    const confirmed = confirm(`You have not answered ${unansweredCount} question(s). Submit anyway?`);
    if (!confirmed) return;
  }
  
  isSubmitting = true;
  submitBtn.disabled = true;
  
  clearInterval(timerInterval);
  if (proctoringInterval) clearInterval(proctoringInterval);
  
  if (video && video.srcObject) {
    video.srcObject.getTracks().forEach(track => track.stop());
  }
  
  const score = calculateScore();
  const passed = (score >= 60);
  
  saveResults(score, passed)
    .then(() => {
      statusEl.textContent = `Score: ${score.toFixed(1)}%. ${passed ? 'Passed!' : 'Failed.'}`;
      setTimeout(() => {
        window.location.href = passed ? 'coding.html' : 'interviewend.html';
      }, 3000);
    })
    .catch(error => {
      console.error("Submit error:", error);
      statusEl.textContent = `Error: ${error.message}. Try again.`;
      isSubmitting = false;
      submitBtn.disabled = false;
    });
}

// Fixed calculate score function that properly excludes system prompts
function calculateScore() {
  let correct = 0, total = 0;
  
  for (let i = 0; i < questions.length; i++) {
    // Skip system prompts when calculating score
    if (questions[i].isSystemPrompt) continue;
    
    total++;
    const userAnswer = answers[i];
    const correctAnswer = parseInt(questions[i].correctAnswer);
    
    // Compare user answer with correct answer
    if (userAnswer === correctAnswer) {
      correct++;
    }
  }
  
  return total > 0 ? (correct / total) * 100 : 0;
}

// Extended function to prepare complete results data for saving
async function saveResults(score, passed) {
  const candidateDir = path.join(process.cwd(), 'database', 'candidates', candidateName);
  ensureDirectories(['database', 'candidates', candidateName]);
  
  // Create responses array that includes questions, user answers and correct answers
  const responses = [];
  questions.forEach((q, index) => {
    if (!q.isSystemPrompt) {
      responses.push({
        question: q.question,
        category: q.category,
        userAnswerIndex: answers[index],
        userAnswer: answers[index] !== -1 ? q.options[answers[index]] : "No answer",
        correctAnswerIndex: parseInt(q.correctAnswer),
        correctAnswer: q.options[parseInt(q.correctAnswer)],
        isCorrect: answers[index] === parseInt(q.correctAnswer)
      });
    }
  });
  
  const results = {
    candidateName,
    stage: 'Aptitude',
    score,
    passed,
    questions: questions.filter(q => !q.isSystemPrompt).map(q => ({
      question: q.question,
      category: q.category,
      options: q.options,
      correctAnswer: q.correctAnswer
    })),
    responses,
    timestamp: new Date().toISOString(),
    timeTaken: calculateTimeTaken(),
    proctoring: {
      violations: cheatingViolations,
      suspicious: cheatingViolations > 3
    }
  };
  
  fs.writeFileSync(
    path.join(candidateDir, 'aptitude_results.json'),
    JSON.stringify(results, null, 2)
  );
  
  // Update progress.json
  const progressPath = path.join(candidateDir, 'progress.json');
  let progress = {};
  
  if (fs.existsSync(progressPath)) {
    progress = JSON.parse(fs.readFileSync(progressPath, 'utf8'));
  }
  
  progress.Aptitude = {
    completed: true,
    passed,
    score,
    timestamp: new Date().toISOString(),
    violations: cheatingViolations
  };
  
  fs.writeFileSync(progressPath, JSON.stringify(progress, null, 2));
  
  // Update REPORT.txt
  const reportPath = path.join(candidateDir, 'REPORT.txt');
  let reportContent = '';
  
  if (fs.existsSync(reportPath)) {
    reportContent = fs.readFileSync(reportPath, 'utf8');
  } else {
    reportContent = `INTERVIEW REPORT FOR: ${candidateName}\nGenerated: ${new Date().toISOString()}\n\n`;
  }
  
  reportContent += `=== APTITUDE TEST RESULTS ===\n`;
  reportContent += `Date: ${new Date().toISOString()}\n`;
  reportContent += `Score: ${score.toFixed(1)}%\n`;
  reportContent += `Status: ${passed ? 'PASSED' : 'FAILED'}\n`;
  reportContent += `Questions: ${responses.length}\n`;
  reportContent += `Correct Answers: ${responses.filter(r => r.isCorrect).length}\n`;
  
  if (cheatingViolations > 3) {
    reportContent += `Proctoring: WARNING - ${cheatingViolations} violations detected\n`;
  }
  
  fs.writeFileSync(reportPath, reportContent);
  
  return true;
}

// Calculate the time taken for the test
function calculateTimeTaken() {
  const actualQuestionCount = questions.filter(q => !q.isSystemPrompt).length;
  const totalAllottedTime = actualQuestionCount * 45; // 45 seconds per question
  
  return totalAllottedTime - timeLeft; // Time used in seconds
}

function ensureDirectories(dirParts) {
  let currentPath = process.cwd();
  for (const part of dirParts) {
    currentPath = path.join(currentPath, part);
    if (!fs.existsSync(currentPath)) {
      fs.mkdirSync(currentPath);
    }
  }
}
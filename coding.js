// coding.js - With fixed in-browser proctoring (no external server)
const fs = require('fs');
const path = require('path');
const { ipcRenderer } = require('electron');

// Application state with hardcoded questions (key to working solution)
const state = {
  candidateName: localStorage.getItem('candidateName') || 'Unknown',
  candidateId: localStorage.getItem('candidateId') || 'unknown',
  questions: [
    {
      question: "Write a function that finds the maximum value in an array.",
      category: "Arrays",
      testCases: ["[1, 2, 3, 4, 5]", "[5, 4, 3, 2, 1]", "[-1, -5, -10, -2]"],
      expectedOutput: ["5", "5", "-1"],
      answerTime: 600
    },
    {
      question: "Implement a function that returns the Fibonacci sequence up to n numbers.",
      category: "Algorithms",
      testCases: ["5", "8", "10"],
      expectedOutput: ["[0, 1, 1, 2, 3]", "[0, 1, 1, 2, 3, 5, 8, 13]", "[0, 1, 1, 2, 3, 5, 8, 13, 21, 34]"],
      answerTime: 600
    },
    {
      question: "Write a function to check if a given string is a palindrome.",
      category: "Strings",
      testCases: ["racecar", "hello", "A man, a plan, a canal: Panama"],
      expectedOutput: ["true", "false", "true"],
      answerTime: 600
    }
  ],
  currentQuestionIndex: 0,
  answers: [],
  timeLeft: 600,
  timerInterval: null,
  editor: null,
  
  // Proctoring state
  proctoring: {
    active: false,
    cameraStream: null,
    proctoringInterval: null,
    lastWarningTime: 0,
    warningCount: 0,
    consecutiveWarnings: 0,
    lastCheckTime: 0,
    beepSound: null,
    lookingAway: false,
    screenshots: []
  },
  
  solutionsSubmitted: 0
};

// DOM elements
const elements = {};

// Get DOM elements after DOM is fully loaded
function initElements() {
  try {
    elements.timer = document.getElementById('timer');
    elements.statusMessage = document.getElementById('statusMessage');
    elements.questionCounter = document.getElementById('questionCounter');
    elements.problemTitle = document.getElementById('problemTitle');
    elements.problemDescription = document.getElementById('problemDescription');
    elements.exampleCases = document.getElementById('exampleCases');
    elements.editorContainer = document.getElementById('editorContainer');
    elements.languageSelect = document.getElementById('languageSelect');
    elements.prevBtn = document.getElementById('prevBtn');
    elements.nextBtn = document.getElementById('nextBtn');
    elements.submitBtn = document.getElementById('submitBtn');
    
    // Create or get proctoring elements
    setupProctoringElements();
  } catch (error) {
    console.error("Error initializing elements:", error);
  }
}

// Setup proctoring elements
function setupProctoringElements() {
  // Create container for proctoring elements if it doesn't exist
  if (!document.getElementById('proctoringContainer')) {
    // Create main container
    const container = document.createElement('div');
    container.id = 'proctoringContainer';
    container.className = 'proctoring-container';
    
    // Add container header for drag functionality
    const header = document.createElement('div');
    header.id = 'proctoringHeader';
    header.className = 'proctoring-header';
    header.innerHTML = `
      <div class="proctoring-title">Proctoring</div>
      <div class="proctoring-controls">
        <button id="minimizeProctoring" class="proctoring-button">−</button>
        <button id="closeProctoring" class="proctoring-button">×</button>
      </div>
    `;
    container.appendChild(header);
    
    // Create video container
    const videoContainer = document.createElement('div');
    videoContainer.id = 'proctoringVideoContainer';
    videoContainer.className = 'proctoring-video-container';
    
    // Create video element
    const video = document.createElement('video');
    video.id = 'cameraPreview';
    video.autoplay = true;
    video.playsInline = true;
    videoContainer.appendChild(video);
    
    // Create canvas overlay
    const canvas = document.createElement('canvas');
    canvas.id = 'overlayCanvas';
    videoContainer.appendChild(canvas);
    
    // Hidden canvas for processing
    const hiddenCanvas = document.createElement('canvas');
    hiddenCanvas.id = 'hiddenCanvas';
    hiddenCanvas.style.display = 'none';
    videoContainer.appendChild(hiddenCanvas);
    
    // Add video container to main container
    container.appendChild(videoContainer);
    
    // Create status indicator
    const statusIndicator = document.createElement('div');
    statusIndicator.id = 'proctoringStatus';
    statusIndicator.className = 'proctoring-status';
    statusIndicator.innerHTML = 'Initializing...';
    container.appendChild(statusIndicator);
    
    // Add container to body
    document.body.appendChild(container);
    
    // Create warning element
    const warning = document.createElement('div');
    warning.id = 'proctoringWarning';
    warning.className = 'proctoring-warning';
    warning.textContent = 'LOOK AT THE SCREEN. KEEP YOUR EYES ON THE SCREEN.';
    document.body.appendChild(warning);
    
    // Create debug info container (hidden by default)
    const debugInfo = document.createElement('div');
    debugInfo.id = 'debugInfo';
    debugInfo.className = 'debug-info';
    document.body.appendChild(debugInfo);
    
    // Add styles for proctoring elements
    addProctoringStyles();
    
    // Setup draggable functionality
    setupDraggable();
    
    // Setup minimize/close buttons
    document.getElementById('minimizeProctoring').addEventListener('click', function() {
      const videoContainer = document.getElementById('proctoringVideoContainer');
      if (videoContainer.style.display === 'none') {
        videoContainer.style.display = 'block';
        this.textContent = '−';
      } else {
        videoContainer.style.display = 'none';
        this.textContent = '+';
      }
    });
    
    document.getElementById('closeProctoring').addEventListener('click', function() {
      const container = document.getElementById('proctoringContainer');
      container.style.display = 'none';
      
      // Add restore button
      if (!document.getElementById('restoreProctoring')) {
        const restoreBtn = document.createElement('button');
        restoreBtn.id = 'restoreProctoring';
        restoreBtn.className = 'restore-proctoring-button';
        restoreBtn.textContent = 'Show Proctoring';
        restoreBtn.addEventListener('click', function() {
          container.style.display = 'block';
          this.remove();
        });
        document.body.appendChild(restoreBtn);
      }
    });
  }
  
  // Store elements in the elements object
  elements.proctoringContainer = document.getElementById('proctoringContainer');
  elements.proctoringVideoContainer = document.getElementById('proctoringVideoContainer');
  elements.cameraPreview = document.getElementById('cameraPreview');
  elements.overlayCanvas = document.getElementById('overlayCanvas');
  elements.hiddenCanvas = document.getElementById('hiddenCanvas');
  elements.proctoringStatus = document.getElementById('proctoringStatus');
  elements.proctoringWarning = document.getElementById('proctoringWarning');
  elements.debugInfo = document.getElementById('debugInfo');
}

// Add CSS styles for proctoring elements
function addProctoringStyles() {
  const style = document.createElement('style');
  style.textContent = `
    .proctoring-container {
      position: fixed;
      right: 20px;
      bottom: 80px; /* Positioned higher to avoid submit button */
      width: 220px;
      background-color: #1e1e1e;
      border: 1px solid #333;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
      z-index: 1000;
      overflow: hidden;
      resize: both;
      min-width: 200px;
      min-height: 150px;
    }
    
    .proctoring-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      background-color: #2563eb;
      padding: 5px 10px;
      cursor: move;
      color: white;
      font-weight: bold;
      font-size: 12px;
    }
    
    .proctoring-controls {
      display: flex;
      gap: 5px;
    }
    
    .proctoring-button {
      background: none;
      border: none;
      color: white;
      cursor: pointer;
      font-size: 14px;
      width: 20px;
      height: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 3px;
    }
    
    .proctoring-button:hover {
      background-color: rgba(255, 255, 255, 0.2);
    }
    
    .proctoring-video-container {
      position: relative;
      width: 100%;
      height: 165px;
      overflow: hidden;
    }
    
    #cameraPreview {
      width: 100%;
      height: 100%;
      object-fit: cover;
      background-color: #000;
    }
    
    #overlayCanvas {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
    }
    
    .proctoring-status {
      padding: 5px 10px;
      background-color: #333;
      color: #fff;
      font-size: 11px;
      text-align: center;
    }
    
    .proctoring-warning {
      position: fixed;
      top: 10px;
      left: 50%;
      transform: translateX(-50%);
      background-color: rgba(220, 20, 20, 0.9);
      color: white;
      padding: 10px 20px;
      border-radius: 5px;
      font-weight: bold;
      z-index: 2000;
      box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);
      display: none;
      animation: pulse 1s infinite alternate;
    }
    
    .debug-info {
      position: fixed;
      left: 20px;
      bottom: 20px;
      width: 220px;
      background-color: rgba(0, 0, 0, 0.7);
      color: #0f0;
      padding: 10px;
      font-size: 10px;
      font-family: monospace;
      border-radius: 5px;
      z-index: 1000;
      display: none;
      max-height: 200px;
      overflow-y: auto;
    }
    
    .restore-proctoring-button {
      position: fixed;
      right: 20px;
      bottom: 20px;
      background-color: #2563eb;
      color: white;
      border: none;
      border-radius: 5px;
      padding: 8px 16px;
      cursor: pointer;
      z-index: 1000;
      font-size: 12px;
    }
    
    @keyframes pulse {
      from {
        transform: translateX(-50%) scale(1);
      }
      to {
        transform: translateX(-50%) scale(1.05);
      }
    }
  `;
  document.head.appendChild(style);
}

// Setup draggable functionality
function setupDraggable() {
  const container = document.getElementById('proctoringContainer');
  const header = document.getElementById('proctoringHeader');
  
  let isDragging = false;
  let offsetX, offsetY;
  
  header.addEventListener('mousedown', function(e) {
    isDragging = true;
    offsetX = e.clientX - container.getBoundingClientRect().left;
    offsetY = e.clientY - container.getBoundingClientRect().top;
    
    // Add dragging class
    container.classList.add('dragging');
  });
  
  document.addEventListener('mousemove', function(e) {
    if (!isDragging) return;
    
    // Calculate new position
    const x = e.clientX - offsetX;
    const y = e.clientY - offsetY;
    
    // Keep within window bounds
    const maxX = window.innerWidth - container.offsetWidth;
    const maxY = window.innerHeight - container.offsetHeight;
    
    const boundedX = Math.max(0, Math.min(x, maxX));
    const boundedY = Math.max(0, Math.min(y, maxY));
    
    // Update position
    container.style.left = boundedX + 'px';
    container.style.top = boundedY + 'px';
    
    // Remove default right/bottom positioning when we start dragging
    if (container.style.right) {
      container.style.right = '';
    }
    if (container.style.bottom) {
      container.style.bottom = '';
    }
  });
  
  document.addEventListener('mouseup', function() {
    isDragging = false;
    container.classList.remove('dragging');
  });
}

// Set status message
function setStatus(message, type = null) {
  console.log(`Status: ${message} (${type || 'info'})`);
  if (!elements.statusMessage) return;
  elements.statusMessage.textContent = message;
  elements.statusMessage.className = 'status-message';
  if (type) elements.statusMessage.classList.add(type);
}

// Set proctoring status
function setProctoringStatus(message, isError = false) {
  if (!elements.proctoringStatus) return;
  elements.proctoringStatus.textContent = message;
  if (isError) {
    elements.proctoringStatus.style.backgroundColor = '#ef4444';
  } else {
    elements.proctoringStatus.style.backgroundColor = '#333';
  }
}

// Create a simple beep sound using AudioContext
function createBeepSound() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return null;
    
    const audioCtx = new AudioContext();
    
    return {
      play: function() {
        try {
          // Create oscillator and gain nodes
          const oscillator = audioCtx.createOscillator();
          const gainNode = audioCtx.createGain();
          
          // Set properties
          oscillator.type = 'sine';
          oscillator.frequency.value = 800;
          gainNode.gain.value = 0.3;
          
          // Connect nodes
          oscillator.connect(gainNode);
          gainNode.connect(audioCtx.destination);
          
          // Start and stop after 300ms
          oscillator.start();
          setTimeout(() => {
            oscillator.stop();
          }, 300);
          
          return true;
        } catch (err) {
          console.error("Beep play error:", err);
          return false;
        }
      }
    };
  } catch (err) {
    console.error("Beep creation error:", err);
    return null;
  }
}

// Initialize Ace editor
function initEditor() {
  try {
    if (!elements.editorContainer) throw new Error("Editor container not found");
    if (!window.ace) throw new Error("Ace Editor not loaded");
    
    elements.editorContainer.innerHTML = '<div id="ace-editor" style="width:100%;height:100%;"></div>';
    
    state.editor = ace.edit("ace-editor");
    state.editor.setTheme("ace/theme/monokai");
    state.editor.session.setMode("ace/mode/javascript");
    state.editor.setOptions({
      fontSize: "14px",
      showPrintMargin: false,
      enableBasicAutocompletion: true,
      enableLiveAutocompletion: true
    });
    
    state.editor.setValue(getCodeTemplate("javascript"));
    state.editor.clearSelection();
    
    if (elements.languageSelect) {
      elements.languageSelect.addEventListener('change', () => {
        saveCurrentCode();
        const language = elements.languageSelect.value;
        const modeMap = {
          "javascript": "ace/mode/javascript",
          "python": "ace/mode/python",
          "clike": "ace/mode/c_cpp"
        };
        state.editor.session.setMode(modeMap[language] || "ace/mode/text");
        
        const code = state.editor.getValue().trim();
        if (!code || code.includes('Write your solution here')) {
          state.editor.setValue(getCodeTemplate(language));
          state.editor.clearSelection();
        }
      });
    }
    
    return true;
  } catch (error) {
    console.error("Editor init error:", error);
    
    if (elements.editorContainer) {
      elements.editorContainer.innerHTML = `<textarea id="fallback-editor"></textarea>`;
      const fallbackEditor = document.getElementById('fallback-editor');
      fallbackEditor.value = getCodeTemplate("javascript");
      
      state.editor = {
        getValue: () => fallbackEditor.value,
        setValue: (val) => { fallbackEditor.value = val; },
        clearSelection: () => {}
      };
      
      if (elements.languageSelect) {
        elements.languageSelect.addEventListener('change', () => {
          saveCurrentCode();
          const language = elements.languageSelect.value;
          const code = fallbackEditor.value.trim();
          if (!code || code.includes('Write your solution here')) {
            fallbackEditor.value = getCodeTemplate(language);
          }
        });
      }
    }
    
    return false;
  }
}

// Get code template for language
function getCodeTemplate(language) {
  const templates = {
    javascript: `/**
 * @param {*} input - The input for this problem
 * @return {*} - The expected output
 */
function solution(input) {
  // Write your solution here
  
  return null;
}

module.exports = solution;`,
    python: `def solution(input):
    """
    :param input: The input for this problem
    :return: The expected output
    """
    # Write your solution here
    
    return None`,
    clike: `#include <iostream>
#include <vector>
#include <string>

/**
 * @param input The input for this problem
 * @return The expected output
 */
auto solution(auto input) {
    // Write your solution here
    
    return nullptr;
}`
  };
  
  return templates[language] || '// Write your solution here';
}

// Save current code
function saveCurrentCode() {
  if (!state.editor) return;
  
  const currentAnswer = state.answers[state.currentQuestionIndex];
  if (currentAnswer) {
    currentAnswer.code = state.editor.getValue();
    currentAnswer.language = elements.languageSelect ? elements.languageSelect.value : 'javascript';
  }
}

// Initialize answers
function initAnswers() {
  state.answers = state.questions.map(() => ({
    code: '',
    language: elements.languageSelect ? elements.languageSelect.value : 'javascript',
    submitted: false,
    evaluated: false,
    results: null
  }));
}

// Update question display
function updateQuestion() {
  if (!state.questions.length) return;
  
  const question = state.questions[state.currentQuestionIndex];
  
  // Update UI
  if (elements.problemTitle) elements.problemTitle.textContent = `Question ${state.currentQuestionIndex + 1}`;
  if (elements.problemDescription) elements.problemDescription.textContent = question.question;
  if (elements.questionCounter) elements.questionCounter.textContent = `Question ${state.currentQuestionIndex + 1} of ${state.questions.length}`;
  
  // Update examples
  if (elements.exampleCases) {
    let casesHTML = '';
    if (question.testCases && question.testCases.length > 0) {
      question.testCases.forEach((testCase, index) => {
        const expectedOutput = question.expectedOutput?.[index] || 'Output not provided';
        casesHTML += `
          <div class="test-case">
            <div class="test-case-title">
              <span>Test Case ${index + 1}</span>
            </div>
            <div class="test-case-content">
              <strong>Input:</strong> ${testCase}
            </div>
            <div class="test-case-content">
              <strong>Expected Output:</strong> ${expectedOutput}
            </div>
          </div>
        `;
      });
    } else {
      casesHTML = '<p>No example test cases available for this problem.</p>';
    }
    elements.exampleCases.innerHTML = casesHTML;
  }
  
  // Update editor content
  if (state.editor) {
    const currentAnswer = state.answers[state.currentQuestionIndex];
    if (currentAnswer?.code) {
      state.editor.setValue(currentAnswer.code);
    } else {
      const language = elements.languageSelect ? elements.languageSelect.value : 'javascript';
      state.editor.setValue(getCodeTemplate(language));
    }
    state.editor.clearSelection();
  }
  
  // Update navigation buttons
  if (elements.prevBtn) elements.prevBtn.disabled = state.currentQuestionIndex === 0;
  if (elements.nextBtn) elements.nextBtn.disabled = state.currentQuestionIndex === state.questions.length - 1;
  
  // Update timer
  state.timeLeft = question.answerTime || 600;
  updateTimerDisplay();
}

// Update timer display
function updateTimerDisplay() {
  if (!elements.timer) return;
  
  const minutes = Math.floor(state.timeLeft / 60);
  const seconds = state.timeLeft % 60;
  elements.timer.textContent = `Time left: ${minutes}:${seconds.toString().padStart(2, '0')}`;
  
  elements.timer.classList.remove('warning', 'urgent');
  if (state.timeLeft <= 120) {
    elements.timer.classList.add('urgent');
  } else if (state.timeLeft <= 300) {
    elements.timer.classList.add('warning');
  }
}

// Start timer
function startTimer() {
  if (state.timerInterval) clearInterval(state.timerInterval);
  
  updateTimerDisplay();
  
  state.timerInterval = setInterval(() => {
    state.timeLeft--;
    
    if (state.timeLeft <= 0) {
      clearInterval(state.timerInterval);
      setStatus('Time is up! Please submit your solution.', 'warning');
      if (elements.submitBtn) elements.submitBtn.disabled = false;
    } else {
      updateTimerDisplay();
    }
  }, 1000);
}

// Navigation handlers
function handlePrevious() {
  saveCurrentCode();
  state.currentQuestionIndex--;
  updateQuestion();
}

function handleNext() {
  saveCurrentCode();
  state.currentQuestionIndex++;
  updateQuestion();
}

// Log events to file
function logEvent(message) {
  try {
    const logDir = path.join(process.cwd(), 'database', 'candidates', state.candidateName);
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
    
    const logPath = path.join(logDir, 'assessment.log');
    fs.appendFileSync(logPath, `${new Date().toISOString()}: ${message}\n`);
  } catch (err) {
    console.error("Log error:", err);
  }
}

// Log cheating event specifically
function logCheatingEvent(details) {
  try {
    const logDir = path.join(process.cwd(), 'database', 'candidates', state.candidateName);
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
    
    const cheatingLogPath = path.join(logDir, 'cheating_log.txt');
    fs.appendFileSync(cheatingLogPath, `${new Date().toISOString()}: ${details}\n`);
    console.log(`Cheating logged: ${details}`);
  } catch (err) {
    console.error("Cheating log error:", err);
  }
}

// Submit solution
async function handleSubmit() {
  saveCurrentCode();
  setStatus("Submitting solution...");
  
  const currentAnswer = state.answers[state.currentQuestionIndex];
  currentAnswer.submitted = true;
  
  try {
    // Create save directory
    const savePath = path.join(process.cwd(), 'database', 'candidates', state.candidateName, 'coding');
    if (!fs.existsSync(savePath)) fs.mkdirSync(savePath, { recursive: true });
    
    // Save code file
    const extension = currentAnswer.language === 'python' ? '.py' : 
                     currentAnswer.language === 'clike' ? '.cpp' : '.js';
    const filePath = path.join(savePath, `question_${state.currentQuestionIndex + 1}${extension}`);
    fs.writeFileSync(filePath, currentAnswer.code);
    
    // Save to combined results file
    const combinedResultsPath = path.join(savePath, 'coding_results.txt');
    const resultText = `
=================== QUESTION ${state.currentQuestionIndex + 1} ===================
${state.questions[state.currentQuestionIndex].question}

------------------------ CODE (${currentAnswer.language}) ------------------------
${currentAnswer.code}

------------------------ TEST CASES ------------------------
${state.questions[state.currentQuestionIndex].testCases.map((test, i) => 
  `Test ${i+1}: ${test}\nExpected: ${state.questions[state.currentQuestionIndex].expectedOutput[i] || 'Not specified'}`
).join('\n')}

------------------------ SUBMITTED: ${new Date().toISOString()} ------------------------
`;
    fs.appendFileSync(combinedResultsPath, resultText);
    
    // Try to do evaluation if available
    if (currentAnswer.language === 'javascript') {
      try {
        const evaluation = await ipcRenderer.invoke('evaluate-code-with-gemini', {
          code: currentAnswer.code,
          language: currentAnswer.language,
          question: state.questions[state.currentQuestionIndex].question,
          testCases: state.questions[state.currentQuestionIndex].testCases,
          expectedOutputs: state.questions[state.currentQuestionIndex].expectedOutput || []
        });
        
        if (evaluation && evaluation.success) {
          currentAnswer.evaluated = true;
          currentAnswer.results = evaluation.results;
          
          // Update the results file with evaluation
          const evaluationText = `
------------------------ EVALUATION RESULTS ------------------------
${evaluation.results.map(r => 
  `Test: ${r.testCase}
Expected: ${r.expectedOutput}
Actual: ${r.actualOutput}
Passed: ${r.passed ? 'YES' : 'NO'}${r.error ? `\nError: ${r.error}` : ''}`
).join('\n\n')}

Overall: ${evaluation.results.filter(r => r.passed).length}/${evaluation.results.length} tests passed
`;
          fs.appendFileSync(combinedResultsPath, evaluationText);
        }
      } catch (evalError) {
        console.error("Evaluation error:", evalError);
      }
    }
    
    logEvent(`Submitted solution for question ${state.currentQuestionIndex + 1}`);
    state.solutionsSubmitted++;
    
    // Move to next question or finish
    if (state.currentQuestionIndex < state.questions.length - 1) {
      state.currentQuestionIndex++;
      updateQuestion();
      setStatus("Solution submitted! Moving to next question.", 'success');
    } else {
      // All questions answered
      setStatus("All solutions submitted! Assessment complete.", 'success');
      
      if (elements.prevBtn) elements.prevBtn.disabled = true;
      if (elements.nextBtn) elements.nextBtn.disabled = true;
      if (elements.submitBtn) elements.submitBtn.disabled = true;
      
      // Create report file
      await createCodingReport();
      
      // Clean up proctoring
      stopProctoring();
      
      // Redirect to interview after 3 seconds
      setTimeout(() => {
        window.location.href = 'interview.html';
      }, 3000);
    }
  } catch (error) {
    console.error("Error submitting:", error);
    setStatus(`Error: ${error.message}`, 'error');
  }
}

// Create a comprehensive coding report
async function createCodingReport() {
  try {
    // Calculate success metrics
    const testsPassed = state.answers.reduce((total, answer) => {
      if (answer.results) {
        return total + answer.results.filter(r => r.passed).length;
      }
      return total;
    }, 0);
    
    const totalTests = state.answers.reduce((total, answer) => {
      if (answer.results) {
        return total + answer.results.length;
      }
      return total;
    }, 0);
    
    const overallScore = Math.round((testsPassed / (totalTests || 1)) * 100) || 0;
    
    // Generate report
    const reportPath = path.join(process.cwd(), 'database', 'candidates', state.candidateName, 'coding_report.json');
    const report = {
      candidateName: state.candidateName,
      candidateId: state.candidateId,
      stage: 'Coding',
      completedAt: new Date().toISOString(),
      overallScore,
      testsPassed,
      totalTests,
      cheatingIncidents: state.proctoring.warningCount,
      questions: state.questions.map((q, i) => ({
        question: q.question,
        category: q.category,
        solution: state.answers[i].code,
        language: state.answers[i].language,
        testResults: state.answers[i].results
      })),
      passed: true // Always pass to proceed to interview
    };
    
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    
    // Create standard results.json for stage tracking
    const resultsPath = path.join(process.cwd(), 'database', 'candidates', state.candidateName, 'coding_results.json');
    const results = {
      candidateName: state.candidateName,
      candidateId: state.candidateId,
      stage: 'Coding',
      overallScore,
      passed: true,
      timestamp: new Date().toISOString()
    };
    
    fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
    
    // Update candidate progress
    await updateCandidateProgress('Coding', true);
    
    return true;
  } catch (error) {
    console.error("Error creating report:", error);
    return false;
  }
}

// Update candidate progress
async function updateCandidateProgress(stage, passed) {
  try {
    // Update local progress file
    const progressPath = path.join(process.cwd(), 'database', 'candidates', state.candidateName, 'progress.json');
    
    // Create or load progress data
    let progress = {};
    if (fs.existsSync(progressPath)) {
      progress = JSON.parse(fs.readFileSync(progressPath, 'utf8'));
    }
    
    // Update stage status
    progress[stage] = {
      completed: true,
      passed,
      timestamp: new Date().toISOString()
    };
    
    // Save updated progress
    fs.writeFileSync(progressPath, JSON.stringify(progress, null, 2));
    
    // Update localStorage for next pages
    localStorage.setItem('lastStage', stage);
    localStorage.setItem('lastPassed', passed.toString());
    
    return true;
  } catch (error) {
    console.error('Error updating progress:', error);
    return false;
  }
}

// Set up tab navigation
function setupTabs() {
  const tabButtons = document.querySelectorAll('.tab-btn');
  const tabPanes = document.querySelectorAll('.tab-pane');
  
  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      const tabName = button.dataset.tab;
      tabButtons.forEach(btn => btn.classList.remove('active'));
      tabPanes.forEach(pane => pane.classList.remove('active'));
      button.classList.add('active');
      const tabPane = document.getElementById(`${tabName}-tab`);
      if (tabPane) tabPane.classList.add('active');
    });
  });
}

// ===================== Proctoring System Functions =====================

// Initialize camera and proctoring
async function initProctoring() {
  try {
    console.log("Initializing proctoring system...");
    setProctoringStatus("Initializing camera...");
    
    if (!elements.cameraPreview || !elements.overlayCanvas) {
      console.error("Proctoring elements not found");
      setProctoringStatus("Proctoring elements not found", true);
      return false;
    }
    
    // Create beep sound - ensure it's created only once
    if (!state.proctoring.beepSound) {
      state.proctoring.beepSound = createBeepSound();
    }
    
    // Get camera access
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          width: { ideal: 640 },
          height: { ideal: 480 } 
        }, 
        audio: false 
      });
      
      // Set video source
      elements.cameraPreview.srcObject = stream;
      state.proctoring.cameraStream = stream;
      
      // Wait for video to be ready
      await new Promise(resolve => {
        elements.cameraPreview.onloadedmetadata = resolve;
        // Fallback if event doesn't fire
        setTimeout(resolve, 1000);
      });
      
      // Set up canvas
      const canvas = elements.overlayCanvas;
      canvas.width = elements.cameraPreview.clientWidth;
      canvas.height = elements.cameraPreview.clientHeight;
      
      // Setup hidden canvas with willReadFrequently attribute
      const hiddenCanvas = elements.hiddenCanvas || document.createElement('canvas');
      if (!elements.hiddenCanvas) {
        hiddenCanvas.id = 'hiddenCanvas';
        hiddenCanvas.style.display = 'none';
        elements.proctoringVideoContainer.appendChild(hiddenCanvas);
        elements.hiddenCanvas = hiddenCanvas;
      }
      
      hiddenCanvas.width = 160; // Smaller size for processing
      hiddenCanvas.height = 120;
      
      // Set willReadFrequently attribute to avoid performance warnings
      const ctx = hiddenCanvas.getContext('2d', { willReadFrequently: true });
      
      // Add resize handler
      window.addEventListener('resize', () => {
        if (elements.overlayCanvas && elements.cameraPreview) {
          elements.overlayCanvas.width = elements.cameraPreview.clientWidth;
          elements.overlayCanvas.height = elements.cameraPreview.clientHeight;
        }
      });
      
      // Start proctoring
      startProctoring();
      setProctoringStatus("Proctoring active");
      
      // Add proctoring active indicator dot
      const overlay = elements.overlayCanvas;
      const overlayCtx = overlay.getContext('2d');
      overlayCtx.fillStyle = 'green';
      overlayCtx.beginPath();
      overlayCtx.arc(10, 10, 5, 0, Math.PI * 2);
      overlayCtx.fill();
      
      return true;
    } catch (error) {
      console.error("Camera access error:", error);
      setProctoringStatus("Camera access denied", true);
      return false;
    }
  } catch (error) {
    console.error("Proctoring initialization error:", error);
    setProctoringStatus("Initialization error", true);
    return false;
  }
}

// Start proctoring interval
function startProctoring() {
  if (state.proctoring.proctoringInterval) {
    clearInterval(state.proctoring.proctoringInterval);
  }
  
  // Initialize tracking data
  state.proctoring.lastWarningTime = 0;
  state.proctoring.warningCount = 0;
  state.proctoring.consecutiveWarnings = 0;
  state.proctoring.lastCheckTime = Date.now();
  
  // Start periodic checks
  state.proctoring.proctoringInterval = setInterval(checkProctoring, 2000);
  state.proctoring.active = true;
  console.log("Proctoring system active");
  setProctoringStatus("Proctoring active");
}

// Stop proctoring
function stopProctoring() {
  if (state.proctoring.proctoringInterval) {
    clearInterval(state.proctoring.proctoringInterval);
    state.proctoring.proctoringInterval = null;
  }
  
  // Stop camera
  if (state.proctoring.cameraStream) {
    state.proctoring.cameraStream.getTracks().forEach(track => track.stop());
    state.proctoring.cameraStream = null;
  }
  
  // Hide proctoring elements
  if (elements.proctoringWarning) {
    elements.proctoringWarning.style.display = 'none';
  }
  
  state.proctoring.active = false;
  console.log("Proctoring system stopped");
  setProctoringStatus("Proctoring stopped");
}

// Capture screenshot
function captureScreenshot() {
  try {
    if (!elements.cameraPreview || !elements.cameraPreview.videoWidth) {
      return null;
    }
    
    const canvas = document.createElement('canvas');
    canvas.width = elements.cameraPreview.videoWidth;
    canvas.height = elements.cameraPreview.videoHeight;
    
    const ctx = canvas.getContext('2d');
    ctx.drawImage(elements.cameraPreview, 0, 0);
    
    return canvas.toDataURL('image/jpeg', 0.8);
  } catch (error) {
    console.error("Screenshot error:", error);
    return null;
  }
}

// Check if face is in frame using simple skin tone detection
function detectFace() {
  try {
    const video = elements.cameraPreview;
    const canvas = elements.hiddenCanvas;
    
    if (!video || !video.videoWidth || !canvas) {
      return { faceDetected: false, message: "Video not ready" };
    }
    
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    // Draw video to canvas
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    // Get image data
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    
    // Simple skin tone and motion detection
    let skinPixels = 0;
    let totalPixels = data.length / 4;
    let centerPixels = 0;
    let centerSkinPixels = 0;
    
    // Define center region (middle 50% of frame)
    const centerStartX = Math.floor(canvas.width * 0.25);
    const centerEndX = Math.floor(canvas.width * 0.75);
    const centerStartY = Math.floor(canvas.height * 0.25);
    const centerEndY = Math.floor(canvas.height * 0.75);
    
    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        const idx = (y * canvas.width + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        
        // Check if pixel is in center region
        const isCenter = (x >= centerStartX && x <= centerEndX && 
                          y >= centerStartY && y <= centerEndY);
        
        // Simple skin tone detection
        // This is a very basic approach - skin tones vary widely
        const isSkinTone = r > 60 && g > 40 && b > 20 && 
                          r > g && r > b && 
                          r - g > 10;
        
        if (isSkinTone) {
          skinPixels++;
          
          if (isCenter) {
            centerSkinPixels++;
          }
        }
        
        if (isCenter) {
          centerPixels++;
        }
      }
    }
    
    const skinPercentage = (skinPixels / totalPixels) * 100;
    const centerSkinPercentage = (centerSkinPixels / centerPixels) * 100;
    
    // Draw an overlay on the original canvas showing where we detected skin tones
    ctx.fillStyle = 'rgba(0, 255, 0, 0.3)';
    ctx.fillRect(centerStartX, centerStartY, 
                 centerEndX - centerStartX, 
                 centerEndY - centerStartY);
    
    // Criteria for face detection
    // 1. Some minimum percentage of skin tones in the frame
    // 2. Higher concentration of skin tones in the center (where the face typically is)
    const faceDetected = skinPercentage > 5 && centerSkinPercentage > 8;
    
    // Copy analysis results to overlay canvas
    const overlayCtx = elements.overlayCanvas.getContext('2d');
    overlayCtx.clearRect(0, 0, elements.overlayCanvas.width, elements.overlayCanvas.height);
    
    // Draw indicator in corner
    const indicatorSize = 10;
    overlayCtx.fillStyle = faceDetected ? 'green' : 'red';
    overlayCtx.beginPath();
    overlayCtx.arc(indicatorSize, indicatorSize, indicatorSize, 0, Math.PI * 2);
    overlayCtx.fill();
    
    return { 
      faceDetected,
      skinPercentage,
      centerSkinPercentage,
      lookingAway: !faceDetected
    };
  } catch (error) {
    console.error("Face detection error:", error);
    return { faceDetected: false, error: error.message };
  }
}

// Check proctoring with in-browser face detection
function checkProctoring() {
  if (!state.proctoring.active || !elements.cameraPreview) return;
  
  try {
    // Track time between checks to avoid beeping too often
    const now = Date.now();
    const timeSinceLastCheck = now - (state.proctoring.lastCheckTime || 0);
    state.proctoring.lastCheckTime = now;
    
    // Implement simple face detection
    const result = detectFace();
    
    // Handle looking away
    handleEyeTracking(
      result.lookingAway, 
      result.faceDetected ? "Face detected" : "No face detected"
    );
    
    // Update debug info
    if (elements.debugInfo && elements.debugInfo.style.display !== 'none') {
      elements.debugInfo.innerHTML = `<div>
        <p>Status: ${result.faceDetected ? "Face detected" : "No face detected"}</p>
        <p>Skin %: ${result.skinPercentage?.toFixed(1)}%</p>
        <p>Center Skin %: ${result.centerSkinPercentage?.toFixed(1)}%</p>
        <p>Looking Away: ${result.lookingAway}</p>
        <p>Warnings: ${state.proctoring.warningCount}</p>
        <p>Consecutive: ${state.proctoring.consecutiveWarnings}</p>
        <p>Check interval: ${timeSinceLastCheck}ms</p>
      </div>`;
    }
  } catch (error) {
    console.error("Proctoring check error:", error);
    setProctoringStatus("Checking error", true);
  }
}

// Handle eye tracking results
function handleEyeTracking(lookingAway, status) {
  // Update status
  setProctoringStatus(status);
  
  // Update state
  state.proctoring.lookingAway = lookingAway;
  
  // Control consecutive warnings
  if (lookingAway) {
    state.proctoring.consecutiveWarnings++;
  } else {
    state.proctoring.consecutiveWarnings = 0;
  }
  
  // Handle looking away - only trigger warning after consecutive detections
  // to avoid false positives
  if (lookingAway && state.proctoring.consecutiveWarnings >= 2) {
    // Show warning
    if (elements.proctoringWarning) {
      elements.proctoringWarning.style.display = 'block';
      
      // Auto-hide after 3 seconds
      setTimeout(() => {
        if (elements.proctoringWarning) {
          elements.proctoringWarning.style.display = 'none';
        }
      }, 3000);
    }
    
    // Play beep sound with debounce (max once every 5 seconds)
    if (Date.now() - state.proctoring.lastWarningTime > 5000) {
      // Play beep sound using our safe implementation
      if (state.proctoring.beepSound) {
        state.proctoring.beepSound.play();
      }
      
      state.proctoring.lastWarningTime = Date.now();
      state.proctoring.warningCount++;
      
      // Log cheating incident
      logCheatingEvent(`Looking away from screen - incident #${state.proctoring.warningCount}`);
      
      // Capture and save screenshot 
      try {
        const screenshot = captureScreenshot();
        if (screenshot) {
          // Save locally
          const logDir = path.join(process.cwd(), 'database', 'candidates', state.candidateName);
          if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
          
          const screenshotDir = path.join(logDir, 'screenshots');
          if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir, { recursive: true });
          
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
          const screenshotPath = path.join(screenshotDir, `looking_away_${timestamp}.jpg`);
          
          // Convert base64 to binary and save
          try {
            const base64Data = screenshot.replace(/^data:image\/jpeg;base64,/, "");
            fs.writeFileSync(screenshotPath, Buffer.from(base64Data, 'base64'));
          } catch (err) {
            console.error("Screenshot save error:", err);
          }
        }
      } catch (err) {
        console.error("Screenshot error:", err);
      }
    }
  } else {
    // Hide warning when not looking away
    if (elements.proctoringWarning) {
      elements.proctoringWarning.style.display = 'none';
    }
  }
}

// Initialize app
async function init() {
  try {
    // Initialize DOM elements first
    initElements();
    if (!elements.editorContainer) throw new Error("Editor container not found!");
    
    // Set up event listeners
    if (elements.prevBtn) elements.prevBtn.addEventListener('click', handlePrevious);
    if (elements.nextBtn) elements.nextBtn.addEventListener('click', handleNext);
    if (elements.submitBtn) elements.submitBtn.addEventListener('click', handleSubmit);
    
    // Setup tabs
    setupTabs();
    
    // Initialize editor
    const editorInitialized = initEditor();
    
    // Initialize answers
    initAnswers();
    
    // Update question display
    updateQuestion();
    
    // Start timer
    startTimer();
    
    // Initialize proctoring - but don't block main flow if it fails
    initProctoring().catch(error => {
      console.error("Proctoring initialization failed:", error);
      setStatus("Proctoring system not available", "warning");
      setProctoringStatus("Initialization failed", true);
    });
    
    // Log successful initialization
    logEvent("Coding assessment initialized");
    setStatus(editorInitialized ? "Coding assessment ready" : "Editor fallback active", "success");
  } catch (error) {
    console.error("Init error:", error);
    setStatus(`Error initializing: ${error.message}`, 'error');
  }
}

// Wait for DOM before initializing
document.addEventListener('DOMContentLoaded', () => {
  console.log("DOM loaded");
  setTimeout(init, 100);
});

// Error handler
window.addEventListener('error', (e) => {
  console.error("Global error:", e.message);
});

// Debug helper function
window.debugProctoring = function(showDebug = true) {
  if (elements.debugInfo) {
    elements.debugInfo.style.display = showDebug ? 'block' : 'none';
  }
  return {
    active: state.proctoring.active,
    warnings: state.proctoring.warningCount,
    lastWarning: state.proctoring.lastWarningTime ? new Date(state.proctoring.lastWarningTime).toISOString() : 'none',
    cameraReady: !!state.proctoring.cameraStream,
    lookingAway: state.proctoring.lookingAway
  };
};
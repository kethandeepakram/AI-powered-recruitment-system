// aptitude.js - Handles the aptitude test stage
const fs = require('fs');
const path = require('path');
const { ipcRenderer } = require('electron');
const QuestionLoader = require('./QuestionLoader');

// Initialize variables
const candidateName = localStorage.getItem('candidateName') || 'Unknown';
let questions = [];
let currentQuestion = 0;
let answers = [];
let timeLeft = 0;
let timerInterval;
let isSubmitting = false;

// DOM Elements - will be initialized after page load
let timerEl, questionArea, optionsContainer, prevBtn, nextBtn, submitBtn, statusEl;

// Create question loader instance
const questionLoader = new QuestionLoader({ 
  logFunction: (message) => {
    console.log(`[Aptitude] ${message}`);
  }
});

// Wait for DOM to be fully loaded before accessing elements
document.addEventListener('DOMContentLoaded', async function() {
  console.log("DOM loaded - initializing aptitude test");
  
  // Get references to UI elements
  timerEl = document.getElementById('timer');
  questionArea = document.getElementById('questionArea');
  optionsContainer = document.getElementById('optionsContainer');
  prevBtn = document.getElementById('prevBtn');
  nextBtn = document.getElementById('nextBtn');
  submitBtn = document.getElementById('submitBtn');
  statusEl = document.getElementById('status');
  
  if (statusEl) {
    statusEl.textContent = "Loading aptitude questions...";
  }
  
  // Check if candidate has already completed aptitude test
  try {
    const hasCompleted = await checkStageComplete('Aptitude');
    if (hasCompleted) {
      const hasPassed = await checkStagePassed('Aptitude');
      if (hasPassed) {
        window.location.href = 'coding.html';
        return;
      }
      // If failed, show message and redirect to interview end
      statusEl.textContent = "Previous attempt did not meet minimum score. The interview process will end.";
      setTimeout(() => {
        window.location.href = 'interviewend.html';
      }, 3000);
      return;
    }
  } catch (error) {
    console.error("Error checking completion status:", error);
  }
  
  // Load questions
  await loadAptitudeQuestions();
  
  // Initialize answers array
  initializeAnswers();
  
  // Set up test duration - 45 seconds per question (excluding intro/conclusion)
  const actualQuestions = questions.filter(q => !q.isSystemPrompt);
  timeLeft = actualQuestions.length * 45;
  
  // Set up event listeners
  if (prevBtn) prevBtn.addEventListener('click', handlePrev);
  if (nextBtn) nextBtn.addEventListener('click', handleNext);
  if (submitBtn) submitBtn.addEventListener('click', handleSubmit);
  
  // Initialize the test
  updateQuestion();
  startTimer();
  
  console.log("Aptitude test initialized with", actualQuestions.length, "questions");
});

async function loadAptitudeQuestions() {
  try {
    // Load questions using the QuestionLoader
    questions = await questionLoader.loadQuestions('Aptitude', ipcRenderer.invoke);
    
    if (!questions || questions.length === 0) {
      throw new Error('No aptitude questions found');
    }

    // Add introduction and conclusion if not present
    if (!questions.find(q => q.category === 'Introduction')) {
      questions.unshift({
        question: "Welcome to the Aptitude Assessment. You'll need to score at least 60% to pass.",
        category: "Introduction",
        isSystemPrompt: true
      });
    }

    if (!questions.find(q => q.category === 'Conclusion')) {
      questions.push({
        question: "You've reached the end of the aptitude assessment. Click 'Submit Test' to see your results.",
        category: "Conclusion",
        isSystemPrompt: true
      });
    }
    
    if (statusEl) {
      statusEl.textContent = `Loaded ${questions.length - 2} aptitude questions`;
    }
    
    return true;
  } catch (error) {
    console.error("Error loading questions:", error);
    if (statusEl) {
      statusEl.textContent = `Error: ${error.message}`;
    }
    return false;
  }
}

function initializeAnswers() {
  answers = new Array(questions.length).fill(-1); // -1 = unanswered
}

function updateQuestion() {
  if (!questionArea || !optionsContainer) return;
  
  const question = questions[currentQuestion];
  if (!question) return;
  
  // Update question text
  questionArea.innerHTML = `
    <div class="question-number">Question ${currentQuestion + 1} of ${questions.length}</div>
    <div class="question-text">${question.question}</div>
    <div class="question-category">Category: ${question.category}</div>
  `;
  
  // Update options
  optionsContainer.innerHTML = '';
  
  // Only show options for non-system prompts
  if (!question.isSystemPrompt && question.options && question.options.length > 0) {
    question.options.forEach((option, index) => {
      const optionDiv = document.createElement('div');
      optionDiv.className = 'option';
      
      const isSelected = answers[currentQuestion] === index;
      const optionLetter = String.fromCharCode(65 + index); // A, B, C, D...
      
      optionDiv.innerHTML = `
        <label class="option-label ${isSelected ? 'selected' : ''}">
          <input 
            type="radio" 
            name="question-${currentQuestion}" 
            value="${index}" 
            ${isSelected ? 'checked' : ''}
          >
          <span class="option-circle">${optionLetter}</span>
          <span class="option-text">${option}</span>
        </label>
      `;
      
      const radioInput = optionDiv.querySelector('input');
      radioInput.addEventListener('change', () => {
        answers[currentQuestion] = index;
        
        const allOptions = optionsContainer.querySelectorAll('.option-label');
        allOptions.forEach((opt, i) => {
          opt.classList.toggle('selected', i === index);
        });
      });
      
      optionsContainer.appendChild(optionDiv);
    });
  }
  
  // Update navigation buttons
  if (prevBtn) prevBtn.disabled = currentQuestion === 0;
  if (nextBtn) nextBtn.disabled = currentQuestion === questions.length - 1;
  
  // Enable submit if on the last question or if all required questions are answered
  if (submitBtn) {
    if (currentQuestion === questions.length - 1) {
      submitBtn.style.display = 'inline-block';
    } else {
      submitBtn.style.display = currentQuestion > 0 ? 'inline-block' : 'none';
    }
    
    // Check if all required questions are answered
    const requiredQuestions = questions.filter(q => !q.isSystemPrompt);
    const answeredQuestions = answers.filter((a, i) => !questions[i].isSystemPrompt && a !== -1);
    submitBtn.disabled = answeredQuestions.length < requiredQuestions.length;
  }
}

function startTimer() {
  if (timerInterval) clearInterval(timerInterval);
  
  updateTimerDisplay();
  
  timerInterval = setInterval(() => {
    timeLeft--;
    updateTimerDisplay();
    
    if (timeLeft <= 0) {
      clearInterval(timerInterval);
      handleSubmit();
    }
  }, 1000);
}

function updateTimerDisplay() {
  if (!timerEl) return;
  
  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  timerEl.textContent = `Time left: ${minutes}:${seconds.toString().padStart(2, '0')}`;
  
  // Change color based on time remaining
  if (timeLeft <= 30) {
    timerEl.style.color = '#ff5252';
  } else if (timeLeft <= 60) {
    timerEl.style.color = '#ffab40';
  } else {
    timerEl.style.color = '#ffffff';
  }
}

function handlePrev() {
  if (currentQuestion > 0) {
    currentQuestion--;
    updateQuestion();
  }
}

function handleNext() {
  if (currentQuestion < questions.length - 1) {
    currentQuestion++;
    updateQuestion();
  }
}

async function handleSubmit() {
  if (isSubmitting) return;
  
  // Get actual questions (non-system prompts)
  const actualQuestions = questions.filter(q => !q.isSystemPrompt);
  const unansweredQuestions = answers.map((a, i) => ({index: i, answered: a !== -1}))
    .filter(q => !questions[q.index].isSystemPrompt && !q.answered);
  
  if (unansweredQuestions.length > 0) {
    const confirmed = confirm(`You have not answered ${unansweredQuestions.length} question(s). Are you sure you want to submit?`);
    if (!confirmed) return;
  }
  
  isSubmitting = true;
  if (submitBtn) submitBtn.disabled = true;
  
  clearInterval(timerInterval);
  
  const score = calculateScore();
  const minPassingScore = 60;
  const passed = (score >= minPassingScore);
  
  try {
    await saveResults(score, passed);
    
    if (statusEl) {
      statusEl.textContent = `Score: ${score.toFixed(1)}%. ${passed ? 'You have passed!' : 'Minimum required: 60%'}`;
      statusEl.className = passed ? 'status success' : 'status error';
    }
    
    setTimeout(() => {
      if (passed) {
        // If passed, proceed to coding test
        window.location.href = 'coding.html';
      } else {
        // If failed, show popup and redirect to interview end
        alert("Your score is below the required 60%. The interview process will end now.");
        window.location.href = 'interviewend.html';
      }
    }, 3000);
  } catch (error) {
    console.error("Error saving results:", error);
    if (statusEl) {
      statusEl.textContent = `Error: ${error.message}. Please try again.`;
      statusEl.className = 'status error';
    }
    isSubmitting = false;
    if (submitBtn) submitBtn.disabled = false;
  }
}

function calculateScore() {
  let correctAnswers = 0;
  let totalQuestions = 0;
  
  for (let i = 0; i < questions.length; i++) {
    if (questions[i].isSystemPrompt) continue;
    
    totalQuestions++;
    if (answers[i] === parseInt(questions[i].correctAnswer)) {
      correctAnswers++;
    }
  }
  
  return totalQuestions > 0 ? (correctAnswers / totalQuestions) * 100 : 0;
}

async function writeToReport(data) {
  try {
    const candidateDir = path.join(process.cwd(), 'database', 'candidates', candidateName);
    const reportPath = path.join(candidateDir, 'REPORT.txt');
    
    let reportContent = '';
    
    // Check if report file exists
    if (fs.existsSync(reportPath)) {
      reportContent = fs.readFileSync(reportPath, 'utf8');
    }
    
    // Add aptitude test results to report
    reportContent += `\n\n=== APTITUDE TEST RESULTS ===\n`;
    reportContent += `Date: ${new Date().toISOString()}\n`;
    reportContent += `Score: ${data.score.toFixed(1)}%\n`;
    reportContent += `Passed: ${data.passed ? 'Yes' : 'No'}\n\n`;
    
    // Add question details
    reportContent += `Questions:\n`;
    data.questions.forEach((q, i) => {
      const answerIndex = data.answers[questions.findIndex(question => question === q)];
      reportContent += `${i + 1}. ${q.question}\n`;
      reportContent += `   Category: ${q.category}\n`;
      reportContent += `   User Answer: ${answerIndex !== -1 ? String.fromCharCode(65 + answerIndex) + '. ' + q.options[answerIndex] : 'Not answered'}\n`;
      reportContent += `   Correct Answer: ${String.fromCharCode(65 + parseInt(q.correctAnswer))}. ${q.options[parseInt(q.correctAnswer)]}\n`;
      reportContent += `   Result: ${answerIndex === parseInt(q.correctAnswer) ? 'Correct' : 'Incorrect'}\n\n`;
    });
    
    // Write to report file
    fs.writeFileSync(reportPath, reportContent);
    
    return true;
  } catch (error) {
    console.error('Error writing to report:', error);
    return false;
  }
}

async function saveResults(score, passed) {
  try {
    const actualQuestions = questions.filter(q => !q.isSystemPrompt);
    const results = {
      candidateName,
      stage: 'Aptitude',
      score,
      passed,
      answers,
      questions: actualQuestions,
      timestamp: new Date().toISOString()
    };
    
    const candidateDir = path.join(process.cwd(), 'database', 'candidates', candidateName);
    if (!fs.existsSync(candidateDir)) {
      fs.mkdirSync(candidateDir, { recursive: true });
    }
    
    fs.writeFileSync(
      path.join(candidateDir, 'aptitude_results.json'),
      JSON.stringify(results, null, 2)
    );
    
    // Write to REPORT.txt
    await writeToReport(results);
    
    await updateProgress('Aptitude', passed);
    return true;
  } catch (error) {
    console.error('Error saving results:', error);
    throw error;
  }
}

async function updateProgress(stage, passed) {
  try {
    const candidateDir = path.join(process.cwd(), 'database', 'candidates', candidateName);
    const progressPath = path.join(candidateDir, 'progress.json');
    
    let progress = {};
    if (fs.existsSync(progressPath)) {
      progress = JSON.parse(fs.readFileSync(progressPath, 'utf8'));
    }
    
    progress[stage] = {
      completed: true,
      passed,
      timestamp: new Date().toISOString()
    };
    
    fs.writeFileSync(progressPath, JSON.stringify(progress, null, 2));
    return true;
  } catch (error) {
    console.error('Error updating progress:', error);
    throw error;
  }
}

async function checkStageComplete(stage) {
  try {
    const resultsPath = path.join(process.cwd(), 'database', 'candidates', candidateName, `${stage.toLowerCase()}_results.json`);
    return fs.existsSync(resultsPath);
  } catch (error) {
    console.error(`Error checking if ${stage} is complete:`, error);
    return false;
  }
}

async function checkStagePassed(stage) {
  try {
    const resultsPath = path.join(process.cwd(), 'database', 'candidates', candidateName, `${stage.toLowerCase()}_results.json`);
    if (!fs.existsSync(resultsPath)) return false;
    
    const resultsData = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
    return resultsData.passed;
  } catch (error) {
    console.error(`Error checking if ${stage} is passed:`, error);
    return false;
  }
}
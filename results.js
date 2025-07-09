// Enhanced results.js with Supabase sync and detailed data display
const path = require('path');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

// Initialize variables from localStorage
const candidateName = localStorage.getItem('candidateName') || 'Unknown Candidate';
const candidateId = localStorage.getItem('candidateId') || `candidate_${Date.now()}`;

// Supabase configuration
const supabaseUrl = 'https://rwltvffgtbonkijirzwy.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ3bHR2ZmZndGJvbmtpamlyend5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDI0MDkxNjQsImV4cCI6MjA1Nzk4NTE2NH0.QRkmGwUVjaQ2dM5fB9Gj78epGFkMKFnAMF6dKAsJD60';

// Global state for candidate data
const candidateData = {
  aptitude: null,
  coding: null,
  interview: null,
  progress: null
};

document.addEventListener('DOMContentLoaded', async function() {
  console.log("Interview results page loaded");
  
  // Initialize UI skeleton
  initializeUI();
  
  // Load all candidate data
  await loadCandidateData();
  
  // Update UI with loaded data
  updateUI();
  
  // Set up event listeners
  setupEventListeners();
  
  // Sync to Supabase
  syncToSupabase();
});

/**
 * Initialize UI elements before data is loaded
 */
function initializeUI() {
  // Update candidate name in the UI
  const candidateNameElements = document.querySelectorAll('.candidate-name');
  candidateNameElements.forEach(el => {
    el.textContent = candidateName;
  });
  
  // Show loading states
  const loadingElements = document.querySelectorAll('.section-loading');
  loadingElements.forEach(el => {
    el.style.display = 'flex';
  });
  
  // Hide content until loaded
  const contentElements = document.querySelectorAll('.section-content');
  contentElements.forEach(el => {
    el.style.display = 'none';
  });
}

/**
 * Load all candidate data from various result files
 */
async function loadCandidateData() {
  try {
    // Get the candidate directory path (accounting for both absolute and relative paths)
    const candidateDir = getCandidateDirectoryPath();
    console.log(`Loading data from: ${candidateDir}`);
    
    if (!fs.existsSync(candidateDir)) {
      console.error(`Candidate directory not found: ${candidateDir}`);
      showError(`Candidate directory not found: ${candidateDir}`);
      return;
    }
    
    // Load progress.json for overall status
    await loadProgressData(candidateDir);
    
    // Load aptitude results
    await loadAptitudeResults(candidateDir);
    
    // Load coding results
    await loadCodingResults(candidateDir);
    
    // Load interview results
    await loadInterviewResults(candidateDir);
    
    console.log('All candidate data loaded successfully');
  } catch (error) {
    console.error('Error loading candidate data:', error);
    showError(`Error loading data: ${error.message}`);
  }
}

/**
 * Get the candidate directory path, handling both absolute and relative paths
 */
function getCandidateDirectoryPath() {
  // First try the absolute path
  const absolutePath = path.join('D:', 'hrelectron', 'database', 'candidates', candidateName);
  
  // If absolute path exists, use it
  if (fs.existsSync(absolutePath)) {
    return absolutePath;
  }
  
  // Try relative path from current directory
  const relativePath = path.join(process.cwd(), 'database', 'candidates', candidateName);
  
  // If relative path exists, use it
  if (fs.existsSync(relativePath)) {
    return relativePath;
  }
  
  // Try relative path from parent directory (hrelectron)
  const parentPath = path.join(process.cwd(), '..', 'database', 'candidates', candidateName);
  
  // If parent path exists, use it
  if (fs.existsSync(parentPath)) {
    return parentPath;
  }
  
  // Default to the relative path (it will be checked again later)
  return relativePath;
}

/**
 * Load progress data from progress.json
 */
async function loadProgressData(candidateDir) {
  const progressPath = path.join(candidateDir, 'progress.json');
  
  if (fs.existsSync(progressPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(progressPath, 'utf8'));
      candidateData.progress = data;
      console.log('Progress data loaded');
    } catch (error) {
      console.error('Error parsing progress.json:', error);
    }
  } else {
    console.log('progress.json not found');
  }
}

/**
 * Load aptitude test results
 */
async function loadAptitudeResults(candidateDir) {
  const aptitudePath = path.join(candidateDir, 'aptitude_results.json');
  
  if (fs.existsSync(aptitudePath)) {
    try {
      const data = JSON.parse(fs.readFileSync(aptitudePath, 'utf8'));
      candidateData.aptitude = data;
      console.log('Aptitude results loaded');
    } catch (error) {
      console.error('Error parsing aptitude_results.json:', error);
    }
  } else {
    console.log('aptitude_results.json not found');
  }
}

/**
 * Load coding test results
 */
async function loadCodingResults(candidateDir) {
  const codingPath = path.join(candidateDir, 'coding_results.json');
  
  if (fs.existsSync(codingPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(codingPath, 'utf8'));
      candidateData.coding = data;
      console.log('Coding results loaded');
    } catch (error) {
      console.error('Error parsing coding_results.json:', error);
    }
  } else {
    console.log('coding_results.json not found');
  }
}

/**
 * Load interview results and transcripts
 */
async function loadInterviewResults(candidateDir) {
  const interviewPath = path.join(candidateDir, 'interview_results.json');
  
  if (fs.existsSync(interviewPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(interviewPath, 'utf8'));
      candidateData.interview = data;
      console.log('Interview results loaded');
      
      // Also load transcript details if available
      try {
        const transcriptDir = path.join(candidateDir, 'transcripts');
        if (fs.existsSync(transcriptDir)) {
          const transcriptFiles = fs.readdirSync(transcriptDir);
          candidateData.interview.detailedTranscripts = [];
          
          for (const file of transcriptFiles) {
            if (file.endsWith('.json')) {
              const transcriptPath = path.join(transcriptDir, file);
              const transcriptData = JSON.parse(fs.readFileSync(transcriptPath, 'utf8'));
              candidateData.interview.detailedTranscripts.push(transcriptData);
            }
          }
          
          // Sort transcripts by questionIndex
          if (candidateData.interview.detailedTranscripts.length > 0) {
            candidateData.interview.detailedTranscripts.sort((a, b) => 
              a.questionIndex - b.questionIndex
            );
          }
          
          console.log(`Loaded ${candidateData.interview.detailedTranscripts.length} transcript files`);
        }
      } catch (transcriptError) {
        console.error('Error loading transcript details:', transcriptError);
      }
    } catch (error) {
      console.error('Error parsing interview_results.json:', error);
    }
  } else {
    console.log('interview_results.json not found');
  }
}

/**
 * Update UI with loaded data
 */
function updateUI() {
  // Hide all loading indicators
  const loadingElements = document.querySelectorAll('.section-loading');
  loadingElements.forEach(el => {
    el.style.display = 'none';
  });
  
  // Show content sections
  const contentElements = document.querySelectorAll('.section-content');
  contentElements.forEach(el => {
    el.style.display = 'block';
  });
  
  // Update progress overview
  updateProgressOverview();
  
  // Update aptitude section
  updateAptitudeSection();
  
  // Update coding section
  updateCodingSection();
  
  // Update interview section
  updateInterviewSection();
  
  // Calculate and update overall score
  updateOverallScore();
}

/**
 * Update progress overview
 */
function updateProgressOverview() {
  if (!candidateData.progress) {
    document.getElementById('progress-section').style.display = 'none';
    return;
  }
  
  const stages = ['Aptitude', 'Coding', 'Interview'];
  const progressElement = document.getElementById('progress-overview');
  
  if (!progressElement) return;
  
  progressElement.innerHTML = '';
  
  stages.forEach(stage => {
    const stageData = candidateData.progress[stage];
    
    const stageElement = document.createElement('div');
    stageElement.className = 'stage-item';
    
    let stageClass = 'stage-pending';
    let stageIcon = '⏳';
    let stageText = 'Pending';
    
    if (stageData) {
      if (stageData.completed) {
        stageClass = stageData.passed ? 'stage-passed' : 'stage-failed';
        stageIcon = stageData.passed ? '✅' : '❌';
        stageText = stageData.passed ? 'Passed' : 'Failed';
      }
    }
    
    stageElement.classList.add(stageClass);
    
    stageElement.innerHTML = `
      <div class="stage-icon">${stageIcon}</div>
      <div class="stage-details">
        <div class="stage-name">${stage}</div>
        <div class="stage-status">${stageText}</div>
      </div>
    `;
    
    progressElement.appendChild(stageElement);
  });
}

/**
 * Update aptitude section
 */
function updateAptitudeSection() {
  const aptitudeSection = document.getElementById('aptitude-section');
  const aptitudeContent = document.getElementById('aptitude-content');
  
  if (!aptitudeSection || !aptitudeContent) return;
  
  if (!candidateData.aptitude) {
    aptitudeSection.querySelector('.section-not-found').style.display = 'block';
    return;
  }
  
  // Extract aptitude data
  const { questions, responses, score, timeTaken } = candidateData.aptitude;
  
  // Update aptitude score
  const scoreElement = document.getElementById('aptitude-score');
  if (scoreElement) {
    scoreElement.textContent = score !== undefined ? Math.round(score) : 'N/A';
  }
  
  // Create table for questions and answers
  const table = document.createElement('div');
  table.className = 'result-table';
  
  // Create header
  const header = document.createElement('div');
  header.className = 'result-row header';
  header.innerHTML = `
    <div class="result-cell">Question</div>
    <div class="result-cell">Your Answer</div>
    <div class="result-cell">Correct Answer</div>
    <div class="result-cell">Result</div>
  `;
  table.appendChild(header);
  
  // Add data rows
  if (questions && questions.length > 0) {
    questions.forEach((question, i) => {
      const response = responses && responses[i] ? responses[i] : 'No answer';
      const correctAnswer = question.correctAnswer || 'N/A';
      const isCorrect = response === correctAnswer;
      
      const row = document.createElement('div');
      row.className = 'result-row';
      
      row.innerHTML = `
        <div class="result-cell question-text">${question.question || 'Question ' + (i+1)}</div>
        <div class="result-cell">${response}</div>
        <div class="result-cell">${correctAnswer}</div>
        <div class="result-cell result-status ${isCorrect ? 'correct' : 'incorrect'}">${isCorrect ? '✓' : '✗'}</div>
      `;
      
      table.appendChild(row);
    });
  } else {
    const emptyRow = document.createElement('div');
    emptyRow.className = 'result-row empty';
    emptyRow.textContent = 'No aptitude questions found';
    table.appendChild(emptyRow);
  }
  
  aptitudeContent.appendChild(table);
  
  // Add time taken
  if (timeTaken) {
    const timeInfo = document.createElement('div');
    timeInfo.className = 'time-info';
    timeInfo.textContent = `Time taken: ${formatTime(timeTaken)}`;
    aptitudeContent.appendChild(timeInfo);
  }
}

/**
 * Update coding section
 */
function updateCodingSection() {
  const codingSection = document.getElementById('coding-section');
  const codingContent = document.getElementById('coding-content');
  
  if (!codingSection || !codingContent) return;
  
  if (!candidateData.coding) {
    codingSection.querySelector('.section-not-found').style.display = 'block';
    return;
  }
  
  // Extract coding data
  const { questions, solutions, testResults, score, timeTaken } = candidateData.coding;
  
  // Update coding score
  const scoreElement = document.getElementById('coding-score');
  if (scoreElement) {
    scoreElement.textContent = score !== undefined ? Math.round(score) : 'N/A';
  }
  
  // Create solutions display
  if (questions && questions.length > 0) {
    questions.forEach((question, i) => {
      const solution = solutions && solutions[i] ? solutions[i] : 'No solution provided';
      const results = testResults && testResults[i] ? testResults[i] : [];
      
      const questionCard = document.createElement('div');
      questionCard.className = 'coding-question-card';
      
      // Question header
      const questionHeader = document.createElement('div');
      questionHeader.className = 'coding-question-header';
      questionHeader.innerHTML = `
        <h4>Problem ${i+1}: ${question.title || 'Coding Challenge'}</h4>
        <div class="coding-test-results">
          ${renderTestResultsBadge(results)}
        </div>
      `;
      questionCard.appendChild(questionHeader);
      
      // Question text
      const questionText = document.createElement('div');
      questionText.className = 'coding-question-text';
      questionText.textContent = question.question || 'No question text available';
      questionCard.appendChild(questionText);
      
      // Solution code
      const solutionCode = document.createElement('pre');
      solutionCode.className = 'code-block';
      solutionCode.innerHTML = `<code>${escapeHtml(solution)}</code>`;
      questionCard.appendChild(solutionCode);
      
      // Test results
      if (results && results.length > 0) {
        const testsContainer = document.createElement('div');
        testsContainer.className = 'test-results-container';
        testsContainer.innerHTML = '<h5>Test Results</h5>';
        
        results.forEach((result, testIndex) => {
          const testResult = document.createElement('div');
          testResult.className = `test-result ${result.passed ? 'passed' : 'failed'}`;
          testResult.innerHTML = `
            <div class="test-result-header">
              <span class="test-index">Test ${testIndex + 1}</span>
              <span class="test-status">${result.passed ? 'Passed' : 'Failed'}</span>
            </div>
            <div class="test-details">
              <div><strong>Input:</strong> ${result.testCase || 'N/A'}</div>
              <div><strong>Expected:</strong> ${result.expectedOutput || 'N/A'}</div>
              <div><strong>Actual:</strong> ${result.actualOutput || 'N/A'}</div>
              ${result.error ? `<div class="test-error"><strong>Error:</strong> ${result.error}</div>` : ''}
            </div>
          `;
          testsContainer.appendChild(testResult);
        });
        
        questionCard.appendChild(testsContainer);
      }
      
      codingContent.appendChild(questionCard);
    });
  } else {
    const emptyResult = document.createElement('div');
    emptyResult.className = 'empty-result';
    emptyResult.textContent = 'No coding questions found';
    codingContent.appendChild(emptyResult);
  }
  
  // Add time taken
  if (timeTaken) {
    const timeInfo = document.createElement('div');
    timeInfo.className = 'time-info';
    timeInfo.textContent = `Time taken: ${formatTime(timeTaken)}`;
    codingContent.appendChild(timeInfo);
  }
}

/**
 * Update interview section
 */
function updateInterviewSection() {
  const interviewSection = document.getElementById('interview-section');
  const interviewContent = document.getElementById('interview-content');
  
  if (!interviewSection || !interviewContent) return;
  
  if (!candidateData.interview) {
    interviewSection.querySelector('.section-not-found').style.display = 'block';
    return;
  }
  
  // Extract interview data
  const { questions, transcriptSegments, startTime, endTime, detailedTranscripts } = candidateData.interview;
  
  // Calculate interview duration
  let duration = '00:00';
  if (startTime && endTime) {
    const start = new Date(startTime);
    const end = new Date(endTime);
    const durationMs = end - start;
    
    // Format as MM:SS
    const minutes = Math.floor(durationMs / (1000 * 60));
    const seconds = Math.floor((durationMs % (1000 * 60)) / 1000);
    duration = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
  
  // Update interview duration
  const durationElement = document.getElementById('interview-duration');
  if (durationElement) {
    durationElement.textContent = duration;
  }
  
  // Questions answered
  const nonSystemQuestions = questions ? questions.filter(q => !q.isSystemPrompt) : [];
  const answeredQuestions = transcriptSegments ? transcriptSegments.length : 0;
  
  const questionsElement = document.getElementById('interview-questions');
  if (questionsElement) {
    questionsElement.textContent = `${answeredQuestions}/${nonSystemQuestions.length || 0}`;
  }
  
  // Create transcript display
  let transcriptsToUse = detailedTranscripts || transcriptSegments || [];
  
  if (transcriptsToUse.length > 0) {
    const transcriptContainer = document.createElement('div');
    transcriptContainer.className = 'transcript-container';
    
    transcriptsToUse.forEach((transcript, i) => {
      if (transcript.isSystemPrompt) return;
      
      const transcriptCard = document.createElement('div');
      transcriptCard.className = 'transcript-card';
      
      const questionText = transcript.question || (questions && questions[transcript.questionIndex] ? questions[transcript.questionIndex].question : `Question ${i+1}`);
      
      transcriptCard.innerHTML = `
        <div class="transcript-question">
          <div class="question-number">Q${i+1}</div>
          <div class="question-text">${questionText}</div>
        </div>
        <div class="transcript-answer">
          <h5>Your Response:</h5>
          <p>${transcript.transcript || 'No response recorded'}</p>
        </div>
        ${transcript.duration ? `<div class="transcript-duration">Duration: ${formatTime(transcript.duration)}</div>` : ''}
      `;
      
      transcriptContainer.appendChild(transcriptCard);
    });
    
    interviewContent.appendChild(transcriptContainer);
  } else {
    const emptyResult = document.createElement('div');
    emptyResult.className = 'empty-result';
    emptyResult.textContent = 'No interview transcripts found';
    interviewContent.appendChild(emptyResult);
  }
}

/**
 * Calculate and update overall score
 */
function updateOverallScore() {
  let totalScore = 0;
  let totalComponents = 0;
  
  // Add aptitude score if available
  if (candidateData.aptitude && candidateData.aptitude.score !== undefined) {
    totalScore += candidateData.aptitude.score;
    totalComponents++;
  }
  
  // Add coding score if available
  if (candidateData.coding && candidateData.coding.score !== undefined) {
    totalScore += candidateData.coding.score;
    totalComponents++;
  }
  
  // Add interview score (based on response rate or other metrics)
  if (candidateData.interview) {
    let interviewScore = 0;
    
    if (candidateData.interview.transcriptSegments && candidateData.interview.questions) {
      const nonSystemQuestions = candidateData.interview.questions.filter(q => !q.isSystemPrompt);
      const responsesCount = candidateData.interview.transcriptSegments.filter(t => t.transcript && t.transcript.trim() !== '').length;
      
      if (nonSystemQuestions.length > 0) {
        interviewScore = Math.round((responsesCount / nonSystemQuestions.length) * 100);
      }
    }
    
    if (interviewScore > 0) {
      totalScore += interviewScore;
      totalComponents++;
    }
  }
  
  // Calculate average
  const finalScore = totalComponents > 0 ? Math.round(totalScore / totalComponents) : 85;
  
  // Update score display
  const scoreElement = document.getElementById('overall-score');
  if (scoreElement) {
    scoreElement.textContent = finalScore;
  }
  
  // Save to localStorage for persistence
  localStorage.setItem('interviewScore', finalScore);
  
  // Store other details in localStorage
  if (candidateData.interview) {
    if (candidateData.interview.startTime && candidateData.interview.endTime) {
      const start = new Date(candidateData.interview.startTime);
      const end = new Date(candidateData.interview.endTime);
      const durationMs = end - start;
      
      const minutes = Math.floor(durationMs / (1000 * 60));
      const seconds = Math.floor((durationMs % (1000 * 60)) / 1000);
      const formattedDuration = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
      
      localStorage.setItem('interviewDuration', formattedDuration);
    }
    
    if (candidateData.interview.questions && candidateData.interview.transcriptSegments) {
      const nonSystemQuestions = candidateData.interview.questions.filter(q => !q.isSystemPrompt);
      const answeredQuestions = candidateData.interview.transcriptSegments.length;
      localStorage.setItem('interviewQuestions', `${answeredQuestions}/${nonSystemQuestions.length}`);
    }
  }
}

/**
 * Set up event listeners
 */
function setupEventListeners() {
  // Print button
  const printBtn = document.getElementById('printBtn');
  if (printBtn) {
    printBtn.addEventListener('click', () => {
      window.print();
    });
  }
  
  // Home button
  const homeBtn = document.getElementById('homeBtn');
  if (homeBtn) {
    homeBtn.addEventListener('click', () => {
      window.location.href = 'index.html';
    });
  }
  
  // Section toggle buttons
  const sectionToggleButtons = document.querySelectorAll('.section-toggle');
  sectionToggleButtons.forEach(button => {
    button.addEventListener('click', function() {
      const sectionId = this.getAttribute('data-section');
      const section = document.getElementById(sectionId);
      
      if (section) {
        const content = section.querySelector('.section-content');
        
        if (content.style.display === 'none') {
          content.style.display = 'block';
          this.classList.add('active');
          this.querySelector('.toggle-icon').textContent = '−';
        } else {
          content.style.display = 'none';
          this.classList.remove('active');
          this.querySelector('.toggle-icon').textContent = '+';
        }
      }
    });
  });
}

/**
 * Sync candidate data to Supabase
 */
async function syncToSupabase() {
  const syncStatusEl = document.getElementById('sync-status');
  if (syncStatusEl) {
    syncStatusEl.textContent = 'Syncing your data to the cloud...';
    syncStatusEl.className = 'sync-status syncing';
  }
  
  try {
    // Get candidate directory path
    const candidateDir = getCandidateDirectoryPath();
    
    if (!fs.existsSync(candidateDir)) {
      throw new Error(`Candidate directory not found: ${candidateDir}`);
    }
    
    console.log(`Starting sync for candidate: ${candidateName}`);
    console.log(`Directory: ${candidateDir}`);
    
    // Initialize Supabase client
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // Upload all files in the candidate's folder
    await uploadCandidateFolder(supabase, candidateDir, candidateName);
    
    console.log('Sync completed successfully');
    if (syncStatusEl) {
      syncStatusEl.textContent = 'Your data has been successfully synced to the cloud';
      syncStatusEl.className = 'sync-status success';
    }
  } catch (error) {
    console.error('Error syncing to Supabase:', error);
    if (syncStatusEl) {
      syncStatusEl.textContent = `Error syncing your data: ${error.message}. Your data is still saved locally.`;
      syncStatusEl.className = 'sync-status error';
    }
  }
}

/**
 * Upload a candidate's folder to Supabase
 */
async function uploadCandidateFolder(supabase, folderPath, candidateName) {
  // Create a sanitized folder name for Supabase storage
  const folderPrefix = candidateName.replace(/\s+/g, '_').toLowerCase();
  
  // Helper function to recursively upload files
  async function uploadFilesRecursively(dir, subdirPath = '') {
    const files = fs.readdirSync(dir);
    
    for (const file of files) {
      const filePath = path.join(dir, file);
      const stats = fs.statSync(filePath);
      
      // Skip hidden files
      if (file.startsWith('.')) continue;
      
      if (stats.isDirectory()) {
        // Recursively upload files in subdirectory
        await uploadFilesRecursively(filePath, path.join(subdirPath, file));
      } else {
        // Upload file to Supabase Storage
        try {
          const fileContent = fs.readFileSync(filePath);
          const storagePath = path.join(folderPrefix, subdirPath, file).replace(/\\/g, '/');
          
          console.log(`Uploading: ${storagePath}`);
          
          const { data, error } = await supabase.storage
            .from('candidates')
            .upload(storagePath, fileContent, {
              upsert: true,
              contentType: getContentType(file)
            });
            
          if (error) {
            console.error(`Error uploading ${file}:`, error);
          } else {
            console.log(`Successfully uploaded: ${file}`);
          }
        } catch (error) {
          console.error(`Error reading or uploading ${file}:`, error);
        }
      }
    }
  }
  
  // Start uploading files recursively
  await uploadFilesRecursively(folderPath);
  
  return true;
}

/**
 * Determine content type based on file extension
 */
function getContentType(filename) {
  const ext = path.extname(filename).toLowerCase();
  
  const mimeTypes = {
    '.txt': 'text/plain',
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.pdf': 'application/pdf',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.webm': 'audio/webm',
    '.csv': 'text/csv'
  };
  
  return mimeTypes[ext] || 'application/octet-stream';
}

/**
 * Helper function to format time in MM:SS format
 */
function formatTime(seconds) {
  if (typeof seconds !== 'number') return 'N/A';
  
  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Show error message in the UI
 */
function showError(message) {
  const errorElement = document.getElementById('error-message');
  if (errorElement) {
    errorElement.textContent = message;
    errorElement.style.display = 'block';
  }
}

/**
 * Helper function to render test results badge
 */
function renderTestResultsBadge(results) {
  if (!results || !Array.isArray(results) || results.length === 0) {
    return '<span class="test-badge test-no-results">No tests</span>';
  }
  
  const passedTests = results.filter(r => r.passed).length;
  const totalTests = results.length;
  const allPassed = passedTests === totalTests;
  
  return `
    <span class="test-badge ${allPassed ? 'test-passed' : 'test-failed'}">
      ${passedTests}/${totalTests} tests passing
    </span>
  `;
}

/**
 * Helper function to escape HTML
 */
function escapeHtml(unsafe) {
  if (typeof unsafe !== 'string') return '';
  
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
// Import required modules
const fs = require('fs');
const path = require('path');
const { ipcRenderer } = require('electron');
const { GoogleGenerativeAI } = require("@google/generative-ai");

const GEMINI_API_KEY = "AIzaSyBKw5mWdk2uPf9iaq6L54DyfXP4QwB0bo4";
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// Debug logging function
function logDebug(message) {
  const debugLog = document.getElementById('debugLog');
  if (debugLog) {
    const logEntry = document.createElement('p');
    logEntry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    debugLog.appendChild(logEntry);
    debugLog.scrollTop = debugLog.scrollHeight;
    console.log(`DEBUG: ${message}`);
  }
}

// Get candidate info from localStorage or set defaults
const candidateName = localStorage.getItem('candidateName') || 'TestCandidate';
const candidatePosition = localStorage.getItem('candidatePosition') || 'Software Engineer';

// Initialize variables
let videoStream = null;
let capturedImageData = null;
let uploadedIDData = null;
let resumeFile = null;
let resumePath = null;

// Create candidate directory and return the path
function createCandidateDirectory() {
  try {
    const appRootDir = path.resolve(process.cwd());
    logDebug(`Application root directory: ${appRootDir}`);
    
    const databaseDir = path.join(appRootDir, "database");
    const candidatesDir = path.join(databaseDir, "candidates");
    const candidateDir = path.join(candidatesDir, candidateName);
    
    logDebug(`Database directory path: ${databaseDir}`);
    logDebug(`Candidates directory path: ${candidatesDir}`);
    logDebug(`Candidate directory path: ${candidateDir}`);
    
    if (!fs.existsSync(databaseDir)) {
      logDebug(`Creating database directory: ${databaseDir}`);
      fs.mkdirSync(databaseDir);
    }
    
    if (!fs.existsSync(candidatesDir)) {
      logDebug(`Creating candidates directory: ${candidatesDir}`);
      fs.mkdirSync(candidatesDir);
    }
    
    if (!fs.existsSync(candidateDir)) {
      logDebug(`Creating candidate directory: ${candidateDir}`);
      fs.mkdirSync(candidateDir);
    }
    
    if (fs.existsSync(candidateDir)) {
      logDebug(`Directory verified: ${candidateDir}`);
      return candidateDir;
    } else {
      throw new Error(`Failed to create candidate directory at ${candidateDir}`);
    }
  } catch (error) {
    logDebug(`ERROR creating directory: ${error.message}`);
    logDebug(`Stack trace: ${error.stack}`);
    updateStatus(`Error creating directory: ${error.message}`, 'error');
    return null;
  }
}

// Status message updater
function updateStatus(message, type = '') {
  const statusEl = document.getElementById('status');
  if (statusEl) {
    statusEl.textContent = message;
    statusEl.className = 'status';
    if (type) {
      statusEl.classList.add(`status-${type}`);
    }
  }
  logDebug(`Status update (${type}): ${message}`);
}

// Function to extract text from resume using REST API
async function extractResumeText(filePath) {
  try {
    logDebug(`Extracting text from resume: ${filePath}`);
    
    const buffer = fs.readFileSync(filePath);
    const base64Content = buffer.toString('base64');
    
    const fileExt = path.extname(filePath).toLowerCase();
    const fileSize = fs.statSync(filePath).size;
    const fileName = path.basename(filePath);
    
    logDebug(`Processing file: ${fileName}, type: ${fileExt}, size: ${formatFileSize(fileSize)}`);
    
    if (base64Content.length > 10000000) {
      logDebug(`File too large for text extraction API: ${formatFileSize(fileSize)}`);
      return `[Text extraction failed: File too large]\nFile: ${fileName}\nType: ${fileExt}\nSize: ${formatFileSize(fileSize)}`;
    }
    
    const requestBody = {
      contents: [{
        parts: [
          {
            text: `Extract all text content from this ${fileExt} file. Return only the extracted text content, with proper paragraph breaks and formatting preserved. Do not add any explanations or additional text.`
          },
          {
            inlineData: {
              mimeType: getMimeType(fileExt),
              data: base64Content
            }
          }
        ]
      }]
    };
    
    logDebug(`Sending REST API request to Gemini for text extraction (content length: ${base64Content.length} chars)`);
    
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(60000)
      }
    );
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API request failed: ${response.status} ${response.statusText} - ${errorText}`);
    }
    
    const responseData = await response.json();
    
    let extractedText = "";
    if (responseData.candidates && 
        responseData.candidates[0] && 
        responseData.candidates[0].content && 
        responseData.candidates[0].content.parts) {
      
      extractedText = responseData.candidates[0].content.parts
        .map(part => part.text || "")
        .join("\n");
    }
    
    if (!extractedText) {
      throw new Error("No text content found in API response");
    }
    
    logDebug(`Text extraction successful (${extractedText.length} characters)`);
    return extractedText;
    
  } catch (error) {
    logDebug(`Error extracting text from resume: ${error.message}`);
    logDebug(`Error stack: ${error.stack}`);
    return `[Text extraction failed: ${error.message}]\nFile: ${path.basename(filePath)}\nType: ${path.extname(filePath)}\nSize: ${formatFileSize(fs.statSync(filePath).size)}`;
  }
}

// Helper function to get MIME type from file extension
function getMimeType(extension) {
  const mimeTypes = {
    '.pdf': 'application/pdf',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.txt': 'text/plain',
    '.rtf': 'application/rtf'
  };
  
  return mimeTypes[extension] || 'application/octet-stream';
}

// Initialize camera
function initCamera() {
  logDebug("Initializing camera...");
  
  const liveVideo = document.getElementById('liveVideo');
  const cameraPlaceholder = document.getElementById('cameraPlaceholder');
  const cameraError = document.getElementById('cameraError');
  const captureBtn = document.getElementById('captureBtn');
  
  if (cameraPlaceholder) {
    cameraPlaceholder.textContent = "Initializing camera...";
    cameraPlaceholder.style.display = 'block';
  }
  
  if (cameraError) {
    cameraError.style.display = 'none';
  }
  
  if (captureBtn) {
    captureBtn.disabled = true;
  }
  
  if (videoStream) {
    try {
      videoStream.getTracks().forEach(track => track.stop());
      logDebug("Stopped existing video stream");
    } catch (e) {
      logDebug(`Error stopping existing stream: ${e.message}`);
    }
    videoStream = null;
  }
  
  try {
    if (!navigator.mediaDevices) {
      throw new Error("MediaDevices API not available");
    }
    
    navigator.mediaDevices.getUserMedia({ 
      video: true, 
      audio: false 
    })
    .then(stream => {
      videoStream = stream;
      logDebug("Camera stream acquired");
      
      try {
        liveVideo.srcObject = stream;
        logDebug("Set video source object");
        
        liveVideo.onloadedmetadata = () => {
          logDebug("Video metadata loaded");
          if (cameraPlaceholder) {
            cameraPlaceholder.style.display = 'none';
          }
          if (captureBtn) {
            captureBtn.disabled = false;
          }
          
          liveVideo.play()
            .then(() => {
              logDebug("Video playback started");
              updateStatus("Camera ready! Click 'Capture Face' when ready", 'success');
            })
            .catch(err => {
              logDebug(`Error starting video playback: ${err.message}`);
              showCameraError("Could not start video playback");
            });
        };
      } catch (err) {
        logDebug(`Error setting srcObject: ${err.message}`);
        try {
          liveVideo.src = URL.createObjectURL(stream);
          logDebug("Used URL.createObjectURL fallback");
        } catch (fallbackErr) {
          logDebug(`Fallback also failed: ${fallbackErr.message}`);
          throw new Error("Browser doesn't support camera streams");
        }
      }
    })
    .catch(err => {
      logDebug(`Camera access error: ${err.name}: ${err.message}`);
      
      let errorMessage = "Unable to access camera. ";
      
      switch (err.name) {
        case 'NotAllowedError':
          errorMessage += "Please allow camera access in your browser settings.";
          break;
        case 'NotFoundError':
          errorMessage += "No camera device found.";
          break;
        case 'NotReadableError':
          errorMessage += "Camera already in use by another application.";
          break;
        case 'OverconstrainedError':
          errorMessage += "Camera doesn't meet requirements.";
          break;
        default:
          errorMessage += err.message;
      }
      
      showCameraError(errorMessage);
    });
  } catch (criticalError) {
    logDebug(`Critical camera error: ${criticalError.message}`);
    showCameraError(`Critical error: ${criticalError.message}`);
  }
}

// Show camera error
function showCameraError(message) {
  const cameraError = document.getElementById('cameraError');
  const cameraPlaceholder = document.getElementById('cameraPlaceholder');
  const captureBtn = document.getElementById('captureBtn');
  
  if (cameraError) {
    cameraError.textContent = message;
    cameraError.classList.remove('hidden');
  }
  
  if (cameraPlaceholder) {
    cameraPlaceholder.style.display = 'none';
  }
  
  if (captureBtn) {
    captureBtn.disabled = true;
  }
  
  updateStatus(`Camera error: ${message}`, 'error');
}

// Handle face capture
function captureFace() {
  logDebug("Capturing face...");
  
  if (!videoStream) {
    updateStatus("Camera not initialized", 'error');
    return;
  }
  
  try {
    const video = document.getElementById('liveVideo');
    const capturedImg = document.getElementById('capturedImg');
    const capturedPreview = document.getElementById('capturedPreview');
    
    const candidateDir = createCandidateDirectory();
    if (!candidateDir) {
      throw new Error("Failed to create or access candidate directory");
    }
    
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    capturedImageData = canvas.toDataURL('image/png');
    
    const facePath = path.join(candidateDir, "face.png");
    
    const saveResult = saveBinaryImage(capturedImageData, facePath);
    if (!saveResult) {
      throw new Error("Failed to save face image to disk");
    }
    
    logDebug(`Face image saved to ${facePath}`);
    
    capturedImg.src = capturedImageData;
    capturedPreview.classList.remove('hidden');
    
    updateStatus("Face captured and saved successfully!", 'success');
    updateVerificationStatus();
  } catch (error) {
    logDebug(`Error capturing face: ${error.message}`);
    updateStatus(`Error capturing face: ${error.message}`, 'error');
  }
}

// Handle ID upload
function handleIDUpload(event) {
  logDebug("ID upload initiated");
  
  const idUpload = document.getElementById('idUpload');
  const uploadedIDImg = document.getElementById('uploadedIDImg');
  const idPreview = document.getElementById('idPreview');
  
  const file = event.target.files[0];
  if (!file) {
    logDebug("No file selected for ID upload");
    return;
  }
  
  logDebug(`Selected ID file: ${file.name} (${file.type}, ${file.size} bytes)`);
  
  const candidateDir = createCandidateDirectory();
  if (!candidateDir) {
    updateStatus("Error: Could not create candidate directory", 'error');
    return;
  }
  
  if (!file.type.startsWith('image/')) {
    updateStatus("Please select an image file for ID", 'error');
    return;
  }
  
  const idPath = path.join(candidateDir, "id.png");
  
  const reader = new FileReader();
  
  updateStatus("Saving ID image...", '');
  
  reader.onload = function(e) {
    try {
      uploadedIDData = e.target.result;
      
      const saveResult = saveBinaryImage(uploadedIDData, idPath);
      
      if (!saveResult) {
        throw new Error("Failed to save ID image to disk");
      }
      
      logDebug(`ID image saved to ${idPath}`);
      
      uploadedIDImg.src = uploadedIDData;
      idPreview.classList.remove('hidden');
      
      updateStatus("ID uploaded and saved successfully!", 'success');
      updateVerificationStatus();
    } catch (error) {
      logDebug(`Error processing ID image: ${error.message}`);
      updateStatus(`Error processing ID: ${error.message}`, 'error');
    }
  };
  
  reader.onerror = function() {
    logDebug("Error reading ID file");
    updateStatus("Failed to read ID file", 'error');
  };
  
  reader.readAsDataURL(file);
}

// Handle resume upload
function handleResumeUpload(event) {
  logDebug("Resume upload initiated");
  
  const resumeInput = document.getElementById('resumeInput');
  const resumeInfo = document.getElementById('resumeInfo');
  const analyzeBtn = document.getElementById('analyzeBtn');
  
  resumeFile = event.target.files[0];
  if (!resumeFile) {
    logDebug("No file selected for resume upload");
    resumeInfo.textContent = "";
    resumeInfo.classList.add('hidden');
    analyzeBtn.disabled = true;
    return;
  }
  
  logDebug(`Selected resume file: ${resumeFile.name} (${resumeFile.type}, ${resumeFile.size} bytes)`);
  
  resumeInfo.textContent = `Processing: ${resumeFile.name} (${formatFileSize(resumeFile.size)})`;
  resumeInfo.classList.remove('hidden');
  updateStatus("Creating candidate directory...", '');
  
  const candidateDir = createCandidateDirectory();
  if (!candidateDir) {
    logDebug("CRITICAL ERROR: Could not create candidate directory!");
    updateStatus("Error: Could not create candidate directory", 'error');
    return;
  }
  
  logDebug(`Saving resume to directory: ${candidateDir}`);
  
  const fileExt = resumeFile.name.split('.').pop().toLowerCase();
  if (!['pdf', 'doc', 'docx', 'txt', 'rtf'].includes(fileExt)) {
    updateStatus("Please upload a PDF, DOC, DOCX, TXT or RTF file for resume", 'error');
    return;
  }
  
  const resumeFilePath = path.join(candidateDir, resumeFile.name);
  logDebug(`Resume path: ${resumeFilePath}`);
  updateStatus("Saving resume file...", '');
  
  try {
    const reader = new FileReader();
    
    reader.onload = async function(e) {
      try {
        const arrayBuffer = e.target.result;
        logDebug(`Resume file read, size: ${arrayBuffer.byteLength} bytes`);
        
        try {
          const buffer = Buffer.from(new Uint8Array(arrayBuffer));
          logDebug(`Buffer created, length: ${buffer.length} bytes`);
          
          fs.writeFileSync(resumeFilePath, buffer);
          logDebug(`File written to: ${resumeFilePath}`);
          
          if (fs.existsSync(resumeFilePath)) {
            const stats = fs.statSync(resumeFilePath);
            logDebug(`Resume saved to: ${resumeFilePath} (${formatFileSize(stats.size)})`);
            
            resumePath = resumeFilePath;
            
            updateStatus("Resume saved! Now extracting text...", 'success');
            resumeInfo.textContent = `File saved. Extracting text from: ${resumeFile.name}...`;
            
            try {
              const extractedText = await extractResumeText(resumePath);
              
              const resumeTxtPath = path.join(candidateDir, "resume.txt");
              let resumeContent = `Resume for: ${candidateName}\n`;
              resumeContent += `Position: ${candidatePosition}\n`;
              resumeContent += `Original file: ${resumeFile.name}\n`;
              resumeContent += `Timestamp: ${new Date().toISOString()}\n\n`;
              resumeContent += `${extractedText}`;
              
              fs.writeFileSync(resumeTxtPath, resumeContent);
              logDebug(`Resume text saved to: ${resumeTxtPath}`);
              
              resumeInfo.textContent = `File: ${resumeFile.name} (${formatFileSize(stats.size)}) - Text extracted`;
              updateStatus("Resume saved and text extracted successfully!", 'success');
            } catch (extractError) {
              logDebug(`Error extracting text: ${extractError.message}`);
              
              const resumeTxtPath = path.join(candidateDir, "resume.txt");
              let resumeContent = `Resume for: ${candidateName}\n`;
              resumeContent += `Position: ${candidatePosition}\n`;
              resumeContent += `Original file: ${resumeFile.name}\n`;
              resumeContent += `Timestamp: ${new Date().toISOString()}\n\n`;
              resumeContent += `[Text extraction failed: ${extractError.message}]`;
              fs.writeFileSync(resumeTxtPath, resumeContent);
              
              resumeInfo.textContent = `File: ${resumeFile.name} (${formatFileSize(stats.size)}) - Text extraction failed`;
              updateStatus("Resume saved but text extraction failed", 'warning');
            }
            
            analyzeBtn.disabled = false;
            updateVerificationStatus();
          } else {
            throw new Error(`File not found at ${resumeFilePath} after saving`);
          }
        } catch (fileWriteError) {
          logDebug(`ERROR writing file: ${fileWriteError.message}`);
          logDebug(`Error stack: ${fileWriteError.stack}`);
          throw new Error(`Failed to save resume file: ${fileWriteError.message}`);
        }
      } catch (error) {
        logDebug(`Error in file save process: ${error.message}`);
        logDebug(`Error stack: ${error.stack}`);
        updateStatus(`Error saving resume: ${error.message}`, 'error');
        resumeInfo.textContent = `Error: ${error.message}`;
      }
    };
    
    reader.onerror = function(event) {
      const error = event.target.error;
      logDebug(`Error reading resume file: ${error}`);
      updateStatus("Failed to read resume file", 'error');
    };
    
    reader.readAsArrayBuffer(resumeFile);
    logDebug("Started reading resume file as ArrayBuffer");
  } catch (error) {
    logDebug(`Critical error in resume upload process: ${error.message}`);
    logDebug(`Error stack: ${error.stack}`);
    updateStatus(`Critical error processing resume: ${error.message}`, 'error');
  }
}

// Save image from data URL
function saveBinaryImage(dataURL, filePath) {
  try {
    logDebug(`Saving image to ${filePath}...`);
    
    const base64Data = dataURL.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    
    const dirPath = path.dirname(filePath);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
      logDebug(`Created directory: ${dirPath}`);
    }
    
    fs.writeFileSync(filePath, buffer);
    
    if (fs.existsSync(filePath)) {
      const stats = fs.statSync(filePath);
      logDebug(`Confirmed file saved (${formatFileSize(stats.size)})`);
      return true;
    } else {
      logDebug("File was not saved successfully");
      return false;
    }
  } catch (error) {
    logDebug(`Error saving image: ${error.message}`);
    return false;
  }
}

// Format file size for display
function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' bytes';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// Analyze resume with Gemini API
async function analyzeResume() {
  logDebug("Analyzing resume with Gemini API...");
  
  if (!resumePath) {
    updateStatus("No resume to analyze", 'error');
    return;
  }
  
  let analysisContainer = document.getElementById('analysisContainer');
  if (!analysisContainer) {
    const resumeSection = document.querySelector('.section:first-of-type');
    analysisContainer = document.createElement('div');
    analysisContainer.id = 'analysisContainer';
    analysisContainer.style.backgroundColor = '#444';
    analysisContainer.style.padding = '15px';
    analysisContainer.style.borderRadius = '5px';
    analysisContainer.style.marginTop = '15px';
    analysisContainer.style.maxHeight = '300px';
    analysisContainer.style.overflowY = 'auto';
    resumeSection.appendChild(analysisContainer);
  }
  
  analysisContainer.innerHTML = '<p>Analyzing resume with Gemini AI...</p>';
  
  try {
    const resumeTxtPath = path.join(path.dirname(resumePath), "resume.txt");
    let resumeText = "";
    
    if (fs.existsSync(resumeTxtPath)) {
      resumeText = fs.readFileSync(resumeTxtPath, 'utf8');
      logDebug("Read resume text from resume.txt");
    } else {
      resumeText = await extractResumeText(resumePath);
      logDebug("Extracted resume text on-the-fly");
    }
    
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    
    const prompt = `
    You are a hiring manager reviewing a resume for a ${candidatePosition} position.
    
    Resume content:
    ${resumeText.slice(0, 7000)}
    
    Provide a simple assessment with:
    1. An overall score from 0-100
    2. Estimated years of relevant experience
    3. Key skills identified in the resume
    4. Brief strengths and areas for improvement
    
    Format your response as JSON with this structure:
    {
      "score": number,
      "experience_years": number,
      "key_skills": [string, string, ...],
      "strengths": string,
      "areas_to_improve": string
    }
    
    Return ONLY the JSON without any additional text.
    `;
    
    logDebug("Sending resume analysis request to Gemini API");
    
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error("Gemini API timed out")), 15000);
    });
    
    const resultPromise = model.generateContent(prompt);
    const result = await Promise.race([resultPromise, timeoutPromise]);
    
    const responseText = result.response.text();
    logDebug("Received analysis response from Gemini API");
    
    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("Failed to extract JSON from API response");
      }
      
      const analysis = JSON.parse(jsonMatch[0]);
      logDebug("Successfully parsed analysis JSON");
      
      const candidateDir = path.dirname(resumePath);
      const analysisPath = path.join(candidateDir, "analysis.json");
      fs.writeFileSync(analysisPath, JSON.stringify(analysis, null, 2));
      logDebug(`Saved analysis to ${analysisPath}`);
      
      displaySimpleAnalysisResults(analysis);
      updateStatus("Resume analyzed successfully!", 'success');
    } catch (parseError) {
      logDebug(`Error parsing analysis JSON: ${parseError.message}`);
      analysisContainer.innerHTML = `
        <p>Error parsing analysis results. Received response:</p>
        <pre style="background-color: #333; padding: 10px; overflow: auto; max-height: 200px;">${responseText}</pre>
        <button id="retryAnalysisBtn" style="margin-top: 10px;">Retry Analysis</button>
      `;
      
      document.getElementById('retryAnalysisBtn').addEventListener('click', analyzeResume);
      updateStatus("Failed to parse analysis results", 'error');
    }
  } catch (error) {
    logDebug(`Error analyzing resume: ${error.message}`);
    analysisContainer.innerHTML = `
      <p>Error analyzing resume: ${error.message}</p>
      <button id="retryAnalysisBtn" style="margin-top: 10px;">Retry Analysis</button>
    `;
    
    document.getElementById('retryAnalysisBtn').addEventListener('click', analyzeResume);
    updateStatus("Resume analysis failed", 'error');
  }
}

// Display simplified analysis results in UI
function displaySimpleAnalysisResults(analysis) {
  const analysisContainer = document.getElementById('analysisContainer');
  if (!analysisContainer) return;
  
  let analysisHTML = `
    <h3>Resume Analysis Results</h3>
    <div style="margin: 10px 0">
      <strong>Overall Score:</strong> 
      <span style="color: ${getScoreColor(analysis.score)}">${analysis.score}/100</span>
    </div>
    <div style="margin: 10px 0">
      <strong>Experience:</strong> ${analysis.experience_years} years
    </div>
    
    <h4>Key Skills</h4>
    <ul style="list-style-type: none; padding-left: 0;">
      ${analysis.key_skills.map(skill => `
        <li style="margin: 5px 0; padding: 5px; background-color: #333; border-radius: 3px;">
          ${skill}
        </li>
      `).join('')}
    </ul>
    
    <div style="margin: 15px 0; padding: 10px; background-color: #333; border-radius: 3px;">
      <strong>Strengths:</strong> ${analysis.strengths}
    </div>
    
    <div style="margin: 15px 0; padding: 10px; background-color: #333; border-radius: 3px;">
      <strong>Areas to Improve:</strong> ${analysis.areas_to_improve}
    </div>
    
    <button id="hideAnalysisBtn" style="background-color: #f59e0b; color: white; border: none; padding: 5px 10px; border-radius: 3px; cursor: pointer;">
      Hide Analysis
    </button>
  `;
  
  analysisContainer.innerHTML = analysisHTML;
  
  document.getElementById('hideAnalysisBtn').addEventListener('click', () => {
    analysisContainer.style.display = 'none';
  });
}

// Helper function to get color based on score
function getScoreColor(score) {
  if (score >= 80) return '#4caf50';
  if (score >= 60) return '#8bc34a';
  if (score >= 40) return '#ffc107';
  if (score >= 20) return '#ff9800';
  return '#f44336';
}

// Update verification status
function updateVerificationStatus() {
  const proceedBtn = document.getElementById('proceedBtn');
  
  const faceComplete = capturedImageData !== null;
  const idComplete = uploadedIDData !== null;
  const resumeComplete = resumePath !== null;
  
  logDebug(`Verification status: Face: ${faceComplete ? 'Complete' : 'Incomplete'}, ID: ${idComplete ? 'Complete' : 'Incomplete'}, Resume: ${resumeComplete ? 'Complete' : 'Incomplete'}`);
  
  if (faceComplete && idComplete && resumeComplete) {
    updateStatus("All verification steps complete! You can proceed to the interview.", 'success');
    proceedBtn.disabled = false;
  } else {
    const remainingSteps = [];
    if (!faceComplete) remainingSteps.push("Face Capture");
    if (!idComplete) remainingSteps.push("ID Upload");
    if (!resumeComplete) remainingSteps.push("Resume Upload");
    
    updateStatus(`Please complete: ${remainingSteps.join(', ')}`, remainingSteps.length === 1 ? 'warning' : '');
    proceedBtn.disabled = true;
  }
}

// Reset verification
function resetVerification() {
  logDebug("Resetting verification...");
  
  if (!confirm("Are you sure you want to reset all verification data?")) {
    return;
  }
  
  if (videoStream) {
    videoStream.getTracks().forEach(track => track.stop());
    videoStream = null;
  }
  
  capturedImageData = null;
  uploadedIDData = null;
  resumeFile = null;
  resumePath = null;
  
  document.getElementById('capturedPreview').classList.add('hidden');
  document.getElementById('idPreview').classList.add('hidden');
  document.getElementById('resumeInfo').classList.add('hidden');
  document.getElementById('analyzeBtn').disabled = true;
  document.getElementById('resumeInput').value = '';
  document.getElementById('idUpload').value = '';
  
  const analysisContainer = document.getElementById('analysisContainer');
  if (analysisContainer) {
    analysisContainer.remove();
  }
  
  initCamera();
  
  updateStatus("Verification reset. Please complete all steps.", '');
  document.getElementById('proceedBtn').disabled = true;
  
  logDebug("Verification reset complete");
}

// Proceed to interview
function proceedToInterview() {
  logDebug("Proceeding to interview...");
  
  if (!capturedImageData || !uploadedIDData || !resumePath) {
    updateStatus("Please complete all verification steps first", 'warning');
    return;
  }
  
  try {
    const candidateDir = createCandidateDirectory();
    if (candidateDir) {
      const statusPath = path.join(candidateDir, "verification_status.json");
      const statusData = {
        verified: true,
        timestamp: new Date().toISOString(),
        steps: {
          face: true,
          id: true,
          resume: true
        }
      };
      
      fs.writeFileSync(statusPath, JSON.stringify(statusData, null, 2));
      logDebug("Verification status saved");
    }
    
    if (videoStream) {
      videoStream.getTracks().forEach(track => track.stop());
      videoStream = null;
    }
    
    localStorage.setItem('verificationComplete', 'true');
    updateStatus("Verification complete! Redirecting to interview...", 'success');
    
    setTimeout(() => {
      window.location.href = "lobby.html";
    }, 1500);
  } catch (error) {
    logDebug(`Error proceeding to interview: ${error.message}`);
    updateStatus(`Error proceeding to interview: ${error.message}`, 'error');
  }
}

// Check for existing verification data
function checkForExistingData() {
  logDebug("Checking for existing verification data...");
  
  try {
    const appRootDir = path.resolve(process.cwd());
    const candidateDir = path.join(appRootDir, "database", "candidates", candidateName);
    
    if (!fs.existsSync(candidateDir)) {
      logDebug("No candidate directory found");
      return;
    }
    
    const facePath = path.join(candidateDir, "face.png");
    if (fs.existsSync(facePath)) {
      logDebug("Found existing face image");
      const faceData = fs.readFileSync(facePath);
      capturedImageData = `data:image/png;base64,${faceData.toString('base64')}`;
      
      const capturedImg = document.getElementById('capturedImg');
      const capturedPreview = document.getElementById('capturedPreview');
      
      capturedImg.src = capturedImageData;
      capturedPreview.classList.remove('hidden');
    }
    
    const idPath = path.join(candidateDir, "id.png");
    if (fs.existsSync(idPath)) {
      logDebug("Found existing ID image");
      const idData = fs.readFileSync(idPath);
      uploadedIDData = `data:image/png;base64,${idData.toString('base64')}`;
      
      const uploadedIDImg = document.getElementById('uploadedIDImg');
      const idPreview = document.getElementById('idPreview');
      
      uploadedIDImg.src = uploadedIDData;
      idPreview.classList.remove('hidden');
    }
    
    const resumeFiles = fs.readdirSync(candidateDir).filter(file => 
      file.toLowerCase().endsWith('.pdf') || 
      file.toLowerCase().endsWith('.docx') || 
      file.toLowerCase().endsWith('.doc')
    );
    
    if (resumeFiles.length > 0) {
      const foundResume = resumeFiles[0];
      logDebug(`Found existing resume: ${foundResume}`);
      resumePath = path.join(candidateDir, foundResume);
      
      const resumeInfo = document.getElementById('resumeInfo');
      const analyzeBtn = document.getElementById('analyzeBtn');
      
      const stats = fs.statSync(resumePath);
      resumeInfo.textContent = `File: ${foundResume} (${formatFileSize(stats.size)})`;
      resumeInfo.classList.remove('hidden');
      analyzeBtn.disabled = false;
    }
    
    updateVerificationStatus();
  } catch (error) {
    logDebug(`Error checking for existing data: ${error.message}`);
  }
}

// Document ready function
document.addEventListener('DOMContentLoaded', function() {
  logDebug(`Page loaded for candidate: ${candidateName}, position: ${candidatePosition}`);
  
  if (!candidateName || candidateName === 'null' || candidateName === 'undefined') {
    const defaultName = 'TestCandidate_' + new Date().getTime();
    localStorage.setItem('candidateName', defaultName);
    logDebug(`No candidate name found, using default: ${defaultName}`);
    candidateName = defaultName;
  }
  
  const candidateDir = createCandidateDirectory();
  if (candidateDir) {
    logDebug(`Candidate directory confirmed: ${candidateDir}`);
  }
  
  const captureBtn = document.getElementById('captureBtn');
  const idUpload = document.getElementById('idUpload');
  const resumeInput = document.getElementById('resumeInput');
  const analyzeBtn = document.getElementById('analyzeBtn');
  const refreshBtn = document.getElementById('refreshBtn');
  const proceedBtn = document.getElementById('proceedBtn');
  
  if (captureBtn) captureBtn.addEventListener('click', captureFace);
  if (idUpload) idUpload.addEventListener('change', handleIDUpload);
  if (resumeInput) resumeInput.addEventListener('change', handleResumeUpload);
  if (analyzeBtn) analyzeBtn.addEventListener('click', analyzeResume);
  if (refreshBtn) refreshBtn.addEventListener('click', resetVerification);
  if (proceedBtn) proceedBtn.addEventListener('click', proceedToInterview);
  
  initCamera();
  checkForExistingData();
});
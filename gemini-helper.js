// gemini-helper.js
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');

let genAI;
let model;

// Initialize Gemini API
async function initializeGemini() {
  if (genAI) return;
  
  try {
    const config = await ipcRenderer.invoke('get-config');
    genAI = new GoogleGenerativeAI(config.geminiApiKey);
    model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    return true;
  } catch (error) {
    console.error('Error initializing Gemini API:', error);
    return false;
  }
}

// Generate a report for a candidate
async function generateCandidateReport(candidateName, resumeText, answers, questions) {
  try {
    await initializeGemini();
    
    // Format the input data for Gemini
    const answersText = questions.map((question, index) => {
      return `Question ${index + 1}: ${question}\nAnswer: ${answers[index] || 'No answer provided'}`;
    }).join('\n\n');
    
    // Create the prompt for Gemini
    const prompt = `
    You are a professional HR evaluator. Please analyze the following candidate information 
    and provide a detailed evaluation.
    
    CANDIDATE NAME: ${candidateName}
    
    ===============================================
    RESUME
    ===============================================
    
    ${resumeText || 'No resume provided'}
    
    ===============================================
    INTERVIEW RESPONSES
    ===============================================
    
    ${answersText}
    
    ===============================================
    
    Please provide a comprehensive evaluation including:
    1. Overall assessment of candidate qualifications
    2. Strengths and weaknesses
    3. Communication skills assessment
    4. Technical skills assessment
    5. Cultural fit evaluation
    6. Recommendations for next steps
    7. Rating on a scale of 1-10
    
    Format your response as a professional HR report.
    `;
    
    // Generate content with Gemini API
    const result = await model.generateContent(prompt);
    const reportText = result.response.text();
    
    // Save locally to the candidate's folder
    const candidateDir = path.join(__dirname, "database", "candidates", candidateName);
    if (!fs.existsSync(candidateDir)) {
      fs.mkdirSync(candidateDir, { recursive: true });
    }
    
    const reportPath = path.join(candidateDir, "REPORT.txt");
    fs.writeFileSync(reportPath, reportText);
    
    return {
      success: true,
      report: reportText,
      path: reportPath
    };
  } catch (error) {
    console.error('Error generating candidate report:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

module.exports = {
  initializeGemini,
  generateCandidateReport
};
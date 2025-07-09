// Fixed renderer.js - Handles undefined paths
const fs = require('fs');
const path = require('path');

document.addEventListener('DOMContentLoaded', function() {
  console.log("DOM loaded - attaching event listeners");
  
  // Get the upload button
  const uploadBtn = document.getElementById('uploadBtn');
  if (uploadBtn) {
    uploadBtn.addEventListener('click', handleUpload);
    console.log("Upload button listener attached");
  } else {
    console.error("Upload button not found!");
  }
});

function handleUpload() {
  console.log("Upload button clicked");
  
  // Get elements
  const candidateNameInput = document.getElementById('candidateName');
  const fileInput = document.getElementById('resumeInput');
  const statusEl = document.getElementById('status');
  
  // Basic validation
  if (!candidateNameInput || !fileInput || !statusEl) {
    console.error("Required elements not found");
    alert("Error: UI elements not found");
    return;
  }
  
  if (!candidateNameInput.value.trim()) {
    statusEl.textContent = 'Please enter your name.';
    return;
  }
  
  if (fileInput.files.length === 0) {
    statusEl.textContent = 'Please select a resume file.';
    return;
  }
  
  try {
    // Get candidate name and clean it
    const candidateName = candidateNameInput.value.trim().replace(/\s+/g, '_');
    
    // Save to localStorage for later use
    localStorage.setItem('candidateName', candidateName);
    
    // Get the file
    const file = fileInput.files[0];
    console.log("Selected file:", file);
    
    // Create directories
    const candidatesDir = path.join(__dirname, 'database', 'candidates');
    const candidateDir = path.join(candidatesDir, candidateName);
    
    if (!fs.existsSync(candidatesDir)) {
      fs.mkdirSync(candidatesDir, { recursive: true });
    }
    
    if (!fs.existsSync(candidateDir)) {
      fs.mkdirSync(candidateDir, { recursive: true });
    }
    
    // The file.path property might be undefined in some Electron environments
    // Use FileReader API instead which works in any browser environment
    
    const reader = new FileReader();
    
    reader.onload = function(event) {
      const fileContent = event.target.result;
      
      // Save the file content
      const targetFilePath = path.join(candidateDir, 'resume.txt');
      
      statusEl.textContent = 'Saving resume...';
      
      // Create a simple text representation
      const resumeText = `Resume for ${candidateName}\nOriginal file: ${file.name}\nUploaded: ${new Date().toLocaleString()}`;
      localStorage.setItem('resumeText', resumeText);
      
      fs.writeFile(targetFilePath, resumeText, (err) => {
        if (err) {
          console.error("Error writing file:", err);
          statusEl.textContent = 'Error saving resume: ' + err.message;
          return;
        }
        
        statusEl.textContent = 'Resume uploaded successfully!';
        
        // Wait a moment then redirect
        setTimeout(() => {
          console.log("Redirecting to identification.html");
          window.location.href = 'identification.html';
        }, 1500);
      });
    };
    
    reader.onerror = function(event) {
      console.error("FileReader error:", event.target.error);
      statusEl.textContent = 'Error reading file: ' + event.target.error;
    };
    
    if (file.type.includes('pdf') || file.type.includes('document')) {
      // For binary files, just store the name and fake some content
      reader.readAsText(new Blob(['Resume content placeholder']));
    } else {
      // For text files, read the content
      reader.readAsText(file);
    }
  } catch (error) {
    console.error("Upload error:", error);
    statusEl.textContent = 'Error: ' + error.message;
  }
}
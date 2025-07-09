// resume-analyzer.js - Simple wrapper for Python PDF extractor
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

class ResumeAnalyzer {
  constructor(options) {
    this.candidateName = options.candidateName || 'Unknown';
    this.candidateId = options.candidateId || 'unknown_candidate';
    this.jobTitle = options.jobTitle || 'Software Engineer';
    
    this.resumePath = null;
    this.isProcessing = false;
  }

  async loadResume(filePath) {
    try {
      this.resumePath = filePath;
      return fs.existsSync(filePath);
    } catch (error) {
      console.error('Error loading resume:', error);
      return false;
    }
  }

  async startBackgroundProcessing(candidateDir) {
    if (this.isProcessing || !this.resumePath) {
      console.log('Already processing or no resume loaded');
      return false;
    }
    
    this.isProcessing = true;
    
    try {
      // Get path to python script
      const pythonScript = path.join(__dirname, 'pdf_extractor.py');
      
      // Ensure the script exists
      if (!fs.existsSync(pythonScript)) {
        throw new Error('Python script not found: ' + pythonScript);
      }
      
      console.log('Starting Python PDF extraction process');
      
      // Create temporary placeholder files
      this.createPlaceholderFiles(candidateDir);
      
      // Run Python script as a separate process
      return new Promise((resolve, reject) => {
        const process = spawn('python', [
          pythonScript,
          this.resumePath,
          candidateDir,
          this.candidateName,
          this.jobTitle
        ]);
        
        let stdoutData = '';
        let stderrData = '';
        
        process.stdout.on('data', (data) => {
          stdoutData += data.toString();
          console.log(`Python: ${data}`);
        });
        
        process.stderr.on('data', (data) => {
          stderrData += data.toString();
          console.error(`Python error: ${data}`);
        });
        
        process.on('close', (code) => {
          this.isProcessing = false;
          
          if (code === 0) {
            console.log('PDF extraction completed successfully');
            resolve(true);
          } else {
            console.error(`PDF extraction failed with code ${code}`);
            
            // Save error log
            const errorLog = path.join(candidateDir, 'extraction_error.log');
            fs.writeFileSync(errorLog, stderrData);
            
            reject(new Error(`PDF extraction failed with code ${code}`));
          }
        });
        
        process.on('error', (err) => {
          this.isProcessing = false;
          console.error('Failed to start Python process:', err);
          reject(err);
        });
      });
    } catch (error) {
      this.isProcessing = false;
      console.error('Error starting background processing:', error);
      throw error;
    }
  }

  createPlaceholderFiles(candidateDir) {
    try {
      // Create placeholder resume.txt
      const resumeTxtPath = path.join(candidateDir, 'resume.txt');
      const resumePlaceholder = 
        `Resume for ${this.candidateName}\n` +
        `Position: ${this.jobTitle}\n` +
        `Extracted: ${new Date().toLocaleString()}\n\n` +
        `PARSED CONTENT:\n\n` +
        `Extraction in progress... Please wait.`;
      
      fs.writeFileSync(resumeTxtPath, resumePlaceholder);
      
      // Create placeholder REPORT.txt if it doesn't exist
      const reportPath = path.join(candidateDir, 'REPORT.txt');
      if (!fs.existsSync(reportPath)) {
        const reportPlaceholder = 
          `CANDIDATE INTERVIEW REPORT\n` +
          `==========================\n` +
          `Candidate: ${this.candidateName}\n` +
          `Position: ${this.jobTitle}\n` +
          `Date: ${new Date().toISOString()}\n\n` +
          `Analysis in progress... Please wait.`;
        
        fs.writeFileSync(reportPath, reportPlaceholder);
      }
      
      return true;
    } catch (error) {
      console.error('Error creating placeholder files:', error);
      return false;
    }
  }
}

module.exports = ResumeAnalyzer;
// integration.js - Main integration script for HR interview system
const fs = require('fs');
const path = require('path');
const { ipcRenderer } = require('electron');
const QuestionLoader = require('./QuestionLoader');
const InterviewSync = require('./interview-sync');
const ReportGenerator = require('./report-generator');

/**
 * Initialize the interview system with necessary components
 * @param {string} candidateName - Name of the candidate
 * @returns {Promise<Object>} Initialization result
 */
async function initializeInterviewSystem(candidateName = localStorage.getItem('candidateName')) {
  try {
    if (!candidateName) {
      throw new Error('Candidate name not provided');
    }
    
    console.log(`[INIT] Initializing interview system for ${candidateName}`);
    
    // Create interview sync instance
    const interviewSync = new InterviewSync({
      candidateName,
      logFunction: message => console.log(`[SYNC] ${message}`)
    });
    
    // Initialize interview sync
    await interviewSync.initInterview();
    
    // Create question loader
    const questionLoader = new QuestionLoader({
      logFunction: message => console.log(`[LOADER] ${message}`)
    });
    
    // Get questions path
    const questionsPath = interviewSync.getQuestionsPath();
    
    // Verify questions file exists
    if (!fs.existsSync(questionsPath)) {
      console.log(`[INIT] Questions file not found, creating default`);
      await questionLoader.createDefaultQuestionsFile(questionsPath);
    }
    
    // Create report generator
    const reportGenerator = new ReportGenerator(candidateName);
    
    // Initialize report
    reportGenerator.initReport();
    
    // Create directory structure
    const dbDir = path.join(process.cwd(), 'database');
    const candidatesDir = path.join(dbDir, 'candidates');
    const candidateDir = path.join(candidatesDir, candidateName);
    
    // Create directories if they don't exist
    if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir);
    if (!fs.existsSync(candidatesDir)) fs.mkdirSync(candidatesDir);
    if (!fs.existsSync(candidateDir)) fs.mkdirSync(candidateDir);
    
    // Create initialization marker
    fs.writeFileSync(
      path.join(candidateDir, 'initialization_complete.txt'),
      `Initialization completed: ${new Date().toISOString()}`
    );
    
    return {
      success: true,
      questionsPath,
      candidateDir,
      message: 'Interview system initialized successfully'
    };
  } catch (error) {
    console.error(`[INIT] Error initializing interview system: ${error.message}`);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Get candidate progress and determine next stage
 * @param {string} candidateName - Name of the candidate
 * @returns {Promise<Object>} Progress and next stage
 */
async function getCandidateProgress(candidateName = localStorage.getItem('candidateName')) {
  try {
    if (!candidateName) {
      throw new Error('Candidate name not provided');
    }
    
    // Get progress file path
    const progressPath = path.join(process.cwd(), 'database', 'candidates', candidateName, 'progress.json');
    
    // Check if progress file exists
    if (!fs.existsSync(progressPath)) {
      return {
        currentStage: 'Aptitude',
        nextStage: 'Aptitude',
        progress: {}
      };
    }
    
    // Read progress file
    const progress = JSON.parse(fs.readFileSync(progressPath, 'utf8'));
    
    // Determine current stage and next stage
    let currentStage = 'Aptitude';
    let nextStage = 'Aptitude';
    
    if (progress.Aptitude && progress.Aptitude.completed) {
      currentStage = 'Aptitude';
      
      if (progress.Aptitude.passed) {
        nextStage = 'Coding';
        
        if (progress.Coding && progress.Coding.completed) {
          currentStage = 'Coding';
          
          if (progress.Coding.passed) {
            nextStage = 'Interview';
            
            if (progress.Interview && progress.Interview.completed) {
              currentStage = 'Interview';
              nextStage = 'Complete';
            }
          } else {
            nextStage = 'Failed';
          }
        }
      } else {
        nextStage = 'Failed';
      }
    }
    
    return {
      currentStage,
      nextStage,
      progress
    };
  } catch (error) {
    console.error(`[PROGRESS] Error getting candidate progress: ${error.message}`);
    return {
      currentStage: 'Error',
      nextStage: 'Error',
      progress: {},
      error: error.message
    };
  }
}

/**
 * Generate a complete report for the candidate
 * @param {string} candidateName - Name of the candidate
 * @returns {Promise<Object>} Report generation result
 */
async function generateReport(candidateName = localStorage.getItem('candidateName')) {
  try {
    if (!candidateName) {
      throw new Error('Candidate name not provided');
    }
    
    const reportGenerator = new ReportGenerator(candidateName);
    const success = await reportGenerator.generateCompleteReport();
    
    if (success) {
      // Upload to Supabase
      const interviewSync = new InterviewSync({
        candidateName,
        logFunction: message => console.log(`[SYNC] ${message}`)
      });
      
      await interviewSync.initInterview();
      await interviewSync.uploadCandidateData();
      
      return {
        success: true,
        message: 'Report generated and uploaded successfully',
        reportPath: reportGenerator.reportPath
      };
    }
    
    return {
      success: false,
      error: 'Failed to generate report'
    };
  } catch (error) {
    console.error(`[REPORT] Error generating report: ${error.message}`);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Utility to fix the questions.csv file
 * @returns {Promise<Object>} Fix result
 */
async function fixQuestionsFile() {
  try {
    // Create question loader
    const questionLoader = new QuestionLoader({
      logFunction: message => console.log(`[LOADER] ${message}`)
    });
    
    // Default paths to check
    const paths = [
      path.join(process.cwd(), 'database', 'questions.csv'),
      path.join(__dirname, 'database', 'questions.csv'),
      path.join(process.cwd(), 'questions.csv')
    ];
    
    // Find existing questions file or create in first location
    let questionsPath = paths[0];
    for (const path of paths) {
      if (fs.existsSync(path)) {
        questionsPath = path;
        break;
      }
    }
    
    // Create default questions file
    await questionLoader.createDefaultQuestionsFile(questionsPath);
    
    return {
      success: true,
      message: `Questions file created at ${questionsPath}`,
      path: questionsPath
    };
  } catch (error) {
    console.error(`[FIX] Error fixing questions file: ${error.message}`);
    return {
      success: false,
      error: error.message
    };
  }
}

// Export the utilities
module.exports = {
  initializeInterviewSystem,
  getCandidateProgress,
  generateReport,
  fixQuestionsFile
};

// If called directly, run initialization
if (require.main === module) {
  const candidateName = process.argv[2] || localStorage.getItem('candidateName') || 'TestCandidate';
  
  initializeInterviewSystem(candidateName)
    .then(result => {
      console.log(result);
      
      if (result.success) {
        return fixQuestionsFile();
      }
      
      return result;
    })
    .then(result => {
      console.log(result);
      process.exit(result.success ? 0 : 1);
    })
    .catch(error => {
      console.error('Critical error:', error);
      process.exit(1);
    });
}
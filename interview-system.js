// interview-system.js - Integration module for the 3-stage interview system
const fs = require('fs');
const path = require('path');
const { ipcRenderer } = require('electron');
const { createClient } = require('@supabase/supabase-js');
const ResumeAnalyzer = require('./resume-analyzer');

/**
 * Interview System class that integrates all components
 */
class InterviewSystem {
  /**
   * Creates a new InterviewSystem instance
   * @param {object} options - Configuration options
   */
  constructor(options = {}) {
    this.candidateName = options.candidateName || 'Unknown';
    this.candidateId = options.candidateId || 'unknown';
    this.jobTitle = options.jobTitle || 'Software Engineer';
    this.supabaseClient = null;
    this.supabaseUrl = options.supabaseUrl || '';
    this.supabaseKey = options.supabaseKey || '';
    this.llmPreferences = options.llmPreferences || {};
    this.stages = ['Resume', 'Aptitude', 'Coding', 'Interview'];
    this.currentStage = 'Resume';
    this.progressData = {};
    this.resultsData = {};
    
    // Initialize Supabase if credentials are provided
    if (this.supabaseUrl && this.supabaseKey) {
      this.supabaseClient = createClient(this.supabaseUrl, this.supabaseKey);
    }
    
    // Create resume analyzer instance
    this.resumeAnalyzer = new ResumeAnalyzer({
      candidateName: this.candidateName,
      candidateId: this.candidateId,
      jobTitle: this.jobTitle,
      supabaseUrl: this.supabaseUrl,
      supabaseKey: this.supabaseKey,
      requiredSkills: options.requiredSkills || [],
      preferredSkills: options.preferredSkills || [],
      minimumExperience: options.minimumExperience || 0
    });
  }
  
  /**
   * Initialize the interview system
   * @returns {Promise<boolean>} - Whether initialization was successful
   */
  async initialize() {
    try {
      // Load LLM preferences
      this.llmPreferences = await ipcRenderer.invoke('get-llm-preferences');
      
      // Load candidate progress
      await this.loadProgress();
      
      // Determine current stage
      this.determineCurrentStage();
      
      return true;
    } catch (error) {
      console.error('Error initializing interview system:', error);
      return false;
    }
  }
  
  /**
   * Load candidate progress data
   * @returns {Promise<object>} - Progress data
   */
  async loadProgress() {
    try {
      // Create candidate directory if it doesn't exist
      const candidateDir = path.join(__dirname, 'database', 'candidates', this.candidateName);
      if (!fs.existsSync(candidateDir)) {
        fs.mkdirSync(candidateDir, { recursive: true });
      }
      
      // Check if progress file exists
      const progressPath = path.join(candidateDir, 'progress.json');
      
      if (fs.existsSync(progressPath)) {
        // Load progress from file
        this.progressData = JSON.parse(fs.readFileSync(progressPath, 'utf8'));
      } 
      // If not in local storage, check Supabase
      else if (this.supabaseClient) {
        const { data, error } = await this.supabaseClient
          .from('candidate_progress')
          .select('*')
          .eq('candidate_id', this.candidateId);
        
        if (error) throw error;
        
        if (data && data.length > 0) {
          // Convert array of progress records to object format
          for (const item of data) {
            this.progressData[item.stage] = {
              completed: item.completed,
              passed: item.passed,
              timestamp: item.timestamp
            };
          }
          
          // Save progress to local file
          fs.writeFileSync(progressPath, JSON.stringify(this.progressData, null, 2));
        }
      }
      
      return this.progressData;
    } catch (error) {
      console.error('Error loading progress data:', error);
      return {};
    }
  }
  
  /**
   * Determine the current interview stage based on progress
   * @returns {string} - Current stage
   */
  determineCurrentStage() {
    // Check each stage in order
    for (const stage of this.stages) {
      const stageData = this.progressData[stage];
      
      // If stage is not completed or not passed, this is the current stage
      if (!stageData || !stageData.completed || !stageData.passed) {
        this.currentStage = stage;
        break;
      }
    }
    
    return this.currentStage;
  }
  
  /**
   * Get the URL for the current stage
   * @returns {string} - URL for the current stage
   */
  getCurrentStageUrl() {
    switch (this.currentStage) {
      case 'Resume':
        return 'resume.html';
      case 'Aptitude':
        return 'aptitude.html';
      case 'Coding':
        return 'coding.html';
      case 'Interview':
        return 'interview.html';
      default:
        return 'results.html';
    }
  }
  
  /**
   * Load results for a specific stage
   * @param {string} stage - The stage to load results for
   * @returns {Promise<object|null>} - Results data or null if not available
   */
  async loadStageResults(stage) {
    try {
      // Normalize stage name
      const normalizedStage = stage.toLowerCase();
      
      // Check if results are already loaded
      if (this.resultsData[normalizedStage]) {
        return this.resultsData[normalizedStage];
      }
      
      // Create candidate directory path
      const candidateDir = path.join(__dirname, 'database', 'candidates', this.candidateName);
      
      // Check if results file exists
      const resultsPath = path.join(candidateDir, `${normalizedStage}_results.json`);
      
      if (fs.existsSync(resultsPath)) {
        // Load results from file
        this.resultsData[normalizedStage] = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
      }
      // If not in local storage, check Supabase
      else if (this.supabaseClient) {
        let tableName;
        switch (normalizedStage) {
          case 'resume':
            tableName = 'resume_analysis';
            break;
          case 'aptitude':
            tableName = 'aptitude_results';
            break;
          case 'coding':
            tableName = 'coding_results';
            break;
          case 'interview':
            tableName = 'interview_results';
            break;
          default:
            return null;
        }
        
        const { data, error } = await this.supabaseClient
          .from(tableName)
          .select('*')
          .eq('candidate_id', this.candidateId)
          .single();
        
        if (error && error.code !== 'PGRST116') throw error; // PGRST116 is "not found"
        
        if (data) {
          // Handle different data structures across tables
          this.resultsData[normalizedStage] = normalizedStage === 'resume'
            ? data.analysis_details
            : data.results;
            
          // Save results to local file
          fs.writeFileSync(resultsPath, JSON.stringify(this.resultsData[normalizedStage], null, 2));
        } else {
          return null;
        }
      } else {
        return null;
      }
      
      return this.resultsData[normalizedStage];
    } catch (error) {
      console.error(`Error loading ${stage} results:`, error);
      return null;
    }
  }
  
  /**
   * Update progress for a stage
   * @param {string} stage - The stage to update
   * @param {boolean} completed - Whether the stage is completed
   * @param {boolean} passed - Whether the stage was passed
   * @returns {Promise<boolean>} - Whether the update was successful
   */
  async updateProgress(stage, completed, passed) {
    try {
      // Update local progress data
      this.progressData[stage] = {
        completed,
        passed,
        timestamp: new Date().toISOString()
      };
      
      // Create candidate directory if it doesn't exist
      const candidateDir = path.join(__dirname, 'database', 'candidates', this.candidateName);
      if (!fs.existsSync(candidateDir)) {
        fs.mkdirSync(candidateDir, { recursive: true });
      }
      
      // Save progress to file
      const progressPath = path.join(candidateDir, 'progress.json');
      fs.writeFileSync(progressPath, JSON.stringify(this.progressData, null, 2));
      
      // If Supabase is available, update progress in Supabase
      if (this.supabaseClient) {
        const { data, error } = await this.supabaseClient
          .from('candidate_progress')
          .upsert({
            candidate_id: this.candidateId,
            stage,
            completed,
            passed,
            timestamp: new Date().toISOString()
          });
        
        if (error) throw error;
      }
      
      // Recalculate current stage
      this.determineCurrentStage();
      
      return true;
    } catch (error) {
      console.error(`Error updating progress for ${stage}:`, error);
      return false;
    }
  }
  
  /**
   * Process a resume file
   * @param {string} resumePath - Path to the resume file
   * @returns {Promise<object|null>} - Analysis results or null if failed
   */
  async processResume(resumePath) {
    try {
      // Load the resume
      await this.resumeAnalyzer.loadResume(resumePath);
      
      // Analyze the resume
      const analysisResults = await this.resumeAnalyzer.analyzeWithAI();
      
      // Update progress
      await this.updateProgress('Resume', true, true); // Always pass resume stage
      
      return analysisResults;
    } catch (error) {
      console.error('Error processing resume:', error);
      return null;
    }
  }
  
  /**
   * Calculate overall candidate score
   * @returns {Promise<object>} - Score data
   */
  async calculateOverallScore() {
    try {
      // Load results for all stages
      const resumeResults = await this.loadStageResults('resume');
      const aptitudeResults = await this.loadStageResults('aptitude');
      const codingResults = await this.loadStageResults('coding');
      const interviewResults = await this.loadStageResults('interview');
      
      // Define weights for each component
      const weights = {
        resume: 0.1,    // 10%
        aptitude: 0.2,  // 20%
        coding: 0.3,    // 30%
        interview: 0.4  // 40%
      };
      
      let totalScore = 0;
      let totalWeight = 0;
      
      // Add resume score if available
      if (resumeResults && typeof resumeResults.overallScore === 'number') {
        totalScore += resumeResults.overallScore * weights.resume;
        totalWeight += weights.resume;
      }
      
      // Add aptitude score if available
      if (aptitudeResults && typeof aptitudeResults.score === 'number') {
        totalScore += aptitudeResults.score * weights.aptitude;
        totalWeight += weights.aptitude;
      }
      
      // Add coding score if available
      if (codingResults && typeof codingResults.score === 'number') {
        totalScore += codingResults.score * weights.coding;
        totalWeight += weights.coding;
      }
      
      // Add interview score if available
      if (interviewResults && typeof interviewResults.overallScore === 'number') {
        totalScore += interviewResults.overallScore * weights.interview;
        totalWeight += weights.interview;
      }
      
      // Adjust for missing components
      const adjustedScore = totalWeight > 0 ? (totalScore / totalWeight) : 0;
      
      // Round to nearest integer
      const finalScore = Math.round(adjustedScore);
      
      // Generate ranking
      const ranking = this.generateRanking(finalScore);
      
      return {
        overallScore: finalScore,
        componentScores: {
          resume: resumeResults?.overallScore,
          aptitude: aptitudeResults?.score,
          coding: codingResults?.score,
          interview: interviewResults?.overallScore
        },
        weights,
        ranking,
        allCompleted: resumeResults && aptitudeResults && codingResults && interviewResults,
        allPassed: 
          (resumeResults ? true : false) && 
          (aptitudeResults ? aptitudeResults.passed : false) && 
          (codingResults ? codingResults.passed : false) && 
          (interviewResults ? true : false)
      };
    } catch (error) {
      console.error('Error calculating overall score:', error);
      return {
        overallScore: 0,
        componentScores: {},
        weights: {},
        ranking: this.generateRanking(0),
        allCompleted: false,
        allPassed: false
      };
    }
  }
  
  /**
   * Generate ranking based on overall score
   * @param {number} score - Overall score
   * @returns {object} - Ranking object with title and description
   */
  generateRanking(score) {
    if (score >= 90) {
      return {
        title: "Excellent Candidate",
        description: "This candidate has demonstrated exceptional skills and would be a valuable addition to the team.",
        recommendation: "Strongly Recommend",
        class: "excellent"
      };
    } else if (score >= 80) {
      return {
        title: "Strong Candidate",
        description: "This candidate has shown strong capabilities across all assessment areas.",
        recommendation: "Recommend",
        class: "strong"
      };
    } else if (score >= 70) {
      return {
        title: "Qualified Candidate",
        description: "This candidate meets the basic requirements for the position.",
        recommendation: "Consider",
        class: "qualified"
      };
    } else if (score >= 60) {
      return {
        title: "Potential Candidate",
        description: "This candidate shows potential but has some areas that need improvement.",
        recommendation: "Consider with Reservations",
        class: "potential"
      };
    } else {
      return {
        title: "Needs Development",
        description: "This candidate needs significant development in multiple areas before being ready for this position.",
        recommendation: "Do Not Recommend",
        class: "needs-development"
      };
    }
  }
}

module.exports = InterviewSystem;
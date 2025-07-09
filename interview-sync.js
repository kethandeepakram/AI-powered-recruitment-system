// interview-sync.js - Enhanced module for syncing interview data with Supabase
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

class InterviewSync {
  constructor(options = {}) {
    this.candidateName = options.candidateName || 'Unknown';
    this.candidateId = options.candidateId || this.candidateName.toLowerCase().replace(/\s+/g, '_');
    this.logFunction = options.logFunction || console.log;
    this.supabaseUrl = 'https://rwltvffgtbonkijirzwy.supabase.co';
    this.supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ3bHR2ZmZndGJvbmtpamlyend5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDI0MDkxNjQsImV4cCI6MjA1Nzk4NTE2NH0.QRkmGwUVjaQ2dM5fB9Gj78epGFkMKFnAMF6dKAsJD60';
    this.supabase = null;
    this.questionsPath = path.join(process.cwd(), 'database', 'questions.csv');
    this.initialized = false;
    this.retryAttempts = 3; // Number of retry attempts for operations
    this.retryDelay = 1000; // Delay between retries in ms
  }

  /**
   * Initialize the interview sync system with retry logic
   * @returns {Promise<Object>} Initialization result
   */
  async initInterview() {
    if (this.initialized) {
      return { success: true, message: 'Already initialized' };
    }

    let attempts = 0;
    
    while (attempts < this.retryAttempts) {
      try {
        // Initialize Supabase with error handling
        this.supabase = createClient(this.supabaseUrl, this.supabaseKey);
        this.logFunction(`[SYNC] Initialized Supabase client (attempt ${attempts + 1})`);
        
        // Create necessary directories with error handling
        await this.ensureDirectoriesExist();
        
        // Create REPORT.txt if it doesn't exist
        await this.ensureReportFileExists();
        
        // Sync questions.csv from Supabase
        await this.syncQuestionsFile();
        
        this.initialized = true;
        return { success: true, message: 'Interview system initialized successfully' };
      } catch (error) {
        attempts++;
        this.logFunction(`[SYNC] Error initializing interview system (attempt ${attempts}): ${error.message}`);
        
        if (attempts >= this.retryAttempts) {
          return { success: false, error: error.message };
        }
        
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, this.retryDelay));
      }
    }
  }

  /**
   * Ensure all necessary directories exist
   * @returns {Promise<boolean>} Success status
   */
  async ensureDirectoriesExist() {
    try {
      // Create database directory if it doesn't exist
      const dbDir = path.join(process.cwd(), 'database');
      if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
        this.logFunction('[SYNC] Created database directory');
      }
      
      // Create candidates directory if it doesn't exist
      const candidatesDir = path.join(dbDir, 'candidates');
      if (!fs.existsSync(candidatesDir)) {
        fs.mkdirSync(candidatesDir, { recursive: true });
        this.logFunction('[SYNC] Created candidates directory');
      }
      
      // Create candidate directory if it doesn't exist
      const candidateDir = path.join(candidatesDir, this.candidateName);
      if (!fs.existsSync(candidateDir)) {
        fs.mkdirSync(candidateDir, { recursive: true });
        this.logFunction(`[SYNC] Created candidate directory for ${this.candidateName}`);
      }
      
      return true;
    } catch (error) {
      this.logFunction(`[SYNC] Error creating directories: ${error.message}`);
      throw error;
    }
  }

  /**
   * Ensure REPORT.txt exists
   * @returns {Promise<boolean>} Success status
   */
  async ensureReportFileExists() {
    try {
      const reportPath = path.join(process.cwd(), 'database', 'candidates', this.candidateName, 'REPORT.txt');
      
      if (!fs.existsSync(reportPath)) {
        const initialReport = `INTERVIEW REPORT FOR: ${this.candidateName}\n`;
        const reportContent = initialReport + 
          `ID: ${this.candidateId}\n` +
          `Generated: ${new Date().toISOString()}\n\n` +
          `HR INTERVIEW SYSTEM\n` +
          `===================\n\n`;
        
        fs.writeFileSync(reportPath, reportContent);
        this.logFunction(`[SYNC] Created initial REPORT.txt for ${this.candidateName}`);
      }
      
      return true;
    } catch (error) {
      this.logFunction(`[SYNC] Error creating REPORT.txt: ${error.message}`);
      throw error;
    }
  }

  /**
   * Sync questions.csv from Supabase with improved error handling
   * @returns {Promise<boolean>} Success status
   */
  async syncQuestionsFile() {
    let attempts = 0;
    
    while (attempts < this.retryAttempts) {
      try {
        if (!this.supabase) {
          this.supabase = createClient(this.supabaseUrl, this.supabaseKey);
        }

        // Check if questions.csv exists in Supabase
        this.logFunction(`[SYNC] Checking for questions.csv in Supabase (attempt ${attempts + 1})`);
        const { data, error } = await this.supabase.storage
          .from('questions')
          .download('questions.csv');
        
        if (error) {
          this.logFunction(`[SYNC] Error downloading questions.csv: ${error.message}`);
          
          // Create default questions file if we've exhausted retries
          if (attempts >= this.retryAttempts - 1) {
            this.logFunction('[SYNC] Creating default questions file after failed downloads');
            await this.createDefaultQuestionsFile();
            return false;
          }
        } else {
          // Create directory if it doesn't exist
          const dir = path.dirname(this.questionsPath);
          if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
          }
          
          // Save the questions.csv file
          const buffer = Buffer.from(await data.arrayBuffer());
          fs.writeFileSync(this.questionsPath, buffer);
          this.logFunction(`[SYNC] Downloaded questions.csv from Supabase to ${this.questionsPath}`);
          
          return true;
        }
        
        attempts++;
        if (attempts < this.retryAttempts) {
          await new Promise(resolve => setTimeout(resolve, this.retryDelay));
        }
      } catch (error) {
        this.logFunction(`[SYNC] Error syncing questions file (attempt ${attempts + 1}): ${error.message}`);
        
        attempts++;
        if (attempts >= this.retryAttempts) {
          // Create a default questions file if all retries fail
          this.logFunction('[SYNC] Creating default questions file after errors');
          await this.createDefaultQuestionsFile();
          return false;
        }
        
        await new Promise(resolve => setTimeout(resolve, this.retryDelay));
      }
    }
    
    return false;
  }

  /**
   * Create default questions file if sync fails
   * @returns {Promise<boolean>} Success status
   */
  async createDefaultQuestionsFile() {
    try {
      const defaultContent = this.getDefaultQuestionsCSV();
      
      // Create directory if it doesn't exist
      const dir = path.dirname(this.questionsPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      // Write the default questions file
      fs.writeFileSync(this.questionsPath, defaultContent);
      this.logFunction(`[SYNC] Created default questions.csv at ${this.questionsPath}`);
      
      return true;
    } catch (error) {
      this.logFunction(`[SYNC] Error creating default questions file: ${error.message}`);
      return false;
    }
  }

  /**
   * Get default questions CSV content
   * @returns {string} CSV content
   */
  getDefaultQuestionsCSV() {
    return `stage,question,category,options,correctAnswer,testCases,expectedOutput,answerTime
HR,"Tell me about yourself and your background.",Introduction,,,,,60
HR,"What are your greatest strengths?",Self-Assessment,,,,,60
HR,"What do you consider to be your weaknesses?",Self-Assessment,,,,,60
HR,"Why are you interested in this position?",Motivation,,,,,60
HR,"Describe a challenging situation at work and how you handled it.",Experience,,,,,60
HR,"Where do you see yourself professionally in five years?",Career Goals,,,,,60
HR,"How do you handle stress and pressure?",Work Style,,,,,60
HR,"Tell me about a time when you had to adapt to a significant change at work.",Adaptability,,,,,60
HR,"How would your colleagues describe your communication style?",Communication,,,,,60
HR,"What motivates you in your work?",Motivation,,,,,60`;
  }

  /**
   * Get the questions.csv file path
   * @returns {string} Path to questions.csv
   */
  getQuestionsPath() {
    return this.questionsPath;
  }

  /**
   * Upload candidate data to Supabase with retry logic
   * @returns {Promise<Object>} Upload result
   */
  async uploadCandidateData() {
    let attempts = 0;
    
    while (attempts < this.retryAttempts) {
      try {
        if (!this.supabase) {
          this.supabase = createClient(this.supabaseUrl, this.supabaseKey);
        }

        // Get candidate directory
        const candidateDir = path.join(process.cwd(), 'database', 'candidates', this.candidateName);
        if (!fs.existsSync(candidateDir)) {
          return { success: false, error: 'Candidate directory not found' };
        }
        
        // Read the REPORT.txt file
        const reportPath = path.join(candidateDir, 'REPORT.txt');
        if (!fs.existsSync(reportPath)) {
          return { success: false, error: 'Report file not found' };
        }
        
        const reportContent = fs.readFileSync(reportPath, 'utf8');
        
        // Upload to Supabase
        const { data, error } = await this.supabase.storage
          .from('candidates')
          .upload(`${this.candidateId}/REPORT.txt`, reportContent, {
            upsert: true,
            contentType: 'text/plain'
          });
        
        if (error) {
          this.logFunction(`[SYNC] Error uploading REPORT.txt (attempt ${attempts + 1}): ${error.message}`);
          
          attempts++;
          if (attempts >= this.retryAttempts) {
            return { success: false, error: error.message };
          }
          
          await new Promise(resolve => setTimeout(resolve, this.retryDelay));
          continue;
        }
        
        // Upload progress.json if it exists
        const progressPath = path.join(candidateDir, 'progress.json');
        if (fs.existsSync(progressPath)) {
          const progressContent = fs.readFileSync(progressPath);
          
          const { error: progressError } = await this.supabase.storage
            .from('candidates')
            .upload(`${this.candidateId}/progress.json`, progressContent, {
              upsert: true,
              contentType: 'application/json'
            });
          
          if (progressError) {
            this.logFunction(`[SYNC] Error uploading progress.json: ${progressError.message}`);
          } else {
            this.logFunction('[SYNC] Uploaded progress.json successfully');
          }
        }
        
        // Upload all result files
        const resultFiles = [
          'aptitude_results.json',
          'coding_results.json',
          'interview_results.json'
        ];
        
        for (const file of resultFiles) {
          const filePath = path.join(candidateDir, file);
          if (fs.existsSync(filePath)) {
            const fileContent = fs.readFileSync(filePath);
            
            const { error: fileError } = await this.supabase.storage
              .from('candidates')
              .upload(`${this.candidateId}/${file}`, fileContent, {
                upsert: true,
                contentType: 'application/json'
              });
            
            if (fileError) {
              this.logFunction(`[SYNC] Error uploading ${file}: ${fileError.message}`);
            } else {
              this.logFunction(`[SYNC] Uploaded ${file} successfully`);
            }
          }
        }
        
        // Upload screenshots if they exist
        const screenshotsDir = path.join(candidateDir, 'screenshots');
        if (fs.existsSync(screenshotsDir)) {
          const screenshots = fs.readdirSync(screenshotsDir)
            .filter(file => file.endsWith('.jpg') || file.endsWith('.png'));
          
          for (const screenshot of screenshots) {
            const screenshotPath = path.join(screenshotsDir, screenshot);
            const fileContent = fs.readFileSync(screenshotPath);
            
            const { error: screenshotError } = await this.supabase.storage
              .from('candidates')
              .upload(`${this.candidateId}/screenshots/${screenshot}`, fileContent, {
                upsert: true,
                contentType: 'image/jpeg'
              });
            
            if (screenshotError) {
              this.logFunction(`[SYNC] Error uploading screenshot ${screenshot}: ${screenshotError.message}`);
            } else {
              this.logFunction(`[SYNC] Uploaded screenshot ${screenshot} successfully`);
            }
          }
        }
        
        // Upload audio files if they exist
        const audioDir = path.join(candidateDir, 'audio');
        if (fs.existsSync(audioDir)) {
          const audioFiles = fs.readdirSync(audioDir)
            .filter(file => file.endsWith('.webm') || file.endsWith('.mp3'));
          
          for (const audioFile of audioFiles) {
            const audioPath = path.join(audioDir, audioFile);
            const fileContent = fs.readFileSync(audioPath);
            
            const contentType = audioFile.endsWith('.webm') ? 'audio/webm' : 'audio/mpeg';
            
            const { error: audioError } = await this.supabase.storage
              .from('candidates')
              .upload(`${this.candidateId}/audio/${audioFile}`, fileContent, {
                upsert: true,
                contentType
              });
            
            if (audioError) {
              this.logFunction(`[SYNC] Error uploading audio ${audioFile}: ${audioError.message}`);
            } else {
              this.logFunction(`[SYNC] Uploaded audio ${audioFile} successfully`);
            }
          }
        }
        
        return { success: true, message: 'Candidate data uploaded successfully' };
      } catch (error) {
        this.logFunction(`[SYNC] Error uploading candidate data (attempt ${attempts + 1}): ${error.message}`);
        
        attempts++;
        if (attempts >= this.retryAttempts) {
          return { success: false, error: error.message };
        }
        
        await new Promise(resolve => setTimeout(resolve, this.retryDelay));
      }
    }
    
    return { success: false, error: 'Maximum retry attempts exceeded' };
  }

  /**
   * Sync candidate data from Supabase with retry logic
   * @returns {Promise<Object>} Sync result
   */
  async syncFromCloud() {
    let attempts = 0;
    
    while (attempts < this.retryAttempts) {
      try {
        if (!this.supabase) {
          this.supabase = createClient(this.supabaseUrl, this.supabaseKey);
        }

        // Download questions.csv first
        await this.syncQuestionsFile();
        
        // Check if candidate data exists in Supabase
        const { data, error } = await this.supabase.storage
          .from('candidates')
          .list(`${this.candidateId}`);
        
        if (error) {
          this.logFunction(`[SYNC] Error listing candidate files (attempt ${attempts + 1}): ${error.message}`);
          
          attempts++;
          if (attempts >= this.retryAttempts) {
            return { success: false, error: error.message };
          }
          
          await new Promise(resolve => setTimeout(resolve, this.retryDelay));
          continue;
        }
        
        if (!data || data.length === 0) {
          this.logFunction(`[SYNC] No candidate data found in Supabase for ID: ${this.candidateId}`);
          return { success: false, error: 'No candidate data found' };
        }
        
        // Create candidate directory if it doesn't exist
        const candidateDir = path.join(process.cwd(), 'database', 'candidates', this.candidateName);
        if (!fs.existsSync(candidateDir)) {
          fs.mkdirSync(candidateDir, { recursive: true });
        }
        
        // Download all files
        for (const file of data) {
          const { data: fileData, error: fileError } = await this.supabase.storage
            .from('candidates')
            .download(`${this.candidateId}/${file.name}`);
          
          if (fileError) {
            this.logFunction(`[SYNC] Error downloading ${file.name}: ${fileError.message}`);
            continue;
          }
          
          // Save the file
          const filePath = path.join(candidateDir, file.name);
          
          // Create subdirectories if needed
          const fileDir = path.dirname(filePath);
          if (!fs.existsSync(fileDir)) {
            fs.mkdirSync(fileDir, { recursive: true });
          }
          
          const buffer = Buffer.from(await fileData.arrayBuffer());
          fs.writeFileSync(filePath, buffer);
          this.logFunction(`[SYNC] Downloaded ${file.name} from Supabase`);
        }
        
        return { success: true, message: 'Candidate data synced successfully' };
      } catch (error) {
        this.logFunction(`[SYNC] Error syncing from cloud (attempt ${attempts + 1}): ${error.message}`);
        
        attempts++;
        if (attempts >= this.retryAttempts) {
          return { success: false, error: error.message };
        }
        
        await new Promise(resolve => setTimeout(resolve, this.retryDelay));
      }
    }
    
    return { success: false, error: 'Maximum retry attempts exceeded' };
  }
  
  /**
   * Initialize standalone (for direct use without init)
   * @returns {Promise<void>}
   */
  async init() {
    if (!this.initialized) {
      this.supabase = createClient(this.supabaseUrl, this.supabaseKey);
      this.initialized = true;
    }
  }
  
  /**
   * Download questions from Supabase (standalone method)
   * @returns {Promise<boolean>} Success status
   */
  async downloadQuestions() {
    return await this.syncQuestionsFile();
  }
}

module.exports = InterviewSync;
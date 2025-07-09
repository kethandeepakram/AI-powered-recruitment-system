// hr-sync.js - Handles syncing candidate data with cloud services
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const https = require('https');

// Supabase client cache
let supabaseClient = null;

/**
 * Initialize Supabase client
 * @returns {Object|null} Supabase client or null if initialization fails
 */
function initSupabaseClient() {
  try {
    // If we already have a client, return it
    if (supabaseClient) return supabaseClient;
    
    // Get credentials from environment or config
    const supabaseUrl = process.env.SUPABASE_URL || 'https://rwltvffgtbonkijirzwy.supabase.co';
    const supabaseKey = process.env.SUPABASE_KEY || 
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ3bHR2ZmZndGJvbmtpamlyend5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDI0MDkxNjQsImV4cCI6MjA1Nzk4NTE2NH0.QRkmGwUVjaQ2dM5fB9Gj78epGFkMKFnAMF6dKAsJD60';
    
    if (!supabaseUrl || !supabaseKey) {
      console.warn('Supabase URL or key not provided.');
      return null;
    }
    
    // Create Supabase client
    supabaseClient = createClient(supabaseUrl, supabaseKey);
    console.log('Supabase client initialized');
    
    return supabaseClient;
  } catch (error) {
    console.error('Error initializing Supabase client:', error);
    return null;
  }
}

/**
 * Determine content type based on file extension
 * @param {string} filePath - Path to the file
 * @returns {string} Content type (MIME type)
 */
function getContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes = {
    '.pdf': 'application/pdf',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.txt': 'text/plain',
    '.csv': 'text/csv',
    '.json': 'application/json',
    '.mp3': 'audio/mpeg',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.wav': 'audio/wav',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  };
  
  return mimeTypes[ext] || 'application/octet-stream';
}

/**
 * Sync candidates to cloud storage
 * @param {string} databasePath - Path to the local database
 * @returns {Promise<object>} Result of sync operation
 */
async function syncCandidatesToCloud(databasePath) {
  try {
    const supabase = initSupabaseClient();
    
    if (!supabase) {
      return { success: false, error: 'Supabase client not initialized' };
    }
    
    const candidatesPath = path.join(databasePath, 'candidates');
    
    if (!fs.existsSync(candidatesPath)) {
      return { success: false, error: 'Candidates directory not found' };
    }
    
    // Get list of candidate folders
    const candidateFolders = fs.readdirSync(candidatesPath, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);
    
    console.log(`Found ${candidateFolders.length} candidate folders to sync`);
    
    const results = {
      success: true,
      syncedCandidates: [],
      failedCandidates: []
    };
    
    // Process each candidate folder
    for (const candidateName of candidateFolders) {
      try {
        const candidateDir = path.join(candidatesPath, candidateName);
        
        // Check if candidate has a progress.json file
        const progressPath = path.join(candidateDir, 'progress.json');
        
        if (!fs.existsSync(progressPath)) {
          console.log(`Skipping candidate ${candidateName} - no progress.json found`);
          continue;
        }
        
        // Read progress data
        const progressData = JSON.parse(fs.readFileSync(progressPath, 'utf8'));
        
        // Upload progress data to Supabase
        for (const [stage, data] of Object.entries(progressData)) {
          const { data: insertResult, error } = await supabase
            .from('candidate_progress')
            .upsert({
              candidate_id: candidateName.replace(/\s+/g, '_').toLowerCase(),
              candidate_name: candidateName,
              stage,
              completed: data.completed,
              passed: data.passed,
              timestamp: data.timestamp || new Date().toISOString()
            });
          
          if (error) throw error;
        }
        
        // Upload key files to Supabase Storage
        await uploadCandidateFiles(supabase, candidateDir, candidateName);
        
        results.syncedCandidates.push(candidateName);
      } catch (candidateError) {
        console.error(`Error syncing candidate ${candidateName}:`, candidateError);
        results.failedCandidates.push({
          name: candidateName,
          error: candidateError.message
        });
      }
    }
    
    return results;
  } catch (error) {
    console.error('Error syncing candidates to cloud:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Sync candidates from cloud storage
 * @param {string} databasePath - Path to the local database
 * @returns {Promise<object>} Result of sync operation
 */
async function syncCandidatesFromCloud(databasePath) {
  try {
    const supabase = initSupabaseClient();
    
    if (!supabase) {
      return { success: false, error: 'Supabase client not initialized' };
    }
    
    // Create candidates directory if it doesn't exist
    const candidatesPath = path.join(databasePath, 'candidates');
    if (!fs.existsSync(candidatesPath)) {
      fs.mkdirSync(candidatesPath, { recursive: true });
    }
    
    // Get candidate progress data from Supabase
    const { data: progressData, error: progressError } = await supabase
      .from('candidate_progress')
      .select('*');
    
    if (progressError) throw progressError;
    
    if (!progressData || progressData.length === 0) {
      return { success: true, message: 'No candidates found in cloud' };
    }
    
    // Group progress data by candidate
    const candidateProgress = {};
    for (const item of progressData) {
      if (!candidateProgress[item.candidate_name]) {
        candidateProgress[item.candidate_name] = {};
      }
      
      candidateProgress[item.candidate_name][item.stage] = {
        completed: item.completed,
        passed: item.passed,
        timestamp: item.timestamp
      };
    }
    
    const results = {
      success: true,
      syncedCandidates: [],
      failedCandidates: []
    };
    
    // Process each candidate
    for (const [candidateName, progress] of Object.entries(candidateProgress)) {
      try {
        // Create candidate directory if it doesn't exist
        const candidateDir = path.join(candidatesPath, candidateName);
        if (!fs.existsSync(candidateDir)) {
          fs.mkdirSync(candidateDir, { recursive: true });
        }
        
        // Save progress data
        const progressPath = path.join(candidateDir, 'progress.json');
        fs.writeFileSync(progressPath, JSON.stringify(progress, null, 2));
        
        // Download candidate files from Supabase Storage
        await downloadCandidateFiles(supabase, candidateDir, candidateName);
        
        results.syncedCandidates.push(candidateName);
      } catch (candidateError) {
        console.error(`Error syncing candidate ${candidateName} from cloud:`, candidateError);
        results.failedCandidates.push({
          name: candidateName,
          error: candidateError.message
        });
      }
    }
    
    return results;
  } catch (error) {
    console.error('Error syncing candidates from cloud:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Upload candidate files to Supabase Storage
 * @param {Object} supabase - Supabase client
 * @param {string} candidateDir - Path to candidate directory
 * @param {string} candidateName - Name of the candidate
 * @returns {Promise<void>}
 */
async function uploadCandidateFiles(supabase, candidateDir, candidateName) {
  // Create safe bucket name
  const bucketName = 'candidates';
  const folderPrefix = candidateName.replace(/\s+/g, '_').toLowerCase();
  
  // Key files to upload
  const filesToUpload = [
    { localPath: path.join(candidateDir, 'progress.json'), cloudPath: `${folderPrefix}/progress.json` },
    { localPath: path.join(candidateDir, 'REPORT.txt'), cloudPath: `${folderPrefix}/REPORT.txt` }
  ];
  
  // Additional directories to check for files
  const subDirs = ['audio', 'transcripts', 'screenshots', 'results'];
  
  // Add files from subdirectories
  for (const subDir of subDirs) {
    const subDirPath = path.join(candidateDir, subDir);
    
    if (fs.existsSync(subDirPath)) {
      const files = fs.readdirSync(subDirPath);
      
      for (const file of files) {
        filesToUpload.push({
          localPath: path.join(subDirPath, file),
          cloudPath: `${folderPrefix}/${subDir}/${file}`
        });
      }
    }
  }
  
  // Upload each file
  for (const file of filesToUpload) {
    if (fs.existsSync(file.localPath)) {
      const fileContent = fs.readFileSync(file.localPath);
      const contentType = getContentType(file.localPath);
      
      const { data, error } = await supabase.storage
        .from(bucketName)
        .upload(file.cloudPath, fileContent, {
          upsert: true,
          contentType
        });
      
      if (error) {
        console.error(`Error uploading ${file.localPath}:`, error);
      }
    }
  }
}

/**
 * Download candidate files from Supabase Storage
 * @param {Object} supabase - Supabase client
 * @param {string} candidateDir - Path to candidate directory
 * @param {string} candidateName - Name of the candidate
 * @returns {Promise<void>}
 */
async function downloadCandidateFiles(supabase, candidateDir, candidateName) {
  // Create safe folder name
  const bucketName = 'candidates';
  const folderPrefix = candidateName.replace(/\s+/g, '_').toLowerCase();
  
  // List files in the candidate's folder
  const { data, error } = await supabase.storage
    .from(bucketName)
    .list(folderPrefix);
  
  if (error) {
    console.error(`Error listing files for ${candidateName}:`, error);
    return;
  }
  
  if (!data || data.length === 0) {
    console.log(`No files found for ${candidateName}`);
    return;
  }
  
  // Download each file
  for (const item of data) {
    if (item.name) {
      try {
        const { data: fileData, error: fileError } = await supabase.storage
          .from(bucketName)
          .download(`${folderPrefix}/${item.name}`);
        
        if (fileError) throw fileError;
        
        const filePath = path.join(candidateDir, item.name);
        
        // Ensure directory exists
        const dirPath = path.dirname(filePath);
        if (!fs.existsSync(dirPath)) {
          fs.mkdirSync(dirPath, { recursive: true });
        }
        
        // Convert to buffer and save
        const buffer = Buffer.from(await fileData.arrayBuffer());
        fs.writeFileSync(filePath, buffer);
      } catch (downloadError) {
        console.error(`Error downloading ${item.name}:`, downloadError);
      }
    }
  }
}

// Export the functions
module.exports = {
  initSupabaseClient,
  getContentType,
  syncCandidatesToCloud,
  syncCandidatesFromCloud
};
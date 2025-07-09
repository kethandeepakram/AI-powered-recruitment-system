// supabase-sync.js
const fs = require('fs');
const path = require('path');
const { supabase } = require('./supabase-config');

/**
 * Upload a single file to Supabase Storage
 * @param {string} localFilePath - Path to the local file
 * @param {string} storagePath - Path in Supabase Storage
 * @returns {Promise<Object>} - Result of the upload operation
 */
async function uploadFileToSupabase(localFilePath, storagePath) {
  try {
    // Read the file as a buffer
    const fileBuffer = fs.readFileSync(localFilePath);
    
    // Upload the file to Supabase Storage
    const { data, error } = await supabase.storage
      .from('candidates')  // bucket name
      .upload(storagePath, fileBuffer, {
        upsert: true,  // overwrite if exists
        contentType: getContentType(localFilePath)
      });
    
    if (error) {
      console.error(`Error uploading file ${localFilePath}:`, error);
      return {
        success: false,
        error: error.message
      };
    }
    
    // Get the public URL
    const { data: publicUrlData } = supabase.storage
      .from('candidates')
      .getPublicUrl(storagePath);
    
    return {
      success: true,
      path: storagePath,
      url: publicUrlData?.publicUrl || null
    };
  } catch (error) {
    console.error(`Error uploading file ${localFilePath}:`, error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Sync all files for a specific candidate
 * @param {string} candidateName - Name of the candidate
 * @param {string} localPath - Base path for the local database
 * @returns {Promise<Object>} - Result of the sync operation
 */
async function syncCandidateToSupabase(candidateName, localPath) {
  try {
    console.log(`Syncing candidate: ${candidateName}`);
    
    // Create candidate folder path
    const candidatePath = path.join(localPath, 'candidates', candidateName);
    
    // Check if candidate folder exists
    if (!fs.existsSync(candidatePath)) {
      throw new Error(`Candidate directory not found: ${candidatePath}`);
    }
    
    // Get all files in the candidate directory
    const files = fs.readdirSync(candidatePath);
    
    // Results tracking
    const results = {
      uploaded: 0,
      failed: 0,
      details: []
    };
    
    // Upload each file
    for (const file of files) {
      const filePath = path.join(candidatePath, file);
      const fileStats = fs.statSync(filePath);
      
      // Skip directories and hidden files
      if (fileStats.isDirectory() || file.startsWith('.')) continue;
      
      // Create storage path
      const storagePath = `${candidateName}/${file}`;
      
      // Upload the file
      const result = await uploadFileToSupabase(filePath, storagePath);
      
      // Track results
      if (result.success) {
        results.uploaded++;
        results.details.push({
          file: file,
          status: 'uploaded',
          url: result.url
        });
        console.log(`Uploaded: ${file} to ${storagePath}`);
      } else {
        results.failed++;
        results.details.push({
          file: file,
          status: 'failed',
          error: result.error
        });
        console.error(`Failed to upload: ${file}. Error: ${result.error}`);
      }
    }
    
    // Save metadata for tracking changes
    const metadataPath = path.join(candidatePath, '.sync_metadata.json');
    fs.writeFileSync(metadataPath, JSON.stringify({
      lastSync: new Date().toISOString(),
      files: results.details
    }, null, 2));
    
    return {
      success: true,
      message: `Sync completed: ${results.uploaded} files uploaded, ${results.failed} failed`,
      results: results
    };
  } catch (error) {
    console.error("Sync error:", error);
    return {
      success: false,
      message: error.message
    };
  }
}

/**
 * Test Supabase Storage connection
 * @returns {Promise<Object>} - Connection test result
 */
async function testSupabaseConnection() {
  try {
    // Try to create a test file
    const testContent = `Test connection: ${new Date().toISOString()}`;
    const testBuffer = Buffer.from(testContent);
    
    // Upload test file
    const { data, error } = await supabase.storage
      .from('candidates')
      .upload('connection_test.txt', testBuffer, { 
        upsert: true,
        contentType: 'text/plain'
      });
    
    if (error) {
      console.error("Supabase connection test failed:", error);
      return {
        success: false,
        message: `Connection failed: ${error.message}`,
        error: error
      };
    }
    
    // Get public URL
    const { data: publicUrlData } = supabase.storage
      .from('candidates')
      .getPublicUrl('connection_test.txt');
    
    return {
      success: true,
      message: "Supabase Storage connection successful",
      url: publicUrlData?.publicUrl || null
    };
  } catch (error) {
    console.error("Supabase connection test failed:", error);
    return {
      success: false,
      message: `Connection failed: ${error.message}`,
      error: error
    };
  }
}

/**
 * Helper function to determine content type based on file extension
 * @param {string} filePath - Path to the file
 * @returns {string} - MIME type
 */
function getContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  
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
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  };
  
  return mimeTypes[ext] || 'application/octet-stream';
}

// Export functions
module.exports = {
  uploadFileToSupabase,
  syncCandidateToSupabase,
  testSupabaseConnection
};
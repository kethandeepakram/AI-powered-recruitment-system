// preload.js - Secure bridge between Electron's main process and renderer process
const { contextBridge, ipcRenderer } = require('electron');
const path = require('path');
const fs = require('fs');

// Expose protected methods to renderer process through the contextBridge
contextBridge.exposeInMainWorld(
  'electronAPI', {
    // Path-related operations
    getUserDataPath: () => ipcRenderer.invoke('get-user-data-path'),
    getResourcesPath: () => ipcRenderer.invoke('get-resources-path'),
    getAppPath: () => ipcRenderer.invoke('get-app-path'),
    
    // File system operations (secure wrappers)
    readFile: (filePath, options) => ipcRenderer.invoke('fs-read-file', filePath, options),
    writeFile: (filePath, data, options) => ipcRenderer.invoke('fs-write-file', filePath, data, options),
    fileExists: (filePath) => ipcRenderer.invoke('fs-exists', filePath),
    createDirectory: (dirPath, options) => ipcRenderer.invoke('fs-mkdir', dirPath, options),
    readDirectory: (dirPath) => ipcRenderer.invoke('fs-readdir', dirPath),
    
    // Log to main process
    log: (level, message) => ipcRenderer.send('log', { level, message }),
    
    // Candidate and interview operations
    initializeInterviewSystem: (candidateData) => ipcRenderer.invoke('initialize-interview-system', candidateData),
    processResume: (candidateId) => ipcRenderer.invoke('process-resume', candidateId),
    getCandidateProgress: () => ipcRenderer.invoke('get-candidate-progress'),
    calculateOverallScore: () => ipcRenderer.invoke('calculate-overall-score'),
    
    // Supabase sync operations
    syncCandidates: (direction) => ipcRenderer.invoke('sync-candidates', direction),
    downloadFileFromSupabase: (bucket, filePath, localPath) => 
      ipcRenderer.invoke('download-file-from-supabase', bucket, filePath, localPath),
    uploadFileToSupabase: (bucket, filePath, localPath) => 
      ipcRenderer.invoke('upload-file-to-supabase', bucket, filePath, localPath),
    
    // Configuration and preferences
    getLLMPreferences: () => ipcRenderer.invoke('get-llm-preferences'),
    testAPIKey: (apiKey) => ipcRenderer.invoke('test-api-key', apiKey),
    getSupabaseCredentials: () => ipcRenderer.invoke('get-supabase-credentials'),
    getJobPositions: () => ipcRenderer.invoke('get-job-positions'),
    
    // Code evaluation for coding test
    evaluateCodeWithGemini: (data) => ipcRenderer.invoke('evaluate-code-with-gemini', data),
    
    // Proctoring and notifications
    speakWarning: (message) => ipcRenderer.send('speak-warning', message),
    
    // DevTools and debugging
    openDevTools: () => ipcRenderer.send('open-dev-tools'),
    
    // Audio/Media support helpers
    checkMicrophonePermission: () => ipcRenderer.invoke('check-microphone-permission'),
    checkCameraPermission: () => ipcRenderer.invoke('check-camera-permission'),
    restartMediaDevices: () => ipcRenderer.send('restart-media-devices'),
    reloadWindow: () => ipcRenderer.send('reload-window'),
    
    // Audio debugging helper
    listAudioDevices: async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        return devices
          .filter(device => device.kind === 'audioinput')
          .map(device => ({
            deviceId: device.deviceId,
            label: device.label || 'Unlabeled Microphone',
            groupId: device.groupId
          }));
      } catch (err) {
        console.error('Error enumerating audio devices:', err);
        return [];
      }
    }
  }
);

// For direct manipulation of localStorage between main and renderer
contextBridge.exposeInMainWorld('electronStorage', {
  get: (key) => {
    try {
      return localStorage.getItem(key);
    } catch (error) {
      console.error('Error accessing localStorage:', error);
      return null;
    }
  },
  set: (key, value) => {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch (error) {
      console.error('Error writing to localStorage:', error);
      return false;
    }
  },
  remove: (key) => {
    try {
      localStorage.removeItem(key);
      return true;
    } catch (error) {
      console.error('Error removing from localStorage:', error);
      return false;
    }
  },
  clear: () => {
    try {
      localStorage.clear();
      return true;
    } catch (error) {
      console.error('Error clearing localStorage:', error);
      return false;
    }
  }
});

// Expose required Node.js modules through the contextBridge 
// This is safer than disabling contextIsolation
contextBridge.exposeInMainWorld('nodeModules', {
  path: {
    join: (...args) => path.join(...args),
    resolve: (...args) => path.resolve(...args),
    dirname: (p) => path.dirname(p),
    basename: (p, ext) => path.basename(p, ext),
    extname: (p) => path.extname(p)
  },
  fs: {
    existsSync: (path) => fs.existsSync(path),
    mkdirSync: (path, options) => fs.mkdirSync(path, options),
    writeFileSync: (path, data, options) => fs.writeFileSync(path, data, options),
    readFileSync: (path, options) => fs.readFileSync(path, options),
    readdirSync: (path) => fs.readdirSync(path)
  },
  process: {
    cwd: () => process.cwd(),
    platform: process.platform,
    env: process.env
  }
});

// Add listener for media device restart
ipcRenderer.on('action-restart-media', async () => {
  console.log('Received restart media request from main process');
  
  // Try to release all media resources
  try {
    // Close any active media streams
    if (window.activeCameraStream) {
      window.activeCameraStream.getTracks().forEach(track => track.stop());
    }
    if (window.activeMicrophoneStream) {
      window.activeMicrophoneStream.getTracks().forEach(track => track.stop());
    }
    
    // Release any active audio contexts
    if (window.audioContext) {
      try {
        await window.audioContext.close();
        console.log('Closed existing audioContext');
      } catch (err) {
        console.warn('Error closing audioContext:', err);
      }
    }
    
    console.log('Successfully released media resources');
  } catch (err) {
    console.warn('Error releasing media resources:', err);
  }
});

// Send ready message to main process
ipcRenderer.send('preload-ready');

console.log('Preload script initialized successfully');
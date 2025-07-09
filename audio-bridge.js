// audio-bridge.js - Integration between Electron and Python audio recorder
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const EventEmitter = require('events');

class AudioBridge extends EventEmitter {
  constructor(options = {}) {
    super();
    this.options = {
      pythonPath: options.pythonPath || 'python',
      scriptPath: options.scriptPath || path.join(__dirname, 'audio_recorder.py'),
      outputDir: options.outputDir || path.join(process.cwd(), 'database', 'candidates', 'audio'),
      debug: options.debug || false
    };
    
    this.process = null;
    this.recording = false;
    this.audioLevel = 0;
    this.currentFilename = null;
    this.availableDevices = [];
    
    // Create output directory if it doesn't exist
    if (!fs.existsSync(this.options.outputDir)) {
      fs.mkdirSync(this.options.outputDir, { recursive: true });
    }
    
    this._debug('AudioBridge initialized with options:', this.options);
  }
  
  _debug(...args) {
    if (this.options.debug) {
      console.log('[AudioBridge]', ...args);
    }
  }
  
  async getAudioDevices() {
    return new Promise((resolve, reject) => {
      const python = spawn(this.options.pythonPath, [
        this.options.scriptPath,
        '--list-devices'
      ]);
      
      let output = '';
      
      python.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      python.stderr.on('data', (data) => {
        this._debug('Python stderr:', data.toString());
      });
      
      python.on('close', (code) => {
        if (code !== 0) {
          return reject(new Error(`Process exited with code ${code}`));
        }
        
        try {
          const result = JSON.parse(output);
          if (result.type === 'devices') {
            this.availableDevices = result.devices;
            resolve(result.devices);
          } else {
            reject(new Error('Unexpected response format'));
          }
        } catch (err) {
          reject(new Error(`Failed to parse device list: ${err.message}`));
        }
      });
      
      python.on('error', (err) => {
        reject(new Error(`Failed to start Python process: ${err.message}`));
      });
    });
  }
  
  startRecording(deviceIndex = null) {
    if (this.recording) {
      this._debug('Recording already in progress');
      return Promise.resolve(false);
    }
    
    this._debug('Starting recording with device:', deviceIndex);
    
    return new Promise((resolve, reject) => {
      const args = [
        this.options.scriptPath,
        '--command', 'start',
        '--output-dir', this.options.outputDir
      ];
      
      if (deviceIndex !== null) {
        args.push('--device-index', deviceIndex);
      }
      
      this.process = spawn(this.options.pythonPath, args);
      
      this.process.stdout.on('data', (data) => {
        const lines = data.toString().trim().split('\n');
        
        for (const line of lines) {
          try {
            const message = JSON.parse(line);
            
            switch (message.type) {
              case 'command_result':
                if (message.result.status === 'success') {
                  this.recording = true;
                  this.currentFilename = message.result.filename;
                  resolve(true);
                } else {
                  reject(new Error(message.result.message));
                }
                break;
                
              case 'level':
                this.audioLevel = message.value;
                this.emit('level', message.value);
                break;
                
              case 'complete':
                this._debug('Recording completed:', message.filename);
                this.emit('complete', {
                  filename: message.filename,
                  duration: message.duration
                });
                break;
                
              default:
                this._debug('Unknown message type:', message);
            }
          } catch (err) {
            this._debug('Failed to parse message:', line, err);
          }
        }
      });
      
      this.process.stderr.on('data', (data) => {
        this._debug('Python stderr:', data.toString());
        this.emit('error', new Error(data.toString()));
      });
      
      this.process.on('close', (code) => {
        this._debug('Python process exited with code:', code);
        this.recording = false;
        this.process = null;
        
        if (code !== 0) {
          this.emit('error', new Error(`Recording process exited with code ${code}`));
        }
      });
      
      this.process.on('error', (err) => {
        this._debug('Failed to start Python process:', err);
        reject(new Error(`Failed to start recording: ${err.message}`));
      });
    });
  }
  
  stopRecording() {
    if (!this.recording || !this.process) {
      return Promise.resolve(false);
    }
    
    this._debug('Stopping recording');
    
    // We'll send SIGTERM to let the Python process handle cleanup
    this.process.kill('SIGTERM');
    
    return new Promise((resolve) => {
      // Wait for the process to exit
      const timeout = setTimeout(() => {
        if (this.process) {
          this.process.kill('SIGKILL');
          this.recording = false;
          this.process = null;
          resolve(true);
        }
      }, 5000);
      
      this.process.on('close', () => {
        clearTimeout(timeout);
        this.recording = false;
        this.process = null;
        resolve(true);
      });
    });
  }
  
  getAudioLevel() {
    return this.audioLevel;
  }
  
  isRecording() {
    return this.recording;
  }
  
  getCurrentFilename() {
    return this.currentFilename;
  }
}

module.exports = AudioBridge;
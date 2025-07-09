// speechUtils.js - Enhanced utility for speech recognition and synthesis
class SpeechUtils {
    constructor(options = {}) {
      // Default configuration
      this.config = {
        recognition: {
          lang: options.lang || 'en-US',
          continuous: true,
          interimResults: true,
          maxAlternatives: 1
        },
        synthesis: {
          rate: options.rate || 1.0,
          pitch: options.pitch || 1.0,
          volume: options.volume || 1.0,
          voice: null,
          preferredVoices: options.preferredVoices || ['Google', 'Microsoft', 'Amazon']
        },
        callbacks: {
          onStart: options.onStart || (() => {}),
          onResult: options.onResult || (() => {}),
          onEnd: options.onEnd || (() => {}),
          onError: options.onError || (() => {}),
          onSpeakStart: options.onSpeakStart || (() => {}),
          onSpeakEnd: options.onSpeakEnd || (() => {})
        },
        minConfidence: options.minConfidence || 0.6,
        logFunction: options.logFunction || console.log
      };
  
      // State variables
      this.recognizing = false;
      this.speaking = false;
      this.paused = false;
      this.finalTranscript = '';
      this.interimTranscript = '';
      this.recognition = null;
      this.voices = [];
      this.utteranceQueue = [];
  
      // Initialize speech recognition
      this.initRecognition();
  
      // Initialize speech synthesis
      this.initSynthesis();
    }
  
    /**
     * Initialize speech recognition
     */
    initRecognition() {
      try {
        // Check if browser supports speech recognition
        window.SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        
        if (!window.SpeechRecognition) {
          this.config.logFunction('Speech recognition not supported by this browser');
          return false;
        }
  
        // Create recognition instance
        this.recognition = new SpeechRecognition();
  
        // Configure recognition
        this.recognition.continuous = this.config.recognition.continuous;
        this.recognition.interimResults = this.config.recognition.interimResults;
        this.recognition.maxAlternatives = this.config.recognition.maxAlternatives;
        this.recognition.lang = this.config.recognition.lang;
  
        // Set up event handlers
        this.recognition.onstart = () => {
          this.recognizing = true;
          this.config.logFunction('Speech recognition started');
          this.config.callbacks.onStart();
        };
  
        this.recognition.onresult = (event) => {
          this.interimTranscript = '';
          
          // Process results
          for (let i = event.resultIndex; i < event.results.length; ++i) {
            const result = event.results[i];
            
            if (result.isFinal) {
              // Only accept results with confidence above threshold
              if (result[0].confidence >= this.config.minConfidence) {
                this.finalTranscript += result[0].transcript + ' ';
                this.config.logFunction(`Recognition (${(result[0].confidence * 100).toFixed(1)}%): ${result[0].transcript}`);
              } else {
                this.config.logFunction(`Rejected low confidence (${(result[0].confidence * 100).toFixed(1)}%): ${result[0].transcript}`);
              }
            } else {
              this.interimTranscript += result[0].transcript;
            }
          }
  
          // Call result callback
          this.config.callbacks.onResult({
            finalTranscript: this.finalTranscript,
            interimTranscript: this.interimTranscript
          });
        };
  
        this.recognition.onerror = (event) => {
          this.config.logFunction(`Speech recognition error: ${event.error}`);
          this.config.callbacks.onError(event);
  
          // Auto-restart if not aborted
          if (event.error !== 'aborted' && this.recognizing) {
            this.restartRecognition();
          }
        };
  
        this.recognition.onend = () => {
          this.recognizing = false;
          this.config.logFunction('Speech recognition ended');
          this.config.callbacks.onEnd();
  
          // Auto-restart if not paused
          if (!this.paused) {
            this.restartRecognition();
          }
        };
  
        return true;
      } catch (error) {
        this.config.logFunction(`Error initializing speech recognition: ${error.message}`);
        return false;
      }
    }
  
    /**
     * Initialize speech synthesis
     */
    initSynthesis() {
      try {
        if (!window.speechSynthesis) {
          this.config.logFunction('Speech synthesis not supported by this browser');
          return false;
        }
  
        // Load available voices
        this.loadVoices();
  
        // Set up voice change event
        speechSynthesis.onvoiceschanged = () => {
          this.loadVoices();
        };
  
        return true;
      } catch (error) {
        this.config.logFunction(`Error initializing speech synthesis: ${error.message}`);
        return false;
      }
    }
  
    /**
     * Load available voices for speech synthesis
     */
    loadVoices() {
      try {
        this.voices = speechSynthesis.getVoices();
        
        if (this.voices.length > 0) {
          // Select preferred voice
          this.selectPreferredVoice();
          this.config.logFunction(`Loaded ${this.voices.length} voices, selected: ${this.config.synthesis.voice ? this.config.synthesis.voice.name : 'None'}`);
        } else {
          this.config.logFunction('No voices available');
        }
      } catch (error) {
        this.config.logFunction(`Error loading voices: ${error.message}`);
      }
    }
  
    /**
     * Select preferred voice based on configuration
     */
    selectPreferredVoice() {
      // Filter voices by language
      const langVoices = this.voices.filter(voice => 
        voice.lang.toLowerCase().startsWith(this.config.recognition.lang.substring(0, 2).toLowerCase())
      );
  
      // Use filtered voices if available, otherwise use all
      const voicesToConsider = langVoices.length > 0 ? langVoices : this.voices;
  
      // Try to find a preferred voice
      for (const provider of this.config.synthesis.preferredVoices) {
        const found = voicesToConsider.find(voice => 
          voice.name.includes(provider)
        );
  
        if (found) {
          this.config.synthesis.voice = found;
          return;
        }
      }
  
      // If no preferred voice found, use first available voice
      if (voicesToConsider.length > 0) {
        this.config.synthesis.voice = voicesToConsider[0];
      }
    }
  
    /**
     * Start speech recognition
     * @returns {boolean} Success status
     */
    startRecognition() {
      if (!this.recognition) {
        this.config.logFunction('Speech recognition not initialized');
        return false;
      }
  
      try {
        if (!this.recognizing) {
          this.paused = false;
          this.recognition.start();
          return true;
        }
        return true; // Already recognizing
      } catch (error) {
        this.config.logFunction(`Error starting recognition: ${error.message}`);
        
        // If already started, restart
        if (error.message.includes('already started')) {
          this.restartRecognition();
          return true;
        }
        
        return false;
      }
    }
  
    /**
     * Stop speech recognition
     * @returns {boolean} Success status
     */
    stopRecognition() {
      if (!this.recognition || !this.recognizing) {
        return false;
      }
  
      try {
        this.paused = true;
        this.recognition.stop();
        return true;
      } catch (error) {
        this.config.logFunction(`Error stopping recognition: ${error.message}`);
        return false;
      }
    }
  
    /**
     * Restart speech recognition with delay
     * @param {number} delay - Delay in milliseconds before restarting
     */
    restartRecognition(delay = 300) {
      if (this.paused || !this.recognition) return;
  
      setTimeout(() => {
        try {
          this.recognition.start();
        } catch (error) {
          this.config.logFunction(`Error restarting recognition: ${error.message}`);
          
          // Try again after longer delay if it fails
          if (delay < 3000) {
            this.restartRecognition(delay * 2);
          }
        }
      }, delay);
    }
  
    /**
     * Reset recognition state and transcript
     */
    resetRecognition() {
      this.finalTranscript = '';
      this.interimTranscript = '';
      
      // Restart recognition if it was active
      if (this.recognizing) {
        this.stopRecognition();
        this.startRecognition();
      }
    }
  
    /**
     * Speak text using speech synthesis
     * @param {string} text - Text to speak
     * @param {object} options - Optional synthesis options
     * @returns {Promise} Promise that resolves when speech ends
     */
    speak(text, options = {}) {
      return new Promise((resolve, reject) => {
        if (!window.speechSynthesis) {
          reject(new Error('Speech synthesis not supported'));
          return;
        }
  
        if (!text) {
          resolve();
          return;
        }
  
        // Cancel any ongoing speech
        this.cancelSpeech();
  
        // Create utterance
        const utterance = new SpeechSynthesisUtterance(text);
  
        // Apply configuration
        utterance.rate = options.rate || this.config.synthesis.rate;
        utterance.pitch = options.pitch || this.config.synthesis.pitch;
        utterance.volume = options.volume || this.config.synthesis.volume;
        utterance.lang = options.lang || this.config.recognition.lang;
  
        // Set voice if available
        if (this.config.synthesis.voice) {
          utterance.voice = this.config.synthesis.voice;
        }
  
        // Set up event handlers
        utterance.onstart = () => {
          this.speaking = true;
          this.config.callbacks.onSpeakStart();
        };
  
        utterance.onend = () => {
          this.speaking = false;
          this.config.callbacks.onSpeakEnd();
          resolve();
        };
  
        utterance.onerror = (error) => {
          this.config.logFunction(`Speech synthesis error: ${error.name}`);
          this.speaking = false;
          reject(error);
        };
  
        // Speak
        speechSynthesis.speak(utterance);
      });
    }
  
    /**
     * Speak a sequence of sentences with pauses between
     * @param {string} text - Text to speak
     * @param {object} options - Optional synthesis options
     * @returns {Promise} Promise that resolves when all speech ends
     */
    speakWithPauses(text, options = {}) {
      return new Promise((resolve) => {
        // Split text into sentences
        const sentences = text.split(/(?<=[.!?])\s+/);
        let index = 0;
  
        const speakNext = () => {
          if (index >= sentences.length) {
            resolve();
            return;
          }
  
          const sentence = sentences[index++].trim();
          if (!sentence) {
            speakNext();
            return;
          }
  
          this.speak(sentence, options)
            .then(() => {
              // Pause between sentences
              setTimeout(speakNext, options.pauseBetweenSentences || 500);
            })
            .catch((error) => {
              this.config.logFunction(`Error speaking sentence: ${error.message}`);
              speakNext();
            });
        };
  
        speakNext();
      });
    }
  
    /**
     * Cancel any ongoing speech
     */
    cancelSpeech() {
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
        this.speaking = false;
      }
    }
  
    /**
     * Pause speech
     */
    pauseSpeech() {
      if (window.speechSynthesis && this.speaking) {
        window.speechSynthesis.pause();
      }
    }
  
    /**
     * Resume speech
     */
    resumeSpeech() {
      if (window.speechSynthesis) {
        window.speechSynthesis.resume();
      }
    }
  
    /**
     * Get current transcript
     * @returns {object} Object with final and interim transcript
     */
    getTranscript() {
      return {
        finalTranscript: this.finalTranscript,
        interimTranscript: this.interimTranscript
      };
    }
  
    /**
     * Get available voices
     * @returns {array} Array of available voices
     */
    getVoices() {
      return this.voices;
    }
  
    /**
     * Set preferred voice by name or index
     * @param {string|number} voice - Voice name or index
     * @returns {boolean} Success status
     */
    setVoice(voice) {
      if (!this.voices.length) {
        return false;
      }
  
      if (typeof voice === 'number') {
        if (voice >= 0 && voice < this.voices.length) {
          this.config.synthesis.voice = this.voices[voice];
          return true;
        }
      } else if (typeof voice === 'string') {
        const found = this.voices.find(v => v.name.includes(voice));
        if (found) {
          this.config.synthesis.voice = found;
          return true;
        }
      }
  
      return false;
    }
  
    /**
     * Check if browser supports speech recognition
     * @returns {boolean} Support status
     */
    static isRecognitionSupported() {
      return 'SpeechRecognition' in window || 'webkitSpeechRecognition' in window;
    }
  
    /**
     * Check if browser supports speech synthesis
     * @returns {boolean} Support status
     */
    static isSynthesisSupported() {
      return 'speechSynthesis' in window;
    }
  }
  
  // Export the class
  window.SpeechUtils = SpeechUtils;
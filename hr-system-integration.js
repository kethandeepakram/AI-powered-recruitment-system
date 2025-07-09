// hr-system-integration.js - Integration module for HR interview system
document.addEventListener('DOMContentLoaded', () => {
    // Check if app is running in Electron environment
    const isElectron = () => {
      return window && window.process && window.process.type;
    };
  
    // Create a consistent logging function
    const log = (message, level = 'info') => {
      const timestamp = new Date().toISOString();
      
      // Log to console
      console[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log'](`[${timestamp}] ${message}`);
      
      // If running in Electron, use IPC for logging
      if (isElectron() && window.electronAPI) {
        window.electronAPI.sendLog(level, message);
      }
      
      // Return the message for convenience
      return message;
    };
  
    // Initialize system components
    const initializeSystem = async () => {
      try {
        log('Initializing HR interview system...');
        
        // Check if we're on the interview page
        if (!document.getElementById('questionDisplay')) {
          log('Not on interview page, skipping initialization');
          return;
        }
        
        // Load dependencies
        await loadDependencies();
        
        // Check platform compatibility
        checkCompatibility();
        
        // Initialize navigation guards
        setupNavigationGuards();
        
        log('HR interview system initialized successfully');
      } catch (error) {
        log(`Error initializing HR system: ${error.message}`, 'error');
        
        // Show error message to user
        const statusElement = document.getElementById('status');
        if (statusElement) {
          statusElement.textContent = `System initialization error: ${error.message}. Please refresh the page or contact support.`;
          statusElement.className = 'status-message error';
        }
      }
    };
  
    // Load and initialize required dependencies
    const loadDependencies = async () => {
      try {
        // Create a function to check if a script is loaded
        const isScriptLoaded = (src) => {
          return document.querySelector(`script[src="${src}"]`) !== null;
        };
        
        // Load speech utilities if not already loaded
        if (!window.SpeechUtils && !isScriptLoaded('speechUtils.js')) {
          await loadScript('speechUtils.js');
          log('Speech utilities loaded');
        }
        
        // Load question loader if not already loaded
        if (!window.QuestionLoader && !isScriptLoaded('QuestionLoader.js')) {
          await loadScript('QuestionLoader.js');
          log('Question loader loaded');
        }
        
        // Load proctoring worker if not already loaded
        if (!isScriptLoaded('proctoringWorker.js')) {
          await loadScript('proctoringWorker.js');
          log('Proctoring worker loaded');
        }
        
        // Load interview evaluator if not already loaded
        if (!window.InterviewEvaluator && !isScriptLoaded('interviewEvaluator.js')) {
          await loadScript('interviewEvaluator.js');
          log('Interview evaluator loaded');
        }
        
        // Load sync module if not already loaded
        if (!window.InterviewSync && !isScriptLoaded('interview-sync.js')) {
          await loadScript('interview-sync.js');
          log('Interview sync module loaded');
        }
        
        return true;
      } catch (error) {
        log(`Error loading dependencies: ${error.message}`, 'error');
        throw error;
      }
    };
  
    // Load a script dynamically
    const loadScript = (src) => {
      return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.onload = () => resolve(true);
        script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
        document.head.appendChild(script);
      });
    };
  
    // Check browser compatibility
    const checkCompatibility = () => {
      const compatibility = {
        speechRecognition: 'SpeechRecognition' in window || 'webkitSpeechRecognition' in window,
        speechSynthesis: 'speechSynthesis' in window,
        mediaDevices: 'mediaDevices' in navigator && 'getUserMedia' in navigator.mediaDevices,
        audioContext: 'AudioContext' in window || 'webkitAudioContext' in window,
        fileSystem: isElectron()
      };
      
      // Log compatibility results
      log(`Compatibility check: ${JSON.stringify(compatibility)}`);
      
      // Show warnings for critical components
      const warnings = [];
      
      if (!compatibility.speechRecognition) {
        warnings.push('Speech recognition is not supported in this browser. Voice transcription will not work.');
      }
      
      if (!compatibility.mediaDevices) {
        warnings.push('Camera and microphone access is not supported in this browser. Interview recording will not work.');
      }
      
      if (!compatibility.audioContext) {
        warnings.push('Audio processing is not supported in this browser. Audio visualization will not work.');
      }
      
      // Display warnings to user
      if (warnings.length > 0) {
        const statusElement = document.getElementById('status');
        if (statusElement) {
          statusElement.innerHTML = `<strong>Compatibility Warning:</strong> ${warnings.join(' ')}`;
          statusElement.className = 'status-message warning';
        }
        
        log(`Compatibility warnings: ${warnings.join('; ')}`, 'warn');
      }
      
      return compatibility;
    };
  
    // Set up navigation guards to prevent accidental navigation away during interview
    const setupNavigationGuards = () => {
      // Flag to check if interview is in progress
      let interviewInProgress = false;
      
      // Function to check interview status
      const checkInterviewStatus = () => {
        // If window.state is available from interview.js
        if (window.state) {
          return window.state.isInterviewRunning;
        }
        
        // Fallback check: look for UI elements
        const pauseButton = document.getElementById('pauseBtn');
        const endButton = document.getElementById('endBtn');
        
        return pauseButton && pauseButton.style.display !== 'none' && 
               endButton && endButton.style.display !== 'none';
      };
      
      // Set interval to check interview status
      setInterval(() => {
        interviewInProgress = checkInterviewStatus();
      }, 1000);
      
      // Add beforeunload event listener
      window.addEventListener('beforeunload', (e) => {
        if (interviewInProgress) {
          // Standard way of showing a confirmation dialog
          const confirmationMessage = 'The interview is still in progress. Are you sure you want to leave?';
          e.returnValue = confirmationMessage;
          return confirmationMessage;
        }
      });
      
      // Capture clicks on links
      document.addEventListener('click', (e) => {
        if (interviewInProgress) {
          const link = e.target.closest('a');
          if (link && link.getAttribute('href') && !link.getAttribute('href').startsWith('#')) {
            if (!confirm('The interview is still in progress. Are you sure you want to navigate away?')) {
              e.preventDefault();
            }
          }
        }
      });
      
      log('Navigation guards set up');
    };
  
    // Create a global error handler
    window.onerror = (message, source, lineno, colno, error) => {
      log(`Global error: ${message} at ${source}:${lineno}:${colno}`, 'error');
      
      // Show error message to user if it seems to be a critical error
      if (message.includes('getUserMedia') || 
          message.includes('permission') || 
          message.includes('camera') || 
          message.includes('microphone')) {
        
        const statusElement = document.getElementById('status');
        if (statusElement) {
          statusElement.textContent = `Error: ${message}. Please ensure you grant camera and microphone permissions.`;
          statusElement.className = 'status-message error';
        }
      }
      
      return false; // Let the error propagate
    };
  
    // Initialize the system
    initializeSystem();
  });
  
  // Provide utility functions for evaluating interview responses
  async function evaluateWithLLM() {
    try {
      // Log the start of evaluation
      console.log('Starting interview evaluation with LLM');
      
      // Prepare data for evaluation
      const questionAnswerPairs = window.state.transcriptSegments
        .filter(segment => {
          const question = window.state.questions[segment.questionIndex];
          return question && !question.isSystemPrompt;
        })
        .map(segment => ({
          question: segment.question,
          category: segment.category,
          transcript: segment.transcript,
          duration: segment.duration
        }));
      
      // Create evaluator instance
      const evaluator = new InterviewEvaluator({
        candidateName: window.state.candidateName,
        position: localStorage.getItem('position') || 'Software Engineer',
        logFunction: console.log
      });
      
      // Simulate processing time for a more realistic experience
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Evaluate responses
      const evaluation = evaluator.evaluateResponses(questionAnswerPairs);
      
      console.log('Interview evaluation completed');
      return evaluation;
    } catch (error) {
      console.error('Error evaluating with LLM:', error);
      
      // Return a fallback evaluation
      const evaluator = new InterviewEvaluator();
      return evaluator.generateFallbackEvaluation();
    }
  }
  
  // Generate failed evaluation for auto-fail scenarios
  function generateFailedEvaluation(reason) {
    const evaluator = new InterviewEvaluator({
      candidateName: window.state?.candidateName || 'Unknown'
    });
    
    return evaluator.generateFailedEvaluation(reason);
  }
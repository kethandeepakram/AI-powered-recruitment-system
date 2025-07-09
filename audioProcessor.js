// Audio processor worker
// This runs in a separate thread to prevent audio glitches

const FFT_SIZE = 256;
let analyserData = null;

self.onmessage = function(e) {
  const { command, data } = e.data;
  
  switch(command) {
    case 'init':
      analyserData = new Uint8Array(data.frequencyBinCount);
      break;
    
    case 'process':
      // Process and analyze audio data
      analyseAudioData(data);
      break;
      
    case 'stop':
      // Clean up resources
      analyserData = null;
      break;
  }
};

function analyseAudioData(audioData) {
  if (!analyserData) return;
  
  // Simple simulation of analysis - in real implementation
  // perform FFT or other processing here
  for (let i = 0; i < analyserData.length; i++) {
    // Simple audio analysis without causing UI thread blocking
    analyserData[i] = Math.abs(audioData[i] || 0);
  }
  
  // Send processed data back to main thread
  self.postMessage({ 
    command: 'analysisResult', 
    data: analyserData.slice(0)
  });
}
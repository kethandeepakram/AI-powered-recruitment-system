// proctoringWorker.js - Web worker for face detection and proctoring
self.addEventListener('message', (e) => {
    try {
      const { imageData, timestamp, operation } = e.data;
      
      // Check which operation to perform
      if (!operation || operation === 'detectFace') {
        if (!imageData || !imageData.data) {
          throw new Error('Invalid image data received');
        }
        
        const result = detectFace(imageData);
        
        // Send results back to main thread
        self.postMessage({
          result,
          timestamp,
          operation: 'detectFaceResult'
        });
      } else if (operation === 'analyzeBehavior') {
        const result = analyzeBehavior(e.data.behaviorData);
        
        // Send results back to main thread
        self.postMessage({
          result,
          timestamp,
          operation: 'analyzeBehaviorResult'
        });
      }
    } catch (error) {
      // Report errors back to main thread
      self.postMessage({
        error: error.message,
        timestamp: Date.now(),
        operation: 'error'
      });
    }
  });
  
  /**
   * Detect face in image data
   * Note: This is a simplified implementation - a production version
   * should use a proper ML-based face detection library
   * @param {ImageData} imageData - Image data from canvas
   * @returns {Object} Detection results
   */
  function detectFace(imageData) {
    if (!imageData || !imageData.data) {
      return {
        faceDetected: false,
        error: 'Invalid image data',
        confidence: 0,
        lookingAway: true
      };
    }
    
    const data = imageData.data;
    const width = imageData.width;
    const height = imageData.height;
    
    if (width < 10 || height < 10 || data.length < width * height * 4) {
      return {
        faceDetected: false,
        error: 'Image dimensions invalid',
        confidence: 0,
        lookingAway: true
      };
    }
    
    // Counters for pixel analysis
    let skinPixels = 0;
    let totalPixels = data.length / 4;
    let centerPixels = 0;
    let centerSkinPixels = 0;
    let topHalfSkinPixels = 0;
    
    // Define regions of interest
    const centerStartX = Math.floor(width * 0.25);
    const centerEndX = Math.floor(width * 0.75);
    const centerStartY = Math.floor(height * 0.25);
    const centerEndY = Math.floor(height * 0.75);
    const topHalfEnd = Math.floor(height * 0.5);
    
    // Analyze the image pixel by pixel
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        
        // Bounds check to prevent array access errors
        if (idx + 2 >= data.length) continue;
        
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        
        // Check if pixel is in center region
        const isCenter = (x >= centerStartX && x <= centerEndX && 
                        y >= centerStartY && y <= centerEndY);
        
        // Check if pixel is in top half
        const isTopHalf = (y <= topHalfEnd);
        
        // Improved skin tone detection - more tolerant of lighting variations
        // This is still a simplification - real face detection would use ML
        const brightness = (r + g + b) / 3;
        const normalizedR = brightness > 0 ? r / brightness : 0;
        const normalizedG = brightness > 0 ? g / brightness : 0;
        const normalizedB = brightness > 0 ? b / brightness : 0;
        
        // More inclusive skin tone detection - still basic but handles more variations
        const isSkinTone = (r > 60 && g > 40 && b > 20) && // Minimum values
                          (normalizedR > normalizedG && normalizedR > normalizedB) && // Red dominant
                          (r - g > 5); // Some red-green separation
        
        if (isSkinTone) {
          skinPixels++;
          
          if (isCenter) {
            centerSkinPixels++;
          }
          
          if (isTopHalf) {
            topHalfSkinPixels++;
          }
        }
        
        if (isCenter) {
          centerPixels++;
        }
      }
    }
    
    // Prevent division by zero
    if (centerPixels === 0 || totalPixels === 0) {
      return {
        faceDetected: false,
        error: 'No valid pixels found',
        confidence: 0,
        lookingAway: true
      };
    }
    
    // Calculate percentages
    const skinPercentage = (skinPixels / totalPixels) * 100;
    const centerSkinPercentage = (centerSkinPixels / centerPixels) * 100;
    const topHalfSkinPercentage = (topHalfSkinPixels / (totalPixels / 2)) * 100;
    
    // More conservative thresholds to reduce false positives
    // Lowered thresholds since we're only focusing on major violations
    const faceDetected = skinPercentage > 3 && centerSkinPercentage > 6;
    const eyesVisible = topHalfSkinPercentage > 3;
    
    // Only consider "looking away" if very confident
    // Too many false positives makes the system frustrating for users
    const lookingAway = !faceDetected || (!eyesVisible && centerSkinPercentage < 4);
    
    // Calculate confidence level (0-1)
    const confidence = Math.min(1, centerSkinPercentage / 100);
    
    return {
      faceDetected,
      eyesVisible,
      lookingAway,
      confidence,
      skinPercentage,
      centerSkinPercentage,
      topHalfSkinPercentage,
      multipleFaces: skinPercentage > 30 && centerSkinPercentage < 25
    };
  }
  
  /**
   * Analyze behavior patterns over time
   * @param {Array} behaviorData - Array of detection results over time
   * @returns {Object} Behavior analysis results
   */
  function analyzeBehavior(behaviorData) {
    if (!behaviorData || !Array.isArray(behaviorData) || behaviorData.length === 0) {
      return {
        suspicious: false,
        confidence: 0,
        patterns: []
      };
    }
    
    // Minimum sample size before making judgments
    if (behaviorData.length < 10) {
      return {
        suspicious: false,
        confidence: 0,
        patterns: [],
        stats: {
          lookingAwayPercentage: 0,
          maxConsecutiveLookingAway: 0,
          multipleFacesPercentage: 0
        },
        message: "Gathering more data..."
      };
    }
    
    // Count instances of looking away
    const lookingAwayCount = behaviorData.filter(data => data.lookingAway).length;
    const lookingAwayPercentage = (lookingAwayCount / behaviorData.length) * 100;
    
    // Check for consecutive looking away
    let maxConsecutiveLookingAway = 0;
    let currentConsecutive = 0;
    
    for (const data of behaviorData) {
      if (data.lookingAway) {
        currentConsecutive++;
        maxConsecutiveLookingAway = Math.max(maxConsecutiveLookingAway, currentConsecutive);
      } else {
        currentConsecutive = 0;
      }
    }
    
    // Check for multiple faces
    const multipleFacesCount = behaviorData.filter(data => data.multipleFaces).length;
    const multipleFacesPercentage = (multipleFacesCount / behaviorData.length) * 100;
    
    // Higher thresholds to reduce false positives
    // Only trigger on very clear violations
    const suspicious = lookingAwayPercentage > 40 || 
                       maxConsecutiveLookingAway > 8 || 
                       multipleFacesPercentage > 30;
    
    // Calculate confidence in suspicious behavior (0-1)
    const confidenceLookingAway = Math.min(1, lookingAwayPercentage / 100);
    const confidenceConsecutive = Math.min(1, maxConsecutiveLookingAway / 15);
    const confidenceMultipleFaces = Math.min(1, multipleFacesPercentage / 100);
    
    // Overall confidence is maximum of individual confidences
    const confidence = Math.max(confidenceLookingAway, confidenceConsecutive, confidenceMultipleFaces);
    
    // Identify patterns
    const patterns = [];
    
    if (lookingAwayPercentage > 40) {
      patterns.push({
        type: 'looking_away_frequently',
        confidence: confidenceLookingAway,
        details: `Looking away ${lookingAwayPercentage.toFixed(1)}% of the time`
      });
    }
    
    if (maxConsecutiveLookingAway > 8) {
      patterns.push({
        type: 'extended_looking_away',
        confidence: confidenceConsecutive,
        details: `Looking away for ${maxConsecutiveLookingAway} consecutive frames`
      });
    }
    
    if (multipleFacesPercentage > 30) {
      patterns.push({
        type: 'multiple_faces',
        confidence: confidenceMultipleFaces,
        details: `Multiple faces detected ${multipleFacesPercentage.toFixed(1)}% of the time`
      });
    }
    
    return {
      suspicious,
      confidence,
      patterns,
      stats: {
        lookingAwayPercentage,
        maxConsecutiveLookingAway,
        multipleFacesPercentage
      }
    };
  }
  
  // Send ready message to main thread
  self.postMessage({
    operation: 'ready',
    timestamp: Date.now()
  });
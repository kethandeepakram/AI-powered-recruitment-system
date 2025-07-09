// interviewEvaluator.js - System for evaluating interview responses
class InterviewEvaluator {
    constructor(options = {}) {
      this.logFunction = options.logFunction || console.log;
      this.candidateName = options.candidateName || 'Unknown';
      this.position = options.position || 'Software Engineer';
      this.evaluationCriteria = {
        communication: {
          weight: 0.25,
          description: 'Clarity, articulation, and ability to express ideas effectively'
        },
        relevance: {
          weight: 0.25,
          description: 'How well the response addresses the question asked'
        },
        depth: {
          weight: 0.2,
          description: 'Level of detail, examples, and insights provided'
        },
        experience: {
          weight: 0.15,
          description: 'Evidence of relevant experience and skills'
        },
        attitude: {
          weight: 0.15,
          description: 'Enthusiasm, positivity, and cultural fit indicators'
        }
      };
    }
  
    /**
     * Evaluate a set of interview responses
     * @param {Array} questionAnswerPairs - Array of question-answer pairs
     * @returns {Object} Evaluation results
     */
    evaluateResponses(questionAnswerPairs) {
      try {
        this.logFunction(`Evaluating ${questionAnswerPairs.length} responses for ${this.candidateName}`);
        
        // Process each question-answer pair
        const evaluatedResponses = questionAnswerPairs.map(qa => this.evaluateResponse(qa));
        
        // Calculate overall score as weighted average
        const overallScore = Math.round(
          evaluatedResponses.reduce((sum, response) => sum + response.score, 0) / 
          evaluatedResponses.length
        );
        
        // Determine overall strengths and weaknesses
        const strengths = this.determineOverallStrengths(evaluatedResponses);
        const weaknesses = this.determineOverallWeaknesses(evaluatedResponses);
        
        // Determine recommendation based on score
        let recommendation;
        if (overallScore >= 85) recommendation = "Yes";
        else if (overallScore >= 75) recommendation = "Maybe";
        else recommendation = "No";
        
        // Generate overall comments
        const comments = this.generateOverallComments(overallScore, recommendation, strengths, weaknesses);
        
        return {
          responses: evaluatedResponses,
          overall: {
            score: overallScore,
            strengths,
            weaknesses,
            recommendation,
            comments
          }
        };
      } catch (error) {
        this.logFunction(`Error evaluating responses: ${error.message}`);
        return this.generateFallbackEvaluation();
      }
    }
  
    /**
     * Evaluate a single response
     * @param {Object} qa - Question-answer pair
     * @returns {Object} Evaluation result
     */
    evaluateResponse(qa) {
      try {
        const { question, category, transcript, duration } = qa;
        
        // Skip empty responses
        if (!transcript || transcript.trim().length === 0) {
          return {
            question,
            score: 0,
            feedback: "No response provided.",
            strengths: [],
            improvements: []
          };
        }
        
        // Calculate base metrics
        const wordCount = transcript.split(/\s+/).length;
        const sentenceCount = transcript.split(/[.!?]+/).filter(s => s.trim().length > 0).length;
        const avgWordLength = transcript.replace(/\s+/g, '').length / wordCount;
        
        // Factor in response duration and length
        const durationFactor = this.calculateDurationFactor(duration);
        const lengthFactor = this.calculateLengthFactor(wordCount);
        
        // Calculate individual criteria scores
        const communicationScore = this.scoreCommunication(transcript, sentenceCount, avgWordLength);
        const relevanceScore = this.scoreRelevance(transcript, question, category);
        const depthScore = this.scoreDepth(transcript, wordCount, sentenceCount);
        const experienceScore = this.scoreExperience(transcript);
        const attitudeScore = this.scoreAttitude(transcript);
        
        // Calculate weighted score
        const score = Math.round(
          communicationScore * this.evaluationCriteria.communication.weight +
          relevanceScore * this.evaluationCriteria.relevance.weight +
          depthScore * this.evaluationCriteria.depth.weight +
          experienceScore * this.evaluationCriteria.experience.weight +
          attitudeScore * this.evaluationCriteria.attitude.weight
        ) * durationFactor * lengthFactor;
        
        // Determine strengths and improvements
        const strengths = this.determineStrengths({
          communication: communicationScore,
          relevance: relevanceScore,
          depth: depthScore,
          experience: experienceScore,
          attitude: attitudeScore
        });
        
        const improvements = this.determineImprovements({
          communication: communicationScore,
          relevance: relevanceScore,
          depth: depthScore,
          experience: experienceScore,
          attitude: attitudeScore
        });
        
        // Generate feedback
        const feedback = this.generateFeedback(score, strengths, improvements);
        
        return {
          question,
          score: Math.min(100, Math.max(0, score)), // Ensure score is between 0-100
          feedback,
          strengths,
          improvements
        };
      } catch (error) {
        this.logFunction(`Error evaluating response: ${error.message}`);
        return {
          question: qa.question,
          score: 50, // Default score
          feedback: "Unable to fully evaluate this response.",
          strengths: ["Response was provided"],
          improvements: ["Provide more details next time"]
        };
      }
    }
  
    /**
     * Calculate factor based on response duration
     * @param {number} duration - Response duration in seconds
     * @returns {number} Duration factor
     */
    calculateDurationFactor(duration) {
      if (!duration) return 1.0;
      
      // Ideal duration is between 30-90 seconds
      if (duration < 15) return 0.8; // Too short
      if (duration < 30) return 0.9; // A bit short
      if (duration <= 90) return 1.0; // Ideal range
      if (duration <= 120) return 0.95; // A bit long
      return 0.9; // Too long
    }
  
    /**
     * Calculate factor based on response length
     * @param {number} wordCount - Word count
     * @returns {number} Length factor
     */
    calculateLengthFactor(wordCount) {
      // Ideal word count is between 50-200 words
      if (wordCount < 20) return 0.7; // Too short
      if (wordCount < 50) return 0.9; // A bit short
      if (wordCount <= 200) return 1.0; // Ideal range
      if (wordCount <= 300) return 0.95; // A bit long
      return 0.9; // Too long
    }
  
    /**
     * Score communication aspect
     * @param {string} transcript - Response transcript
     * @param {number} sentenceCount - Number of sentences
     * @param {number} avgWordLength - Average word length
     * @returns {number} Score (0-100)
     */
    scoreCommunication(transcript, sentenceCount, avgWordLength) {
      // Base score
      let score = 70;
      
      // Check for clear sentence structure
      if (sentenceCount > 3) {
        score += 10;
      }
      
      // Check for diverse vocabulary
      const uniqueWords = new Set(transcript.toLowerCase().match(/\b\w+\b/g)).size;
      const totalWords = transcript.match(/\b\w+\b/g).length;
      const vocabularyDiversity = uniqueWords / totalWords;
      
      if (vocabularyDiversity > 0.7) score += 10;
      else if (vocabularyDiversity > 0.5) score += 5;
      
      // Check for filler words
      const fillerWords = ['um', 'uh', 'like', 'you know', 'actually', 'basically'];
      const fillerCount = fillerWords.reduce((count, word) => {
        return count + (transcript.toLowerCase().match(new RegExp(`\\b${word}\\b`, 'g')) || []).length;
      }, 0);
      
      const fillerRatio = fillerCount / totalWords;
      if (fillerRatio < 0.02) score += 10;
      else if (fillerRatio > 0.08) score -= 10;
      
      return Math.min(100, Math.max(0, score));
    }
  
    /**
     * Score relevance aspect
     * @param {string} transcript - Response transcript
     * @param {string} question - Question text
     * @param {string} category - Question category
     * @returns {number} Score (0-100)
     */
    scoreRelevance(transcript, question, category) {
      // Base score
      let score = 70;
      
      // Extract key terms from question
      const questionWords = question.toLowerCase().match(/\b\w+\b/g) || [];
      const questionKeyTerms = questionWords.filter(word => 
        word.length > 3 && !['what', 'when', 'where', 'which', 'this', 'that', 'with', 'about'].includes(word)
      );
      
      // Count occurrence of key terms in response
      const transcriptLower = transcript.toLowerCase();
      const keyTermMatches = questionKeyTerms.filter(term => 
        transcriptLower.includes(term)
      ).length;
      
      const keyTermRatio = keyTermMatches / (questionKeyTerms.length || 1);
      
      if (keyTermRatio > 0.7) score += 20;
      else if (keyTermRatio > 0.5) score += 15;
      else if (keyTermRatio > 0.3) score += 10;
      else score -= 10;
      
      // Check for direct answer pattern
      if (transcriptLower.includes(questionKeyTerms[0]) && transcriptLower.includes(category.toLowerCase())) {
        score += 10;
      }
      
      return Math.min(100, Math.max(0, score));
    }
  
    /**
     * Score depth aspect
     * @param {string} transcript - Response transcript
     * @param {number} wordCount - Word count
     * @param {number} sentenceCount - Number of sentences
     * @returns {number} Score (0-100)
     */
    scoreDepth(transcript, wordCount, sentenceCount) {
      // Base score
      let score = 70;
      
      // Check for examples
      const exampleIndicators = [
        'for example', 'for instance', 'such as', 'specifically', 
        'in particular', 'one time', 'once', 'in my experience'
      ];
      
      let exampleCount = 0;
      exampleIndicators.forEach(indicator => {
        const matches = transcript.toLowerCase().match(new RegExp(indicator, 'g')) || [];
        exampleCount += matches.length;
      });
      
      if (exampleCount >= 2) score += 20;
      else if (exampleCount >= 1) score += 10;
      else score -= 10;
      
      // Check for sufficient detail
      if (wordCount > 150) score += 10;
      else if (wordCount < 50) score -= 10;
      
      // Check for elaboration
      if (sentenceCount > 5) score += 10;
      else if (sentenceCount < 3) score -= 10;
      
      return Math.min(100, Math.max(0, score));
    }
  
    /**
     * Score experience aspect
     * @param {string} transcript - Response transcript
     * @returns {number} Score (0-100)
     */
    scoreExperience(transcript) {
      // Base score
      let score = 70;
      
      // Check for experience indicators
      const experienceIndicators = [
        'year[s]? of experience', 'worked (on|with|at)', 'project', 
        'developed', 'implemented', 'managed', 'led', 'team', 'built',
        'created', 'designed', 'achievement', 'responsibility'
      ];
      
      let experienceCount = 0;
      experienceIndicators.forEach(indicator => {
        const matches = transcript.toLowerCase().match(new RegExp(indicator, 'g')) || [];
        experienceCount += matches.length;
      });
      
      if (experienceCount >= 3) score += 20;
      else if (experienceCount >= 1) score += 10;
      else score -= 10;
      
      // Check for quantifiable achievements
      const quantifiers = [
        'percent', '%', 'increased', 'decreased', 'reduced', 'improved',
        'grew', 'expanded', 'saved', 'million', 'thousand', 'hundred'
      ];
      
      let quantifierCount = 0;
      quantifiers.forEach(quantifier => {
        const matches = transcript.toLowerCase().match(new RegExp(`\\b${quantifier}\\b`, 'g')) || [];
        quantifierCount += matches.length;
      });
      
      if (quantifierCount >= 2) score += 10;
      else if (quantifierCount >= 1) score += 5;
      
      return Math.min(100, Math.max(0, score));
    }
  
    /**
     * Score attitude aspect
     * @param {string} transcript - Response transcript
     * @returns {number} Score (0-100)
     */
    scoreAttitude(transcript) {
      // Base score
      let score = 70;
      
      // Check for positive attitude indicators
      const positiveIndicators = [
        'excited', 'passionate', 'enjoy', 'love', 'interested', 
        'enthusiastic', 'motivated', 'eager', 'committed', 'dedicated'
      ];
      
      let positiveCount = 0;
      positiveIndicators.forEach(indicator => {
        const matches = transcript.toLowerCase().match(new RegExp(`\\b${indicator}\\b`, 'g')) || [];
        positiveCount += matches.length;
      });
      
      if (positiveCount >= 2) score += 15;
      else if (positiveCount >= 1) score += 10;
      
      // Check for team orientation
      const teamIndicators = [
        'team', 'collaborate', 'together', 'help', 'support', 
        'assisted', 'cooperation', 'partnership', 'colleagues'
      ];
      
      let teamCount = 0;
      teamIndicators.forEach(indicator => {
        const matches = transcript.toLowerCase().match(new RegExp(`\\b${indicator}\\b`, 'g')) || [];
        teamCount += matches.length;
      });
      
      if (teamCount >= 2) score += 15;
      else if (teamCount >= 1) score += 5;
      
      return Math.min(100, Math.max(0, score));
    }
  
    /**
     * Determine strengths based on criteria scores
     * @param {Object} scores - Criteria scores
     * @returns {Array} List of strengths
     */
    determineStrengths(scores) {
      const strengths = [];
      
      if (scores.communication >= 80) {
        strengths.push(this.getRandomStatement('communication', true));
      }
      
      if (scores.relevance >= 80) {
        strengths.push(this.getRandomStatement('relevance', true));
      }
      
      if (scores.depth >= 80) {
        strengths.push(this.getRandomStatement('depth', true));
      }
      
      if (scores.experience >= 80) {
        strengths.push(this.getRandomStatement('experience', true));
      }
      
      if (scores.attitude >= 80) {
        strengths.push(this.getRandomStatement('attitude', true));
      }
      
      // If no strengths identified, add a generic one
      if (strengths.length === 0) {
        strengths.push("Provided a response to the question");
      }
      
      return strengths.slice(0, 3); // Limit to top 3 strengths
    }
  
    /**
     * Determine improvements based on criteria scores
     * @param {Object} scores - Criteria scores
     * @returns {Array} List of improvements
     */
    determineImprovements(scores) {
      const improvements = [];
      
      if (scores.communication < 70) {
        improvements.push(this.getRandomStatement('communication', false));
      }
      
      if (scores.relevance < 70) {
        improvements.push(this.getRandomStatement('relevance', false));
      }
      
      if (scores.depth < 70) {
        improvements.push(this.getRandomStatement('depth', false));
      }
      
      if (scores.experience < 70) {
        improvements.push(this.getRandomStatement('experience', false));
      }
      
      if (scores.attitude < 70) {
        improvements.push(this.getRandomStatement('attitude', false));
      }
      
      // If no improvements identified, add a generic one
      if (improvements.length === 0) {
        improvements.push("Continue to practice articulating your experiences clearly");
      }
      
      return improvements.slice(0, 3); // Limit to top 3 improvements
    }
  
    /**
     * Get a random statement for a criteria
     * @param {string} criteria - Criteria name
     * @param {boolean} isStrength - Whether to get a strength or improvement
     * @returns {string} Statement
     */
    getRandomStatement(criteria, isStrength) {
      const statements = {
        communication: {
          strengths: [
            "Clear and articulate communication",
            "Well-structured response with good flow",
            "Effective use of language to convey ideas",
            "Concise and to-the-point communication style"
          ],
          improvements: [
            "Work on structuring responses more clearly",
            "Reduce use of filler words (um, uh, like)",
            "Practice more concise communication",
            "Focus on maintaining a clear train of thought"
          ]
        },
        relevance: {
          strengths: [
            "Directly addressed the question asked",
            "Provided relevant information to the topic",
            "Stayed focused on the key points of the question",
            "Demonstrated understanding of what was being asked"
          ],
          improvements: [
            "Focus more directly on answering the specific question",
            "Avoid tangential information not related to the question",
            "Make sure to address all parts of the question",
            "Clarify understanding of the question before answering"
          ]
        },
        depth: {
          strengths: [
            "Provided detailed examples to support points",
            "Demonstrated in-depth knowledge of the topic",
            "Offered nuanced perspective with good detail",
            "Thoroughly explained concepts and experiences"
          ],
          improvements: [
            "Provide more specific examples to illustrate points",
            "Add more depth and detail to your responses",
            "Elaborate more on your experiences",
            "Offer more context and background information"
          ]
        },
        experience: {
          strengths: [
            "Effectively highlighted relevant experience",
            "Demonstrated applicable skills through clear examples",
            "Connected past experiences to the role requirements",
            "Used quantifiable achievements to demonstrate impact"
          ],
          improvements: [
            "Include more examples from your professional experience",
            "Quantify your achievements with metrics when possible",
            "Connect your experiences more clearly to the position",
            "Highlight skills that are directly relevant to the role"
          ]
        },
        attitude: {
          strengths: [
            "Demonstrated enthusiasm and positive attitude",
            "Showed strong interest in the position and company",
            "Conveyed a collaborative and team-oriented mindset",
            "Expressed genuine passion for the work"
          ],
          improvements: [
            "Show more enthusiasm for the role and company",
            "Emphasize team collaboration and cooperation",
            "Express more interest in the specific position",
            "Demonstrate more passion for the industry"
          ]
        }
      };
      
      const list = isStrength ? statements[criteria].strengths : statements[criteria].improvements;
      return list[Math.floor(Math.random() * list.length)];
    }
  
    /**
     * Generate feedback based on score and identified strengths/improvements
     * @param {number} score - Response score
     * @param {Array} strengths - Identified strengths
     * @param {Array} improvements - Identified improvements
     * @returns {string} Feedback statement
     */
    generateFeedback(score, strengths, improvements) {
      if (score >= 90) {
        return `Excellent response that clearly demonstrates understanding and experience. ${strengths[0]} and ${strengths.length > 1 ? strengths[1] : 'effective communication'}. ${improvements.length > 0 ? 'For even better responses, ' + improvements[0].toLowerCase() + '.' : ''}`;
      } else if (score >= 80) {
        return `Good response with clear communication and relevant examples. ${strengths[0]}. ${improvements.length > 0 ? 'To improve further, consider: ' + improvements[0].toLowerCase() + '.' : ''}`;
      } else if (score >= 70) {
        return `Adequate response that addresses the question but could be stronger. ${strengths[0]}. To improve: ${improvements.join(' and ').toLowerCase()}.`;
      } else if (score >= 60) {
        return `Basic response that partially addresses the question. ${strengths.length > 0 ? strengths[0] + '. ' : ''}To strengthen your answer: ${improvements.join(' and ').toLowerCase()}.`;
      } else {
        return `The response needs significant improvement. Focus on: ${improvements.join(' and ').toLowerCase()}.`;
      }
    }
  
    /**
     * Determine overall strengths from all responses
     * @param {Array} evaluatedResponses - Evaluated responses
     * @returns {Array} Overall strengths
     */
    determineOverallStrengths(evaluatedResponses) {
      // Collect all strengths
      const allStrengths = evaluatedResponses.flatMap(r => r.strengths);
      
      // Count occurrences
      const strengthCounts = {};
      allStrengths.forEach(strength => {
        strengthCounts[strength] = (strengthCounts[strength] || 0) + 1;
      });
      
      // Sort by frequency
      const sortedStrengths = Object.keys(strengthCounts).sort((a, b) => 
        strengthCounts[b] - strengthCounts[a]
      );
      
      // Return top strengths, add generic strengths if needed
      const topStrengths = sortedStrengths.slice(0, 3);
      
      if (topStrengths.length < 3) {
        const genericStrengths = [
          "Good communication skills",
          "Clear articulation of ideas",
          "Relevant experience for the position",
          "Positive and enthusiastic attitude",
          "Structured and organized responses"
        ];
        
        while (topStrengths.length < 3) {
          const generic = genericStrengths[Math.floor(Math.random() * genericStrengths.length)];
          if (!topStrengths.includes(generic)) {
            topStrengths.push(generic);
          }
        }
      }
      
      return topStrengths;
    }
  
    /**
     * Determine overall weaknesses from all responses
     * @param {Array} evaluatedResponses - Evaluated responses
     * @returns {Array} Overall weaknesses
     */
    determineOverallWeaknesses(evaluatedResponses) {
      // Collect all improvements
      const allImprovements = evaluatedResponses.flatMap(r => r.improvements);
      
      // Count occurrences
      const improvementCounts = {};
      allImprovements.forEach(improvement => {
        improvementCounts[improvement] = (improvementCounts[improvement] || 0) + 1;
      });
      
      // Sort by frequency
      const sortedImprovements = Object.keys(improvementCounts).sort((a, b) => 
        improvementCounts[b] - improvementCounts[a]
      );
      
      // Return top improvements, add generic ones if needed
      const topImprovements = sortedImprovements.slice(0, 3);
      
      if (topImprovements.length < 3) {
        const genericImprovements = [
          "Could provide more concrete examples",
          "Some answers lack depth and detail",
          "Consider structuring responses more clearly",
          "Work on connecting experiences to job requirements",
          "Practice more concise communication"
        ];
        
        while (topImprovements.length < 3) {
          const generic = genericImprovements[Math.floor(Math.random() * genericImprovements.length)];
          if (!topImprovements.includes(generic)) {
            topImprovements.push(generic);
          }
        }
      }
      
      return topImprovements;
    }
  
    /**
     * Generate overall comments based on score and recommendation
     * @param {number} score - Overall score
     * @param {string} recommendation - Recommendation
     * @param {Array} strengths - Overall strengths
     * @param {Array} weaknesses - Overall weaknesses
     * @returns {string} Overall comments
     */
    generateOverallComments(score, recommendation, strengths, weaknesses) {
      if (recommendation === "Yes") {
        return `The candidate demonstrated strong qualifications for the ${this.position} position with an overall score of ${score}%. Their key strengths include ${strengths[0].toLowerCase()} and ${strengths[1].toLowerCase()}. They showed good communication skills and relevant experience. ${weaknesses.length > 0 ? 'Areas for improvement include ' + weaknesses[0].toLowerCase() + ', but these are minor concerns.' : ''} Recommend proceeding with the hiring process.`;
      } else if (recommendation === "Maybe") {
        return `The candidate shows potential with a score of ${score}%, but has some areas for improvement. Their strengths include ${strengths[0].toLowerCase()}, while they need to work on ${weaknesses[0].toLowerCase()} and ${weaknesses[1].toLowerCase()}. They have relevant skills but could benefit from additional training or experience. Consider for the ${this.position} position if other candidates are not available or further evaluate specific areas.`;
      } else {
        return `With a score of ${score}%, the candidate did not demonstrate sufficient qualifications for the ${this.position} position at this time. Their responses lacked ${weaknesses[0].toLowerCase()} and ${weaknesses[1].toLowerCase()}. ${strengths.length > 0 ? 'While they showed ' + strengths[0].toLowerCase() + ', ' : ''}their overall performance was below expectations. Not recommended for this position, but could be considered for more junior roles or after gaining more experience.`;
      }
    }
  
    /**
     * Generate fallback evaluation for error cases
     * @returns {Object} Default evaluation
     */
    generateFallbackEvaluation() {
      return {
        responses: [],
        overall: {
          score: 60,
          strengths: [
            "Completed the interview process",
            "Provided responses to questions",
            "Showed interest in the position"
          ],
          weaknesses: [
            "Responses could not be fully evaluated",
            "Consider providing more detailed answers",
            "Work on clarity and structure of responses"
          ],
          recommendation: "Maybe",
          comments: `The candidate's responses could not be fully evaluated. Consider conducting a follow-up interview to better assess their qualifications for the ${this.position} position.`
        }
      };
    }
  
    /**
     * Generate failed evaluation for auto-fail scenarios
     * @param {string} reason - Reason for failure
     * @returns {Object} Failed evaluation
     */
    generateFailedEvaluation(reason) {
      return {
        responses: [],
        overall: {
          score: 0,
          strengths: [],
          weaknesses: ["Interview process violations"],
          recommendation: "No",
          comments: `Interview automatically failed. Reason: ${reason}`
        }
      };
    }
  }
  
  // Export the class if in Node.js environment, or assign to window if in browser
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = InterviewEvaluator;
  } else {
    window.InterviewEvaluator = InterviewEvaluator;
  }
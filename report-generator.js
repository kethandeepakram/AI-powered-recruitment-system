// report-generator.js - Comprehensive report generation for all interview stages
const fs = require('fs');
const path = require('path');

class ReportGenerator {
  constructor(candidateName) {
    this.candidateName = candidateName || 'Unknown';
    this.candidateId = candidateName.toLowerCase().replace(/\s+/g, '_');
    this.reportPath = path.join(process.cwd(), 'database', 'candidates', this.candidateName, 'REPORT.txt');
  }

  /**
   * Initialize or get report file
   * @returns {string} Current report content
   */
  initReport() {
    // Create candidate directory if it doesn't exist
    const candidateDir = path.join(process.cwd(), 'database', 'candidates', this.candidateName);
    if (!fs.existsSync(candidateDir)) {
      fs.mkdirSync(candidateDir, { recursive: true });
    }

    // Check if report exists, create if not
    if (!fs.existsSync(this.reportPath)) {
      const initialContent = this.generateHeader();
      fs.writeFileSync(this.reportPath, initialContent);
      return initialContent;
    }

    // Return existing content
    return fs.readFileSync(this.reportPath, 'utf8');
  }

  /**
   * Generate report header
   * @returns {string} Header content
   */
  generateHeader() {
    return `=================================================
INTERVIEW REPORT
=================================================
Candidate: ${this.candidateName}
ID: ${this.candidateId}
Generated: ${new Date().toISOString()}
=================================================

This report contains structured results from all interview stages:
1. Aptitude Test
2. Coding Test
3. HR Interview

=================================================

`;
  }

  /**
   * Update report with aptitude test results
   * @param {Object} results - Aptitude test results
   * @returns {boolean} Success status
   */
  updateAptitudeResults(results) {
    try {
      let content = this.initReport();
      
      // Create aptitude section
      const aptitudeSection = `
=================================================
APTITUDE TEST RESULTS
=================================================
Date: ${results.timestamp}
Score: ${results.score.toFixed(1)}%
Status: ${results.passed ? 'PASSED' : 'FAILED'}
=================================================

Questions:
`;

      // Add each question
      results.questions.forEach((q, index) => {
        const actualIndex = results.questions.findIndex(question => 
          question.question === q.question);
        const selectedAnswer = results.answers[actualIndex];
        const isCorrect = selectedAnswer === parseInt(q.correctAnswer);
        
        aptitudeSection += `${index + 1}. ${q.question}\n`;
        aptitudeSection += `   Category: ${q.category}\n`;
        
        // Format options
        if (q.options && q.options.length > 0) {
          q.options.forEach((option, i) => {
            const prefix = i === parseInt(q.correctAnswer) ? '✓' : ' ';
            const suffix = i === selectedAnswer ? ' (Selected)' : '';
            aptitudeSection += `   ${prefix} ${String.fromCharCode(65 + i)}. ${option}${suffix}\n`;
          });
        }
        
        aptitudeSection += `   Result: ${isCorrect ? 'Correct' : 'Incorrect'}\n\n`;
      });

      // Add summary
      aptitudeSection += `Summary: Candidate ${results.passed ? 'passed' : 'failed'} the aptitude test with a score of ${results.score.toFixed(1)}%.\n\n`;
      
      // Replace existing aptitude section or add new one
      if (content.includes('APTITUDE TEST RESULTS')) {
        const startIndex = content.indexOf('APTITUDE TEST RESULTS');
        const endIndex = content.indexOf('CODING TEST RESULTS');
        
        if (endIndex > startIndex) {
          content = content.substring(0, startIndex) + 
                   aptitudeSection.trim() + 
                   content.substring(endIndex);
        } else {
          content = content.substring(0, startIndex) + aptitudeSection;
        }
      } else {
        content += aptitudeSection;
      }
      
      // Write updated content
      fs.writeFileSync(this.reportPath, content);
      return true;
    } catch (error) {
      console.error('Error updating aptitude results:', error);
      return false;
    }
  }

  /**
   * Update report with coding test results
   * @param {Object} results - Coding test results
   * @returns {boolean} Success status
   */
  updateCodingResults(results) {
    try {
      let content = this.initReport();
      
      // Create coding section
      const codingSection = `
=================================================
CODING TEST RESULTS
=================================================
Date: ${results.timestamp}
Score: ${results.score.toFixed(1)}%
Status: ${results.passed ? 'PASSED' : 'FAILED'}
=================================================

Questions:
`;

      // Add each question
      results.answers.forEach((answer, index) => {
        codingSection += `${index + 1}. ${answer.question}\n`;
        codingSection += `   Category: ${answer.category}\n`;
        codingSection += `   Passed Tests: ${answer.passedTests}/${answer.totalTests}\n\n`;
        
        // Format code solution
        codingSection += "   Code Submitted:\n";
        codingSection += "   ```\n";
        codingSection += answer.code.split('\n').map(line => `   ${line}`).join('\n');
        codingSection += "\n   ```\n\n";
        
        // Test results
        if (answer.testResults && answer.testResults.length > 0) {
          codingSection += "   Test Results:\n";
          answer.testResults.forEach((result, i) => {
            codingSection += `   Test #${i+1}: ${result.passed ? 'PASSED' : 'FAILED'}\n`;
            codingSection += `   Input: ${result.input}\n`;
            codingSection += `   Expected: ${result.expected}\n`;
            codingSection += `   Actual: ${result.actual}\n`;
            if (result.error) {
              codingSection += `   Error: ${result.error}\n`;
            }
            codingSection += "\n";
          });
        }
        
        codingSection += "\n";
      });

      // Add summary
      codingSection += `Summary: Candidate ${results.passed ? 'passed' : 'failed'} the coding test with a score of ${results.score.toFixed(1)}%.\n\n`;
      
      // Replace existing coding section or add new one
      if (content.includes('CODING TEST RESULTS')) {
        const startIndex = content.indexOf('CODING TEST RESULTS');
        const endIndex = content.indexOf('HR INTERVIEW RESULTS');
        
        if (endIndex > startIndex) {
          content = content.substring(0, startIndex) + 
                    codingSection.trim() + 
                    content.substring(endIndex);
        } else {
          content = content.substring(0, startIndex) + codingSection;
        }
      } else {
        content += codingSection;
      }
      
      // Write updated content
      fs.writeFileSync(this.reportPath, content);
      return true;
    } catch (error) {
      console.error('Error updating coding results:', error);
      return false;
    }
  }

  /**
   * Update report with HR interview results
   * @param {Object} results - HR interview results
   * @returns {boolean} Success status
   */
  updateInterviewResults(results) {
    try {
      let content = this.initReport();
      
      // Create HR interview section
      const interviewSection = `
=================================================
HR INTERVIEW RESULTS
=================================================
Date: ${results.timestamp}
Overall Score: ${results.overallScore.toFixed(1)}%
Status: ${results.passed ? 'PASSED' : 'FAILED'}
=================================================

General Assessment:
- Strengths: ${results.evaluation.overall.strengths.join(', ')}
- Areas for Improvement: ${results.evaluation.overall.weaknesses.join(', ')}
- Recommendation: ${results.evaluation.overall.recommendation}
- Comments: ${results.evaluation.overall.comments}

Questions and Responses:
`;

      // Add each question and response
      results.questions.forEach((q, index) => {
        const evaluation = results.evaluation.responses.find(r => r.question === q.question);
        
        interviewSection += `${index + 1}. ${q.question}\n`;
        interviewSection += `   Category: ${q.category}\n`;
        interviewSection += `   Score: ${evaluation ? evaluation.score : 'N/A'}/100\n\n`;
        interviewSection += `   Candidate Response:\n   ${q.transcript.split('\n').join('\n   ')}\n\n`;
        
        if (evaluation) {
          interviewSection += `   Feedback: ${evaluation.feedback}\n\n`;
          interviewSection += `   Strengths: ${evaluation.strengths.join(', ')}\n`;
          interviewSection += `   Areas for Improvement: ${evaluation.improvements.join(', ')}\n\n`;
        }
      });

      // Add summary
      interviewSection += `Summary: Candidate ${results.passed ? 'passed' : 'failed'} the HR interview with a score of ${results.overallScore.toFixed(1)}%.\n\n`;
      
      // Add overall evaluation
      interviewSection += `
=================================================
OVERALL ASSESSMENT
=================================================
Candidate has completed the full interview process with the following results:

- Aptitude Test: ${results.aptitudeScore ? results.aptitudeScore.toFixed(1) + '%' : 'N/A'}
- Coding Test: ${results.codingScore ? results.codingScore.toFixed(1) + '%' : 'N/A'}
- HR Interview: ${results.overallScore.toFixed(1)}%

Final Recommendation: ${results.evaluation.overall.recommendation.toUpperCase()}

${results.evaluation.overall.comments}
=================================================
`;
      
      // Replace existing HR section or add new one
      if (content.includes('HR INTERVIEW RESULTS')) {
        const startIndex = content.indexOf('HR INTERVIEW RESULTS');
        content = content.substring(0, startIndex) + interviewSection;
      } else {
        content += interviewSection;
      }
      
      // Write updated content
      fs.writeFileSync(this.reportPath, content);
      return true;
    } catch (error) {
      console.error('Error updating HR interview results:', error);
      return false;
    }
  }

  /**
   * Generate complete report from all available results
   * @returns {boolean} Success status
   */
  generateCompleteReport() {
    try {
      // Reset report
      fs.writeFileSync(this.reportPath, this.generateHeader());
      
      // Get candidate directory
      const candidateDir = path.join(process.cwd(), 'database', 'candidates', this.candidateName);
      
      // Check for aptitude results
      const aptitudePath = path.join(candidateDir, 'aptitude_results.json');
      if (fs.existsSync(aptitudePath)) {
        const aptitudeResults = JSON.parse(fs.readFileSync(aptitudePath, 'utf8'));
        this.updateAptitudeResults(aptitudeResults);
      }
      
      // Check for coding results
      const codingPath = path.join(candidateDir, 'coding_results.json');
      if (fs.existsSync(codingPath)) {
        const codingResults = JSON.parse(fs.readFileSync(codingPath, 'utf8'));
        this.updateCodingResults(codingResults);
      }
      
      // Check for interview results
      const interviewPath = path.join(candidateDir, 'interview_results.json');
      if (fs.existsSync(interviewPath)) {
        const interviewResults = JSON.parse(fs.readFileSync(interviewPath, 'utf8'));
        
        // Add scores from previous stages
        if (fs.existsSync(aptitudePath)) {
          interviewResults.aptitudeScore = JSON.parse(fs.readFileSync(aptitudePath, 'utf8')).score;
        }
        
        if (fs.existsSync(codingPath)) {
          interviewResults.codingScore = JSON.parse(fs.readFileSync(codingPath, 'utf8')).score;
        }
        
        this.updateInterviewResults(interviewResults);
      }
      
      return true;
    } catch (error) {
      console.error('Error generating complete report:', error);
      return false;
    }
  }
}

module.exports = ReportGenerator;
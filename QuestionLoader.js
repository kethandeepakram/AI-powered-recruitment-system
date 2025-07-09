// QuestionLoader.js - Enhanced module for loading questions from CSV
const fs = require('fs');
const path = require('path');

class QuestionLoader {
  constructor(options = {}) {
    this.logFunction = options.logFunction || console.log;
    this.questionsCache = {
      HR: null,
      Aptitude: null,
      Coding: null
    };
  }

  /**
   * Load questions from CSV file with enhanced error handling
   * @param {string} csvPath - Path to the CSV file
   * @param {string} filterType - Type of questions to filter ('HR', 'Aptitude', 'Coding')
   * @returns {Promise<Array>} - Array of questions
   */
  async loadFromCSV(csvPath, filterType = null) {
    try {
      this.logFunction(`Loading questions from: ${csvPath}`);

      // Check if file exists
      if (!fs.existsSync(csvPath)) {
        this.logFunction(`CSV file not found: ${csvPath}`);
        return this.getDefaultQuestions(filterType);
      }

      // Read CSV content
      const csvContent = fs.readFileSync(csvPath, 'utf8');

      // Parse CSV content using the updated method
      const questions = this.parseCSV(csvContent, filterType);

      if (questions.length === 0) {
        this.logFunction(`No questions found with type '${filterType || 'any'}'`);
        return this.getDefaultQuestions(filterType);
      }

      // Cache questions by type (using the 'stage' property from the new parser)
      if (filterType && this.questionsCache.hasOwnProperty(filterType)) {
        this.questionsCache[filterType] = questions;
      } else if (!filterType) {
        // If no filter, attempt to cache all loaded types if needed (optional enhancement)
        // questions.forEach(q => {
        //   if (this.questionsCache.hasOwnProperty(q.stage)) {
        //     if (!this.questionsCache[q.stage]) this.questionsCache[q.stage] = [];
        //     this.questionsCache[q.stage].push(q);
        //   }
        // });
      }


      this.logFunction(`Loaded ${questions.length} questions of type '${filterType || 'any'}'`);
      return questions;
    } catch (error) {
      this.logFunction(`Error loading questions: ${error.message}`);
      return this.getDefaultQuestions(filterType);
    }
  }

  /**
   * Parse CSV content into questions array with enhanced format handling
   * @param {string} csvContent - CSV content as string
   * @param {string} filterType - Type of questions to filter
   * @returns {Array} - Array of questions
   */
  parseCSV(csvContent, filterType = null) {
    try {
      const rows = csvContent.split('\n').map(row => row.trim()).filter(row => row.length > 0);

      if (rows.length === 0) {
        this.logFunction('CSV file is empty');
        return [];
      }

      // Extract headers
      const headers = this.parseCSVRow(rows[0]);

      // Find column indices
      const stageIndex = headers.findIndex(h => h.toLowerCase() === 'stage' || h.toLowerCase() === 'type');
      const questionIndex = headers.findIndex(h => h.toLowerCase() === 'question');
      const categoryIndex = headers.findIndex(h => h.toLowerCase() === 'category');
      const optionsIndex = headers.findIndex(h => h.toLowerCase() === 'options');
      const correctAnswerIndex = headers.findIndex(h => h.toLowerCase() === 'correctanswer');
      const testCasesIndex = headers.findIndex(h => h.toLowerCase() === 'testcases');
      const expectedOutputIndex = headers.findIndex(h => h.toLowerCase() === 'expectedoutput');
      const answerTimeIndex = headers.findIndex(h => h.toLowerCase() === 'answertime'); // Removed 'time' alias for clarity based on new structure

      if (stageIndex === -1 || questionIndex === -1) {
        this.logFunction("CSV must contain 'stage' (or 'type') and 'question' columns");
        return [];
      }

      // Parse rows and filter by type
      const questions = [];

      for (let i = 1; i < rows.length; i++) {
        const row = this.parseCSVRow(rows[i]);

        // Basic check for sufficient columns based on mandatory fields
        if (row.length <= Math.max(stageIndex, questionIndex)) continue;

        const stage = row[stageIndex].trim();
        const questionText = row[questionIndex].trim();

        // Skip if we're filtering by type and this doesn't match
        if (filterType && stage.toLowerCase() !== filterType.toLowerCase()) continue;

        const category = categoryIndex !== -1 && row.length > categoryIndex
          ? row[categoryIndex].trim()
          : "General";

        const question = {
          stage: stage,
          question: questionText,
          category: category
        };

        // Add type-specific fields
        if (stage.toLowerCase() === 'aptitude') { // Use toLowerCase for robustness
          question.options = optionsIndex !== -1 && row.length > optionsIndex ? row[optionsIndex].trim() : '';
          question.correctAnswer = correctAnswerIndex !== -1 && row.length > correctAnswerIndex ? row[correctAnswerIndex].trim() : '0'; // Default '0' might need adjustment based on expected format
        } else if (stage.toLowerCase() === 'coding') { // Use toLowerCase for robustness
          question.testCases = testCasesIndex !== -1 && row.length > testCasesIndex ? row[testCasesIndex].trim() : '';
          question.expectedOutput = expectedOutputIndex !== -1 && row.length > expectedOutputIndex ? row[expectedOutputIndex].trim() : '';
        }

        // Add answer time for all questions
        // Provide different defaults based on stage
        const defaultTime = stage.toLowerCase() === 'coding' ? 900 : 60;
        question.answerTime = answerTimeIndex !== -1 && row.length > answerTimeIndex
          ? parseInt(row[answerTimeIndex]) || defaultTime // Use default if parsing fails or value is missing/0
          : defaultTime;

        questions.push(question);
      }

      return questions;
    } catch (error) {
      this.logFunction(`Error parsing CSV: ${error.message}`);
      return [];
    }
  }


  /**
   * Parse a CSV row into an array, handling quoted values
   * @param {string} row - CSV row
   * @returns {Array} - Array of values
   */
  parseCSVRow(row) {
    const result = [];
    let inQuotes = false;
    let currentValue = '';

    for (let i = 0; i < row.length; i++) {
      const char = row[i];

      if (char === '"') {
          // Handle escaped quotes ("") inside quoted fields
          if (inQuotes && row[i+1] === '"') {
              currentValue += '"';
              i++; // Skip the next quote
          } else {
              inQuotes = !inQuotes;
          }
      } else if (char === ',' && !inQuotes) {
        result.push(currentValue);
        currentValue = '';
      } else {
        currentValue += char;
      }
    }

    // Add the last value
    result.push(currentValue);

    // Trim whitespace from each parsed value
    return result.map(val => val.trim());
  }


  /**
   * Add system prompts to the beginning and end of the questions array
   * @param {Array} questions - Array of questions
   * @returns {Array} - Questions with system prompts
   */
  addSystemPrompts(questions) {
    // Determine stage from the first actual question if possible, otherwise default
    const firstQuestionStage = questions.length > 0 ? questions[0].stage : 'HR';

    return [
      {
        stage: firstQuestionStage, // Add stage for consistency
        question: `Welcome to the ${firstQuestionStage} assessment. Please answer the following questions to the best of your ability.`,
        category: "Introduction",
        answerTime: 0, // No answer time for introduction
        isSystemPrompt: true
      },
      ...questions,
      {
        stage: firstQuestionStage, // Add stage for consistency
        question: "Thank you for completing the assessment. We will review your responses.",
        category: "Conclusion",
        answerTime: 0, // No answer time for conclusion
        isSystemPrompt: true
      }
    ];
  }

  /**
   * Get default questions if CSV loading fails
   * @param {string} stage - 'HR', 'Aptitude', or 'Coding'
   * @returns {Array} - Array of default questions
   */
  getDefaultQuestions(stage = null) {
    // Return cached questions if available
    if (stage && this.questionsCache[stage]) {
        this.logFunction(`Using cached default ${stage} questions`);
        return this.questionsCache[stage];
    }

    // Default HR questions
    const hrQuestions = [
      { stage: "HR", question: "Tell me about yourself and your background.", category: "Introduction", answerTime: 60 },
      { stage: "HR", question: "What are your greatest strengths?", category: "Self-Assessment", answerTime: 60 },
      { stage: "HR", question: "What do you consider to be your weaknesses?", category: "Self-Assessment", answerTime: 60 },
      { stage: "HR", question: "Why are you interested in this position?", category: "Motivation", answerTime: 60 },
      { stage: "HR", question: "Describe a challenging situation at work and how you handled it.", category: "Experience", answerTime: 90 },
      { stage: "HR", question: "Where do you see yourself professionally in five years?", category: "Career Goals", answerTime: 60 },
      { stage: "HR", question: "How do you handle stress and pressure?", category: "Work Style", answerTime: 60 }
    ];

    // Default aptitude questions
    const aptitudeQuestions = [
      { stage: "Aptitude", question: "What programming languages are you proficient in?", category: "Technical Skills", options: "Java;Python;JavaScript;C++;Other", correctAnswer: "", answerTime: 60 },
      { stage: "Aptitude", question: "Describe your experience with agile development methodologies.", category: "Methodology", options: "", correctAnswer: "", answerTime: 90 },
      { stage: "Aptitude", question: "How do you approach debugging a complex issue?", category: "Problem Solving", options: "", correctAnswer: "", answerTime: 90 },
      { stage: "Aptitude", question: "Explain your understanding of object-oriented programming principles.", category: "Concepts", options: "", correctAnswer: "", answerTime: 120 },
      { stage: "Aptitude", question: "How do you stay updated with the latest technologies?", category: "Learning", options: "", correctAnswer: "", answerTime: 60 }
    ];

    // Default coding questions
    const codingQuestions = [
      { stage: "Coding", question: "Write a function to find the most frequent element in an array.", category: "Algorithms", testCases: "[1, 3, 2, 1, 4, 1]", expectedOutput: "1", answerTime: 300 },
      { stage: "Coding", question: "Create a function that checks if a string is a palindrome (ignores case and non-alphanumeric chars).", category: "String Manipulation", testCases: "'A man, a plan, a canal: Panama'", expectedOutput: "true", answerTime: 300 },
      { stage: "Coding", question: "Implement a function to reverse a singly linked list.", category: "Data Structures", testCases: "1->2->3->4->5", expectedOutput: "5->4->3->2->1", answerTime: 600 }
    ];

    // Return questions based on stage
    let questions;

    switch (stage?.toLowerCase()) { // Use optional chaining and toLowerCase
      case 'hr':
        questions = hrQuestions;
        break;
      case 'aptitude':
        questions = aptitudeQuestions;
        break;
      case 'coding':
        questions = codingQuestions;
        break;
      default:
        // If no stage provided, maybe return all default? Or stick to HR? Let's stick to HR for now.
        questions = hrQuestions;
        stage = 'HR'; // Ensure stage is set for logging/caching
    }

    // Cache the loaded default questions
    if (stage && this.questionsCache.hasOwnProperty(stage)) {
        this.questionsCache[stage] = questions;
    }

    this.logFunction(`Using default ${stage} questions`);
    return questions;
  }

  /**
   * Create a default CSV file with questions including new fields
   * @param {string} filePath - Path to save the CSV file
   * @returns {Promise<boolean>} - Success status
   */
  async createDefaultQuestionsFile(filePath) {
    try {
      const csvPath = filePath || path.join(process.cwd(), 'database', 'questions.csv');

      // Create directory if it doesn't exist
      const dir = path.dirname(csvPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // Define headers matching the new parser logic
      const headers = 'stage,question,category,options,correctAnswer,testCases,expectedOutput,answerTime';
      let csvContent = headers + '\n';

      // Helper function to format CSV row safely
      const formatRow = (q) => {
          const stage = q.stage || '';
          // Ensure question text with commas or quotes is enclosed in double quotes
          const question = `"${(q.question || '').replace(/"/g, '""')}"`;
          const category = q.category || '';
          // Handle potentially complex fields like options or test cases similarly if needed
          const options = q.options ? `"${(q.options || '').replace(/"/g, '""')}"` : '';
          const correctAnswer = q.correctAnswer || '';
          const testCases = q.testCases ? `"${(q.testCases || '').replace(/"/g, '""')}"` : '';
          const expectedOutput = q.expectedOutput ? `"${(q.expectedOutput || '').replace(/"/g, '""')}"` : '';
          const answerTime = q.answerTime || '';
          return [stage, question, category, options, correctAnswer, testCases, expectedOutput, answerTime].join(',');
      };


      // Add HR questions
      const hrQuestions = this.getDefaultQuestions('HR');
      hrQuestions.forEach(q => {
        csvContent += formatRow(q) + '\n';
      });

      // Add Aptitude questions
      const aptitudeQuestions = this.getDefaultQuestions('Aptitude');
      aptitudeQuestions.forEach(q => {
        csvContent += formatRow(q) + '\n';
      });

      // Add Coding questions
      const codingQuestions = this.getDefaultQuestions('Coding');
      codingQuestions.forEach(q => {
        csvContent += formatRow(q) + '\n';
      });

      // Write to file
      fs.writeFileSync(csvPath, csvContent.trim() + '\n'); // Trim trailing newline then add one back
      this.logFunction(`Created default questions file at ${csvPath}`);

      return true;
    } catch (error) {
      this.logFunction(`Error creating default questions file: ${error.message}`);
      return false;
    }
  }
}

module.exports = QuestionLoader;
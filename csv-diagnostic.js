// csv-diagnostic.js - Run to diagnose issues with questions.csv
const fs = require('fs');
const path = require('path');

function diagnoseCsv(filePath) {
  console.log(`Diagnosing CSV file: ${filePath}`);
  
  // Check if file exists
  if (!fs.existsSync(filePath)) {
    console.error(`ERROR: File does not exist at ${filePath}`);
    return false;
  }
  
  // Read file content
  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
    console.log(`Successfully read file (${content.length} bytes)`);
  } catch (error) {
    console.error(`ERROR: Failed to read file: ${error.message}`);
    return false;
  }
  
  // Check for empty file
  if (!content || content.trim() === '') {
    console.error('ERROR: File is empty');
    return false;
  }
  
  // Check for BOM
  if (content.charCodeAt(0) === 0xFEFF) {
    console.error('WARNING: File contains UTF-8 BOM marker which may cause parsing issues');
  }
  
  // Check header row
  const lines = content.split(/\r?\n/);
  if (lines.length === 0) {
    console.error('ERROR: No lines found in file');
    return false;
  }
  
  const header = lines[0];
  const expectedHeader = 'stage,question,category,options,correctAnswer,testCases,expectedOutput,answerTime';
  
  if (header.trim() !== expectedHeader) {
    console.error(`ERROR: Invalid header row`);
    console.error(`Expected: ${expectedHeader}`);
    console.error(`Found: ${header}`);
  } else {
    console.log('Header row is valid');
  }
  
  // Check data rows
  const dataRows = lines.slice(1).filter(line => line.trim() !== '');
  console.log(`Found ${dataRows.length} data rows`);
  
  // Check for common issues in each row
  let stageStats = { HR: 0, Aptitude: 0, Coding: 0, Other: 0 };
  let invalidRows = [];
  
  dataRows.forEach((row, index) => {
    const rowNum = index + 2; // +2 because index starts at 0 and we skipped header
    
    // Basic validation - check for empty fields where required
    const fields = parseCSVRow(row);
    
    if (!fields || fields.length < 3) {
      invalidRows.push({ row: rowNum, error: 'Too few fields' });
      return;
    }
    
    // Check stage
    const stage = fields[0].trim();
    if (!stage) {
      invalidRows.push({ row: rowNum, error: 'Missing stage' });
    } else {
      if (['HR', 'Aptitude', 'Coding'].includes(stage)) {
        stageStats[stage]++;
      } else {
        stageStats.Other++;
        invalidRows.push({ row: rowNum, error: `Invalid stage: ${stage}` });
      }
    }
    
    // Check for empty question
    if (!fields[1] || fields[1].trim() === '') {
      invalidRows.push({ row: rowNum, error: 'Missing question' });
    }
    
    // Stage-specific validation
    if (stage === 'Aptitude' && (!fields[3] || !fields[4])) {
      invalidRows.push({ row: rowNum, error: 'Aptitude question missing options or correctAnswer' });
    }
    
    if (stage === 'Coding' && (!fields[5] || !fields[6])) {
      invalidRows.push({ row: rowNum, error: 'Coding question missing testCases or expectedOutput' });
    }
  });
  
  // Report statistics
  console.log('\nQuestion statistics:');
  console.log(stageStats);
  
  if (invalidRows.length > 0) {
    console.error('\nInvalid rows found:');
    invalidRows.forEach(item => {
      console.error(`Row ${item.row}: ${item.error}`);
    });
  } else {
    console.log('\nAll data rows appear valid');
  }
  
  // Create a fixed version if issues were found
  if (invalidRows.length > 0) {
    const fixedPath = filePath.replace('.csv', '_fixed.csv');
    console.log(`\nCreating fixed version at: ${fixedPath}`);
    
    // Import QuestionLoader to generate default questions
    try {
      const QuestionLoader = require('./QuestionLoader');
      const loader = new QuestionLoader();
      loader.createDefaultQuestionsFile(fixedPath);
      console.log(`Created fixed CSV with default questions at ${fixedPath}`);
      console.log('Copy this file to replace your current questions.csv');
    } catch (error) {
      console.error(`ERROR: Failed to create fixed version: ${error.message}`);
    }
  }
  
  return invalidRows.length === 0;
}

// Helper function to correctly parse CSV rows handling quotes
function parseCSVRow(row) {
  const result = [];
  let inQuotes = false;
  let field = '';
  
  for (let i = 0; i < row.length; i++) {
    const char = row[i];
    
    if (char === '"') {
      if (i < row.length - 1 && row[i + 1] === '"') {
        // Escaped quote
        field += '"';
        i++; // Skip the next quote
      } else {
        // Toggle quote mode
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      // End of field
      result.push(field);
      field = '';
    } else {
      field += char;
    }
  }
  
  // Add the last field
  result.push(field);
  return result;
}

// Find questions.csv in multiple possible locations
const possiblePaths = [
  path.join(process.cwd(), 'database', 'questions.csv'),
  path.join(process.cwd(), 'questions.csv'),
  path.join(__dirname, 'database', 'questions.csv'),
  path.join(__dirname, 'questions.csv')
];

let fileFound = false;
for (const filePath of possiblePaths) {
  if (fs.existsSync(filePath)) {
    console.log(`Found questions.csv at: ${filePath}`);
    diagnoseCsv(filePath);
    fileFound = true;
    break;
  }
}

if (!fileFound) {
  console.error('ERROR: questions.csv not found in any of the expected locations');
  console.log('Creating default questions.csv file...');
  
  try {
    const QuestionLoader = require('./QuestionLoader');
    const loader = new QuestionLoader();
    const defaultPath = path.join(process.cwd(), 'database', 'questions.csv');
    loader.createDefaultQuestionsFile(defaultPath);
    console.log(`Created default questions.csv at ${defaultPath}`);
  } catch (error) {
    console.error(`ERROR: Failed to create default questions.csv: ${error.message}`);
  }
}
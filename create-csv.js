// create-csv.js - Creates a new questions.csv file with default questions
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Create directory structure if needed
const dbPath = path.join(process.cwd(), 'database');
if (!fs.existsSync(dbPath)) {
  fs.mkdirSync(dbPath, { recursive: true });
  console.log(`Created directory: ${dbPath}`);
}

// Create basic CSV content
const csvPath = path.join(dbPath, 'questions.csv');
const csvContent = `stage,question,category,options,correctAnswer,testCases,expectedOutput,answerTime
Coding,"Implement a function that returns the Fibonacci sequence up to n numbers.","Algorithms",,"","5|10","[0, 1, 1, 2, 3]|[0, 1, 1, 2, 3, 5, 8, 13, 21, 34]",600
Coding,"Write a function to check if a given string is a palindrome.","Strings",,"","racecar|hello","true|false",600
Coding,"Find the maximum value in an array.","Arrays",,"","[1,2,3,4,5]|[5,4,3,2,1]","5|5",300
`

fs.writeFileSync(csvPath, csvContent);
console.log(`Created questions.csv at ${csvPath}`);

// Also try to verify csv-parser is installed
try {
  execSync('npm list csv-parser', { stdio: 'ignore' });
  console.log('csv-parser is already installed');
} catch (e) {
  console.log('csv-parser may not be installed. Installing...');
  try {
    execSync('npm install csv-parser', { stdio: 'inherit' });
    console.log('csv-parser installed successfully');
  } catch (e) {
    console.error('Failed to install csv-parser. Please run: npm install csv-parser');
  }
}

console.log('\nDone. Restart your application to load the new questions.');
// server.js - Express Backend Server for HRX Application
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { initializeApp } = require('firebase/app');
const { getFirestore, collection, addDoc, getDoc, getDocs, query, where, doc, setDoc } = require('firebase/firestore');
const { getStorage, ref, uploadBytes, getDownloadURL } = require('firebase/storage');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Initialize Express
const app = express();
const PORT = process.env.PORT || 3000;

// Configure middleware
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));

// Firebase configuration
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "hrx-interview.firebaseapp.com",
  projectId: "hrx-interview",
  storageBucket: "hrx-interview.appspot.com",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// Initialize Firebase
const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);
const storage = getStorage(firebaseApp);

// Initialize Gemini API
const genAI = new GoogleGenerativeAI("YOUR_GEMINI_API_KEY");
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// Set up multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
});

// Helper function to generate a unique ID
function generateUniqueId() {
  return crypto.randomBytes(16).toString('hex');
}

// API Routes

// 1. Register a new candidate
app.post('/api/candidates/register', async (req, res) => {
  try {
    const { candidateName, email } = req.body;
    
    // Create candidate record in Firestore
    const candidateRef = collection(db, 'candidates');
    const candidateId = generateUniqueId();
    
    await setDoc(doc(candidateRef, candidateId), {
      id: candidateId,
      name: candidateName,
      email: email,
      status: 'registered',
      createdAt: new Date().toISOString()
    });
    
    res.status(201).json({ 
      success: true, 
      candidateId,
      message: 'Candidate registered successfully' 
    });
  } catch (error) {
    console.error('Error registering candidate:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// 2. Upload resume
app.post('/api/candidates/:candidateId/resume', upload.single('resume'), async (req, res) => {
  try {
    const { candidateId } = req.params;
    const file = req.file;
    
    if (!file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }
    
    // Upload to Firebase Storage
    const fileRef = ref(storage, `candidates/${candidateId}/resume.pdf`);
    await uploadBytes(fileRef, file.buffer);
    const downloadUrl = await getDownloadURL(fileRef);
    
    // Extract text from PDF (simplified version - you'd use pdf.js for this)
    let resumeText = req.body.resumeText || '';
    
    // Update candidate record
    const candidateRef = doc(db, 'candidates', candidateId);
    await setDoc(candidateRef, {
      resumeUrl: downloadUrl,
      resumeText: resumeText,
      lastUpdated: new Date().toISOString()
    }, { merge: true });
    
    res.status(200).json({ 
      success: true, 
      resumeUrl: downloadUrl,
      message: 'Resume uploaded successfully' 
    });
  } catch (error) {
    console.error('Error uploading resume:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// 3. Upload identification (face photo and ID photo)
app.post('/api/candidates/:candidateId/identification', async (req, res) => {
  try {
    const { candidateId } = req.params;
    const { faceImage, idImage } = req.body;
    
    if (!faceImage || !idImage) {
      return res.status(400).json({ success: false, message: 'Face image and ID image are required' });
    }
    
    // Convert base64 to buffer
    const faceBuffer = Buffer.from(faceImage.split(',')[1], 'base64');
    const idBuffer = Buffer.from(idImage.split(',')[1], 'base64');
    
    // Upload to Firebase Storage
    const faceRef = ref(storage, `candidates/${candidateId}/face.png`);
    const idRef = ref(storage, `candidates/${candidateId}/id.png`);
    
    await uploadBytes(faceRef, faceBuffer);
    await uploadBytes(idRef, idBuffer);
    
    const faceUrl = await getDownloadURL(faceRef);
    const idUrl = await getDownloadURL(idRef);
    
    // Update candidate record
    const candidateRef = doc(db, 'candidates', candidateId);
    await setDoc(candidateRef, {
      faceImageUrl: faceUrl,
      idImageUrl: idUrl,
      idVerificationStatus: 'pending',
      lastUpdated: new Date().toISOString()
    }, { merge: true });
    
    res.status(200).json({ 
      success: true, 
      faceImageUrl: faceUrl,
      idImageUrl: idUrl,
      message: 'Identification uploaded successfully' 
    });
  } catch (error) {
    console.error('Error uploading identification:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// 4. Save interview answers
app.post('/api/candidates/:candidateId/answers', async (req, res) => {
  try {
    const { candidateId } = req.params;
    const { answers, questions } = req.body;
    
    // Format answers for storage
    const formattedAnswers = questions.map((question, index) => ({
      question,
      answer: answers[index] || '',
    }));
    
    // Update candidate record
    const candidateRef = doc(db, 'candidates', candidateId);
    await setDoc(candidateRef, {
      interviewAnswers: formattedAnswers,
      interviewCompletedAt: new Date().toISOString(),
      status: 'interview_completed',
      lastUpdated: new Date().toISOString()
    }, { merge: true });
    
    // Generate report with Gemini API
    const report = await generateCandidateReport(candidateId);
    
    res.status(200).json({ 
      success: true, 
      message: 'Interview answers saved successfully',
      reportGenerated: !!report
    });
  } catch (error) {
    console.error('Error saving interview answers:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// 5. Generate candidate report using Gemini API
async function generateCandidateReport(candidateId) {
  try {
    // Get candidate data
    const candidateRef = doc(db, 'candidates', candidateId);
    const candidateSnap = await getDoc(candidateRef);
    
    if (!candidateSnap.exists()) {
      throw new Error('Candidate not found');
    }
    
    const candidateData = candidateSnap.data();
    
    // Format resume and answers for the prompt
    const resumeText = candidateData.resumeText || 'No resume provided';
    
    let answersText = '';
    if (candidateData.interviewAnswers && candidateData.interviewAnswers.length > 0) {
      answersText = candidateData.interviewAnswers.map((item, index) => {
        return `Question ${index + 1}: ${item.question}\nAnswer: ${item.answer}`;
      }).join('\n\n');
    } else {
      answersText = 'No interview answers provided';
    }
    
    // Create the prompt for Gemini
    const prompt = `
    You are a professional HR evaluator. Please analyze the following candidate information 
    and provide a detailed evaluation.
    
    CANDIDATE NAME: ${candidateData.name}
    
    ===============================================
    RESUME
    ===============================================
    
    ${resumeText}
    
    ===============================================
    INTERVIEW RESPONSES
    ===============================================
    
    ${answersText}
    
    ===============================================
    
    Please provide a comprehensive evaluation including:
    1. Overall assessment of candidate qualifications
    2. Strengths and weaknesses
    3. Communication skills assessment
    4. Technical skills assessment
    5. Cultural fit evaluation
    6. Recommendations for next steps
    7. Rating on a scale of 1-10
    
    Format your response as a professional HR report.
    `;
    
    // Generate content with Gemini API
    const result = await model.generateContent(prompt);
    const reportText = result.response.text();
    
    // Save the report to Firestore
    await setDoc(candidateRef, {
      report: reportText,
      reportGeneratedAt: new Date().toISOString(),
      status: 'evaluated',
      lastUpdated: new Date().toISOString()
    }, { merge: true });
    
    // Also save the report to a separate storage location
    const reportRef = ref(storage, `candidates/${candidateId}/REPORT.txt`);
    const reportBuffer = Buffer.from(reportText, 'utf-8');
    await uploadBytes(reportRef, reportBuffer);
    
    return reportText;
  } catch (error) {
    console.error('Error generating candidate report:', error);
    return null;
  }
}

// 6. Get candidate report
app.get('/api/candidates/:candidateId/report', async (req, res) => {
  try {
    const { candidateId } = req.params;
    
    const candidateRef = doc(db, 'candidates', candidateId);
    const candidateSnap = await getDoc(candidateRef);
    
    if (!candidateSnap.exists()) {
      return res.status(404).json({ success: false, message: 'Candidate not found' });
    }
    
    const candidateData = candidateSnap.data();
    
    if (!candidateData.report) {
      return res.status(404).json({ success: false, message: 'Report not found' });
    }
    
    res.status(200).json({ 
      success: true, 
      report: candidateData.report
    });
  } catch (error) {
    console.error('Error retrieving candidate report:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// 7. Get all candidates (for HR dashboard)
app.get('/api/candidates', async (req, res) => {
  try {
    const candidatesRef = collection(db, 'candidates');
    const candidatesSnap = await getDocs(candidatesRef);
    
    const candidates = [];
    candidatesSnap.forEach((doc) => {
      const data = doc.data();
      candidates.push({
        id: data.id,
        name: data.name,
        email: data.email,
        status: data.status,
        createdAt: data.createdAt,
        lastUpdated: data.lastUpdated
      });
    });
    
    res.status(200).json({ 
      success: true, 
      candidates
    });
  } catch (error) {
    console.error('Error retrieving candidates:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// 8. Get candidate details (for HR dashboard)
app.get('/api/candidates/:candidateId', async (req, res) => {
  try {
    const { candidateId } = req.params;
    
    const candidateRef = doc(db, 'candidates', candidateId);
    const candidateSnap = await getDoc(candidateRef);
    
    if (!candidateSnap.exists()) {
      return res.status(404).json({ success: false, message: 'Candidate not found' });
    }
    
    const candidateData = candidateSnap.data();
    
    // Get signed URLs for the files
    let resumeUrl = null;
    let faceImageUrl = null;
    let idImageUrl = null;
    
    if (candidateData.resumeUrl) {
      resumeUrl = candidateData.resumeUrl;
    }
    
    if (candidateData.faceImageUrl) {
      faceImageUrl = candidateData.faceImageUrl;
    }
    
    if (candidateData.idImageUrl) {
      idImageUrl = candidateData.idImageUrl;
    }
    
    res.status(200).json({ 
      success: true, 
      candidate: {
        ...candidateData,
        resumeUrl,
        faceImageUrl,
        idImageUrl
      }
    });
  } catch (error) {
    console.error('Error retrieving candidate details:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
"""
Consolidated Proctoring Server
------------------------------
This script combines eye tracking, face detection, and proctoring functionality
into a single FastAPI service that the Electron app can connect to.
"""

import base64
import cv2
import dlib
import numpy as np
import math
import os
import sys
import json
from io import BytesIO
from typing import Dict, List, Tuple, Optional, Any
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from PIL import Image
import uvicorn
import logging
from datetime import datetime

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler("proctoring_server.log"),
        logging.StreamHandler(sys.stdout)
    ]
)

logger = logging.getLogger("proctoring")

# Create FastAPI app
app = FastAPI(title="Proctoring API", 
              description="Eye tracking and proctoring system for coding assessment")

# Add CORS middleware to allow requests from Electron
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins
    allow_credentials=True,
    allow_methods=["*"],  # Allows all methods
    allow_headers=["*"],  # Allows all headers
)

# Models and data structures
class EyeTrackerRequest(BaseModel):
    image: str
    candidate: str

class ProctorStatus(BaseModel):
    status: str
    active: bool
    candidates: List[str]

# Constants for eye tracking
EAR_THRESHOLD = 0.2   # Eye aspect ratio threshold
GAZE_THRESHOLD = 0.25  # Gaze ratio threshold
BLINK_THRESHOLD = 0.19  # Threshold for blinking detection

# Load face detection and landmark models
MODEL_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "models")

# Check if model directory exists
if not os.path.exists(MODEL_DIR):
    os.makedirs(MODEL_DIR, exist_ok=True)
    logger.warning(f"Created models directory at {MODEL_DIR}")

# Path to shape predictor model
SHAPE_PREDICTOR_PATH = os.path.join(MODEL_DIR, "shape_predictor_68_face_landmarks.dat")

# Check if shape predictor file exists
if not os.path.exists(SHAPE_PREDICTOR_PATH):
    logger.error(f"Shape predictor file not found at {SHAPE_PREDICTOR_PATH}")
    logger.error("Please download the shape predictor file and place it in the models directory")
    logger.error("Download link: https://github.com/davisking/dlib-models/raw/master/shape_predictor_68_face_landmarks.dat.bz2")
    logger.error("After downloading, extract it and place in the models directory")
else:
    logger.info(f"Shape predictor file found at {SHAPE_PREDICTOR_PATH}")

# Initialize face detector and shape predictor
try:
    detector = dlib.get_frontal_face_detector()
    predictor = dlib.shape_predictor(SHAPE_PREDICTOR_PATH)
    logger.info("Face detector and shape predictor initialized successfully")
except Exception as e:
    logger.error(f"Error initializing face detection models: {e}")
    detector = None
    predictor = None

# Indices for facial landmarks (based on 68-point model)
LEFT_EYE_INDICES = list(range(36, 42))
RIGHT_EYE_INDICES = list(range(42, 48))

# Directory for saving proctoring data
PROCTORING_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "database", "proctoring")
os.makedirs(PROCTORING_DIR, exist_ok=True)

# Tracking active candidates
active_candidates = {}

# Helper functions
def euclidean_distance(point1: Tuple[float, float], point2: Tuple[float, float]) -> float:
    """Calculate Euclidean distance between two points"""
    return math.sqrt((point1[0] - point2[0])**2 + (point1[1] - point2[1])**2)

def eye_aspect_ratio(eye_landmarks: List[Tuple[int, int]]) -> float:
    """Calculate the eye aspect ratio (EAR)"""
    # Vertical distances
    A = euclidean_distance(eye_landmarks[1], eye_landmarks[5])
    B = euclidean_distance(eye_landmarks[2], eye_landmarks[4])
    
    # Horizontal distance
    C = euclidean_distance(eye_landmarks[0], eye_landmarks[3])
    
    # Calculate EAR
    ear = (A + B) / (2.0 * C) if C > 0 else 0
    return ear

def get_gaze_ratio(eye_landmarks: List[Tuple[int, int]], gray: np.ndarray) -> Optional[float]:
    """Calculate the gaze ratio to detect where the eyes are looking"""
    try:
        # Create mask for the eye region
        height, width = gray.shape
        mask = np.zeros((height, width), np.uint8)
        
        # Generate eye polygon mask
        eye_points = np.array(eye_landmarks, dtype=np.int32)
        cv2.fillPoly(mask, [eye_points], 255)
        
        # Extract eye region
        eye_region = cv2.bitwise_and(gray, gray, mask=mask)
        
        # Get extreme points
        min_x = min(point[0] for point in eye_landmarks)
        max_x = max(point[0] for point in eye_landmarks)
        min_y = min(point[1] for point in eye_landmarks)
        max_y = max(point[1] for point in eye_landmarks)
        
        # Ensure valid region
        if min_x >= 0 and min_y >= 0 and max_x < width and max_y < height and max_x > min_x and max_y > min_y:
            # Extract eye from mask
            eye = eye_region[min_y:max_y, min_x:max_x]
            
            # Get midpoint of eye
            eye_width = max_x - min_x
            half_width = eye_width // 2
            
            # Split eye into left and right halves
            if half_width > 0:
                left_side = eye[:, :half_width]
                right_side = eye[:, half_width:]
                
                # Count non-zero pixels in each half (masked eye region)
                left_white = cv2.countNonZero(cv2.threshold(left_side, 50, 255, cv2.THRESH_BINARY)[1])
                right_white = cv2.countNonZero(cv2.threshold(right_side, 50, 255, cv2.THRESH_BINARY)[1])
                
                # Calculate ratio if either side has enough pixels
                if left_white > 0 or right_white > 0:
                    # Add small value to avoid division by zero
                    gaze_ratio = (left_white + 1) / (right_white + 1)
                    return gaze_ratio
    except Exception as e:
        logger.error(f"Error in gaze calculation: {e}")
    
    return None

def save_cheating_image(background_tasks: BackgroundTasks, frame: np.ndarray, candidate: str) -> Optional[str]:
    """Save image when cheating is detected (in background)"""
    def _save_image():
        try:
            # Create directory structure if it doesn't exist
            save_dir = os.path.join(PROCTORING_DIR, candidate)
            os.makedirs(save_dir, exist_ok=True)
            
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
            filename = f"cheating_{candidate}_{timestamp}.jpg"
            filepath = os.path.join(save_dir, filename)
            
            # Save image
            cv2.imwrite(filepath, frame)
            
            # Log the event
            log_dir = os.path.join(save_dir, "logs")
            os.makedirs(log_dir, exist_ok=True)
            log_file = os.path.join(log_dir, "cheating_log.txt")
            
            with open(log_file, "a") as f:
                f.write(f"{timestamp}: Cheating detected - image saved as {filename}\n")
                
            logger.info(f"Saved cheating image for {candidate}: {filepath}")
            return filepath
        except Exception as e:
            logger.error(f"Error saving cheating image: {e}")
            return None
    
    background_tasks.add_task(_save_image)
    return None

# API Endpoints
@app.get("/")
async def root():
    """Root endpoint"""
    return {"message": "Proctoring API is running"}

@app.get("/status")
async def get_status() -> ProctorStatus:
    """Get the status of the proctoring server"""
    return {
        "status": "running" if detector and predictor else "degraded",
        "active": True,
        "candidates": list(active_candidates.keys())
    }

@app.post("/eye_tracker")
async def track_eyes(request: EyeTrackerRequest, background_tasks: BackgroundTasks) -> Dict[str, Any]:
    """API endpoint for eye tracking"""
    # Update active candidates
    if request.candidate not in active_candidates:
        active_candidates[request.candidate] = {
            "last_active": datetime.now(),
            "cheating_count": 0,
            "warnings": []
        }
    else:
        active_candidates[request.candidate]["last_active"] = datetime.now()
    
    try:
        # Check if models are loaded
        if not detector or not predictor:
            return {
                "cheating": True, 
                "message": "Proctoring service is degraded. Face detection models not loaded.", 
                "left_eye": None, 
                "right_eye": None,
                "reason": "service_degraded"
            }
        
        # Decode base64 image
        try:
            # Handle both formats: with and without data URL prefix
            if ',' in request.image:
                header, encoded = request.image.split(',', 1)
            else:
                encoded = request.image
            
            image_data = base64.b64decode(encoded)
            img = Image.open(BytesIO(image_data)).convert("RGB")
            frame = np.array(img)
            frame = cv2.cvtColor(frame, cv2.COLOR_RGB2BGR)
        except Exception as e:
            logger.error(f"Error decoding image: {e}")
            return {
                "cheating": False,
                "message": "Error processing image",
                "left_eye": None,
                "right_eye": None,
                "reason": "image_error"
            }
        
        # Create grayscale version for processing
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        
        # Detect faces
        faces = detector(gray)
        
        # No face detected - possible cheating
        if len(faces) == 0:
            active_candidates[request.candidate]["cheating_count"] += 1
            active_candidates[request.candidate]["warnings"].append({
                "timestamp": datetime.now().isoformat(),
                "reason": "no_face"
            })
            
            return {
                "cheating": True, 
                "message": "No face detected. Please look at the camera.", 
                "left_eye": None, 
                "right_eye": None,
                "reason": "no_face"
            }
        
        # Multiple faces detected - possible cheating
        if len(faces) > 1:
            active_candidates[request.candidate]["cheating_count"] += 1
            active_candidates[request.candidate]["warnings"].append({
                "timestamp": datetime.now().isoformat(),
                "reason": "multiple_faces"
            })
            
            # Save cheating image
            save_cheating_image(background_tasks, frame, request.candidate)
            
            return {
                "cheating": True, 
                "message": "Multiple faces detected. Please ensure you're alone.", 
                "left_eye": None, 
                "right_eye": None,
                "reason": "multiple_faces"
            }
        
        # Process the detected face
        face = faces[0]
        shape = predictor(gray, face)
        
        # Extract landmarks for both eyes
        left_eye = [(shape.part(i).x, shape.part(i).y) for i in LEFT_EYE_INDICES]
        right_eye = [(shape.part(i).x, shape.part(i).y) for i in RIGHT_EYE_INDICES]
        
        # Calculate eye aspect ratios
        left_ear = eye_aspect_ratio(left_eye)
        right_ear = eye_aspect_ratio(right_eye)
        avg_ear = (left_ear + right_ear) / 2.0
        
        # Calculate gaze ratios
        left_gaze = get_gaze_ratio(left_eye, gray)
        right_gaze = get_gaze_ratio(right_eye, gray)
        avg_gaze = (left_gaze + right_gaze) / 2.0 if left_gaze and right_gaze else None
        
        # Compute eye centers (normalized coordinates)
        height, width = frame.shape[:2]
        left_center = (sum(pt[0] for pt in left_eye) / len(left_eye) / width, 
                       sum(pt[1] for pt in left_eye) / len(left_eye) / height)
        right_center = (sum(pt[0] for pt in right_eye) / len(right_eye) / width, 
                        sum(pt[1] for pt in right_eye) / len(right_eye) / height)
        
        # Detect cheating based on eye metrics
        is_cheating = False
        reason = None
        message = "Eyes on screen."
        
        # Eyes closed detection
        if avg_ear < BLINK_THRESHOLD:
            is_cheating = True
            reason = "eyes_closed"
            message = "EYES DETECTED AS CLOSED. PLEASE OPEN YOUR EYES."
        # Looking away detection based on gaze ratio
        elif avg_gaze is not None and (avg_gaze < 0.5 / GAZE_THRESHOLD or avg_gaze > GAZE_THRESHOLD * 2):
            is_cheating = True
            reason = "looking_away"
            message = "LOOK AT THE SCREEN. KEEP YOUR EYES ON THE SCREEN."
        
        # Save image and update tracking if cheating detected
        if is_cheating:
            active_candidates[request.candidate]["cheating_count"] += 1
            active_candidates[request.candidate]["warnings"].append({
                "timestamp": datetime.now().isoformat(),
                "reason": reason
            })
            
            # Save cheating image
            save_cheating_image(background_tasks, frame, request.candidate)
        
        return {
            "cheating": is_cheating,
            "message": message,
            "left_eye": left_center,
            "right_eye": right_center,
            "ear": avg_ear,
            "gaze_ratio": avg_gaze,
            "reason": reason
        }
    except Exception as e:
        logger.error(f"Error in eye tracking: {e}")
        return {
            "cheating": False,
            "message": "Error processing request",
            "left_eye": None,
            "right_eye": None,
            "reason": "error",
            "error": str(e)
        }

@app.get("/candidates/{candidate}/stats")
async def get_candidate_stats(candidate: str) -> Dict[str, Any]:
    """Get proctoring statistics for a candidate"""
    if candidate not in active_candidates:
        raise HTTPException(status_code=404, detail=f"Candidate {candidate} not found")
    
    return active_candidates[candidate]

# Run the server if this script is executed directly
if __name__ == "__main__":
    # Default port 8002 to match the interview.js code
    port = int(os.environ.get("PROCTORING_PORT", 8002))
    
    logger.info(f"Starting proctoring server on port {port}")
    uvicorn.run(app, host="127.0.0.1", port=port)
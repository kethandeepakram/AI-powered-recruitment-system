import pyaudio
import speech_recognition as sr
import wave
import json
import sys
import threading
import queue
import time
import struct
import os

# Constants
CHUNK = 1024
FORMAT = pyaudio.paInt16
CHANNELS = 1
RATE = 44100
TRANSCRIBE_INTERVAL = 5  # seconds
LEVEL_INTERVAL = 0.1  # seconds

# Global variables
is_recording = False
is_exiting = False
audio_queue = queue.Queue()
candidate_folder = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.getcwd(), 'recordings')

# Setup recognizer
recognizer = sr.Recognizer()
# Adjust for ambient noise level - makes transcription more accurate
recognizer.energy_threshold = 300
recognizer.dynamic_energy_threshold = True

# Function to handle commands from JavaScript
def command_handler():
    global is_recording, is_exiting
    while not is_exiting:
        try:
            line = sys.stdin.readline().strip()
            if line:
                command = json.loads(line)
                if command['command'] == 'start':
                    is_recording = True
                    sys.stdout.flush()
                elif command['command'] == 'stop':
                    is_recording = False
                    sys.stdout.flush()
                elif command['command'] == 'exit':
                    is_exiting = True
                    is_recording = False
                    sys.stdout.flush()
        except Exception as e:
            print(json.dumps({'type': 'error', 'message': str(e)}), flush=True)
            sys.stderr.flush()
        time.sleep(0.1)  # Small delay to prevent CPU hogging

# Function to transcribe audio
def transcribe_audio(audio_data):
    try:
        audio = sr.AudioData(audio_data, RATE, 2)  # 2 bytes per sample for paInt16
        text = recognizer.recognize_google(audio)
        print(json.dumps({'type': 'transcription', 'text': text}), flush=True)
    except sr.UnknownValueError:
        print(json.dumps({'type': 'transcription', 'text': ''}), flush=True)
    except sr.RequestError as e:
        print(json.dumps({'type': 'error', 'message': f"Google API error: {str(e)}"}), flush=True)
    except Exception as e:
        print(json.dumps({'type': 'error', 'message': f"Transcription error: {str(e)}"}), flush=True)

# Transcription thread
def transcription_thread():
    accumulated_frames = []
    last_transcribe_time = time.time()
    
    while not is_exiting:
        if not is_recording:
            time.sleep(0.5)
            continue
            
        try:
            # Get audio frames from queue with timeout
            try:
                frames = audio_queue.get(timeout=1)
                accumulated_frames.append(frames)
            except queue.Empty:
                continue
                
            current_time = time.time()
            if current_time - last_transcribe_time >= TRANSCRIBE_INTERVAL and accumulated_frames:
                audio_data = b''.join(accumulated_frames)
                
                if len(audio_data) > 0:
                    # Use a separate thread for transcription to avoid blocking
                    threading.Thread(target=transcribe_audio, args=(audio_data,), daemon=True).start()
                    
                accumulated_frames = []  # Clear accumulated frames
                last_transcribe_time = current_time
                
        except Exception as e:
            print(json.dumps({'type': 'error', 'message': f"Transcription thread error: {str(e)}"}), flush=True)
            time.sleep(1)  # Wait a bit before retrying

# Main function
def main():
    global is_recording, is_exiting
    
    # Create candidate folder if it doesn't exist
    try:
        audio_dir = os.path.join(candidate_folder, 'audio')
        os.makedirs(audio_dir, exist_ok=True)
    except Exception as e:
        print(json.dumps({'type': 'error', 'message': f"Failed to create directory: {str(e)}"}), flush=True)
        return

    # Notify JavaScript that we're ready
    print(json.dumps({'type': 'ready'}), flush=True)
    
    # Start command handler thread
    cmd_thread = threading.Thread(target=command_handler, daemon=True)
    cmd_thread.start()
    
    # Start transcription thread
    trans_thread = threading.Thread(target=transcription_thread, daemon=True)
    trans_thread.start()
    
    p = pyaudio.PyAudio()
    stream = None
    wf = None
    last_level_time = time.time()
    
    try:
        while not is_exiting:
            if is_recording:
                if stream is None:
                    try:
                        # Open audio stream
                        stream = p.open(format=FORMAT,
                                      channels=CHANNELS,
                                      rate=RATE,
                                      input=True,
                                      frames_per_buffer=CHUNK)
                        
                        # Open wave file for recording
                        timestamp = time.strftime("%Y%m%d-%H%M%S")
                        audio_path = os.path.join(audio_dir, f'interview_{timestamp}.wav')
                        wf = wave.open(audio_path, 'wb')
                        wf.setnchannels(CHANNELS)
                        wf.setsampwidth(p.get_sample_size(FORMAT))
                        wf.setframerate(RATE)
                        
                        print(json.dumps({
                            'type': 'info', 
                            'message': f'Recording started: {audio_path}'
                        }), flush=True)
                        
                    except Exception as e:
                        print(json.dumps({
                            'type': 'error', 
                            'message': f'Failed to access microphone: {str(e)}'
                        }), flush=True)
                        is_recording = False
                        time.sleep(1)
                        continue
                
                try:
                    # Read audio data
                    frames = stream.read(CHUNK, exception_on_overflow=False)
                    
                    # Write to WAV file
                    if wf:
                        wf.writeframes(frames)
                    
                    # Put in queue for transcription
                    audio_queue.put(frames)
                    
                    # Calculate and send audio level
                    try:
                        int_frames = struct.unpack(f'{len(frames)//2}h', frames)
                        max_val = max(abs(x) for x in int_frames) if int_frames else 0
                        level = min(1.0, max_val / 32768.0)  # Normalize to 0-1 range
                        
                        current_time = time.time()
                        if current_time - last_level_time >= LEVEL_INTERVAL:
                            print(json.dumps({'type': 'audio_level', 'level': level}), flush=True)
                            last_level_time = current_time
                    except Exception as e:
                        # Non-critical error, just log it
                        sys.stderr.write(f"Error calculating audio level: {str(e)}\n")
                        sys.stderr.flush()
                
                except Exception as e:
                    print(json.dumps({'type': 'error', 'message': f'Error reading audio: {str(e)}'}), flush=True)
                    time.sleep(0.5)
            
            else:
                # Close stream if we're not recording
                if stream is not None:
                    try:
                        stream.stop_stream()
                        stream.close()
                        stream = None
                    except Exception as e:
                        print(json.dumps({'type': 'error', 'message': f'Error closing stream: {str(e)}'}), flush=True)
                
                # Close WAV file
                if wf is not None:
                    try:
                        wf.close()
                        wf = None
                        print(json.dumps({'type': 'info', 'message': 'Recording saved'}), flush=True)
                    except Exception as e:
                        print(json.dumps({'type': 'error', 'message': f'Error saving recording: {str(e)}'}), flush=True)
                
                time.sleep(0.2)  # Sleep when not recording to reduce CPU usage
    
    except Exception as e:
        print(json.dumps({'type': 'error', 'message': f'Main loop error: {str(e)}'}), flush=True)
    
    finally:
        # Clean up resources
        if stream is not None:
            try:
                stream.stop_stream()
                stream.close()
            except:
                pass
                
        if wf is not None:
            try:
                wf.close()
            except:
                pass
                
        try:
            p.terminate()
        except:
            pass
            
        print(json.dumps({'type': 'exit', 'message': 'Python process exiting'}), flush=True)

if __name__ == '__main__':
    main()
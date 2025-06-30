from fastapi import FastAPI, File, UploadFile, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pymongo import MongoClient
from pydantic import BaseModel
from typing import List, Optional
import os
import uuid
import shutil
from datetime import datetime
import mimetypes
from pathlib import Path

# Initialize FastAPI app
app = FastAPI(title="Software Distribution Platform", version="1.0.0")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# MongoDB connection
MONGO_URL = os.environ.get('MONGO_URL', 'mongodb://localhost:27017/')
try:
    client = MongoClient(MONGO_URL)
    db = client['software_distribution']
    files_collection = db['files']
    print(f"Connected to MongoDB at: {MONGO_URL}")
except Exception as e:
    print(f"Failed to connect to MongoDB: {e}")
    raise

# File storage configuration
UPLOAD_DIRECTORY = "/app/uploads"
ALLOWED_EXTENSIONS = {'.exe', '.msi', '.dmg', '.apk', '.deb', '.rpm', '.zip', '.tar.gz', '.tar.xz'}
MAX_FILE_SIZE = 500 * 1024 * 1024  # 500MB

# Create upload directory if it doesn't exist
os.makedirs(UPLOAD_DIRECTORY, exist_ok=True)

# Pydantic models
class FileInfo(BaseModel):
    id: str
    original_name: str
    file_name: str
    file_size: int
    file_type: str
    upload_date: datetime
    description: Optional[str] = None
    download_count: int = 0

class FileUploadResponse(BaseModel):
    success: bool
    message: str
    file_info: Optional[FileInfo] = None

def validate_file(file: UploadFile):
    """Validate uploaded file"""
    file_extension = Path(file.filename).suffix.lower()
    
    if file_extension not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400, 
            detail=f"File type {file_extension} not allowed. Allowed types: {', '.join(ALLOWED_EXTENSIONS)}"
        )
    
    return True

def get_file_size(file: UploadFile):
    """Get file size"""
    file.file.seek(0, 2)  # Seek to end
    size = file.file.tell()
    file.file.seek(0)  # Reset to beginning
    return size

@app.get("/api/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "service": "Software Distribution Platform"}

@app.post("/api/files/upload", response_model=FileUploadResponse)
async def upload_file(
    file: UploadFile = File(...),
    description: Optional[str] = None
):
    """Upload a software file"""
    try:
        # Validate file
        validate_file(file)
        
        # Check file size
        file_size = get_file_size(file)
        if file_size > MAX_FILE_SIZE:
            raise HTTPException(
                status_code=400,
                detail=f"File too large. Maximum size is {MAX_FILE_SIZE // (1024*1024)}MB"
            )
        
        # Generate unique filename
        file_id = str(uuid.uuid4())
        file_extension = Path(file.filename).suffix.lower()
        file_name = f"{file_id}{file_extension}"
        file_path = os.path.join(UPLOAD_DIRECTORY, file_name)
        
        # Save file to disk
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        # Get file type
        file_type = mimetypes.guess_type(file.filename)[0] or "application/octet-stream"
        
        # Create file info
        file_info = {
            "id": file_id,
            "original_name": file.filename,
            "file_name": file_name,
            "file_size": file_size,
            "file_type": file_type,
            "upload_date": datetime.utcnow(),
            "description": description,
            "download_count": 0
        }
        
        # Save to database
        files_collection.insert_one(file_info)
        
        # Convert datetime for response
        file_info["upload_date"] = file_info["upload_date"].isoformat()
        
        return FileUploadResponse(
            success=True,
            message="File uploaded successfully",
            file_info=FileInfo(**file_info)
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")

@app.get("/api/files", response_model=List[FileInfo])
async def list_files():
    """List all uploaded files"""
    try:
        files = list(files_collection.find({}, {"_id": 0}))
        
        # Convert datetime objects to ISO format
        for file in files:
            if isinstance(file["upload_date"], datetime):
                file["upload_date"] = file["upload_date"].isoformat()
        
        return files
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to list files: {str(e)}")

@app.get("/api/files/{file_id}")
async def get_file_info(file_id: str):
    """Get file information by ID"""
    try:
        file_info = files_collection.find_one({"id": file_id}, {"_id": 0})
        
        if not file_info:
            raise HTTPException(status_code=404, detail="File not found")
        
        # Convert datetime to ISO format
        if isinstance(file_info["upload_date"], datetime):
            file_info["upload_date"] = file_info["upload_date"].isoformat()
        
        return file_info
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get file info: {str(e)}")

@app.get("/api/files/download/{file_id}")
async def download_file(file_id: str):
    """Download a file by ID"""
    try:
        # Get file info from database
        file_info = files_collection.find_one({"id": file_id})
        
        if not file_info:
            raise HTTPException(status_code=404, detail="File not found")
        
        file_path = os.path.join(UPLOAD_DIRECTORY, file_info["file_name"])
        
        if not os.path.exists(file_path):
            raise HTTPException(status_code=404, detail="File not found on disk")
        
        # Increment download count
        files_collection.update_one(
            {"id": file_id},
            {"$inc": {"download_count": 1}}
        )
        
        return FileResponse(
            path=file_path,
            filename=file_info["original_name"],
            media_type=file_info["file_type"]
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Download failed: {str(e)}")

@app.delete("/api/files/{file_id}")
async def delete_file(file_id: str):
    """Delete a file by ID"""
    try:
        # Get file info from database
        file_info = files_collection.find_one({"id": file_id})
        
        if not file_info:
            raise HTTPException(status_code=404, detail="File not found")
        
        # Delete file from disk
        file_path = os.path.join(UPLOAD_DIRECTORY, file_info["file_name"])
        if os.path.exists(file_path):
            os.remove(file_path)
        
        # Delete from database
        files_collection.delete_one({"id": file_id})
        
        return {"success": True, "message": "File deleted successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Delete failed: {str(e)}")

@app.get("/api/stats")
async def get_stats():
    """Get platform statistics"""
    try:
        total_files = files_collection.count_documents({})
        total_downloads = files_collection.aggregate([
            {"$group": {"_id": None, "total": {"$sum": "$download_count"}}}
        ])
        
        download_count = list(total_downloads)
        total_download_count = download_count[0]["total"] if download_count else 0
        
        return {
            "total_files": total_files,
            "total_downloads": total_download_count
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get stats: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
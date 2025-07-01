from fastapi import FastAPI, File, UploadFile, HTTPException, Depends, Query, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pymongo import MongoClient, TEXT
from pydantic import BaseModel
from typing import List, Optional
import os
import uuid
import shutil
from datetime import datetime
import mimetypes
from pathlib import Path
import re
from PIL import Image
import io

# Initialize FastAPI app
app = FastAPI(title="Software Distribution Platform", version="3.0.0")

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
    
    # Create text index for search functionality
    try:
        files_collection.create_index([
            ("original_name", TEXT),
            ("description", TEXT),
            ("category", TEXT)
        ])
    except Exception as e:
        print(f"Index creation note: {e}")
    
    print(f"Connected to MongoDB at: {MONGO_URL}")
except Exception as e:
    print(f"Failed to connect to MongoDB: {e}")
    raise

# File storage configuration
UPLOAD_DIRECTORY = "/app/uploads"
IMAGES_DIRECTORY = "/app/uploads/images"
ALLOWED_EXTENSIONS = {'.exe', '.msi', '.dmg', '.apk', '.deb', '.rpm', '.zip', '.tar.gz', '.tar.xz'}
ALLOWED_IMAGE_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.gif', '.webp'}
MAX_FILE_SIZE = 500 * 1024 * 1024  # 500MB
MAX_IMAGE_SIZE = 10 * 1024 * 1024  # 10MB per image
MAX_IMAGES_PER_SOFTWARE = 5

# Categories configuration
CATEGORIES = [
    "Games",
    "Utilities", 
    "Development Tools",
    "Multimedia",
    "Security",
    "Business",
    "Education",
    "Internet",
    "System Tools",
    "Graphics",
    "Office",
    "Other"
]

# Create upload directories if they don't exist
os.makedirs(UPLOAD_DIRECTORY, exist_ok=True)
os.makedirs(IMAGES_DIRECTORY, exist_ok=True)

# Mount static files for serving images
app.mount("/images", StaticFiles(directory=IMAGES_DIRECTORY), name="images")

# Pydantic models
class ImageInfo(BaseModel):
    id: str
    filename: str
    url: str
    thumbnail_url: str

class FileInfo(BaseModel):
    id: str
    original_name: str
    file_name: str
    file_size: int
    file_type: str
    upload_date: datetime
    description: Optional[str] = None
    category: str = "Other"
    download_count: int = 0
    images: List[ImageInfo] = []

class FileUploadResponse(BaseModel):
    success: bool
    message: str
    file_info: Optional[FileInfo] = None

class SearchFilters(BaseModel):
    search: Optional[str] = None
    category: Optional[str] = None
    file_type: Optional[str] = None
    min_size: Optional[int] = None
    max_size: Optional[int] = None
    sort_by: Optional[str] = "upload_date"  # upload_date, original_name, download_count, file_size
    sort_order: Optional[str] = "desc"  # asc, desc

def validate_file(file: UploadFile):
    """Validate uploaded file"""
    file_extension = Path(file.filename).suffix.lower()
    
    if file_extension not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400, 
            detail=f"File type {file_extension} not allowed. Allowed types: {', '.join(ALLOWED_EXTENSIONS)}"
        )
    
    return True

def validate_image(file: UploadFile):
    """Validate uploaded image"""
    file_extension = Path(file.filename).suffix.lower()
    
    if file_extension not in ALLOWED_IMAGE_EXTENSIONS:
        raise HTTPException(
            status_code=400, 
            detail=f"Image type {file_extension} not allowed. Allowed types: {', '.join(ALLOWED_IMAGE_EXTENSIONS)}"
        )
    
    return True

def get_file_size(file: UploadFile):
    """Get file size"""
    file.file.seek(0, 2)  # Seek to end
    size = file.file.tell()
    file.file.seek(0)  # Reset to beginning
    return size

def process_image(image_file: UploadFile, file_id: str) -> dict:
    """Process and save image with thumbnail generation"""
    try:
        # Generate unique image filename
        image_id = str(uuid.uuid4())
        file_extension = Path(image_file.filename).suffix.lower()
        if file_extension not in ALLOWED_IMAGE_EXTENSIONS:
            file_extension = '.jpg'
        
        image_filename = f"{file_id}_{image_id}{file_extension}"
        thumbnail_filename = f"{file_id}_{image_id}_thumb{file_extension}"
        
        image_path = os.path.join(IMAGES_DIRECTORY, image_filename)
        thumbnail_path = os.path.join(IMAGES_DIRECTORY, thumbnail_filename)
        
        # Read image data
        image_data = image_file.file.read()
        image_file.file.seek(0)
        
        # Open image with PIL
        with Image.open(io.BytesIO(image_data)) as img:
            # Convert to RGB if necessary
            if img.mode in ('RGBA', 'LA', 'P'):
                img = img.convert('RGB')
            
            # Save original (with max size limit)
            if img.width > 1920 or img.height > 1080:
                img.thumbnail((1920, 1080), Image.Resampling.LANCZOS)
            img.save(image_path, optimize=True, quality=85)
            
            # Create thumbnail
            img_thumb = img.copy()
            img_thumb.thumbnail((300, 200), Image.Resampling.LANCZOS)
            img_thumb.save(thumbnail_path, optimize=True, quality=80)
        
        return {
            "id": image_id,
            "filename": image_filename,
            "url": f"/images/{image_filename}",
            "thumbnail_url": f"/images/{thumbnail_filename}"
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Image processing failed: {str(e)}")

def build_search_query(filters: SearchFilters):
    """Build MongoDB query from search filters"""
    query = {}
    
    # Text search
    if filters.search:
        query["$text"] = {"$search": filters.search}
    
    # Category filter
    if filters.category and filters.category != "All":
        query["category"] = filters.category
    
    # File type filter
    if filters.file_type and filters.file_type != "All":
        query["file_type"] = {"$regex": filters.file_type, "$options": "i"}
    
    # File size filters
    if filters.min_size or filters.max_size:
        size_query = {}
        if filters.min_size:
            size_query["$gte"] = filters.min_size
        if filters.max_size:
            size_query["$lte"] = filters.max_size
        query["file_size"] = size_query
    
    return query

def build_sort_criteria(filters: SearchFilters):
    """Build MongoDB sort criteria"""
    sort_field = filters.sort_by
    sort_direction = -1 if filters.sort_order == "desc" else 1
    
    # Handle text search score sorting
    if filters.search and sort_field == "relevance":
        return [("score", {"$meta": "textScore"})]
    
    return [(sort_field, sort_direction)]

@app.get("/api/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "service": "Software Distribution Platform v3.0"}

@app.get("/api/categories")
async def get_categories():
    """Get available categories"""
    return {"categories": CATEGORIES}

@app.post("/api/files/upload", response_model=FileUploadResponse)
async def upload_file(
    file: UploadFile = File(...),
    description: Optional[str] = Form(None),
    category: Optional[str] = Form("Other"),
    images: List[UploadFile] = File(default=[])
):
    """Upload a software file with category and optional images"""
    try:
        # Validate main file
        validate_file(file)
        
        # Validate category
        if not category or category not in CATEGORIES:
            category = "Other"
        
        # Check file size
        file_size = get_file_size(file)
        if file_size > MAX_FILE_SIZE:
            raise HTTPException(
                status_code=400,
                detail=f"File too large. Maximum size is {MAX_FILE_SIZE // (1024*1024)}MB"
            )
        
        # Validate images
        if len(images) > MAX_IMAGES_PER_SOFTWARE:
            raise HTTPException(
                status_code=400,
                detail=f"Too many images. Maximum {MAX_IMAGES_PER_SOFTWARE} images allowed"
            )
        
        for img in images:
            if img.filename:  # Skip empty file uploads
                validate_image(img)
                img_size = get_file_size(img)
                if img_size > MAX_IMAGE_SIZE:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Image {img.filename} too large. Maximum size is {MAX_IMAGE_SIZE // (1024*1024)}MB"
                    )
        
        # Generate unique filename
        file_id = str(uuid.uuid4())
        file_extension = Path(file.filename).suffix.lower()
        file_name = f"{file_id}{file_extension}"
        file_path = os.path.join(UPLOAD_DIRECTORY, file_name)
        
        # Save main file to disk
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        # Process images
        processed_images = []
        for img in images:
            if img.filename:  # Skip empty uploads
                try:
                    image_info = process_image(img, file_id)
                    processed_images.append(image_info)
                except Exception as e:
                    print(f"Error processing image {img.filename}: {e}")
                    # Continue with other images, don't fail the whole upload
        
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
            "category": category,
            "download_count": 0,
            "images": processed_images
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

@app.get("/api/files/search", response_model=List[FileInfo])
async def search_files(
    search: Optional[str] = Query(None, description="Search term"),
    category: Optional[str] = Query(None, description="Filter by category"),
    file_type: Optional[str] = Query(None, description="Filter by file type"),
    min_size: Optional[int] = Query(None, description="Minimum file size in bytes"),
    max_size: Optional[int] = Query(None, description="Maximum file size in bytes"),
    sort_by: str = Query("upload_date", description="Sort field"),
    sort_order: str = Query("desc", description="Sort order (asc/desc)"),
    limit: int = Query(50, description="Maximum number of results")
):
    """Search and filter files"""
    try:
        filters = SearchFilters(
            search=search,
            category=category,
            file_type=file_type,
            min_size=min_size,
            max_size=max_size,
            sort_by=sort_by,
            sort_order=sort_order
        )
        
        # Build query and sort criteria
        query = build_search_query(filters)
        sort_criteria = build_sort_criteria(filters)
        
        # Execute search
        cursor = files_collection.find(query, {"_id": 0})
        
        # Apply sorting
        if sort_criteria:
            cursor = cursor.sort(sort_criteria)
        
        # Apply limit
        cursor = cursor.limit(limit)
        
        files = list(cursor)
        
        # Convert datetime objects to ISO format
        for file in files:
            if isinstance(file["upload_date"], datetime):
                file["upload_date"] = file["upload_date"].isoformat()
            # Ensure images field exists
            if "images" not in file:
                file["images"] = []
        
        return files
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Search failed: {str(e)}")

@app.get("/api/files", response_model=List[FileInfo])
async def list_files():
    """List all uploaded files (legacy endpoint)"""
    try:
        files = list(files_collection.find({}, {"_id": 0}).sort("upload_date", -1))
        
        # Convert datetime objects to ISO format
        for file in files:
            if isinstance(file["upload_date"], datetime):
                file["upload_date"] = file["upload_date"].isoformat()
            # Ensure images field exists
            if "images" not in file:
                file["images"] = []
        
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
        
        # Ensure images field exists
        if "images" not in file_info:
            file_info["images"] = []
        
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
        
        # Delete main file from disk
        file_path = os.path.join(UPLOAD_DIRECTORY, file_info["file_name"])
        if os.path.exists(file_path):
            os.remove(file_path)
        
        # Delete associated images
        if "images" in file_info:
            for image in file_info["images"]:
                # Delete original image
                image_path = os.path.join(IMAGES_DIRECTORY, image.get("filename", ""))
                if os.path.exists(image_path):
                    os.remove(image_path)
                
                # Delete thumbnail
                thumbnail_filename = image.get("filename", "").replace(".", "_thumb.")
                thumbnail_path = os.path.join(IMAGES_DIRECTORY, thumbnail_filename)
                if os.path.exists(thumbnail_path):
                    os.remove(thumbnail_path)
        
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
        
        # Get total downloads
        total_downloads = files_collection.aggregate([
            {"$group": {"_id": None, "total": {"$sum": "$download_count"}}}
        ])
        download_count = list(total_downloads)
        total_download_count = download_count[0]["total"] if download_count else 0
        
        # Get category stats
        category_stats = list(files_collection.aggregate([
            {"$group": {"_id": "$category", "count": {"$sum": 1}}},
            {"$sort": {"count": -1}}
        ]))
        
        # Get popular files
        popular_files = list(files_collection.find(
            {}, {"_id": 0, "original_name": 1, "download_count": 1, "category": 1}
        ).sort("download_count", -1).limit(5))
        
        return {
            "total_files": total_files,
            "total_downloads": total_download_count,
            "category_stats": category_stats,
            "popular_files": popular_files
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get stats: {str(e)}")

@app.get("/api/files/category/{category}")
async def get_files_by_category(category: str):
    """Get files by category"""
    try:
        if category not in CATEGORIES:
            raise HTTPException(status_code=400, detail="Invalid category")
        
        files = list(files_collection.find(
            {"category": category}, {"_id": 0}
        ).sort("upload_date", -1))
        
        # Convert datetime objects to ISO format
        for file in files:
            if isinstance(file["upload_date"], datetime):
                file["upload_date"] = file["upload_date"].isoformat()
            # Ensure images field exists
            if "images" not in file:
                file["images"] = []
        
        return files
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get files by category: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
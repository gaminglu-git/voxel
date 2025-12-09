from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from .supabase_client import supabase

app = FastAPI()

origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class FileUploadRequest(BaseModel):
    name: str
    content_type: str

@app.get("/")
def read_root():
    return {"Hello": "Voxel"}

@app.post("/files/upload-url")
async def create_upload_url(request: FileUploadRequest):
    bucket = "bim-files"
    # To keep it simple, we'll use a public path for now.
    # In a real app, you'd likely use user-specific folders.
    file_path = f"public/{request.name}"
    
    try:
        signed_url = supabase.storage.from_(bucket).create_signed_url(file_path, 3600, {"upsert":"true"})
        return {"signed_url": signed_url['signedURL']}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/projects")
async def get_projects():
    try:
        # For now, we'll list files from the bucket as our "projects"
        bucket = "bim-files"
        files = supabase.storage.from_(bucket).list("public")
        
        # Construct public URLs for the files
        base_url = f"{supabase.url}/storage/v1/object/public/{bucket}/"
        
        projects = []
        for file in files:
            if file['name'] != '.emptyFolderPlaceholder':
                 projects.append({
                    "name": file['name'],
                    "url": f"{base_url}{file['name']}"
                })
        
        return projects
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

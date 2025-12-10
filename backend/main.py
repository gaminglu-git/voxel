import ifcopenshell
import tempfile
import os
from dotenv import load_dotenv

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from supabase_client import supabase
from routers.projects import router as projects_router

load_dotenv()
SUPABASE_URL = os.environ.get("SUPABASE_URL")

app = FastAPI()

# Include routers
app.include_router(projects_router)

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

@app.get("/marketplace/items")
async def get_marketplace_items():
    """
    Fetches marketplace items from the database.
    Returns public items and items owned by the authenticated user.
    """
    try:
        # For now, return placeholder data
        # In production, this would query the marketplace_items table from Supabase
        # with proper RLS filtering
        
        # TODO: Implement actual database query
        # response = supabase.table("marketplace_items").select("*").or_("is_public.eq.true,user_id.eq.{user_id}").execute()
        
        # Placeholder response matching the Marketplace component structure
        return [
            {
                "id": "1",
                "name": "Standard Window 120x200",
                "description": "Double-glazed window with thermal break",
                "manufacturer": "Example Corp",
                "ifc_type": "IfcWindow",
                "fragment_url": "/fragments/window_120x200.frag",
                "physics": {
                    "thermal_conductivity": 0.8,
                    "specific_heat": 1000,
                    "density": 2500,
                    "thickness": 0.04,
                    "u_value": 1.2
                },
                "properties": {
                    "width": 1.2,
                    "height": 2.0,
                    "depth": 0.04
                }
            },
            {
                "id": "2",
                "name": "Concrete Wall 200mm",
                "description": "Standard reinforced concrete wall",
                "manufacturer": "Example Corp",
                "ifc_type": "IfcWallStandardCase",
                "fragment_url": "/fragments/wall_concrete_200.frag",
                "physics": {
                    "thermal_conductivity": 1.4,
                    "specific_heat": 880,
                    "density": 2400,
                    "thickness": 0.2,
                    "u_value": 1.8
                },
                "properties": {
                    "width": 1.0,
                    "height": 3.0,
                    "depth": 0.2
                }
            },
            {
                "id": "3",
                "name": "Steel Door 90x210",
                "description": "Fire-rated steel door",
                "manufacturer": "Example Corp",
                "ifc_type": "IfcDoor",
                "fragment_url": "/fragments/door_steel_90x210.frag",
                "physics": {
                    "thermal_conductivity": 50.0,
                    "specific_heat": 500,
                    "density": 7850,
                    "thickness": 0.05,
                    "u_value": 2.5
                },
                "properties": {
                    "width": 0.9,
                    "height": 2.1,
                    "depth": 0.05
                }
            }
        ]
    except Exception as e:
        import traceback
        print(f"Error fetching marketplace items: {e}")
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Error fetching marketplace items: {str(e)}")

@app.post("/files/upload-url")
async def create_upload_url(request: FileUploadRequest):
    bucket = "bim-files"
    # To keep it simple, we'll use a public path for now.
    # In a real app, you'd likely use user-specific folders.
    file_path = f"public/{request.name}"
    
    try:
        # Use create_signed_upload_url for uploads (not create_signed_url which is for downloads)
        from storage3.types import CreateSignedUploadUrlOptions
        
        options = CreateSignedUploadUrlOptions(upsert="true")
        result = supabase.storage.from_(bucket).create_signed_upload_url(file_path, options=options)
        
        # The response is a SignedUploadURL dict with 'signed_url' and 'signedUrl' keys
        # It's a dict, not a TypedDict object, so we can access it directly
        if isinstance(result, dict):
            signed_url = result.get('signed_url') or result.get('signedUrl')
        else:
            # Fallback: try attribute access
            signed_url = getattr(result, 'signed_url', None) or getattr(result, 'signedUrl', None)
        
        if not signed_url:
            print(f"Unexpected response format: {result}")
            raise HTTPException(status_code=500, detail=f"No signed URL in response. Response: {result}")
        
        return {"signed_url": signed_url}
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        error_msg = f"Error creating upload URL: {e}"
        error_type = type(e).__name__
        print(error_msg)
        print(traceback.format_exc())
        
        # Provide more helpful error messages
        error_detail = str(e)
        if "not found" in error_detail.lower() or "does not exist" in error_detail.lower():
            error_detail = f"Storage bucket '{bucket}' or resource does not exist. Please create the bucket in Supabase dashboard."
        elif "unauthorized" in error_detail.lower() or "403" in error_detail:
            error_detail = f"Unauthorized access to storage bucket '{bucket}'. Check Supabase permissions."
        
        raise HTTPException(
            status_code=500,
            detail=f"Error creating upload URL ({error_type}): {error_detail}"
        )

@app.post("/files/download-url")
async def create_download_url(request: FileUploadRequest):
    """Create a signed URL for downloading a file from storage."""
    bucket = "bim-files"
    file_path = f"public/{request.name}"
    
    try:
        # Create signed URL for download (expires in 1 hour)
        result = supabase.storage.from_(bucket).create_signed_url(file_path, 3600)
        
        # The response contains 'signedURL' key
        if isinstance(result, dict):
            signed_url = result.get('signedURL') or result.get('signedUrl')
        else:
            signed_url = getattr(result, 'signedURL', None) or getattr(result, 'signedUrl', None)
        
        if not signed_url:
            print(f"Unexpected response format: {result}")
            raise HTTPException(status_code=500, detail=f"No signed URL in response. Response: {result}")
        
        return {"signed_url": signed_url}
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        error_msg = f"Error creating download URL: {e}"
        print(error_msg)
        print(traceback.format_exc())
        raise HTTPException(
            status_code=500,
            detail=f"Error creating download URL: {str(e)}"
        )

@app.get("/files/list")
async def list_files():
    try:
        # For now, we'll list files from the bucket as our "projects"
        # NOTE: This endpoint lists files from Supabase Storage, not from a database table
        # There is no database schema for projects - files in the bucket are treated as projects
        bucket = "bim-files"
        
        # Try to list files from the public folder
        # The list() method might need an empty string for root, or "public" for the folder
        try:
            result = supabase.storage.from_(bucket).list("public")
        except Exception as list_error:
            # If "public" folder doesn't exist, try root
            print(f"Error listing 'public' folder: {list_error}, trying root...")
            try:
                result = supabase.storage.from_(bucket).list("")
            except Exception as root_error:
                print(f"Error listing root: {root_error}")
                # Return empty list if bucket doesn't exist or is empty
                return []
        
        # Handle different response formats from Supabase
        # The list() method might return a list directly or a dict with 'data' key
        if result is None:
            files = []
        elif isinstance(result, list):
            files = result
        elif isinstance(result, dict):
            files = result.get('data', [])
        else:
            files = []
        
        # Construct public URLs for the files
        # Use SUPABASE_URL from environment variable since Client doesn't expose url attribute
        # The path structure is: /storage/v1/object/public/{bucket}/{file_path}
        # We're listing files from the "public" folder in the bucket
        
        projects = []
        for file in files:
            # Handle both dict and object formats
            if isinstance(file, dict):
                file_name = file.get('name')
            else:
                file_name = getattr(file, 'name', None)
            
            if file_name and file_name != '.emptyFolderPlaceholder' and not file_name.startswith('.'):
                # Construct the correct URL path
                # File path in bucket is "public/{file_name}"
                file_path = f"public/{file_name}"
                # Public URL format: {SUPABASE_URL}/storage/v1/object/public/{bucket}/{file_path}
                projects.append({
                    "name": file_name,
                    "url": f"{SUPABASE_URL}/storage/v1/object/public/{bucket}/{file_path}"
                })
        
        return projects
    except Exception as e:
        import traceback
        error_msg = f"Error in /projects: {e}"
        print(error_msg)
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Error fetching projects: {str(e)}")

class AnalyzeRequest(BaseModel):
    file_path: str

class SceneModelItem(BaseModel):
    itemId: str
    instanceId: str
    position: list[float]  # [x, y, z]
    rotation: list[float]  # [x, y, z]
    scale: list[float]  # [x, y, z]
    properties: dict

class SceneModelRequest(BaseModel):
    sceneModel: list[SceneModelItem]
    name: str = "Untitled Model"

@app.post("/analyze")
async def analyze_ifc_file(request: AnalyzeRequest):
    bucket_name = "bim-files"
    file_path = request.file_path
    tmp_path = None  # Initialize tmp_path to None

    try:
        # Create a temporary file that will be deleted automatically on close
        with tempfile.NamedTemporaryFile(delete=False, suffix=".ifc") as tmp:
            tmp_path = tmp.name
            # Download file data from Supabase
            data = supabase.storage.from_(bucket_name).download(file_path)
            tmp.write(data)
            # Ensure all data is written to disk before proceeding
            tmp.flush()
            os.fsync(tmp.fileno())

        # Now that the file is written and closed, open it with ifcopenshell
        # Note: ifcopenshell.open() returns a file object that doesn't need explicit closing
        # The file is automatically managed by ifcopenshell
        ifc_file = ifcopenshell.open(tmp_path)
        
        # Perform a simple analysis: count all walls
        walls = ifc_file.by_type("IfcWall")
        wall_count = len(walls)
        
        # No need to close ifc_file - it's automatically managed by ifcopenshell
        
        return {"wall_count": wall_count}
        
    except Exception as e:
        # Log the full exception for debugging purposes
        import traceback
        error_msg = f"Analysis Error: {e}"
        print(error_msg)
        print(traceback.format_exc())
        # Return detailed error message to help debug
        raise HTTPException(
            status_code=500, 
            detail=f"Error analyzing file: {str(e)}"
        )
    
    finally:
        # Ensure the temporary file is cleaned up in any case
        if tmp_path and os.path.exists(tmp_path):
            os.remove(tmp_path)

@app.post("/simulate/export-energyplus")
async def export_to_energyplus(request: SceneModelRequest):
    """
    Converts a SceneModel (JSON) to EnergyPlus format (epJSON).
    
    Process:
    1. Reconstruct IFC model from SceneModel JSON
    2. Convert IFC to EnergyPlus format
    3. Return epJSON or IDF file
    """
    try:
        # Step 1: Reconstruct IFC model from SceneModel
        # For now, this is a stub that creates a basic IFC structure
        ifc_model = reconstruct_ifc_from_scene(request.sceneModel)
        
        # Step 2: Convert IFC to EnergyPlus
        # This is a placeholder - full implementation would use ifcopenshell + eppy/geomeppy
        epjson_data = convert_ifc_to_energyplus(ifc_model, request.sceneModel)
        
        return {
            "status": "success",
            "epjson": epjson_data,
            "message": "EnergyPlus export generated successfully (stub implementation)"
        }
        
    except Exception as e:
        import traceback
        print(f"EnergyPlus Export Error: {e}")
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Error exporting to EnergyPlus: {str(e)}")

def reconstruct_ifc_from_scene(scene_model: list[SceneModelItem]):
    """
    Reconstructs an IFC model from SceneModel JSON.
    This is a stub implementation - in production, this would:
    1. Create a new IFC file using ifcopenshell
    2. For each item in scene_model:
       - Create the appropriate IFC entity (IfcWall, IfcWindow, etc.)
       - Apply geometry from position/rotation/scale
       - Apply properties from the marketplace item metadata
    """
    # Stub: Return a minimal IFC structure
    # In production, use ifcopenshell.file() to create a new file
    # and ifcopenshell.api.run() to add entities
    
    print(f"Reconstructing IFC from {len(scene_model)} items")
    
    # Placeholder structure
    ifc_data = {
        "version": "IFC4",
        "items": []
    }
    
    for item in scene_model:
        ifc_type = item.properties.get("ifc_type", "IfcBuildingElement")
        ifc_data["items"].append({
            "type": ifc_type,
            "position": item.position,
            "rotation": item.rotation,
            "scale": item.scale,
            "properties": item.properties
        })
    
    return ifc_data

def convert_ifc_to_energyplus(ifc_model: dict, scene_model: list[SceneModelItem]) -> dict:
    """
    Converts IFC model to EnergyPlus epJSON format.
    This is a stub implementation - in production, this would:
    1. Map IFC entities to EnergyPlus objects:
       - IfcWall -> BuildingSurface:Detailed
       - IfcWindow -> FenestrationSurface:Detailed
       - IfcSpace -> Zone
    2. Apply physics properties from marketplace items to Material definitions
    3. Generate proper epJSON structure
    """
    # Stub: Return a minimal epJSON structure
    # In production, use libraries like eppy or geomeppy
    
    print(f"Converting IFC to EnergyPlus format")
    
    # Basic epJSON structure
    epjson = {
        "Version": {
            "Version 1": {
                "version_identifier": "9.6"
            }
        },
        "Building": {
            "Building 1": {
                "north_axis": 0.0,
                "terrain": "Suburbs",
                "loads_convergence_tolerance_value": 0.04,
                "temperature_convergence_tolerance_value": 0.4,
                "solar_distribution": "FullExterior",
                "maximum_number_of_warmup_days": 25,
                "minimum_number_of_warmup_days": 6
            }
        },
        "Material": {},
        "BuildingSurface:Detailed": {},
        "FenestrationSurface:Detailed": {},
        "Zone": {}
    }
    
    # Map scene items to EnergyPlus objects
    surface_counter = 1
    fenestration_counter = 1
    
    for item in scene_model:
        ifc_type = item.properties.get("ifc_type", "")
        physics = item.properties.get("physics", {})
        
        # Create material from physics properties
        material_name = f"Material_{item.itemId}"
        if material_name not in epjson["Material"]:
            epjson["Material"][material_name] = {
                "roughness": "MediumRough",
                "thickness": physics.get("thickness", 0.2),
                "conductivity": physics.get("thermal_conductivity", 1.4),
                "density": physics.get("density", 2400),
                "specific_heat": physics.get("specific_heat", 880)
            }
        
        # Map IFC types to EnergyPlus objects
        if "Wall" in ifc_type:
            surface_name = f"Wall_{surface_counter}"
            epjson["BuildingSurface:Detailed"][surface_name] = {
                "construction_name": f"Construction_{item.itemId}",
                "zone_name": "Zone 1",
                "surface_type": "Wall",
                "outside_boundary_condition": "Outdoors",
                "vertices": calculate_surface_vertices(item)
            }
            surface_counter += 1
            
        elif "Window" in ifc_type or "Door" in ifc_type:
            fenestration_name = f"Fenestration_{fenestration_counter}"
            epjson["FenestrationSurface:Detailed"][fenestration_name] = {
                "construction_name": f"Construction_{item.itemId}",
                "building_surface_name": f"Wall_{surface_counter - 1}",
                "vertices": calculate_surface_vertices(item)
            }
            fenestration_counter += 1
    
    # Add default zone if no zones were created
    if not epjson["Zone"]:
        epjson["Zone"]["Zone 1"] = {
            "direction_of_relative_north": 0.0,
            "x_origin": 0.0,
            "y_origin": 0.0,
            "z_origin": 0.0,
            "type": 1,
            "multiplier": 1,
            "ceiling_height": 3.0,
            "volume": 100.0
        }
    
    return epjson

def calculate_surface_vertices(item: SceneModelItem) -> list:
    """
    Calculate EnergyPlus surface vertices from item position, rotation, and scale.
    Returns a list of vertex coordinates in EnergyPlus format.
    """
    # Stub: Return a simple rectangular surface
    # In production, this would use the actual geometry from the fragment
    
    x, y, z = item.position
    width = item.properties.get("width", 1.0) * item.scale[0]
    height = item.properties.get("height", 2.0) * item.scale[1]
    depth = item.properties.get("depth", 0.1) * item.scale[2]
    
    # Simple rectangular surface (4 vertices)
    vertices = [
        {"vertex_x_coordinate": x, "vertex_y_coordinate": y, "vertex_z_coordinate": z},
        {"vertex_x_coordinate": x + width, "vertex_y_coordinate": y, "vertex_z_coordinate": z},
        {"vertex_x_coordinate": x + width, "vertex_y_coordinate": y + height, "vertex_z_coordinate": z},
        {"vertex_x_coordinate": x, "vertex_y_coordinate": y + height, "vertex_z_coordinate": z}
    ]
    
    return vertices

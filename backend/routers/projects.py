"""
Projects API router with permission management.
Handles CRUD operations for projects with user/team/company ownership and sharing.
"""
from typing import List, Optional
from fastapi import APIRouter, HTTPException, Depends, status
from pydantic import BaseModel
from datetime import datetime
from auth import get_current_user
from supabase_client import supabase

router = APIRouter(prefix="/projects", tags=["projects"])

# Pydantic models
class ProjectCreate(BaseModel):
    name: str
    description: Optional[str] = None
    file_path: str
    file_name: str
    file_size: Optional[int] = None
    file_type: Optional[str] = None
    owner_type: str  # "user", "team", or "company"
    owner_id: Optional[str] = None  # UUID of team or company (not needed for user)
    tags: Optional[List[str]] = None

class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    tags: Optional[List[str]] = None

class ProjectShare(BaseModel):
    project_id: str
    share_with_type: str  # "user", "team", or "company"
    share_with_id: str  # UUID
    permission: str = "read"  # "read", "write", "admin"
    expires_at: Optional[datetime] = None

class ProjectResponse(BaseModel):
    id: str
    name: str
    description: Optional[str]
    file_path: str
    file_name: str
    file_size: Optional[int]
    file_type: Optional[str]
    owner_user_id: Optional[str]
    owner_team_id: Optional[str]
    owner_company_id: Optional[str]
    created_at: datetime
    updated_at: datetime
    tags: Optional[List[str]]

@router.post("", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
async def create_project(project: ProjectCreate, user: dict = Depends(get_current_user)):
    """Create a new project with user/team/company ownership."""
    try:
        # Prepare project data
        project_data = {
            "name": project.name,
            "description": project.description,
            "file_path": project.file_path,
            "file_name": project.file_name,
            "file_size": project.file_size,
            "file_type": project.file_type,
            "tags": project.tags or [],
            "settings": {}
        }
        
        # Set ownership based on owner_type
        if project.owner_type == "user":
            project_data["owner_user_id"] = user["id"]
        elif project.owner_type == "team":
            # Verify user is member/admin of the team
            team_check = supabase.table("team_members").select("*").eq("team_id", project.owner_id).eq("user_id", user["id"]).single().execute()
            if not team_check.data:
                raise HTTPException(status_code=403, detail="You are not a member of this team")
            project_data["owner_team_id"] = project.owner_id
        elif project.owner_type == "company":
            # Verify user is member/admin of the company
            company_check = supabase.table("company_members").select("*").eq("company_id", project.owner_id).eq("user_id", user["id"]).single().execute()
            if not company_check.data:
                raise HTTPException(status_code=403, detail="You are not a member of this company")
            project_data["owner_company_id"] = project.owner_id
        else:
            raise HTTPException(status_code=400, detail="Invalid owner_type. Must be 'user', 'team', or 'company'")
        
        # Insert project
        result = supabase.table("projects").insert(project_data).execute()
        
        if not result.data or len(result.data) == 0:
            raise HTTPException(status_code=500, detail="Failed to create project")
        
        return ProjectResponse(**result.data[0])
    
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        print(f"Error creating project: {e}")
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Error creating project: {str(e)}")

@router.get("", response_model=List[ProjectResponse])
async def list_projects(user: dict = Depends(get_current_user)):
    """
    List all projects the user has access to.
    This includes projects owned by the user, their teams, their companies, or shared with them.
    """
    try:
        # The RLS policies in the database handle filtering
        # We just query and the database returns only accessible projects
        result = supabase.table("projects").select("*").order("updated_at", desc=True).execute()
        
        projects = []
        for project in result.data:
            projects.append(ProjectResponse(**project))
        
        return projects
    
    except Exception as e:
        import traceback
        print(f"Error listing projects: {e}")
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Error listing projects: {str(e)}")

@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(project_id: str, user: dict = Depends(get_current_user)):
    """Get a specific project (only if user has access)."""
    try:
        result = supabase.table("projects").select("*").eq("id", project_id).single().execute()
        
        if not result.data:
            raise HTTPException(status_code=404, detail="Project not found")
        
        # RLS ensures user can only access projects they have permission for
        return ProjectResponse(**result.data)
    
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        print(f"Error getting project: {e}")
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Error getting project: {str(e)}")

@router.put("/{project_id}", response_model=ProjectResponse)
async def update_project(project_id: str, project: ProjectUpdate, user: dict = Depends(get_current_user)):
    """Update a project (only if user has write/admin access)."""
    try:
        # Build update data (only include provided fields)
        update_data = {}
        if project.name is not None:
            update_data["name"] = project.name
        if project.description is not None:
            update_data["description"] = project.description
        if project.tags is not None:
            update_data["tags"] = project.tags
        
        if not update_data:
            # No fields to update
            result = supabase.table("projects").select("*").eq("id", project_id).single().execute()
            if not result.data:
                raise HTTPException(status_code=404, detail="Project not found")
            return ProjectResponse(**result.data)
        
        # Update project (RLS ensures only authorized users can update)
        result = supabase.table("projects").update(update_data).eq("id", project_id).execute()
        
        if not result.data or len(result.data) == 0:
            raise HTTPException(status_code=404, detail="Project not found or access denied")
        
        return ProjectResponse(**result.data[0])
    
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        print(f"Error updating project: {e}")
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Error updating project: {str(e)}")

@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(project_id: str, user: dict = Depends(get_current_user)):
    """Delete a project (only if user is owner)."""
    try:
        # RLS ensures only owners can delete
        result = supabase.table("projects").delete().eq("id", project_id).execute()
        
        # Check if project was deleted (or didn't exist)
        # Supabase returns empty array if nothing was deleted
        return None
    
    except Exception as e:
        import traceback
        print(f"Error deleting project: {e}")
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Error deleting project: {str(e)}")

@router.post("/{project_id}/share", status_code=status.HTTP_201_CREATED)
async def share_project(project_id: str, share: ProjectShare, user: dict = Depends(get_current_user)):
    """
    Share a project with a user, team, or company.
    Only project owners can share.
    """
    try:
        # Verify user owns the project
        project_check = supabase.table("projects").select("owner_user_id").eq("id", project_id).single().execute()
        
        if not project_check.data or project_check.data["owner_user_id"] != user["id"]:
            raise HTTPException(status_code=403, detail="Only project owners can share projects")
        
        # Prepare share data
        share_data = {
            "project_id": project_id,
            "permission": share.permission,
            "shared_by_user_id": user["id"]
        }
        
        if share.expires_at:
            share_data["expires_at"] = share.expires_at.isoformat()
        
        # Set share target based on type
        if share.share_with_type == "user":
            share_data["shared_with_user_id"] = share.share_with_id
        elif share.share_with_type == "team":
            share_data["shared_with_team_id"] = share.share_with_id
        elif share.share_with_type == "company":
            share_data["shared_with_company_id"] = share.share_with_id
        else:
            raise HTTPException(status_code=400, detail="Invalid share_with_type. Must be 'user', 'team', or 'company'")
        
        # Insert share
        result = supabase.table("project_shares").insert(share_data).execute()
        
        if not result.data or len(result.data) == 0:
            raise HTTPException(status_code=500, detail="Failed to create share")
        
        return {"message": "Project shared successfully", "share": result.data[0]}
    
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        print(f"Error sharing project: {e}")
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Error sharing project: {str(e)}")

@router.delete("/{project_id}/share/{share_id}", status_code=status.HTTP_204_NO_CONTENT)
async def unshare_project(project_id: str, share_id: str, user: dict = Depends(get_current_user)):
    """Remove a share from a project. Only project owners can unshare."""
    try:
        # Verify user owns the project
        project_check = supabase.table("projects").select("owner_user_id").eq("id", project_id).single().execute()
        
        if not project_check.data or project_check.data["owner_user_id"] != user["id"]:
            raise HTTPException(status_code=403, detail="Only project owners can unshare projects")
        
        # Delete share
        supabase.table("project_shares").delete().eq("id", share_id).eq("project_id", project_id).execute()
        
        return None
    
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        print(f"Error unsharing project: {e}")
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Error unsharing project: {str(e)}")

@router.get("/{project_id}/shares")
async def list_project_shares(project_id: str, user: dict = Depends(get_current_user)):
    """List all shares for a project. Only project owners can view shares."""
    try:
        # Verify user owns the project
        project_check = supabase.table("projects").select("owner_user_id").eq("id", project_id).single().execute()
        
        if not project_check.data or project_check.data["owner_user_id"] != user["id"]:
            raise HTTPException(status_code=403, detail="Only project owners can view shares")
        
        # Get shares
        result = supabase.table("project_shares").select("*").eq("project_id", project_id).execute()
        
        return {"shares": result.data}
    
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        print(f"Error listing project shares: {e}")
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Error listing project shares: {str(e)}")


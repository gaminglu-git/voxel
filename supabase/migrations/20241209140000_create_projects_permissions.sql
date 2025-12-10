-- Migration: Create Projects, Teams, Companies and Permission Management Schema
-- This migration enables users, teams, and companies to create and share projects

-- Helper function for updated_at triggers (create if not exists)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Companies Table
CREATE TABLE IF NOT EXISTS companies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    name TEXT NOT NULL,
    description TEXT,
    owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    
    -- Metadata
    settings JSONB DEFAULT '{}'
);

-- Teams Table
CREATE TABLE IF NOT EXISTS teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    name TEXT NOT NULL,
    description TEXT,
    owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE, -- Optional: team can belong to a company
    
    -- Metadata
    settings JSONB DEFAULT '{}'
);

-- Team Members Table (many-to-many relationship)
CREATE TABLE IF NOT EXISTS team_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    team_id UUID REFERENCES teams(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    role TEXT DEFAULT 'member', -- 'owner', 'admin', 'member'
    
    UNIQUE(team_id, user_id)
);

-- Company Members Table (many-to-many relationship)
CREATE TABLE IF NOT EXISTS company_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    role TEXT DEFAULT 'member', -- 'owner', 'admin', 'member'
    
    UNIQUE(company_id, user_id)
);

-- Projects Table
CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    name TEXT NOT NULL,
    description TEXT,
    
    -- File Storage
    file_path TEXT NOT NULL, -- Path in storage bucket (e.g., "public/project.ifc")
    file_name TEXT NOT NULL, -- Original filename
    file_size BIGINT, -- File size in bytes
    file_type TEXT, -- MIME type
    
    -- Ownership (one of these must be set)
    owner_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    owner_team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
    owner_company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    
    -- Metadata
    settings JSONB DEFAULT '{}',
    tags TEXT[] DEFAULT '{}',
    
    -- Ensure exactly one owner is set
    CONSTRAINT projects_single_owner CHECK (
        (owner_user_id IS NOT NULL)::int + 
        (owner_team_id IS NOT NULL)::int + 
        (owner_company_id IS NOT NULL)::int = 1
    )
);

-- Project Shares Table (for sharing projects with users, teams, or companies)
CREATE TABLE IF NOT EXISTS project_shares (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
    
    -- Share with (one of these must be set)
    shared_with_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    shared_with_team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
    shared_with_company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    
    -- Permissions
    permission TEXT DEFAULT 'read', -- 'read', 'write', 'admin'
    shared_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL, -- Who shared it
    
    -- Metadata
    expires_at TIMESTAMP WITH TIME ZONE, -- Optional expiration
    
    -- Ensure exactly one share target is set
    CONSTRAINT project_shares_single_target CHECK (
        (shared_with_user_id IS NOT NULL)::int + 
        (shared_with_team_id IS NOT NULL)::int + 
        (shared_with_company_id IS NOT NULL)::int = 1
    ),
    
    -- Prevent duplicate shares
    UNIQUE(project_id, shared_with_user_id, shared_with_team_id, shared_with_company_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_companies_owner_id ON companies(owner_id);
CREATE INDEX IF NOT EXISTS idx_teams_owner_id ON teams(owner_id);
CREATE INDEX IF NOT EXISTS idx_teams_company_id ON teams(company_id);
CREATE INDEX IF NOT EXISTS idx_team_members_team_id ON team_members(team_id);
CREATE INDEX IF NOT EXISTS idx_team_members_user_id ON team_members(user_id);
CREATE INDEX IF NOT EXISTS idx_company_members_company_id ON company_members(company_id);
CREATE INDEX IF NOT EXISTS idx_company_members_user_id ON company_members(user_id);
CREATE INDEX IF NOT EXISTS idx_projects_owner_user_id ON projects(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_projects_owner_team_id ON projects(owner_team_id);
CREATE INDEX IF NOT EXISTS idx_projects_owner_company_id ON projects(owner_company_id);
CREATE INDEX IF NOT EXISTS idx_project_shares_project_id ON project_shares(project_id);
CREATE INDEX IF NOT EXISTS idx_project_shares_user_id ON project_shares(shared_with_user_id);
CREATE INDEX IF NOT EXISTS idx_project_shares_team_id ON project_shares(shared_with_team_id);
CREATE INDEX IF NOT EXISTS idx_project_shares_company_id ON project_shares(shared_with_company_id);
CREATE INDEX IF NOT EXISTS idx_project_shares_expires_at ON project_shares(expires_at) WHERE expires_at IS NOT NULL;

-- Updated_at triggers
CREATE TRIGGER update_companies_updated_at
    BEFORE UPDATE ON companies
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_teams_updated_at
    BEFORE UPDATE ON teams
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_projects_updated_at
    BEFORE UPDATE ON projects
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security (RLS)

-- Companies
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view companies they own or are members of"
    ON companies FOR SELECT
    USING (
        owner_id = auth.uid() OR
        id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid())
    );

CREATE POLICY "Users can create companies"
    ON companies FOR INSERT
    WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Owners can update companies"
    ON companies FOR UPDATE
    USING (owner_id = auth.uid());

CREATE POLICY "Owners can delete companies"
    ON companies FOR DELETE
    USING (owner_id = auth.uid());

-- Teams
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view teams they own or are members of"
    ON teams FOR SELECT
    USING (
        owner_id = auth.uid() OR
        company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid()) OR
        id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid())
    );

CREATE POLICY "Users can create teams"
    ON teams FOR INSERT
    WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Owners can update teams"
    ON teams FOR UPDATE
    USING (owner_id = auth.uid());

CREATE POLICY "Owners can delete teams"
    ON teams FOR DELETE
    USING (owner_id = auth.uid());

-- Team Members
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view team members of teams they are in"
    ON team_members FOR SELECT
    USING (
        user_id = auth.uid() OR
        team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid())
    );

CREATE POLICY "Team owners can manage members"
    ON team_members FOR ALL
    USING (
        team_id IN (SELECT id FROM teams WHERE owner_id = auth.uid())
    );

-- Company Members
ALTER TABLE company_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view company members of companies they are in"
    ON company_members FOR SELECT
    USING (
        user_id = auth.uid() OR
        company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid())
    );

CREATE POLICY "Company owners can manage members"
    ON company_members FOR ALL
    USING (
        company_id IN (SELECT id FROM companies WHERE owner_id = auth.uid())
    );

-- Projects
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

-- Helper function to check if user has access to a project
CREATE OR REPLACE FUNCTION user_has_project_access(project_uuid UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM projects p
        WHERE p.id = project_uuid
        AND (
            -- User is owner (directly, via team, or via company)
            p.owner_user_id = auth.uid() OR
            (p.owner_team_id IS NOT NULL AND p.owner_team_id IN (
                SELECT team_id FROM team_members WHERE user_id = auth.uid()
            )) OR
            (p.owner_company_id IS NOT NULL AND p.owner_company_id IN (
                SELECT company_id FROM company_members WHERE user_id = auth.uid()
            )) OR
            -- User has explicit share
            EXISTS (
                SELECT 1 FROM project_shares ps
                WHERE ps.project_id = p.id
                AND (
                    ps.shared_with_user_id = auth.uid() OR
                    (ps.shared_with_team_id IS NOT NULL AND ps.shared_with_team_id IN (
                        SELECT team_id FROM team_members WHERE user_id = auth.uid()
                    )) OR
                    (ps.shared_with_company_id IS NOT NULL AND ps.shared_with_company_id IN (
                        SELECT company_id FROM company_members WHERE user_id = auth.uid()
                    ))
                )
                AND (ps.expires_at IS NULL OR ps.expires_at > NOW())
            )
        )
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE POLICY "Users can view projects they own or have access to"
    ON projects FOR SELECT
    USING (user_has_project_access(id));

CREATE POLICY "Users can create projects"
    ON projects FOR INSERT
    WITH CHECK (
        (owner_user_id = auth.uid()) OR
        (owner_team_id IS NOT NULL AND owner_team_id IN (
            SELECT team_id FROM team_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
        )) OR
        (owner_company_id IS NOT NULL AND owner_company_id IN (
            SELECT company_id FROM company_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
        ))
    );

CREATE POLICY "Project owners and admins can update projects"
    ON projects FOR UPDATE
    USING (
        owner_user_id = auth.uid() OR
        (owner_team_id IS NOT NULL AND owner_team_id IN (
            SELECT team_id FROM team_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
        )) OR
        (owner_company_id IS NOT NULL AND owner_company_id IN (
            SELECT company_id FROM company_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
        ))
    );

CREATE POLICY "Project owners can delete projects"
    ON projects FOR DELETE
    USING (
        owner_user_id = auth.uid() OR
        (owner_team_id IS NOT NULL AND owner_team_id IN (
            SELECT id FROM teams WHERE owner_id = auth.uid()
        )) OR
        (owner_company_id IS NOT NULL AND owner_company_id IN (
            SELECT id FROM companies WHERE owner_id = auth.uid()
        ))
    );

-- Project Shares
ALTER TABLE project_shares ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view shares for projects they own"
    ON project_shares FOR SELECT
    USING (
        project_id IN (
            SELECT id FROM projects WHERE owner_user_id = auth.uid()
        )
    );

CREATE POLICY "Project owners can create shares"
    ON project_shares FOR INSERT
    WITH CHECK (
        project_id IN (
            SELECT id FROM projects WHERE owner_user_id = auth.uid()
        )
    );

CREATE POLICY "Project owners can delete shares"
    ON project_shares FOR DELETE
    USING (
        project_id IN (
            SELECT id FROM projects WHERE owner_user_id = auth.uid()
        )
    );



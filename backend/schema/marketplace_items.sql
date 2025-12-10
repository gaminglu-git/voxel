-- Marketplace Items Schema
-- This table stores metadata for atomic BIM components available in the marketplace

CREATE TABLE IF NOT EXISTS marketplace_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Basic Information
    name TEXT NOT NULL,
    description TEXT,
    manufacturer TEXT,
    model_number TEXT,
    
    -- IFC Classification
    ifc_type TEXT NOT NULL, -- e.g., 'IfcWindow', 'IfcWallStandardCase', 'IfcBoiler'
    ifc_category TEXT, -- Additional categorization
    
    -- Storage References
    fragment_url TEXT NOT NULL, -- Path to .frag file in Supabase Storage
    thumbnail_url TEXT, -- Optional preview image
    
    -- Physical Properties (for EnergyPlus)
    physics JSONB NOT NULL DEFAULT '{}', -- Contains:
    -- {
    --   "thermal_conductivity": 0.15,  -- W/m·K
    --   "specific_heat": 1000,          -- J/kg·K
    --   "density": 2400,                -- kg/m³
    --   "thickness": 0.2,               -- m
    --   "u_value": 0.3                  -- W/m²·K (optional)
    -- }
    
    -- Visual Properties
    properties JSONB DEFAULT '{}', -- Additional metadata:
    -- {
    --   "color": "#ffffff",
    --   "texture": "url_to_texture",
    --   "dimensions": {"width": 1.2, "height": 2.0, "depth": 0.1},
    --   "tags": ["window", "double-glazed"]
    -- }
    
    -- Access Control
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    is_public BOOLEAN DEFAULT false, -- Public items visible to all users
    
    -- Metadata
    version INTEGER DEFAULT 1,
    tags TEXT[] DEFAULT '{}'
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_marketplace_items_ifc_type ON marketplace_items(ifc_type);
CREATE INDEX IF NOT EXISTS idx_marketplace_items_user_id ON marketplace_items(user_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_items_public ON marketplace_items(is_public) WHERE is_public = true;
CREATE INDEX IF NOT EXISTS idx_marketplace_items_tags ON marketplace_items USING GIN(tags);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_marketplace_items_updated_at
    BEFORE UPDATE ON marketplace_items
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security (RLS)
ALTER TABLE marketplace_items ENABLE ROW LEVEL SECURITY;

-- Policy: Users can see their own items and public items
CREATE POLICY "Users can view own items and public items"
    ON marketplace_items
    FOR SELECT
    USING (
        auth.uid() = user_id OR is_public = true
    );

-- Policy: Users can insert their own items
CREATE POLICY "Users can insert own items"
    ON marketplace_items
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own items
CREATE POLICY "Users can update own items"
    ON marketplace_items
    FOR UPDATE
    USING (auth.uid() = user_id);

-- Policy: Users can delete their own items
CREATE POLICY "Users can delete own items"
    ON marketplace_items
    FOR DELETE
    USING (auth.uid() = user_id);

-- Scene Models Schema
-- This table stores assembled scenes (compositions of marketplace items)
CREATE TABLE IF NOT EXISTS scene_models (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Scene Information
    name TEXT NOT NULL,
    description TEXT,
    
    -- Scene Data (JSON array of placed items)
    scene_data JSONB NOT NULL DEFAULT '[]', -- Array of:
    -- [
    --   {
    --     "itemId": "uuid",
    --     "position": [x, y, z],
    --     "rotation": [x, y, z],
    --     "scale": [x, y, z],
    --     "properties": {}
    --   }
    -- ]
    
    -- Access Control
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- Metadata
    version INTEGER DEFAULT 1
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_scene_models_user_id ON scene_models(user_id);

-- Updated_at trigger
CREATE TRIGGER update_scene_models_updated_at
    BEFORE UPDATE ON scene_models
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- RLS for scene_models
ALTER TABLE scene_models ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own scenes
CREATE POLICY "Users can view own scenes"
    ON scene_models
    FOR SELECT
    USING (auth.uid() = user_id);

-- Policy: Users can insert their own scenes
CREATE POLICY "Users can insert own scenes"
    ON scene_models
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own scenes
CREATE POLICY "Users can update own scenes"
    ON scene_models
    FOR UPDATE
    USING (auth.uid() = user_id);

-- Policy: Users can delete their own scenes
CREATE POLICY "Users can delete own scenes"
    ON scene_models
    FOR DELETE
    USING (auth.uid() = user_id);



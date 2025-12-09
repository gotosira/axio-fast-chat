-- Create folders table
CREATE TABLE IF NOT EXISTS folders (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL
);

-- Add folder_id to conversations
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS folder_id TEXT REFERENCES folders(id) ON DELETE SET NULL;

-- Enable RLS for folders
ALTER TABLE folders ENABLE ROW LEVEL SECURITY;

-- Create policy for folders (allow all for now)
CREATE POLICY "Allow all operations on folders" ON folders
    FOR ALL USING (true) WITH CHECK (true);

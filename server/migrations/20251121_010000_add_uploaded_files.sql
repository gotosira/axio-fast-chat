-- Add uploaded_files table for storing user uploaded files
-- This is an EXAMPLE migration for future use

CREATE TABLE IF NOT EXISTS uploaded_files (
    id TEXT PRIMARY KEY,
    conversation_id TEXT REFERENCES conversations(id) ON DELETE CASCADE,
    user_id TEXT, -- For future auth integration
    filename TEXT NOT NULL,
    file_type TEXT NOT NULL, -- image, document, etc.
    mime_type TEXT NOT NULL,
    file_size BIGINT NOT NULL, -- size in bytes
    storage_url TEXT NOT NULL, -- Supabase Storage URL or base64
    thumbnail_url TEXT, -- Optional thumbnail for images
    metadata JSONB, -- Additional metadata (dimensions, duration, etc.)
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL
);

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_uploaded_files_conversation ON uploaded_files(conversation_id);
CREATE INDEX IF NOT EXISTS idx_uploaded_files_user ON uploaded_files(user_id);
CREATE INDEX IF NOT EXISTS idx_uploaded_files_created ON uploaded_files(created_at DESC);

-- Add RLS policies
ALTER TABLE uploaded_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations on uploaded_files" ON uploaded_files
    FOR ALL USING (true) WITH CHECK (true);

-- Optional: Add file_id reference to messages table
ALTER TABLE messages ADD COLUMN IF NOT EXISTS file_id TEXT REFERENCES uploaded_files(id) ON DELETE SET NULL;

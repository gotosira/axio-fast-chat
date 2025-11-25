-- Add ai_id column to conversations table
ALTER TABLE conversations 
ADD COLUMN IF NOT EXISTS ai_id TEXT DEFAULT 'baobao';

-- Create index for faster filtering
CREATE INDEX IF NOT EXISTS idx_conversations_ai_id ON conversations(ai_id);

-- Update existing conversations to have baobao as default
UPDATE conversations 
SET ai_id = 'baobao' 
WHERE ai_id IS NULL;

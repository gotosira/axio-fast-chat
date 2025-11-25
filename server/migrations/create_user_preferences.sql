-- Create user_preferences table
CREATE TABLE IF NOT EXISTS user_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL DEFAULT 'default_user',
    pinned_ais JSONB DEFAULT '["baobao", "deedee"]'::jsonb,
    ai_order JSONB DEFAULT '["baobao", "deedee", "pungpung", "flowflow"]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id)
);

-- Create index on user_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_preferences_user_id ON user_preferences(user_id);

-- Insert default preferences for default user
INSERT INTO user_preferences (user_id, pinned_ais, ai_order)
VALUES ('default_user', '["baobao", "deedee"]'::jsonb, '["baobao", "deedee", "pungpung", "flowflow"]'::jsonb)
ON CONFLICT (user_id) DO NOTHING;

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing Supabase credentials. Please set SUPABASE_URL and SUPABASE_ANON_KEY in .env');
    process.exit(1);
}

export const supabase = createClient(supabaseUrl, supabaseKey);

// Authentication operations
export const authDB = {
    // Sign up new user
    async signUp(email, password, metadata = {}) {
        const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: metadata
            }
        });

        if (error) throw error;
        return data;
    },

    // Sign in existing user
    async signIn(email, password) {
        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password
        });

        if (error) throw error;
        return data;
    },

    // Sign out current user
    async signOut() {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
    },

    // Get current session
    async getSession() {
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        return data.session;
    },

    // Get current user
    async getCurrentUser() {
        const { data: { user }, error } = await supabase.auth.getUser();
        if (error) throw error;
        return user;
    },

    // Send password reset email
    async resetPassword(email) {
        const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: `${window.location.origin}/reset-password`
        });

        if (error) throw error;
        return data;
    },

    // Update password (after reset)
    async updatePassword(newPassword) {
        const { data, error } = await supabase.auth.updateUser({
            password: newPassword
        });

        if (error) throw error;
        return data;
    },

    // Listen to auth state changes
    onAuthStateChange(callback) {
        return supabase.auth.onAuthStateChange(callback);
    }
};

// Conversation operations
export const conversationDB = {
    // Get all conversations
    async getAll(aiId = null) {
        let query = supabase
            .from('conversations')
            .select('*')
            .order('updated_at', { ascending: false });

        // Filter by AI if specified
        if (aiId) {
            query = query.eq('ai_id', aiId);
        }

        const { data, error } = await query;

        if (error) throw error;
        return data;
    },

    // Get single conversation
    async get(id) {
        const { data, error } = await supabase
            .from('conversations')
            .select('*')
            .eq('id', id)
            .single();

        if (error) throw error;
        return data;
    },

    // Create conversation
    async create(conversation) {
        const { data, error } = await supabase
            .from('conversations')
            .insert([{
                id: conversation.id,
                title: conversation.title,
                ai_id: conversation.ai_id || 'baobao', // Default to baobao if not specified
                folder_id: conversation.folder_id || null, // Optional folder
                created_at: Date.now(),
                updated_at: Date.now()
            }])
            .select()
            .single();

        if (error) throw error;
        return data;
    },

    // Update conversation
    async update(id, updates) {
        const { data, error } = await supabase
            .from('conversations')
            .update({
                title: updates.title,
                folder_id: updates.folder_id, // Allow updating folder
                updated_at: Date.now()
            })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        return data;
    },

    // Touch conversation (update timestamp)
    async touch(id) {
        const { data, error } = await supabase
            .from('conversations')
            .update({ updated_at: Date.now() })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        return data;
    },

    // Delete conversation
    async delete(id) {
        const { error } = await supabase
            .from('conversations')
            .delete()
            .eq('id', id);

        if (error) throw error;
        return { success: true };
    },

    // Delete all conversations (Clear All for specific AI)
    async deleteAll(aiId) {
        let query = supabase
            .from('conversations')
            .delete();

        if (aiId) {
            query = query.eq('ai_id', aiId);
        } else {
            // Safety: if no AI ID provided, don't delete anything to prevent accidents
            // Or we could allow deleting EVERYTHING if explicitly requested, but safer to require scope
            console.warn('deleteAll called without aiId - preventing accidental wipe');
            return { success: false, error: 'AI ID required' };
        }

        const { error } = await query;

        if (error) throw error;
        return { success: true };
    }
};

// Folder operations
export const folderDB = {
    // Get all folders
    async getAll() {
        const { data, error } = await supabase
            .from('folders')
            .select('*')
            .order('created_at', { ascending: true });

        if (error) throw error;
        return data;
    },

    // Create folder
    async create(folder) {
        const { data, error } = await supabase
            .from('folders')
            .insert([{
                id: folder.id,
                name: folder.name,
                created_at: Date.now(),
                updated_at: Date.now()
            }])
            .select()
            .single();

        if (error) throw error;
        return data;
    },

    // Update folder
    async update(id, updates) {
        const { data, error } = await supabase
            .from('folders')
            .update({
                name: updates.name,
                updated_at: Date.now()
            })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        return data;
    },

    // Delete folder
    async delete(id) {
        // First, move all conversations in this folder back to root (folder_id = null)
        // Or should we delete them? Usually "delete folder" keeps contents or asks.
        // Let's move them to root for safety.
        await supabase
            .from('conversations')
            .update({ folder_id: null })
            .eq('folder_id', id);

        const { error } = await supabase
            .from('folders')
            .delete()
            .eq('id', id);

        if (error) throw error;
        return { success: true };
    }
};

// Message operations
export const messageDB = {
    // Get messages by conversation
    async getByConversation(conversationId) {
        const { data, error } = await supabase
            .from('messages')
            .select(`
                *,
                uploaded_files (
                    id,
                    filename,
                    mime_type,
                    storage_url
                )
            `)
            .eq('conversation_id', conversationId)
            .order('created_at', { ascending: true });

        if (error) throw error;

        // Map database fields to frontend structure
        return data.map(msg => ({
            ...msg,
            references: msg.reference_data, // Map back to references
            file: msg.uploaded_files ? {
                name: msg.uploaded_files.filename,
                mimeType: msg.uploaded_files.mime_type,
                data: msg.uploaded_files.storage_url // Assuming storage_url holds base64 for now
            } : (msg.file_data ? JSON.parse(msg.file_data) : null) // Fallback to old file_data
        }));
    },

    // Create message
    async create(message) {
        const { data, error } = await supabase
            .from('messages')
            .upsert([{
                id: message.id,
                conversation_id: message.conversation_id,
                role: message.role,
                content: message.content,
                file_data: message.file_data || null,
                reference_data: message.references || null, // Map 'references' to 'reference_data'
                file_id: message.file_id || null, // Link to uploaded_files
                created_at: Date.now()
            }])
            .select()
            .single();

        if (error) throw error;
        return data;
    }
};

// File operations
export const fileDB = {
    // Create file record
    async create(file) {
        // Try to insert with metadata first
        try {
            const { data, error } = await supabase
                .from('uploaded_files')
                .insert([{
                    id: file.id,
                    conversation_id: file.conversation_id,
                    filename: file.filename,
                    file_type: file.file_type,
                    mime_type: file.mime_type,
                    file_size: file.file_size,
                    storage_url: file.storage_url,
                    created_at: Date.now(),
                    updated_at: Date.now()
                }])
                .select()
                .single();

            if (error) throw error;
            return data;
        } catch (error) {
            // If error is due to missing columns (Postgres code 42703), retry without metadata
            if (error.code === '42703' || error.message?.includes('does not exist')) {
                console.warn('⚠️ Metadata columns missing in uploaded_files table. Falling back to basic insert.');
                const { data, error: retryError } = await supabase
                    .from('uploaded_files')
                    .insert([{
                        id: file.id,
                        conversation_id: file.conversation_id,
                        filename: file.filename,
                        file_type: file.file_type,
                        mime_type: file.mime_type,
                        file_size: file.file_size,
                        storage_url: file.storage_url,
                        created_at: Date.now(),
                        updated_at: Date.now()
                    }])
                    .select()
                    .single();

                if (retryError) throw retryError;
                return data;
            }
            throw error;
        }
    },

    // Get files by conversation
    async getByConversation(conversationId) {
        const { data, error } = await supabase
            .from('uploaded_files')
            .select('*')
            .eq('conversation_id', conversationId)
            .order('created_at', { ascending: true });

        if (error) throw error;
        return data;
    },

    // Get all files (Asset Library)
    async getAll() {
        const { data, error } = await supabase
            .from('uploaded_files')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;
        return data;
    },

    // Delete file
    async delete(id) {
        const { error } = await supabase
            .from('uploaded_files')
            .delete()
            .eq('id', id);

        if (error) throw error;
        return { success: true };
    },

    // Update file (for renaming)
    async update(id, updates) {
        const { data, error } = await supabase
            .from('uploaded_files')
            .update({
                filename: updates.filename,
                updated_at: Date.now()
            })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        return data;
    }
};

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
        const { data, error } = await supabase
            .from('uploaded_files')
            .insert([{
                id: file.id,
                conversation_id: file.conversation_id,
                filename: file.filename,
                file_type: file.file_type,
                mime_type: file.mime_type,
                file_size: file.file_size,
                storage_url: file.storage_url, // Currently storing base64 here, ideally Supabase Storage URL
                created_at: Date.now(),
                updated_at: Date.now()
            }])
            .select()
            .single();

        if (error) throw error;
        return data;
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
    }
};

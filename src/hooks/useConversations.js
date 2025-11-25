import { useState, useEffect } from 'react';

const API_URL = '/api';

export function useConversations(currentConversationId, onConversationChange, selectedAI = 'baobao') {
    const [conversations, setConversations] = useState([]);
    const [loading, setLoading] = useState(true);

    // Load all conversations for selected AI
    const loadConversations = async (aiId = selectedAI) => {
        try {
            const res = await fetch(`${API_URL}/conversations?ai_id=${aiId}&t=${Date.now()}`);
            const data = await res.json();
            setConversations(data);
        } catch (error) {
            console.error('Error loading conversations:', error);
        } finally {
            setLoading(false);
        }
    };

    // Load single conversation
    const loadConversation = async (id) => {
        try {
            const res = await fetch(`${API_URL}/conversations/${id}`);
            if (!res.ok) throw new Error('Conversation not found');
            return await res.json();
        } catch (error) {
            console.error('Error loading conversation:', error);
            return null;
        }
    };

    // Create new conversation
    const createConversation = async (id, title, aiId = selectedAI) => {
        try {
            await fetch(`${API_URL}/conversations`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id,
                    title,
                    ai_id: aiId // Use passed AI ID or default to selectedAI from closure
                })
            });
            await loadConversations(aiId); // Reload conversations for the specific AI
            return id;
        } catch (error) {
            console.error('Error creating conversation:', error);
            return null;
        }
    };

    // Rename conversation
    const renameConversation = async (id, newTitle) => {
        // Optimistic update: Update UI immediately
        setConversations(prev => prev.map(c =>
            c.id === id ? { ...c, title: newTitle, updated_at: Date.now() } : c
        ));

        try {
            await fetch(`${API_URL}/conversations/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: newTitle })
            });
            // Refresh list to ensure sync (optional but good for consistency)
            // await loadConversations(); 
        } catch (error) {
            console.error('Error renaming conversation:', error);
            // Revert on error (optional, but keeping it simple for now)
            loadConversations();
        }
    };

    // Delete conversation
    const deleteConversation = async (id) => {
        try {
            const res = await fetch(`${API_URL}/conversations/${id}`, {
                method: 'DELETE'
            });

            if (!res.ok) {
                throw new Error('Failed to delete conversation');
            }

            await loadConversations();

            // If deleting current conversation, switch to another
            if (id === currentConversationId) {
                const remaining = conversations.filter(c => c.id !== id);
                if (remaining.length > 0) {
                    onConversationChange(remaining[0].id);
                } else {
                    onConversationChange(null);
                }
            }
        } catch (error) {
            console.error('Error deleting conversation:', error);
        }
    };

    // Save message
    const saveMessage = async (message) => {
        try {
            await fetch(`${API_URL}/messages`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(message)
            });
            // Touch conversation to update timestamp
            if (message.conversation_id) {
                await touchConversation(message.conversation_id);
            }
        } catch (error) {
            console.error('Error saving message:', error);
        }
    };

    // Touch conversation (update timestamp)
    const touchConversation = async (id) => {
        try {
            await fetch(`${API_URL}/conversations/${id}/touch`, {
                method: 'PATCH'
            });
            // Refresh to get updated timestamp
            await loadConversations();
        } catch (error) {
            console.error('Error touching conversation:', error);
        }
    };

    // Load on mount and when selected AI changes
    useEffect(() => {
        loadConversations();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedAI]);

    return {
        conversations,
        loading,
        loadConversation,
        createConversation,
        renameConversation,
        deleteConversation,
        saveMessage,
        touchConversation,
        refreshConversations: loadConversations
    };
}

import React, { createContext, useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

// Create Supabase client for auth
const supabaseUrl = 'https://uuohbvezhyosxpwxnunl.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1b2hidmV6aHlvc3hwd3hudW5sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM2Njg5MTQsImV4cCI6MjA3OTI0NDkxNH0.7SOf73AOCeo2wbYJzyNf_3SQiD42zsQtCTlefxQ4p2k';
const supabase = createClient(supabaseUrl, supabaseKey);

export const AuthContext = createContext({
    user: null,
    session: null,
    loading: true,
    signIn: async () => { },
    signUp: async () => { },
    signOut: async () => { },
    resetPassword: async () => { }
});

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [session, setSession] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Check for email confirmation or password reset tokens in URL
        const handleAuthCallback = async () => {
            const hashParams = new URLSearchParams(window.location.hash.substring(1));
            const accessToken = hashParams.get('access_token');
            const type = hashParams.get('type');

            // Handle email confirmation
            if (type === 'signup' && accessToken) {
                console.log('✅ Email confirmation detected, verifying...');
                try {
                    const { data, error } = await supabase.auth.getUser(accessToken);
                    if (error) throw error;

                    console.log('✅ Email confirmed successfully! User:', data.user?.email);
                    // Clear the hash from URL
                    window.history.replaceState(null, '', window.location.pathname);
                } catch (error) {
                    console.error('❌ Email confirmation failed:', error);
                }
            }
        };

        // Check active session on mount
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session);
            setUser(session?.user ?? null);
            setLoading(false);

            // Handle auth callback after session check
            handleAuthCallback();
        });

        // Listen for auth changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            async (event, session) => {
                console.log('🔐 Auth state changed:', event);
                setSession(session);
                setUser(session?.user ?? null);
                setLoading(false);
            }
        );

        return () => subscription.unsubscribe();
    }, []);

    const signIn = async (email, password) => {
        setLoading(true);
        try {
            console.log('🔐 Attempting sign in for:', email);
            const { data, error } = await supabase.auth.signInWithPassword({
                email,
                password
            });

            if (error) {
                console.error('❌ Sign in error:', error);
                // Provide more helpful error messages
                if (error.message.includes('Invalid login credentials')) {
                    error.message = 'Invalid email or password. Please check your credentials and try again.';
                } else if (error.message.includes('Email not confirmed')) {
                    error.message = 'Please confirm your email address before logging in. Check your inbox for the confirmation link.';
                }
                throw error;
            }

            console.log('✅ Sign in successful:', data.user?.email);
            return { data, error: null };
        } catch (error) {
            console.error('❌ Sign in failed:', error.message);
            return { data: null, error };
        } finally {
            setLoading(false);
        }
    };

    const signUp = async (email, password, metadata = {}) => {
        setLoading(true);
        try {
            console.log('📝 Attempting sign up for:', email);
            const { data, error } = await supabase.auth.signUp({
                email,
                password,
                options: {
                    data: metadata
                }
            });

            if (error) {
                console.error('❌ Sign up error:', error);
                throw error;
            }

            console.log('✅ Sign up successful! User:', data.user?.email);

            // Check if email confirmation is required
            if (data.user && !data.session) {
                console.warn('⚠️ Email confirmation required. Check your inbox!');
                error.message = 'Account created! Please check your email to confirm your account before logging in.';
            } else {
                console.log('✅ User logged in immediately (no confirmation required)');
            }

            return { data, error: null };
        } catch (error) {
            console.error('❌ Sign up failed:', error.message);
            return { data: null, error };
        } finally {
            setLoading(false);
        }
    };

    const signOut = async () => {
        setLoading(true);
        try {
            const { error } = await supabase.auth.signOut();
            if (error) throw error;
            return { error: null };
        } catch (error) {
            console.error('❌ Sign out error:', error);
            return { error };
        } finally {
            // Force clear local state to ensure UI updates
            setUser(null);
            setSession(null);
            setLoading(false);
        }
    };

    const resetPassword = async (email) => {
        try {
            console.log('📧 Sending password reset email to:', email);
            const { error } = await supabase.auth.resetPasswordForEmail(email, {
                redirectTo: `${window.location.origin}/#type=recovery`
            });
            if (error) throw error;
            console.log('✅ Password reset email sent successfully');
            return { error: null };
        } catch (error) {
            console.error('❌ Password reset failed:', error);
            return { error };
        }
    };

    const value = {
        user,
        session,
        loading,
        signIn,
        signUp,
        signOut,
        resetPassword
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};

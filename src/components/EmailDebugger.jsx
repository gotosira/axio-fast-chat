import React, { useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://uuohbvezhyosxpwxnunl.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1b2hidmV6aHlvc3hwd3hudW5sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM2Njg5MTQsImV4cCI6MjA3OTI0NDkxNH0.7SOf73AOCeo2wbYJzyNf_3SQiD42zsQtCTlefxQ4p2k';
const supabase = createClient(supabaseUrl, supabaseKey);

export const EmailDebugger = ({ isOpen, onClose }) => {
    const [testEmail, setTestEmail] = useState('');
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(false);

    const addLog = (message, type = 'info') => {
        const timestamp = new Date().toLocaleTimeString();
        setLogs(prev => [...prev, { message, type, timestamp }]);
    };

    const testPasswordReset = async () => {
        if (!testEmail) {
            addLog('❌ Please enter an email address', 'error');
            return;
        }

        setLoading(true);
        addLog(`📧 Sending password reset email to: ${testEmail}`, 'info');

        try {
            const { error } = await supabase.auth.resetPasswordForEmail(testEmail, {
                redirectTo: `${window.location.origin}/#type=recovery`
            });

            if (error) {
                addLog(`❌ Error: ${error.message}`, 'error');
            } else {
                addLog('✅ Password reset email sent successfully!', 'success');
                addLog('📬 Check your email inbox (and spam folder)', 'info');
                addLog(`🔗 The reset link will redirect to: ${window.location.origin}/#type=recovery`, 'info');
            }
        } catch (err) {
            addLog(`❌ Unexpected error: ${err.message}`, 'error');
        } finally {
            setLoading(false);
        }
    };

    const checkAuthLogs = async () => {
        addLog('🔍 Checking authentication state...', 'info');

        const { data: { session } } = await supabase.auth.getSession();

        if (session) {
            addLog(`✅ Current user: ${session.user.email}`, 'success');
            addLog(`🆔 User ID: ${session.user.id}`, 'info');
        } else {
            addLog('⚠️ No active session', 'warning');
        }
    };

    const testDirectReset = () => {
        addLog('🧪 Opening test reset link...', 'info');
        addLog('⚠️ This is a mock - you need a real token from the email', 'warning');

        // This will trigger the reset page but without a valid token
        window.location.hash = '#type=recovery&access_token=test-token';
        addLog('🔗 Navigated to reset page', 'info');
    };

    const clearLogs = () => {
        setLogs([]);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-neutral-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
                {/* Header */}
                <div className="p-6 border-b border-gray-200 dark:border-neutral-700">
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Email Debugger</h2>
                            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                                Test password reset emails and debug auth flow
                            </p>
                        </div>
                        <button
                            onClick={onClose}
                            className="p-2 hover:bg-gray-100 dark:hover:bg-neutral-700 rounded-lg transition-colors"
                        >
                            <svg className="w-6 h-6 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {/* Test Email Section */}
                    <div className="space-y-3">
                        <h3 className="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wide">
                            Test Password Reset Email
                        </h3>
                        <div className="flex gap-2">
                            <input
                                type="email"
                                value={testEmail}
                                onChange={(e) => setTestEmail(e.target.value)}
                                placeholder="Enter email address"
                                className="flex-1 px-3 py-2 border border-gray-300 dark:border-neutral-600 rounded-lg bg-white dark:bg-neutral-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            <button
                                onClick={testPasswordReset}
                                disabled={loading}
                                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium disabled:opacity-50 transition-colors"
                            >
                                {loading ? 'Sending...' : 'Send Reset'}
                            </button>
                        </div>
                    </div>

                    {/* Quick Actions */}
                    <div className="space-y-3">
                        <h3 className="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wide">
                            Quick Actions
                        </h3>
                        <div className="grid grid-cols-2 gap-2">
                            <button
                                onClick={checkAuthLogs}
                                className="px-4 py-2 bg-gray-200 dark:bg-neutral-700 hover:bg-gray-300 dark:hover:bg-neutral-600 text-gray-900 dark:text-white rounded-lg font-medium transition-colors"
                            >
                                Check Auth State
                            </button>
                            <button
                                onClick={testDirectReset}
                                className="px-4 py-2 bg-gray-200 dark:bg-neutral-700 hover:bg-gray-300 dark:hover:bg-neutral-600 text-gray-900 dark:text-white rounded-lg font-medium transition-colors"
                            >
                                Test Reset Page
                            </button>
                        </div>
                    </div>

                    {/* Logs */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <h3 className="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wide">
                                Debug Logs
                            </h3>
                            <button
                                onClick={clearLogs}
                                className="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400 font-medium"
                            >
                                Clear
                            </button>
                        </div>
                        <div className="bg-gray-900 dark:bg-black rounded-lg p-4 font-mono text-sm max-h-80 overflow-y-auto">
                            {logs.length === 0 ? (
                                <p className="text-gray-500">No logs yet. Try testing the email reset above.</p>
                            ) : (
                                <div className="space-y-2">
                                    {logs.map((log, index) => (
                                        <div key={index} className="flex gap-2">
                                            <span className="text-gray-500 flex-shrink-0">[{log.timestamp}]</span>
                                            <span className={
                                                log.type === 'error' ? 'text-red-400' :
                                                    log.type === 'success' ? 'text-green-400' :
                                                        log.type === 'warning' ? 'text-yellow-400' :
                                                            'text-gray-300'
                                            }>
                                                {log.message}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Instructions */}
                    <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                        <h4 className="text-sm font-semibold text-blue-900 dark:text-blue-300 mb-2">
                            💡 How to Test
                        </h4>
                        <ol className="text-sm text-blue-800 dark:text-blue-400 space-y-1 list-decimal list-inside">
                            <li>Enter a registered email address above</li>
                            <li>Click "Send Reset" to trigger the email</li>
                            <li>Check your email inbox (and spam folder)</li>
                            <li>Click the reset link in the email</li>
                            <li>You'll be redirected to the password reset page</li>
                        </ol>
                    </div>
                </div>
            </div>
        </div>
    );
};

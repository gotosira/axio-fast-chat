import React, { useState, useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { FadeInText } from '../FadeInText';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://uuohbvezhyosxpwxnunl.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1b2hidmV6aHlvc3hwd3hudW5sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM2Njg5MTQsImV4cCI6MjA3OTI0NDkxNH0.7SOf73AOCeo2wbYJzyNf_3SQiD42zsQtCTlefxQ4p2k';
const supabase = createClient(supabaseUrl, supabaseKey);

export const ResetPasswordPage = ({ onSwitchToLogin }) => {
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isValidToken, setIsValidToken] = useState(false);

    useEffect(() => {
        // Check if we have a valid recovery token in the URL
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        const accessToken = hashParams.get('access_token');
        const type = hashParams.get('type');

        if (type === 'recovery' && accessToken) {
            setIsValidToken(true);
            console.log('✅ Valid password reset token detected');
        } else {
            setError('Invalid or expired reset link. Please request a new one.');
            console.log('❌ No valid reset token found in URL');
        }
    }, []);

    const validateForm = () => {
        if (!password || !confirmPassword) {
            setError('Please fill in all fields');
            return false;
        }

        if (password.length < 6) {
            setError('Password must be at least 6 characters');
            return false;
        }

        if (password !== confirmPassword) {
            setError('Passwords do not match');
            return false;
        }

        return true;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        if (!validateForm()) {
            return;
        }

        setIsSubmitting(true);

        try {
            const { error: updateError } = await supabase.auth.updateUser({
                password: password
            });

            if (updateError) throw updateError;

            setSuccess(true);
            console.log('✅ Password updated successfully');

            // Redirect to login after 3 seconds
            setTimeout(() => {
                onSwitchToLogin();
            }, 3000);
        } catch (err) {
            console.error('❌ Password update error:', err);
            setError(err.message || 'Failed to update password');
        } finally {
            setIsSubmitting(false);
        }
    };

    const getPasswordStrength = () => {
        if (!password) return { strength: 0, text: '', color: '' };

        let strength = 0;
        if (password.length >= 6) strength += 25;
        if (password.length >= 10) strength += 25;
        if (/[A-Z]/.test(password)) strength += 25;
        if (/[0-9]/.test(password)) strength += 25;

        if (strength <= 25) return { strength, text: 'Weak', color: 'bg-red-500' };
        if (strength <= 50) return { strength, text: 'Fair', color: 'bg-yellow-500' };
        if (strength <= 75) return { strength, text: 'Good', color: 'bg-blue-500' };
        return { strength, text: 'Strong', color: 'bg-green-500' };
    };

    const passwordStrength = getPasswordStrength();

    if (!isValidToken && !error) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-neutral-900">
                <div className="text-center">
                    <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
                        <svg className="w-10 h-10 text-white animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                        </svg>
                    </div>
                    <p className="text-gray-600 dark:text-gray-400">Checking reset link...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex">
            {/* Left Side - Image */}
            <div
                className="hidden lg:flex lg:w-1/2 bg-cover bg-center relative"
                style={{
                    backgroundImage: `url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600"><defs><linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" style="stop-color:%2306b6d4;stop-opacity:1" /><stop offset="100%" style="stop-color:%233b82f6;stop-opacity:1" /></linearGradient></defs><rect width="800" height="600" fill="url(%23grad)"/><circle cx="200" cy="150" r="100" fill="%23fff" opacity="0.1"/><circle cx="600" cy="400" r="120" fill="%23fff" opacity="0.1"/><path d="M 0 500 Q 200 400 400 450 T 800 500 L 800 600 L 0 600 Z" fill="%23fff" opacity="0.05"/></svg>')`
                }}
            >
                <div className="absolute inset-0 bg-gradient-to-br from-blue-600/20 to-cyan-500/20 backdrop-blur-[1px]"></div>
                <div className="relative z-10 flex flex-col justify-center items-center text-white p-12">
                    <FadeInText direction="up" delayMs={0}>
                        <div className="max-w-md">
                            <h1 className="text-4xl font-bold mb-4">Almost There!</h1>
                            <p className="text-xl text-white/90 leading-relaxed">
                                Just one more step to secure your account. Choose a strong new password below.
                            </p>
                        </div>
                    </FadeInText>
                </div>
            </div>

            {/* Right Side - Reset Password Form */}
            <div className="flex-1 flex items-center justify-center p-8 bg-gray-50 dark:bg-neutral-900">
                <FadeInText direction="up" delayMs={100} className="w-full max-w-md">
                    <div className="bg-white dark:bg-neutral-800 rounded-2xl shadow-xl p-8">
                        {/* Logo */}
                        <div className="flex justify-center mb-6">
                            <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-2xl flex items-center justify-center">
                                <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                                </svg>
                            </div>
                        </div>

                        {/* Title */}
                        <div className="text-center mb-8">
                            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                                {success ? 'Password Updated!' : 'Reset Your Password'}
                            </h2>
                            <p className="text-gray-600 dark:text-gray-400">
                                {success
                                    ? "Your password has been successfully updated"
                                    : "Enter your new password below"
                                }
                            </p>
                        </div>

                        {/* Success Message */}
                        {success && (
                            <div className="mb-6 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                                <div className="flex">
                                    <svg className="h-5 w-5 text-green-600 dark:text-green-400 mr-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    <div>
                                        <p className="text-sm font-medium text-green-800 dark:text-green-300">Success!</p>
                                        <p className="text-sm text-green-700 dark:text-green-400 mt-1">
                                            Redirecting you to login...
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Error Message */}
                        {error && (
                            <div className="mb-6 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
                            </div>
                        )}

                        {!success && isValidToken && (
                            <form onSubmit={handleSubmit} className="space-y-5">
                                {/* New Password */}
                                <div>
                                    <label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                        New Password
                                    </label>
                                    <input
                                        id="password"
                                        type="password"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        className="block w-full px-3 py-2.5 border border-gray-300 dark:border-neutral-600 rounded-lg bg-white dark:bg-neutral-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
                                        placeholder="••••••••"
                                        disabled={isSubmitting}
                                    />
                                    {password && (
                                        <div className="mt-2">
                                            <div className="flex justify-between items-center mb-1">
                                                <span className="text-xs text-gray-600 dark:text-gray-400">Password strength:</span>
                                                <span className={`text-xs font-medium ${passwordStrength.strength > 50 ? 'text-green-600' : 'text-gray-600'}`}>
                                                    {passwordStrength.text}
                                                </span>
                                            </div>
                                            <div className="w-full h-1.5 bg-gray-200 dark:bg-neutral-700 rounded-full overflow-hidden">
                                                <div
                                                    className={`h-full ${passwordStrength.color} transition-all duration-300`}
                                                    style={{ width: `${passwordStrength.strength}%` }}
                                                />
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Confirm Password */}
                                <div>
                                    <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                        Confirm New Password
                                    </label>
                                    <input
                                        id="confirmPassword"
                                        type="password"
                                        value={confirmPassword}
                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                        className="block w-full px-3 py-2.5 border border-gray-300 dark:border-neutral-600 rounded-lg bg-white dark:bg-neutral-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
                                        placeholder="••••••••"
                                        disabled={isSubmitting}
                                    />
                                </div>

                                {/* Submit Button */}
                                <button
                                    type="submit"
                                    disabled={isSubmitting}
                                    className="w-full py-2.5 px-4 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white font-medium rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                                >
                                    {isSubmitting ? (
                                        <>
                                            <svg className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                            </svg>
                                            Updating...
                                        </>
                                    ) : (
                                        'Update Password'
                                    )}
                                </button>
                            </form>
                        )}

                        {/* Back to Login Link */}
                        {!success && (
                            <div className="mt-6 text-center">
                                <button
                                    onClick={onSwitchToLogin}
                                    className="text-sm font-medium text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300"
                                    disabled={isSubmitting}
                                >
                                    ← Back to Login
                                </button>
                            </div>
                        )}
                    </div>
                </FadeInText>
            </div>
        </div>
    );
};

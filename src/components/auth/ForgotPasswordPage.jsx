import React, { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { FadeInText } from '../FadeInText';

export const ForgotPasswordPage = ({ onSwitchToLogin }) => {
    const { resetPassword } = useAuth();
    const [email, setEmail] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setSuccess(false);

        if (!email) {
            setError('Please enter your email address');
            return;
        }

        setIsSubmitting(true);

        const { error: resetError } = await resetPassword(email);

        setIsSubmitting(false);

        if (resetError) {
            setError(resetError.message || 'Failed to send reset email');
        } else {
            setSuccess(true);
        }
    };

    return (
        <div className="min-h-screen flex bg-gray-50 dark:bg-neutral-900 font-sans">
            {/* Left Side - Image */}
            <div className="hidden lg:block lg:w-1/2 relative overflow-hidden">
                <img
                    src="https://images.unsplash.com/photo-1466692476868-aef1dfb1e735?q=80&w=2070&auto=format&fit=crop"
                    alt="Watering plants"
                    className="absolute inset-0 w-full h-full object-cover"
                />
            </div>

            {/* Right Side - Forgot Password Form */}
            <div className="flex-1 flex flex-col relative">
                {/* Language Selector */}
                <div className="absolute top-6 right-6 z-10">
                    <button className="flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-neutral-800 border border-gray-200 dark:border-neutral-700 rounded-md text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-neutral-700 transition-colors shadow-sm">
                        <span className="w-5 h-3.5 bg-slate-200 rounded-sm overflow-hidden relative block">
                            {/* US Flag placeholder */}
                            <span className="absolute inset-0 bg-red-600" style={{ background: 'linear-gradient(90deg, #b22234 0%, #b22234 100%)' }}></span>
                            <span className="absolute top-0 left-0 w-2.5 h-2 bg-blue-800"></span>
                            <span className="absolute top-0.5 left-0.5 w-0.5 h-0.5 bg-white rounded-full"></span>
                            <span className="absolute inset-0" style={{ background: 'repeating-linear-gradient(180deg, transparent, transparent 1px, white 1px, white 2px)' }}></span>
                        </span>
                        <span>EN</span>
                        <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                    </button>
                </div>

                <div className="flex-1 flex items-center justify-center p-8 sm:p-12 lg:p-16">
                    <div className="w-full max-w-md space-y-8">
                        {/* Header */}
                        <div className="text-center">
                            <div className="mx-auto w-20 h-20 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-3xl flex items-center justify-center mb-6 shadow-lg shadow-blue-500/20">
                                <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                                </svg>
                            </div>
                            <h2 className="text-3xl font-bold text-slate-800 dark:text-white mb-3 tracking-tight">Forgot Password?</h2>
                            <p className="text-slate-500 dark:text-slate-400 text-base leading-relaxed max-w-sm mx-auto">
                                {success
                                    ? "Check your email for reset instructions"
                                    : "Enter your email and we'll send you a reset link"
                                }
                            </p>
                        </div>

                        {/* Success Message */}
                        {success && (
                            <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg flex items-start gap-3">
                                <svg className="h-5 w-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                <div>
                                    <p className="text-sm font-medium text-green-800 dark:text-green-300">Password reset email sent!</p>
                                    <p className="text-sm text-green-700 dark:text-green-400 mt-1">
                                        Please check your inbox and follow the instructions to reset your password.
                                    </p>
                                </div>
                            </div>
                        )}

                        {/* Error Message */}
                        {error && (
                            <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-3">
                                <svg className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
                            </div>
                        )}

                        {!success ? (
                            <>
                                {/* Form */}
                                <form onSubmit={handleSubmit} className="space-y-6">
                                    {/* Email */}
                                    <div>
                                        <label htmlFor="email" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                                            Email
                                        </label>
                                        <div className="relative">
                                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                                <svg className="h-5 w-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                                </svg>
                                            </div>
                                            <input
                                                id="email"
                                                type="email"
                                                value={email}
                                                onChange={(e) => setEmail(e.target.value)}
                                                className="block w-full pl-10 pr-3 py-2.5 border border-slate-300 dark:border-neutral-600 rounded-lg bg-white dark:bg-neutral-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                                                placeholder="you@example.com"
                                                disabled={isSubmitting}
                                            />
                                        </div>
                                    </div>

                                    {/* Submit Button */}
                                    <button
                                        type="submit"
                                        disabled={isSubmitting}
                                        className="w-full py-3 px-4 bg-[#0f4c81] hover:bg-[#0d4270] text-white font-semibold rounded-lg shadow-sm hover:shadow-md transition-all duration-200 disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center text-sm"
                                    >
                                        {isSubmitting ? (
                                            <>
                                                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                </svg>
                                                Sending...
                                            </>
                                        ) : (
                                            'Send Reset Link'
                                        )}
                                    </button>
                                </form>
                            </>
                        ) : (
                            /* Back to Login Button (after success) */
                            <button
                                onClick={onSwitchToLogin}
                                className="w-full py-3 px-4 bg-[#0f4c81] hover:bg-[#0d4270] text-white font-semibold rounded-lg shadow-sm hover:shadow-md transition-all duration-200 flex items-center justify-center text-sm"
                            >
                                Back to Login
                            </button>
                        )}

                        {/* Back to Login Link (before success) */}
                        {!success && (
                            <div className="text-center">
                                <button
                                    type="button"
                                    onClick={onSwitchToLogin}
                                    className="text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 transition-colors underline decoration-transparent hover:decoration-current"
                                    disabled={isSubmitting}
                                >
                                    ← Back to Login
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className="p-6 border-t border-slate-100 dark:border-neutral-800 flex justify-between items-center text-xs text-slate-400 dark:text-slate-500">
                    <span>Version 1.00</span>
                    <span>©2025 AXONS. All Rights Reserved.</span>
                </div>
            </div>
        </div>
    );
};

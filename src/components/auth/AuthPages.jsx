import React, { useState } from 'react';
import { LoginPage } from './LoginPage';
import { SignUpPage } from './SignUpPage';
import { ForgotPasswordPage } from './ForgotPasswordPage';
import { ResetPasswordPage } from './ResetPasswordPage';

export const AuthPages = () => {
    const [currentView, setCurrentView] = useState(() => {
        // Check if we're coming from a password reset email
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        const type = hashParams.get('type');
        return type === 'recovery' ? 'reset' : 'login';
    });

    return (
        <div className="relative w-full h-screen overflow-hidden">
            <div className={`absolute inset-0 transition-opacity duration-300 ${currentView === 'login' ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'}`}>
                <LoginPage
                    onSwitchToSignUp={() => setCurrentView('signup')}
                    onSwitchToForgotPassword={() => setCurrentView('forgot')}
                />
            </div>

            <div className={`absolute inset-0 transition-opacity duration-300 ${currentView === 'signup' ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'}`}>
                <SignUpPage onSwitchToLogin={() => setCurrentView('login')} />
            </div>

            <div className={`absolute inset-0 transition-opacity duration-300 ${currentView === 'forgot' ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'}`}>
                <ForgotPasswordPage onSwitchToLogin={() => setCurrentView('login')} />
            </div>

            <div className={`absolute inset-0 transition-opacity duration-300 ${currentView === 'reset' ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'}`}>
                <ResetPasswordPage onSwitchToLogin={() => setCurrentView('login')} />
            </div>
        </div>
    );
};

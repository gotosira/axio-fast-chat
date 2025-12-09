import React, { useState, useEffect } from 'react';
import { FadeInText } from './FadeInText';
import { Package, LogOut, X, Mail } from 'lucide-react';
import { useAuth } from '../hooks/useAuth.js';
import { EmailDebugger } from './EmailDebugger.jsx';

export const ProfilePanel = ({ isOpen, onClose, onOpenAssetLibrary }) => {
    const { user: authUser, signOut } = useAuth();
    const [activeTab, setActiveTab] = useState('profile'); // 'profile' or 'settings'
    const [showEmailDebugger, setShowEmailDebugger] = useState(false);

    // Settings State
    const [settings, setSettings] = useState(() => {
        const saved = localStorage.getItem('baobao_settings');
        return saved ? JSON.parse(saved) : {
            darkMode: false,
            compactView: false,
            emailNotif: true,
            pushNotif: true
        };
    });

    // Persist settings
    useEffect(() => {
        localStorage.setItem('baobao_settings', JSON.stringify(settings));

        // Apply Dark Mode
        if (settings.darkMode) {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }

        // Apply Compact View
        if (settings.compactView) {
            document.documentElement.classList.add('compact-view');
        } else {
            document.documentElement.classList.remove('compact-view');
        }
    }, [settings]);

    const toggleSetting = (key) => {
        setSettings(prev => ({ ...prev, [key]: !prev[key] }));
    };

    // User data from auth
    const user = {
        name: authUser?.user_metadata?.full_name || authUser?.email?.split('@')[0] || 'User',
        email: authUser?.email || 'user@example.com',
        avatar: authUser?.user_metadata?.avatar_url || null,
        plan: 'Free Plan',
        joinedDate: authUser?.created_at ? new Date(authUser.created_at).toLocaleDateString() : 'N/A'
    };

    const handleLogout = async () => {
        console.log('🚪 Logout button clicked');
        if (confirm('Are you sure you want to logout?')) {
            console.log('🚪 User confirmed logout, calling signOut...');
            try {
                const { error } = await signOut();
                if (error) {
                    console.error('❌ Logout failed:', error);
                    alert('Logout failed: ' + error.message);
                } else {
                    console.log('✅ Logout successful');
                    onClose();
                }
            } catch (err) {
                console.error('❌ Unexpected error during logout:', err);
            }
        } else {
            console.log('🚪 User cancelled logout');
        }
    };

    return (
        <>
            <div className={`fixed inset-y-0 right-0 w-80 bg-surface-base shadow-lv3 transform transition-transform duration-300 ease-in-out z-50 flex flex-col border-l border-outline-base ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}>
                {/* Header */}
                <div className="p-4 border-b border-outline-base flex items-center justify-between bg-neutral-surface">
                    <h2 className="font-semibold text-text-primary">Account</h2>
                    <button onClick={onClose} className="p-2 hover:bg-bg-hover rounded-lg transition-colors">
                        <X size={20} className="text-text-secondary" />
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex w-full border-b border-border-weak">
                    <button
                        onClick={() => setActiveTab('profile')}
                        className={`flex-1 py-3 text-sm font-medium transition-colors text-center ${activeTab === 'profile'
                            ? 'text-text-primary border-b-2 border-color-brand'
                            : 'text-text-muted hover:text-text-primary'
                            }`}
                    >
                        Profile
                    </button>
                    <button
                        onClick={() => setActiveTab('settings')}
                        className={`flex-1 py-3 text-sm font-medium transition-colors text-center ${activeTab === 'settings'
                            ? 'text-text-primary border-b-2 border-color-brand'
                            : 'text-text-muted hover:text-text-primary'
                            }`}
                    >
                        Settings
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-4">
                    {activeTab === 'profile' ? (
                        <FadeInText as="div" className="space-y-6">
                            {/* User Avatar & Info */}
                            <div className="flex flex-col items-center text-center">
                                <div className="w-24 h-24 rounded-full bg-gradient-to-br from-blue-600 to-blue-700 flex items-center justify-center text-white text-3xl font-bold shadow-lg mb-4">
                                    {user.avatar ? (
                                        <img src={user.avatar} alt={user.name} className="w-full h-full rounded-full object-cover" />
                                    ) : (
                                        user.name.charAt(0).toUpperCase()
                                    )}
                                </div>
                                <h3 className="text-lg font-semibold text-text-primary">{user.name}</h3>
                                <p className="text-sm text-text-muted">{user.email}</p>
                                <button
                                    onClick={() => alert('Edit Profile feature coming soon!')}
                                    className="mt-3 px-4 py-2 text-sm text-blue-600 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                                >
                                    Edit Profile
                                </button>
                            </div>

                            {/* Account Details */}
                            <div className="space-y-4 pt-4 border-t border-border-weak">
                                <div className="flex justify-between items-center">
                                    <span className="text-sm text-text-muted">Plan</span>
                                    <span className="text-sm font-medium text-text-primary">{user.plan}</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-sm text-text-muted">Member Since</span>
                                    <span className="text-sm font-medium text-text-primary">{user.joinedDate}</span>
                                </div>
                            </div>

                            {/* Quick Actions */}
                            <div className="space-y-2 pt-4 border-t border-border-weak">
                                <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-3">Quick Actions</h4>
                                <button
                                    onClick={onOpenAssetLibrary}
                                    className="w-full p-3 text-left rounded-lg hover:bg-bg-hover transition-colors flex items-center gap-3"
                                >
                                    <Package size={20} className="text-gray-700 dark:text-gray-300" />
                                    <span className="text-sm font-medium">My Assets</span>
                                </button>
                                <button
                                    onClick={() => setShowEmailDebugger(true)}
                                    className="w-full p-3 text-left rounded-lg hover:bg-bg-hover transition-colors flex items-center gap-3"
                                >
                                    <Mail size={20} className="text-gray-700 dark:text-gray-300" />
                                    <span className="text-sm font-medium">Email Debugger</span>
                                </button>
                                <button
                                    onClick={handleLogout}
                                    className="w-full p-3 text-left rounded-lg hover:bg-bg-hover transition-colors flex items-center gap-3"
                                >
                                    <LogOut size={20} className="text-gray-700 dark:text-gray-300" />
                                    <span className="text-sm font-medium">Sign Out</span>
                                </button>
                            </div>
                        </FadeInText>
                    ) : (
                        <div className="p-4 space-y-6">
                            {/* Appearance */}
                            <section>
                                <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">Appearance</h3>
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm text-text-primary">Dark Mode</span>
                                        <button
                                            onClick={() => toggleSetting('darkMode')}
                                            className={`w-10 h-6 rounded-full transition-colors relative ${settings.darkMode ? 'bg-blue-600' : 'bg-gray-400'}`}
                                        >
                                            <span className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${settings.darkMode ? 'translate-x-4' : 'translate-x-0'}`} />
                                        </button>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm text-text-primary">Compact View</span>
                                        <button
                                            onClick={() => toggleSetting('compactView')}
                                            className={`w-10 h-6 rounded-full transition-colors relative ${settings.compactView ? 'bg-blue-600' : 'bg-gray-400'}`}
                                        >
                                            <span className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${settings.compactView ? 'translate-x-4' : 'translate-x-0'}`} />
                                        </button>
                                    </div>
                                </div>
                            </section>
                            {/* Notification Settings */}
                            <div className="pt-4 border-t border-border-weak">
                                <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-3">Notifications</h4>
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm text-text-primary">Email Notifications</span>
                                        <button
                                            onClick={() => toggleSetting('emailNotif')}
                                            className={`w-10 h-6 rounded-full transition-colors relative ${settings.emailNotif ? 'bg-blue-600' : 'bg-gray-400'}`}
                                        >
                                            <span className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${settings.emailNotif ? 'translate-x-4' : 'translate-x-0'}`} />
                                        </button>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm text-text-primary">Push Notifications</span>
                                        <button
                                            onClick={() => toggleSetting('pushNotif')}
                                            className={`w-10 h-6 rounded-full transition-colors relative ${settings.pushNotif ? 'bg-blue-600' : 'bg-gray-400'}`}
                                        >
                                            <span className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${settings.pushNotif ? 'translate-x-4' : 'translate-x-0'}`} />
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Data & Privacy */}
                            <div className="pt-4 border-t border-border-weak">
                                <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-3">Data & Privacy</h4>
                                <div className="space-y-2">
                                    <button
                                        onClick={() => alert('Exporting data...')}
                                        className="w-full p-2 text-left text-sm text-text-primary hover:bg-bg-hover rounded transition-colors"
                                    >
                                        Export Data
                                    </button>
                                    <button
                                        onClick={() => {
                                            if (confirm('Are you sure you want to delete your account? This action cannot be undone.')) {
                                                alert('Account deletion request submitted.');
                                            }
                                        }}
                                        className="w-full p-2 text-left text-sm text-danger hover:bg-bg-hover rounded transition-colors"
                                    >
                                        Delete Account
                                    </button>
                                </div>
                            </div>

                            {/* About */}
                            <div className="pt-4 border-t border-border-weak">
                                <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-3">About</h4>
                                <p className="text-sm text-text-secondary">AXIO AI Platform v1.0.0</p>
                                <p className="text-xs text-text-muted mt-1">© 2024 AXIO. All rights reserved.</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
            {/* Email Debugger Modal */}
            <EmailDebugger isOpen={showEmailDebugger} onClose={() => setShowEmailDebugger(false)} />
        </>
    );
};

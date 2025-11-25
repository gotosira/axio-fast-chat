import React from 'react';
import { FadeInText } from './FadeInText';

export const NotificationPanel = ({ isOpen, onClose, notifications, onMarkAsRead, onMarkAllAsRead }) => {
    if (!isOpen) return null;

    const getIcon = (type) => {
        switch (type) {
            case 'feature':
                return (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="12" y1="8" x2="12" y2="12"></line>
                        <line x1="12" y1="16" x2="12.01" y2="16"></line>
                    </svg>
                );
            case 'update':
                return (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="23 4 23 10 17 10"></polyline>
                        <polyline points="1 20 1 14 7 14"></polyline>
                        <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
                    </svg>
                );
            case 'success':
                return (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                );
            case 'system': // Added for new notification type
                return (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="2" ry="2"></rect><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                );
            case 'message': // Added for new notification type
                return (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                );
            default:
                return null;
        }
    };

    const unreadCount = notifications.filter(notif => notif.unread).length;

    const handleNotificationClick = (id) => {
        onMarkAsRead(id);
        // Optionally, add logic to navigate or show details
    };

    return (
        <div className={`fixed inset-y-0 right-0 z-50 w-80 bg-panel border-l border-border-weak transform transition-transform duration-300 ease-in-out ${isOpen ? 'translate-x-0' : 'translate-x-full'} flex flex-col`}>
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-border-weak">
                <div className="flex items-center gap-2">
                    <h2 className="font-semibold text-text-primary">Notifications</h2>
                    {unreadCount > 0 && (
                        <span className="px-2 py-0.5 text-xs font-medium bg-color-brand text-white rounded-full">
                            {unreadCount}
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    {unreadCount > 0 && (
                        <button
                            onClick={onMarkAllAsRead}
                            className="text-xs font-medium text-color-brand hover:text-color-brand-600 transition-colors"
                        >
                            Mark all read
                        </button>
                    )}
                    <button onClick={onClose} className="p-1 hover:bg-bg-hover rounded-md text-text-muted transition-colors">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto">
                {notifications.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-text-muted opacity-60 p-8">
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="mb-3">
                            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                            <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
                        </svg>
                        <p className="text-sm font-medium">No notifications</p>
                        <p className="text-xs mt-1 text-center">You're all caught up!</p>
                    </div>
                ) : (
                    <div className="divide-y divide-border-weak">
                        {notifications.map((notification) => (
                            <FadeInText
                                as="div"
                                key={notification.id}
                                onClick={() => handleNotificationClick(notification.id)}
                                className={`p-4 border-b border-border-weak cursor-pointer transition-colors ${notification.unread ? 'bg-bg-active' : 'hover:bg-bg-hover'
                                    }`}
                            >
                                <div className="flex gap-3">
                                    <div className={`mt-1 p-1.5 rounded-full ${notification.type === 'system' ? 'bg-bg-hover text-text-secondary' :
                                        notification.type === 'message' ? 'bg-bg-hover text-color-brand' :
                                            'bg-bg-hover text-success'
                                        }`}>
                                        {getIcon(notification.type)}
                                    </div>
                                    <div className="flex-1">
                                        <p className={`text-sm ${notification.unread ? 'font-semibold text-text-primary' : 'text-text-secondary'}`}>
                                            {notification.title}
                                        </p>
                                        <p className="text-xs text-text-muted mt-1">
                                            {notification.message}
                                        </p>
                                        <p className="text-[10px] text-text-muted mt-2">
                                            {notification.time}
                                        </p>
                                    </div>
                                    {notification.unread && (
                                        <div className="w-2 h-2 rounded-full bg-color-brand mt-2 flex-shrink-0" />
                                    )}
                                </div>
                            </FadeInText>
                        ))}
                    </div>
                )}
            </div>

            {notifications.length > 0 && (
                <div className="p-3 border-t border-border-weak bg-panel">
                    <button
                        onClick={onMarkAllAsRead}
                        className="w-full py-2 text-sm text-color-brand hover:text-color-brand-600 font-medium transition-colors"
                    >
                        Mark all as read
                    </button>
                </div>
            )}
        </div>
    );
};

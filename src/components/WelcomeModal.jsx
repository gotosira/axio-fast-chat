import React from 'react';
import { FadeInText } from './FadeInText.jsx';

export const WelcomeModal = ({ isOpen, onClose, aiAssistants, onSelectAI }) => {
    if (!isOpen) return null;

    const assistantsList = Object.values(aiAssistants || {});

    return (
        <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-app backdrop-blur-sm animate-in fade-in duration-500">

            {/* Semi-transparent overlay */}
            <div className="absolute inset-0 bg-black/20 dark:bg-black/60" onClick={onClose} />

            {/* Main Content Card */}
            <FadeInText
                as="div"
                direction="up"
                durationMs={500}
                className="relative z-10 w-full max-w-4xl mx-4 bg-panel border border-border-weak rounded-2xl shadow-2xl p-8 sm:p-12"
            >
                <div className="text-center mb-8">
                    <h1 className="text-3xl sm:text-4xl font-bold text-text-primary mb-3">
                        Choose Your AI Assistant
                    </h1>
                    <p className="text-text-secondary text-base sm:text-lg">
                        Select an AI to start your conversation
                    </p>
                </div>

                {/* Profile Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-6 mb-8">
                    {assistantsList.map((ai) => (
                        <div
                            key={ai.id}
                            onClick={() => {
                                onSelectAI(ai.id);
                                onClose();
                            }}
                            className="group flex flex-col items-center gap-3 cursor-pointer p-4 rounded-xl 
                         hover:bg-bg-hover transition-all duration-200 
                         hover:scale-105"
                        >
                            {/* Avatar Container */}
                            <div className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-full overflow-hidden 
                            border-2 border-border-weak group-hover:border-brand 
                            transition-all duration-200 shadow-lg">
                                <img
                                    src={ai.avatar}
                                    alt={ai.name}
                                    className="w-full h-full object-contain bg-white dark:bg-neutral-800"
                                />
                            </div>

                            {/* Name and Description */}
                            <div className="text-center">
                                <h3 className="text-text-primary font-semibold text-sm sm:text-base 
                              group-hover:text-brand transition-colors">
                                    {ai.name}
                                </h3>
                                <p className="text-text-muted text-xs sm:text-sm mt-1">
                                    {ai.description}
                                </p>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Footer */}
                <div className="text-center">
                    <button
                        onClick={onClose}
                        className="text-text-muted hover:text-text-primary text-sm transition-colors"
                    >
                        Skip for now
                    </button>
                </div>
            </FadeInText>
        </div>
    );
};

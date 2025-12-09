import React from 'react';
import { X } from 'lucide-react';

/**
 * Mini modal for confirming image generation intent
 * Appears near chatbar when image-related keywords are detected
 */
export default function ImageGenerationModal({ prompt, onImageGen, onRegularChat, onDismiss }) {
    return (
        <div className="fixed inset-0 z-50 flex items-end justify-center pb-32 pointer-events-none">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/20 pointer-events-auto animate-in fade-in duration-200"
                onClick={onDismiss}
            />

            {/* Modal */}
            <div className="relative pointer-events-auto bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full mx-4 p-6 animate-in slide-in-from-bottom-4 duration-300">
                {/* Close button */}
                <button
                    onClick={onDismiss}
                    className="absolute top-3 right-3 p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    aria-label="Close"
                >
                    <X className="w-4 h-4 text-gray-500" />
                </button>

                {/* Icon */}
                <div className="flex justify-center mb-4">
                    <div className="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                        <span className="text-2xl">🎨</span>
                    </div>
                </div>

                {/* Title */}
                <h3 className="text-lg font-semibold text-center mb-2 text-gray-900 dark:text-gray-100">
                    ต้องการสร้างภาพไหมครับ?
                </h3>

                {/* Description */}
                <p className="text-sm text-gray-600 dark:text-gray-400 text-center mb-6">
                    FlowFlow สามารถ<span className="font-semibold text-blue-600 dark:text-blue-400"> สร้างภาพ</span> ตาม AXIO Design System หรือ<span className="font-semibold text-gray-700 dark:text-gray-300"> ตอบคำถาม</span>แบบปกติ
                </p>

                {/* Action buttons */}
                <div className="flex gap-3">
                    <button
                        onClick={onImageGen}
                        className="flex-1 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl transition-colors flex items-center justify-center gap-2"
                    >
                        <span>🎨</span>
                        <span>สร้างภาพ</span>
                    </button>

                    <button
                        onClick={onRegularChat}
                        className="flex-1 px-4 py-3 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-900 dark:text-gray-100 font-medium rounded-xl transition-colors flex items-center justify-center gap-2"
                    >
                        <span>💬</span>
                        <span>ตอบปกติ</span>
                    </button>
                </div>

                {/* Auto-dismiss hint */}
                <p className="text-xs text-gray-400 dark:text-gray-500 text-center mt-4">
                    จะปิดอัตโนมัติใน 10 วินาที
                </p>
            </div>
        </div>
    );
}

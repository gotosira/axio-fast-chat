import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import mammoth from 'mammoth';

export const FilePreview = ({ file, onClose }) => {
    const [content, setContent] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!file) return;

        const loadContent = async () => {
            setLoading(true);
            setError(null);
            setContent(null);

            try {
                console.log('FilePreview received file:', file);
                const { mimeType, name } = file;
                let { data } = file;

                // Handle case where storage_url contains a JSON-stringified file object (old format)
                if (data && typeof data === 'string' && data.startsWith('{')) {
                    try {
                        const parsed = JSON.parse(data);
                        if (parsed.data) {
                            data = parsed.data;
                        } else if (parsed.storage_url) {
                            data = parsed.storage_url;
                        }
                    } catch (e) {
                        console.error('Failed to parse JSON:', e);
                    }
                }

                // Strip data URI prefix if present
                if (data && data.includes(',')) {
                    data = data.split(',')[1];
                }

                // Helper to convert base64 to ArrayBuffer
                const base64ToArrayBuffer = (base64) => {
                    const binaryString = window.atob(base64);
                    const len = binaryString.length;
                    const bytes = new Uint8Array(len);
                    for (let i = 0; i < len; i++) {
                        bytes[i] = binaryString.charCodeAt(i);
                    }
                    return bytes.buffer;
                };

                // 1. Images
                if (mimeType.startsWith('image/')) {
                    // Check if data is a URL or base64
                    const isUrl = data && (data.startsWith('http') || data.startsWith('/'));
                    const imageSrc = isUrl ? data : `data:${mimeType};base64,${data}`;

                    setContent(
                        <div className="flex items-center justify-center w-full h-full p-8">
                            <img
                                src={imageSrc}
                                alt={name}
                                className="max-w-full max-h-[calc(90vh-120px)] object-contain rounded-lg"
                            />
                        </div>
                    );
                }
                // 2. PDF
                else if (mimeType === 'application/pdf') {
                    setContent(
                        <iframe
                            src={`data:application/pdf;base64,${data}`}
                            className="w-full h-[calc(90vh-120px)] rounded-lg border-0"
                            title={name}
                        />
                    );
                }
                // 3. Text / Code / JSON
                else if (mimeType.startsWith('text/') || mimeType === 'application/json' || mimeType.includes('javascript') || mimeType.includes('xml')) {
                    const decoder = new TextDecoder('utf-8');
                    const decodedText = decoder.decode(base64ToArrayBuffer(data));

                    setContent(
                        <div className="w-full h-[calc(90vh-120px)] overflow-auto bg-surface-0 dark:bg-[#0d1117] rounded-lg border border-border-weak">
                            <pre className="p-6 text-sm font-mono text-text-primary whitespace-pre-wrap break-words">{decodedText}</pre>
                        </div>
                    );
                }
                // 4. Excel / CSV
                else if (mimeType.includes('spreadsheet') || mimeType.includes('excel') || mimeType === 'text/csv' || name.endsWith('.csv') || name.endsWith('.xlsx') || name.endsWith('.xls')) {
                    const ab = base64ToArrayBuffer(data);
                    const wb = XLSX.read(ab, { type: 'array' });
                    const wsname = wb.SheetNames[0];
                    const ws = wb.Sheets[wsname];
                    const jsonData = XLSX.utils.sheet_to_json(ws, { header: 1 });

                    setContent(
                        <div className="w-full h-[calc(90vh-120px)] overflow-auto bg-panel rounded-lg border border-border-weak">
                            <table className="min-w-full border-collapse text-sm text-left">
                                <thead className="sticky top-0 bg-bg-active">
                                    <tr>
                                        {jsonData[0]?.map((header, i) => (
                                            <th key={i} className="border-b border-border-weak px-4 py-3 font-semibold text-text-primary">
                                                {header || `Col ${i + 1}`}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {jsonData.slice(1).map((row, i) => (
                                        <tr key={i} className="hover:bg-bg-hover border-b border-border-weak last:border-0 text-text-secondary">
                                            {row.map((cell, j) => (
                                                <td key={j} className="px-4 py-2.5 truncate max-w-xs border-r border-border-weak last:border-0">
                                                    {cell !== null && cell !== undefined ? String(cell) : ''}
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    );
                }
                // 5. Word Documents
                else if (mimeType.includes('wordprocessingml') || name.endsWith('.docx')) {
                    const ab = base64ToArrayBuffer(data);
                    const result = await mammoth.convertToHtml({ arrayBuffer: ab });
                    setContent(
                        <div className="w-full h-[calc(90vh-120px)] overflow-auto bg-panel p-8 rounded-lg border border-border-weak prose prose-slate dark:prose-invert max-w-none">
                            <div dangerouslySetInnerHTML={{ __html: result.value }} />
                        </div>
                    );
                }
                // Fallback
                else {
                    throw new Error('Preview not supported for this file type');
                }

            } catch (err) {
                console.error('Preview error:', err);
                setError(true);
            } finally {
                setLoading(false);
            }
        };

        loadContent();
    }, [file]);

    if (!file) return null;

    // Get file icon based on type
    const getFileIcon = () => {
        const { mimeType, name } = file;

        if (mimeType.startsWith('image/')) {
            return (
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                    <circle cx="8.5" cy="8.5" r="1.5"></circle>
                    <polyline points="21 15 16 10 5 21"></polyline>
                </svg>
            );
        } else if (mimeType === 'application/pdf') {
            return (
                <svg className="w-5 h-5 text-red-500" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                    <polyline points="14 2 14 8 20 8"></polyline>
                </svg>
            );
        } else if (mimeType.includes('spreadsheet') || mimeType.includes('excel') || mimeType === 'text/csv') {
            return (
                <svg className="w-5 h-5 text-green-600" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                    <polyline points="14 2 14 8 20 8"></polyline>
                </svg>
            );
        } else if (mimeType.includes('word')) {
            return (
                <svg className="w-5 h-5 text-blue-600" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                    <polyline points="14 2 14 8 20 8"></polyline>
                </svg>
            );
        } else {
            return (
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path>
                    <polyline points="13 2 13 9 20 9"></polyline>
                </svg>
            );
        }
    };

    const handleDownload = async (e) => {
        e.stopPropagation();

        try {
            if (file.isUrl) {
                // For URL-based images, fetch and download
                const response = await fetch(file.data);
                const blob = await response.blob();
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = file.name || 'download';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(url);
            } else {
                // For base64 data
                const link = document.createElement('a');
                link.href = `data:${file.mimeType};base64,${file.data}`;
                link.download = file.name;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            }
        } catch (error) {
            console.error('Download failed:', error);
            // Fallback: open in new tab
            window.open(file.isUrl ? file.data : `data:${file.mimeType};base64,${file.data}`, '_blank');
        }
    };

    return (
        <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
            onClick={onClose}
        >
            <div
                className="relative w-[90vw] max-w-6xl bg-panel rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-border-weak bg-app">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                        {getFileIcon()}
                        <div className="flex-1 min-w-0">
                            <h2 className="text-sm font-medium text-text-primary truncate">{file.name}</h2>
                            <p className="text-xs text-text-muted">{file.mimeType}</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleDownload}
                            className="p-2 hover:bg-bg-hover rounded-md text-text-muted hover:text-text-primary transition-colors"
                            title="Download"
                        >
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                <polyline points="7 10 12 15 17 10"></polyline>
                                <line x1="12" y1="15" x2="12" y2="3"></line>
                            </svg>
                        </button>
                        <button
                            onClick={onClose}
                            className="p-2 hover:bg-bg-hover rounded-md text-text-muted hover:text-text-primary transition-colors"
                            title="Close"
                        >
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <line x1="18" y1="6" x2="6" y2="18"></line>
                                <line x1="6" y1="6" x2="18" y2="18"></line>
                            </svg>
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-hidden bg-app">
                    {loading ? (
                        <div className="flex items-center justify-center h-full">
                            <div className="flex flex-col items-center gap-3">
                                <div className="w-10 h-10 border-4 border-border-weak border-t-color-brand rounded-full animate-spin"></div>
                                <p className="text-sm text-text-muted">Loading preview...</p>
                            </div>
                        </div>
                    ) : error ? (
                        <div className="flex items-center justify-center h-full p-12">
                            <div className="text-center max-w-md">
                                <div className="w-20 h-20 mx-auto mb-4 bg-bg-hover rounded-2xl flex items-center justify-center text-text-muted">
                                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                        <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path>
                                        <polyline points="13 2 13 9 20 9"></polyline>
                                    </svg>
                                </div>
                                <h3 className="text-lg font-semibold text-text-primary mb-2">Preview unavailable</h3>
                                <p className="text-sm text-text-muted mb-6">This file type cannot be previewed</p>
                                <button
                                    onClick={handleDownload}
                                    className="px-6 py-2.5 bg-color-brand text-white rounded-lg hover:bg-color-brand-600 transition-colors font-medium inline-flex items-center gap-2"
                                >
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                        <polyline points="7 10 12 15 17 10"></polyline>
                                        <line x1="12" y1="15" x2="12" y2="3"></line>
                                    </svg>
                                    Download File
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="w-full h-full p-6">
                            {content}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

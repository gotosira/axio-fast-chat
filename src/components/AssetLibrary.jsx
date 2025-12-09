import React, { useState, useEffect } from 'react';
import { FadeInText } from './FadeInText';

export const AssetLibrary = ({ assets, isOpen, onClose, onSelectAsset, onDeleteAsset, onPreview, onRenameAsset }) => {
    const [editingId, setEditingId] = useState(null);
    const [editingName, setEditingName] = useState('');
    const [localAssets, setLocalAssets] = useState(assets);

    // Sync localAssets with assets prop, but not while editing
    useEffect(() => {
        // Don't sync if we're currently editing a file
        if (editingId !== null) return;
        setLocalAssets(assets);
    }, [assets, editingId]);
    if (!isOpen) return null;

    return (
        <div className="fixed inset-y-0 right-0 w-80 bg-surface-base shadow-lv3 transform transition-transform duration-300 ease-in-out z-50 flex flex-col border-l border-outline-base">
            <div className="p-4 border-b border-outline-base flex items-center justify-between bg-neutral-surface">
                <h2 className="font-semibold text-text-base flex items-center gap-2">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-text-on-disabled"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
                    Asset Library
                </h2>
                <button onClick={onClose} className="p-1 hover:bg-neutral-cont-hover rounded-full text-text-on-disabled transition-colors">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {localAssets.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-text-on-disabled opacity-60">
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="mb-3"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
                        <p className="text-sm font-medium">No assets yet</p>
                        <p className="text-xs mt-1 text-center px-6">Upload images or documents in the chat to save them here.</p>
                    </div>
                ) : (
                    localAssets.map((asset) => (
                        <FadeInText
                            key={asset.id}
                            as="div"
                            className="group relative p-3 rounded-xl border border-outline-base bg-surface-base hover:border-outline-hover transition-all"
                        >
                            <div className="flex items-start gap-3">
                                <div className="w-12 h-12 rounded-lg bg-neutral-cont-base flex-shrink-0 overflow-hidden flex items-center justify-center border border-outline-base">
                                    {asset.mime_type.startsWith('image/') ? (
                                        <img src={asset.storage_url.startsWith('data:') ? asset.storage_url : `data:${asset.mime_type};base64,${asset.storage_url}`} alt={asset.filename} className="w-full h-full object-cover" />
                                    ) : (
                                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-text-on-disabled"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>
                                    )}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-0.5">
                                        {editingId === asset.id ? (
                                            <input
                                                type="text"
                                                value={editingName}
                                                onChange={(e) => setEditingName(e.target.value)}
                                                onBlur={() => {
                                                    if (editingName.trim() && editingName !== asset.filename) {
                                                        console.log('🔄 AssetLibrary calling onRenameAsset:', { id: asset.id, newName: editingName.trim(), oldName: asset.filename });
                                                        // Optimistic update
                                                        setLocalAssets(prev => prev.map(a =>
                                                            a.id === asset.id ? { ...a, filename: editingName.trim() } : a
                                                        ));
                                                        onRenameAsset?.(asset.id, editingName.trim());
                                                    }
                                                    setEditingId(null);
                                                }}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') {
                                                        e.target.blur();
                                                    } else if (e.key === 'Escape') {
                                                        setEditingId(null);
                                                    }
                                                }}
                                                className="text-sm font-medium text-text-base px-2 py-1 border border-primary-base rounded focus:outline-none focus:ring-2 focus:ring-primary-base/50 flex-1"
                                                autoFocus
                                                onClick={(e) => e.stopPropagation()}
                                            />
                                        ) : (
                                            <p className="text-sm font-medium text-text-base truncate">{asset.filename}</p>
                                        )}
                                        {asset.source === 'ai_generated' && (
                                            <span className="px-1.5 py-0.5 text-[9px] font-bold bg-color-brand/10 text-color-brand rounded-md uppercase tracking-wider border border-color-brand/20">
                                                AI
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2 text-[10px] text-text-on-disabled">
                                        <span className="uppercase">{asset.mime_type.split('/')[1]}</span>
                                        <span>•</span>
                                        <span>{new Date(asset.created_at).toLocaleDateString()}</span>
                                        {asset.ai_id && (
                                            <>
                                                <span>•</span>
                                                <span className="capitalize text-text-primary">{asset.ai_id}</span>
                                            </>
                                        )}
                                    </div>
                                    {asset.prompt && (
                                        <p className="text-[10px] text-text-secondary mt-1 line-clamp-2 italic border-l-2 border-border-weak pl-1.5">
                                            "{asset.prompt}"
                                        </p>
                                    )}
                                </div>
                            </div>

                            {/* Actions Overlay */}
                            <div className="absolute inset-0 bg-white/90 dark:bg-neutral-800/90 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 rounded-xl backdrop-blur-sm">
                                {/* Attach Button */}
                                <button
                                    onClick={() => onSelectAsset(asset)}
                                    className="p-2 bg-white dark:bg-neutral-700 text-slate-600 dark:text-neutral-300 border border-slate-200 dark:border-neutral-600 rounded-full hover:bg-slate-50 dark:hover:bg-neutral-600 shadow-sm transition-transform hover:scale-110"
                                    title="Attach to chat"
                                >
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path></svg>
                                </button>
                                {/* Edit/Rename Button */}
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setEditingId(asset.id);
                                        setEditingName(asset.filename);
                                    }}
                                    className="p-2 bg-white dark:bg-neutral-700 text-slate-600 dark:text-neutral-300 border border-slate-200 dark:border-neutral-600 rounded-full hover:bg-slate-50 dark:hover:bg-neutral-600 shadow-sm transition-transform hover:scale-110"
                                    title="Rename"
                                >
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                                </button>
                                {/* Preview Button */}
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onPreview && onPreview({
                                            name: asset.filename,
                                            mimeType: asset.mime_type,
                                            data: asset.storage_url
                                        });
                                    }}
                                    className="p-2 bg-white dark:bg-neutral-700 text-slate-600 dark:text-neutral-300 border border-slate-200 dark:border-neutral-600 rounded-full hover:bg-slate-50 dark:hover:bg-neutral-600 shadow-sm transition-transform hover:scale-110"
                                    title="Preview"
                                >
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                                </button>
                                {/* Download Button */}
                                <a
                                    href={asset.storage_url.startsWith('data:') ? asset.storage_url : `data:${asset.mime_type};base64,${asset.storage_url}`}
                                    download={asset.filename}
                                    className="p-2 bg-white dark:bg-neutral-700 text-slate-600 dark:text-neutral-300 border border-slate-200 dark:border-neutral-600 rounded-full hover:bg-slate-50 dark:hover:bg-neutral-600 shadow-sm transition-transform hover:scale-110"
                                    title="Download"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                                </a>
                                {/* Delete Button */}
                                <button
                                    onClick={(e) => { e.stopPropagation(); onDeleteAsset(asset.id); }}
                                    className="p-2 bg-white dark:bg-neutral-700 text-error-base border border-slate-200 dark:border-neutral-600 rounded-full hover:bg-error-bg dark:hover:bg-red-900/30 shadow-sm transition-transform hover:scale-110"
                                    title="Delete"
                                >
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                                </button>
                            </div>
                        </FadeInText>
                    ))
                )}
            </div>
        </div>
    );
};

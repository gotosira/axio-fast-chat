import React, { useState, useEffect } from 'react';
import { FadeInText } from './FadeInText';

export const ConversationSidebar = ({
    conversations,
    currentConversationId,
    onSelectConversation,
    onNewConversation,
    onDeleteConversation,
    onRenameConversation,
    isOpen,
    onClose,
    selectedAI,
    aiAssistants,
    onSelectAI
}) => {
    const [editingId, setEditingId] = useState(null);
    const [editTitle, setEditTitle] = useState('');
    const [contextMenu, setContextMenu] = useState(null);
    const [pinnedAIs, setPinnedAIs] = useState(['baobao', 'deedee']);
    const [isPinnedExpanded, setIsPinnedExpanded] = useState(true);
    const [isAllExpanded, setIsAllExpanded] = useState(true);
    const [aiOrder, setAiOrder] = useState(Object.keys(aiAssistants));
    const [draggedItem, setDraggedItem] = useState(null);
    const [dragOverItem, setDragOverItem] = useState(null);
    const [isInitialLoad, setIsInitialLoad] = useState(true);

    const handleStartEdit = (conv, e) => {
        e.stopPropagation();
        setEditingId(conv.id);
        setEditTitle(conv.title);
    };

    const handleSaveEdit = (id) => {
        if (editTitle.trim()) {
            onRenameConversation(id, editTitle.trim());
        }
        setEditingId(null);
    };

    const handleContextMenu = (e, aiId) => {
        e.preventDefault();
        setContextMenu({
            x: e.clientX,
            y: e.clientY,
            aiId
        });
    };

    const handlePin = (aiId) => {
        if (!pinnedAIs.includes(aiId)) {
            setPinnedAIs([...pinnedAIs, aiId]);
        }
        setContextMenu(null);
    };

    const handleUnpin = (aiId) => {
        setPinnedAIs(pinnedAIs.filter(id => id !== aiId));
        setContextMenu(null);
    };

    const isPinned = (aiId) => pinnedAIs.includes(aiId);

    // Drag and drop handlers
    const handleDragStart = (e, aiId, section) => {
        setDraggedItem({ aiId, section });
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleDragOver = (e, aiId, section) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setDragOverItem({ aiId, section });
    };

    const handleDragLeave = () => {
        setDragOverItem(null);
    };

    const handleDrop = (e, targetAiId, targetSection) => {
        e.preventDefault();

        if (!draggedItem || draggedItem.aiId === targetAiId) {
            setDraggedItem(null);
            setDragOverItem(null);
            return;
        }

        if (targetSection === 'pinned') {
            // Reorder within pinned
            const newPinnedOrder = [...pinnedAIs];
            const draggedIndex = newPinnedOrder.indexOf(draggedItem.aiId);
            const targetIndex = newPinnedOrder.indexOf(targetAiId);

            if (draggedIndex !== -1 && targetIndex !== -1) {
                newPinnedOrder.splice(draggedIndex, 1);
                newPinnedOrder.splice(targetIndex, 0, draggedItem.aiId);
                setPinnedAIs(newPinnedOrder);
            }
        } else if (targetSection === 'all') {
            // Reorder within all assistants
            const newOrder = [...aiOrder];
            const draggedIndex = newOrder.indexOf(draggedItem.aiId);
            const targetIndex = newOrder.indexOf(targetAiId);

            if (draggedIndex !== -1 && targetIndex !== -1) {
                newOrder.splice(draggedIndex, 1);
                newOrder.splice(targetIndex, 0, draggedItem.aiId);
                setAiOrder(newOrder);
            }
        }

        setDraggedItem(null);
        setDragOverItem(null);
    };

    const handleDragEnd = () => {
        setDraggedItem(null);
        setDragOverItem(null);
    };

    // Get ordered AI list
    const getOrderedAIs = () => {
        return aiOrder.map(id => aiAssistants[id]).filter(Boolean);
    };

    const getOrderedPinnedAIs = () => {
        return pinnedAIs.map(id => aiAssistants[id]).filter(Boolean);
    };

    // Calculate if an item should shift to make room for drag
    const shouldShiftRight = (currentAiId, section) => {
        if (!draggedItem || !dragOverItem || draggedItem.section !== section || dragOverItem.section !== section) {
            return false;
        }

        const list = section === 'pinned' ? pinnedAIs : aiOrder;
        const draggedIndex = list.indexOf(draggedItem.aiId);
        const hoverIndex = list.indexOf(dragOverItem.aiId);
        const currentIndex = list.indexOf(currentAiId);

        // Don't shift the dragged item itself
        if (currentAiId === draggedItem.aiId) return false;

        // If dragging forward (left to right), shift items between drag and hover
        if (draggedIndex < hoverIndex) {
            return currentIndex > draggedIndex && currentIndex <= hoverIndex;
        }

        // If dragging backward (right to left), shift items between hover and drag
        if (draggedIndex > hoverIndex) {
            return currentIndex >= hoverIndex && currentIndex < draggedIndex;
        }

        return false;
    };

    // Load preferences from database on mount
    useEffect(() => {
        const loadPreferences = async () => {
            try {
                const response = await fetch('/api/preferences?user_id=default_user');
                if (response.ok) {
                    const prefs = await response.json();
                    if (prefs.pinned_ais && Array.isArray(prefs.pinned_ais)) {
                        setPinnedAIs(prefs.pinned_ais);
                    }
                    if (prefs.ai_order && Array.isArray(prefs.ai_order)) {
                        setAiOrder(prefs.ai_order);
                    }
                }
            } catch (error) {
                console.warn('Could not load preferences, using defaults');
            } finally {
                setIsInitialLoad(false);
            }
        };
        loadPreferences();
    }, []);

    // Save preferences when they change (skip initial load)
    useEffect(() => {
        if (isInitialLoad) return;

        const savePreferences = async () => {
            try {
                await fetch('/api/preferences', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        user_id: 'default_user',
                        pinned_ais: pinnedAIs,
                        ai_order: aiOrder
                    })
                });
            } catch (error) {
                console.warn('Could not save preferences');
            }
        };

        const timeoutId = setTimeout(savePreferences, 500);
        return () => clearTimeout(timeoutId);
    }, [pinnedAIs, aiOrder, isInitialLoad]);

    return (
        <>
            <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-panel border-r border-border-weak transform transition-transform duration-300 ease-in-out ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}>
                <div className="flex flex-col h-full">
                    {/* Header */}
                    <div className="flex items-center justify-between px-4 h-[60px] border-b border-border-weak">
                        <h2 className="font-semibold text-text-primary flex items-center gap-2">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                            Conversations
                        </h2>
                        <button onClick={onClose} className="p-1 hover:bg-bg-hover rounded-md text-text-muted transition-colors sm:hidden">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        </button>
                    </div>

                    {/* Pinned AIs Section */}
                    <div className="border-b border-border-weak">
                        <button
                            onClick={() => setIsPinnedExpanded(!isPinnedExpanded)}
                            className="w-full px-4 pt-3 pb-2 flex items-center justify-between hover:bg-bg-hover transition-colors"
                        >
                            <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider">Pinned</h3>
                            <svg
                                width="14"
                                height="14"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                className={`transition-transform ${isPinnedExpanded ? 'rotate-0' : '-rotate-90'}`}
                            >
                                <polyline points="6 9 12 15 18 9"></polyline>
                            </svg>
                        </button>
                        {isPinnedExpanded && (
                            <div className="px-4 pb-2">
                                <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1" role="list">
                                    {getOrderedPinnedAIs().map((ai) => {
                                        const isBeingDragged = draggedItem?.aiId === ai.id;
                                        const isDropTarget = dragOverItem?.aiId === ai.id && dragOverItem?.section === 'pinned';
                                        const shouldShift = shouldShiftRight(ai.id, 'pinned');

                                        return (
                                            <button
                                                key={ai.id}
                                                draggable
                                                onDragStart={(e) => handleDragStart(e, ai.id, 'pinned')}
                                                onDragOver={(e) => handleDragOver(e, ai.id, 'pinned')}
                                                onDragLeave={handleDragLeave}
                                                onDrop={(e) => handleDrop(e, ai.id, 'pinned')}
                                                onDragEnd={handleDragEnd}
                                                onClick={() => onSelectAI(ai.id)}
                                                onContextMenu={(e) => handleContextMenu(e, ai.id)}
                                                className={`
                                                flex-shrink-0 p-2 rounded-lg cursor-pointer
                                                ${selectedAI === ai.id
                                                        ? 'bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 shadow-sm'
                                                        : 'bg-bg-base hover:bg-bg-hover text-text-secondary hover:shadow-md'
                                                    }
                                                ${isDropTarget ? 'ring-2 ring-blue-400 shadow-lg' : ''}
                                                ${isBeingDragged ? 'opacity-40 scale-95' : 'hover:scale-[1.02]'}
                                            `}
                                                style={{
                                                    transform: shouldShift ? 'translateX(48px)' : 'translateX(0)',
                                                    transition: shouldShift ? 'transform 150ms ease-out' : 'opacity 150ms, box-shadow 150ms, transform 150ms ease-out',
                                                    willChange: shouldShift ? 'transform' : 'auto'
                                                }}
                                                title={`${ai.name} - Drag to reorder`}
                                                aria-label={`${ai.name}, ${isPinned(ai.id) ? 'pinned' : 'not pinned'}`}
                                                role="listitem"
                                            >
                                                <img
                                                    src={ai.avatar}
                                                    alt={ai.name}
                                                    className="w-8 h-8 rounded-full object-cover pointer-events-none"
                                                    style={{ objectPosition: 'center 30%', transform: 'scale(1.5)' }}
                                                    draggable="false"
                                                />
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* AI Selector Carousel */}
                    <div className="">
                        <button
                            onClick={() => setIsAllExpanded(!isAllExpanded)}
                            className="w-full px-4 pt-3 pb-2 flex items-center justify-between hover:bg-bg-hover transition-colors"
                            aria-expanded={isAllExpanded}
                            aria-controls="all-assistants-list"
                        >
                            <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider">All Assistants</h3>
                            <svg
                                width="14"
                                height="14"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                className={`transition-transform duration-200 ${isAllExpanded ? 'rotate-0' : '-rotate-90'}`}
                                aria-hidden="true"
                            >
                                <polyline points="6 9 12 15 18 9"></polyline>
                            </svg>
                        </button>
                        {isAllExpanded && (
                            <div className="px-4 pb-2" id="all-assistants-list">
                                <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1" role="list">
                                    {getOrderedAIs().map((ai) => {
                                        const isBeingDragged = draggedItem?.aiId === ai.id;
                                        const isDropTarget = dragOverItem?.aiId === ai.id && dragOverItem?.section === 'all';
                                        const shouldShift = shouldShiftRight(ai.id, 'all');

                                        return (
                                            <button
                                                key={ai.id}
                                                draggable
                                                onDragStart={(e) => handleDragStart(e, ai.id, 'all')}
                                                onDragOver={(e) => handleDragOver(e, ai.id, 'all')}
                                                onDragLeave={handleDragLeave}
                                                onDrop={(e) => handleDrop(e, ai.id, 'all')}
                                                onDragEnd={handleDragEnd}
                                                onClick={() => onSelectAI(ai.id)}
                                                onContextMenu={(e) => handleContextMenu(e, ai.id)}
                                                className={`
                                                flex-shrink-0 flex flex-col items-center gap-2 p-2 rounded-lg 
                                                min-w-[4rem] cursor-pointer
                                                ${selectedAI === ai.id
                                                        ? 'bg-bg-active text-text-primary shadow-sm'
                                                        : 'text-text-muted hover:bg-bg-hover hover:text-text-primary hover:shadow-md'
                                                    }
                                                ${isDropTarget ? 'ring-2 ring-blue-400 shadow-lg' : ''}
                                                ${isBeingDragged ? 'opacity-40 scale-95' : 'hover:scale-[1.02]'}
                                            `}
                                                style={{
                                                    transform: shouldShift ? 'translateX(72px)' : 'translateX(0)',
                                                    transition: shouldShift ? 'transform 150ms ease-out' : 'opacity 150ms, box-shadow 150ms, transform 150ms ease-out',
                                                    willChange: shouldShift ? 'transform' : 'auto'
                                                }}
                                                title={`${ai.name} - ${ai.description}. Drag to reorder`}
                                                aria-label={`${ai.name}, ${ai.description}`}
                                                role="listitem"
                                            >
                                                <img
                                                    src={ai.avatar}
                                                    alt={ai.name}
                                                    className="w-10 h-10 rounded-full object-cover pointer-events-none"
                                                    style={{ objectPosition: 'center 30%', transform: 'scale(1.5)' }}
                                                    draggable="false"
                                                />
                                                <span className="text-[10px] font-medium w-full text-center mt-3 select-none">
                                                    {ai.name}
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* New Chat Button */}
                    <div className="px-4 pb-3">
                        <button
                            onClick={onNewConversation}
                            className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-btn-bg hover:bg-bg-hover text-text-primary text-sm font-medium rounded-md border border-btn-border transition-colors"
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                            New Chat
                        </button>
                    </div>

                    {/* Conversation List */}
                    <div className="flex-1 overflow-y-auto px-2 pb-4 space-y-1">
                        {conversations.map((conv) => (
                            <div
                                key={conv.id}
                                onClick={() => onSelectConversation(conv.id)}
                                className={`group relative flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-all ${currentConversationId === conv.id
                                    ? 'bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 shadow-sm border-l-[3px] border-blue-600'
                                    : 'text-text-secondary hover:bg-bg-hover hover:text-text-primary border-l-[3px] border-transparent'
                                    }`}
                            >
                                <div className="flex-1 min-w-0">
                                    {editingId === conv.id ? (
                                        <input
                                            type="text"
                                            value={editTitle}
                                            onChange={(e) => setEditTitle(e.target.value)}
                                            onBlur={() => handleSaveEdit(conv.id)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') handleSaveEdit(conv.id);
                                                if (e.key === 'Escape') setEditingId(null);
                                            }}
                                            autoFocus
                                            className="w-full bg-transparent border border-border-weak rounded px-1 py-0.5 text-sm focus:outline-none focus:border-color-brand"
                                            onClick={(e) => e.stopPropagation()}
                                        />
                                    ) : (
                                        <>
                                            <p className="text-sm font-medium truncate">
                                                {conv.title || 'New Conversation'}
                                            </p>
                                            <p className="text-xs text-text-muted truncate mt-0.5">
                                                {new Date(conv.updated_at).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })}
                                            </p>
                                        </>
                                    )}
                                </div>

                                {editingId !== conv.id && (
                                    <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button
                                            onClick={(e) => handleStartEdit(conv, e)}
                                            className="p-1 hover:bg-bg-hover rounded text-text-muted hover:text-text-primary transition-colors"
                                            title="Rename"
                                        >
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                                        </button>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onDeleteConversation(conv.id);
                                            }}
                                            className="p-1 hover:bg-bg-hover rounded text-text-muted hover:text-danger transition-colors"
                                            title="Delete"
                                        >
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                                        </button>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            </aside>

            {/* Context Menu */}
            {contextMenu && (
                <>
                    <div
                        className="fixed inset-0 z-40"
                        onClick={() => setContextMenu(null)}
                    />
                    <div
                        className="fixed z-50 bg-panel border border-border-weak rounded-lg shadow-lg py-1 min-w-[150px]"
                        style={{
                            left: `${contextMenu.x}px`,
                            top: `${contextMenu.y}px`
                        }}
                    >
                        {isPinned(contextMenu.aiId) ? (
                            <button
                                onClick={() => handleUnpin(contextMenu.aiId)}
                                className="w-full px-4 py-2 text-left text-sm hover:bg-bg-hover transition-colors flex items-center gap-2"
                            >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="2" y1="12" x2="22" y2="12"></line>
                                </svg>
                                Unpin
                            </button>
                        ) : (
                            <button
                                onClick={() => handlePin(contextMenu.aiId)}
                                className="w-full px-4 py-2 text-left text-sm hover:bg-bg-hover transition-colors flex items-center gap-2"
                            >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M12 17v5"></path>
                                    <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a3 3 0 0 0-6 0v3.76z"></path>
                                </svg>
                                Pin
                            </button>
                        )}
                    </div>
                </>
            )}
        </>
    );
};

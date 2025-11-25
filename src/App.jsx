import React, { useState, useRef, useEffect, useLayoutEffect, memo, createContext, useContext } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { v4 as uuidv4 } from 'uuid';
import { FadeInText } from './components/FadeInText.jsx';
import { AssetLibrary } from './components/AssetLibrary.jsx';
import { FilePreview } from './components/FilePreview.jsx';
import { ConversationSidebar } from './components/ConversationSidebar.jsx';
import { NotificationPanel } from './components/NotificationPanel.jsx';
import { ProfilePanel } from './components/ProfilePanel.jsx';
import { useConversations } from './hooks/useConversations.js';
import { ChevronRight, FileText, X, Plus, MoreHorizontal, Mic, Send, Menu, Bell, Server, PanelLeft } from 'lucide-react';
import { McpConnectionModal } from './components/McpConnectionModal.jsx';

/* -------------------------------------------------------------------------- */
/* 1. LOGIC HOOK                               */
/* -------------------------------------------------------------------------- */

function useFastChat(callbacks, { currentConversationId, createConversation, setCurrentConversationId, selectedAI, saveMessage }) {
  const [messages, setMessages] = useState([
    {
      id: 'welcome',
      role: 'assistant',
      content: 'สวัสดีครับ! 🐕✨ เบาเบาพร้อมช่วยเรื่อง UX writing แล้วครับ มีอะไรให้ช่วยไหมครับ? 😊',
      status: 'delivered'
    }
  ]);
  // ... (rest of hook body)
  const [isStreaming, setIsStreaming] = useState(false);
  const [location, setLocation] = useState(null);
  const abortController = useRef(null);

  // Get user location on mount
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude
          });
        },
        (error) => {
          console.warn('Geolocation error:', error);
        }
      );
    }
  }, []);

  // BaoBao API integration
  const searchKnowledgeBase = async (query) => {
    try {
      const response = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query })
      });
      const data = await response.json();
      return data.results || [];
    } catch (error) {
      console.error('Knowledge base search error:', error);
      return [];
    }
  };

  // BAOBAO RESPONSE: Real Gemini AI with SSE streaming - Shows thinking process!
  const simulateBackendResponse = async (updateFn, userMessage, file = null, aiId = 'baobao') => {
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMessage, file, location, ai_id: aiId, conversation_id: currentConversationId })
      });

      if (!response.ok) {
        throw new Error('Failed to get response from BaoBao API');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let isShowingThinking = false;

      while (true) {
        const { done, value } = await reader.read();

        if (done) break;
        if (abortController.current?.signal.aborted) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);

            if (data === '[DONE]') {
              return;
            }

            try {
              const parsed = JSON.parse(data);

              if (parsed.type === 'thinking' && parsed.text) {
                // Show thinking process with actual content
                if (!isShowingThinking) {
                  updateFn('> ');
                  isShowingThinking = true;
                }
                // Append thought text, ensuring newlines stay in blockquote
                updateFn(parsed.text.replace(/\n/g, '\n> '));
              } else if (parsed.type === 'text' && parsed.text) {
                // End thinking block and start actual response
                if (isShowingThinking) {
                  updateFn('\n\n');
                  isShowingThinking = false;
                }
                updateFn(parsed.text);
              } else if (parsed.type === 'references' && parsed.files) {
                // Pass references separately, don't append to content
                updateFn('', parsed.files);
              } else if (parsed.text) {
                // Fallback for old format
                updateFn(parsed.text);
              }
            } catch (e) {
              // Skip invalid JSON
            }
          }
        }
      }
    } catch (error) {
      console.error('Streaming error:', error);
      updateFn('\n\nขอโทษครับ เกิดข้อผิดพลาดในการเชื่อมต่อ 😅 ลองใหม่อีกครั้งนะครับ!');
    }
  };

  const sendMessage = async (content, file = null) => {
    // Ensure conversation exists
    let conversationId = currentConversationId;
    if (!conversationId) {
      const newId = uuidv4();
      console.log('Auto-creating conversation:', newId, 'for AI:', selectedAI);
      await createConversation(newId, 'New Conversation', selectedAI);
      setCurrentConversationId(newId);
      conversationId = newId;
    }

    const userMsgId = uuidv4();
    const assistantMsgId = uuidv4();

    // Handle file upload if present
    let fileId = null;
    if (file && callbacks && callbacks.onUpload) {
      try {
        console.log('Uploading file before sending message...');
        // If file is already an asset (has ID), use it. Otherwise upload.
        if (file.id && !file.data) { // Assuming existing asset might not have full data or has ID
          fileId = file.id;
        } else {
          const savedFile = await callbacks.onUpload(file);
          if (savedFile) {
            fileId = savedFile.id;
            console.log('File uploaded, ID:', fileId);
          }
        }
      } catch (e) {
        console.error("Failed to upload file:", e);
      }
    }

    // Optimistic UI - Store file separately for thumbnail display
    const userMsg = {
      id: userMsgId,
      role: 'user',
      content: content || 'ภาพนี้คืออะไร',
      file: file, // Store file object for thumbnail rendering
      fileId: fileId, // Store ID for DB saving
      status: 'sent',
      created_at: Date.now()
    };
    const assistantPlaceholder = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      references: null,
      status: 'streaming',
      created_at: Date.now()
    };

    setMessages((prev) => [...prev, userMsg, assistantPlaceholder]);
    setIsStreaming(true);

    try {
      // Save user message directly to ensure it uses the correct conversationId
      await saveMessage({
        id: userMsgId,
        conversation_id: conversationId,
        role: 'user',
        content: content || 'ภาพนี้คืออะไร',
        file_data: file ? JSON.stringify(file) : null,
        file_id: fileId,
        references: null
      }).catch(err => console.error("Failed to save user message:", err));

      // Notify parent component about user message (optional, for other side effects)
      if (callbacks && callbacks.onMessageSent) {
        callbacks.onMessageSent({
          id: userMsgId,
          role: 'user',
          content: content || 'ภาพนี้คืออะไร',
          file: file,
          fileId: fileId // Pass ID
        });
      }

      abortController.current = new AbortController();

      // In a real app, you would fetch() here. We use the simulator with BaoBao.
      let capturedReferences = null;
      let fullContent = '';

      await simulateBackendResponse((chunk, refs) => {
        fullContent += chunk;
        setMessages((prev) => prev.map((msg) => {
          if (msg.id === assistantMsgId) {
            const updates = { ...msg, content: msg.content + chunk };
            if (refs) {
              updates.references = refs;
              capturedReferences = refs;
            }
            return updates;
          }
          return msg;
        }));
      }, content, file, selectedAI); // Pass user message, file, and selected AI

      // Mark finished
      setMessages((prev) => prev.map((msg) =>
        msg.id === assistantMsgId ? { ...msg, status: 'delivered', references: capturedReferences } : msg
      ));

      // Save assistant message directly
      await saveMessage({
        id: assistantMsgId,
        conversation_id: conversationId,
        role: 'assistant',
        content: fullContent,
        references: capturedReferences
      }).catch(err => console.error("Failed to save assistant message:", err));

      // Notify parent component about assistant message (optional)
      if (callbacks && callbacks.onMessageReceived) {
        callbacks.onMessageReceived({
          id: assistantMsgId,
          role: 'assistant',
          content: fullContent,
          references: capturedReferences
        });
      }

    } catch (err) {
      console.error(err);
    } finally {
      setIsStreaming(false);
    }
  };

  const stop = () => {
    if (abortController.current) abortController.current.abort();
    setIsStreaming(false);
    // Mark the last message as stopped/delivered so caret disappears
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (last && last.role === 'assistant') {
        return prev.map(m => m.id === last.id ? { ...m, status: 'stopped' } : m);
      }
      return prev;
    });
  };

  return { messages, setMessages, sendMessage, isStreaming, stop };
}

/* -------------------------------------------------------------------------- */
/* 2. VISUAL COMPONENTS                           */
/* -------------------------------------------------------------------------- */

// A. Code Block Renderer
const CodeBlock = ({ inline, className, children, ...props }) => {
  const [copied, setCopied] = useState(false);
  const match = /language-(\w+)/.exec(className || '');
  const codeContent = String(children).replace(/\n$/, '');

  const handleCopy = async () => {
    await navigator.clipboard.writeText(codeContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (inline) {
    return (
      <code className="bg-neutral-cont-base text-text-base px-1.5 py-0.5 rounded text-sm font-mono" {...props}>
        {children}
      </code>
    );
  }

  return (
    <div className="relative group my-2 rounded-lg overflow-hidden border border-outline-base bg-neutral-surface">
      <div className="flex items-center justify-between px-3 py-1.5 bg-neutral-cont-base border-b border-outline-base">
        <span className="text-xs text-text-on-disabled font-mono lowercase">{match ? match[1] : 'code'}</span>
        <button onClick={handleCopy} className="text-xs text-text-on-disabled hover:text-text-base transition-colors">
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      <div className="p-2 overflow-x-auto">
        <pre {...props} className="text-sm font-mono text-text-base leading-relaxed">{children}</pre>
      </div>
    </div>
  );
};

// Context to pass message state to Markdown components
const MessageContext = createContext(null);

// A.2 Thinking Block Renderer (Auto-expand during streaming, auto-close when done)
const ThinkingBlock = ({ children }) => {
  const { message } = useContext(MessageContext) || {};
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!message) return;

    const hasThought = message.content && message.content.includes('>');
    const lines = message.content?.split('\n') || [];
    const hasAnswer = lines.some(line => line.trim() !== '' && !line.trim().startsWith('>'));

    if (message.status === 'streaming') {
      // During streaming, always open if there's thought content
      if (hasThought) {
        setIsOpen(true);
      }
    } else {
      // Keep open even after finished, unless user closes it manually
      // or we can decide to close it. For now, let's keep it open if it was open.
      // The user request says "show thinking process... real time", implying it should be visible.
      // If we want it to stay visible, we just don't auto-close.
    }
  }, [message?.content, message?.status]);

  return (
    <details
      className="group my-2 rounded-lg border border-border-weak bg-bg-subtle/30 open:bg-bg-subtle/50 transition-colors"
      open={isOpen}
      onToggle={(e) => setIsOpen(e.currentTarget.open)}
    >
      <summary className="flex items-center gap-2 px-3 py-2 cursor-pointer text-xs font-medium text-text-secondary select-none list-none">
        <ChevronRight className="w-3.5 h-3.5 transition-transform group-open:rotate-90" />
        <span>กระบวนการคิด</span>
      </summary>
      <div className="px-3 pb-3 pt-0 text-sm text-text-secondary/90 italic border-t border-border-weak/50 mt-1">
        {children}
      </div>
    </details>
  );
};

// A.3 Table Components
const TableComponents = {
  table: ({ node, ...props }) => (
    <div className="overflow-x-auto my-4 rounded-lg border border-border-weak shadow-sm">
      <table className="min-w-full divide-y divide-border-weak text-sm" {...props} />
    </div>
  ),
  thead: ({ node, ...props }) => (
    <thead className="bg-bg-hover" {...props} />
  ),
  tbody: ({ node, ...props }) => (
    <tbody className="divide-y divide-border-weak bg-panel" {...props} />
  ),
  tr: ({ node, ...props }) => (
    <tr className="transition-colors hover:bg-bg-hover/50" {...props} />
  ),
  th: ({ node, ...props }) => (
    <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wider whitespace-nowrap" {...props} />
  ),
  td: ({ node, ...props }) => (
    <td className="px-4 py-3 text-text-primary whitespace-normal min-w-[150px]" {...props} />
  ),
};

// Date Divider Component
const DateDivider = ({ date }) => {
  const formatDate = (dateStr) => {
    console.log('DateDivider received date:', dateStr, 'Type:', typeof dateStr);
    const d = new Date(dateStr);
    console.log('Parsed date object:', d, 'toDateString:', d.toDateString());
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    // Check if today
    if (d.toDateString() === today.toDateString()) {
      return 'วันนี้';
    }
    // Check if yesterday
    if (d.toDateString() === yesterday.toDateString()) {
      return 'เมื่อวาน';
    }
    // Otherwise show date
    return d.toLocaleDateString('th-TH', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'long'
    });
  };

  return (
    <div className="flex items-center justify-center my-6">
      <div className="px-4 py-1.5 bg-bg-hover rounded-full text-xs font-medium text-text-muted">
        {formatDate(date)}
      </div>
    </div>
  );
};



// Image Component for ReactMarkdown
const ImageComponent = ({ src, alt, ...props }) => {
  // We need to access the onPreview function. 
  // Since we can't easily pass props through ReactMarkdown components without context,
  // we'll use a simple window event or just render it.
  // Ideally, we should put onPreview in MessageContext.

  const { onPreview } = useContext(MessageContext) || {};

  const handleClick = () => {
    if (onPreview) {
      // Construct a file-like object for the preview modal
      onPreview({
        name: alt || 'Image',
        mimeType: 'image/png', // Guessing mime type, or we could just pass src
        data: src, // This might be a URL or base64
        isUrl: true // Flag to tell preview it's a URL
      });
    }
  };

  return (
    <img
      src={src}
      alt={alt}
      onClick={handleClick}
      className="cursor-pointer hover:opacity-90 transition-opacity rounded-lg"
      {...props}
    />
  );
};

// B. MessageRow
const MessageRow = memo(({ message, onPreview, aiContext }) => {
  const isUser = message.role === 'user';
  const isStreaming = message.status === 'streaming';

  return (
    <FadeInText
      as="div"
      direction="up"
      durationMs={400}
      className={`flex w-full mb-6 message-row transition-all duration-200 ${isUser ? 'justify-end' : 'justify-start'}`}
    >
      <div className={`relative text-base message-bubble transition-all duration-200 ${isUser
        ? 'max-w-[85%] sm:max-w-[75%] bg-chat-user px-5 py-3 rounded-2xl rounded-tr-sm text-chat-user-fg'
        : 'max-w-[90%] sm:max-w-[100%] bg-transparent px-0 text-chat-ai-fg'
        }`}
      >
        {!isUser && (
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0 border border-border-weak bg-panel">
              <img
                src={aiContext?.avatar || "/baobao_avatar.png"}
                alt={aiContext?.name || "BaoBao"}
                className="w-full h-full object-cover"
                style={{ objectPosition: 'center 30%', transform: 'scale(1.5)' }}
              />
            </div>
            <span className="font-semibold text-sm text-text-primary">{aiContext?.name || "BaoBao"}</span>
          </div>
        )}

        {/* Show thumbnail if user message has a file */}
        {isUser && message.file && (
          <div
            className="mb-3 rounded-lg overflow-hidden border border-slate-200 bg-white cursor-pointer hover:opacity-90 transition-opacity max-w-xs"
            onClick={() => onPreview && onPreview(message.file)}
          >
            {message.file.mimeType.startsWith('image/') ? (
              <img
                src={`data:${message.file.mimeType};base64,${message.file.data}`}
                alt={message.file.name}
                className="w-full h-auto"
              />
            ) : (
              <div className="p-4 flex items-center gap-3">
                <div className="w-10 h-10 bg-slate-100 rounded flex items-center justify-center">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-800">{message.file.name}</p>
                  <p className="text-xs text-slate-400 uppercase">{message.file.mimeType.split('/')[1]}</p>
                </div>
              </div>
            )}
          </div>
        )}

        <div className={`prose prose-slate max-w-none font-looped prose-p:leading-relaxed prose-pre:p-0 prose-pre:bg-transparent prose-pre:border-none ${isUser ? 'prose-p:my-0' : ''}`}>
          <MessageContext.Provider value={{ message, onPreview }}>
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeRaw]}
              components={{ code: CodeBlock, blockquote: ThinkingBlock, img: ImageComponent, ...TableComponents }}
            >
              {message.content}
            </ReactMarkdown>
          </MessageContext.Provider>
          {isStreaming && (
            <span className="inline-block w-1.5 h-4 bg-slate-400 ml-0.5 align-middle animate-[pulse_1s_ease-in-out_infinite]" />
          )}
        </div>

        {/* Show references if available and relevant */}
        {!isUser && message.references && (() => {
          const refs = message.references.toLowerCase();
          // Don't show if references contain only training/placeholder data
          const irrelevantKeywords = [
            'empty state',
            'placeholder',
            'training',
            'phase',
            'preferred term',
            'medical',
            'tooltip',
            'avoid term'
          ];

          const hasIrrelevantContent = irrelevantKeywords.some(keyword => refs.includes(keyword));
          const hasMinimalContent = message.references.trim().length < 10;

          // Only show if references are meaningful
          if (!hasIrrelevantContent && !hasMinimalContent) {
            return (
              <div className="mt-4 pt-3 border-t border-slate-200 dark:border-neutral-700 text-sm text-slate-500 dark:text-neutral-400">
                📚 <strong>แหล่งอ้างอิง:</strong> {message.references}
              </div>
            );
          }
          return null;
        })()}

        {/* Timestamp */}
        <div className={`text-[10px] mt-1 opacity-70 ${isUser ? 'text-chat-user-fg' : 'text-text-muted'}`}>
          {(message.created_at ? new Date(message.created_at) : new Date()).toLocaleTimeString('th-TH', {
            hour: '2-digit',
            minute: '2-digit'
          })}
        </div>
      </div>
    </FadeInText>
  );
}, (prev, next) => prev.message.content === next.message.content && prev.message.status === next.message.status && prev.message.references === next.message.references);

// C. Composer
const Composer = ({ onSend, isStreaming, onStop, onAssetUpload, onPreview, selectedAsset, onOpenMcpModal }) => {
  const [input, setInput] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);

  // Sync selectedAsset from library to local state if provided
  useEffect(() => {
    if (selectedAsset) {
      setSelectedFile(selectedAsset);
    }
  }, [selectedAsset]);

  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 150)}px`;
  }, [input]);

  useEffect(() => {
    if (!isStreaming) textareaRef.current?.focus();
  }, [isStreaming]);

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = e.target.result.split(',')[1];
      const newFile = {
        id: uuidv4(),
        name: file.name,
        mimeType: file.type,
        data: base64,
        timestamp: Date.now()
      };
      setSelectedFile(newFile);
      onAssetUpload(newFile); // Add to library immediately
    };
    reader.readAsDataURL(file);
  };

  const handleSend = () => {
    if ((input.trim() || selectedFile) && !isStreaming) {
      onSend(input, selectedFile);
      setInput('');
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handlePaste = (e) => {
    const text = e.clipboardData.getData('text');
    if (text.length > 2000) {
      e.preventDefault();

      // Create CSV content
      const rows = text.split('\n').map(line => `"${line.replace(/"/g, '""')}"`).join('\n');
      const blob = new Blob([rows], { type: 'text/csv;charset=utf-8;' });
      const file = new File([blob], "pasted_content.csv", { type: 'text/csv' });

      const reader = new FileReader();
      reader.onload = (e) => {
        const base64 = e.target.result.split(',')[1];
        const newFile = {
          id: uuidv4(),
          name: file.name,
          mimeType: file.type,
          data: base64,
          timestamp: Date.now()
        };
        setSelectedFile(newFile);
        onAssetUpload(newFile);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Drag and drop handlers
  const handleDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    // Only set to false if we're leaving the drop zone entirely
    if (e.currentTarget === e.target) {
      setIsDragging(false);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const file = files[0];
      // Use the existing file select handler
      const fakeEvent = { target: { files: [file] } };
      handleFileSelect(fakeEvent);
    }
  };

  return (
    <FadeInText as="div" direction="up" delayMs={400} className="w-full max-w-3xl mx-auto p-4">
      <div
        className={`relative flex flex-col p-2 rounded-[2rem] border shadow-lv1 hover:shadow-lv2 focus-within:shadow-lv2 transition-all duration-200
          bg-white dark:bg-neutral-800
          ${isDragging
            ? 'border-blue-500 dark:border-blue-400 border-2 shadow-lg scale-[1.02] bg-blue-50/50 dark:bg-blue-900/20'
            : 'border-outline-base dark:border-neutral-700 focus-within:border-outline-hover dark:focus-within:border-neutral-600'
          }`}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >

        {/* Hidden File Input */}
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileSelect}
          className="hidden"
          accept="image/*,.pdf,.csv,.docx,.xlsx,.ppt,.pptx"
        />

        {/* Attached File Card (Inside the box) */}
        {selectedFile && (
          <div className="mx-2 mt-2 mb-1 p-2 bg-neutral-surface dark:bg-neutral-700 rounded-xl border border-neutral-cont-base dark:border-neutral-600 flex items-center gap-3 group animate-in fade-in slide-in-from-bottom-1">
            <div
              className="w-10 h-10 bg-white dark:bg-neutral-600 rounded-lg border border-slate-200 dark:border-neutral-500 flex items-center justify-center text-slate-500 dark:text-neutral-300 cursor-pointer hover:opacity-80 transition-opacity"
              onClick={() => onPreview(selectedFile)}
            >
              {selectedFile.mimeType.startsWith('image/') ? (
                <img src={`data:${selectedFile.mimeType};base64,${selectedFile.data}`} className="w-full h-full object-cover rounded-lg" alt="preview" />
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>
              )}
            </div>
            <div className="flex flex-col flex-1 min-w-0 cursor-pointer" onClick={() => onPreview(selectedFile)}>
              <span className="text-sm font-semibold text-slate-800 dark:text-neutral-100 truncate">{selectedFile.name}</span>
              <span className="text-[10px] font-bold text-slate-400 dark:text-neutral-400 uppercase tracking-wider">{selectedFile.mimeType.split('/')[1]}</span>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); setSelectedFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
              className="p-1.5 hover:bg-slate-200 dark:hover:bg-neutral-600 rounded-full text-slate-400 dark:text-neutral-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          </div>
        )}

        {/* Text Input */}
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={selectedFile ? "Add a message..." : "Ask another question..."}
          rows={1}
          className="w-full max-h-[150px] py-3 px-4 bg-transparent border-none outline-none text-slate-800 dark:text-neutral-100 placeholder:text-slate-400 dark:placeholder:text-neutral-500 resize-none leading-relaxed"
        />

        {/* Toolbar */}
        <div className="flex items-center justify-between px-2 pb-1">
          <div className="flex items-center gap-1">
            {/* Plus Button */}
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-8 h-8 flex items-center justify-center text-slate-400 dark:text-neutral-400 hover:text-slate-600 dark:hover:text-neutral-200 transition-colors rounded-full hover:bg-slate-100 dark:hover:bg-neutral-700"
              title="Upload file"
            >
              <Plus size={20} />
            </button>

            {/* More Options (Dots) */}
            <button
              onClick={onOpenMcpModal}
              className="w-8 h-8 flex items-center justify-center text-slate-400 dark:text-neutral-400 hover:text-slate-600 dark:hover:text-neutral-200 transition-colors rounded-full hover:bg-slate-100 dark:hover:bg-neutral-700"
              title="MCP Connections"
            >
              <MoreHorizontal size={20} />
            </button>

            {/* Microphone */}
            <button className="w-8 h-8 flex items-center justify-center text-slate-400 dark:text-neutral-400 hover:text-slate-600 dark:hover:text-neutral-200 transition-colors rounded-full hover:bg-slate-100 dark:hover:bg-neutral-700">
              <Mic size={20} />
            </button>
          </div>

          {/* Send / Stop Button */}
          {isStreaming ? (
            <button onClick={onStop} className="p-2 rounded-full bg-error-base hover:bg-error-pressed text-error-on-base transition-all shadow-lv1">
              <div className="w-3 h-3 bg-white rounded-[1px] m-1" />
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!input.trim() && !selectedFile}
              className={`p-2 rounded-full transition-all shadow-lv1 ${input.trim() || selectedFile ? 'bg-primary-base text-primary-on-base hover:bg-primary-hover' : 'bg-neutral-cont-base dark:bg-neutral-700 text-neutral-on-cont-base dark:text-neutral-400'}`}
            >
              {/* Arrow Right (Send) */}
              <Send size={20} className="m-0.5" />
            </button>
          )}
        </div>
      </div>

      <div className="text-center mt-2 text-[10px] text-slate-400 dark:text-neutral-500 font-medium tracking-wide opacity-0 focus-within:opacity-100 transition-opacity">
        Return to send · Shift + Return for newline
      </div>
    </FadeInText>
  );
};

/* -------------------------------------------------------------------------- */
/* 3. APP SHELL                                */
/* -------------------------------------------------------------------------- */

export default function App() {
  const scrollRef = useRef(null);

  // Conversation State
  const [currentConversationId, setCurrentConversationId] = useState(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isConversationLoading, setIsConversationLoading] = useState(false);
  const [isMcpModalOpen, setIsMcpModalOpen] = useState(false);

  // AI Selection State (must be before useConversations)
  const [selectedAI, setSelectedAI] = useState('baobao');

  // Reset conversation when AI changes
  useEffect(() => {
    setCurrentConversationId(null);
  }, [selectedAI]);

  const {
    conversations,
    loading,
    loadConversation,
    createConversation,
    renameConversation,
    deleteConversation,
    saveMessage
  } = useConversations(currentConversationId, setCurrentConversationId, selectedAI);

  // Asset Library State & Logic
  const [assets, setAssets] = useState([]);
  const [isAssetLibraryOpen, setIsAssetLibraryOpen] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState(null);
  const [previewFile, setPreviewFile] = useState(null);

  // Notification & Profile Panel State
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);


  // AI Configuration
  const AI_ASSISTANTS = {
    baobao: {
      id: 'baobao',
      name: 'BaoBao',
      avatar: '/avatars/baobao_avatar.png',
      color: 'blue',
      description: 'UX Writing Expert',
      systemPrompt: 'baobao' // Will use existing BaoBao prompt
    },
    deedee: {
      id: 'deedee',
      name: 'DeeDee',
      avatar: '/avatars/deedee-avatar.png',
      color: 'green',
      description: 'Content Strategy Assistant',
      systemPrompt: 'deedee' // To be customized later
    },
    pungpung: {
      id: 'pungpung',
      name: 'PungPung',
      avatar: '/avatars/pungpung-avatar.png',
      color: 'yellow',
      description: 'Creative Writing Helper',
      systemPrompt: 'pungpung' // To be customized later
    },
    flowflow: {
      id: 'flowflow',
      name: 'FlowFlow',
      avatar: '/avatars/flowflow-avatar.png',
      color: 'purple',
      description: 'Workflow Optimizer',
      systemPrompt: 'flowflow' // To be customized later
    }
  };

  // Sample initial notifications
  const initialNotifications = [
    {
      id: 1,
      title: 'New Feature: Asset Library',
      message: 'You can now preview and manage all your uploaded files in the Asset Library.',
      time: '2 hours ago',
      type: 'feature',
      unread: true
    },
    {
      id: 2,
      title: 'Update Available',
      message: 'BaoBao AI has been updated with improved Thai language search.',
      time: '1 day ago',
      type: 'update',
      unread: true
    },
    {
      id: 3,
      title: 'File Upload Success',
      message: 'Your document "convert (1).csv" has been uploaded successfully.',
      time: '2 days ago',
      type: 'success',
      unread: false
    }
  ];

  const [notifications, setNotifications] = useState(() => {
    const saved = localStorage.getItem('baobao_notifications');
    return saved ? JSON.parse(saved) : initialNotifications;
  });

  // Persist notifications
  useEffect(() => {
    localStorage.setItem('baobao_notifications', JSON.stringify(notifications));
  }, [notifications]);

  const unreadCount = notifications.filter(n => n.unread).length;

  const handleMarkAsRead = (id) => {
    setNotifications(prev => prev.map(n =>
      n.id === id ? { ...n, unread: false } : n
    ));
  };

  const handleMarkAllAsRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, unread: false })));
  };

  const loadAssets = async () => {
    try {
      const res = await fetch('/api/assets');
      const data = await res.json();
      setAssets(data);
    } catch (error) {
      console.error('Error loading assets:', error);
    }
  };

  useEffect(() => {
    loadAssets();
  }, []);

  const handleAssetUpload = async (file) => {
    try {
      console.log('Uploading asset:', file.name);
      const res = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file,
          conversation_id: currentConversationId
        })
      });

      if (!res.ok) {
        throw new Error(`Upload failed: ${res.statusText}`);
      }

      const savedFile = await res.json();
      console.log('Asset uploaded successfully:', savedFile);

      // Force reload assets to update the library UI immediately
      await loadAssets();

      return savedFile;
    } catch (error) {
      console.error('Error uploading asset:', error);
      return null;
    }
  };

  const handleDeleteAsset = async (id) => {
    try {
      await fetch(`/api/assets/${id}`, {
        method: 'DELETE'
      });
      await loadAssets();
    } catch (error) {
      console.error('Error deleting asset:', error);
    }
  };

  const handleSelectAsset = (asset) => {
    setSelectedAsset({
      name: asset.filename,
      mimeType: asset.mime_type,
      data: asset.storage_url
    });
    setIsAssetLibraryOpen(false);
  };

  // Chat Hook
  const { messages, setMessages, sendMessage, isStreaming, stop } = useFastChat({
    onMessageSent: async (msg) => {
      // Auto-generate title for first message
      if (messages.length <= 1 && currentConversationId) {
        // ... title generation logic if needed ...
      }

      if (currentConversationId) {
        await saveMessage({
          id: msg.id,
          conversation_id: currentConversationId,
          role: msg.role,
          content: msg.content,
          file_data: msg.file ? JSON.stringify(msg.file) : null,
          file_id: msg.fileId,
          references: msg.references
        });
      }
    },
    onMessageReceived: async (msg) => {
      if (currentConversationId) {
        await saveMessage({
          id: msg.id,
          conversation_id: currentConversationId,
          role: msg.role,
          content: msg.content,
          references: msg.references
        });
      }
    },
    onUpload: handleAssetUpload
  }, { currentConversationId, createConversation, setCurrentConversationId, selectedAI, saveMessage });

  // Create initial conversation on mount
  // Create initial conversation on mount - DISABLED per user request
  // useEffect(() => {
  //   if (loading) return;
  //
  //   if (!currentConversationId && conversations.length === 0) {
  //     const newId = uuidv4();
  //     createConversation(newId, 'New Conversation').then(() => {
  //       setCurrentConversationId(newId);
  //     });
  //   } else if (!currentConversationId && conversations.length > 0) {
  //     setCurrentConversationId(conversations[0].id);
  //   }
  // }, [conversations.length, loading]);

  // Load conversation when ID changes
  useEffect(() => {
    const loadCurrentConversation = async () => {
      if (!currentConversationId) {
        setMessages([]); // Clear messages if no conversation selected
        return;
      }

      console.log('Loading conversation ID:', currentConversationId);
      setIsConversationLoading(true);
      setMessages([]); // Clear previous messages immediately

      try {
        const conv = await loadConversation(currentConversationId);
        console.log('Loaded conversation data:', conv);

        if (conv && conv.messages && conv.messages.length > 0) {
          const formattedMessages = conv.messages.map(msg => ({
            id: msg.id,
            role: msg.role,
            content: msg.content,
            file: msg.file || null,
            references: msg.references,
            status: 'delivered'
          }));
          console.log('Setting messages to state:', conv.messages);
          console.log('First message detail:', conv.messages[0]);
          setMessages(conv.messages);
        } else {
          // Start with welcome message + tip of the day
          console.log('No messages found, fetching tip of the day for:', selectedAI);

          try {
            const tipRes = await fetch(`/api/tip-of-the-day?ai_id=${selectedAI}`);
            const tipData = await tipRes.json();

            // AI-specific greetings and emojis
            const aiGreetings = {
              baobao: { greeting: 'สวัสดีครับ! 🐕✨ เบาเบาพร้อมช่วยเรื่อง UX writing แล้วครับ', emoji: '🐕' },
              deedee: { greeting: 'สวัสดีค่ะ! 🦌✨ ดีดีพร้อมช่วยวิเคราะห์ข้อมูลและทำ Google Analytics แล้วค่ะ', emoji: '🦌' },
              pungpung: { greeting: 'สวัสดีครับ! 🦉✨ ปังปังพร้อมช่วยวิเคราะห์ Feedback และ CSAT แล้วครับ', emoji: '🦉' },
              flowflow: { greeting: 'สวัสดีครับ! 🐙✨ โฟลว์โฟลว์ ปลาหมึกนักออกแบบพร้อมช่วย Design Flow & UI แล้วครับ', emoji: '🐙' }
            };

            const aiInfo = aiGreetings[selectedAI] || aiGreetings.baobao;
            const welcomeMessage = `${aiInfo.greeting}\n\n💡 **Tip of the Day**\n\n${tipData.tip}\n\n---\n\nมีอะไรให้ช่วยไหม${['baobao', 'flowflow', 'pungpung'].includes(selectedAI) ? 'ครับ' : 'คะ'}? 😊`;

            setMessages([{
              id: 'welcome',
              role: 'assistant',
              content: welcomeMessage,
              status: 'delivered'
            }]);
          } catch (error) {
            console.error('Error fetching tip:', error);
            // Fallback to simple welcome if tip fetch fails
            const aiGreetings = {
              baobao: 'สวัสดีครับ! 🐕✨ เบาเบาพร้อมช่วยเรื่อง UX writing แล้วครับ มีอะไรให้ช่วยไหมครับ? 😊',
              deedee: 'สวัสดีค่ะ! 🦌✨ ดีดีพร้อมช่วยวิเคราะห์ข้อมูลและทำ Google Analytics แล้วค่ะ มีอะไรให้ช่วยไหมคะ? 😊',
              pungpung: 'สวัสดีครับ! 🦉✨ ปังปังพร้อมช่วยวิเคราะห์ Feedback และ CSAT แล้วครับ มีอะไรให้ช่วยไหมครับ? 😊',
              flowflow: 'สวัสดีครับ! 🐙✨ โฟลว์โฟลว์ ปลาหมึกนักออกแบบพร้อมช่วย Design Flow & UI แล้วครับ มีอะไรให้ช่วยไหมครับ? 😊'
            };
            setMessages([{
              id: 'welcome',
              role: 'assistant',
              content: aiGreetings[selectedAI] || aiGreetings.baobao,
              status: 'delivered'
            }]);
          }
        }
      } catch (error) {
        console.error("Error loading conversation:", error);
      } finally {
        setIsConversationLoading(false);
      }
    };

    loadCurrentConversation();
  }, [currentConversationId]);

  // Conversation Handlers
  const handleNewConversation = async () => {
    console.log('Creating new conversation...');
    const newId = uuidv4();
    console.log('New conversation ID:', newId);

    try {
      await createConversation(newId, 'New Conversation', selectedAI);
      console.log('Conversation created successfully');

      setCurrentConversationId(newId);
      // We don't need to set messages here manually. 
      // The useEffect watching currentConversationId will load the conversation,
      // see it's empty, and trigger the welcome message + tip generation logic.
    } catch (error) {
      console.error('Error creating conversation:', error);
    }
  };

  const handleSelectConversation = (id) => {
    console.log('User selected conversation:', id);
    setCurrentConversationId(id);
    if (window.innerWidth < 1024) {
      setIsSidebarOpen(false);
    }
  };

  const handleFilePreview = (file) => {
    setPreviewFile(file);
  };

  // Smooth Auto-scroll - Continuously scroll to bottom during updates
  useEffect(() => {
    if (scrollRef.current && isStreaming) {
      const el = scrollRef.current;
      // Smooth continuous scroll to bottom
      const scrollToBottom = () => {
        el.scrollTo({
          top: el.scrollHeight,
          behavior: 'smooth'
        });
      };

      // Use timeout to ensure DOM is updated
      const timeoutId = setTimeout(scrollToBottom, 50);
      return () => clearTimeout(timeoutId);
    }
  }, [messages, isStreaming]);

  return (
    <div className="flex h-screen bg-app overflow-hidden font-sans text-text-primary transition-colors duration-300">
      <ConversationSidebar
        conversations={conversations}
        currentConversationId={currentConversationId}
        onSelectConversation={handleSelectConversation}
        onNewConversation={handleNewConversation}
        onDeleteConversation={deleteConversation}
        onRenameConversation={renameConversation}
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        selectedAI={selectedAI}
        aiAssistants={AI_ASSISTANTS}
        onSelectAI={setSelectedAI}
      />

      <div className="flex-1 flex overflow-hidden relative">
        {/* Main Chat Area */}
        <main className={`flex-1 flex flex-col transition-all duration-300 ease-in-out ${isSidebarOpen ? 'ml-64' : 'ml-0'} ${isAssetLibraryOpen || isProfileOpen ? 'mr-80' : 'mr-0'} relative`}>

          {/* Header */}
          <header className="flex-none px-4 h-[60px] border-b border-border-weak bg-panel flex items-center justify-between transition-colors duration-300">
            <div className="flex items-center gap-3">
              {/* Single Hamburger Menu */}
              <button
                onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                className="p-2 hover:bg-neutral-cont-hover rounded-lg text-text-on-disabled transition-colors"
                title="Toggle Sidebar"
              >
                <PanelLeft size={20} />
              </button>

              {/* Conversation Title */}
              <h1 className="font-semibold text-sm text-text-primary leading-tight hidden sm:block">
                {conversations.find(c => c.id === currentConversationId)?.title || 'BaoBao AI'}
              </h1>
            </div>

            {/* Right Side Icons */}
            <div className="flex items-center gap-2">
              {/* Notification Icon */}
              <button
                onClick={() => {
                  setIsNotificationOpen(!isNotificationOpen);
                  setIsProfileOpen(false);
                  setIsAssetLibraryOpen(false);
                }}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg text-gray-700 dark:text-gray-300 transition-colors relative"
                title="Notifications"
              >
                <Bell size={20} />
                {unreadCount > 0 && (
                  <span className="absolute top-1 right-1 w-2 h-2 bg-danger rounded-full"></span>
                )}
              </button>

              {/* User Avatar */}
              <button
                onClick={() => {
                  setIsProfileOpen(!isProfileOpen);
                  setIsNotificationOpen(false);
                  setIsAssetLibraryOpen(false);
                }}
                className="p-0.5 hover:ring-2 hover:ring-color-brand/20 rounded-full transition-all"
                title="Profile"
              >
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-600 to-blue-700 flex items-center justify-center text-white text-sm font-bold shadow-sm">
                  <span className="text-sm">U</span>
                </div>
              </button>
            </div>
          </header>

          {/* Loading Overlay */}
          {loading && (
            <div className="absolute inset-0 bg-white/80 backdrop-blur-sm z-50 flex items-center justify-center">
              <div className="flex flex-col items-center gap-3">
                <div className="w-8 h-8 border-2 border-slate-200 border-t-indigo-500 rounded-full animate-spin"></div>
                <p className="text-sm text-slate-500 font-medium">Loading conversation...</p>
              </div>
            </div>
          )}

          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 pt-6 pb-4 scroll-smooth">
            <div className="max-w-3xl mx-auto min-h-full flex flex-col justify-end">
              {/* Spacer for empty state or top padding */}
              <div className="flex-1" />

              {messages.length === 0 && !isConversationLoading && (
                <div className="flex flex-col items-center justify-center h-full text-center pb-20 opacity-0 animate-in fade-in duration-500 fill-mode-forwards" style={{ animationDelay: '0.2s' }}>
                  <div className="w-20 h-20 bg-blue-50 dark:bg-blue-900/20 rounded-full flex items-center justify-center mb-6">
                    <img
                      src={AI_ASSISTANTS[selectedAI]?.avatar || "/baobao_avatar.png"}
                      alt="AI Avatar"
                      className="w-12 h-12 object-cover rounded-full opacity-80"
                    />
                  </div>
                  <h2 className="text-2xl font-semibold text-text-primary mb-2">
                    {AI_ASSISTANTS[selectedAI]?.name || 'BaoBao AI'}
                  </h2>
                  <p className="text-text-secondary max-w-md mb-8">
                    {AI_ASSISTANTS[selectedAI]?.description || 'พร้อมช่วยงานคุณแล้วครับ'}
                  </p>
                  <button
                    onClick={handleNewConversation}
                    className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-full font-medium shadow-lg hover:shadow-xl transition-all transform hover:-translate-y-0.5"
                  >
                    Start New Chat
                  </button>
                </div>
              )}
              {messages.map((msg, index) => {
                const currentDate = msg.created_at ? new Date(msg.created_at).toDateString() : new Date().toDateString();
                const previousDate = index > 0 && messages[index - 1].created_at
                  ? new Date(messages[index - 1].created_at).toDateString()
                  : null;

                const showDateDivider = index === 0 || currentDate !== previousDate;

                return (
                  <React.Fragment key={msg.id}>
                    {showDateDivider && <DateDivider date={msg.created_at || new Date()} />}
                    <MessageRow
                      message={msg}
                      isLast={msg.id === messages[messages.length - 1].id}
                      isStreaming={isStreaming}
                      onPreview={setPreviewFile}
                      aiContext={AI_ASSISTANTS[selectedAI]}
                    />
                  </React.Fragment>
                );
              })}
            </div>
          </div>

          {/* Input Area */}
          <div className="flex-none p-4 bg-white/80 dark:bg-[#0d1117]/80 backdrop-blur-md transition-colors duration-300">
            <div className="max-w-3xl mx-auto">
              <Composer
                onSend={sendMessage}
                isStreaming={isStreaming}
                onStop={stop}
                onAssetUpload={handleAssetUpload}
                onPreview={handleFilePreview}
                selectedAsset={selectedAsset}
                onOpenMcpModal={() => setIsMcpModalOpen(true)}
              />
              <p className="text-center text-xs text-text-muted mt-2">
                BaoBao AI can make mistakes. Please verify important information.
              </p>
            </div>
          </div>
        </main>

        {/* Asset Library Sidebar */}
        <AssetLibrary
          assets={assets}
          isOpen={isAssetLibraryOpen}
          onClose={() => setIsAssetLibraryOpen(false)}
          onSelectAsset={handleSelectAsset}
          onDeleteAsset={handleDeleteAsset}
          onPreview={setPreviewFile}
        />

        {/* Notification Panel */}
        <NotificationPanel
          isOpen={isNotificationOpen}
          onClose={() => setIsNotificationOpen(false)}
          notifications={notifications}
          onMarkAsRead={handleMarkAsRead}
          onMarkAllAsRead={handleMarkAllAsRead}
        />

        {/* Profile Panel */}
        <ProfilePanel
          isOpen={isProfileOpen}
          onClose={() => setIsProfileOpen(false)}
          onOpenAssetLibrary={() => {
            setIsProfileOpen(false);
            setIsAssetLibraryOpen(true);
          }}
        />
      </div>

      {/* File Preview Modal */}
      <FilePreview
        file={previewFile}
        isOpen={!!previewFile}
        onClose={() => setPreviewFile(null)}
      />

      {/* MCP Connection Modal */}
      <McpConnectionModal
        isOpen={isMcpModalOpen}
        onClose={() => setIsMcpModalOpen(false)}
      />
    </div>
  );
}

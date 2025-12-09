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
import { ChevronRight, FileText, X, Plus, MoreHorizontal, Mic, Send, Menu, Bell, Server, PanelLeft, Palette, Search, MessageSquare } from 'lucide-react';
import { McpConnectionModal } from './components/McpConnectionModal.jsx';
import { WelcomeModal } from './components/WelcomeModal.jsx';
import ImageEditModal from './components/ImageEditModal.jsx';
import ImageGenerationModal from './components/ImageGenerationModal.jsx';

// ... existing imports ...


import { useAuth } from './hooks/useAuth.js';
import { AuthPages } from './components/auth/AuthPages.jsx';

/* -------------------------------------------------------------------------- */
/* 1. LOGIC HOOK                               */
/* -------------------------------------------------------------------------- */

function detectImageGenerationIntent(text) {
  if (!text) return null;
  const lowerText = text.toLowerCase();

  // Ignore if it contains a URL (likely asking to analyze something)
  if (lowerText.includes('http') || lowerText.includes('www.') || lowerText.includes('figma.com')) {
    return null;
  }

  const highConfidenceKeywords = ['วาด', 'สร้างภาพ', 'เขียนแบบ', 'ร่าง wireframe', 'ร่างแบบ', 'mockup', 'wireframe', 'sketch', 'design mockup'];
  // Removed generic 'design' to avoid false positives
  const mediumConfidenceKeywords = ['ออกแบบ', 'สร้าง ui', 'สร้าง component', 'ทำ mockup', 'create ui', 'make mockup'];

  for (const keyword of highConfidenceKeywords) {
    if (lowerText.includes(keyword)) return 'high';
  }
  for (const keyword of mediumConfidenceKeywords) {
    if (lowerText.includes(keyword)) return 'medium';
  }
  return null;
}

// Generate conversation title from user message
function generateConversationTitle(message) {
  if (!message) return 'New Conversation';

  // Remove extra whitespace and newlines
  const cleaned = message.trim().replace(/\s+/g, ' ');

  // Truncate to ~40 characters for readability
  const maxLength = 40;
  if (cleaned.length <= maxLength) return cleaned;

  // Try to cut at word boundary
  const truncated = cleaned.substring(0, maxLength);
  const lastSpace = truncated.lastIndexOf(' ');

  if (lastSpace > maxLength * 0.6) {
    return truncated.substring(0, lastSpace) + '...';
  }

  return truncated + '...';
}

function useFastChat(callbacks, { currentConversationId, createConversation, setCurrentConversationId, selectedAI, saveMessage, renameConversation, conversations }) {
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
  const simulateBackendResponse = async (updateFn, userMessage, file = null, aiId = 'baobao', useImageGen = false) => {
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMessage, file, location, ai_id: aiId, conversation_id: currentConversationId, use_image_gen: useImageGen })
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

  const sendMessage = async (content, file = null, isImageGenMode = false) => {
    // Ensure conversation exists
    let conversationId = currentConversationId;
    let isNewConversation = false;
    if (!conversationId) {
      const newId = uuidv4();
      console.log('Auto-creating conversation:', newId, 'for AI:', selectedAI);
      await createConversation(newId, 'New Conversation', selectedAI);
      setCurrentConversationId(newId);
      conversationId = newId;
      isNewConversation = true;
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

    // Auto-generate title for new conversation or if still "New Conversation"
    if (content && renameConversation && conversations) {
      const currentConv = conversations.find(c => c.id === conversationId);
      if (isNewConversation || (currentConv && currentConv.title === 'New Conversation')) {
        const generatedTitle = generateConversationTitle(content);
        console.log('🏷️ Auto-generating title:', generatedTitle);
        // Rename conversation asynchronously (don't wait)
        renameConversation(conversationId, generatedTitle).catch(err =>
          console.error('Failed to rename conversation:', err)
        );
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

      // Only check for image intent if NOT in manual image gen mode
      // If manual mode is ON, we skip the auto-detection and go straight to backend with flag
      const imageIntent = (selectedAI === 'flowflow' && !isImageGenMode) ? detectImageGenerationIntent(content) : null;
      if (imageIntent) {
        console.log('🎨 Image generation intent detected:', imageIntent);
        callbacks.onPendingImageRequest?.({ prompt: content, userMsgId, assistantMsgId, conversationId });
        return;
      }

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
      }, content, file, selectedAI, isImageGenMode); // Pass user message, file, selected AI, and toggle state

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

    if (message.status === 'streaming') {
      // During streaming, always open if there's thought content
      if (hasThought) {
        setIsOpen(true);
      }
    } else {
      // Auto-close when finished
      setIsOpen(false);
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
  const { onPreview, onEditImage } = useContext(MessageContext) || {};
  const [isHovered, setIsHovered] = useState(false);

  // Check if image is generated by FlowFlow (local path)
  const isGeneratedImage = src && src.startsWith('/generated-images/');

  const handleClick = (e) => {
    // If clicking the edit button, don't trigger preview
    if (e.target.closest('.edit-btn')) return;

    if (onPreview) {
      onPreview({
        name: alt || 'Image',
        mimeType: 'image/png',
        data: src,
        isUrl: true
      });
    }
  };

  return (
    <div
      className="relative inline-block group rounded-lg overflow-hidden"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <img
        src={src}
        alt={alt}
        onClick={handleClick}
        className="cursor-pointer hover:opacity-90 transition-opacity rounded-lg max-w-full h-auto"
        {...props}
      />

      {/* Edit Button Overlay */}
      {isGeneratedImage && (
        <button
          onClick={() => onEditImage && onEditImage(src)}
          className={`edit-btn absolute top-2 right-2 p-2 bg-white/90 hover:bg-white text-blue-600 rounded-full shadow-lg backdrop-blur-sm transition-all duration-200 ${isHovered ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2'}`}
          title="แก้ไขรูปภาพ"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 20h9"></path>
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
          </svg>
        </button>
      )}
    </div>
  );
};

// B. MessageRow
const MessageRow = memo(({ message, onPreview, onEditImage, aiContext }) => {
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
          <MessageContext.Provider value={{ message, onPreview, onEditImage }}>
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeRaw]}
              components={{
                code: CodeBlock,
                blockquote: ThinkingBlock,
                img: ImageComponent,
                a: ({ node, ...props }) => <a target="_blank" rel="noopener noreferrer" {...props} />,
                ...TableComponents
              }}
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

              <details className="group mt-4 pt-3 border-t border-slate-200 dark:border-neutral-700 text-sm text-slate-500 dark:text-neutral-400">
                <summary className="flex items-center gap-2 cursor-pointer select-none list-none font-medium text-xs uppercase tracking-wider opacity-70 hover:opacity-100 transition-opacity">
                  <ChevronRight className="w-3.5 h-3.5 transition-transform group-open:rotate-90" />
                  <span>แหล่งอ้างอิง</span>
                </summary>
                <div className="mt-2 pl-5 text-xs leading-relaxed opacity-80">
                  {message.references}
                </div>
              </details>
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
const Composer = ({ onSend, isStreaming, onStop, onAssetUpload, onPreview, selectedAsset, onOpenMcpModal, selectedAI }) => {
  const [input, setInput] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isImageGenMode, setIsImageGenMode] = useState(false); // New state for toggle
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
      onSend(input, selectedFile, isImageGenMode); // Pass toggle state
      setInput('');
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handlePaste = (e) => {
    // 1. Handle Image Paste
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        e.preventDefault();
        const file = items[i].getAsFile();

        const reader = new FileReader();
        reader.onload = (e) => {
          const base64 = e.target.result.split(',')[1];
          const newFile = {
            id: uuidv4(),
            name: file.name || `pasted_image_${Date.now()}.png`,
            mimeType: file.type,
            data: base64,
            timestamp: Date.now()
          };
          setSelectedFile(newFile);
          onAssetUpload(newFile);
        };
        reader.readAsDataURL(file);
        return; // Stop after first image found
      }
    }

    // 2. Handle Long Text Paste (Convert to CSV)
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
    setIsDragging(false);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const file = e.dataTransfer.files[0];
    if (file) {
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

  return (
    <div className="w-full max-w-3xl mx-auto px-4 pb-6">
      <div
        className={`relative flex flex-col p-4 rounded-[24px] border transition-all duration-200 bg-white dark:bg-neutral-800 shadow-sm hover:shadow-md ${isDragging ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-slate-200 dark:border-neutral-700'
          } ${isStreaming ? 'opacity-70 pointer-events-none' : ''}`}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <input
          type="file"
          ref={fileInputRef}
          className="hidden"
          onChange={handleFileSelect}
          accept="image/*,.pdf,.txt,.md,.csv,.json"
        />

        {/* Top Section: Search Icon + Input */}
        <div className="flex items-start gap-3 mb-2">
          <MessageSquare className="w-5 h-5 text-slate-400 mt-2.5" />
          <div className="flex-1 min-w-0 relative">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder={isImageGenMode ? "Describe the image you want to generate..." : "Message FlowFlow..."}
              className="w-full max-h-[200px] py-2 bg-transparent border-none focus:ring-0 focus:outline-none resize-none text-base text-slate-700 dark:text-slate-200 placeholder:text-slate-400 leading-relaxed scrollbar-hide"
              rows={1}
            />
            {selectedFile && (
              <div className="mt-2 group relative inline-flex items-center gap-3 px-3 py-2 bg-slate-50 dark:bg-neutral-700/50 rounded-xl border border-slate-200 dark:border-neutral-700">
                {/* Thumbnail or Icon */}
                <div className="w-8 h-8 rounded-lg bg-white dark:bg-neutral-600 flex items-center justify-center overflow-hidden shrink-0 border border-slate-100 dark:border-neutral-600">
                  {selectedFile.mimeType.startsWith('image/') ? (
                    <img src={`data:${selectedFile.mimeType};base64,${selectedFile.data}`} alt="Preview" className="w-full h-full object-cover" />
                  ) : (
                    <FileText size={16} className="text-slate-400" />
                  )}
                </div>

                {/* Name */}
                <div className="flex flex-col min-w-0 max-w-[150px]">
                  <span className="text-xs font-medium text-slate-700 dark:text-slate-200 truncate">{selectedFile.name}</span>
                  <span className="text-[10px] text-slate-400 uppercase">{selectedFile.mimeType.split('/')[1] || 'FILE'}</span>
                </div>

                {/* Remove Button */}
                <button
                  onClick={() => setSelectedFile(null)}
                  className="ml-1 p-1 text-slate-400 hover:text-red-500 transition-colors"
                >
                  <X size={14} />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Bottom Section: Actions */}
        <div className="flex items-center justify-between mt-1">
          <div className="flex items-center gap-2">
            {/* Add Button (Pill) */}
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-slate-200 dark:border-neutral-600 text-xs font-medium text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-neutral-700 transition-colors"
            >
              <Plus size={14} />
              <span>Add files</span>
            </button>

            {/* More Options */}
            <button
              onClick={onOpenMcpModal}
              className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors rounded-md hover:bg-slate-100 dark:hover:bg-neutral-700"
              title="MCP Connections"
            >
              <MoreHorizontal size={18} />
            </button>

            {/* Image Gen Toggle */}
            {selectedAI === 'flowflow' && (
              <button
                onClick={() => setIsImageGenMode(!isImageGenMode)}
                className={`p-1.5 transition-colors rounded-md ${isImageGenMode ? 'text-pink-500 bg-pink-50 dark:bg-pink-900/20' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-neutral-700'}`}
                title={isImageGenMode ? "Image Generation ON" : "Image Generation OFF"}
              >
                <Palette size={18} />
              </button>
            )}
          </div>

          <div className="flex items-center gap-3">
            {/* Microphone */}
            <button className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
              <Mic size={20} />
            </button>

            {/* Send Button */}
            {isStreaming ? (
              <button onClick={onStop} className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-200 dark:bg-neutral-700 hover:bg-red-100 dark:hover:bg-red-900/30 group transition-all">
                <div className="w-2.5 h-2.5 bg-slate-500 dark:bg-slate-400 group-hover:bg-red-500 rounded-[1px]" />
              </button>
            ) : (
              <button
                onClick={handleSend}
                disabled={!input.trim() && !selectedFile}
                className={`w-8 h-8 flex items-center justify-center rounded-full transition-all ${input.trim() || selectedFile
                  ? 'bg-black dark:bg-white text-white dark:text-black hover:opacity-90 shadow-sm'
                  : 'bg-slate-100 dark:bg-neutral-700 text-slate-400 dark:text-neutral-500'
                  }`}
              >
                <Send size={16} className={input.trim() || selectedFile ? 'ml-0.5' : ''} />
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="text-center mt-2 text-[10px] text-slate-400 dark:text-neutral-500 font-medium tracking-wide opacity-0 focus-within:opacity-100 transition-opacity">
        Return to send · Shift + Return for newline
      </div>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* 3. APP SHELL                                */
/* -------------------------------------------------------------------------- */

export default function App() {
  // Image Editing State
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editImageSrc, setEditImageSrc] = useState(null);

  const handleEditImage = (src) => {
    setEditImageSrc(src);
    setIsEditModalOpen(true);
  };

  const handleEditSubmit = (prompt) => {
    // Send message to chat
    sendMessage(prompt);
  };
  const scrollRef = useRef(null);

  // Conversation State
  const [currentConversationId, setCurrentConversationId] = useState(null);
  // Keep sidebar visible on desktop by default so navigation/history stay accessible
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => {
    if (typeof window === 'undefined') return true;
    return window.innerWidth >= 1024;
  });
  const [isConversationLoading, setIsConversationLoading] = useState(false);
  const [isMcpModalOpen, setIsMcpModalOpen] = useState(false);
  const [showWelcomeModal, setShowWelcomeModal] = useState(false);
  const [showImageGenModal, setShowImageGenModal] = useState(false);
  const [pendingImageRequest, setPendingImageRequest] = useState(null);

  // AI Selection State (must be before useConversations)
  const [selectedAI, setSelectedAI] = useState('baobao');

  // Reset conversation when AI changes - MUST be before early returns
  useEffect(() => {
    setCurrentConversationId(null);
  }, [selectedAI]);

  // ALL HOOKS must be called before conditional returns
  const {
    conversations,
    loading,
    loadConversation,
    createConversation,
    renameConversation,
    deleteConversation,
    saveMessage,
    folders,
    createFolder,
    renameFolder,
    deleteFolder,
    moveConversation,
    deleteAllConversations
  } = useConversations(currentConversationId, setCurrentConversationId, selectedAI);

  // Asset Library State & Logic
  const [assets, setAssets] = useState([]);
  const [isAssetLibraryOpen, setIsAssetLibraryOpen] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState(null);
  const [previewFile, setPreviewFile] = useState(null);

  // Notification & Profile Panel State
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);

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

  // Load assets on mount - MUST be before auth check
  useEffect(() => {
    const loadAssetsOnMount = async () => {
      try {
        const response = await fetch('/api/assets');
        const data = await response.json();
        if (response.ok) {
          setAssets(data);
        }
      } catch (error) {
        console.error('Error loading assets:', error);
      }
    };
    loadAssetsOnMount();
  }, []);

  // useFastChat hook - MUST be before auth check but needs callbacks defined after
  // We'll use a ref to store callbacks and call them dynamically
  const callbacksRef = useRef({
    onMessageSent: async () => { },
    onStreamComplete: async () => { },
    onStreamError: () => { },
    onNewConversation: () => { }
  });

  const { messages, setMessages, sendMessage, isStreaming, stop } = useFastChat(
    callbacksRef.current,
    {
      currentConversationId,
      createConversation,
      setCurrentConversationId,
      selectedAI,
      saveMessage,
      renameConversation,
      conversations
    }
  );

  // AUTH HOOK - Must be called after all other hooks but before early returns
  const { user, loading: authLoading } = useAuth();



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
    },
    flowflowgpt5: {
      id: 'flowflowgpt5',
      name: 'FlowFlow (AI-Team)',
      avatar: '/avatars/flowflow_bw.png',
      color: 'purple',
      description: 'Custom Agent',
      systemPrompt: 'flowflow' // Reuse prompt or custom
    },
    baobaogpt5: {
      id: 'baobaogpt5',
      name: 'BaoBao (AI-Team)',
      avatar: '/avatars/baobao_bw.png',
      color: 'blue',
      description: 'Custom Agent',
      systemPrompt: 'baobao' // Reuse prompt or custom
    }
  };

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

  const handleAssetUpload = async (fileData) => {
    try {
      console.log('Uploading asset:', fileData.name);
      // Destructure to separate file data from metadata
      const { source, prompt, ai_id, ...file } = fileData;

      const res = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file,
          conversation_id: currentConversationId,
          source,
          prompt,
          ai_id
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

  const handleRenameAsset = async (id, newFilename) => {
    try {
      console.log('📝 Renaming asset:', { id, newFilename });
      const response = await fetch(`/api/assets/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: newFilename })
      });

      const result = await response.json();
      console.log('📝 Rename response:', result);

      if (!response.ok) {
        throw new Error(result.error || 'Failed to rename');
      }

      await loadAssets();
      console.log('✅ Asset renamed successfully');
    } catch (error) {
      console.error('❌ Error renaming asset:', error);
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

  // Update callbacks ref with actual implementations
  useEffect(() => {
    callbacksRef.current = {
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
      onUpload: handleAssetUpload,
      onPendingImageRequest: (request) => {
        setPendingImageRequest(request);
        setShowImageGenModal(true);
        setTimeout(() => {
          setShowImageGenModal(false);
          setPendingImageRequest(null);
        }, 10000);
      }
    };
  }, [currentConversationId, messages, saveMessage, handleAssetUpload]);

  useEffect(() => {
    if (!loading && !currentConversationId) {
      setShowWelcomeModal(true);
    }
  }, [currentConversationId, loading]);

  // Handle clicks on generated images  
  useEffect(() => {
    const handleImageClick = (e) => {
      const img = e.target.closest('img[data-preview]');
      if (img) {
        try {
          const previewData = JSON.parse(img.getAttribute('data-preview'));
          setPreviewFile(previewData);
        } catch (error) {
          console.error('Failed to parse preview data:', error);
        }
      }
    };

    document.addEventListener('click', handleImageClick);
    return () => document.removeEventListener('click', handleImageClick);
  }, []);

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
              flowflow: { greeting: 'สวัสดีครับ! 🐙✨ โฟลว์โฟลว์ ปลาหมึกนักออกแบบพร้อมช่วย Design Flow & UI แล้วครับ', emoji: '🐙' },
              flowflowgpt5: { greeting: 'สวัสดีครับ! 🐙✨ โฟลว์โฟลว์ (AI-Team) พร้อมช่วย Design Flow & UI แล้วครับ', emoji: '🐙' },
              baobaogpt5: { greeting: 'สวัสดีครับ! 🐕✨ เบาเบา (AI-Team) พร้อมช่วยเรื่อง UX writing แล้วครับ', emoji: '🐕' }
            };

            const aiInfo = aiGreetings[selectedAI] || aiGreetings.baobao;
            const welcomeMessage = `${aiInfo.greeting}\n\n💡 **Tip of the Day**\n\n${tipData.tip}\n\n---\n\nมีอะไรให้ช่วยไหม${['baobao', 'flowflow', 'pungpung', 'flowflowgpt5', 'baobaogpt5'].includes(selectedAI) ? 'ครับ' : 'คะ'}? 😊`;

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
              flowflow: 'สวัสดีครับ! 🐙✨ โฟลว์โฟลว์ ปลาหมึกนักออกแบบพร้อมช่วย Design Flow & UI แล้วครับ มีอะไรให้ช่วยไหมครับ? 😊',
              flowflowgpt5: 'สวัสดีครับ! 🐙✨ โฟลว์โฟลว์ (AI-Team) พร้อมช่วย Design Flow & UI แล้วครับ มีอะไรให้ช่วยไหมครับ? 😊',
              baobaogpt5: 'สวัสดีครับ! 🐕✨ เบาเบา (AI-Team) พร้อมช่วยเรื่อง UX writing แล้วครับ มีอะไรให้ช่วยไหมครับ? 😊'
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
    console.log('New conversation requested - showing WelcomeModal');
    setShowWelcomeModal(true);
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

  // Show loading state while checking auth
  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-neutral-900">
        <div className="text-center">
          <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-10 h-10 text-white animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <p className="text-gray-600 dark:text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  // Show auth pages if not authenticated
  if (!user) {
    return <AuthPages />;
  }

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
        folders={folders}
        createFolder={createFolder}
        renameFolder={renameFolder}
        deleteFolder={deleteFolder}
        moveConversation={moveConversation}
        deleteAllConversations={deleteAllConversations}
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
                {conversations.find(c => c.id === currentConversationId)?.title || 'AXIO AI Platform'}
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
                    {AI_ASSISTANTS[selectedAI]?.name || 'AXIO AI Platform'}
                  </h2>
                  <p className="text-text-secondary max-w-md mb-8">
                    {AI_ASSISTANTS[selectedAI]?.description || 'พร้อมช่วยงานคุณแล้วครับ'}
                  </p>
                  <button
                    onClick={handleNewConversation}
                    className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-full font-medium shadow-lg transition-all"
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
                      onEditImage={handleEditImage}
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
                selectedAI={selectedAI}
              />
              <p className="text-center text-xs text-text-muted mt-2">
                AXIO AI Platform can make mistakes. Please verify important information.
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
          onRenameAsset={handleRenameAsset}
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

      <WelcomeModal isOpen={showWelcomeModal} onClose={() => setShowWelcomeModal(false)} aiAssistants={AI_ASSISTANTS} onSelectAI={(aiId) => { setSelectedAI(aiId); setShowWelcomeModal(false); const newId = uuidv4(); createConversation(newId, 'New Conversation', aiId).then(() => setCurrentConversationId(newId)); }} />

      {showImageGenModal && pendingImageRequest && (<ImageGenerationModal prompt={pendingImageRequest.prompt} onImageGen={async () => { setShowImageGenModal(false); setMessages(prev => prev.map(msg => msg.id === pendingImageRequest.assistantMsgId ? { ...msg, content: '🎨 กำลังสร้างภาพตาม AXIO Design System...\n\n<div class="skeleton-loader"></div>\n\nกรุณารอสักครู่นะครับ อาจใช้เวลา 10-30 วินาที ⏳' } : msg)); try { const response = await fetch('/api/generate-image', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: pendingImageRequest.prompt, ai_id: selectedAI }) }); if (response.ok) { const imageData = await response.json(); const imageContent = `🎨 สร้างภาพตาม AXIO Design System เรียบร้อยแล้วครับ!\n\n<img src="${imageData.imageUrl}" alt="Generated Design" class="generated-image fade-in cursor-pointer hover:opacity-90 transition-opacity" data-preview='{"name":"Generated Design","mimeType":"image/jpeg","data":"${imageData.imageUrl}"}' />\n\nคลิกที่ภาพเพื่อดูขนาดเต็ม | นี่คือดีไซน์ที่สร้างตามหลัก AXIO Design System ครับ ✨`; setMessages(prev => prev.map(msg => msg.id === pendingImageRequest.assistantMsgId ? { ...msg, content: imageContent, status: 'delivered' } : msg)); await saveMessage({ id: pendingImageRequest.assistantMsgId, conversation_id: pendingImageRequest.conversationId, role: 'assistant', content: imageContent, references: null }); console.log('💾 Auto-saving generated image to asset library...'); try { const imageResponse = await fetch(imageData.imageUrl); const imageBlob = await imageResponse.blob(); const base64data = await new Promise((resolve) => { const reader = new FileReader(); reader.onloadend = () => resolve(reader.result.split(',')[1]); reader.readAsDataURL(imageBlob); }); await handleAssetUpload({ name: imageData.filename, mimeType: 'image/jpeg', data: base64data, source: 'ai_generated', prompt: pendingImageRequest.prompt, ai_id: selectedAI }); console.log('✅ Generated image saved to asset library'); } catch (assetError) { console.error('❌ Failed to save generated image to assets:', assetError); } } else { throw new Error('Image generation failed'); } } catch (error) { console.error('Image generation error:', error); setMessages(prev => prev.map(msg => msg.id === pendingImageRequest.assistantMsgId ? { ...msg, content: '❌ ขออภัยครับ เกิดข้อผิดพลาดในการสร้างภาพ กรุณาลองใหม่อีกครั้ง', status: 'delivered' } : msg)); } setPendingImageRequest(null); }} onRegularChat={() => { setShowImageGenModal(false); sendMessage(pendingImageRequest.prompt); setPendingImageRequest(null); }} onDismiss={() => { setShowImageGenModal(false); setMessages(prev => prev.filter(msg => msg.id !== pendingImageRequest.assistantMsgId)); setPendingImageRequest(null); }} />)}

      {/* MCP Connection Modal */}
      <McpConnectionModal
        isOpen={isMcpModalOpen}
        onClose={() => setIsMcpModalOpen(false)}
      />

      {/* Image Edit Modal */}
      <ImageEditModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        onSubmit={handleEditSubmit}
        imageSrc={editImageSrc}
      />
    </div>
  );
}

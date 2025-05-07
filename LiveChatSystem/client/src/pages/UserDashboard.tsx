import { useState, useEffect, useRef } from "react";
import { useChat } from "@/hooks/useChat";
import ChatHeader from "@/components/ChatHeader";
import ChatInput from "@/components/ChatInput";
import ChatMessage from "@/components/ChatMessage";
import ChatItem from "@/components/ChatItem";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { PlusIcon, SearchIcon } from "lucide-react";
import { Input } from "@/components/ui/input";

// Generate a random user ID for this session
// In a real app, this would come from auth
// We'll ensure this is stable per browser using localStorage, so it persists across page reloads
const generateUserId = () => {
  try {
    const existingId = localStorage.getItem('livechat_user_id');
    if (existingId) {
      console.log("Using existing user ID from localStorage:", existingId);
      return existingId;
    }
    
    // Generate a more predictable ID that won't cause conflicts
    const timestamp = new Date().getTime();
    const randomPart = Math.floor(Math.random() * 10000);
    const newId = `user-${timestamp}-${randomPart}`;
    
    console.log("Generated new user ID:", newId);
    localStorage.setItem('livechat_user_id', newId);
    return newId;
  } catch (error) {
    // Fallback in case localStorage is not available (private browsing, etc.)
    console.warn("Could not access localStorage, using session-only ID", error);
    return `user-${Math.floor(Math.random() * 10000)}`;
  }
};

const userId = generateUserId();

// Extract a readable segment from the userId for userName
const getUserNameFromId = (id: string) => {
  // If ID format is user-timestamp-random
  const parts = id.split('-');
  if (parts.length >= 3) {
    return `User #${parts[2]}`;
  }
  
  // Backward compatibility for older format
  if (parts.length === 2) {
    return `User #${parts[1]}`;
  }
  
  // Fallback
  return `User ${id.substring(0, 8)}`;
};

const userName = getUserNameFromId(userId);

export default function UserDashboard() {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isCreatingConversation, setIsCreatingConversation] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const {
    sessions,
    activeSession,
    activeSessionId,
    messages,
    isLoading,
    isSending,
    isCreatingSession,
    setActiveSessionId,
    startNewSession: startNewSessionBase,
    sendMessage,
  } = useChat({ userId, userName });
  
  // Custom wrapper for startNewSession with error handling
  const startNewSession = async () => {
    // Clear previous errors
    setError(null);
    
    // Set loading state
    setIsCreatingConversation(true);
    
    try {
      console.log("Starting new conversation with userId:", userId, "userName:", userName);
      
      // Track start time for debugging
      const startTime = Date.now();
      
      const result = await fetch('/api/sessions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId,
          userName,
          isBotMode: true,
          status: 'active'
        })
      });
      
      // Log response time
      console.log(`Session creation request completed in ${Date.now() - startTime}ms`);
      
      if (!result.ok) {
        const errorText = await result.text();
        console.error("API error response:", result.status, errorText);
        
        // Handle common error scenarios
        if (result.status === 429) {
          throw new Error("Terlalu banyak permintaan. Mohon tunggu beberapa saat dan coba lagi.");
        } else if (result.status === 503 || result.status === 504) {
          throw new Error("Layanan sedang sibuk. Mohon coba lagi dalam beberapa saat.");
        } else if (result.status >= 500) {
          throw new Error("Terjadi kesalahan pada server. Tim teknis kami sedang menanganinya.");
        } else if (result.status === 401 || result.status === 403) {
          throw new Error("Anda tidak memiliki izin untuk membuat percakapan baru.");
        } else if (result.status === 404) {
          throw new Error("Layanan chat tidak ditemukan. Mohon hubungi administrator.");
        } else if (result.status === 400) {
          throw new Error("Data tidak valid. Mohon periksa input Anda dan coba lagi.");
        } else {
          throw new Error(`Gagal membuat percakapan baru: ${result.status} ${result.statusText}`);
        }
      }
      
      try {
        const session = await result.json();
        console.log("New session created successfully:", session);
        
        // Set this session as active
        if (session && session.id) {
          setActiveSessionId(session.id);
          
          // Return session for any further processing
          return session;
        } else {
          throw new Error("Session created but no valid ID returned");
        }
      } catch (jsonError) {
        console.error("Error parsing session response:", jsonError);
        throw new Error("Failed to parse server response");
      }
    } catch (error: any) {
      console.error("Failed to start new conversation:", error);
      setError(error.message || "Failed to start a new conversation. Please try again.");
      return null;
    } finally {
      setIsCreatingConversation(false);
    }
  };

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // Filter sessions based on search query
  const filteredSessions = sessions.filter((session) => {
    if (!searchQuery) return true;
    return session.id.toString().includes(searchQuery);
  });

  // Get last message for a session for preview
  const getLastMessagePreview = (sessionId: number) => {
    if (activeSessionId === sessionId) {
      const lastUserMessage = [...messages]
        .reverse()
        .find(msg => msg.sender === 'user' || msg.sender === 'bot' || msg.sender === 'admin');
      
      return lastUserMessage?.message || "No messages yet...";
    }
    return "Open to view messages...";
  };

  return (
    <div className="flex-1 flex flex-col h-full">
      <ChatHeader session={activeSession} />

      <div className="flex-1 flex flex-col md:flex-row min-h-0">
        {/* Chat History Sidebar */}
        <div className="md:w-80 bg-white border-r border-neutral-200 flex flex-col">
          <div className="p-4 border-b border-neutral-200">
            <div className="relative">
              <Input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2"
                placeholder="Search conversations..."
              />
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <SearchIcon className="h-5 w-5 text-neutral-400" />
              </div>
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto p-2 space-y-2">
            {isLoading ? (
              // Skeleton loading state
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="p-3 bg-white rounded-lg border border-neutral-200">
                  <div className="flex justify-between items-start">
                    <Skeleton className="h-5 w-24" />
                    <Skeleton className="h-4 w-16" />
                  </div>
                  <Skeleton className="h-4 w-full mt-2" />
                </div>
              ))
            ) : filteredSessions.length > 0 ? (
              filteredSessions.map((session) => (
                <ChatItem
                  key={session.id}
                  session={session}
                  isActive={session.id === activeSessionId}
                  lastMessage={getLastMessagePreview(session.id)}
                  onClick={() => setActiveSessionId(session.id)}
                />
              ))
            ) : (
              <div className="text-center py-8 text-neutral-500">
                <p>No conversations yet</p>
                <p className="text-sm">Start a new chat to get help</p>
              </div>
            )}
          </div>
          
          <div className="p-4 border-t border-neutral-200">
            {error && (
              <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded-md text-red-800 text-xs text-center">
                <p>{error}</p>
                <button 
                  className="text-xs text-red-600 underline mt-1"
                  onClick={() => setError(null)}
                >
                  Dismiss
                </button>
              </div>
            )}
            
            <Button
              className="w-full"
              onClick={() => {
                console.log("New Conversation button clicked");
                startNewSession();
              }}
              disabled={isCreatingConversation}
            >
              <PlusIcon className="h-5 w-5 mr-2" />
              {isCreatingConversation ? "Creating..." : "New Conversation"}
            </Button>
          </div>
        </div>
        
        {/* Chat Messages */}
        <div className="flex-1 flex flex-col bg-neutral-50">
          <div className="flex-1 overflow-y-auto p-4" id="userChatMessages">
            {isLoading ? (
              // Skeleton loading state for messages
              <div className="flex flex-col space-y-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className={`flex items-end ${i % 2 === 0 ? '' : 'justify-end'}`}>
                    <div className={`flex flex-col space-y-2 max-w-xs mx-2 ${i % 2 === 0 ? 'items-start' : 'items-end'}`}>
                      <Skeleton className={`h-16 w-64 rounded-lg ${i % 2 === 0 ? '' : ''}`} />
                      <Skeleton className="h-3 w-16" />
                    </div>
                  </div>
                ))}
              </div>
            ) : messages.length > 0 ? (
              <div className="flex flex-col space-y-0">
                {messages.map((message) => (
                  <ChatMessage key={message.id} message={message} />
                ))}
                <div ref={messagesEndRef} />
              </div>
            ) : activeSessionId ? (
              <div className="flex flex-col items-center justify-center h-full text-neutral-500">
                <p>No messages in this conversation</p>
                <p className="text-sm">Type a message to get started</p>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-neutral-500">
                <p>Welcome to our chat support</p>
                <p className="text-sm mt-2">Start a new conversation to get help</p>
                
                {error && (
                  <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md text-red-800 text-sm max-w-md text-center">
                    <p>{error}</p>
                    <button 
                      className="text-xs text-red-600 underline mt-1"
                      onClick={() => setError(null)}
                    >
                      Dismiss
                    </button>
                  </div>
                )}
                
                <Button 
                  className="mt-4"
                  onClick={() => {
                    console.log("Start Conversation button clicked");
                    startNewSession();
                  }}
                  disabled={isCreatingConversation}
                >
                  {isCreatingConversation ? "Creating..." : "Start Conversation"}
                </Button>
              </div>
            )}
          </div>
          
          {/* Chat status indicator */}
          {activeSession && (
            <div className="px-4 py-2 bg-white border-t border-neutral-200 text-xs text-neutral-500">
              <span>
                <span className={`inline-block w-2 h-2 rounded-full mr-1 ${
                  activeSession.status === "resolved"
                    ? "bg-green-500"
                    : activeSession.isBotMode
                      ? "bg-secondary"
                      : "bg-yellow-500"
                }`}></span>
                {activeSession.status === "resolved" 
                  ? "This conversation has been resolved" 
                  : activeSession.isBotMode 
                    ? "Connected with bot support" 
                    : "Connected with admin support"}
              </span>
            </div>
          )}
          
          {/* Chat input */}
          <ChatInput
            onSendMessage={sendMessage}
            disabled={isSending || !activeSessionId || (activeSession?.status === "resolved")}
            placeholder={
              !activeSessionId
                ? "Start a conversation first..."
                : activeSession?.status === "resolved"
                ? "This conversation has been resolved..."
                : "Type your message..."
            }
          />
        </div>
      </div>
    </div>
  );
}

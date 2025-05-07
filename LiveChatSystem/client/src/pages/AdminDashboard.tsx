import { useState, useEffect, useRef } from "react";
import { useChat } from "@/hooks/useChat";
import ChatHeader from "@/components/ChatHeader";
import ChatInput from "@/components/ChatInput";
import ChatMessage from "@/components/ChatMessage";
import ChatItem from "@/components/ChatItem";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Filter } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChatSession } from "@shared/schema";

// Generate a random admin ID for this session
// In a real app, this would come from auth
const adminId = `admin-${Math.floor(Math.random() * 10000)}`;
const adminName = `Admin #${adminId.split('-')[1]}`;

export default function AdminDashboard() {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  
  const {
    sessions,
    activeSession,
    activeSessionId,
    messages,
    isLoading,
    isSending,
    setActiveSessionId,
    sendMessage,
  } = useChat({ userId: adminId, userName: adminName, isAdmin: true });

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // Filter sessions based on search query and status
  const filteredSessions = sessions.filter((session) => {
    // First apply search filter
    const matchesSearch = searchQuery 
      ? session.userId.toLowerCase().includes(searchQuery.toLowerCase()) ||
        session.id.toString().includes(searchQuery)
      : true;
    
    // Then apply status filter
    let matchesStatus = true;
    if (statusFilter === "active") {
      matchesStatus = session.status === "active" && !session.isBotMode;
    } else if (statusFilter === "bot") {
      matchesStatus = session.status === "active" && session.isBotMode;
    } else if (statusFilter === "resolved") {
      matchesStatus = session.status === "resolved";
    }
    
    return matchesSearch && matchesStatus;
  });

  // Get last message for a session for preview
  const getLastMessagePreview = (sessionId: number) => {
    if (activeSessionId === sessionId) {
      const lastMessage = [...messages]
        .reverse()
        .find(msg => msg.sender !== 'system');
      
      return lastMessage?.message || "No messages yet...";
    }
    return "Open to view messages...";
  };

  return (
    <div className="flex-1 flex flex-col h-full">
      <ChatHeader session={null} isAdmin={true} />

      <div className="flex-1 flex flex-col md:flex-row min-h-0">
        {/* Chat List Sidebar */}
        <div className="md:w-80 bg-white border-r border-neutral-200 flex flex-col">
          <div className="p-4 border-b border-neutral-200">
            <div className="relative">
              <Input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2"
                placeholder="Search users..."
              />
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-5 w-5 text-neutral-400" />
              </div>
            </div>
          </div>
          
          <div className="p-4 border-b border-neutral-200">
            <div className="flex items-center space-x-2">
              <span className="text-sm font-medium">Filter:</span>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="text-sm">
                  <SelectValue placeholder="All Chats" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Chats</SelectItem>
                  <SelectItem value="active">Waiting for Admin</SelectItem>
                  <SelectItem value="bot">Bot Handling</SelectItem>
                  <SelectItem value="resolved">Resolved</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto p-2 space-y-2">
            {isLoading ? (
              // Skeleton loading state
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="p-3 bg-white rounded-lg border border-neutral-200">
                  <div className="flex justify-between items-start">
                    <Skeleton className="h-5 w-24" />
                    <div className="flex flex-col items-end">
                      <Skeleton className="h-4 w-16" />
                      <Skeleton className="h-4 w-12 mt-1" />
                    </div>
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
                  isAdmin={true}
                />
              ))
            ) : (
              <div className="text-center py-8 text-neutral-500">
                <p>No matching conversations</p>
                <p className="text-sm">Try changing your filters</p>
              </div>
            )}
          </div>
        </div>
        
        {/* Chat Messages */}
        <div className="flex-1 flex flex-col bg-neutral-50">
          {/* Active user info header */}
          {activeSession && (
            <ChatHeader session={activeSession} isAdmin={true} />
          )}
          
          <div className="flex-1 overflow-y-auto p-4" id="adminChatMessages">
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
            ) : activeSessionId && messages.length > 0 ? (
              <div className="flex flex-col space-y-0">
                {messages.map((message) => (
                  <ChatMessage key={message.id} message={message} isAdmin={true} />
                ))}
                <div ref={messagesEndRef} />
              </div>
            ) : activeSessionId ? (
              <div className="flex flex-col items-center justify-center h-full text-neutral-500">
                <p>No messages in this conversation</p>
                <p className="text-sm">Waiting for user to start chatting</p>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-neutral-500">
                <p>Select a conversation from the sidebar</p>
                <p className="text-sm mt-2">to view and respond to messages</p>
              </div>
            )}
          </div>
          
          {/* Chat input */}
          <ChatInput
            onSendMessage={sendMessage}
            disabled={isSending || !activeSessionId || (activeSession?.status === "resolved")}
            placeholder={
              !activeSessionId
                ? "Select a conversation first..."
                : activeSession?.status === "resolved"
                ? "This conversation has been resolved..."
                : activeSession?.isBotMode
                ? "Bot is handling this conversation..."
                : "Type your response..."
            }
          />
        </div>
      </div>
    </div>
  );
}

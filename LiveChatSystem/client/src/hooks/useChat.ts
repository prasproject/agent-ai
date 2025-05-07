import { useState, useEffect } from "react";
import { ChatSession, ChatMessage } from "@shared/schema";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useWebSocket } from "./useWebSocket";

interface UseChatProps {
  userId: string;
  userName?: string;
  isAdmin?: boolean;
}

export function useChat({ userId, userName = "User", isAdmin = false }: UseChatProps) {
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);
  const { toast } = useToast();

  // WebSocket connection
  const { lastMessage } = useWebSocket(`userId=${isAdmin ? 'admin-' + userId : userId}`);
  
  // Get sessions
  const { 
    data: sessions = [],
    isLoading: isLoadingSessions,
    refetch: refetchSessions
  } = useQuery<ChatSession[]>({
    queryKey: [isAdmin ? '/api/sessions' : `/api/sessions?userId=${userId}`],
  });

  // Get active session
  const {
    data: activeSession,
    isLoading: isLoadingSession
  } = useQuery<ChatSession>({
    queryKey: [`/api/sessions/${activeSessionId}`],
    enabled: activeSessionId !== null,
  });

  // Get messages for active session
  const {
    data: messages = [],
    isLoading: isLoadingMessages,
    refetch: refetchMessages
  } = useQuery<ChatMessage[]>({
    queryKey: [`/api/sessions/${activeSessionId}/messages`],
    enabled: activeSessionId !== null,
  });

  // Create new session
  const createSessionMutation = useMutation({
    mutationFn: async () => {
      console.log("Creating new session with userId:", userId, "userName:", userName);
      const response = await apiRequest('POST', '/api/sessions', {
        userId,
        userName,
        isBotMode: true,
        status: 'active'
      });
      console.log("Session created successfully:", response);
      return response; // apiRequest already returns parsed JSON
    },
    onSuccess: (newSession: ChatSession) => {
      console.log("New session created:", newSession);
      queryClient.invalidateQueries({ queryKey: [isAdmin ? '/api/sessions' : `/api/sessions?userId=${userId}`] });
      setActiveSessionId(newSession.id);
      toast({
        title: "New conversation started",
        description: "You're now connected with our support system.",
      });
    },
    onError: (error) => {
      console.error("Failed to create session:", error);
      toast({
        title: "Error",
        description: "Failed to start a new conversation. Please try again.",
        variant: "destructive",
      });
    }
  });

  // Send message
  const sendMessageMutation = useMutation({
    mutationFn: async (message: string) => {
      if (!activeSessionId) throw new Error("No active session");
      
      // Sender type based on user role
      const sender = isAdmin ? 'admin' : (userId.startsWith('tech') ? 'tech' : 'user');
      console.log(`Sending message as ${sender} to session ${activeSessionId}`);
      
      try {
        // First send the message to our system
        const response = await apiRequest('POST', `/api/sessions/${activeSessionId}/messages`, {
          sender,
          message
        });
        
        console.log("API Response from /api/sessions/" + activeSessionId + "/messages:", response);
        
        // Get the session info (we need to know if this is a Telegram user)
        const sessionData = activeSession;
        
        // For admin or tech support users, try to send to Telegram if this looks like a Telegram chat ID
        if ((isAdmin || userId.startsWith('tech')) && 
            sessionData && 
            (sessionData.userId.startsWith('-') || !isNaN(Number(sessionData.userId)))) {
          try {
            console.log("Sending message to Telegram for chat:", sessionData.userId);
            
            // Send to Telegram webhook
            const telegramResponse = await fetch('/api/telegram/reply', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                sessionId: activeSessionId,
                message: message,
                sender: sender,
                mode: isAdmin ? 'admin' : 'tech' // Add mode parameter as requested
              })
            });
            
            const telegramResult = await telegramResponse.json();
            console.log("Telegram webhook response:", telegramResult);
          } catch (telegramError) {
            console.error('Failed to send to Telegram:', telegramError);
            // We don't need to notify the user because the message was still sent in our system
          }
        }
        
        return response;
      } catch (error) {
        console.error("Error sending message:", error);
        throw error;
      }
    },
    onSuccess: (data) => {
      console.log("Message sent successfully:", data);
      queryClient.invalidateQueries({ queryKey: [`/api/sessions/${activeSessionId}/messages`] });
      
      // Force refetch sessions to update the last message
      setTimeout(() => {
        refetchSessions();
      }, 500); // Short delay to ensure server has processed the message
    },
    onError: (error) => {
      console.error("Failed to send message:", error);
      toast({
        title: "Gagal Mengirim Pesan",
        description: "Pesan tidak terkirim. Silakan coba lagi.",
        variant: "destructive",
      });
    }
  });

  // Process WebSocket messages
  useEffect(() => {
    if (lastMessage) {
      try {
        const data = JSON.parse(lastMessage.data);
        console.log("Processing WebSocket message:", data);
        
        // Handle different message types
        if (data.type === 'new_message' || data.type === 'mode_changed' || data.type === 'session_resolved' || data.type === 'tech_escalation') {
          // If this message is for our active session, refetch messages
          if (data.sessionId === activeSessionId) {
            console.log(`Refetching messages for active session ${activeSessionId}`);
            refetchMessages();
            
            // If session status changed, refetch session details
            if (data.type === 'mode_changed' || data.type === 'session_resolved' || data.type === 'tech_escalation') {
              console.log(`Refetching session details for ${activeSessionId} due to status change: ${data.type}`);
              queryClient.invalidateQueries({ queryKey: [`/api/sessions/${activeSessionId}`] });
            }
          } else {
            console.log(`Message for session ${data.sessionId}, but active session is ${activeSessionId}`);
          }
          
          // Always refetch sessions list to update last message preview
          console.log("Refetching all sessions to update UI");
          refetchSessions();
        } else if (data.type === 'new_session') {
          // For admin only - refetch sessions when a new one is created
          if (isAdmin) {
            console.log("Admin: Refetching sessions after new session created");
            refetchSessions();
          }
        } else if (data.type === 'ping') {
          // Just a ping message to keep connection alive, no need to do anything
          console.log("Received ping message");
        } else {
          console.log(`Unknown message type: ${data.type}`);
        }
      } catch (e) {
        console.error("Error parsing WebSocket message:", e, lastMessage.data);
      }
    }
  }, [lastMessage, activeSessionId, refetchMessages, refetchSessions, isAdmin]);

  // Initialize: Set active session to the most recent active one if available
  useEffect(() => {
    if (sessions.length > 0 && activeSessionId === null) {
      // Find the most recent active session
      const activeSession = sessions.find(s => s.status === 'active');
      if (activeSession) {
        setActiveSessionId(activeSession.id);
      } else if (!isAdmin) {
        // For user, just use the most recent session even if resolved
        setActiveSessionId(sessions[0].id);
      }
    }
  }, [sessions, activeSessionId, isAdmin]);

  return {
    sessions,
    activeSession,
    activeSessionId,
    messages,
    isLoading: isLoadingSessions || isLoadingSession || isLoadingMessages,
    isSending: sendMessageMutation.isPending,
    isCreatingSession: createSessionMutation.isPending,
    setActiveSessionId,
    startNewSession: () => createSessionMutation.mutate(),
    sendMessage: (message: string) => sendMessageMutation.mutate(message),
  };
}

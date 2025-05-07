import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "../components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Avatar, AvatarFallback } from "../components/ui/avatar";
import { Alert, AlertDescription, AlertTitle } from "../components/ui/alert";
import { ScrollArea } from "../components/ui/scroll-area";
import { Textarea } from "../components/ui/textarea";
import { useToast } from "../hooks/use-toast";
import { formatDistanceToNow } from "date-fns";
import { SocketStatus, useSocket } from "../hooks/useSocket";
import { Loader2, AlertTriangle, Check, SendHorizonal } from "lucide-react";

type Message = {
  id: number;
  sessionId: number;
  sender: "user" | "bot" | "admin" | "system" | "tech";
  message: string;
  createdAt: string;
};

type Session = {
  id: number;
  userId: string;
  userName: string;
  isBotMode: boolean;
  status: "active" | "resolved";
  createdAt: string;
  updatedAt: string;
};

const TechDashboard = () => {
  const [activeSessions, setActiveSessions] = useState<Session[]>([]);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [socketStatus, setSocketStatus] = useState<SocketStatus>("disconnected");
  const [newMessage, setNewMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [clickUpTask, setClickUpTask] = useState<{ id?: string; url?: string } | null>(null);
  const userId = "tech-support";

  const { toast } = useToast();
  
  const { socketRef, status, sendJsonMessage } = useSocket({
    userId,
    onMessageReceived: (data: string) => {
      const payload = JSON.parse(data);
      console.log("WebSocket message received in Tech Dashboard:", payload);
      
      if (payload.type === "new_message") {
        if (selectedSession && payload.sessionId === selectedSession.id) {
          setMessages((prev) => [...prev, payload.message]);
        }
      } else if (payload.type === "new_tech_issue") {
        // Handle new technical issue escalated from admin
        console.log("New tech issue with ClickUp task:", payload.clickUpTask);
        
        // Save ClickUp task info if available
        if (payload.clickUpTask) {
          console.log("Setting clickUpTask state to:", payload.clickUpTask);
          setClickUpTask(payload.clickUpTask);
        }
        
        const clickupInfo = payload.clickUpTask && payload.clickUpTask.url ? 
          `\nClickUp task created: ${payload.clickUpTask.url}` : 
          '';
          
        toast({
          title: "New Technical Issue",
          description: `Session ${payload.sessionId} has been escalated to technical support. Reason: ${payload.reason}${clickupInfo}`,
          variant: "default",
        });
        
        // Refresh active sessions list
        fetchSessions();
        
        // Automatically select the session if no session is selected
        if (!selectedSession) {
          fetchSession(payload.sessionId);
        } else if (selectedSession.id === payload.sessionId) {
          // If we're already viewing this session, update clickUpTask
          setClickUpTask(payload.clickUpTask);
        }
      } else if (payload.type === "session_resolved") {
        toast({
          title: "Session Resolved",
          description: `Session ${payload.sessionId} has been marked as resolved.`,
          variant: "default",
        });
        
        // Refresh active sessions
        fetchSessions();
        
        // If currently viewing the resolved session, refresh it
        if (selectedSession && payload.sessionId === selectedSession.id) {
          fetchSession(payload.sessionId);
        }
      }
    },
  });

  const fetchSessions = async () => {
    try {
      const response = await fetch("/api/sessions");
      const data = await response.json();
      setActiveSessions(data || []);
    } catch (error) {
      console.error("Error fetching sessions:", error);
      toast({
        title: "Error",
        description: "Failed to fetch active chat sessions",
        variant: "destructive",
      });
    }
  };

  const fetchSession = async (sessionId: number) => {
    try {
      const response = await fetch(`/api/sessions/${sessionId}`);
      if (!response.ok) throw new Error("Session not found");
      const session = await response.json();
      setSelectedSession(session);
      fetchMessages(sessionId);
    } catch (error) {
      console.error("Error fetching session:", error);
      toast({
        title: "Error",
        description: "Failed to fetch session details",
        variant: "destructive",
      });
    }
  };

  const fetchMessages = async (sessionId: number) => {
    try {
      const response = await fetch(`/api/sessions/${sessionId}/messages`);
      if (!response.ok) throw new Error("Failed to fetch messages");
      const messages = await response.json();
      setMessages(messages || []);
      
      // Check for ClickUp task URL in system messages
      if (messages && messages.length > 0) {
        // Look for system messages that mention ClickUp
        const clickUpMessage = messages.find(
          (msg: Message) => 
            msg.sender === "system" && 
            msg.message.includes("ClickUp") && 
            msg.message.includes("https://app.clickup.com")
        );
        
        if (clickUpMessage) {
          // Extract ClickUp task URL and ID using regex
          const urlMatch = clickUpMessage.message.match(/(https:\/\/app\.clickup\.com\/t\/[a-zA-Z0-9]+)/);
          const idMatch = clickUpMessage.message.match(/\/t\/([a-zA-Z0-9]+)/);
          
          if (urlMatch && idMatch) {
            setClickUpTask({
              url: urlMatch[1],
              id: idMatch[1]
            });
          }
        }
      }
    } catch (error) {
      console.error("Error fetching messages:", error);
      toast({
        title: "Error",
        description: "Failed to fetch chat messages",
        variant: "destructive",
      });
    }
  };

  const sendMessage = async () => {
    if (!selectedSession || !newMessage.trim()) return;

    setIsLoading(true);
    const messageText = newMessage.trim();
    setNewMessage(""); // Clear input immediately for better UX
    
    try {
      // First create a local message optimistically
      const tempMessage: Message = {
        id: -1, // Temporary ID
        sessionId: selectedSession.id,
        sender: "tech",
        message: messageText,
        createdAt: new Date().toISOString(),
      };
      
      // Add message to local state immediately for instant feedback
      setMessages(prevMessages => [...prevMessages, tempMessage]);

      // Add small delay before sending to prevent possible race conditions
      await new Promise(resolve => setTimeout(resolve, 50));
      
      console.log("Sending tech support message:", messageText);
      
      // Then send the message to the server
      try {
        const response = await fetch(`/api/sessions/${selectedSession.id}/messages`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            sender: "tech",
            message: messageText,
          }),
        });
        
        if (!response.ok) {
          throw new Error(`Server returned ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        console.log("Message sent successfully, server response:", data);
      } catch (error) {
        console.error("Error sending message to server:", error);
        toast({
          title: "Error",
          description: "Failed to send message to server",
          variant: "destructive",
        });
      }
      
      // Try to send to Telegram in parallel if this is a Telegram user
      if (selectedSession.userId.startsWith('-') || !isNaN(Number(selectedSession.userId))) {
        try {
          const telegramResponse = await fetch('/api/telegram/reply', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              sessionId: selectedSession.id,
              message: messageText,
              sender: 'tech'
            })
          });
          
          if (!telegramResponse.ok) {
            throw new Error(`Telegram API returned ${telegramResponse.status}`);
          }
          
          console.log("Message sent to Telegram successfully");
        } catch (telegramError) {
          console.error('Failed to send to Telegram:', telegramError);
        }
      }
      
    } catch (error) {
      console.error("Error in message sending process:", error);
      toast({
        title: "Error",
        description: "Failed to process message",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const resolveSession = async () => {
    if (!selectedSession) return;

    try {
      const response = await fetch(`/api/sessions/${selectedSession.id}/resolve`, {
        method: "POST",
      });

      if (!response.ok) throw new Error("Failed to resolve session");
      
      toast({
        title: "Success",
        description: "Session has been resolved successfully",
        variant: "default",
      });
      
      // Refresh the session to get updated status
      fetchSession(selectedSession.id);
      
      // Refresh the active sessions list
      fetchSessions();
    } catch (error) {
      console.error("Error resolving session:", error);
      toast({
        title: "Error",
        description: "Failed to resolve chat session",
        variant: "destructive",
      });
    }
  };

  // Initial data loading
  useEffect(() => {
    fetchSessions();
    setSocketStatus(status);
  }, [status]);

  // Selection change handling
  useEffect(() => {
    if (selectedSession) {
      fetchMessages(selectedSession.id);
    }
  }, [selectedSession?.id]);

  // Status change effects
  useEffect(() => {
    const timer = setInterval(() => {
      fetchSessions();
      if (selectedSession) {
        fetchMessages(selectedSession.id);
      }
    }, 30000); // Refresh every 30 seconds

    return () => clearInterval(timer);
  }, [selectedSession]);

  const MessageComponent = ({ message }: { message: Message }) => {
    let className = "flex gap-2 mb-4 ";
    let avatarContent = "";

    switch (message.sender) {
      case "user":
        className += "justify-start";
        avatarContent = "U";
        break;
      case "bot":
        className += "justify-start";
        avatarContent = "B";
        break;
      case "admin":
        className += "justify-start";
        avatarContent = "A";
        break;
      case "tech":
        className += "justify-end";
        avatarContent = "T";
        break;
      case "system":
        return (
          <div className="flex justify-center my-2">
            <Badge variant="outline" className="bg-muted/50">
              {message.message}
            </Badge>
          </div>
        );
    }

    const bgColorClass =
      message.sender === "tech"
        ? "bg-primary text-primary-foreground"
        : message.sender === "bot"
        ? "bg-muted"
        : "bg-accent";

    return (
      <div className={className}>
        {message.sender !== "tech" && (
          <Avatar className="mt-1 h-8 w-8">
            <AvatarFallback className="text-xs bg-muted">{avatarContent}</AvatarFallback>
          </Avatar>
        )}
        <div
          className={`${bgColorClass} p-3 rounded-lg max-w-[80%] break-words whitespace-pre-wrap`}
        >
          <div className="text-sm">{message.message}</div>
          <div className="text-xs opacity-70 mt-1 text-right">
            {new Date(message.createdAt).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </div>
        </div>
        {message.sender === "tech" && (
          <Avatar className="mt-1 h-8 w-8">
            <AvatarFallback className="text-xs bg-primary text-primary-foreground">
              {avatarContent}
            </AvatarFallback>
          </Avatar>
        )}
      </div>
    );
  };

  return (
    <div className="flex h-full w-full">
      {/* Sessions List */}
      <div className="w-80 border-r h-full overflow-hidden flex flex-col">
        <div className="p-4 border-b">
          <h2 className="text-lg font-semibold flex items-center">
            <AlertTriangle className="h-5 w-5 mr-2 text-yellow-500" />
            Technical Support
          </h2>
          <p className="text-sm text-muted-foreground">
            Manage chat sessions escalated from customer support
          </p>
          <div className="mt-2 flex items-center">
            <Badge
              variant={socketStatus === "connected" ? "default" : "destructive"}
              className="gap-1"
            >
              {socketStatus === "connected" ? (
                <>
                  <span className="h-2 w-2 rounded-full bg-green-500"></span>
                  Connected
                </>
              ) : (
                <>
                  <span className="h-2 w-2 rounded-full bg-red-500"></span>
                  Disconnected
                </>
              )}
            </Badge>
          </div>
        </div>

        <Tabs defaultValue="active" className="flex-1 flex flex-col">
          <div className="border-b px-4">
            <TabsList className="w-full">
              <TabsTrigger value="active" className="flex-1">
                Active
              </TabsTrigger>
              <TabsTrigger value="resolved" className="flex-1">
                Resolved
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="active" className="flex-1 overflow-hidden">
            <ScrollArea className="h-full">
              {activeSessions.filter(s => s.status === "active").length === 0 ? (
                <div className="p-4 text-center text-muted-foreground text-sm">
                  No active sessions
                </div>
              ) : (
                activeSessions
                  .filter(s => s.status === "active")
                  .map((session) => (
                    <button
                      key={session.id}
                      className={`w-full text-left p-3 border-b hover:bg-muted/50 transition-colors ${
                        selectedSession?.id === session.id ? "bg-muted" : ""
                      }`}
                      onClick={() => setSelectedSession(session)}
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <span className="font-medium">{session.userName}</span>
                          <div className="text-sm text-muted-foreground">
                            ID: {session.userId}
                          </div>
                        </div>
                        <Badge variant="outline" className="ml-2">
                          {formatDistanceToNow(new Date(session.updatedAt), {
                            addSuffix: true,
                          })}
                        </Badge>
                      </div>
                    </button>
                  ))
              )}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="resolved" className="flex-1 overflow-hidden">
            <ScrollArea className="h-full">
              {activeSessions.filter(s => s.status === "resolved").length === 0 ? (
                <div className="p-4 text-center text-muted-foreground text-sm">
                  No resolved sessions
                </div>
              ) : (
                activeSessions
                  .filter(s => s.status === "resolved")
                  .map((session) => (
                    <button
                      key={session.id}
                      className={`w-full text-left p-3 border-b hover:bg-muted/50 transition-colors ${
                        selectedSession?.id === session.id ? "bg-muted" : ""
                      }`}
                      onClick={() => setSelectedSession(session)}
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <span className="font-medium">{session.userName}</span>
                          <div className="text-sm text-muted-foreground">
                            ID: {session.userId}
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <Badge variant="outline" className="bg-green-50">
                            Resolved
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(session.updatedAt), {
                              addSuffix: true,
                            })}
                          </span>
                        </div>
                      </div>
                    </button>
                  ))
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </div>

      {/* Chat Window */}
      <div className="flex-1 flex flex-col h-full">
        {selectedSession ? (
          <>
            <div className="border-b p-4 flex justify-between items-center">
              <div>
                <h2 className="font-semibold text-lg flex items-center">
                  {selectedSession.userName}
                  {selectedSession.status === "resolved" && (
                    <Badge variant="outline" className="ml-2 bg-green-50">
                      <Check className="h-3 w-3 mr-1" />
                      Resolved
                    </Badge>
                  )}
                </h2>
                <p className="text-sm text-muted-foreground">
                  ID: {selectedSession.userId} • Session #{selectedSession.id}
                </p>
                {clickUpTask && clickUpTask.url && (
                  <p className="text-sm mt-1">
                    <a 
                      href={clickUpTask.url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline flex items-center"
                    >
                      <svg className="w-4 h-4 mr-1" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z" />
                        <path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z" />
                      </svg>
                      View ClickUp Task #{clickUpTask.id}
                    </a>
                  </p>
                )}
              </div>
              <div>
                {selectedSession.status === "active" && (
                  <Button onClick={resolveSession} variant="outline" size="sm">
                    <Check className="h-4 w-4 mr-1" />
                    Mark as Resolved
                  </Button>
                )}
              </div>
            </div>

            <div className="flex-1 p-4 overflow-auto">
              {messages.length === 0 ? (
                <div className="h-full flex items-center justify-center">
                  <div className="text-center text-muted-foreground">
                    <p>No messages yet</p>
                  </div>
                </div>
              ) : (
                messages.map((message) => (
                  <MessageComponent key={message.id} message={message} />
                ))
              )}
            </div>

            {selectedSession.status === "active" && (
              <div className="p-4 border-t">
                <div className="flex gap-2">
                  <Textarea
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    placeholder="Type your message..."
                    className="flex-1"
                    disabled={isLoading}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        sendMessage();
                      }
                    }}
                  />
                  <Button
                    onClick={sendMessage}
                    disabled={!newMessage.trim() || isLoading}
                  >
                    {isLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <SendHorizonal className="h-4 w-4" />
                    )}
                    <span className="sr-only">Send</span>
                  </Button>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="h-full flex items-center justify-center p-4">
            <Card className="w-[400px]">
              <CardHeader>
                <CardTitle>Technical Support Dashboard</CardTitle>
                <CardDescription>
                  Handle technical issues escalated from customer support
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Technical Support Mode</AlertTitle>
                  <AlertDescription>
                    You are logged in as a technical support agent. Select a conversation from the sidebar to start helping customers with complex technical issues.
                  </AlertDescription>
                </Alert>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
};

export default TechDashboard;
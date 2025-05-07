import { useEffect, useRef, useState } from "react";

export type SocketStatus = "connecting" | "connected" | "disconnected";

// Extend WebSocket type to include custom properties
interface ExtendedWebSocket extends WebSocket {
  _pingIntervalId?: number;
}

interface UseSocketOptions {
  userId: string;
  onMessageReceived: (data: string) => void;
}

export function useSocket({ userId, onMessageReceived }: UseSocketOptions) {
  const socketRef = useRef<ExtendedWebSocket | null>(null);
  const [status, setStatus] = useState<SocketStatus>("disconnected");
  const reconnectTimeoutRef = useRef<number | null>(null);

  // Keep track of connection attempts
  const reconnectAttemptsRef = useRef(0);
  const MAX_RECONNECT_ATTEMPTS = 10;
  const INITIAL_RECONNECT_DELAY = 1000; // 1 second initial delay

  // Exponential backoff for reconnection
  const getReconnectDelay = () => {
    const attempts = reconnectAttemptsRef.current;
    const baseDelay = INITIAL_RECONNECT_DELAY;
    // Add jitter to avoid thundering herd problem (all clients reconnecting simultaneously)
    const jitter = Math.random() * 1000;
    // Cap at 30 seconds maximum delay
    return Math.min(baseDelay * Math.pow(1.5, attempts) + jitter, 30000);
  };

  const resetReconnectAttempts = () => {
    reconnectAttemptsRef.current = 0;
  };

  const connect = () => {
    try {
      // Disconnect existing socket if it exists
      if (socketRef.current) {
        if (socketRef.current.readyState === WebSocket.OPEN || 
            socketRef.current.readyState === WebSocket.CONNECTING) {
          socketRef.current.close(1000, "Reconnecting");
        }
        socketRef.current = null;
      }
      
      // Don't try to connect if we don't have a userId
      if (!userId) {
        console.warn("Not connecting WebSocket: missing userId");
        return;
      }
      
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.host}/ws?userId=${userId}`;
      
      console.log(`Connecting to WebSocket (attempt ${reconnectAttemptsRef.current + 1}):`, wsUrl);
      setStatus("connecting");
      const socket = new WebSocket(wsUrl) as ExtendedWebSocket;
      
      // Set a connection timeout
      const connectionTimeoutId = window.setTimeout(() => {
        if (socket.readyState !== WebSocket.OPEN) {
          console.warn("WebSocket connection timed out");
          // Force close and let onclose handler deal with reconnection
          socket.close(4000, "Connection timeout");
        }
      }, 10000); // 10 second connection timeout
      
      socket.onopen = () => {
        console.log("WebSocket connected");
        setStatus("connected");
        resetReconnectAttempts();
        
        // Clear the connection timeout
        window.clearTimeout(connectionTimeoutId);
        
        // Send a ping message every 30 seconds to keep the connection alive
        const pingIntervalId = window.setInterval(() => {
          if (socket.readyState === WebSocket.OPEN) {
            try {
              // Send simple ping message to keep connection alive
              socket.send(JSON.stringify({ type: "ping", timestamp: Date.now() }));
            } catch (err) {
              console.error("Error sending ping:", err);
            }
          } else {
            window.clearInterval(pingIntervalId);
          }
        }, 30000);
        
        // Store the interval ID so we can clear it when we disconnect
        (socket as ExtendedWebSocket)._pingIntervalId = pingIntervalId;
      };
      
      socket.onmessage = (event) => {
        try {
          const data = event.data;
          // Don't log ping responses
          if (typeof data === 'string' && !data.includes('"type":"ping"')) {
            console.log("WebSocket message received:", typeof data === 'string' ? data.substring(0, 100) : data);
          }
          onMessageReceived(event.data);
        } catch (err) {
          console.error("Error handling WebSocket message:", err);
        }
      };
      
      socket.onclose = (event) => {
        console.log("WebSocket closed:", event.code, event.reason);
        setStatus("disconnected");
        
        // Clear the connection timeout if it's still active
        window.clearTimeout(connectionTimeoutId);
        
        // Clear ping interval if it exists
        if ((socket as ExtendedWebSocket)._pingIntervalId) {
          window.clearInterval((socket as ExtendedWebSocket)._pingIntervalId);
        }
        
        // Set up reconnection attempt
        if (reconnectTimeoutRef.current) {
          window.clearTimeout(reconnectTimeoutRef.current);
        }
        
        // Only reconnect if code is not 1000 (normal closure) or 1001 (going away)
        if (event.code !== 1000 && event.code !== 1001) {
          // Count this as a reconnection attempt
          reconnectAttemptsRef.current++;
          
          // Only attempt to reconnect if we haven't exceeded the maximum number of attempts
          if (reconnectAttemptsRef.current <= MAX_RECONNECT_ATTEMPTS) {
            const delay = getReconnectDelay();
            console.log(`Setting up reconnection in ${Math.round(delay/1000)} seconds (attempt ${reconnectAttemptsRef.current})...`);
            
            reconnectTimeoutRef.current = window.setTimeout(() => {
              console.log(`Attempting to reconnect WebSocket (attempt ${reconnectAttemptsRef.current})...`);
              connect();
            }, delay);
          } else {
            console.error(`Failed to reconnect after ${MAX_RECONNECT_ATTEMPTS} attempts`);
            // Maybe show a notification to the user here
          }
        }
      };
      
      socket.onerror = (event) => {
        console.error("WebSocket error:", event);
        // Don't immediately close, let the error trigger the onclose handler
      };
      
      socketRef.current = socket;
    } catch (error) {
      console.error("Failed to connect to WebSocket:", error);
      setStatus("disconnected");
      
      // Try to reconnect after error
      if (reconnectTimeoutRef.current) {
        window.clearTimeout(reconnectTimeoutRef.current);
      }
      
      // Count this as a reconnection attempt
      reconnectAttemptsRef.current++;
      
      // Only attempt to reconnect if we haven't exceeded the maximum number of attempts
      if (reconnectAttemptsRef.current <= MAX_RECONNECT_ATTEMPTS) {
        const delay = getReconnectDelay();
        console.log(`Setting up reconnection after error in ${Math.round(delay/1000)} seconds (attempt ${reconnectAttemptsRef.current})...`);
        
        reconnectTimeoutRef.current = window.setTimeout(() => {
          console.log(`Attempting to reconnect after connection error (attempt ${reconnectAttemptsRef.current})...`);
          connect();
        }, delay);
      } else {
        console.error(`Failed to reconnect after ${MAX_RECONNECT_ATTEMPTS} attempts`);
        // Maybe show a notification to the user here
      }
    }
  };

  const disconnect = () => {
    if (socketRef.current) {
      // Clear ping interval if it exists
      if ((socketRef.current as ExtendedWebSocket)._pingIntervalId) {
        window.clearInterval((socketRef.current as ExtendedWebSocket)._pingIntervalId);
      }
      
      // Only try to close if socket is open or connecting
      if (socketRef.current.readyState === WebSocket.OPEN || 
          socketRef.current.readyState === WebSocket.CONNECTING) {
        socketRef.current.close(1000, "Component unmounted");
      }
      
      socketRef.current = null;
    }
    
    // Clear any pending reconnection timeout
    if (reconnectTimeoutRef.current) {
      window.clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    
    // Reset reconnection attempts on clean disconnect
    resetReconnectAttempts();
    
    // Update status
    setStatus("disconnected");
  };

  useEffect(() => {
    connect();
    
    return () => {
      disconnect();
    };
  }, [userId]);

  const sendJsonMessage = (data: any) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify(data));
      return true;
    }
    return false;
  };

  return { 
    socketRef: socketRef as React.MutableRefObject<WebSocket | null>,
    status, 
    sendJsonMessage, 
    connect, 
    disconnect 
  };
}
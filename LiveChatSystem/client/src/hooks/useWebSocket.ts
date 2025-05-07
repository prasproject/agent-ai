import { useState, useEffect, useRef } from "react";

export function useWebSocket(queryParams = "") {
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<MessageEvent | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const MAX_RECONNECT_ATTEMPTS = 15;
  const pingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Connection setup
    const setupWebSocket = () => {
      try {
        // Clean up existing socket if any
        if (socketRef.current) {
          if (socketRef.current.readyState === WebSocket.OPEN || 
              socketRef.current.readyState === WebSocket.CONNECTING) {
            socketRef.current.close(1000, "Reconnecting");
          }
          socketRef.current = null;
        }
        
        // Clean up existing ping interval if any
        if (pingIntervalRef.current) {
          clearInterval(pingIntervalRef.current);
          pingIntervalRef.current = null;
        }
        
        // Create WebSocket URL with proper formatting for query parameters
        const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        const wsUrl = `${protocol}//${window.location.host}/ws${queryParams ? `?${queryParams}` : ''}`;
        
        console.log(`WebSocket connecting (attempt ${reconnectAttemptsRef.current + 1}):`, wsUrl);
        
        const socket = new WebSocket(wsUrl);
        socketRef.current = socket;
  
        // Connection timeout to detect stuck connections
        const connectionTimeoutId = setTimeout(() => {
          if (socket.readyState !== WebSocket.OPEN) {
            console.warn("WebSocket connection timeout");
            socket.close(4000, "Connection timeout");
          }
        }, 10000);
  
        socket.onopen = () => {
          console.log("WebSocket connected");
          setIsConnected(true);
          
          // Clear connection timeout
          clearTimeout(connectionTimeoutId);
          
          // Reset reconnect attempts on successful connection
          reconnectAttemptsRef.current = 0;
          
          // Clear any reconnect timeouts
          if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
            reconnectTimeoutRef.current = null;
          }
          
          // Setup ping interval to keep connection alive
          pingIntervalRef.current = setInterval(() => {
            if (socket.readyState === WebSocket.OPEN) {
              try {
                // Send ping to keep connection alive
                socket.send(JSON.stringify({ type: "ping", timestamp: Date.now() }));
              } catch (err) {
                console.error("Error sending WebSocket ping:", err);
              }
            } else {
              // Clean up interval if socket is not open
              if (pingIntervalRef.current) {
                clearInterval(pingIntervalRef.current);
                pingIntervalRef.current = null;
              }
            }
          }, 30000); // Send ping every 30 seconds
        };
  
        socket.onclose = (event) => {
          console.log(`WebSocket closed: ${event.code} ${event.reason || ''}`);
          setIsConnected(false);
          
          // Clear connection timeout
          clearTimeout(connectionTimeoutId);
          
          // Clean up ping interval
          if (pingIntervalRef.current) {
            clearInterval(pingIntervalRef.current);
            pingIntervalRef.current = null;
          }
          
          // Schedule reconnect if closed abnormally
          if (event.code !== 1000 && event.code !== 1001) {
            // Increment reconnect attempts
            reconnectAttemptsRef.current++;
            
            // Calculate backoff delay (exponential with jitter)
            const baseDelay = 1000; // 1 second base
            const jitter = Math.random() * 1000; // Random 0-1000ms
            const delay = Math.min(
              baseDelay * Math.pow(1.5, reconnectAttemptsRef.current) + jitter, 
              30000 // Max 30 seconds
            );
            
            if (reconnectAttemptsRef.current <= MAX_RECONNECT_ATTEMPTS) {
              console.log(`Reconnecting in ${Math.round(delay/1000)}s (attempt ${reconnectAttemptsRef.current}/${MAX_RECONNECT_ATTEMPTS})`);
              
              // Clear any existing timeout
              if (reconnectTimeoutRef.current) {
                clearTimeout(reconnectTimeoutRef.current);
              }
              
              // Schedule reconnection
              reconnectTimeoutRef.current = setTimeout(() => {
                setupWebSocket();
              }, delay);
            } else {
              console.error(`Maximum reconnection attempts (${MAX_RECONNECT_ATTEMPTS}) reached. WebSocket permanently disconnected.`);
            }
          }
        };
  
        socket.onerror = (error) => {
          console.error("WebSocket error:", error);
          // Let onclose handle the reconnection logic
        };
  
        socket.onmessage = (event) => {
          try {
            // Only log non-ping messages to avoid console clutter
            if (typeof event.data === 'string' && !event.data.includes('"type":"ping"')) {
              console.log("WebSocket message:", typeof event.data === 'string' ? JSON.parse(event.data) : event.data);
            }
            setLastMessage(event);
          } catch (err) {
            console.error("Error processing WebSocket message:", err);
          }
        };
      } catch (error) {
        console.error("Error setting up WebSocket:", error);
        // Try to reconnect after error in setup
        reconnectAttemptsRef.current++;
        if (reconnectAttemptsRef.current <= MAX_RECONNECT_ATTEMPTS) {
          const delay = 3000 * reconnectAttemptsRef.current; // Simple backoff
          console.log(`Error in setup. Reconnecting in ${delay/1000}s (attempt ${reconnectAttemptsRef.current}/${MAX_RECONNECT_ATTEMPTS})`);
          reconnectTimeoutRef.current = setTimeout(setupWebSocket, delay);
        }
      }
    };

    // Initial connection
    setupWebSocket();

    // Cleanup on component unmount
    return () => {
      if (socketRef.current) {
        socketRef.current.close(1000, "Component unmounted");
        socketRef.current = null;
      }
      
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = null;
      }
    };
  }, [queryParams]); // Re-connect if queryParams change

  // Send method with improved error handling
  const sendMessage = (data: any) => {
    if (!socketRef.current) {
      console.error("Cannot send message: WebSocket is not initialized");
      return false;
    }
    
    if (socketRef.current.readyState !== WebSocket.OPEN) {
      console.error(`Cannot send message: WebSocket is not open (state: ${socketRef.current.readyState})`);
      return false;
    }
    
    try {
      const messageToSend = typeof data === 'string' ? data : JSON.stringify(data);
      socketRef.current.send(messageToSend);
      return true;
    } catch (error) {
      console.error("Error sending WebSocket message:", error);
      return false;
    }
  };

  // Manual reconnect function for external use
  const reconnect = () => {
    console.log("Manual WebSocket reconnection requested");
    reconnectAttemptsRef.current = 0; // Reset attempts counter for manual reconnect
    
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    
    if (socketRef.current) {
      if (socketRef.current.readyState === WebSocket.OPEN || 
          socketRef.current.readyState === WebSocket.CONNECTING) {
        socketRef.current.close(1000, "Manual reconnect");
      }
      socketRef.current = null;
    }
    
    // Setup a new connection immediately
    setTimeout(() => {
      if (socketRef.current === null) {
        const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        const wsUrl = `${protocol}//${window.location.host}/ws${queryParams ? `?${queryParams}` : ''}`;
        
        console.log("Manual reconnection to:", wsUrl);
        const socket = new WebSocket(wsUrl);
        socketRef.current = socket;
        
        // Set up standard handlers
        socket.onopen = () => {
          console.log("WebSocket manually reconnected");
          setIsConnected(true);
        };
        
        socket.onclose = (event) => {
          console.log(`Manually reconnected WebSocket closed: ${event.code} ${event.reason || ''}`);
          setIsConnected(false);
        };
        
        socket.onerror = (error) => {
          console.error("Manually reconnected WebSocket error:", error);
        };
        
        socket.onmessage = (event) => {
          try {
            if (typeof event.data === 'string' && !event.data.includes('"type":"ping"')) {
              console.log("WebSocket message:", typeof event.data === 'string' ? JSON.parse(event.data) : event.data);
            }
            setLastMessage(event);
          } catch (err) {
            console.error("Error processing WebSocket message:", err);
          }
        };
      }
    }, 100);
  };

  return { 
    isConnected, 
    lastMessage, 
    sendMessage,
    reconnect // Expose manual reconnect function
  };
}

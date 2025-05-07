import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { 
  insertChatSessionSchema, 
  insertChatMessageSchema, 
  chatbotRequestSchema,
  modeSwitchSchema,
  editUserNameSchema,
  escalationSchema,
  telegramMessageSchema,
  telegramReplySchema,
  InsertChatMessage
} from "@shared/schema";
import { ZodError } from "zod";
import { fromZodError } from "zod-validation-error";
import axios from "axios";
import { WebSocketServer, WebSocket } from "ws";

// Keep track of all active WebSocket connections
const clients: Map<string, Set<WebSocket>> = new Map();

// Tambahkan cache untuk menyimpan pesan yang perlu dikirim saat klien terhubung kembali
type CachedMessage = {
  sessionId: number;
  type: string;
  message: any;
  timestamp: number;
};

// Cache pesan untuk setiap userId
const messageCache: Map<string, CachedMessage[]> = new Map();

// Maksimal waktu cache pesan (10 menit dalam milidetik)
const MAX_CACHE_AGE = 10 * 60 * 1000;

const CHATBOT_API_URL = "https://deny1234.app.n8n.cloud/webhook/livechat";
const TELEGRAM_WEBHOOK_URL = "https://deny1234.app.n8n.cloud/webhook/sendtele";
const CLICKUP_API_URL = "https://api.clickup.com/api/v2";
const CLICKUP_LIST_ID = "901807455981"; // List ID yang bekerja sesuai contoh Postman dari user

/**
 * Create a ClickUp task for escalated technical issues
 */
async function createClickUpTask(sessionId: number, userName: string, reason: string, chatHistory: string) {
  try {
    const clickUpToken = process.env.CLICKUP_API_TOKEN || 'pk_282657896_62N81LHI4MYT2X3P6A3D4V97X5RRWKMR';
    
    if (!clickUpToken) {
      console.error("ClickUp API token not found in environment variables");
      return null;
    }
    
    console.log("Creating ClickUp task with Personal API Token");
    
    // Sesuai dengan dokumentasi ClickUp: https://developer.clickup.com/docs/authentication#personal-token
    // Personal API token (pk_) harus disertakan langsung di Authorization header
    // TIDAK menggunakan kredensial Client ID dan Client Secret
    const headers = {
      'Authorization': clickUpToken, // Token dalam format: pk_XXXX
      'Content-Type': 'application/json'
    };
    
    console.log(`Using Authorization: ${clickUpToken.substring(0, 10)}...`);
    
    // Format sesuai dengan contoh curl request dari user
    const response = await axios.post(
      `${CLICKUP_API_URL}/list/${CLICKUP_LIST_ID}/task`,
      {
        name: `Tech Escalation: ${userName} - Session #${sessionId}`,
        description: `## Escalation Reason\n${reason}\n\n## Chat History\n${chatHistory}`,
        assignees: [282657896], // User ID dari contoh curl
        status: "to do",
        priority: 2, // High priority
        tags: ["escalation", "tech-support", "live-chat", "majoocare"],
        due_date: Math.floor(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 hari dari sekarang dalam milliseconds
      },
      { headers }
    );
    
    console.log("ClickUp task created successfully:", response.data);
    return response.data;
  } catch (error: any) {
    console.error("Error creating ClickUp task:", error.message);
    if (error.response) {
      console.error("ClickUp API error response:", error.response.status, error.response.data);
    }
    return null;
  }
}

async function callChatbotAPI(name: string, message: string, id_cabang: string = "main") {
  const formData = new FormData();
  formData.append("name", name);
  formData.append("message", message);
  formData.append("id_cabang", id_cabang);

  try {
    console.log(`Calling chatbot API with: name=${name}, message=${message}, id_cabang=${id_cabang}`);
    const response = await axios.post(CHATBOT_API_URL, formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    });
    console.log("Chatbot API response:", response.data);
    return response.data;
  } catch (error) {
    console.error("Error calling chatbot API:", error);
    throw error;
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  const httpServer = createServer(app);

  // Set up WebSocket server
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  // Fungsi untuk menambahkan pesan ke cache
  function addMessageToCache(targetUserId: string, type: string, sessionId: number, message: any) {
    // Inisialisasi array cache jika belum ada
    if (!messageCache.has(targetUserId)) {
      messageCache.set(targetUserId, []);
    }
    
    // Tambahkan pesan ke cache
    messageCache.get(targetUserId)?.push({
      type,
      sessionId,
      message,
      timestamp: Date.now()
    });
    
    console.log(`Pesan untuk ${targetUserId} disimpan di cache: ${JSON.stringify(message).substring(0, 50)}...`);
  }
  
  // Fungsi untuk mengirim pesan dari cache
  function sendCachedMessages(userId: string, ws: WebSocket) {
    if (!messageCache.has(userId)) return;
    
    const cache = messageCache.get(userId) || [];
    console.log(`Checking cached messages for ${userId}, found ${cache.length} messages`);
    
    if (cache.length === 0) return;
    
    // Hanya kirim pesan yang belum kadaluwarsa
    const now = Date.now();
    const validMessages = cache.filter(msg => (now - msg.timestamp) < MAX_CACHE_AGE);
    
    console.log(`Sending ${validMessages.length} cached messages to ${userId}`);
    
    // Kirim semua pesan valid
    validMessages.forEach(cachedMsg => {
      try {
        if (ws.readyState === WebSocket.OPEN) {
          const message = {
            type: cachedMsg.type,
            sessionId: cachedMsg.sessionId,
            message: cachedMsg.message
          };
          ws.send(JSON.stringify(message));
          console.log(`Cached message sent to ${userId}: ${cachedMsg.type} for session ${cachedMsg.sessionId}`);
        }
      } catch (err) {
        console.error(`Error sending cached message to ${userId}:`, err);
      }
    });
    
    // Hapus cache setelah selesai mengirim semua pesan
    messageCache.delete(userId);
  }
  
  wss.on('connection', (ws, req) => {
    const userId = req.url?.split('?userId=')[1] || 'anonymous';
    
    // Initialize user's client set if it doesn't exist
    if (!clients.has(userId)) {
      clients.set(userId, new Set());
    }
    
    // Add this connection to the user's set
    clients.get(userId)?.add(ws);
    
    console.log(`WebSocket connected: ${userId}`);
    
    // Kirim pesan cache jika ada
    sendCachedMessages(userId, ws);
    
    ws.on('close', () => {
      console.log(`WebSocket disconnected: ${userId}`);
      clients.get(userId)?.delete(ws);
      
      // Clean up empty sets
      if (clients.get(userId)?.size === 0) {
        clients.delete(userId);
      }
    });
  });

  // Broadcast to specific user
  function broadcastToUser(userId: string, message: any) {
    console.log(`Attempting to broadcast to user ${userId}`);
    const userClients = clients.get(userId);
    
    if (!userClients || userClients.size === 0) {
      console.log(`No active connections for user ${userId}`);
      
      // Cache pesan untuk dikirim nanti saat user terhubung
      if (message.type === 'new_message' && message.sessionId && message.message) {
        console.log(`Menyimpan pesan untuk user ${userId} di cache`);
        addMessageToCache(userId, message.type, message.sessionId, message.message);
      }
      return;
    }
    
    console.log(`Found ${userClients.size} connection(s) for user ${userId}`);
    let sentCount = 0;
    
    userClients.forEach(client => {
      try {
        if (client.readyState === WebSocket.OPEN) {
          const messageStr = JSON.stringify(message);
          client.send(messageStr);
          sentCount++;
          console.log(`Message sent to ${userId} (${messageStr.substring(0, 50)}...)`);
        } else {
          console.log(`Client for ${userId} not in OPEN state: ${client.readyState}`);
        }
      } catch (error) {
        console.error(`Error sending message to ${userId}:`, error);
      }
    });
    
    console.log(`Successfully sent message to ${sentCount}/${userClients.size} connections for ${userId}`);
    
    // Jika tidak ada pesan yang terkirim, cache pesan
    if (sentCount === 0 && message.type === 'new_message' && message.sessionId && message.message) {
      console.log(`Semua koneksi tidak aktif. Menyimpan pesan untuk user ${userId} di cache`);
      addMessageToCache(userId, message.type, message.sessionId, message.message);
    }
  }

  // Broadcast to all admin users
  function broadcastToAdmins(message: any) {
    console.log("Attempting to broadcast to all admin users");
    let adminCount = 0;
    let sentCount = 0;
    let hasAdmins = false;
    
    // For simplicity, we're assuming admin userId starts with 'admin'
    // In a real app, you'd have proper roles
    Array.from(clients.entries()).forEach(([userId, userClients]) => {
      if (userId.startsWith('admin')) {
        hasAdmins = true;
        adminCount++;
        console.log(`Found admin user: ${userId} with ${userClients.size} connection(s)`);
        
        let adminSentCount = 0;
        userClients.forEach((client: WebSocket) => {
          try {
            if (client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify(message));
              sentCount++;
              adminSentCount++;
              console.log(`Message sent to admin ${userId}`);
            } else {
              console.log(`Client for admin ${userId} not in OPEN state: ${client.readyState}`);
            }
          } catch (error) {
            console.error(`Error sending message to admin ${userId}:`, error);
          }
        });
        
        // Cache message for this admin jika gagal terkirim
        if (adminSentCount === 0 && message.type === 'new_message' && message.sessionId && message.message) {
          console.log(`Menyimpan pesan untuk admin ${userId} di cache karena koneksi tidak aktif`);
          addMessageToCache(userId, message.type, message.sessionId, message.message);
        }
      }
    });
    
    // Jika tidak ada admin yang terhubung, simpan ke cache default admin untuk admin berikutnya
    if (!hasAdmins && message.type === 'new_message' && message.sessionId && message.message) {
      console.log(`Tidak ada admin yang terhubung. Menyimpan pesan di cache untuk 'admin-default'`);
      addMessageToCache('admin-default', message.type, message.sessionId, message.message);
    }
    
    console.log(`Found ${adminCount} admin user(s), successfully sent to ${sentCount} connection(s)`);
  }
  
  // Broadcast to tech team users
  function broadcastToTechTeam(message: any) {
    console.log("Attempting to broadcast to all tech team users");
    let techCount = 0;
    let sentCount = 0;
    let hasTechUsers = false;
    
    // For simplicity, we're assuming tech team userId starts with 'tech'
    Array.from(clients.entries()).forEach(([userId, userClients]) => {
      if (userId.startsWith('tech')) {
        hasTechUsers = true;
        techCount++;
        console.log(`Found tech user: ${userId} with ${userClients.size} connection(s)`);
        
        let techSentCount = 0;
        userClients.forEach((client: WebSocket) => {
          try {
            if (client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify(message));
              sentCount++;
              techSentCount++;
              console.log(`Message sent to tech ${userId}`);
            } else {
              console.log(`Client for tech ${userId} not in OPEN state: ${client.readyState}`);
            }
          } catch (error) {
            console.error(`Error sending message to tech ${userId}:`, error);
          }
        });
        
        // Cache message for this tech support jika gagal terkirim
        if (techSentCount === 0 && message.type === 'new_message' && message.sessionId && message.message) {
          console.log(`Menyimpan pesan untuk tech ${userId} di cache karena koneksi tidak aktif`);
          addMessageToCache(userId, message.type, message.sessionId, message.message);
        }
      }
    });
    
    // Jika tidak ada tech support yang terhubung, simpan ke cache default tech untuk tech berikutnya
    if (!hasTechUsers && message.type === 'new_message' && message.sessionId && message.message) {
      console.log(`Tidak ada tech support yang terhubung. Menyimpan pesan di cache untuk 'tech-support-default'`);
      addMessageToCache('tech-support-default', message.type, message.sessionId, message.message);
    }
    
    console.log(`Found ${techCount} tech user(s), successfully sent to ${sentCount} connection(s)`);
  }

  // Broadcast to everyone
  function broadcastToAll(message: any) {
    console.log("Broadcasting to ALL clients:", JSON.stringify(message).substring(0, 100) + "...");
    
    // Log active clients for debugging
    console.log("Active client connections:", 
      Array.from(clients.entries()).map(([id, sockets]) => 
        `${id}: ${sockets.size} connection(s)`
      )
    );
    
    // Iterate through each user's connections
    Array.from(clients.entries()).forEach(([userId, userClients]) => {
      console.log(`Broadcasting to ${userId} (${userClients.size} connections)`);
      
      userClients.forEach((client: WebSocket) => {
        try {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(message));
            console.log(`Message sent successfully to ${userId}`);
          } else {
            console.log(`Cannot send to ${userId}: connection not open (state: ${client.readyState})`);
          }
        } catch (error) {
          console.error(`Error broadcasting to ${userId}:`, error);
        }
      });
    });
  }

  // API routes prefixed with /api
  app.post('/api/sessions', async (req, res) => {
    try {
      const sessionData = insertChatSessionSchema.parse(req.body);
      const session = await storage.createChatSession(sessionData);
      
      // Create initial bot welcome message
      const welcomeMessage = {
        sessionId: session.id,
        sender: 'bot',
        message: 'Hai saya MajooCare, Ada yang bisa di bantu ?'
      };
      
      const message = await storage.createChatMessage(welcomeMessage);
      
      // Notify admins about new session
      broadcastToAdmins({
        type: 'new_session',
        session,
        message
      });
      
      res.status(201).json(session);
    } catch (error) {
      if (error instanceof ZodError) {
        const validationError = fromZodError(error);
        res.status(400).json({ message: validationError.message });
      } else {
        res.status(500).json({ message: 'Failed to create chat session' });
      }
    }
  });

  app.get('/api/sessions', async (req, res) => {
    const userId = req.query.userId as string;
    
    try {
      if (userId) {
        const sessions = await storage.getChatSessionsByUserId(userId);
        res.json(sessions);
      } else {
        // If no userId provided, return all active sessions (for admin)
        const sessions = await storage.getAllActiveChatSessions();
        res.json(sessions);
      }
    } catch (error) {
      res.status(500).json({ message: 'Failed to get chat sessions' });
    }
  });

  app.get('/api/sessions/:id', async (req, res) => {
    const sessionId = parseInt(req.params.id);
    
    try {
      const session = await storage.getChatSession(sessionId);
      if (session) {
        res.json(session);
      } else {
        res.status(404).json({ message: 'Chat session not found' });
      }
    } catch (error) {
      res.status(500).json({ message: 'Failed to get chat session' });
    }
  });

  app.get('/api/sessions/:id/messages', async (req, res) => {
    const sessionId = parseInt(req.params.id);
    
    try {
      const messages = await storage.getChatMessagesBySessionId(sessionId);
      res.json(messages);
    } catch (error) {
      res.status(500).json({ message: 'Failed to get chat messages' });
    }
  });

  app.post('/api/sessions/:id/messages', async (req, res) => {
    const sessionId = parseInt(req.params.id);
    
    try {
      const session = await storage.getChatSession(sessionId);
      if (!session) {
        return res.status(404).json({ message: 'Chat session not found' });
      }
      
      // Ensure sessionId is properly set as a number
      const messageData: InsertChatMessage = {
        ...req.body,
        sessionId: sessionId
      };
      
      // Validate with schema
      insertChatMessageSchema.parse(messageData);
      
      const message = await storage.createChatMessage(messageData);
      
      // Broadcast message appropriately based on sender
      // Special handling for tech support messages
      if (messageData.sender === 'tech') {
        console.log("=== TECH SUPPORT MESSAGE RECEIVED ===");
        console.log(`Session User ID: ${session.userId}`);
        console.log(`Message Content: ${messageData.message}`);
        
        // PERBAIKAN: Prioritaskan pengiriman individual sebelum broadcast
        
        // 1. Pastikan pesan sampai ke user/customer
        try {
          console.log(`1. Mengirim pesan tech support ke user ${session.userId}`);
          // Coba kirim ke user session terkait
          const userClients = clients.get(session.userId);
          if (userClients && userClients.size > 0) {
            console.log(`User ${session.userId} memiliki ${userClients.size} koneksi aktif`);
            
            // Kirim pesan satu per satu ke setiap koneksi user
            let successCount = 0;
            userClients.forEach((client: WebSocket) => {
              if (client.readyState === WebSocket.OPEN) {
                try {
                  client.send(JSON.stringify({
                    type: 'new_message',
                    sessionId,
                    message
                  }));
                  successCount++;
                  console.log(`Berhasil mengirim pesan tech ke user ${session.userId}`);
                } catch (e) {
                  console.error(`Gagal mengirim ke koneksi user: ${e}`);
                }
              } else {
                console.log(`Koneksi user tidak open (state: ${client.readyState})`);
              }
            });
            console.log(`Berhasil mengirim ke ${successCount}/${userClients.size} koneksi user`);
          } else {
            console.log(`User ${session.userId} tidak memiliki koneksi aktif`);
          }
        } catch (error) {
          console.error(`Gagal mengirim ke user ${session.userId}:`, error);
        }
        
        // 2. Pastikan pesan sampai ke admin
        try {
          console.log("2. Mengirim pesan tech support ke semua admin");
          // Kirim ke semua admin secara individual
          let adminFound = 0;
          let adminSuccess = 0;
          
          Array.from(clients.entries()).forEach(([userId, userClients]) => {
            if (userId.startsWith('admin')) {
              adminFound++;
              console.log(`Admin ${userId} memiliki ${userClients.size} koneksi aktif`);
              
              userClients.forEach((client: WebSocket) => {
                if (client.readyState === WebSocket.OPEN) {
                  try {
                    client.send(JSON.stringify({
                      type: 'new_message',
                      sessionId,
                      message
                    }));
                    adminSuccess++;
                    console.log(`Berhasil mengirim pesan tech ke admin ${userId}`);
                  } catch (e) {
                    console.error(`Gagal mengirim ke koneksi admin: ${e}`);
                  }
                } else {
                  console.log(`Koneksi admin tidak open (state: ${client.readyState})`);
                }
              });
            }
          });
          
          console.log(`Ditemukan ${adminFound} admin, berhasil mengirim ke ${adminSuccess} koneksi`);
        } catch (error) {
          console.error("Gagal mengirim ke admin:", error);
        }
        
        // 3. Pastikan pesan sampai ke tech support lainnya
        try {
          console.log("3. Mengirim pesan tech support ke semua tech support lainnya");
          // Kirim ke semua tech support secara individual
          let techFound = 0;
          let techSuccess = 0;
          
          Array.from(clients.entries()).forEach(([userId, userClients]) => {
            if (userId.startsWith('tech')) {
              techFound++;
              console.log(`Tech ${userId} memiliki ${userClients.size} koneksi aktif`);
              
              userClients.forEach((client: WebSocket) => {
                if (client.readyState === WebSocket.OPEN) {
                  try {
                    client.send(JSON.stringify({
                      type: 'new_message',
                      sessionId,
                      message
                    }));
                    techSuccess++;
                    console.log(`Berhasil mengirim pesan tech ke tech ${userId}`);
                  } catch (e) {
                    console.error(`Gagal mengirim ke koneksi tech: ${e}`);
                  }
                } else {
                  console.log(`Koneksi tech tidak open (state: ${client.readyState})`);
                }
              });
            }
          });
          
          console.log(`Ditemukan ${techFound} tech support, berhasil mengirim ke ${techSuccess} koneksi`);
        } catch (error) {
          console.error("Gagal mengirim ke tech team:", error);
        }
        
        // 4. Backup: Gunakan broadcast jika diperlukan
        console.log("4. [BACKUP] Broadcasting tech message ke semua client");
        broadcastToAll({
          type: 'new_message',
          sessionId,
          message
        });
      } else {
        // Regular message handling for non-tech messages
        // Always send to the user (except admin messages which are handled below)
        if (messageData.sender !== 'admin') {
          broadcastToUser(session.userId, {
            type: 'new_message',
            sessionId,
            message
          });
        }
        
        // Send to admins if not from admin
        if (messageData.sender !== 'admin') {
          broadcastToAdmins({
            type: 'new_message',
            sessionId,
            message
          });
        }
        
        // Broadcast to tech team if not from tech (already handled above)
        if (messageData.sender !== 'tech') {
          broadcastToTechTeam({
            type: 'new_message',
            sessionId,
            message
          });
        }
      }
      
      // If message is from user and we're in bot mode, call the chatbot API
      if (messageData.sender === 'user' && session.isBotMode) {
        try {
          const botRequest = chatbotRequestSchema.parse({
            name: session.userName,
            message: messageData.message,
            id_cabang: 'main'
          });
          
          const botResponse = await callChatbotAPI(
            botRequest.name,
            botRequest.message,
            botRequest.id_cabang
          );
          
          // Mengekstraksi pesan dari respons chatbot
          const botResponseMessage = botResponse.message || botResponse.output || 'I need to transfer you to a human agent.';
          
          // Save bot response as a message
          const botMessage = await storage.createChatMessage({
            sessionId,
            sender: 'bot',
            message: botResponseMessage
          });
          
          // Pola regex untuk mendeteksi kebutuhan eskalasi ke manusia
          const escalationPattern = /(saya belum bisa kasih jawaban|tidak bisa menjawab|akan saya arahkan ke Agent Manusia|tidak dapat menjawab pertanyaan)/i;
          
          // Cek apakah bot perlu eskalasi ke admin
          const needsEscalation = 
            botResponse.needsHumanHelp || 
            !botResponseMessage || 
            escalationPattern.test(botResponseMessage);
          
          // Jika bot tidak tahu jawabannya atau pesan mengandung pola eskalasi, alihkan ke mode admin
          if (needsEscalation) {
            console.log('Escalating to human support due to bot response pattern match');
            await storage.updateChatSessionMode(sessionId, false);
            
            // Create system message about escalation
            const systemMessage = await storage.createChatMessage({
              sessionId,
              sender: 'system',
              message: 'Bot escalated to admin support'
            });
            
            // Notify about mode change
            broadcastToUser(session.userId, {
              type: 'mode_changed',
              sessionId,
              isBotMode: false,
              message: systemMessage
            });
            
            broadcastToAdmins({
              type: 'mode_changed',
              sessionId,
              isBotMode: false,
              message: systemMessage
            });
          }
          
          // Broadcast bot response
          broadcastToUser(session.userId, {
            type: 'new_message',
            sessionId,
            message: botMessage
          });
          
          broadcastToAdmins({
            type: 'new_message',
            sessionId,
            message: botMessage
          });
        } catch (error) {
          console.error('Chatbot API error:', error);
          // On error, switch to admin mode
          await storage.updateChatSessionMode(sessionId, false);
          
          // Create system message about escalation
          const systemMessage = await storage.createChatMessage({
            sessionId,
            sender: 'system',
            message: 'Bot encountered an error. Transferring to admin.'
          });
          
          // Notify about mode change
          broadcastToUser(session.userId, {
            type: 'mode_changed',
            sessionId,
            isBotMode: false,
            message: systemMessage
          });
          
          broadcastToAdmins({
            type: 'mode_changed',
            sessionId,
            isBotMode: false,
            message: systemMessage
          });
        }
      }
      
      res.status(201).json(message);
    } catch (error) {
      if (error instanceof ZodError) {
        const validationError = fromZodError(error);
        res.status(400).json({ message: validationError.message });
      } else {
        res.status(500).json({ message: 'Failed to create chat message' });
      }
    }
  });

  app.post('/api/sessions/:id/switch-mode', async (req, res) => {
    const sessionId = parseInt(req.params.id);
    
    try {
      const session = await storage.getChatSession(sessionId);
      if (!session) {
        return res.status(404).json({ message: 'Chat session not found' });
      }
      
      // Toggle current mode - invert isBotMode value
      const newIsBotMode = !session.isBotMode;
      const updatedSession = await storage.updateChatSessionMode(sessionId, newIsBotMode);
      
      // Create system message about mode change
      const systemMessage = await storage.createChatMessage({
        sessionId,
        sender: 'system',
        message: newIsBotMode ? 'Switched to bot mode' : 'Switched to admin mode'
      });
      
      // Notify about mode change
      broadcastToUser(session.userId, {
        type: 'mode_changed',
        sessionId,
        isBotMode: newIsBotMode,
        message: systemMessage
      });
      
      broadcastToAdmins({
        type: 'mode_changed',
        sessionId,
        isBotMode: newIsBotMode,
        message: systemMessage
      });
      
      res.json({ success: true, isBotMode: newIsBotMode });
    } catch (error) {
      console.error('Error switching mode:', error);
      res.status(500).json({ message: 'Failed to switch mode' });
    }
  });

  app.post('/api/sessions/:id/resolve', async (req, res) => {
    const sessionId = parseInt(req.params.id);
    
    try {
      const session = await storage.resolveChatSession(sessionId);
      
      if (!session) {
        return res.status(404).json({ message: 'Chat session not found' });
      }
      
      // Create system message about resolution
      const systemMessage = await storage.createChatMessage({
        sessionId,
        sender: 'system',
        message: 'Chat marked as resolved'
      });
      
      // Notify about resolution
      broadcastToUser(session.userId, {
        type: 'session_resolved',
        sessionId,
        message: systemMessage
      });
      
      broadcastToAdmins({
        type: 'session_resolved',
        sessionId,
        message: systemMessage
      });
      
      // Notify tech team if they were also handling this session
      broadcastToTechTeam({
        type: 'session_resolved',
        sessionId,
        message: systemMessage
      });
      
      res.json({ success: true, status: session.status });
    } catch (error) {
      res.status(500).json({ message: 'Failed to resolve chat session' });
    }
  });
  
  /**
   * @api {post} /api/sessions/:id/escalate-to-tech Escalate a chat session to technical team
   * @apiDescription This endpoint escalates a chat session to the technical team
   * @apiParam {Number} sessionId The session ID to escalate
   * @apiParam {String} reason The reason for escalation
   * @apiSuccess {Boolean} success Operation success status
   */
  app.post('/api/sessions/:id/escalate-to-tech', async (req, res) => {
    const sessionId = parseInt(req.params.id);
    
    try {
      const escalationData = escalationSchema.parse({
        ...req.body,
        sessionId
      });
      
      const session = await storage.getChatSession(sessionId);
      if (!session) {
        return res.status(404).json({ message: 'Chat session not found' });
      }
      
      // Create system message about escalation
      const systemMessage = await storage.createChatMessage({
        sessionId,
        sender: 'system',
        message: `Escalated to technical team. Reason: ${escalationData.reason}`
      });
      
      // Get chat history for ClickUp card
      const chatMessages = await storage.getChatMessagesBySessionId(sessionId);
      const chatHistory = chatMessages.map(msg => {
        const timestamp = new Date(msg.createdAt).toLocaleString();
        return `**${msg.sender.toUpperCase()} (${timestamp}):** ${msg.message}`;
      }).join('\n\n');
      
      // Create ClickUp task
      const clickUpTask = await createClickUpTask(
        sessionId,
        session.userName,
        escalationData.reason,
        chatHistory
      );
      
      console.log("ClickUp task creation result:", JSON.stringify(clickUpTask));
      
      // Add info about ClickUp task to system message if created successfully
      let clickUpSystemMessage;
      if (clickUpTask) {
        // Format the URL correctly if it exists
        const clickUpUrl = clickUpTask.url || `https://app.clickup.com/t/${clickUpTask.id}`;
        
        clickUpSystemMessage = await storage.createChatMessage({
          sessionId,
          sender: 'system',
          message: `ClickUp task created: ${clickUpUrl}`
        });
        
        // Log the system message for debugging
        console.log("Created ClickUp system message:", clickUpSystemMessage);
      }
      
      // Notify the customer
      broadcastToUser(session.userId, {
        type: 'tech_escalation',
        sessionId,
        message: systemMessage
      });
      
      // Format the URL correctly for notifications
      let clickUpTaskInfo = null;
      if (clickUpTask) {
        const url = clickUpTask.url || `https://app.clickup.com/t/${clickUpTask.id}`;
        clickUpTaskInfo = {
          id: clickUpTask.id,
          url: url
        };
      }
      
      console.log("ClickUp task info for notifications:", clickUpTaskInfo);
      
      // Notify admins
      broadcastToAdmins({
        type: 'tech_escalation',
        sessionId,
        message: systemMessage,
        clickUpTask: clickUpTaskInfo
      });
      
      // Notify the technical team
      broadcastToTechTeam({
        type: 'new_tech_issue',
        sessionId,
        session,
        message: systemMessage,
        reason: escalationData.reason,
        clickUpTask: clickUpTaskInfo
      });
      
      // Use the same structure for the API response
      res.json({ 
        success: true, 
        message: 'Session escalated to technical team successfully',
        clickUpTask: clickUpTaskInfo
      });
    } catch (error) {
      if (error instanceof ZodError) {
        const validationError = fromZodError(error);
        res.status(400).json({ message: validationError.message });
      } else {
        console.error('Error escalating to tech team:', error);
        res.status(500).json({ message: 'Failed to escalate session to technical team' });
      }
    }
  });

  /**
   * @api {post} /api/chatbot Call the chatbot API directly
   * @apiDescription This endpoint allows n8n to call the external chatbot API.
   * @apiParam {String} name User's name for chatbot context
   * @apiParam {String} message The message to send to the chatbot
   * @apiParam {String} [id_cabang="main"] Branch ID for the chatbot
   * @apiParam {Number} [sessionId] Optional session ID to associate the message with
   * @apiSuccess {Boolean} success Operation success status
   * @apiSuccess {Object} response The raw response from the chatbot API
   * @apiSuccess {String} message The chatbot's response message
   * @apiSuccess {Boolean} needsHumanHelp Whether the chatbot needs human assistance
   */
  app.post('/api/chatbot', async (req, res) => {
    try {
      console.log("Chatbot API called with body:", req.body);
      
      // Extract parameters from request
      const { name, message, id_cabang = "main", sessionId } = req.body;
      
      if (!name || !message) {
        return res.status(400).json({ 
          success: false, 
          message: "Missing required parameters. Required: name, message" 
        });
      }
      
      // Call the chatbot API
      const botResponse = await callChatbotAPI(name, message, id_cabang);
      
      // Mengekstraksi pesan dari respons chatbot
      const botResponseMessage = botResponse.message || botResponse.output || 'I need to transfer you to a human agent.';
      
      // Pola regex untuk mendeteksi kebutuhan eskalasi ke manusia
      const escalationPattern = /(saya belum bisa kasih jawaban|tidak bisa menjawab|akan saya arahkan ke Agent Manusia|tidak dapat menjawab pertanyaan)/i;
      
      // Cek apakah bot perlu eskalasi ke admin
      const needsEscalation = 
        botResponse.needsHumanHelp || 
        !botResponseMessage || 
        escalationPattern.test(botResponseMessage);
      
      console.log('Bot response message:', botResponseMessage);
      console.log('Needs escalation:', needsEscalation, 
                  'Matched pattern:', escalationPattern.test(botResponseMessage));
      
      // If sessionId is provided, we can add this message to a chat session
      if (sessionId) {
        const session = await storage.getChatSession(parseInt(sessionId));
        
        if (session) {
          // Save bot response as a message
          await storage.createChatMessage({
            sessionId: parseInt(sessionId),
            sender: 'bot',
            message: botResponseMessage
          });
          
          // If bot needs human help based on regex pattern, update session
          if (needsEscalation) {
            console.log('Escalating session to human via API endpoint');
            await storage.updateChatSessionMode(parseInt(sessionId), false);
            
            // Create system message about escalation
            await storage.createChatMessage({
              sessionId: parseInt(sessionId),
              sender: 'system',
              message: 'Bot escalated to admin support via API'
            });
          }
        }
      }
      
      // Return the chatbot response
      res.json({
        success: true,
        response: botResponse,
        message: botResponseMessage,
        needsHumanHelp: needsEscalation
      });
    } catch (error: any) {
      console.error('Error in chatbot API:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Failed to process chatbot request',
        error: error.message || 'Unknown error'
      });
    }
  });

  /**
   * @api {post} /api/telegram/message Receive messages from Telegram
   * @apiDescription This endpoint receives messages from Telegram via webhook and integrates them into the chat system
   * @apiParam {String} chat_id Telegram chat ID
   * @apiParam {String} user_id Optional Telegram user ID
   * @apiParam {String} username Optional Telegram username
   * @apiParam {String} message Message content from Telegram
   * @apiParam {Number} session_id Optional existing session ID to associate with
   * @apiSuccess {Boolean} success Operation success status
   * @apiSuccess {Object} session Session data
   * @apiSuccess {Object} message Created message data
   */
  app.all('/api/telegram/message', async (req, res) => {
    // Support both GET and POST methods
    const telegramDataRaw = req.method === 'GET' ? req.query : req.body;
    try {
      // Add extra logging to debug
      console.log(`Received ${req.method} request to /api/telegram/message with data:`, telegramDataRaw);
      
      const telegramData = telegramMessageSchema.parse(telegramDataRaw);
      
      // Find or create session
      let session;
      let sessionId = telegramData.session_id;
      
      // Determine if the session should be in bot mode based on the mode parameter
      const isBotMode = telegramData.mode === 'bot';
      
      if (!sessionId) {
        // Create a new session for this Telegram user if none exists
        const existingSessions = await storage.getChatSessionsByUserId(telegramData.chat_id);
        
        if (existingSessions && existingSessions.length > 0) {
          // Use the most recent active session
          const activeSession = existingSessions.find(s => s.status === 'active');
          if (activeSession) {
            session = activeSession;
            sessionId = activeSession.id;
            
            // Update the session mode if it differs from the current mode
            if (session.isBotMode !== isBotMode && sessionId !== null && sessionId !== undefined) {
              session = await storage.updateChatSessionMode(sessionId, isBotMode);
              
              // Create system message about mode change
              await storage.createChatMessage({
                sessionId: sessionId,
                sender: 'system',
                message: isBotMode ? 'Switched to bot mode (via Telegram)' : 'Switched to admin mode (via Telegram)'
              });
            }
          } else {
            // Create new session if no active ones
            session = await storage.createChatSession({
              userId: telegramData.chat_id,
              userName: telegramData.username || `Telegram User ${telegramData.chat_id}`,
              isBotMode: isBotMode
            });
            sessionId = session.id;
          }
        } else {
          // Create new session as none exists
          session = await storage.createChatSession({
            userId: telegramData.chat_id,
            userName: telegramData.username || `Telegram User ${telegramData.chat_id}`,
            isBotMode: isBotMode
          });
          sessionId = session.id;
        }
      } else {
        session = await storage.getChatSession(sessionId);
        if (!session) {
          return res.status(404).json({ success: false, message: 'Session not found' });
        }
        
        // Update the session mode if it differs from the current mode
        if (session.isBotMode !== isBotMode) {
          session = await storage.updateChatSessionMode(sessionId, isBotMode);
          
          // Create system message about mode change
          await storage.createChatMessage({
            sessionId,
            sender: 'system',
            message: isBotMode ? 'Switched to bot mode (via Telegram)' : 'Switched to admin mode (via Telegram)'
          });
        }
      }
      
      // Determine which message to use (prioritize message_user if available)
      const userMessage = telegramData.message_user || telegramData.message || '';
      
      // Create a message from Telegram
      const message = await storage.createChatMessage({
        sessionId,
        sender: 'user',
        message: userMessage
      });
      
      // If there's a message_majoo, we should handle it as a message from MajooCare
      if (telegramData.message_majoo && telegramData.message_majoo.trim() !== '') {
        // Create a message from MajooCare
        const majooSender = telegramData.mode === 'bot' ? 'bot' : 'admin';
        const majooMessage = await storage.createChatMessage({
          sessionId,
          sender: majooSender,
          message: telegramData.message_majoo
        });
        
        // Broadcast message to clients dan admin (bukan tech team)
        broadcastToUser(session.userId, {
          type: 'new_message',
          sessionId,
          message: majooMessage
        });
        
        broadcastToAdmins({
          type: 'new_message',
          sessionId,
          message: majooMessage
        });
      }
      
      // Broadcast message hanya ke admins (bukan tech team)
      // Pesan akan ke tech team hanya jika sudah dieskalasi
      broadcastToAdmins({
        type: 'new_message',
        sessionId,
        message
      });
      
      // If in bot mode, call the chatbot API
      if (session.isBotMode) {
        try {
          // Gunakan default message jika tidak ada
          const messageToSend = userMessage || 'Halo';
          
          const botResponse = await callChatbotAPI(
            session.userName,
            messageToSend,
            'main'
          );
          
          // Extract message from bot response
          const botResponseMessage = botResponse.message || botResponse.output || 'I need to transfer you to a human agent.';
          
          // Save bot response as a message
          const botMessage = await storage.createChatMessage({
            sessionId,
            sender: 'bot',
            message: botResponseMessage
          });
          
          // Check if bot needs escalation
          const escalationPattern = /(saya belum bisa kasih jawaban|tidak bisa menjawab|akan saya arahkan ke Agent Manusia|tidak dapat menjawab pertanyaan)/i;
          const needsEscalation = 
            botResponse.needsHumanHelp || 
            !botResponseMessage || 
            escalationPattern.test(botResponseMessage);
          
          // If escalation needed, switch to admin mode
          if (needsEscalation && sessionId !== undefined) {
            await storage.updateChatSessionMode(sessionId, false);
            
            // Create system message about escalation
            const systemMessage = await storage.createChatMessage({
              sessionId,
              sender: 'system',
              message: 'Bot escalated to admin support'
            });
            
            // Broadcast to admins
            broadcastToAdmins({
              type: 'mode_changed',
              sessionId,
              isBotMode: false,
              message: systemMessage
            });
          }
          
          // Broadcast bot response
          broadcastToAdmins({
            type: 'new_message',
            sessionId,
            message: botMessage
          });
          
          // Send reply to Telegram
          await axios.post(TELEGRAM_WEBHOOK_URL, {
            chat_id: telegramData.chat_id,
            message_user: telegramData.message_user, // Pesan dari user
            message_majoo: botResponseMessage,  // Pesan dari majoo (chatbot)
            sender: 'bot',
            mode: 'bot'  // Menambahkan info mode
          });
          
          res.json({ 
            success: true, 
            session,
            message: botMessage
          });
        } catch (error) {
          console.error('Chatbot API error:', error);
          
          // On error, switch to admin mode
          if (sessionId !== undefined) {
            await storage.updateChatSessionMode(sessionId, false);
          }
          
          // Create system message about escalation
          const systemMessage = await storage.createChatMessage({
            sessionId,
            sender: 'system',
            message: 'Bot encountered an error. Transferring to admin.'
          });
          
          // Notify admins
          broadcastToAdmins({
            type: 'mode_changed',
            sessionId,
            isBotMode: false,
            message: systemMessage
          });
          
          // Send error message to Telegram
          await axios.post(TELEGRAM_WEBHOOK_URL, {
            chat_id: telegramData.chat_id,
            message_user: telegramData.message_user, // Pesan dari user
            message_majoo: 'Maaf, terjadi error dengan chatbot. Kamu akan dihubungkan dengan admin kami.', // Pesan dari system
            sender: 'system',
            mode: 'admin'  // Menambahkan info mode
          });
          
          res.json({ 
            success: true, 
            session,
            message: systemMessage
          });
        }
      } else {
        // If not in bot mode, just forward to admin and acknowledge
        res.json({ 
          success: true, 
          session,
          message
        });
      }
    } catch (error) {
      console.error('Error processing Telegram message:', error);
      if (error instanceof ZodError) {
        const validationError = fromZodError(error);
        res.status(400).json({ success: false, message: validationError.message });
      } else {
        res.status(500).json({ success: false, message: 'Failed to process Telegram message' });
      }
    }
  });

  /**
   * @api {post} /api/telegram/reply Send admin or tech support replies to Telegram
   * @apiDescription This endpoint allows admins and tech support to send replies back to Telegram
   * @apiParam {Number} sessionId The ID of the chat session to reply to
   * @apiParam {String} message The message content to send
   * @apiParam {String} sender Who is sending (admin or tech)
   * @apiSuccess {Boolean} success Operation success status
   */
  app.post('/api/telegram/reply', async (req, res) => {
    try {
      const { sessionId, message, sender } = req.body;
      
      if (!sessionId || !message || !sender) {
        return res.status(400).json({ success: false, message: 'Missing required parameters' });
      }
      
      const session = await storage.getChatSession(parseInt(sessionId));
      if (!session) {
        return res.status(404).json({ success: false, message: 'Session not found' });
      }
      
      // Create the message in our system
      const chatMessage = await storage.createChatMessage({
        sessionId: parseInt(sessionId),
        sender,
        message
      });
      
      // PERBAIKAN: Perbaikan broadcast message khususnya untuk tech support
      console.log(`=== TELEGRAM REPLY: ${sender} - Session #${sessionId} ===`);
      
      if (sender === 'tech') {
        console.log(`Tech support message via Telegram: ${message}`);
        
        // 1. Kirim langsung ke user terkait
        try {
          const userClients = clients.get(session.userId);
          if (userClients && userClients.size > 0) {
            console.log(`User ${session.userId} memiliki ${userClients.size} koneksi aktif`);
            let userSuccess = 0;
            
            userClients.forEach((client: WebSocket) => {
              if (client.readyState === WebSocket.OPEN) {
                try {
                  client.send(JSON.stringify({
                    type: 'new_message',
                    sessionId: parseInt(sessionId),
                    message: chatMessage
                  }));
                  userSuccess++;
                } catch (err) {
                  console.error(`Error sending to user client:`, err);
                }
              }
            });
            
            console.log(`Berhasil mengirim ke ${userSuccess}/${userClients.size} koneksi user`);
          } else {
            console.log(`User ${session.userId} tidak memiliki koneksi aktif`);
          }
        } catch (error) {
          console.error(`Gagal mengirim ke user ${session.userId}:`, error);
        }
        
        // 2. Kirim ke semua admin secara langsung
        try {
          console.log(`Mengirim pesan tech dari Telegram ke semua admin`);
          let adminFound = 0;
          let adminSuccess = 0;
          
          Array.from(clients.entries()).forEach(([userId, userClients]) => {
            if (userId.startsWith('admin')) {
              adminFound++;
              userClients.forEach((client: WebSocket) => {
                if (client.readyState === WebSocket.OPEN) {
                  try {
                    client.send(JSON.stringify({
                      type: 'new_message',
                      sessionId: parseInt(sessionId),
                      message: chatMessage
                    }));
                    adminSuccess++;
                  } catch (err) {
                    console.error(`Error sending to admin client:`, err);
                  }
                }
              });
            }
          });
          
          console.log(`Ditemukan ${adminFound} admin, berhasil mengirim ke ${adminSuccess} koneksi`);
        } catch (error) {
          console.error(`Gagal mengirim ke admin:`, error);
        }
        
        // 3. Kirim ke semua tech (termasuk pengirim) untuk konsistensi
        try {
          console.log(`Mengirim pesan tech dari Telegram ke semua tech lainnya`);
          let techFound = 0;
          let techSuccess = 0;
          
          Array.from(clients.entries()).forEach(([userId, userClients]) => {
            if (userId.startsWith('tech')) {
              techFound++;
              userClients.forEach((client: WebSocket) => {
                if (client.readyState === WebSocket.OPEN) {
                  try {
                    client.send(JSON.stringify({
                      type: 'new_message',
                      sessionId: parseInt(sessionId),
                      message: chatMessage
                    }));
                    techSuccess++;
                  } catch (err) {
                    console.error(`Error sending to tech client:`, err);
                  }
                }
              });
            }
          });
          
          console.log(`Ditemukan ${techFound} tech support, berhasil mengirim ke ${techSuccess} koneksi`);
        } catch (error) {
          console.error(`Gagal mengirim ke tech:`, error);
        }
        
        // 4. Backup broadcast menggunakan broadcastToAll
        console.log(`Backup: Broadcast ke semua`);
        broadcastToAll({
          type: 'new_message',
          sessionId: parseInt(sessionId),
          message: chatMessage
        });
      } else {
        // Penanganan normal untuk non-tech message
        
        // To user
        broadcastToUser(session.userId, {
          type: 'new_message',
          sessionId: parseInt(sessionId),
          message: chatMessage
        });
        
        // To admins
        if (sender !== 'admin') { // Prevent duplicates to admin dashboard
          broadcastToAdmins({
            type: 'new_message',
            sessionId: parseInt(sessionId),
            message: chatMessage
          });
        }
        
        // To tech team
        if (sender !== 'tech') { // Prevent duplicates to tech dashboard
          broadcastToTechTeam({
            type: 'new_message',
            sessionId: parseInt(sessionId),
            message: chatMessage
          });
        }
      }
      
      // Forward the message to Telegram if the user ID looks like a Telegram chat ID
      if (session.userId.startsWith('-') || !isNaN(Number(session.userId))) {
        await axios.post(TELEGRAM_WEBHOOK_URL, {
          chat_id: session.userId,
          message_user: '', // Tidak ada input dari user karena ini balasan
          message_majoo: message, // Pesan dari admin/tech
          sender,
          mode: session.isBotMode ? 'bot' : 'admin' // Include mode info
        });
      }
      
      res.json({ success: true, message: chatMessage });
    } catch (error) {
      console.error('Error sending reply to Telegram:', error);
      res.status(500).json({ success: false, message: 'Failed to send reply to Telegram' });
    }
  });

  /**
   * @api {post} /api/mode-switch-webhook Switch Chat Mode via webhook
   * @apiDescription This endpoint is specifically designed for n8n to call.
   * @apiParam {Number} sessionId The ID of the chat session to update
   * @apiParam {Boolean} switch Set to true to switch to admin mode, false for bot mode
   * @apiSuccess {Boolean} success Operation success status
   * @apiSuccess {Boolean} isBotMode Current mode after switching
   * @apiSuccess {String} message Human-readable message about the mode change
   * @apiSuccess {Object} session Basic session information
   */
  app.post('/api/mode-switch-webhook', async (req, res) => {
    try {
      console.log("Mode switch webhook called with body:", req.body);
      
      const { switch: switchMode, sessionId } = modeSwitchSchema.parse(req.body);
      
      // Update session mode (switchMode: true = admin mode, false = bot mode)
      const session = await storage.updateChatSessionMode(sessionId, !switchMode);
      
      if (!session) {
        return res.status(404).json({ message: 'Chat session not found' });
      }
      
      // Create system message about mode change
      const systemMessage = await storage.createChatMessage({
        sessionId,
        sender: 'system',
        message: session.isBotMode ? 'Switched to bot mode (via webhook)' : 'Switched to admin mode (via webhook)'
      });
      
      // Notify about mode change
      if (session.userId) {
        broadcastToUser(session.userId, {
          type: 'mode_changed',
          sessionId,
          isBotMode: session.isBotMode,
          message: systemMessage
        });
      }
      
      broadcastToAdmins({
        type: 'mode_changed',
        sessionId,
        isBotMode: session.isBotMode,
        message: systemMessage
      });
      
      res.json({ 
        success: true, 
        isBotMode: session.isBotMode,
        message: session.isBotMode ? 'Changed to bot mode' : 'Changed to admin mode',
        session: {
          id: session.id,
          userId: session.userId,
          userName: session.userName,
          status: session.status
        }
      });
    } catch (error: any) {
      console.error('Error in mode-switch-webhook:', error);
      if (error instanceof ZodError) {
        const validationError = fromZodError(error);
        res.status(400).json({ message: validationError.message });
      } else {
        res.status(500).json({ 
          success: false,
          message: 'Failed to process mode switch webhook',
          error: error.message || 'Unknown error'
        });
      }
    }
  });
  
  return httpServer;
}

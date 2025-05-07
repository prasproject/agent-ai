import { 
  type User, 
  type InsertUser, 
  type ChatSession, 
  type InsertChatSession, 
  type ChatMessage, 
  type InsertChatMessage
} from "@shared/schema";

// Extend the storage interface with chat-related methods
export interface IStorage {
  // User methods
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  // Chat session methods
  createChatSession(session: InsertChatSession): Promise<ChatSession>;
  getChatSession(id: number | undefined): Promise<ChatSession | undefined>;
  getChatSessionsByUserId(userId: string): Promise<ChatSession[]>;
  getAllActiveChatSessions(): Promise<ChatSession[]>;
  updateChatSessionMode(id: number | undefined, isBotMode: boolean): Promise<ChatSession | undefined>;
  updateUserName(userId: string, newUserName: string): Promise<ChatSession[]>;
  resolveChatSession(id: number): Promise<ChatSession | undefined>;
  
  // Chat message methods
  createChatMessage(message: InsertChatMessage): Promise<ChatMessage>;
  getChatMessagesBySessionId(sessionId: number): Promise<ChatMessage[]>;
}

export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private chatSessions: Map<number, ChatSession>;
  private chatMessages: Map<number, ChatMessage>;
  private userIdCounter: number;
  private sessionIdCounter: number;
  private messageIdCounter: number;

  constructor() {
    this.users = new Map();
    this.chatSessions = new Map();
    this.chatMessages = new Map();
    this.userIdCounter = 1;
    this.sessionIdCounter = 1;
    this.messageIdCounter = 1;
  }

  // User methods
  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.userIdCounter++;
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }

  // Chat session methods
  async createChatSession(session: InsertChatSession): Promise<ChatSession> {
    const id = this.sessionIdCounter++;
    const now = new Date();
    const chatSession: ChatSession = {
      ...session,
      id,
      status: session.status || "active",
      isBotMode: session.isBotMode !== undefined ? session.isBotMode : true,
      createdAt: now,
      updatedAt: now
    };
    this.chatSessions.set(id, chatSession);
    return chatSession;
  }

  async getChatSession(id: number | undefined): Promise<ChatSession | undefined> {
    if (id === undefined) return undefined;
    return this.chatSessions.get(id);
  }

  async getChatSessionsByUserId(userId: string): Promise<ChatSession[]> {
    return Array.from(this.chatSessions.values())
      .filter(session => session.userId === userId)
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }

  async getAllActiveChatSessions(): Promise<ChatSession[]> {
    return Array.from(this.chatSessions.values())
      .filter(session => session.status === "active")
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }

  async updateChatSessionMode(id: number | undefined, isBotMode: boolean): Promise<ChatSession | undefined> {
    const session = await this.getChatSession(id);
    if (!session) return undefined;

    const updatedSession: ChatSession = {
      ...session,
      isBotMode,
      updatedAt: new Date()
    };
    this.chatSessions.set(session.id, updatedSession);
    return updatedSession;
  }

  async resolveChatSession(id: number): Promise<ChatSession | undefined> {
    const session = await this.getChatSession(id);
    if (!session) return undefined;

    const resolvedSession: ChatSession = {
      ...session,
      status: "resolved",
      isBotMode: true, // Reset to bot mode when resolved
      updatedAt: new Date()
    };
    this.chatSessions.set(id, resolvedSession);
    return resolvedSession;
  }

  async updateUserName(userId: string, newUserName: string): Promise<ChatSession[]> {
    // Ambil semua sesi chat yang terkait dengan userId
    const userSessions = await this.getChatSessionsByUserId(userId);
    const updatedSessions: ChatSession[] = [];
    
    // Update nama pengguna untuk setiap sesi chat
    for (const session of userSessions) {
      const updatedSession: ChatSession = {
        ...session,
        userName: newUserName,
        updatedAt: new Date()
      };
      this.chatSessions.set(session.id, updatedSession);
      updatedSessions.push(updatedSession);
    }
    
    return updatedSessions;
  }

  // Chat message methods
  async createChatMessage(message: InsertChatMessage): Promise<ChatMessage> {
    const id = this.messageIdCounter++;
    const chatMessage: ChatMessage = {
      ...message,
      id,
      createdAt: new Date()
    };
    this.chatMessages.set(id, chatMessage);
    
    // Update the session's updatedAt timestamp
    const session = await this.getChatSession(message.sessionId);
    if (session) {
      const updatedSession: ChatSession = {
        ...session,
        updatedAt: new Date()
      };
      this.chatSessions.set(session.id, updatedSession);
    }
    
    return chatMessage;
  }

  async getChatMessagesBySessionId(sessionId: number): Promise<ChatMessage[]> {
    return Array.from(this.chatMessages.values())
      .filter(message => message.sessionId === sessionId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }
}

export const storage = new MemStorage();

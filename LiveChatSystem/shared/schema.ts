import { pgTable, text, serial, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// Chat sessions
export const chatSessions = pgTable("chat_sessions", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(), // Now using phone number as userId
  userName: text("user_name").notNull(),
  isBotMode: boolean("is_bot_mode").notNull().default(true),
  status: text("status").notNull().default("active"), // active, resolved
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertChatSessionSchema = createInsertSchema(chatSessions)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    userId: z.string().min(3, "ID user minimal 3 karakter"),
  });

export type InsertChatSession = z.infer<typeof insertChatSessionSchema>;
export type ChatSession = typeof chatSessions.$inferSelect;

// Chat messages
export const chatMessages = pgTable("chat_messages", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").notNull(),
  sender: text("sender").notNull(), // user, bot, admin
  message: text("message").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertChatMessageSchema = createInsertSchema(chatMessages).omit({
  id: true,
  createdAt: true,
});

export type InsertChatMessage = z.infer<typeof insertChatMessageSchema> & {
  sessionId: number; // Override to make sure sessionId is required as number
};
export type ChatMessage = typeof chatMessages.$inferSelect;

// Chatbot API request/response type
export const chatbotRequestSchema = z.object({
  name: z.string(),
  message: z.string(),
  id_cabang: z.string().default("main"),
});

export type ChatbotRequest = z.infer<typeof chatbotRequestSchema>;

// Mode switch request type
export const modeSwitchSchema = z.object({
  switch: z.boolean(),
  sessionId: z.number()
});

export type ModeSwitch = z.infer<typeof modeSwitchSchema>;

// Edit User Name request type
export const editUserNameSchema = z.object({
  userId: z.string(),
  newUserName: z.string().min(1, "Nama pengguna tidak boleh kosong")
});

export type EditUserName = z.infer<typeof editUserNameSchema>;

// Eskalalasi ke Tim Teknis
export const escalationSchema = z.object({
  sessionId: z.number(),
  reason: z.string().min(5, "Alasan eskalasi minimal 5 karakter")
});

export type Escalation = z.infer<typeof escalationSchema>;

// Telegram Integration
export const telegramMessageSchema = z.object({
  chat_id: z.coerce.string(), // Handle both string and number
  user_id: z.coerce.string().optional(),
  username: z.string().optional(),
  message: z.string().optional(), // Parameter asli untuk kompatibilitas
  message_user: z.string().optional(), // Pesan dari user pelanggan
  message_majoo: z.string().optional(), // Pesan dari admin/teknis/chatbot
  session_id: z.coerce.number().optional(), // Handle both string and number
  mode: z.enum(['bot', 'admin', 'telegram']).optional().default('bot'), // Mode bisa 'bot', 'admin', atau 'telegram'
})
// Middleware untuk menyalin message ke message_user jika diperlukan
.transform(data => {
  // Jika message_user tidak ada tapi message ada, salin message ke message_user
  if (data.message_user === undefined && data.message !== undefined) {
    return {
      ...data,
      message_user: data.message
    };
  }
  // Jika tidak ada message_user dan tidak ada message, buat pesan default
  else if (data.message_user === undefined && data.message === undefined) {
    return {
      ...data,
      message_user: "Halo, saya ingin berbicara dengan MajooCare."
    };
  }
  return data;
});

export type TelegramMessage = z.infer<typeof telegramMessageSchema>;

export const telegramReplySchema = z.object({
  chat_id: z.string(),
  message: z.string(),
  reply_to_message_id: z.number().optional(),
});

export type TelegramReply = z.infer<typeof telegramReplySchema>;

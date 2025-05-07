import { formatDistanceToNow } from "date-fns";
import { ChatMessage as ChatMessageType } from "@shared/schema";

interface ChatMessageProps {
  message: ChatMessageType;
  isAdmin?: boolean;
}

export const ChatMessage: React.FC<ChatMessageProps> = ({ message, isAdmin = false }) => {
  const isUserMessage = message.sender === "user";
  const isSystemMessage = message.sender === "system";
  const isAdminMessage = message.sender === "admin";
  const isBotMessage = message.sender === "bot";
  
  if (isSystemMessage) {
    return (
      <div className="flex justify-center my-2">
        <div className={`px-4 py-2 ${
          message.message.includes("resolved") 
            ? "bg-green-50 text-green-700" 
            : message.message.includes("escalated") 
              ? "bg-yellow-50 text-yellow-700" 
              : "bg-blue-50 text-blue-700"
        } text-xs rounded-full`}>
          {message.message}
        </div>
      </div>
    );
  }
  
  // For admin dashboard view
  if (isAdmin) {
    if (isUserMessage) {
      return (
        <div className="flex items-end mb-4">
          <div className="flex flex-col space-y-2 max-w-xs mx-2 items-start">
            <div className="px-4 py-2 rounded-lg bg-neutral-200 inline-block">
              <div className="flex space-x-1 items-center mb-1">
                <span className="text-xs font-medium text-neutral-500">
                  User #{message.sessionId}
                </span>
              </div>
              <p className="text-sm">{message.message}</p>
            </div>
            <span className="text-xs text-neutral-500 leading-none">
              {formatDistanceToNow(new Date(message.createdAt), { addSuffix: true })}
            </span>
          </div>
        </div>
      );
    }
    
    if (isAdminMessage) {
      return (
        <div className="flex items-end justify-end mb-4">
          <div className="flex flex-col space-y-2 max-w-xs mx-2 items-end">
            <div className="px-4 py-2 rounded-lg bg-primary text-white inline-block">
              <div className="flex space-x-1 items-center mb-1">
                <span className="text-xs font-medium">You → User</span>
              </div>
              <p className="text-sm">{message.message}</p>
            </div>
            <span className="text-xs text-neutral-500 leading-none">
              {formatDistanceToNow(new Date(message.createdAt), { addSuffix: true })}
            </span>
          </div>
        </div>
      );
    }
    
    if (isBotMessage) {
      return (
        <div className="flex items-end mb-4">
          <div className="flex flex-col space-y-2 max-w-xs mx-2 items-start">
            <div className="px-4 py-2 rounded-lg bg-white border border-neutral-200 inline-block">
              <div className="flex space-x-1 items-center mb-1">
                <span className="text-xs font-medium text-neutral-500">Bot → User</span>
                <span className="w-2 h-2 bg-secondary rounded-full"></span>
              </div>
              <p className="text-sm">{message.message}</p>
            </div>
            <span className="text-xs text-neutral-500 leading-none">
              {formatDistanceToNow(new Date(message.createdAt), { addSuffix: true })}
            </span>
          </div>
        </div>
      );
    }
  }
  
  // For user dashboard view
  if (isUserMessage) {
    return (
      <div className="flex items-end justify-end mb-4">
        <div className="flex flex-col space-y-2 max-w-xs mx-2 items-end">
          <div className="px-4 py-2 rounded-lg bg-primary text-white inline-block">
            <p className="text-sm">{message.message}</p>
          </div>
          <span className="text-xs text-neutral-500 leading-none">
            {formatDistanceToNow(new Date(message.createdAt), { addSuffix: true })}
          </span>
        </div>
      </div>
    );
  }
  
  if (isBotMessage) {
    return (
      <div className="flex items-end mb-4">
        <div className="flex flex-col space-y-2 max-w-xs mx-2 items-start">
          <div className="px-4 py-2 rounded-lg bg-white border border-neutral-200 inline-block">
            <div className="flex space-x-1 items-center mb-1">
              <span className="text-xs font-medium text-neutral-500">Bot</span>
              <span className="w-2 h-2 bg-secondary rounded-full"></span>
            </div>
            <p className="text-sm">{message.message}</p>
          </div>
          <span className="text-xs text-neutral-500 leading-none">
            {formatDistanceToNow(new Date(message.createdAt), { addSuffix: true })}
          </span>
        </div>
      </div>
    );
  }
  
  if (isAdminMessage) {
    return (
      <div className="flex items-end mb-4">
        <div className="flex flex-col space-y-2 max-w-xs mx-2 items-start">
          <div className="px-4 py-2 rounded-lg bg-white border border-neutral-200 inline-block">
            <div className="flex space-x-1 items-center mb-1">
              <span className="text-xs font-medium text-neutral-500">Admin: Support</span>
              <span className="w-2 h-2 bg-yellow-500 rounded-full"></span>
            </div>
            <p className="text-sm">{message.message}</p>
          </div>
          <span className="text-xs text-neutral-500 leading-none">
            {formatDistanceToNow(new Date(message.createdAt), { addSuffix: true })}
          </span>
        </div>
      </div>
    );
  }
  
  return null;
};

export default ChatMessage;

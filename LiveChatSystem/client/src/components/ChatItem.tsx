import { ChatSession } from "@shared/schema";
import { formatDistanceToNow } from "date-fns";

interface ChatItemProps {
  session: ChatSession;
  isActive: boolean;
  lastMessage?: string;
  onClick: () => void;
  isAdmin?: boolean;
}

export const ChatItem: React.FC<ChatItemProps> = ({ 
  session, 
  isActive, 
  lastMessage = "No messages yet...",
  onClick,
  isAdmin = false
}) => {
  const getStatusClass = () => {
    if (session.status === "resolved") {
      return "bg-green-100 text-green-800";
    }
    
    if (session.isBotMode) {
      return "bg-blue-100 text-blue-800";
    }
    
    return "bg-yellow-100 text-yellow-800";
  };
  
  const getStatus = () => {
    if (session.status === "resolved") {
      return "Resolved";
    }
    
    if (session.isBotMode) {
      return "Bot";
    }
    
    return "Active";
  };
  
  return (
    <div 
      className={`p-3 rounded-lg shadow-sm border ${
        isActive 
          ? "bg-neutral-50 border-primary" 
          : "bg-white border-neutral-200 hover:bg-neutral-50"
      } cursor-pointer transition-colors`}
      onClick={onClick}
    >
      <div className="flex justify-between items-start">
        <h3 className="text-sm font-medium">
          {isAdmin ? `User #${session.userId}` : "Support Chat"}
        </h3>
        <div className="flex flex-col items-end">
          <span className="text-xs text-neutral-500">
            {formatDistanceToNow(new Date(session.updatedAt), { addSuffix: true })}
          </span>
          <span className={`text-xs px-1.5 py-0.5 ${getStatusClass()} rounded-full mt-1`}>
            {getStatus()}
          </span>
        </div>
      </div>
      <p className="text-xs text-neutral-500 mt-1 truncate">
        {lastMessage}
      </p>
    </div>
  );
};

export default ChatItem;

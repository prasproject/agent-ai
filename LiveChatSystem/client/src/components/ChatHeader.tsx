import { ChatSession } from "@shared/schema";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { apiRequest } from "@/lib/queryClient";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { AlertTriangle } from "lucide-react";

interface ChatHeaderProps {
  session?: ChatSession | null;
  isAdmin?: boolean;
}

export const ChatHeader: React.FC<ChatHeaderProps> = ({ session, isAdmin = false }) => {
  const [isSwitching, setIsSwitching] = useState(false);
  const [isResolving, setIsResolving] = useState(false);
  const [isEscalating, setIsEscalating] = useState(false);
  const [escalationReason, setEscalationReason] = useState("");
  const { toast } = useToast();
  
  if (!session) {
    return (
      <div className="bg-white shadow-sm p-4 flex items-center">
        <div className="flex-1">
          <h1 className="text-lg font-medium">
            {isAdmin ? "Admin Chat Dashboard" : "User Chat Dashboard"}
          </h1>
          <p className="text-sm text-neutral-500">
            {isAdmin ? "Manage conversations with users" : "Start a conversation with our team"}
          </p>
        </div>
        <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs font-medium">
          {isAdmin ? "Online" : "Connected"}
        </span>
      </div>
    );
  }
  
  const handleModeToggle = async () => {
    if (!session || isSwitching) return;
    
    try {
      setIsSwitching(true);
      
      await apiRequest('POST', `/api/sessions/${session.id}/switch-mode`, {
        switch: !session.isBotMode
      });
      
      queryClient.invalidateQueries({ queryKey: [`/api/sessions/${session.id}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/sessions/${session.id}/messages`] });
      
    } catch (error) {
      console.error("Failed to toggle mode:", error);
      toast({
        title: "Error",
        description: "Failed to switch chat mode",
        variant: "destructive"
      });
    } finally {
      setIsSwitching(false);
    }
  };
  
  const handleResolveChat = async () => {
    if (!session || isResolving) return;
    
    try {
      setIsResolving(true);
      
      await apiRequest('POST', `/api/sessions/${session.id}/resolve`, {});
      
      queryClient.invalidateQueries({ queryKey: [`/api/sessions/${session.id}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/sessions/${session.id}/messages`] });
      queryClient.invalidateQueries({ queryKey: [`/api/sessions`] });
      
      toast({
        title: "Success",
        description: "Chat has been resolved",
      });
    } catch (error) {
      console.error("Failed to resolve chat:", error);
      toast({
        title: "Error",
        description: "Failed to resolve chat",
        variant: "destructive"
      });
    } finally {
      setIsResolving(false);
    }
  };
  
  const handleEscalateToTech = async () => {
    if (!session || isEscalating || !escalationReason.trim()) return;
    
    try {
      setIsEscalating(true);
      
      const response = await apiRequest('POST', `/api/sessions/${session.id}/escalate-to-tech`, {
        reason: escalationReason.trim()
      });
      
      queryClient.invalidateQueries({ queryKey: [`/api/sessions/${session.id}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/sessions/${session.id}/messages`] });
      
      // Check if ClickUp task was created
      // Ensure we correctly type check by checking each property exists
      const responseData = response as any; // Type cast to avoid TypeScript errors
      
      if (responseData && 
          responseData.clickUpTask && 
          typeof responseData.clickUpTask === 'object' && 
          responseData.clickUpTask.url) {
        toast({
          title: "Success",
          description: `Session escalated to technical team. ClickUp task created: ${responseData.clickUpTask.url}`,
        });
      } else {
        toast({
          title: "Success",
          description: "Session has been escalated to technical team",
        });
      }
      
      // Reset reason field
      setEscalationReason("");
    } catch (error) {
      console.error("Failed to escalate to technical team:", error);
      toast({
        title: "Error",
        description: "Failed to escalate to technical team",
        variant: "destructive"
      });
    } finally {
      setIsEscalating(false);
    }
  };
  
  if (isAdmin) {
    return (
      <div className="bg-white p-4 border-b border-neutral-200 flex items-center">
        <div className="flex-1">
          <h2 className="text-sm font-medium">User #{session.userId}</h2>
          <p className="text-xs text-neutral-500">
            Started conversation {new Date(session.createdAt).toLocaleString()}
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <div className="flex items-center mr-2">
            <span className="text-sm mr-2">Bot mode:</span>
            <div className="relative inline-block mr-2 align-middle select-none">
              <Switch
                checked={session.isBotMode}
                onCheckedChange={handleModeToggle}
                disabled={isSwitching || session.status === "resolved"}
              />
            </div>
            <span 
              className={`text-xs font-medium ${
                session.isBotMode 
                  ? "text-secondary" 
                  : "text-yellow-600"
              }`}
            >
              {session.isBotMode ? "Bot" : "Admin"}
            </span>
          </div>
          
          {/* Escalation Dialog */}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                disabled={session.status === "resolved"}
                className="text-yellow-600 border-yellow-600 hover:bg-yellow-50"
              >
                <AlertTriangle className="h-4 w-4 mr-1" />
                Tech Support
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Escalate to Technical Team</AlertDialogTitle>
                <AlertDialogDescription>
                  This will escalate the conversation to the technical support team.
                  Please provide a reason for the escalation.
                </AlertDialogDescription>
              </AlertDialogHeader>
              
              <div className="my-4">
                <Textarea
                  value={escalationReason}
                  onChange={(e) => setEscalationReason(e.target.value)}
                  placeholder="Describe the technical issue..."
                  className="w-full min-h-[100px]"
                />
              </div>
              
              <AlertDialogFooter>
                <AlertDialogCancel
                  onClick={() => setEscalationReason("")}
                >
                  Cancel
                </AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleEscalateToTech}
                  disabled={isEscalating || !escalationReason.trim() || escalationReason.trim().length < 5}
                  className="bg-yellow-600 hover:bg-yellow-700 focus:ring-yellow-600"
                >
                  {isEscalating ? "Escalating..." : "Escalate Issue"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          
          {/* Resolve Button */}
          <Button
            variant="default"
            size="sm"
            onClick={handleResolveChat}
            disabled={isResolving || session.status === "resolved"}
            className={`bg-secondary hover:bg-secondary-dark text-white`}
          >
            {session.status === "resolved" ? "Resolved" : "Resolve Chat"}
          </Button>
        </div>
      </div>
    );
  }
  
  return (
    <div className="bg-white shadow-sm p-4 flex items-center">
      <div className="flex-1">
        <h1 className="text-lg font-medium">User Chat Dashboard</h1>
        <p className="text-sm text-neutral-500">Start a conversation with our team</p>
      </div>
      <span className={`px-2 py-1 ${
        session.status === "resolved"
          ? "bg-green-100 text-green-800"
          : session.isBotMode
            ? "bg-blue-100 text-blue-800"
            : "bg-yellow-100 text-yellow-800"
      } rounded-full text-xs font-medium`}>
        {session.status === "resolved" 
          ? "Resolved" 
          : session.isBotMode 
            ? "Bot Support" 
            : "Admin Support"}
      </span>
    </div>
  );
};

export default ChatHeader;

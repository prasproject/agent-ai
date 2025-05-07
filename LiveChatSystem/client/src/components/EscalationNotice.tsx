import { AlertTriangle } from "lucide-react";

interface EscalationNoticeProps {
  message: string;
  type?: "escalation" | "resolved" | "info";
}

export const EscalationNotice: React.FC<EscalationNoticeProps> = ({ 
  message, 
  type = "escalation" 
}) => {
  let bgColor = "bg-yellow-50";
  let textColor = "text-yellow-700";
  let Icon = AlertTriangle;
  
  if (type === "resolved") {
    bgColor = "bg-green-50";
    textColor = "text-green-700";
    Icon = () => (
      <svg className="h-4 w-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" clipRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" />
      </svg>
    );
  } else if (type === "info") {
    bgColor = "bg-blue-50";
    textColor = "text-blue-700";
    Icon = () => (
      <svg className="h-4 w-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" clipRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2h.01a1 1 0 000-2H9z" clipRule="evenodd" />
      </svg>
    );
  }
  
  return (
    <div className="flex justify-center my-2">
      <div className={`px-4 py-2 ${bgColor} ${textColor} text-xs rounded-full flex items-center`}>
        <Icon className="h-4 w-4 mr-1" />
        {message}
      </div>
    </div>
  );
};

export default EscalationNotice;

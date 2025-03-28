import React from "react";
import ChatBubble from "./ChatBubble";

export interface Message {
  agent: "AI_A" | "AI_B" | "USER";
  message: string;
}

interface ChatHistoryProps {
  history: Message[];
}

const ChatHistory: React.FC<ChatHistoryProps> = ({ history }) => {
  return (
    <div className="p-4 space-y-2">
      {history.map((entry, index) => (
        <ChatBubble key={index} agent={entry.agent} message={entry.message} />
      ))}
    </div>
  );
};

export default ChatHistory;

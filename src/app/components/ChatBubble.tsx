import React from "react";

interface ChatBubbleProps {
  agent: "AI_A" | "AI_B" | "USER";
  message: string;
}

const ChatBubble: React.FC<ChatBubbleProps> = ({ agent, message }) => {
  const isUser = agent === "USER";
  const isAI_A = agent === "AI_A";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} mb-2`}>
      <div
        className={`px-4 py-2 rounded-lg max-w-xs ${
          isUser
            ? "bg-green-500 text-white" // User messages in green
            : isAI_A
            ? "bg-gray-200 text-gray-900" // AI_A in gray
            : "bg-blue-500 text-white" // AI_B in blue
        }`}
      >
        {message}
      </div>
    </div>
  );
};

export default ChatBubble;

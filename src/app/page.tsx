"use client";
import { useState, useEffect, useRef } from "react";
import Prism from "prismjs";
import "prismjs/themes/prism-tomorrow.css";
import "prismjs/components/prism-javascript";
import "prismjs/components/prism-typescript";
import "prismjs/components/prism-python";
import "prismjs/plugins/autoloader/prism-autoloader";
import { Copy } from "lucide-react";

interface Message {
  type: "user" | "llmA" | "llmB";
  content: string;
}

interface ChatResponse {
  originalPrompt: string;
  instructions: string;
  finalCode: string;
  llmAOutput: string[];
  llmBOutput: string[];
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [Bmessages, setBmessages] = useState<Message[]>([]);
  const [Binput, setBinput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    chatContainerRef.current?.scrollTo({
      top: chatContainerRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  useEffect(() => {
    Prism.highlightAll();
  }, [messages, Bmessages]);

  const handleBSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!Binput.trim()) return;

    setIsLoading(true);
    const userMessage: Message = { type: "user", content: Binput };
    setBmessages((prev) => [...prev, userMessage]);

    try {
      const response = await fetch("http://localhost:3001/api/dumbchat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ message: Binput }),
      });

      const data: ChatResponse = await response.json();

      const newMessages: Message[] = [
        { type: "llmB", content: data.finalCode },
      ];

      setBmessages((prev) => [...prev, ...newMessages]);
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setIsLoading(false);
      setBinput("");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    setIsLoading(true);
    const userMessage: Message = { type: "user", content: input };
    setMessages((prev) => [...prev, userMessage]);

    try {
      const response = await fetch("http://localhost:3001/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ message: input }),
      });

      const data: ChatResponse = await response.json();

      const maxLength = Math.max(
        data.llmAOutput.length,
        data.llmBOutput.length
      );

      const newMessages: Message[] = [];
      for (let i = 0; i < maxLength; i++) {
        if (i < data.llmAOutput.length) {
          newMessages.push({ type: "llmA", content: data.llmAOutput[i] });
        }
        if (i < data.llmBOutput.length) {
          newMessages.push({ type: "llmB", content: data.llmBOutput[i] });
        }
      }

      // const newMessages: Message[] = [
      //   { type: "llmA", content: data.instructions },
      //   { type: "llmB", content: data.finalCode },
      // ];

      setMessages((prev) => [...prev, ...newMessages]);
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setIsLoading(false);
      setInput("");
    }
  };

  return (
    <div className="flex bg-gray-200 justify-center items-center h-screen">
      <div className="w-[70%] mx-auto mt-10 p-4 bg-white shadow-lg rounded-lg flex flex-col h-[80vh] border border-gray-200">
        <h1 className="text-2xl font-bold mb-4">Multi-Agent Code Generation</h1>
        <div
          ref={chatContainerRef}
          className="flex-1 overflow-y-auto p-4 bg-gray-50 rounded-md space-y-3 border border-gray-300"
        >
          {messages.map((message, index) => {
            let content = message.content.trim();
            let language = "plaintext";
            if (content.startsWith("```")) {
              const lines = content.split("\n");
              const firstLine = lines[0].trim().replace(/```/g, "");
              if (firstLine) {
                language = firstLine;
              }
              content = lines.slice(1).join("\n").trim();
            }

            return (
              <div
                key={index}
                className={`p-3 rounded-lg text-white break-words ${
                  message.type === "user"
                    ? "bg-blue-600 self-end ml-auto max-w-[75%]"
                    : message.type === "llmA"
                    ? "bg-green-600 max-w-full"
                    : "bg-purple-600 max-w-full"
                }`}
                style={{ wordWrap: "break-word", overflow: "hidden" }}
              >
                <div className="flex items-center mb-2">
                  <h1>
                    {message.type === "llmA"
                      ? "Instructions AI"
                      : message.type === "llmB"
                      ? "Coder AI"
                      : "You"}
                  </h1>
                  {message.type === "llmB" && (
                    <div className="flex items-center">
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(content);
                          setCopied(true);
                          setTimeout(() => {
                            setCopied(false);
                          }, 2000);
                        }}
                      >
                        <Copy className="text-black mx-4 hover:text-white transition cursor-pointer" />
                      </button>
                      <span
                        className={`text-gray-200 ml-2 opacity-0 transition-opacity ease-in-out ${
                          copied ? "opacity-100" : ""
                        }`}
                      >
                        Copied!
                      </span>
                    </div>
                  )}
                </div>
                <pre>
                  <code className={`language-${language}`}>{content}</code>
                </pre>
              </div>
            );
          })}
        </div>

        <form onSubmit={handleSubmit} className="mt-4 flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type your message..."
            disabled={isLoading}
            className="flex-1 p-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          <button
            type="submit"
            disabled={isLoading}
            className="px-5 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
}

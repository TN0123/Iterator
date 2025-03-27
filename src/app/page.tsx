"use client";
import { useState, useEffect, useRef } from "react";
import Prism from "prismjs";
import "prismjs/themes/prism-tomorrow.css";
import "prismjs/components/prism-javascript";
import "prismjs/components/prism-typescript";
import "prismjs/components/prism-python";
import "prismjs/plugins/autoloader/prism-autoloader";
import { Copy, RefreshCw } from "lucide-react";
import FileExplorer from "./components/FileExplorer";
import ChatHistory from "./components/ChatHistory";
import { Message } from "./components/ChatHistory";
import ReactMarkdown from "react-markdown";

declare module "react" {
  interface InputHTMLAttributes<T> extends HTMLAttributes<T> {
    webkitdirectory?: string;
    directory?: string;
  }
}

interface ChatResponse {
  history: Message[];
  containerId: string;
  summary: string;
}

export default function Home() {
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const [containerId, setContainerId] = useState<string | null>(null);
  const [isClearing, setIsClearing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [history, setHistory] = useState<Message[]>([]);
  const [summary, setSummary] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"markdown" | "chat">("markdown");

  const clearContainer = async () => {
    if (
      !window.confirm(
        "Are you sure you want to clear the container? All generated files will be lost."
      )
    ) {
      return;
    }

    setIsClearing(true);
    try {
      const response = await fetch(
        "http://localhost:3001/api/clear-container",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      const data = await response.json();

      if (data.success) {
        setContainerId(null);
        setHistory([]);
        alert("Container cleared successfully!");
      } else {
        alert(`Failed to clear container: ${data.message}`);
      }
    } catch (error) {
      console.error("Error clearing container:", error);
      alert("Error clearing container. See console for details.");
    } finally {
      setIsClearing(false);
    }
  };

  useEffect(() => {
    chatContainerRef.current?.scrollTo({
      top: chatContainerRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [history]);

  useEffect(() => {
    Prism.highlightAll();
  }, [history]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    const userMessage: Message = {
      agent: "USER",
      message: input,
    };

    setHistory((prevHistory) => [...prevHistory, userMessage]);

    try {
      setIsLoading(true);
      const response = await fetch("http://localhost:3001/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ message: input }),
      });

      const data: ChatResponse = await response.json();

      setContainerId(data.containerId);
      setHistory((prevHistory) => [...prevHistory, ...data.history]);
      setSummary(data.summary);
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setIsLoading(false);
      setInput("");
    }
  };

  const handleFileUpload = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    if (!event.target.files || event.target.files.length === 0) return;

    setIsUploading(true);
    const formData = new FormData();

    Array.from(event.target.files).forEach((file) => {
      formData.append("files", file);
    });

    try {
      const response = await fetch("http://localhost:3001/api/upload", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();
      if (data.success) {
        alert("Files uploaded successfully!");
        if (data.containerId) {
          setContainerId(data.containerId);
        }
      } else {
        alert(`Upload failed: ${data.message}`);
      }
    } catch (error) {
      console.error("Error uploading files:", error);
      alert("Error uploading files. See console for details.");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="flex bg-gray-200 justify-center items-center h-screen">
      <div className="w-2/5 mx-2 p-4 bg-white shadow-lg rounded-lg flex flex-col h-[80vh] border border-gray-200">
        <div className="flex gap-2 mb-4 items-center justify-between">
          <div>
            <button
              className={`py-2 px-4 ${
                activeTab === "markdown"
                  ? "bg-blue-500 text-white"
                  : "bg-gray-200"
              }`}
              onClick={() => setActiveTab("markdown")}
            >
              Documentation
            </button>

            <button
              className={`py-2 px-4 ${
                activeTab === "chat" ? "bg-blue-500 text-white" : "bg-gray-200"
              }`}
              onClick={() => setActiveTab("chat")}
            >
              Chat History
            </button>
          </div>

          <button
            onClick={clearContainer}
            disabled={isClearing || !containerId}
            className="flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-700 disabled:bg-gray-400 transition"
          >
            <RefreshCw
              className={`h-4 w-4 ${isClearing ? "animate-spin" : ""}`}
            />
            {isClearing ? "Clearing..." : "Clear"}
          </button>

          <label className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 transition cursor-pointer">
            <input
              type="file"
              webkitdirectory="true"
              directory=""
              multiple
              onChange={handleFileUpload}
              className="hidden"
              disabled={isUploading}
            />
            {isUploading ? "Uploading..." : "Upload Codebase"}
          </label>
        </div>
        <div className="flex-1 overflow-y-auto p-4 bg-gray-50 rounded-md space-y-3 border border-gray-300">
          {/* Tabs for switching */}
          <div className="flex"></div>
          {/* Conditionally render the active tab's content */}
          {activeTab === "markdown" ? (
            <ReactMarkdown
              components={{
                h1: ({ children }) => (
                  <h1 className="text-4xl font-bold">{children}</h1>
                ),
                h2: ({ children }) => (
                  <h2 className="text-3xl font-semibold">{children}</h2>
                ),
                h3: ({ children }) => (
                  <h3 className="text-2xl font-semibold">{children}</h3>
                ),
              }}
            >
              {summary}
            </ReactMarkdown>
          ) : (
            <ChatHistory history={history} />
          )}
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
      <div className="w-3/5 h-[80vh] mx-2 bg-white shadow-lg rounded-lg border border-gray-200">
        {containerId ? (
          <FileExplorer containerId={containerId} />
        ) : (
          <div className="flex items-center justify-center h-full p-4">
            <p className="text-gray-500 text-center">
              Waiting for container... <br />
              Try sending a message to create a container
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

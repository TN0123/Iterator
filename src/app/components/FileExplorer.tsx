import { useState, useEffect } from "react";
import { Download, Copy } from "lucide-react";

interface FileExplorerProps {
  containerId: string;
}

export default function FileExplorer({ containerId }: FileExplorerProps) {
  const [files, setFiles] = useState<string[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string>("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    async function fetchFiles() {
      try {
        const response = await fetch(
          `http://localhost:3001/api/container/${containerId}/files`
        );
        const data = await response.json();
        setFiles(data.files);
      } catch (error) {
        console.error("Error fetching files:", error);
      }
    }
    fetchFiles();
  }, [containerId]);

  const handleFileClick = async (file: string) => {
    setSelectedFile(file);
    try {
      const response = await fetch(
        `http://localhost:3001/api/container/${containerId}/file?path=${file}`
      );
      const data = await response.json();
      setFileContent(data.content);
    } catch (error) {
      console.error("Error fetching file content:", error);
    }
  };

  const handleDownloadZip = () => {
    const zipUrl = `http://localhost:3001/api/container/${containerId}/download-zip`;
    const link = document.createElement("a");
    link.href = zipUrl;
    link.setAttribute("download", `${containerId}.zip`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex h-full border rounded-md shadow-lg p-4">
      {/* File List */}
      <div className="w-1/4 overflow-y-auto border-r p-2">
        <h2 className="font-bold mb-2">
          Files<span>  -  </span>
          <button onClick={handleDownloadZip} className="hover:text-blue-600">
            <Download className="w-5 h-5" />
          </button>
        </h2>
        <ul>
          {files.map((file) => (
            <li
              key={file}
              className="cursor-pointer hover:text-blue-600"
              onClick={() => handleFileClick(file)}
            >
              {file}
            </li>
          ))}
        </ul>
      </div>

      {/* File Content Viewer */}
      <div className="w-3/4 p-2 overflow-auto">
        {selectedFile ? (
          <>
            <div className="flex items-center mb-2">
              <h2 className="font-bold">{selectedFile}</h2>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(fileContent);
                  setCopied(true);
                  setTimeout(() => {
                    setCopied(false);
                  }, 2000);
                }}
              >
                <Copy className="text-black mx-4 hover:text-gray-500 transition cursor-pointer" />
              </button>
              <span
                className={`text-black ml-2 opacity-0 transition-opacity ease-in-out ${
                  copied ? "opacity-100" : ""
                }`}
              >
                Copied!
              </span>
            </div>
            <pre className="bg-gray-100 p-2 rounded-md overflow-auto">
              <code>{fileContent}</code>
            </pre>
          </>
        ) : (
          <p>Select a file to view its content</p>
        )}
      </div>
    </div>
  );
}

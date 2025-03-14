import { useState, useEffect } from "react";

interface FileExplorerProps {
  containerId: string;
}

export default function FileExplorer({ containerId }: FileExplorerProps) {
  const [files, setFiles] = useState<string[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string>("");

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

  return (
    <div className="flex h-full border rounded-md shadow-lg p-4">
      {/* File List */}
      <div className="w-1/4 overflow-y-auto border-r p-2">
        <h2 className="font-bold mb-2">Files</h2>
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
            <h2 className="font-bold mb-2">{selectedFile}</h2>
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

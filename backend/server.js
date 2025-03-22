const express = require("express");
const cors = require("cors");
const workflow = require("./workflow");
const docker = require("./docker");
const path = require("path");
const archiver = require("archiver");
const os = require("os");
const { exec } = require("child_process");
const fs = require("fs");

require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

let activeContainer = null;
let containerId = null;

const getOrCreateContainer = async () => {
  if (!activeContainer) {
    activeContainer = await docker.startContainer();
    containerId = activeContainer.id;
    console.log("Created new container with ID:", containerId);
  }
  return activeContainer;
};

// API endpoints
app.post("/api/chat", async (req, res) => {
  try {
    const userInput = req.body.message;

    const container = await getOrCreateContainer();

    const result = await workflow.chain.invoke({
      task: userInput,
      container,
    });

    res.json({
      originalPrompt: userInput,
      llmAOutput: result.llmAOutput,
      llmBOutput: result.llmBOutput,
      instructions: result.instructions,
      finalCode: result.currentCode,
      iterationsUsed: result.iterations,
      containerId: container.id,
    });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/get-container", async (req, res) => {
  try {
    await getOrCreateContainer();
    res.json({ containerId });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/clear-container", async (req, res) => {
  try {
    if (activeContainer) {
      await docker.cleanUpContainer(activeContainer);
      activeContainer = null;
      containerId = null;
      console.log("Container cleared successfully");
      res.json({ success: true, message: "Container cleared successfully" });
    } else {
      res.json({ success: false, message: "No active container to clear" });
    }
  } catch (error) {
    console.error("Error clearing container:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get("/api/container/:containerId/files", async (req, res) => {
  try {
    if (req.params.containerId !== containerId) {
      return res.status(404).json({ error: "Container not found" });
    }

    const files = await docker.listFiles(activeContainer);
    res.json({ files });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/container/:containerId/file", async (req, res) => {
  try {
    const { path } = req.query;
    if (req.params.containerId !== containerId) {
      return res.status(404).json({ error: "Container not found" });
    }
    const content = await docker.readFile(activeContainer, path);
    res.json({ content });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/container/:containerId/download-zip", async (req, res) => {
  const { containerId } = req.params;

  // Create a temporary directory for storing copied files
  const tempDir = path.join(os.tmpdir(), `container-${containerId}`);
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
  fs.mkdirSync(tempDir, { recursive: true });

  const containerPath = "/code"; 

  // Execute docker cp to copy files from the container to the host
  exec(`docker cp ${containerId}:${containerPath} ${tempDir}`, (err, stdout, stderr) => {
    if (err) {
      console.error("Error copying files from container:", stderr);
      return res.status(500).json({ error: "Failed to copy files from container" });
    }

    console.log("Files copied to:", tempDir);

    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename=${containerId}.zip`);

    const archive = archiver("zip", { zlib: { level: 9 } });

    archive.on("error", (err) => {
      console.error("Archiver error:", err);
      res.status(500).json({ error: err.message });
    });

    archive.pipe(res);
    archive.directory(tempDir, false);

    archive.finalize();
  });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

const express = require("express");
const cors = require("cors");
const workflow = require("./workflow");
const docker = require("./docker");
const multer = require("multer");
const path = require("path");
const fspromises = require("fs").promises;

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

const initializeContainer = async () => {
  try {
    await getOrCreateContainer();
  } catch (error) {
    console.error("Error initializing container:", error);
  }
};

// Add multer configuration
const upload = multer({ dest: "uploads/" });

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

// Add new endpoint for file uploads
app.post("/api/upload", upload.array("files"), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "No files uploaded" });
    }

    const container = await getOrCreateContainer();

    // Process each uploaded file
    for (const file of req.files) {
      const relativePath = file.originalname.replace(/^[\/\\]/, ""); // Changed originalpath to originalname
      const content = await fspromises.readFile(file.path, "utf-8");

      // Create the file in the container
      await docker.createOrUpdateFile(container, relativePath, content);

      // Clean up the temporary file
      await fspromises.unlink(file.path);
    }

    res.json({
      success: true,
      message: "Files uploaded successfully",
      containerId: container.id,
    });
  } catch (error) {
    console.error("Error handling file upload:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  initializeContainer();
});

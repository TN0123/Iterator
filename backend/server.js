const express = require("express");
const cors = require("cors");
const utils = require("./utils");
const workflow = require("./workflow");
const docker = require("./docker");

require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

// API endpoints
app.post("/api/chat", async (req, res) => {
  try {
    const userInput = req.body.message;

    const container = await docker.startContainer();

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
    });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

const express = require("express");
const cors = require("cors");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { ChatGoogleGenerativeAI } = require("@langchain/google-genai");
const { StateGraph, END, START } = require("@langchain/langgraph");
const { RunnableSequence } = require("@langchain/core/runnables");
const { ChatPromptTemplate } = require("@langchain/core/prompts");
const Docker = require("dockerode");
const tar = require("tar-stream");
const { default: next } = require("next");

require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

const docker = new Docker();

// Helper functions for container functionality
const cleanCode = (code) => code.replace(/```[a-zA-Z]*/g, "").replace(/```/g, "");

const parseGeneratedCode = (code) => {
  const files = {};
  let currentFile = null;
  let currentContent = [];

  const lines = code.split("\n");

  for (const line of lines) {
    if (line.startsWith("FILE: ")) {
      if (currentFile) {
        files[currentFile] = currentContent.join("\n");
      }
      currentFile = line.replace("FILE: ", "").trim();
      currentContent = [];
    } else {
      if (currentFile) {
        currentContent.push(line);
      }
    }

    if (currentFile) {
      files[currentFile] = currentContent.join("\n");
    }
  }

  return files;
};

// Docker
const startContainer = async () => {
  const imageName = "multi-environment";

  try {
    console.log("Building Docker image...");
    const stream = await docker.buildImage(
      { context: ".", src: ["Dockerfile"] },
      { t: imageName }
    );

    await new Promise((resolve, reject) => {
      docker.modem.followProgress(stream, (err, res) => (err ? reject(err) : resolve(res)));
    });

    console.log("Docker image built successfully.");
  } catch (error) {
    console.error("Error building Docker image:", error);
    throw error;
  }

  // Create and start the container from the built image
  const container = await docker.createContainer({
    Image: imageName, // Use the custom image
    Tty: true,
    Cmd: ["/bin/bash"], // Default to an interactive bash shell
    HostConfig: {
      Binds: ["/tmp/codeStorage:/code"], // Mount volume for persistent storage
    },
  });

  await container.start();
  console.log("Container started.");

  return container;
};


const writeFilesToContainer = async (container, files) => {
  for (const [filename, content] of Object.entries(files)) {
    const filePath = `/code/${filename}`;
    const pack = tar.pack();

    pack.entry({ name: filename }, content);
    pack.finalize();

    const stream = await new Promise((resolve, reject) => {
      const buffer = [];
      pack.on("data", (chunk) => buffer.push(chunk));
      pack.on("end", () => resolve(Buffer.concat(buffer)));
      pack.on("error", reject);
    });

    await container.putArchive(stream, { path: "/code" });
    console.log(`File ${filename} written to container.`);
  }
};

const cleanUpContainer = async (container) => {
  await container.stop();
  await container.remove();
};

// Define state
const graphStateChannels = {
  task: {
    value: (prevTask, task) => task,
  },
  instructions: {
    value: (prevInstructions, instructions) => instructions,
  },
  currentCode: {
    value: (prevCode, code) => code,
  },
  codeReview: {
    value: (prevCodeReview, codeReview) => codeReview,
  },
  isCorrect: {
    value: (prevIsCorrect, isCorrect) => isCorrect,
  },
  iterations: {
    value: (prevIterations, iterations) => iterations,
  },
  llmAOutput: {
    value: (prevOutput, output) => output,
  },
  llmBOutput: {
    value: (prevOutput, output) => output,
  },
  next: {
    value: (prevNext, next) => next,
  },
};

const maxIterations = 3;

// Initialize AI models
const ai_a = new ChatGoogleGenerativeAI({
  modelName: "gemini-2.0-flash",
  apiKey: process.env.GEMINI_API_KEY,
  maxOutputTokens: 2048,
});

const ai_b = new ChatGoogleGenerativeAI({
  modelName: "gemini-2.0-flash",
  apiKey: process.env.GEMINI_API_KEY,
  maxOutputTokens: 2048,
});

// Define prompts
const prompts = {
  instruct: ChatPromptTemplate.fromTemplate(`
    You are a developer who is pair programming with another developer.
    You are given a task and you want to instruct the other developer on 
    how to write code to solve the problem. The other developer will be 
    writing code only, you will be responsible for running their code later.
    Limit your instructions to be under 100 words but be as specific as 
    possible. Respond with only a numbered list of instructions and a brief 
    summary of the task. If the task requires more than one file, include a file tree
    , otherwise just tell them the name of the file they should create.
    Task: {input}
  `),

  review: ChatPromptTemplate.fromTemplate(`
    You are a developer who is pair programming with another developer.
    You have been given this code by the other developer. Find any errors
    in the code. If there are errors, be concise in your explanation of
    the errors. If the code is correct, say the following phrase exactly:
    the code is correct.
    Code: {input}
  `),

  generate: ChatPromptTemplate.fromTemplate(`
    You are a developer who is pair programming with another developer.
    You have been given these instructions by the other developer. Write neat,
    well formatted, efficient code with the logic provided by the developer. 
    If you are asked to generate multiple files, label the code for each file 
    with the following format: "FILE: filename".
    Instructions: {input}
  `),

  revise: ChatPromptTemplate.fromTemplate(`
    You are a developer who is pair programming with another developer.
    The other developer received your code and has provided the
    following feedback. Follow the feedback to revise the code. Respond with
    the code only.
    Feedback: {input}
  `),

  unit_test: ChatPromptTemplate.fromTemplate(`
    You are a developer who is pair programming with another developer.
    You have been given this code by the other developer and the following
    instructions by the client. Write a series of command-line commands to unit test the other developers code. Ensure that
    your tests are exhaustive and adequatly test the code to ensure it follows
    the clients instructions. If there is no way to unit test the code, respond with the
    following phrase exactly: Cannot unit-test. Otherwise, ONLY respond with exact command-line commands to be put in a bash shell (i.e no other code), 
    seperated by a new-line, without any additional comments. Ensure your commands involve installing all necessary dependencies (assume no dependencies have been installed).
    Code: {code}

    Instructions: {input}
  `),
};

// Define agent functions
const instructAgent = async (state) => {
  // console.log("INSTRUCT AGENT STATE:", state);
  const chain = RunnableSequence.from([prompts.instruct, ai_a]);
  const response = await chain.invoke({ input: state.task });
  const instructions = response.content;
  console.log("INSTRUCTIONS: ", instructions);

  return {
    state,
    instructions,
    llmAOutput: (state.llmAOutput || []).concat([instructions]),
    next: "generate",
  };
};

const generateAgent = async (state) => {
  // console.log("GENERATE AGENT STATE:", state);
  const chain = RunnableSequence.from([prompts.generate, ai_b]);
  const response = await chain.invoke({ input: state.instructions });
  const code = cleanCode(response.content);
  console.log("GENERATED CODE: ", code);

  return {
    state,
    currentCode: code,
    llmBOutput: (state.llmBOutput || []).concat([code]),
    next: "unit_test",
  };
};

const unitTestingAgent = async (state) => {
  const chain = RunnableSequence.from([prompts.unit_test, ai_a]);
  const response = await chain.invoke({ input: state.instructions, code: state.currentCode });
  const unitTestCommands = cleanCode(response.content);
  console.log(unitTestCommands);
  const canUnitTest = !unitTestCommands.toLowerCase().includes("cannot unit-test");

  if (!canUnitTest) {
    return { state, canUnitTest, unitTestResults: "No unit tests applicable.", next: "review" };
  }

  // Parse the generated code into files
  const files = parseGeneratedCode(state.currentCode);

  // Start the Docker container
  const container = await startContainer();
  await writeFilesToContainer(container, files);

  const commands = unitTestCommands.split("\n").filter(cmd => cmd.trim() !== "");
  let output = "";
  
  for (const cmd of commands) {
    const exec = await container.exec({
      AttachStdout: true,
      AttachStderr: true,
      Cmd: ["/bin/sh", "-c", cmd],
      Tty: true,
    });
  
    const stream = await exec.start({ hijack: true, stdin: true });
  
    let commandOutput = "";
    stream.on("data", (chunk) => {
      commandOutput += chunk.toString();
    });
  
    await new Promise((resolve) => stream.on("end", resolve));
  
    output += `\nCommand: ${cmd}\nOutput:\n${commandOutput}\n`;
  }  

  console.log("Unit Test Output:", output);

  // Stop and clean up container
  await cleanUpContainer(container);

  return {
    state,
    canUnitTest,
    unitTestResults: output,
    next: "review",
  };
};


const reviewAgent = async (state) => {
  const chain = RunnableSequence.from([prompts.review, ai_a]);
  const reviewInput = `Code:\n${state.currentCode}\n\nUnit Test Results:\n${state.unitTestResults}`;
  const response = await chain.invoke({ input: reviewInput });
  const codeReview = response.content;
  const isCorrect = codeReview.toLowerCase().includes("the code is correct");

  return {
    state,
    isCorrect,
    codeReview,
    llmAOutput: (state.llmAOutput || []).concat([codeReview]),
  };
};


const reviseAgent = async (state) => {
  // console.log("REVISE AGENT STATE:", state);
  if (state.iterations >= maxIterations) {
    return {
      state,
      next: "end",
    };
  }

  const chain = RunnableSequence.from([prompts.revise, ai_b]);
  const response = await chain.invoke({ input: state.codeReview });
  const code = response.content;
  console.log("REVISION: ", code);

  return {
    state,
    currentCode: code,
    llmBOutput: (state.llmBOutput || []).concat([code]),
    iterations: state.iterations + 1,
    next: "review",
  };
};

// Create workflow graph
const workflow = new StateGraph({ channels: graphStateChannels });

// Add nodes to graph with proper configuration
workflow.addNode("instruct", instructAgent);
workflow.addNode("generate", generateAgent);
workflow.addNode("review", reviewAgent);
workflow.addNode("revise", reviseAgent);
workflow.addNode("unit_test", unitTestingAgent);


// Set the entry point
workflow.addEdge(START, "instruct");

// conditional routing
const endOrRevise = (state) => (state.isCorrect ? END : "revise");

// Add edges
workflow.addEdge("instruct", "generate", (state) => state.next === "generate");
workflow.addConditionalEdges("review", endOrRevise);
workflow.addEdge("revise", "review", (state) => state.next === "review");
workflow.addEdge("revise", END, (state) => state.next === "end");
workflow.addEdge("generate", "unit_test", (state) => state.next === "unit_test");
workflow.addEdge("unit_test", "review", (state) => state.next === "review");


// Compile the graph
const chain = workflow.compile();

// API endpoints
app.post("/api/chat", async (req, res) => {
  try {
    const userInput = req.body.message;

    const result = await chain.invoke({
      task: userInput,
      instructions: "",
      currentCode: "",
      codeReview: "",
      isCorrect: false,
      iterations: 0,
      llmAOutput: [],
      llmBOutput: [],
      next: "instruct",
    });

    // const files = parseGeneratedCode(result.currentCode);

    // const container = await startContainer();
    // await writeFilesToContainer(container, files);

    // the logic of cleaning up the container needs to be rethought, comment out below for persistent storage of container
    // await cleanUpContainer(container);

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

const { ChatGoogleGenerativeAI } = require("@langchain/google-genai");
const { RunnableSequence } = require("@langchain/core/runnables");
const { ChatPromptTemplate } = require("@langchain/core/prompts");
const promptValues = require("./prompts");
const docker = require("./dockerFunctions");
const utils = require("./utils");
const { END } = require("@langchain/langgraph");

require("dotenv").config();

// Initialize Models
const llm = new ChatGoogleGenerativeAI({
  modelName: "gemini-2.0-flash",
  apiKey: process.env.GEMINI_API_KEY,
});

// Set up Prompts
const prompts = {
  design: ChatPromptTemplate.fromTemplate(promptValues.designPrompt),
  instruct: ChatPromptTemplate.fromTemplate(promptValues.instructPrompt),
  review: ChatPromptTemplate.fromTemplate(promptValues.reviewPrompt),
  generate: ChatPromptTemplate.fromTemplate(promptValues.generatePrompt),
  revise: ChatPromptTemplate.fromTemplate(promptValues.revisePrompt),
  summarize: ChatPromptTemplate.fromTemplate(promptValues.summarizePrompt),
};

// Define Agents

const designAgent = async (state) => {
  console.log("DESIGN STEP");
  const chain = RunnableSequence.from([prompts.design, llm]);
  const response = await chain.invoke({
    task: state.task,
  });

  const detailedTask = response.content;

  // console.log("DESIGN RESPONSE: ", detailedTask);

  return {
    state,
    task: detailedTask,
  };
};

const instructAgent = async (state) => {
  console.log("INSTRUCT STEP");

  const currentCode = await utils.readDockerDirectory(
    state.container.id,
    "/code"
  );

  const chain = RunnableSequence.from([prompts.instruct, llm]);
  const response = await chain.invoke({
    task: state.task,
    code: currentCode,
  });
  const instructResult = JSON.parse(utils.cleanCode(response.content));

  const instructions = instructResult.instructions;

  const steps = instructResult.steps;
  console.log("INSTRUCTIONS: ", instructResult);

  const fileTree = instructResult.fileTree;

  const newHistory = [
    ...(state.history || []),
    { agent: "AI_A", message: instructions },
  ];

  return {
    state,
    codebase: currentCode,
    metaKnowledge: fileTree,
    history: newHistory,
    instructions,
    steps,
  };
};

const generateAgent = async (state) => {
  console.log("GENERATE STEP");

  const chain = RunnableSequence.from([prompts.generate, llm]);

  let codeFilesString = "";

  for (i = 0; i < state.steps.length; i++) {
    console.log("CURRENT STEP: ", i + 1);
    const currentCode = await utils.readDockerDirectory(
      state.container.id,
      "/code"
    );
    const response = await chain.invoke({
      instructions: state.instructions,
      step: state.steps[i],
      fileTree: state.metaKnowledge,
      code: currentCode,
    });
    const newCodeFiles = utils.parseCodeFiles(response.content);
    codeFilesString = "";
    for (const [filename, content] of Object.entries(newCodeFiles)) {
      await docker.createOrUpdateFile(state.container, filename, content);
      codeFilesString += `FILE: ${filename}\n${utils.cleanCode(content)}\n\n`;
    }
    // console.log("CODE: ", codeFilesString);
  }

  // console.log("GENERATE STEP CODE: ", codeFilesString);

  const newHistory = [
    ...(state.history || []),
    { agent: "AI_B", message: codeFilesString },
  ];

  return {
    state,
    codebase: codeFilesString,
    history: newHistory,
  };
};

const reviewAgent = async (state) => {
  console.log("REVIEW STEP");

  const chain = RunnableSequence.from([prompts.review, llm]);

  const response = await chain.invoke({
    task: state.task,
    code: state.codebase,
  });

  let codeReview = response.content;

  const isCorrect = codeReview.toLowerCase().includes("the code is correct");
  console.log("REVIEW: ", codeReview);

  const newHistory = [
    ...(state.history || []),
    { agent: "AI_A", message: codeReview },
  ];

  return {
    state,
    history: newHistory,
    isCorrect,
    lastReview: codeReview,
  };
};

const reviseAgent = async (state) => {
  console.log("REVISE STEP");

  const chain = RunnableSequence.from([prompts.revise, llm]);

  const response = await chain.invoke({
    task: state.instructions,
    review: state.lastReview,
    code: state.codebase,
  });

  const code = response.content;

  const codeFiles = utils.parseCodeFiles(code);
  let codeFilesString = "";
  for (const [filename, content] of Object.entries(codeFiles)) {
    await docker.createOrUpdateFile(state.container, filename, content);
    codeFilesString += `FILE: ${filename}\n${utils.cleanCode(content)}\n\n`;
  }

  console.log("OLD CODE: ", state.codebase);
  console.log("REVISED CODE: ", codeFilesString);

  const newHistory = [
    ...(state.history || []),
    { agent: "AI_B", message: codeFilesString },
  ];

  return {
    ...state,
    history: newHistory,
    codebase: codeFilesString,
    iterations: (state.iterations || 0) + 1,
    next: "review",
  };
};

const summarizeAgent = async (state) => {
  console.log("SUMMARIZE STEP");

  const chain = RunnableSequence.from([prompts.summarize, llm]);

  const response = await chain.invoke({
    codebase: state.codebase,
    task: state.task,
  });

  const summary = utils.cleanCode(response.content);
  // console.log("SUMMARY: ", summary);

  const newHistory = [
    ...(state.history || []),
    { agent: "AI_A", message: summary },
  ];

  return {
    ...state,
    history: newHistory,
    summary,
    next: END,
  };
};

module.exports = {
  designAgent,
  instructAgent,
  generateAgent,
  reviewAgent,
  reviseAgent,
  summarizeAgent,
};

const { ChatGoogleGenerativeAI } = require("@langchain/google-genai");
const { RunnableSequence } = require("@langchain/core/runnables");
const { ChatPromptTemplate } = require("@langchain/core/prompts");
const promptValues = require("./prompts");
const docker = require("./docker");
const utils = require("./utils");

require("dotenv").config();

// Initialize Models
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

// Set up Prompts
const prompts = {
  instruct: ChatPromptTemplate.fromTemplate(promptValues.instructPrompt),
  review: ChatPromptTemplate.fromTemplate(promptValues.reviewPrompt),
  generate: ChatPromptTemplate.fromTemplate(promptValues.generatePrompt),
  revise: ChatPromptTemplate.fromTemplate(promptValues.revisePrompt),
  generateWithError: ChatPromptTemplate.fromTemplate(
    promptValues.generateWithErrorPrompt
  ),
  unitTesting: ChatPromptTemplate.fromTemplate(promptValues.unitTestPrompt),
  summarize: ChatPromptTemplate.fromTemplate(promptValues.summarizePrompt),
};

// Define Agents

// add new agent that can summarize existing codebase if it exists and add it to metadata
// this agent should act before instruct and between generate and review

const instructAgent = async (state) => {
  // console.log("INSTRUCT AGENT STATE:", state);
  console.log("INSTRUCT STEP");

  const fileList = await docker.listFiles(state.container);
  let currentCode = "";

  for (const file of fileList) {
    const content = await docker.readFile(state.container, file);
    currentCode += `FILE: ${file}\n${content}\n\n`;
  }

  const chain = RunnableSequence.from([prompts.instruct, ai_a]);
  const response = await chain.invoke({
    task: state.task,
    code: currentCode,
  });
  const instructions = response.content;
  // console.log("INSTRUCTIONS: ", instructions);

  const newHistory = [
    ...(state.history || []),
    { agent: "AI_A", message: instructions },
  ];

  return {
    state,
    history: newHistory,
    instructions,
    next: "generate",
  };
};

const generateAgent = async (state) => {
  // console.log("GENERATE AGENT STATE:", state);
  console.log("GENERATE STEP");

  const chain = RunnableSequence.from([prompts.generate, ai_b]);

  const response = await chain.invoke({
    instructions: state.instructions,
  });

  const code = response.content;

  console.log("AI OUTPUT: ", code);

  // Parse code into files
  const codeFiles = utils.parseCodeFiles(code);

  let codeFilesString = "";
  // Save files to Docker container
  for (const [filename, content] of Object.entries(codeFiles)) {
    await docker.createOrUpdateFile(state.container, filename, content);
    codeFilesString += `FILE: ${filename}\n${content}\n\n`;
  }

  console.log("GENERATED CODE: ", codeFilesString);

  const newHistory = [
    ...(state.history || []),
    { agent: "AI_B", message: codeFilesString },
  ];

  return {
    state,
    codebase: codeFilesString,
    history: newHistory,
    next: "review",
  };
};

// const unitTestingAgent = async (state) => {
//   // console.log("UNIT TESTING AGENT STATE:", state);
//   console.log("UNIT TESTING STEP");
//   const chain = RunnableSequence.from([prompts.unitTesting, ai_a]);
//   const response = await chain.invoke({
//     input: state.instructions,
//     code: state.currentCode,
//   });

//   const unitTestCommands = utils.cleanCode(response.content);
//   // console.log("UNIT TEST COMMANDS: ", unitTestCommands);
//   // console.log("END OF CONSOLE.LOG");
//   const canUnitTest = !unitTestCommands
//     .toLowerCase()
//     .includes("cannot unit-test");

//   if (!canUnitTest) {
//     return {
//       state,
//       canUnitTest,
//       unitTestResults: "No unit tests applicable.",
//       next: "review",
//     };
//   }

//   let output = "";

//   const exec = await docker.execInContainer(state.container, unitTestCommands);
//   output += `\nCommand:\n${unitTestCommands}\nOutput:\n${exec.stdout}\nError:\n${exec.stderr}\n`;

//   // console.log("UNIT TEST OUTPUT:", output);

//   return {
//     state,
//     canUnitTest,
//     unitTestResults: output,
//     next: "review",
//   };
// };

const reviewAgent = async (state) => {
  // console.log("REVIEW AGENT STATE:", state);
  console.log("REVIEW STEP");

  const chain = RunnableSequence.from([prompts.review, ai_a]);

  // console.log("CODEBASE: ", state.codebase);

  const response = await chain.invoke({
    code: state.codebase,
  });

  const codeReview = response.content;
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
  //console.log("REVISE AGENT STATE:", state);
  console.log("REVISE STEP");

  const chain = RunnableSequence.from([prompts.revise, ai_b]);

  const response = await chain.invoke({
    review: state.lastReview,
    code: state.codebase,
  });

  const code = response.content;

  console.log("AI OUTPUT: ", code);

  const codeFiles = utils.parseCodeFiles(code);
  let codeFilesString = "";
  for (const [filename, content] of Object.entries(codeFiles)) {
    await docker.createOrUpdateFile(state.container, filename, content);
    codeFilesString += `FILE: ${filename}\n${content}\n\n`;
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

  const chain = RunnableSequence.from([prompts.summarize, ai_a]);

  const response = await chain.invoke({
    codebase: state.codebase,
    task: state.task,
  });

  const summary = utils.cleanCode(response.content);
  console.log("SUMMARY: ", summary);

  const newHistory = [
    ...(state.history || []),
    { agent: "AI_A", message: summary },
  ];

  return {
    state,
    history: newHistory,
    summary,
    next: "end",
  };
};

module.exports = {
  instructAgent,
  generateAgent,
  reviewAgent,
  reviseAgent,
  summarizeAgent,
};

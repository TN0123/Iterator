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
  generate: ChatPromptTemplate.fromTemplate(
    promptValues.generateWithErrorPrompt
  ),
  revise: ChatPromptTemplate.fromTemplate(promptValues.revisePrompt),
  generateWithError: ChatPromptTemplate.fromTemplate(
    promptValues.generateWithErrorPrompt
  ),
  unitTesting: ChatPromptTemplate.fromTemplate(promptValues.unitTestPrompt),
};

// Define Agents
const instructAgent = async (state) => {
  // console.log("INSTRUCT AGENT STATE:", state);
  console.log("INSTRUCT STEP");
  const chain = RunnableSequence.from([prompts.instruct, ai_a]);
  const response = await chain.invoke({ input: state.task });
  const instructions = response.content;
  // console.log("INSTRUCTIONS: ", instructions);

  return {
    state,
    instructions,
    llmAOutput: (state.llmAOutput || []).concat([instructions]),
    next: "generate",
  };
};

const generateAgent = async (state) => {
  // console.log("GENERATE AGENT STATE:", state);
  console.log("GENERATE STEP");
  const chain = RunnableSequence.from([prompts.generateWithError, ai_b]);
  const response = await chain.invoke({ input: state.instructions });
  const code = response.content;
  // console.log("GENERATED CODE: ", code);

  // Parse code into files
  const codeFiles = utils.parseCodeFiles(code);
  console.log("CODE FILES: ", codeFiles);

  // Save files to Docker container
  for (const [filename, content] of Object.entries(codeFiles)) {
    await docker.createOrUpdateFile(state.container, filename, content);
  }

  return {
    state,
    currentCode: code,
    codeFiles: codeFiles,
    llmBOutput: (state.llmBOutput || []).concat([code]),
    next: "unit_test",
  };
};

const unitTestingAgent = async (state) => {
  // console.log("UNIT TESTING AGENT STATE:", state);
  console.log("UNIT TESTING STEP");
  const chain = RunnableSequence.from([prompts.unitTesting, ai_a]);
  const response = await chain.invoke({
    input: state.instructions,
    code: state.currentCode,
  });

  const unitTestCommands = utils.cleanCode(response.content);
  // console.log("UNIT TEST COMMANDS: ", unitTestCommands);
  // console.log("END OF CONSOLE.LOG");
  const canUnitTest = !unitTestCommands
    .toLowerCase()
    .includes("cannot unit-test");

  if (!canUnitTest) {
    return {
      state,
      canUnitTest,
      unitTestResults: "No unit tests applicable.",
      next: "review",
    };
  }

  let output = "";

  const exec = await docker.execInContainer(state.container, unitTestCommands);
  output += `\nCommand:\n${unitTestCommands}\nOutput:\n${exec.stdout}\nError:\n${exec.stderr}\n`;

  // console.log("UNIT TEST OUTPUT:", output);

  return {
    state,
    canUnitTest,
    unitTestResults: output,
    next: "review",
  };
};

const reviewAgent = async (state) => {
  // console.log("REVIEW AGENT STATE:", state);
  console.log("REVIEW STEP");

  const fileList = await docker.listFiles(state.container);
  // console.log("FILES: ", fileList);
  let codeForReview = "";

  // Read each file and format for review
  for (const file of fileList) {
    if (file.endsWith(".pyc") || file.includes("test")) {
      continue;
    }
    const content = await docker.readFile(state.container, file);
    codeForReview += `FILE: ${file}\n${content}\n\n`;
  }

  const chain = RunnableSequence.from([prompts.review, ai_a]);
  const reviewInput = `Code:\n${codeForReview}\n\nUnit Test Results:\n${state.unitTestResults}`;
  // console.log("REVIEW INPUT: ", reviewInput);
  const response = await chain.invoke({ input: reviewInput });
  const codeReview = response.content;
  const isCorrect = codeReview.toLowerCase().includes("the code is correct");
  // console.log("REVIEW: ", codeReview);

  return {
    state,
    isCorrect,
    codeReview,
    llmAOutput: (state.llmAOutput || []).concat([codeReview]),
  };
};

const reviseAgent = async (state) => {
  //console.log("REVISE AGENT STATE:", state);
  console.log("REVISE STEP");
  const chain = RunnableSequence.from([prompts.revise, ai_b]);
  const reviseInput = `Code Review:\n${state.codeReview}\n\nCurrent Code:\n${state.currentCode}`;
  console.log("REVISE INPUT: ", reviseInput);
  const response = await chain.invoke({ input: reviseInput });
  const code = response.content;
  const codeFiles = utils.parseCodeFiles(code);
  for (const [filename, content] of Object.entries(codeFiles)) {
    await docker.createOrUpdateFile(state.container, filename, content);
  }
  console.log("REVISED CODE: ", code);

  return {
    ...state,
    currentCode: code,
    llmBOutput: (state.llmBOutput || []).concat("Changes applied."),
    iterations: (state.iterations || 0) + 1,
    unitTestResults: "No unit tests applicable.",
    next: "review",
  };
};

module.exports = {
  instructAgent,
  generateAgent,
  reviewAgent,
  reviseAgent,
  unitTestingAgent,
};

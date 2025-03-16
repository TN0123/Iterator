const { ChatGoogleGenerativeAI } = require("@langchain/google-genai");
const { RunnableSequence } = require("@langchain/core/runnables");
const { ChatPromptTemplate } = require("@langchain/core/prompts");
const promptValues = require("./prompts");
const docker = require("./docker");
const utils = require("./utils");

require("dotenv").config();

// Initialize Models
const ai_a = new ChatGoogleGenerativeAI({
  modelName: "gemini-1.5-flash",
  apiKey: process.env.GEMINI_API_KEY,
  maxOutputTokens: 2048,
});

const ai_b = new ChatGoogleGenerativeAI({
  modelName: "gemini-1.5-flash",
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
  unitTesting: ChatPromptTemplate.fromTemplate(promptValues.unitTestPrompt)
};

// Define Agents
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
  const code = response.content;
  console.log("GENERATED CODE: ", code);

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
    codeFiles,
    llmBOutput: (state.llmBOutput || []).concat([code]),
    next: "unit_test",
  };
};

const unitTestingAgent = async (state) => {
  const chain = RunnableSequence.from([prompts.unitTesting, ai_a]);
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
  // console.log("REVIEW AGENT STATE:", state);

  const fileList = await docker.listFiles(state.container);
  console.log("FILES: ", fileList);
  let codeForReview = "";

  // Read each file and format for review
  for (const file of fileList) {
    const content = await docker.readFile(state.container, file);
    codeForReview += `FILE: ${file}\n${content}\n\n`;
  }

  const chain = RunnableSequence.from([prompts.review, ai_a]);
  const reviewInput = `Code:\n${codeForReview}\n\nUnit Test Results:\n${state.unitTestResults}`;
  const response = await chain.invoke({ input: reviewInput });
  const codeReview = response.content;
  const isCorrect = codeReview.toLowerCase().includes("the code is correct");
  console.log("REVIEW: ", codeReview);

  return {
    state,
    isCorrect,
    codeReview,
    llmAOutput: (state.llmAOutput || []).concat([codeReview]),
  };
};

const reviseAgent = async (state) => {
  //console.log("REVISE AGENT STATE:", state);

  const chain = RunnableSequence.from([prompts.revise, ai_b]);
  const response = await chain.invoke({ input: state.codeReview });
  const revisionDiff = response.content;
  console.log("REVISION: ", revisionDiff);

  // Apply the diff changes to the files
  const updatedFiles = await utils.parseDiffUpdates(
    revisionDiff,
    state.container,
    state.codeFiles
  );

  // Update files in Docker container
  for (const [filename, content] of Object.entries(updatedFiles)) {
    await docker.createOrUpdateFile(state.container, filename, content);
  }

  return {
    ...state,
    codeFiles: updatedFiles,
    llmBOutput: (state.llmBOutput || []).concat([revisionDiff]),
    iterations: (state.iterations || 0) + 1,
    next: "review",
  };
};

module.exports = {
  instructAgent,
  generateAgent,
  reviewAgent,
  reviseAgent,
};

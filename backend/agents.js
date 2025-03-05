const { ChatGoogleGenerativeAI } = require("@langchain/google-genai");
const { RunnableSequence } = require("@langchain/core/runnables");
const { ChatPromptTemplate } = require("@langchain/core/prompts");
const promptValues = require("./prompts");

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
  const chain = RunnableSequence.from([prompts.generateWithError, ai_b]);
  const response = await chain.invoke({ input: state.instructions });
  const code = response.content;
  console.log("GENERATED CODE: ", code);

  return {
    state,
    currentCode: code,
    llmBOutput: (state.llmBOutput || []).concat([code]),
    next: "review",
  };
};

const reviewAgent = async (state) => {
  // console.log("REVIEW AGENT STATE:", state);
  const chain = RunnableSequence.from([prompts.review, ai_a]);
  const response = await chain.invoke({ input: state.currentCode });
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
  // console.log("REVISE AGENT STATE:", state);

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

module.exports = {
  instructAgent,
  generateAgent,
  reviewAgent,
  reviseAgent,
};

const { ChatGoogleGenerativeAI } = require("@langchain/google-genai");
const { RunnableSequence } = require("@langchain/core/runnables");
const { ChatPromptTemplate } = require("@langchain/core/prompts");
const { StateGraph, END, START } = require("@langchain/langgraph");

require("dotenv").config();

const llm = new ChatGoogleGenerativeAI({
  modelName: "gemini-2.0-flash",
  apiKey: process.env.GEMINI_API_KEY,
  maxOutputTokens: 2048,
});

const promptStr1 = `You are an expert at answering questions briefly. You are asked this question, respond in one sentence: {input}`;
const promptStr2 = `{input}`;

const prompt1 = ChatPromptTemplate.fromTemplate(promptStr1);
const prompt2 = ChatPromptTemplate.fromTemplate(promptStr2);
const chain1 = RunnableSequence.from([prompt1, llm]);
const chain2 = RunnableSequence.from([prompt2, llm]);
const channels = {
  task: {
    value: (prevTask, task) => task,
  },
  stepOne: {
    value: (prevStepOne, stepOne) => stepOne,
  },
  stepTwo: {
    value: (prevStepTwo, stepTwo) => stepTwo,
  },
};

const agentStepOne = async () => {
  const response = await chain1.invoke({
    input: "why is the sky blue?",
  });
  return {
    stepOne: response.content,
  };
};

const agentStepTwo = async () => {
  const response = await chain2.invoke({
    input: "what was the first thing i asked you?",
  });
  return {
    stepTwo: response.content,
  };
};

const workflow = new StateGraph({ channels: channels });

workflow.addNode("node1", agentStepOne);
workflow.addNode("node2", agentStepTwo);

workflow.addEdge(START, "node1");
workflow.addEdge("node1", "node2");
workflow.addEdge("node2", END);

const chain = workflow.compile();

const run = async () => {
  const result = await chain.invoke({
    input: "xyz",
  });
  console.log("Result: ", result);
};
run();

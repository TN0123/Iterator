const { ChatGoogleGenerativeAI } = require("@langchain/google-genai");
const { RunnableSequence } = require("@langchain/core/runnables");
const { ChatPromptTemplate } = require("@langchain/core/prompts");
const { StateGraph, END, START } = require("@langchain/langgraph");
const workflow = require("./workflow");
const agents = require("./agents");
const docker = require("./dockerFunctions");

require("dotenv").config();

const llm = new ChatGoogleGenerativeAI({
  modelName: "gemini-2.0-flash",
  apiKey: process.env.GEMINI_API_KEY,
  maxOutputTokens: 2048,
});

const MAXITERATIONS = 3;

const testWorkflow = new StateGraph({ channels: workflow.graphStateChannels });

testWorkflow.addNode("design", agents.designAgent);
testWorkflow.addNode("instruct", agents.instructAgent);
testWorkflow.addNode("generate", agents.generateAgent);
testWorkflow.addNode("review", agents.reviewAgent);
testWorkflow.addNode("revise", agents.reviseAgent);
testWorkflow.addNode("summarize", agents.summarizeAgent);

const reviewConditionalEdges = (state) => {
  if (state.isCorrect || state.iterations >= MAXITERATIONS) {
    return "summarize";
  } else {
    return "revise";
  }
};

testWorkflow.addEdge(START, "design");
testWorkflow.addEdge("design", "instruct");
testWorkflow.addEdge("instruct", "generate");
testWorkflow.addEdge("generate", "review");
testWorkflow.addConditionalEdges("review", reviewConditionalEdges);
testWorkflow.addEdge("revise", "review");
testWorkflow.addEdge("summarize", END);

const testChain = testWorkflow.compile();

async function main() {
  const testContainer = await docker.startContainer();
  const result = await testChain.invoke({
    task: "build a snake game web app",
    container: testContainer,
  });
}

main();

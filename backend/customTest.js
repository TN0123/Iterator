const { ChatGoogleGenerativeAI } = require("@langchain/google-genai");
const { RunnableSequence } = require("@langchain/core/runnables");
const { ChatPromptTemplate } = require("@langchain/core/prompts");
const { StateGraph, END, START } = require("@langchain/langgraph");
const workflow = require("./workflow");
const agents = require("./agents");
const docker = require("./docker");

require("dotenv").config();

const llm = new ChatGoogleGenerativeAI({
  modelName: "gemini-2.0-flash",
  apiKey: process.env.GEMINI_API_KEY,
  maxOutputTokens: 2048,
});

const testWorkflow = new StateGraph({ channels: workflow.graphStateChannels });
testWorkflow.addNode("instruct", agents.instructAgent);

testWorkflow.addEdge(START, "instruct");
testWorkflow.addEdge("instruct", END);

const testChain = testWorkflow.compile();

async function main() {
  const testContainer = await docker.startContainer();
  const result = await testChain.invoke({
    task: "Create a 2048 web application",
    container: testContainer,
  });
  console.log(result.instructions);
  console.log(result.steps[0]);
}

main();

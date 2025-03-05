const agents = require("./agents");
const { StateGraph, END, START } = require("@langchain/langgraph");

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

// Create workflow graph
const workflow = new StateGraph({ channels: graphStateChannels });

// Add nodes to graph with proper configuration
workflow.addNode("instruct", agents.instructAgent);
workflow.addNode("generate", agents.generateAgent);
workflow.addNode("review", agents.reviewAgent);
workflow.addNode("revise", agents.reviseAgent);

// Set the entry point
workflow.addEdge(START, "instruct");

// conditional routing
const endOrRevise = (state) =>
  state.isCorrect || state.iterations > 3 ? END : "revise";

// Add edges
workflow.addEdge("instruct", "generate", (state) => state.next === "generate");
workflow.addEdge("generate", "review", (state) => state.next === "review");
workflow.addConditionalEdges("review", endOrRevise);
workflow.addEdge("revise", "review", (state) => state.next === "review");
workflow.addEdge("revise", END, (state) => state.next === "end");

// Compile the graph
const chain = workflow.compile();

module.exports = {
  chain,
};

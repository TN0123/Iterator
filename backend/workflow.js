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
  codebase: {
    value: (prevCodebase, codebase) => codebase,
  },
  metaKnowledge: {
    value: (prevMetaKnowledge, metaKnowledge) => metaKnowledge,
  },
  iterations: {
    value: (prevIterations, iterations) => iterations,
  },
  isCorrect: {
    value: (prevIsCorrect, isCorrect) => isCorrect,
  },
  next: {
    value: (prevNext, next) => next,
  },
  history: {
    value: (prevHistory, history) => history,
  },
  lastReview: {
    value: (prevLastReview, lastReview) => lastReview,
  },
  container: {
    value: (prevContainer, container) => container,
  },
  summary: {
    value: (prevSummary, summary) => summary,
  },
  steps: {
    value: (prevSteps, steps) => steps,
  },
  currentStep: {
    value: (prevCurrentStep, currentStep) => currentStep,
  },
};

// Create workflow graph
const workflow = new StateGraph({ channels: graphStateChannels });

// Add nodes to graph with proper configuration
workflow.addNode("instruct", agents.instructAgent);
workflow.addNode("generate", agents.generateAgent);
workflow.addNode("review", agents.reviewAgent);
workflow.addNode("revise", agents.reviseAgent);
workflow.addNode("summarize", agents.summarizeAgent);

// Set the entry point
workflow.addEdge(START, "instruct");

const MAXITERATIONS = 5;

// conditional routing
const endOrRevise = (state) =>
  state.isCorrect || state.iterations > MAXITERATIONS ? "summarize" : "revise";

// Add edges
workflow.addEdge("instruct", "generate", (state) => state.next === "generate");
workflow.addEdge("generate", "review", (state) => state.next === "review");
workflow.addConditionalEdges("review", endOrRevise);
workflow.addEdge("revise", "review", (state) => state.next === "review");
workflow.addEdge("summarize", END);

// Compile the graph
const chain = workflow.compile();

module.exports = {
  chain,
  graphStateChannels,
};

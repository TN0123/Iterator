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
};

// Create workflow graph
const workflow = new StateGraph({ channels: graphStateChannels });

// Add nodes to graph with proper configuration
workflow.addNode("design", agents.designAgent);
workflow.addNode("instruct", agents.instructAgent);
workflow.addNode("generate", agents.generateAgent);
workflow.addNode("review", agents.reviewAgent);
workflow.addNode("revise", agents.reviseAgent);
workflow.addNode("summarize", agents.summarizeAgent);

const MAXITERATIONS = 3;

// conditional routing

const reviewConditionalEdges = (state) => {
  if (state.isCorrect || state.iterations >= MAXITERATIONS) {
    return "summarize";
  } else {
    return "revise";
  }
};

// Add edges
workflow.addEdge(START, "design");
workflow.addEdge("design", "instruct");
workflow.addEdge("instruct", "generate");
workflow.addEdge("generate", "review");
workflow.addConditionalEdges("review", reviewConditionalEdges);
workflow.addEdge("revise", "review");
workflow.addEdge("summarize", END);

// Compile the graph
const chain = workflow.compile();

module.exports = {
  chain,
  graphStateChannels,
};

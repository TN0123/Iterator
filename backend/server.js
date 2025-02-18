const express = require("express");
const cors = require("cors");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { ChatGoogleGenerativeAI } = require("@langchain/google-genai");
const { BufferMemory } = require("langchain/memory");
const { LLMChain } = require("langchain/chains");
const { ChatPromptTemplate } = require("@langchain/core/prompts");

require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

// dumb ai model
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const geminiModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// agent models
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

// agent memories
const ai_a_memory = new BufferMemory({
  returnMessages: true,
});

const ai_b_memory = new BufferMemory({
  returnMessages: true,
});

// agent prompts
const ai_a_instruct_step = ChatPromptTemplate.fromTemplate(`
  You are a developer who is pair programming with another developer.
  You are given a task and you want to give the other developer a step
  by step explanation on how to solve the problem. Limit your instructions
  to be under 100 words but be thorough in your description. The other
  developer should be able to read your instructions and write neat and
  efficient code with your logic. Here is the task, respond with only a
  numbered list of instructions and a brief summary of the task: {input}
`);

const ai_a_review_step = ChatPromptTemplate.fromTemplate(`
  You are a developer who is pair programming with another developer.
  You have been given this code by the other developer. Find any errors
  in the code. If there are errors, be concise in your explanation of
  the errors. If the code is correct, say the following phrase exactly:
  the code is correct.
  Here is the code:
  {input}
`);

const ai_b_generate_step = ChatPromptTemplate.fromTemplate(`
  You are a developer who is pair programming with another developer.
  You have been given these instructions by the other developer. Write neat,
  well formatted, efficient code with the logic provided by the developer. Here are
  the instructions, respond only with the code: {input}
`);

const ai_b_revise_step = ChatPromptTemplate.fromTemplate(`
  You are a developer who is pair programming with another developer.
  The other the developer received your code and has provided the
  following feedback. Follow the feedback to revise the code. Respond with
  the code only. Here is the feedback: {input}
`);

// agent chains
// set verbose to true for detailed logs
const ai_a_instruct_chain = new LLMChain({
  llm: ai_a,
  prompt: ai_a_instruct_step,
  memory: ai_a_memory,
  verbose: false,
});

const ai_a_review_chain = new LLMChain({
  llm: ai_a,
  prompt: ai_a_review_step,
  memory: ai_a_memory,
  verbose: false,
});

const ai_b_generate_chain = new LLMChain({
  llm: ai_b,
  prompt: ai_b_generate_step,
  memory: ai_b_memory,
  verbose: false,
});

const ai_b_revise_chain = new LLMChain({
  llm: ai_b,
  prompt: ai_b_revise_step,
  memory: ai_b_memory,
  verbose: false,
});

app.post("/api/dumbchat", async (req, res) => {
  const userInput = req.body.message;
  const prompt = `
    Write neat, well formatted, and efficient code to solve the following task,
    return the code only. Here is the task: ${userInput}
    `;

  const response = await geminiModel.generateContent(prompt);
  res.json({ finalCode: response.response.text() });
});

app.post("/api/chat", async (req, res) => {
  let llmAOutput = [];
  let llmBOutput = [];
  try {
    const userInput = req.body.message;
    let currentCode = "";
    let finalCode = "";
    let iterations = 0;
    const MAX_ITERATIONS = 3;

    const instructions = await ai_a_instruct_chain.call({ input: userInput });
    console.log("INSTRUCTIONS:\n", instructions.text);
    llmAOutput.push(instructions.text);

    const codeResult = await ai_b_generate_chain.call({
      input: instructions.text,
    });
    currentCode = codeResult.text;
    console.log("FIRST ATTEMPT: \n ", currentCode);
    llmBOutput.push(currentCode);

    while (iterations < MAX_ITERATIONS) {
      await ai_a_memory.loadMemoryVariables({});
      await ai_b_memory.loadMemoryVariables({});

      const reviewResult = await ai_a_review_chain.call({
        input: currentCode,
      });
      console.log(iterations, "REVIEW: \n", reviewResult.text);
      llmAOutput.push(reviewResult.text);

      if (reviewResult.text.toLowerCase().includes("the code is correct")) {
        finalCode = currentCode;
        break;
      }

      const revisionResult = await ai_b_revise_chain.call({
        input: reviewResult.text,
      });
      currentCode = revisionResult.text;
      console.log(iterations, "REVISION: \n", currentCode);
      llmBOutput.push(currentCode);
      iterations++;

      if (iterations === MAX_ITERATIONS) {
        finalCode = currentCode;
      }
    }

    await ai_a_memory.clear();
    await ai_b_memory.clear();

    res.json({
      originalPrompt: userInput,
      llmAOutput: llmAOutput,
      llmBOutput: llmBOutput,
      instructions: instructions.text,
      finalCode: finalCode,
      iterationsUsed: iterations,
    });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

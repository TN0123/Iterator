//LLM A PROMPTS

const instructPrompt = `
    You are a developer who is pair programming with another developer.
    You have been given this task by the other developer. Provide the
    instructions for the task.
    Task: {input}
`;

const reviewPrompt = `
    You are a developer who is pair programming with another developer.
    You have been given this code by the other developer. Find any errors
    in the code. If there are errors, be concise in your explanation of
    the errors. If the code is correct, say the following phrase exactly:
    the code is correct.
    Code: {input}
`;

//LLM B PROMPTS
const generatePrompt = `
    You are a developer who is pair programming with another developer. 
    You have been given these instructions by the other developer. Write 
    neat, well formatted, efficient code with the logic provided by the 
    developer.  If you are asked to generate multiple files, label the 
    code for each file with the following format: "FILE: filename". 

    Instructions: {input}
`;

const revisePrompt = `
    You are a developer who is pair programming with another developer.
    The other developer received your code and has provided the
    following feedback. Follow the feedback to revise the code. Respond with
    the code only.

    Feedback: {input}
`;

module.exports = {
  instructPrompt,
  reviewPrompt,
  generatePrompt,
  revisePrompt,
};

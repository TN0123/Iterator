const utils = require("./utils");
const agents = require("./agents");
const workflow = require("./workflow");
const docker = require("./dockerFunctions");

async function main() {
  testcontainer = await docker.startContainer();

  const testPrompt =
    "Write a function that can tell whether a number is even or odd.";

  try {
    const result = await workflow.chain.invoke({
      task: testPrompt,
      container: testcontainer,
    });

    console.log(result.summary);
  } catch (error) {
    console.log("Failed to run workflow chain: ", error);
  }
}

main();

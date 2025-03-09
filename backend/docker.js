const Docker = require("dockerode");
const tar = require("tar-stream");
const fs = require("fs").promises;
const path = require("path");
const { Readable } = require("stream");

require("dotenv").config();

const docker = new Docker();

const startContainer = async () => {
  const container = await docker.createContainer({
    Image: "ubuntu",
    Tty: true,
    Cmd: ["/bin/bash", "-c", "mkdir -p /code && exec /bin/bash"],
  });
  await container.start();

  container.logs(
    {
      follow: true,
      stdout: true,
      stderr: true,
    },
    (err, stream) => {
      if (err) {
        console.error("Error getting container logs:", err);
        return;
      }
      stream.on("data", (chunk) => {
        console.log(chunk.toString());
      });
    }
  );

  return container;
};

const cleanUpContainer = async (container) => {
  await container.stop();
  await container.remove();
};

/**
 * Creates or updates a file in the Docker container
 * @param {Object} container - The dockerode container instance
 * @param {string} filePath - The path of the file inside the container (relative to /code)
 * @param {string} content - The content to write to the file
 * @returns {Promise<boolean>} - Whether the operation was successful
 */
const createOrUpdateFile = async (container, filePath, content) => {
  try {
    // Use Node.js path module to handle path operations
    const basename = path.basename(filePath);
    const dirname = path.dirname(filePath);

    // Create a tarball containing the file
    const pack = tar.pack();

    // Add the file to the tarball
    pack.entry({ name: basename }, content);
    pack.finalize();

    // Convert pack to a buffer to send to container
    const chunks = [];
    for await (const chunk of pack) {
      chunks.push(chunk);
    }
    const tarBuffer = Buffer.concat(chunks);

    // Ensure the directory exists
    if (dirname !== ".") {
      await execInContainer(container, `mkdir -p /code/${dirname}`);
    }

    // Put the file in the container
    await container.putArchive(tarBuffer, { path: `/code/${dirname}` });

    return true;
  } catch (error) {
    console.error(`Error creating/updating file ${filePath}:`, error);
    return false;
  }
};

/**
 * Reads the content of a file from the Docker container
 * @param {Object} container - The dockerode container instance
 * @param {string} filePath - The path of the file inside the container (relative to /code)
 * @returns {Promise<string|null>} - The content of the file or null if error
 */
const readFile = async (container, filePath) => {
  try {
    // Get the file content through execution
    const { stdout } = await execInContainer(
      container,
      `cat /code/${filePath}`
    );
    return stdout;
  } catch (error) {
    console.error(`Error reading file ${filePath}:`, error);
    return null;
  }
};

/**
 * Lists files in a directory in the Docker container
 * @param {Object} container - The dockerode container instance
 * @returns {Promise<Array<string>|null>} - Array of file paths or null if error
 */
const listFiles = async (container) => {
  try {
    const { stdout } = await execInContainer(
      container,
      `find /code/ -type f -not -path "*/\\.*" | sort`
    );

    if (!stdout) return [];

    return stdout
      .split("\n")
      .filter(Boolean)
      .map((file) => file.replace("/code/", ""));
  } catch (error) {
    console.error(`Error listing files in ${dirPath}:`, error);
    return null;
  }
};

/**
 * Deletes a file in the Docker container
 * @param {Object} container - The dockerode container instance
 * @param {string} filePath - The path of the file to delete (relative to /code)
 * @returns {Promise<boolean>} - Whether the deletion was successful
 */
const deleteFile = async (container, filePath) => {
  try {
    await execInContainer(container, `rm /code/${filePath}`);
    return true;
  } catch (error) {
    console.error(`Error deleting file ${filePath}:`, error);
    return false;
  }
};

/**
 * Execute a command in the Docker container
 * @param {Object} container - The dockerode container instance
 * @param {string} command - The command to execute
 * @returns {Promise<{stdout: string, stderr: string}>} - Command execution results
 */
const execInContainer = async (container, command) => {
  console.log("EXECUTING COMMAND: ", command);

  const exec = await container.exec({
    Cmd: ["bash", "-c", command],
    AttachStdout: true,
    AttachStderr: true,
  });

  const stream = await exec.start();

  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";

    stream.on("data", (chunk) => {
      const streamType = chunk[0];
      const data = chunk.slice(8).toString();

      // stdout (1) or stderr (2)
      if (streamType === 1) stdout += data;
      else if (streamType === 2) stderr += data;
    });

    stream.on("end", () => {
      resolve({ stdout, stderr });
    });

    stream.on("error", (error) => {
      reject(error);
    });
  });
};

module.exports = {
  startContainer,
  cleanUpContainer,
  createOrUpdateFile,
  readFile,
  listFiles,
  deleteFile,
  execInContainer,
};

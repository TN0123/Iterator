const docker = require("./dockerFunctions");
const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");

const cleanCode = (code) =>
  code.replace(/```[a-zA-Z]*/g, "").replace(/```/g, "");

async function readDockerDirectory(containerId, directoryPath) {
  return new Promise((resolve, reject) => {
    exec(
      `docker exec ${containerId} find ${directoryPath} -type f`,
      (err, stdout, stderr) => {
        if (err || stderr) {
          return reject(err || new Error(stderr));
        }

        const files = stdout.trim().split("\n").filter(Boolean); // Remove empty lines

        if (files.length === 0) {
          return resolve("No files found.");
        }

        // Read each file using cat
        let fileReadPromises = files.map((file) => {
          if (!file.split('.')[0].includes("UNIT_TESTER")) {
            return new Promise((resolve, reject) => {
              exec(
                `docker exec ${containerId} cat ${file}`,
                (err, stdout, stderr) => {
                  if (err || stderr) {
                    return reject(err || new Error(stderr));
                  }
                  resolve(`FILE: ${path.basename(file)}\n${stdout.trim()}`);
                }
              );
            });
          }
        });

        Promise.all(fileReadPromises)
          .then((fileContents) => resolve(fileContents.join("\n\n")))
          .catch(reject);
      }
    );
  });
}

const parseCodeFiles = (codeText) => {
  const files = {};
  let currentFileName = null;
  let currentFileContent = [];

  // Split by lines
  const lines = codeText.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check if line contains a file marker
    const fileMatch = line.match(/^FILE:\s*(.+)$/);

    if (fileMatch) {
      // Save previous file if exists
      if (currentFileName) {
        files[currentFileName] = currentFileContent.join("\n");
        currentFileContent = [];
      }

      // Start new file
      currentFileName = fileMatch[1].trim();
    } else if (currentFileName) {
      currentFileContent.push(cleanCode(line));
    }
  }

  // Save the last file
  if (currentFileName) {
    files[currentFileName] = currentFileContent.join("\n");
  }

  return files;
};

module.exports = {
  cleanCode,
  parseCodeFiles,
  readDockerDirectory
};

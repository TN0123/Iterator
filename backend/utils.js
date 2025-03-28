const docker = require("./docker");

const cleanCode = (code) =>
  code.replace(/```[a-zA-Z]*/g, "").replace(/```/g, "");

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
      currentFileContent.push(line);
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
};

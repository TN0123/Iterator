const fs = require("fs");
const path = require("path");

const cleanCode = (code) =>
  code.replace(/```[a-zA-Z]*/g, "").replace(/```/g, "");

const parseCodeFiles = (codeText) => {
  const files = {};
  const deletedFiles = [];
  let currentFileName = null;
  let currentFileContent = [];

  // Split by lines
  const lines = codeText.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Handle file creation
    const fileMatch = line.match(/^FILE:\s*(.+)$/);
    if (fileMatch) {
      // Save previous file if exists
      if (currentFileName) {
        files[currentFileName] = currentFileContent.join("\n");
        currentFileContent = [];
      }

      currentFileName = fileMatch[1].trim();
      continue;
    }

    // Handle file deletion
    const deleteMatch = line.match(/^DELETE FILE:\s*(.+)$/);
    if (deleteMatch) {
      const filenameToDelete = deleteMatch[1].trim();
      deletedFiles.push(filenameToDelete);

      // Clear current context in case DELETE FILE appears between FILEs
      currentFileName = null;
      currentFileContent = [];
      continue;
    }

    if (currentFileName) {
      currentFileContent.push(cleanCode(line));
    }
  }

  // Save last file if there is one
  if (currentFileName) {
    files[currentFileName] = currentFileContent.join("\n");
  }

  return { files, deletedFiles };
};

module.exports = {
  cleanCode,
  parseCodeFiles,
};

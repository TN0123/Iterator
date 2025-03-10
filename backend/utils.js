const parseCodeFiles = (codeText) => {
  const files = {};
  let currentFileName = null;
  let currentFileContent = [];
  let insideCodeBlock = false;

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
      insideCodeBlock = false;
    } else if (currentFileName) {
      if (line.trim().startsWith("```")) {
        insideCodeBlock = !insideCodeBlock;
        continue; // Skip storing the backtick lines
      }

      if (insideCodeBlock) {
        currentFileContent.push(line);
      }
    }
  }

  // Save the last file
  if (currentFileName) {
    files[currentFileName] = currentFileContent.join("\n");
  }

  return files;
};

const parseDiffUpdates = async (diffText, container, currentFiles) => {
  const lines = diffText.split("\n");
  let i = 0;
  const updatedFiles = { ...currentFiles };

  while (i < lines.length) {
    // Look for change blocks
    if (lines[i].trim().startsWith("CHANGE")) {
      const changeType = lines[i].match(/\[type:\s*(\w+)\]/)?.[1];
      i++;

      // Get filename
      const fileMatch = lines[i].match(/FILE:\s*\[(.+?)\]/);
      if (!fileMatch) {
        i++;
        continue;
      }
      const filename = fileMatch[1];
      i++;

      // Get target
      const targetMatch = lines[i].match(/TARGET\s*\[(.+?)\]/);
      const target = targetMatch ? targetMatch[1] : null;
      i++;

      // Skip context
      while (i < lines.length && !lines[i].trim().startsWith("OLD:")) {
        i++;
      }

      // Get old code section
      let oldCode = [];
      i++; // Skip OLD: line

      if (lines[i].trim() === "```") {
        i++; // Skip opening backticks
        while (i < lines.length && lines[i].trim() !== "```") {
          oldCode.push(lines[i]);
          i++;
        }
        i++; // Skip closing backticks
      }

      // Get new code section
      let newCode = [];
      while (i < lines.length && !lines[i].trim().startsWith("NEW:")) {
        i++;
      }

      i++; // Skip NEW: line

      if (i < lines.length && lines[i].trim() === "```") {
        i++; // Skip opening backticks
        while (i < lines.length && lines[i].trim() !== "```") {
          newCode.push(lines[i]);
          i++;
        }
        i++; // Skip closing backticks
      }

      // Update file based on change type
      if (changeType === "replace" || changeType === "insert") {
        // Get current file content
        let currentContent = "";
        if (updatedFiles[filename]) {
          currentContent = updatedFiles[filename];
        } else if (await docker.readFile(container, filename)) {
          currentContent = await docker.readFile(container, filename);
        }

        // Replace or insert content
        if (changeType === "replace" && oldCode.length > 0) {
          const oldCodeStr = oldCode.join("\n");
          const newCodeStr = newCode.join("\n");
          updatedFiles[filename] = currentContent.replace(
            oldCodeStr,
            newCodeStr
          );
        } else {
          // For inserts or if we can't find the old code, just use the whole file
          updatedFiles[filename] = newCode.join("\n");
        }
      } else if (changeType === "delete") {
        // If delete operation and file exists in updatedFiles
        if (updatedFiles[filename]) {
          const oldCodeStr = oldCode.join("\n");
          updatedFiles[filename] = updatedFiles[filename].replace(
            oldCodeStr,
            ""
          );
        }
      }

      // Skip to END_CHANGE
      while (i < lines.length && !lines[i].trim().startsWith("END_CHANGE")) {
        i++;
      }
    }
    i++;
  }

  return updatedFiles;
};

module.exports = {
  parseCodeFiles,
  parseDiffUpdates,
};

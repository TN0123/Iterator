const cleanCode = (code) =>
  code.replace(/```[a-zA-Z]*/g, "").replace(/```/g, "");

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

/**
 * Updates file content using diff output
 * @param {string} originalContent - The original file content
 * @param {string} diffContent - The diff content to apply
 * @returns {string} - The updated file content after applying the diff
 */
function applyDiff(originalContent, diffContent) {
  // Split content into lines
  const originalLines = originalContent.split("\n");
  const diffLines = diffContent.split("\n");

  // Result array to build the updated content
  const result = [...originalLines];

  // Position tracking
  let currentLine = 0;

  // Process each line of the diff
  for (let i = 0; i < diffLines.length; i++) {
    const line = diffLines[i];

    // Check for diff command lines
    if (line.startsWith("@@")) {
      // Parse the line numbers from the diff header
      // Format: @@ -originalStart,originalCount +newStart,newCount @@
      const match = line.match(/@@ -(\d+),?(\d*) \+(\d+),?(\d*) @@/);
      if (match) {
        const originalStart = parseInt(match[1]);
        currentLine = originalStart - 1; // Adjust to 0-based index
        continue;
      }
    }

    // Handle line additions
    if (line.startsWith("+")) {
      // Add the new line (removing the '+' prefix)
      result.splice(currentLine, 0, line.substring(1));
      currentLine++;
      continue;
    }

    // Handle line deletions
    if (line.startsWith("-")) {
      // Remove the line
      result.splice(currentLine, 1);
      continue;
    }

    // Handle context lines (unchanged)
    if (line.startsWith(" ")) {
      // Move to the next line
      currentLine++;
      continue;
    }
  }

  // Join the result back into a string
  return result.join("\n");
}

/**
 * Updates a file with diff content
 * @param {string} filePath - Path to the file to update
 * @param {string} diffContent - The diff content to apply
 * @returns {Promise<void>}
 */
async function updateFileWithDiff(filePath, diffContent) {
  const fs = require("fs").promises;

  try {
    // Read the original file content
    const originalContent = await fs.readFile(filePath, "utf8");

    // Apply the diff
    const updatedContent = applyDiff(originalContent, diffContent);

    // Write back to the file
    await fs.writeFile(filePath, updatedContent, "utf8");

    console.log(`Successfully updated ${filePath}`);
  } catch (error) {
    console.error(`Error updating file: ${error.message}`);
    throw error;
  }
}

/**
 * Parse the AI's revision output into file-specific diffs
 * @param {string} diffText - The AI's output containing diffs
 * @returns {Object} - An object mapping filenames to their diffs
 */
function parseDiffResponse(diffText) {
  const fileDiffs = {};
  let currentFile = null;
  let currentDiff = [];

  const lines = diffText.split("\n");
  let collectingDiff = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (line.startsWith("FILE: ")) {
      // Save previous file diff if exists
      if (currentFile && currentDiff.length > 0) {
        fileDiffs[currentFile] = currentDiff.join("\n");
      }

      // Start new file
      currentFile = line.substring(6).trim();
      currentDiff = [];
      collectingDiff = false;
    } else if (line === "DIFF:") {
      collectingDiff = true;
    } else if (collectingDiff && currentFile) {
      // Only collect diff lines after seeing the DIFF: marker
      currentDiff.push(line);
    }
  }

  // Save the last file's diff
  if (currentFile && currentDiff.length > 0) {
    fileDiffs[currentFile] = currentDiff.join("\n");
  }

  return fileDiffs;
}

/**
 * Extract content for new files from a diff
 * @param {string} diffContent - The diff content
 * @returns {string|null} - Extracted file content or null if not possible
 */
function extractNewFileContent(diffContent) {
  const lines = diffContent.split("\n");
  const content = [];

  for (const line of lines) {
    // Only extract lines that are being added (ignoring chunk headers)
    if (
      line.startsWith("+") &&
      !line.startsWith("+++") &&
      !line.startsWith("@@ ")
    ) {
      content.push(line.substring(1));
    }
  }

  return content.length > 0 ? content.join("\n") : null;
}

module.exports = {
  cleanCode,
  parseCodeFiles,
  updateFileWithDiff,
  parseDiffResponse,
  extractNewFileContent,
  applyDiff,
};

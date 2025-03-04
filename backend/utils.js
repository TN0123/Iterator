const parseGeneratedCode = (code) => {
  const files = {};
  let currentFile = null;
  let currentContent = [];

  const lines = code.split("\n");

  for (const line of lines) {
    if (line.startsWith("FILE: ")) {
      if (currentFile) {
        files[currentFile] = currentContent.join("\n");
      }
      currentFile = line.replace("FILE: ", "").trim();
      currentContent = [];
    } else {
      if (currentFile) {
        currentContent.push(line);
      }
    }

    if (currentFile) {
      files[currentFile] = currentContent.join("\n");
    }
  }

  return files;
};

module.exports = {
  parseGeneratedCode,
};

//This file contains a previous failed attempts at getting the
// revise agent to programmatically apply changes via diffs.

const revisePrompt = `
You are a coding AI tasked with generating precise file modification 
instructions based on the following feedback from a senior software developer:

=== Feedback and Code files ===
{input}
===============

First, CAREFULLY READ and ANALYZE the file content before creating modification instructions.

Your job is to output a JSON array of change instructions. Each change instruction must follow this format:
{{
  "file": "<file-path>",
  "action": "replace" | "append" | "prepend" | "delete",
  "target": "<EXACT string to target>",
  "replacement": "<new code snippet if applicable>"
}}

CRITICAL REQUIREMENTS:
1. COPY-PASTE EXACT STRINGS: The "target" MUST be copied directly from the file content, including all whitespace, indentation, and line breaks. Do not modify a single character.
2. PAY ATTENTION TO VARIABLE NAMES: Check if you're using the correct variable names from the code (e.g., 'number' vs 'num').
3. MATCH INDENTATION EXACTLY: Indentation in Python is critical - match it precisely in both target and replacement.
4. VERIFY EXISTENCE: Double-check that your target string actually exists in the file by doing a search.
5. DO NOT GUESS: If you're not 100% certain about the exact content, request more information.

Example of before-after code changes:

Original code:
\`\`\`python
def calculate_modulo_8(number):
    """Calculates the modulo 8 of a given number."""
    try:
        number = int(number)
    except ValueError:
        return "Invalid input: Please provide an integer."
    return number / 8  # Intentional error: using division instead of modulo
\`\`\`

Correct change instruction:
[
  {{
    "file": "modulo_8.py", 
    "action": "replace",
    "target": "    return number / 8  # Intentional error: using division instead of modulo",
    "replacement": "    return number % 8  # Using modulo operator for correct calculation"
  }}
]

Output ONLY the JSON array with valid changes - no explanations or other text.
`;

/**
 * Applies a change instruction to a file.
 * @param {Object} change - Change instruction object
 */
async function getChange(container, change) {
  let content = await docker.readFile(container, change.file);
  let modified = false;

  console.log("FILE: ", change.file);
  console.log("CONTENT:", content);
  console.log("ACTION:", change.action);
  console.log("TARGET:", change.target);
  console.log("REPLACEMENT:", change.replacement);

  switch (change.action) {
    case "replace":
      if (content.includes(change.target)) {
        content = content.replace(change.target, change.replacement);
        modified = true;
      }
      break;

    case "append":
      content += "\n" + change.replacement;
      modified = true;
      break;

    case "prepend":
      content = change.replacement + "\n" + content;
      modified = true;
      break;

    case "delete":
      if (content.includes(change.target)) {
        content = content.replace(change.target, "");
        modified = true;
      }
      break;

    default:
      throw new Error(`Unsupported action: ${change.action}`);
  }

  if (modified) {
    console.log(`Changes applied to ${change.file}`);
    return content;
  } else {
    console.log(
      `No changes made to ${change.file}. Target not found or unnecessary.`
    );
    return null;
  }
}

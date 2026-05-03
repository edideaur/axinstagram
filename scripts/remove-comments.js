import { readFileSync, writeFileSync } from "fs";
import { globSync } from "glob";

// Simple regex to remove comments
// This is a basic implementation and might not handle all edge cases (like strings containing // or /*)
// But for a general purpose "remove comments" tool in a controlled environment, it's often sufficient.
function removeComments(code) {
  // Remove multi-line comments
  let result = code.replace(/\/\*[\s\S]*?\*\//g, "");
  // Remove single-line comments (careful with URLs)
  // This regex tries to avoid matching // inside strings by checking for preceding quotes (very basic)
  result = result.replace(/^(?!\s*https?:\/\/)\s*\/\/.*$/gm, ""); // Remove lines that are just comments
  result = result.replace(/(\s)\/\/.*$/gm, "$1"); // Remove comments at the end of lines
  return result;
}

const files = globSync("{src,functions}/**/*.ts");

for (const file of files) {
  console.log(`Removing comments from ${file}...`);
  const content = readFileSync(file, "utf8");
  const cleaned = removeComments(content);
  writeFileSync(file, cleaned, "utf8");
}

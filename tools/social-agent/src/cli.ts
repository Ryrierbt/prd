import { readFile } from "node:fs/promises";
import path from "node:path";
import { collectionAgent } from "./index.js";

function inputArgument(argv: string[]): string {
  const index = argv.indexOf("--input");
  const value = index >= 0 ? argv[index + 1] : undefined;
  if (!value) throw new Error("Usage: npm run collect -- --input <input.json>");
  return value;
}

try {
  const inputPath = path.resolve(inputArgument(process.argv.slice(2)));
  const input = JSON.parse(await readFile(inputPath, "utf8"));
  const result = await collectionAgent.run(input);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exit(result.summary.status === "failed" ? 1 : 0);
} catch (error) {
  process.stderr.write(`${String(error)}\n`);
  process.exit(1);
}

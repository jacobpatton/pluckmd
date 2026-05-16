import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const TEMPLATES_DIR = dirname(fileURLToPath(import.meta.url));

export async function loadTemplate(filename: string): Promise<string> {
  return readFile(join(TEMPLATES_DIR, filename), "utf-8");
}

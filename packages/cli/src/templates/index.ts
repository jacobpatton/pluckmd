import { readFile, access } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const THIS_DIR = dirname(fileURLToPath(import.meta.url));

// In dev (tsx): templates live alongside this file in src/templates/
// In bundle (tsup): this file is dist/index.js, templates are in dist/templates/
async function resolveTemplatesDir(): Promise<string> {
  const bundled = join(THIS_DIR, "templates");
  try {
    await access(bundled);
    return bundled;
  } catch {
    return THIS_DIR;
  }
}

export async function loadTemplate(filename: string): Promise<string> {
  const dir = await resolveTemplatesDir();
  return readFile(join(dir, filename), "utf-8");
}

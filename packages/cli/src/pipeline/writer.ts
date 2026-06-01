import { mkdir, writeFile, access } from "node:fs/promises";
import { join } from "node:path";
import type { ArticleMetadata } from "@pluckmd/shared";

const MAX_FILENAME_LENGTH = 100;

function buildFrontmatter(metadata: ArticleMetadata): string {
  const lines = ["---"];
  lines.push(`title: "${metadata.title.replace(/"/g, '\\"')}"`);
  if (metadata.publishedAt) lines.push(`date: ${metadata.publishedAt}`);
  lines.push(`source: ${metadata.url}`);
  if (metadata.author) lines.push(`author: ${metadata.author}`);
  if (metadata.tags?.length) {
    lines.push(`tags: [${metadata.tags.join(", ")}]`);
  }
  lines.push("---");
  return lines.join("\n");
}

function sanitizeFilename(name: string): string {
  return name
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, "_")
    .substring(0, MAX_FILENAME_LENGTH);
}

async function findUniquePath(directory: string, baseName: string): Promise<string> {
  let candidate = join(directory, `${baseName}.md`);
  let counter = 1;
  while (true) {
    try {
      await access(candidate);
      counter++;
      candidate = join(directory, `${baseName}-${counter}.md`);
    } catch {
      return candidate;
    }
  }
}

export async function writeArticle(
  outputDir: string,
  metadata: ArticleMetadata,
  markdownBody: string,
): Promise<string> {
  await mkdir(outputDir, { recursive: true });

  const baseName = sanitizeFilename(metadata.title);
  const filepath = await findUniquePath(outputDir, baseName);

  const frontmatter = buildFrontmatter(metadata);
  const content = `${frontmatter}\n\n# ${metadata.title}\n\n${markdownBody}\n`;

  await writeFile(filepath, content, "utf-8");
  return filepath;
}

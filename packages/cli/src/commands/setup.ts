import { mkdir, copyFile, readdir, access, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { getConfigDir } from "@pluckmd/shared";
import { loadTemplate } from "../templates/index.js";

const SKILLS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "..",
  "skills",
);

type AgentType = "claude-code" | "agents" | "all";
const ALL_AGENT_TYPES: readonly AgentType[] = ["claude-code", "agents"] as const;

interface SetupOptions {
  agent: AgentType;
  target?: string;
}

export async function setupCommand(options: SetupOptions): Promise<void> {
  const agentTypes = options.agent === "all"
    ? ALL_AGENT_TYPES
    : [options.agent];

  for (const agentType of agentTypes) {
    if (agentType === "claude-code") {
      await installClaudeCodeSkills();
    } else {
      await installAgentsMd(options.target || ".");
    }
  }

  await mkdir(getConfigDir(), { recursive: true });
  console.log(`\n✅ Config directory: ${getConfigDir()}`);
}

async function installClaudeCodeSkills(): Promise<void> {
  const sourceDir = join(SKILLS_DIR, "claude-code");
  const destinationDir = join(homedir(), ".claude", "commands");

  await mkdir(destinationDir, { recursive: true });

  let skillFiles: string[];
  try {
    skillFiles = (await readdir(sourceDir)).filter((filename: string) => filename.endsWith(".md"));
  } catch {
    await writeBuiltinSkills(destinationDir);
    return;
  }

  for (const filename of skillFiles) {
    await copyFile(join(sourceDir, filename), join(destinationDir, filename));
    console.log(`  📄 ${destinationDir}/${filename}`);
  }

  console.log(`\n✅ Claude Code skills installed to ${destinationDir}`);
  console.log("   Use: /pluckmd-wiki, /pluckmd-slides");
}

async function installAgentsMd(targetDir: string): Promise<void> {
  const sourcePath = join(SKILLS_DIR, "agents", "AGENTS.md");
  const destinationPath = join(targetDir, "AGENTS.md");

  try {
    await access(sourcePath);
    await copyFile(sourcePath, destinationPath);
  } catch {
    await writeBuiltinAgentsMd(destinationPath);
    return;
  }

  console.log(`  📄 ${destinationPath}`);
  console.log(`\n✅ AGENTS.md installed to ${targetDir}`);
  console.log("   Works with: Codex, Cursor, Windsurf, Cline, Aider");
}

async function writeBuiltinSkills(destinationDir: string): Promise<void> {
  const downloadSkill = await loadTemplate("download-skill.md");
  const wikiSkill = await loadTemplate("wiki-skill.md");
  const slidesSkill = await loadTemplate("slides-skill.md");

  await writeFile(join(destinationDir, "pluckmd-download.md"), downloadSkill, "utf-8");
  await writeFile(join(destinationDir, "pluckmd-wiki.md"), wikiSkill, "utf-8");
  await writeFile(join(destinationDir, "pluckmd-slides.md"), slidesSkill, "utf-8");

  console.log(`  📄 ${destinationDir}/pluckmd-download.md`);
  console.log(`  📄 ${destinationDir}/pluckmd-wiki.md`);
  console.log(`  📄 ${destinationDir}/pluckmd-slides.md`);
  console.log(`\n✅ Claude Code skills installed`);
}

async function writeBuiltinAgentsMd(destinationPath: string): Promise<void> {
  const content = await loadTemplate("agents.md");

  await writeFile(destinationPath, content, "utf-8");
  console.log(`  📄 ${destinationPath}`);
  console.log(`\n✅ AGENTS.md installed`);
}

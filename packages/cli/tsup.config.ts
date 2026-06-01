import { defineConfig } from "tsup";
import { cp } from "node:fs/promises";
import { join } from "node:path";

export default defineConfig({
  entry: ["src/index.ts"],
  format: "esm",
  target: "node20",
  platform: "node",
  outDir: "dist",
  clean: true,
  splitting: false,
  sourcemap: false,
  // Bundle @pluckmd/shared into the output so npm users don't need it
  noExternal: ["@pluckmd/shared"],
  // Keep other dependencies as external (installed via package.json)
  external: [
    "commander",
    "jsdom",
    "zod",
    "@mozilla/readability",
    "turndown",
    "turndown-plugin-gfm",
    "gray-matter",
    "p-limit",
    "ws",
    "playwright",
  ],
  // Shebang is already in src/index.ts; tsup preserves it.
  async onSuccess() {
    // Copy template .md files to dist/templates/
    const srcDir = join("src", "templates");
    const destDir = join("dist", "templates");
    await cp(srcDir, destDir, {
      recursive: true,
      filter: (src) => !src.endsWith(".ts"),
    });
  },
});

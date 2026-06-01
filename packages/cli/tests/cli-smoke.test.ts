import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const cliArgs = ["--import", "tsx", "packages/cli/src/index.ts"];

describe("pluckmd CLI", () => {
  it("prints command help without loading the extraction pipeline", async () => {
    const result = await execFileAsync(process.execPath, [...cliArgs, "download", "--help"], {
      cwd: process.cwd(),
    });

    expect(result.stdout).toContain("Usage: pluckmd download");
    expect(result.stdout).toContain("--limit <n>");
  });

  it("rejects invalid numeric options before running a command", async () => {
    await expect(
      execFileAsync(process.execPath, [...cliArgs, "download", "--limit", "0", "https://example.com"], {
        cwd: process.cwd(),
      }),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("must be a positive integer"),
    });
  });
});

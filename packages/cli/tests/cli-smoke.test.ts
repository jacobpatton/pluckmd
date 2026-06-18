import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const cliArgs = ["--import", "tsx", "packages/cli/src/index.ts"];

describe("pluckmd CLI", () => {
  it("prints command help without loading the extraction pipeline", async () => {
    const result = await execFileAsync(
      process.execPath,
      [...cliArgs, "download", "--help"],
      {
        cwd: process.cwd(),
      },
    );

    expect(result.stdout).toContain("Usage: pluckmd download");
    expect(result.stdout).toContain("--limit <n>");
  });

  it("rejects invalid numeric options before running a command", async () => {
    await expect(
      execFileAsync(
        process.execPath,
        [...cliArgs, "download", "--limit", "0", "https://example.com"],
        {
          cwd: process.cwd(),
        },
      ),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("must be a positive integer"),
    });
  });

  it("shows --current-page in download help", async () => {
    const result = await execFileAsync(
      process.execPath,
      [...cliArgs, "download", "--help"],
      {
        cwd: process.cwd(),
      },
    );

    expect(result.stdout).toContain("--current-page");
  });

  it("warns when --limit is combined with --current-page", async () => {
    await expect(
      execFileAsync(
        process.execPath,
        [...cliArgs, "download", "--current-page", "--limit", "5"],
        {
          cwd: process.cwd(),
        },
      ),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining(
        "warning: --limit has no effect with --current-page",
      ),
    });
  });

  it("errors when --current-page is used without a URL or --active-tab", async () => {
    await expect(
      execFileAsync(
        process.execPath,
        [...cliArgs, "download", "--current-page"],
        {
          cwd: process.cwd(),
        },
      ),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("URL is required"),
    });
  });
});

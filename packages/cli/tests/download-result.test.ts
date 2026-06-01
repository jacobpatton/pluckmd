import { describe, expect, it } from "vitest";
import type { ArticleRef } from "@pluckmd/shared";
import { summarizeDownload, type ArticleDownloadOutcome } from "../src/commands/download-result.js";

function article(url: string): ArticleRef {
  return { url };
}

describe("summarizeDownload", () => {
  it("counts successful and failed outcomes without mutating inputs", () => {
    const outcomes: ArticleDownloadOutcome[] = [
      { status: "saved", articleRef: article("https://example.com/a") },
      { status: "failed", articleRef: article("https://example.com/b"), error: "timeout" },
      { status: "saved", articleRef: article("https://example.com/c") },
    ];

    expect(summarizeDownload(outcomes)).toEqual({
      succeeded: 2,
      failed: 1,
      errors: [
        { url: "https://example.com/b", error: "timeout" },
      ],
    });
    expect(outcomes).toHaveLength(3);
  });

  it("returns an empty result when there are no articles", () => {
    expect(summarizeDownload([])).toEqual({
      succeeded: 0,
      failed: 0,
      errors: [],
    });
  });
});

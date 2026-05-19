import type { ArticleRef } from "@harvest/shared";

export interface DownloadFailure {
  url: string;
  error: string;
}

export interface DownloadResult {
  succeeded: number;
  failed: number;
  errors: DownloadFailure[];
}

export type ArticleDownloadOutcome =
  | { readonly status: "saved"; readonly articleRef: ArticleRef }
  | { readonly status: "failed"; readonly articleRef: ArticleRef; readonly error: string };

export function summarizeDownload(outcomes: readonly ArticleDownloadOutcome[]): DownloadResult {
  const errors = outcomes
    .filter(isFailedOutcome)
    .map((outcome) => ({ url: outcome.articleRef.url, error: outcome.error }));

  return {
    succeeded: outcomes.length - errors.length,
    failed: errors.length,
    errors,
  };
}

function isFailedOutcome(
  outcome: ArticleDownloadOutcome,
): outcome is Extract<ArticleDownloadOutcome, { status: "failed" }> {
  return outcome.status === "failed";
}

import type { ListingHeuristicCandidates, PageAnalysisInput } from "@harvest/shared";
import { getConfigDir } from "@harvest/shared";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { buildLlmUserPrompt, SYSTEM_PROMPT } from "./llm/prompt.js";
import { buildStructuralDomSnapshot } from "./llm/snapshot.js";

export interface AgentRequestOptions {
  outputPath?: string;
  missingConfig?: readonly string[];
  explanation?: readonly string[];
}

export interface AgentRequestResult {
  path: string;
}

export async function writeAgentRequest(
  input: PageAnalysisInput,
  candidates: ListingHeuristicCandidates,
  options: AgentRequestOptions = {},
): Promise<AgentRequestResult> {
  const snapshot = buildStructuralDomSnapshot(input.html, input.finalUrl);
  const path = options.outputPath ?? defaultAgentRequestPath(input.finalUrl);
  const specOutputPath = path.replace(/\.json$/i, ".adapter-spec.json");

  const request = {
    task: "Produce one AdapterSpec JSON object for harvest. Do not include markdown or prose in the adapter spec file.",
    url: input.finalUrl,
    render: {
      source: input.source,
      mode: input.renderMode,
      status: input.status,
    },
    missingLlmConfig: options.missingConfig ?? [],
    suggestedSpecOutputPath: specOutputPath,
    applyCommand: `harvest inspect ${input.finalUrl} --adapter-spec ${specOutputPath}`,
    adapterSpecSchema: {
      id: "optional string",
      listing: {
        articleLinkSelector: "CSS selector for article links",
        articleLinkHrefPattern: "regex source matching normalized article URLs",
        containerSelector: "optional CSS selector",
        excludeSelectors: "optional string[]",
      },
      article: {
        method: "readability or selector",
        contentSelector: "required only when method is selector",
        metadataSelectors: "optional title/author/publishedAt/tags selectors",
      },
      pagination: {
        method: "none, scroll, button-click, next-url, or auto",
        selector: "optional selector",
        textPatterns: "optional string[]",
        urlTemplate: "optional URL template",
      },
      waitStrategy: {
        afterNavigation: "networkidle, load, or domcontentloaded",
        afterLoadMoreMs: "integer milliseconds",
        maxWaitMs: "integer milliseconds",
      },
      evidence: "short explanation string",
    },
    systemPrompt: SYSTEM_PROMPT,
    userPrompt: buildLlmUserPrompt(input, snapshot, candidates),
    candidates,
    structuralDomSnapshot: snapshot,
    resolverExplanation: options.explanation ?? [],
  };

  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(request, null, 2)}\n`, "utf-8");
  return { path };
}

function defaultAgentRequestPath(url: string): string {
  const parsed = new URL(url);
  const key = [parsed.hostname.replace(/^www\./, ""), ...parsed.pathname.split("/").filter(Boolean)]
    .join("__")
    .replace(/[^a-zA-Z0-9._-]/g, "_") || "request";
  return join(getConfigDir(), "agent-requests", `${key}.json`);
}

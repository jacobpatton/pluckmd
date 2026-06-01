import type {
  AdapterSpec,
  AdapterValidationResult,
  CachedAdapter,
  PageAnalysisInput,
} from "@pluckmd/shared";
import { getConfigDir } from "@pluckmd/shared";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { validateAdapterSpec } from "./adapter-validator.js";
import { adapterSpecSchema } from "./llm/schema.js";

const DEFAULT_ADAPTERS_DIR = "adapters";
const DEFAULT_STALE_AFTER_DAYS = 30;
const DEFAULT_STALE_ZERO_RESULTS = 3;

export interface AdapterCacheOptions {
  directory?: string;
  staleAfterDays?: number;
  staleZeroResults?: number;
  now?: () => Date;
}

export interface CacheLoadResult {
  cached: CachedAdapter | null;
  reason: "hit" | "miss" | "invalid" | "corrupt" | "stale" | "validation-failed";
  validation?: AdapterValidationResult;
  message?: string;
}

const cachedAdapterSchema = z.object({
  cacheKey: z.string().min(1),
  urlPattern: z.string().min(1),
  spec: adapterSpecSchema,
  generatedAt: z.string().datetime(),
  pluckmdVersion: z.string().min(1),
  sampleUrl: z.string().url(),
  hitCount: z.number().int().min(0),
  zeroResultCount: z.number().int().min(0),
  lastUsedAt: z.string().datetime(),
  validationStatus: z.enum(["verified", "stale"]),
});

export class AdapterCache {
  private readonly directory: string;
  private readonly staleAfterDays: number;
  private readonly staleZeroResults: number;
  private readonly now: () => Date;

  constructor(options: AdapterCacheOptions = {}) {
    this.directory = options.directory ?? join(getConfigDir(), DEFAULT_ADAPTERS_DIR);
    this.staleAfterDays = options.staleAfterDays ?? DEFAULT_STALE_AFTER_DAYS;
    this.staleZeroResults = options.staleZeroResults ?? DEFAULT_STALE_ZERO_RESULTS;
    this.now = options.now ?? (() => new Date());
  }

  async load(
    url: string,
    input: PageAnalysisInput,
    refreshAdapter = false,
  ): Promise<CacheLoadResult> {
    if (refreshAdapter) return { cached: null, reason: "miss", message: "cache bypassed" };

    const cacheKey = normalizeCacheKey(url);
    const path = this.pathForKey(cacheKey);
    if (!existsSync(path)) return { cached: null, reason: "miss" };

    let raw: string;
    try {
      raw = await readFile(path, "utf-8");
    } catch (error) {
      return { cached: null, reason: "invalid", message: (error as Error).message };
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(raw);
    } catch (error) {
      return { cached: null, reason: "corrupt", message: (error as Error).message };
    }

    const parsed = cachedAdapterSchema.safeParse(parsedJson);
    if (!parsed.success) {
      return {
        cached: null,
        reason: "invalid",
        message: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; "),
      };
    }

    const cached = parsed.data as CachedAdapter;
    if (this.isStale(cached)) {
      return { cached: null, reason: "stale", message: `cache entry ${cacheKey} is stale` };
    }

    const validation = await validateAdapterSpec(cached.spec, input);
    if (!validation.valid) {
      await this.recordZeroResult(url);
      return {
        cached: null,
        reason: "validation-failed",
        validation,
        message: validation.issues.map((issue) => `${issue.code}: ${issue.message}`).join("; "),
      };
    }

    const updated: CachedAdapter = {
      ...cached,
      hitCount: cached.hitCount + 1,
      lastUsedAt: this.now().toISOString(),
      zeroResultCount: 0,
    };
    await this.write(updated);
    return { cached: updated, reason: "hit", validation };
  }

  async saveValidated(
    url: string,
    spec: AdapterSpec,
    validation: AdapterValidationResult,
    pluckmdVersion: string,
  ): Promise<CachedAdapter> {
    if (!validation.valid) {
      throw new Error("Refusing to cache an unvalidated AdapterSpec");
    }

    const cacheKey = normalizeCacheKey(url);
    const cached: CachedAdapter = {
      cacheKey,
      urlPattern: spec.listing.articleLinkHrefPattern,
      spec,
      generatedAt: this.now().toISOString(),
      pluckmdVersion,
      sampleUrl: url,
      hitCount: 0,
      zeroResultCount: 0,
      lastUsedAt: this.now().toISOString(),
      validationStatus: "verified",
    };

    await this.write(cached);
    return cached;
  }

  async recordZeroResult(url: string): Promise<void> {
    const cacheKey = normalizeCacheKey(url);
    const path = this.pathForKey(cacheKey);
    if (!existsSync(path)) return;

    try {
      const parsed = cachedAdapterSchema.safeParse(JSON.parse(await readFile(path, "utf-8")));
      if (!parsed.success) return;
      const cached = parsed.data as CachedAdapter;
      const zeroResultCount = cached.zeroResultCount + 1;
      await this.write({
        ...cached,
        zeroResultCount,
        validationStatus: zeroResultCount >= this.staleZeroResults ? "stale" : cached.validationStatus,
      });
    } catch {
      // Corrupt cache files are ignored by load; no extra action needed here.
    }
  }

  pathForUrl(url: string): string {
    return this.pathForKey(normalizeCacheKey(url));
  }

  private async write(cached: CachedAdapter): Promise<void> {
    await mkdir(this.directory, { recursive: true });
    await writeFile(
      this.pathForKey(cached.cacheKey),
      `${JSON.stringify(cached, null, 2)}\n`,
      "utf-8",
    );
  }

  private pathForKey(cacheKey: string): string {
    return join(this.directory, `${cacheKey.replace(/[^a-zA-Z0-9._-]/g, "_")}.json`);
  }

  private isStale(cached: CachedAdapter): boolean {
    if (cached.validationStatus === "stale") return true;
    if (cached.zeroResultCount >= this.staleZeroResults) return true;

    const generatedAt = new Date(cached.generatedAt).getTime();
    if (!Number.isFinite(generatedAt)) return true;
    const ageMs = this.now().getTime() - generatedAt;
    return ageMs > this.staleAfterDays * 24 * 60 * 60 * 1000;
  }
}

export function normalizeCacheKey(url: string): string {
  const parsed = new URL(url);
  const hostname = parsed.hostname.replace(/^www\./, "");
  const segments = parsed.pathname.split("/").filter(Boolean);
  const normalized = segments.map((segment, index) => normalizePathSegment(segment, index, segments.length));
  return [hostname, ...normalized].join("__");
}

function normalizePathSegment(segment: string, index: number, total: number): string {
  if (/^\d+$/.test(segment)) return "_";
  if (/^[a-f0-9]{8,}$/i.test(segment)) return "_";
  if (/^[a-f0-9-]{20,}$/i.test(segment)) return "_";
  if (index === total - 1 && segment.length > 16) return "_";
  if (total === 1 && !["archive", "blog", "posts", "articles", "tags", "categories"].includes(segment)) {
    return "user";
  }
  return segment;
}

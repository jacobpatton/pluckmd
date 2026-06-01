import type { AdapterSpec } from "@pluckmd/shared";
import { z } from "zod";

export const adapterSpecSchema = z.object({
  id: z.string().optional(),
  listing: z.object({
    articleLinkSelector: z.string().min(1),
    articleLinkHrefPattern: z.string().min(1),
    containerSelector: z.string().min(1).optional(),
    excludeSelectors: z.array(z.string().min(1)).optional(),
  }),
  article: z.object({
    method: z.enum(["readability", "selector"]),
    contentSelector: z.string().min(1).optional(),
    metadataSelectors: z.object({
      title: z.string().min(1).optional(),
      author: z.string().min(1).optional(),
      publishedAt: z.string().min(1).optional(),
      tags: z.string().min(1).optional(),
    }).optional(),
  }).superRefine((article, ctx) => {
    if (article.method === "selector" && !article.contentSelector) {
      ctx.addIssue({
        code: "custom",
        path: ["contentSelector"],
        message: "contentSelector is required when article.method is selector",
      });
    }
  }),
  pagination: z.object({
    method: z.enum(["none", "scroll", "button-click", "next-url", "auto"]),
    selector: z.string().min(1).optional(),
    textPatterns: z.array(z.string().min(1)).optional(),
    urlTemplate: z.string().min(1).optional(),
  }).superRefine((pagination, ctx) => {
    if (pagination.method === "button-click" && !pagination.selector && !pagination.textPatterns?.length) {
      ctx.addIssue({
        code: "custom",
        path: ["selector"],
        message: "button-click pagination requires selector or textPatterns",
      });
    }
    if (pagination.method === "next-url" && !pagination.selector && !pagination.urlTemplate) {
      ctx.addIssue({
        code: "custom",
        path: ["selector"],
        message: "next-url pagination requires selector or urlTemplate",
      });
    }
  }),
  waitStrategy: z.object({
    afterNavigation: z.enum(["networkidle", "load", "domcontentloaded"]),
    afterLoadMoreMs: z.number().int().min(0).max(30000),
    maxWaitMs: z.number().int().min(1000).max(180000),
  }).optional(),
  evidence: z.string().min(1),
});

export function parseAdapterSpec(raw: unknown): { spec: AdapterSpec | null; error: string | null } {
  const result = adapterSpecSchema.safeParse(raw);
  if (result.success) {
    return { spec: result.data as AdapterSpec, error: null };
  }

  return {
    spec: null,
    error: result.error.issues
      .map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`)
      .join("; "),
  };
}

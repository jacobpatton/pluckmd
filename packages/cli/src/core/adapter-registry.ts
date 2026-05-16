import type { SiteAdapter } from "@harvest/shared";
import { NoteAdapter } from "../adapters/note/index.js";

const registeredAdapters: SiteAdapter[] = [new NoteAdapter()];

export function resolveAdapter(urlString: string): SiteAdapter {
  const url = new URL(urlString);

  for (const adapter of registeredAdapters) {
    if (adapter.canHandle(url)) {
      return adapter;
    }
  }

  const supportedSites = registeredAdapters.map((adapter) => adapter.id).join(", ");
  throw new Error(
    `No adapter found for ${url.hostname}. Supported sites: ${supportedSites}`,
  );
}

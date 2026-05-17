export interface FetchedPage {
  html: string;
  finalUrl: string;
  status: number;
}

export interface FetchOptions {
  timeoutMs?: number;
  waitUntil?: "load" | "networkidle";
}

export interface ScrollOptions {
  linkSelector: string;
  loadMoreSelector?: string;
  scrollDelayMs?: number;
  maxStaleAttempts?: number;
  maxElapsedMs?: number;
}

export interface Fetcher {
  fetch(url: string, options?: FetchOptions): Promise<FetchedPage>;
  fetchWithScroll?(url: string, scrollOptions: ScrollOptions, fetchOptions?: FetchOptions): Promise<FetchedPage>;
  close(): Promise<void>;
}

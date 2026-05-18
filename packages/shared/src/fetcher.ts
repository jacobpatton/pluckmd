export interface FetchedPage {
  html: string;
  finalUrl: string;
  status: number;
}

export interface FetchOptions {
  timeoutMs?: number;
  waitUntil?: "load" | "networkidle";
}

export interface Fetcher {
  fetch(url: string, options?: FetchOptions): Promise<FetchedPage>;
  close(): Promise<void>;
}

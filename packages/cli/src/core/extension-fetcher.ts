import type { Fetcher, FetchedPage, FetchOptions } from "@harvest/shared";
import type {
  FetchRequest,
  PingRequest,
  ProtocolResponse,
} from "@harvest/shared";
import { PROTOCOL_VERSION, getPort, getTokenPath } from "@harvest/shared";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import WebSocket from "ws";

const CONNECTION_TIMEOUT_MS = 5_000;
const REQUEST_TIMEOUT_MS = 60_000;
const DEFAULT_FETCH_TIMEOUT_MS = 30_000;

interface PendingRequest {
  resolve: (response: ProtocolResponse) => void;
  reject: (error: Error) => void;
}

export class ExtensionFetcher implements Fetcher {
  private ws: WebSocket | null = null;
  private pendingRequests = new Map<string, PendingRequest>();

  async connect(): Promise<void> {
    const port = getPort();
    const token = await this.readToken();

    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(
        `ws://127.0.0.1:${port}?token=${encodeURIComponent(token)}`,
      );

      this.ws.on("open", async () => {
        try {
          await this.ping();
          resolve();
        } catch (error) {
          reject(error);
        }
      });

      this.ws.on("message", (data: WebSocket.RawData) => {
        this.handleMessage(data);
      });

      this.ws.on("error", (error: Error) => {
        reject(new Error(`Extension connection failed: ${error.message}`));
      });

      this.ws.on("close", () => {
        this.rejectAllPending(new Error("Extension disconnected"));
      });

      setTimeout(
        () => reject(new Error("Extension connection timeout")),
        CONNECTION_TIMEOUT_MS,
      );
    });
  }

  private async readToken(): Promise<string> {
    try {
      return (await readFile(getTokenPath(), "utf-8")).trim();
    } catch {
      throw new Error(
        "Extension token not found. Is the harvest Chrome Extension installed?",
      );
    }
  }

  private handleMessage(data: WebSocket.RawData): void {
    const response = JSON.parse(data.toString()) as ProtocolResponse;
    const pending = this.pendingRequests.get(response.id);
    if (pending) {
      this.pendingRequests.delete(response.id);
      pending.resolve(response);
    }
  }

  private rejectAllPending(error: Error): void {
    for (const pending of this.pendingRequests.values()) {
      pending.reject(error);
    }
    this.pendingRequests.clear();
  }

  private send(request: FetchRequest | PingRequest): Promise<ProtocolResponse> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error("Not connected to Extension"));
        return;
      }

      this.pendingRequests.set(request.id, { resolve, reject });
      this.ws.send(JSON.stringify(request));

      setTimeout(() => {
        if (this.pendingRequests.has(request.id)) {
          this.pendingRequests.delete(request.id);
          reject(new Error(`Request ${request.id} timed out`));
        }
      }, REQUEST_TIMEOUT_MS);
    });
  }

  private async ping(): Promise<void> {
    const request: PingRequest = {
      id: randomUUID(),
      type: "ping",
      version: PROTOCOL_VERSION,
    };
    const response = await this.send(request);
    if (!response.ok) throw new Error("Extension ping failed");
  }

  async fetch(url: string, options?: FetchOptions): Promise<FetchedPage> {
    if (!this.ws) await this.connect();

    const request: FetchRequest = {
      id: randomUUID(),
      type: "fetch",
      version: PROTOCOL_VERSION,
      url,
      options: { timeoutMs: options?.timeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS },
    };

    const response = await this.send(request);

    if (!response.ok) {
      throw new Error(`Fetch failed: ${response.error.message}`);
    }

    if ("html" in response) {
      return { html: response.html, finalUrl: response.finalUrl, status: response.status };
    }
    throw new Error("Unexpected response from Extension");
  }

  async close(): Promise<void> {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

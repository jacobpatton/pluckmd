import type {
  ActiveTabRequest,
  DomEvalRequest,
  DomEvaluationResult,
  DomEvaluator,
  Fetcher,
  FetchedPage,
  FetchOptions,
  FetchRequest,
  PageAnalysisInput,
  PingRequest,
  ProtocolRequest,
  ProtocolResponse,
} from "@harvest/shared";
import { PROTOCOL_VERSION, getPort, getTokenPath } from "@harvest/shared";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { createServer, type Server as HttpServer } from "node:http";
import { WebSocket, WebSocketServer, type RawData } from "ws";

const CONNECTION_TIMEOUT_MS = 120_000;
const REQUEST_TIMEOUT_MS = 60_000;
const DEFAULT_FETCH_TIMEOUT_MS = 30_000;

interface PendingRequest {
  resolve: (response: ProtocolResponse) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

export interface ExtensionFetcherOptions {
  connectionTimeoutMs?: number;
  requestTimeoutMs?: number;
}

export class ExtensionFetcher implements Fetcher {
  private server: WebSocketServer | null = null;
  private httpServer: HttpServer | null = null;
  private ws: WebSocket | null = null;
  private pendingRequests = new Map<string, PendingRequest>();
  private connectionWaiters = new Set<() => void>();
  private readonly connectionTimeoutMs: number;
  private readonly requestTimeoutMs: number;

  constructor(options: ExtensionFetcherOptions = {}) {
    this.connectionTimeoutMs = options.connectionTimeoutMs ?? CONNECTION_TIMEOUT_MS;
    this.requestTimeoutMs = options.requestTimeoutMs ?? REQUEST_TIMEOUT_MS;
  }

  async connect(): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN) return;

    const port = getPort();
    const token = await readOrCreateToken();

    await this.startServer(port, token);
    console.log(`🔌 Waiting for harvest extension on ws://127.0.0.1:${port}`);
    console.log("   If the extension is installed and enabled, it should connect automatically.");

    try {
      await this.waitForExtension();
      await this.ping();
    } catch (error) {
      throw new Error(
        `${(error as Error).message}\n` +
        "The relay was running, but the extension did not connect in time.\n" +
          "Reload the unpacked harvest extension in chrome://extensions, then run the command again.\n" +
          `Fallback token for manual popup connection: ${token}\n` +
          `Token file: ${getTokenPath()}`,
      );
    }
  }

  private async startServer(port: number, token: string): Promise<void> {
    if (this.server || this.httpServer) return;

    await new Promise<void>((resolve, reject) => {
      const httpServer = createServer((request, response) => {
        if (request.url === "/health") {
          response.writeHead(200, {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
          });
          response.end(JSON.stringify({ ok: true, service: "harvest-extension-relay" }));
          return;
        }

        response.writeHead(404, { "Content-Type": "text/plain" });
        response.end("not found");
      });
      const server = new WebSocketServer({ noServer: true });
      this.httpServer = httpServer;
      this.server = server;

      httpServer.once("listening", () => resolve());
      httpServer.once("error", (error: Error) => {
        reject(
          new Error(
            `Extension relay failed to listen on 127.0.0.1:${port}: ${error.message}`,
          ),
        );
      });

      httpServer.on("upgrade", (request, socket, head) => {
        const requestUrl = new URL(request.url ?? "/", `ws://${request.headers.host ?? "127.0.0.1"}`);
        const origin = request.headers.origin || "";
        const hasValidToken = requestUrl.searchParams.get("token") === token;
        const hasExtensionOrigin = origin.startsWith("chrome-extension://");
        if (!hasValidToken && !hasExtensionOrigin) {
          socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
          socket.destroy();
          return;
        }

        server.handleUpgrade(request, socket, head, (ws) => {
          server.emit("connection", ws, request);
        });
      });

      server.on("connection", (ws) => {
        this.ws?.close();
        this.ws = ws;
        ws.on("message", (data) => this.handleMessage(data));
        ws.on("close", () => {
          if (this.ws === ws) this.ws = null;
          this.rejectAllPending(new Error("Extension disconnected"));
        });
        this.resolveConnectionWaiters();
      });

      httpServer.listen(port, "127.0.0.1");
    });
  }

  private waitForExtension(): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN) return Promise.resolve();

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error("Extension connection timeout"));
      }, this.connectionTimeoutMs);

      const onConnected = () => {
        cleanup();
        resolve();
      };

      const cleanup = () => {
        clearTimeout(timeout);
        this.connectionWaiters.delete(onConnected);
      };

      this.connectionWaiters.add(onConnected);
    });
  }

  private resolveConnectionWaiters(): void {
    for (const waiter of this.connectionWaiters) {
      waiter();
    }
    this.connectionWaiters.clear();
  }

  private handleMessage(data: RawData): void {
    let response: ProtocolResponse;
    try {
      response = JSON.parse(data.toString()) as ProtocolResponse;
    } catch {
      return;
    }

    const pending = this.pendingRequests.get(response.id);
    if (!pending) return;

    clearTimeout(pending.timer);
    this.pendingRequests.delete(response.id);
    pending.resolve(response);
  }

  private rejectAllPending(error: Error): void {
    for (const pending of this.pendingRequests.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pendingRequests.clear();
  }

  private send(request: ProtocolRequest): Promise<ProtocolResponse> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error("Extension is not connected"));
        return;
      }

      const timer = setTimeout(() => {
        if (this.pendingRequests.has(request.id)) {
          this.pendingRequests.delete(request.id);
          reject(new Error(`Extension request ${request.id} timed out`));
        }
      }, this.requestTimeoutMs);

      this.pendingRequests.set(request.id, { resolve, reject, timer });
      this.ws.send(JSON.stringify(request));
    });
  }

  private async ping(): Promise<void> {
    const request: PingRequest = {
      id: randomUUID(),
      type: "ping",
      version: PROTOCOL_VERSION,
    };
    const response = await this.send(request);
    if (!response.ok || !("pong" in response)) {
      throw new Error("Extension ping failed");
    }
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
    if (!response.ok) throw new Error(`Extension fetch failed: ${response.error.message}`);
    if (!("html" in response)) throw new Error("Unexpected extension fetch response");

    return { html: response.html, finalUrl: response.finalUrl, status: response.status };
  }

  async fetchActiveTab(): Promise<FetchedPage> {
    if (!this.ws) await this.connect();

    const request: ActiveTabRequest = {
      id: randomUUID(),
      type: "active-tab",
      version: PROTOCOL_VERSION,
    };

    const response = await this.send(request);
    if (!response.ok) throw new Error(`Active tab fetch failed: ${response.error.message}`);
    if (!("html" in response)) throw new Error("Unexpected active tab response");

    return { html: response.html, finalUrl: response.finalUrl, status: response.status };
  }

  async acquireActiveTab(): Promise<PageAnalysisInput> {
    await this.connect();
    const page = await this.fetchActiveTab();
    return {
      requestedUrl: page.finalUrl,
      finalUrl: page.finalUrl,
      status: page.status,
      html: page.html,
      source: "rendered",
      renderMode: "always",
      evaluator: new ExtensionDomEvaluator((request) => this.send(request)),
    };
  }

  async close(): Promise<void> {
    this.rejectAllPending(new Error("Extension fetcher closed"));
    this.ws?.close();
    this.ws = null;
    await new Promise<void>((resolve, reject) => {
      if (!this.server && !this.httpServer) {
        resolve();
        return;
      }
      this.server?.close();
      this.server = null;
      this.httpServer?.close((error) => (error ? reject(error) : resolve()));
      this.httpServer = null;
    });
  }
}

class ExtensionDomEvaluator implements DomEvaluator {
  constructor(private readonly sendRequest: (request: DomEvalRequest) => Promise<ProtocolResponse>) {}

  async count(selector: string): Promise<DomEvaluationResult<number>> {
    return { value: await this.eval<number>({ operation: "count", selector }) };
  }

  async text(selector: string): Promise<DomEvaluationResult<string[]>> {
    return { value: await this.eval<string[]>({ operation: "text", selector }) };
  }

  async hrefs(selector: string): Promise<DomEvaluationResult<string[]>> {
    return { value: await this.eval<string[]>({ operation: "hrefs", selector }) };
  }

  async click(selector: string): Promise<DomEvaluationResult<boolean>> {
    return { value: await this.eval<boolean>({ operation: "click", selector }) };
  }

  async clickByText(patterns: readonly string[]): Promise<DomEvaluationResult<boolean>> {
    return { value: await this.eval<boolean>({ operation: "clickByText", patterns }) };
  }

  async clickPaginationCandidate(articleLinkSelector: string): Promise<DomEvaluationResult<boolean>> {
    return { value: await this.eval<boolean>({ operation: "clickPaginationCandidate", articleLinkSelector }) };
  }

  async scrollToBottom(): Promise<DomEvaluationResult<boolean>> {
    return { value: await this.eval<boolean>({ operation: "scrollToBottom" }) };
  }

  async content(): Promise<DomEvaluationResult<string>> {
    return { value: await this.eval<string>({ operation: "content" }) };
  }

  async currentUrl(): Promise<DomEvaluationResult<string>> {
    return { value: await this.eval<string>({ operation: "currentUrl" }) };
  }

  async wait(milliseconds: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, milliseconds));
  }

  private async eval<T>(partial: Omit<DomEvalRequest, "id" | "type" | "version">): Promise<T> {
    const response = await this.sendRequest({
      id: randomUUID(),
      type: "dom-eval",
      version: PROTOCOL_VERSION,
      ...partial,
    });
    if (!response.ok) throw new Error(response.error.message);
    if (!("value" in response)) throw new Error("Unexpected extension DOM response");
    return response.value as T;
  }
}

async function readOrCreateToken(): Promise<string> {
  const tokenPath = getTokenPath();
  try {
    const token = (await readFile(tokenPath, "utf-8")).trim();
    if (token) return token;
  } catch {
    // Create below.
  }

  const token = randomBytes(24).toString("hex");
  await mkdir(dirname(tokenPath), { recursive: true });
  await writeFile(tokenPath, `${token}\n`, { mode: 0o600 });
  return token;
}

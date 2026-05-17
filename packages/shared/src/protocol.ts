export const PROTOCOL_VERSION = 1;
export const DEFAULT_PORT = 7432;
export const CONFIG_DIR = ".harvest";
export const TOKEN_FILE = "extension-token";
export const PROFILE_DIR = "chrome-profile";

export interface FetchRequest {
  id: string;
  type: "fetch";
  version: typeof PROTOCOL_VERSION;
  url: string;
  options?: {
    timeoutMs?: number;
  };
}

export interface ActiveTabRequest {
  id: string;
  type: "active-tab";
  version: typeof PROTOCOL_VERSION;
}

export interface PingRequest {
  id: string;
  type: "ping";
  version: typeof PROTOCOL_VERSION;
}

export interface DomEvalRequest {
  id: string;
  type: "dom-eval";
  version: typeof PROTOCOL_VERSION;
  operation:
    | "count"
    | "text"
    | "hrefs"
    | "click"
    | "clickByText"
    | "clickPaginationCandidate"
    | "scrollToBottom"
    | "content"
    | "currentUrl";
  selector?: string;
  patterns?: readonly string[];
  articleLinkSelector?: string;
}

export type ProtocolRequest = FetchRequest | ActiveTabRequest | PingRequest | DomEvalRequest;

export interface FetchResponse {
  id: string;
  ok: true;
  status: number;
  finalUrl: string;
  html: string;
}

export interface ActiveTabResponse {
  id: string;
  ok: true;
  status: number;
  finalUrl: string;
  html: string;
}

export interface PongResponse {
  id: string;
  ok: true;
  pong: true;
}

export interface DomEvalResponse {
  id: string;
  ok: true;
  value: unknown;
}

export interface ErrorResponse {
  id: string;
  ok: false;
  error: {
    code: string;
    message: string;
  };
}

export type ProtocolResponse =
  | FetchResponse
  | ActiveTabResponse
  | PongResponse
  | DomEvalResponse
  | ErrorResponse;

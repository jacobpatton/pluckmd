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

export interface PingRequest {
  id: string;
  type: "ping";
  version: typeof PROTOCOL_VERSION;
}

export type ProtocolRequest = FetchRequest | PingRequest;

export interface FetchResponse {
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

export interface ErrorResponse {
  id: string;
  ok: false;
  error: {
    code: string;
    message: string;
  };
}

export type ProtocolResponse = FetchResponse | PongResponse | ErrorResponse;

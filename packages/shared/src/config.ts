import { homedir } from "node:os";
import { join } from "node:path";
import { CONFIG_DIR, DEFAULT_PORT, PROFILE_DIR, TOKEN_FILE } from "./protocol.js";

export function getConfigDir(): string {
  return join(homedir(), CONFIG_DIR);
}

export function getProfileDir(): string {
  return join(getConfigDir(), PROFILE_DIR);
}

export function getTokenPath(): string {
  return join(getConfigDir(), TOKEN_FILE);
}

export function getPort(): number {
  return Number(process.env.HARVEST_PORT) || DEFAULT_PORT;
}

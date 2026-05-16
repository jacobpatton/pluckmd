/**
 * harvest Chrome Extension — WebSocket relay bridge.
 *
 * Thin proxy: receives fetch requests from the CLI via WebSocket,
 * fetches pages using the browser's cookies, returns HTML.
 *
 * Note: Manifest V3 service workers can't create WebSocket servers directly.
 * Instead, we use a native messaging host or offscreen document approach.
 * For simplicity in v0.1, we use an offscreen document with a WebSocket server
 * polyfilled via a content script relay pattern.
 *
 * Alternative approach for v0.1: The extension exposes fetch capability
 * via chrome.runtime.onMessageExternal, and a tiny local Node.js relay
 * bridges WebSocket ↔ chrome.runtime messaging.
 *
 * Simplest v0.1 approach: Use fetch() directly in the service worker
 * and communicate via native messaging.
 */

const PROTOCOL_VERSION = 1;
const CONFIG_DIR = ".harvest";

// Listen for connections from the CLI's native messaging host
chrome.runtime.onConnectExternal.addListener((port) => {
  port.onMessage.addListener(async (request) => {
    if (request.version !== PROTOCOL_VERSION) {
      port.postMessage({
        id: request.id,
        ok: false,
        error: { code: "VERSION_MISMATCH", message: `Expected v${PROTOCOL_VERSION}` },
      });
      return;
    }

    if (request.type === "ping") {
      port.postMessage({ id: request.id, ok: true, pong: true });
      return;
    }

    if (request.type === "fetch") {
      try {
        const response = await fetch(request.url, {
          credentials: "include",
          redirect: "follow",
        });

        const html = await response.text();

        port.postMessage({
          id: request.id,
          ok: true,
          status: response.status,
          finalUrl: response.url,
          html,
        });
      } catch (err) {
        port.postMessage({
          id: request.id,
          ok: false,
          error: {
            code: "FETCH_FAILED",
            message: err instanceof Error ? err.message : String(err),
          },
        });
      }
    }
  });
});

// Also support simple message-based communication
chrome.runtime.onMessageExternal.addListener(
  (request, _sender, sendResponse) => {
    if (request.type === "ping") {
      sendResponse({ ok: true, pong: true });
      return true;
    }

    if (request.type === "fetch") {
      fetch(request.url, { credentials: "include", redirect: "follow" })
        .then(async (response) => {
          const html = await response.text();
          sendResponse({
            id: request.id,
            ok: true,
            status: response.status,
            finalUrl: response.url,
            html,
          });
        })
        .catch((err) => {
          sendResponse({
            id: request.id,
            ok: false,
            error: {
              code: "FETCH_FAILED",
              message: err instanceof Error ? err.message : String(err),
            },
          });
        });
      return true; // async sendResponse
    }

    return false;
  },
);

console.log("harvest bridge extension loaded");

const PROTOCOL_VERSION = 1;
const DEFAULT_PORT = 7432;
const RETRY_ALARM = "pluckmd-retry-connect";
const RELAY_HEALTH_TIMEOUT_MS = 500;
const RECONNECT_DELAY_MS = 2000;
const PAGINATION_CLICK_SETTLE_MS = 900;
const MAX_PAGINATION_CANDIDATES = 5;

let socket = null;
let status = "disconnected";
let reconnectTimer = null;

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(RETRY_ALARM, { periodInMinutes: 1 });
  void connectFromStorage();
});

chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create(RETRY_ALARM, { periodInMinutes: 1 });
  void connectFromStorage();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === RETRY_ALARM) void connectFromStorage();
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  handleRuntimeMessage(message).then(sendResponse);
  return true;
});

async function handleRuntimeMessage(message) {
  if (message?.type === "status") return { ok: true, status };
  if (message?.type === "connect") {
    const port = Number(message.port || DEFAULT_PORT);
    await chrome.storage.local.set({ port });
    await connect(port);
    return { ok: true, status };
  }
  if (message?.type === "disconnect") {
    closeSocket();
    status = "disconnected";
    return { ok: true, status };
  }
  return { ok: false, error: "Unknown message" };
}

async function connectFromStorage() {
  const { port } = await chrome.storage.local.get(["port"]);
  await connect(Number(port || DEFAULT_PORT), { quiet: true });
}

async function connect(port, options = {}) {
  if (socket?.readyState === WebSocket.OPEN || socket?.readyState === WebSocket.CONNECTING) return;
  clearTimeout(reconnectTimer);
  status = "connecting";

  const relayReady = await isRelayReady(port);
  if (!relayReady) {
    status = options.quiet ? "disconnected" : "error";
    scheduleReconnect(port);
    return;
  }

  socket = new WebSocket(`ws://127.0.0.1:${port}/`);

  socket.addEventListener("open", () => {
    status = "connected";
  });

  socket.addEventListener("message", (event) => {
    handleProtocolMessage(event.data);
  });

  socket.addEventListener("close", () => {
    socket = null;
    status = "disconnected";
    scheduleReconnect(port);
  });

  socket.addEventListener("error", () => {
    status = options.quiet ? "disconnected" : "error";
  });
}

async function isRelayReady(port) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RELAY_HEALTH_TIMEOUT_MS);
  try {
    const response = await fetch(`http://127.0.0.1:${port}/health`, {
      cache: "no-store",
      signal: controller.signal,
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

function scheduleReconnect(port) {
  clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(() => {
    void connect(port, { quiet: true });
  }, RECONNECT_DELAY_MS);
}

function closeSocket() {
  clearTimeout(reconnectTimer);
  reconnectTimer = null;
  if (!socket) return;
  const current = socket;
  socket = null;
  current.close();
}

async function handleProtocolMessage(raw) {
  let request;
  try {
    request = JSON.parse(raw);
  } catch {
    return;
  }

  if (request.version !== PROTOCOL_VERSION) {
    sendResponse({
      id: request.id,
      ok: false,
      error: { code: "VERSION_MISMATCH", message: `Expected protocol v${PROTOCOL_VERSION}` },
    });
    return;
  }

  try {
    if (request.type === "ping") return sendResponse({ id: request.id, ok: true, pong: true });
    if (request.type === "fetch") return sendResponse(await fetchPage(request));
    if (request.type === "active-tab") return sendResponse(await fetchActiveTab(request));
    if (request.type === "dom-eval") return sendResponse(await evaluateActiveTabDom(request));
    sendResponse({
      id: request.id,
      ok: false,
      error: { code: "UNKNOWN_REQUEST", message: `Unknown request type: ${request.type}` },
    });
  } catch (error) {
    sendResponse({
      id: request.id,
      ok: false,
      error: {
        code: "REQUEST_FAILED",
        message: error instanceof Error ? error.message : String(error),
      },
    });
  }
}

async function fetchPage(request) {
  const timeoutMs = Number(request.options?.timeoutMs || 30000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(request.url, {
      credentials: "include",
      redirect: "follow",
      signal: controller.signal,
    });
    return {
      id: request.id,
      ok: true,
      status: response.status,
      finalUrl: response.url,
      html: await response.text(),
    };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchActiveTab(request) {
  const value = await runInActiveTab(() => ({
    html: document.documentElement.outerHTML,
    finalUrl: window.location.href,
    status: 200,
  }));
  return { id: request.id, ok: true, ...value };
}

async function evaluateActiveTabDom(request) {
  const value = await runInActiveTab(evaluateDomOperation, {
    operation: request.operation,
    selector: request.selector,
    url: request.url,
    patterns: request.patterns,
    articleLinkSelector: request.articleLinkSelector,
    settleMs: PAGINATION_CLICK_SETTLE_MS,
    maxCandidates: MAX_PAGINATION_CANDIDATES,
  });
  return { id: request.id, ok: true, value };
}

async function runInActiveTab(func, args) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error("No active tab is available");
  const [result] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func,
    args: args === undefined ? [] : [args],
  });
  if (result?.result === undefined) throw new Error("Active tab did not return a result");
  return result.result;
}

function sendResponse(response) {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(response));
  }
}

function evaluateDomOperation(request) {
  const selector = request.selector || "";
  switch (request.operation) {
    case "count":
      return document.querySelectorAll(selector).length;
    case "text":
      return Array.from(document.querySelectorAll(selector)).map((el) => el.textContent?.trim() || "").filter(Boolean);
    case "hrefs":
      return Array.from(document.querySelectorAll(selector)).map((el) => el.href || el.getAttribute("href")).filter(Boolean);
    case "click":
      return clickSelector(selector);
    case "clickByText":
      return clickByText(request.patterns || []);
    case "clickPaginationCandidate":
      return clickPaginationCandidate(request.articleLinkSelector || "a[href]");
    case "scrollToBottom":
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" });
      return true;
    case "navigate":
      if (!request.url) return false;
      window.location.href = request.url;
      return true;
    case "content":
      return document.documentElement.outerHTML;
    case "currentUrl":
      return window.location.href;
    default:
      throw new Error(`Unknown DOM operation: ${request.operation}`);
  }

  function clickSelector(targetSelector) {
    const element = document.querySelector(targetSelector);
    if (!(element instanceof HTMLElement)) return false;
    element.scrollIntoView({ block: "center", inline: "center" });
    element.click();
    return true;
  }

  function clickByText(patterns) {
    const elements = document.querySelectorAll("button, a, [role='button']");
    for (const element of elements) {
      if (!(element instanceof HTMLElement)) continue;
      const text = element.textContent?.trim() || "";
      const visible = Boolean(element.offsetWidth || element.offsetHeight || element.getClientRects().length);
      const disabled = element.hasAttribute("disabled") || element.getAttribute("aria-disabled") === "true";
      if (!visible || disabled || !patterns.some((pattern) => text.includes(pattern))) continue;
      element.scrollIntoView({ block: "center", inline: "center" });
      element.click();
      return true;
    }
    return false;
  }

  async function clickPaginationCandidate(articleLinkSelector) {
    const before = paginationSignature(articleLinkSelector);
    const candidates = paginationCandidates(articleLinkSelector);
    for (const candidate of candidates) {
      candidate.element.scrollIntoView({ block: "center", inline: "center" });
      candidate.element.click();
      await new Promise((resolve) => setTimeout(resolve, request.settleMs));
      const after = paginationSignature(articleLinkSelector);
      if (advancedPagination(before, after)) return true;
    }
    return false;
  }

  function paginationCandidates(articleLinkSelector) {
    const articleLinks = visibleElements(articleLinkSelector);
    const articleRects = articleLinks.map((element) => element.getBoundingClientRect());
    const lastArticleBottom = articleRects.reduce((max, rect) => Math.max(max, rect.bottom), 0);
    const articleLinkSet = new Set(articleLinks);

    return Array.from(document.querySelectorAll("button, a, [role='button'], input[type='button'], input[type='submit']"))
      .filter((element) => element instanceof HTMLElement)
      .filter((element) => !articleLinkSet.has(element))
      .filter((element) => isVisible(element))
      .filter((element) => !element.hasAttribute("disabled") && element.getAttribute("aria-disabled") !== "true")
      .filter((element) => !element.closest("nav, header, footer, aside"))
      .filter((element) => !element.closest(articleLinkSelector))
      .map((element) => {
        const rect = element.getBoundingClientRect();
        const area = rect.width * rect.height;
        const belowArticles = lastArticleBottom === 0 || rect.top >= lastArticleBottom - 120;
        const centered = 1 - Math.min(Math.abs((rect.left + rect.width / 2) - window.innerWidth / 2) / window.innerWidth, 1);
        const sizeScore = Math.min(area / 8000, 1);
        const distance = lastArticleBottom === 0 ? 0 : Math.abs(rect.top - lastArticleBottom);
        const proximity = 1 - Math.min(distance / Math.max(window.innerHeight, 1), 1);
        return { element, score: (belowArticles ? 4 : 0) + centered + sizeScore + proximity };
      })
      .filter((candidate) => candidate.score >= 3.5)
      .sort((a, b) => b.score - a.score)
      .slice(0, request.maxCandidates);
  }

  function paginationSignature(articleLinkSelector) {
    return {
      hrefs: visibleElements(articleLinkSelector)
        .map((element) => element instanceof HTMLAnchorElement ? element.href : element.getAttribute("href") || "")
        .filter(Boolean),
      height: document.documentElement.scrollHeight,
      url: window.location.href,
    };
  }

  function advancedPagination(before, after) {
    const beforeSet = new Set(before.hrefs);
    const newHrefCount = after.hrefs.filter((href) => !beforeSet.has(href)).length;
    return newHrefCount > 0 || after.hrefs.length > before.hrefs.length || after.height > before.height + 200 || after.url !== before.url;
  }

  function visibleElements(targetSelector) {
    try {
      return Array.from(document.querySelectorAll(targetSelector))
        .filter((element) => element instanceof HTMLElement)
        .filter(isVisible);
    } catch {
      return [];
    }
  }

  function isVisible(element) {
    return Boolean(element.offsetWidth || element.offsetHeight || element.getClientRects().length);
  }
}

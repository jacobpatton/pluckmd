const statusEl = document.querySelector("#status");
const messageEl = document.querySelector("#message");
const portInput = document.querySelector("#port");
const connectButton = document.querySelector("#connect");
const disconnectButton = document.querySelector("#disconnect");

window.addEventListener("error", (event) => {
  render({ ok: false, error: event.message || "Popup error" });
});

window.addEventListener("unhandledrejection", (event) => {
  render({ ok: false, error: String(event.reason?.message || event.reason || "Popup async error") });
});

void restore().catch((error) => {
  render({ ok: false, error: error instanceof Error ? error.message : String(error) });
});

connectButton.addEventListener("click", async () => {
  const port = Number(portInput.value || 7432);
  await chrome.storage.local.set({ port });
  render(await chrome.runtime.sendMessage({ type: "connect", port }));
});

disconnectButton.addEventListener("click", async () => {
  render(await chrome.runtime.sendMessage({ type: "disconnect" }));
});

async function restore() {
  const { port } = await chrome.storage.local.get(["port"]);
  portInput.value = String(port || 7432);
  render(await chrome.runtime.sendMessage({ type: "status" }));
}

function render(response) {
  if (response?.ok) {
    statusEl.textContent = response.status || "connecting";
    messageEl.textContent = "";
  } else {
    statusEl.textContent = "error";
    messageEl.textContent = response?.error || "Failed";
  }
}

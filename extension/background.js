const DEFAULT_API_BASE = "http://localhost:8000";

async function getConfig() {
  const data = await chrome.storage.local.get(["apiBase", "token", "user"]);
  return {
    apiBase: (data.apiBase || DEFAULT_API_BASE).replace(/\/+$/, ""),
    token: data.token || "",
    user: data.user || null,
  };
}

async function apiFetch(path, opts = {}) {
  const { apiBase, token } = await getConfig();
  const headers = new Headers(opts.headers || {});
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  if (opts.body && typeof opts.body === "string" && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const resp = await fetch(`${apiBase}/api/v1${path}`, {
    ...opts,
    headers,
  });
  if (!resp.ok) {
    let detail = `Erro HTTP ${resp.status}`;
    try {
      const json = await resp.json();
      detail = typeof json.detail === "string" ? json.detail : JSON.stringify(json.detail);
    } catch {
      /* ignore non-json error */
    }
    throw new Error(detail);
  }
  return resp.json();
}

async function fetchResumeBinary(resumeId) {
  const { apiBase, token } = await getConfig();
  if (!token || !resumeId) return null;
  const resp = await fetch(`${apiBase}/api/v1/resumes/${resumeId}/download`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!resp.ok) return null;
  const buf = await resp.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  const contentType = resp.headers.get("content-type") || "application/pdf";
  return { base64: btoa(binary), contentType };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    if (message.type === "API_REQUEST") {
      const data = await apiFetch(message.path, message.opts || {});
      sendResponse({ ok: true, data });
      return;
    }
    if (message.type === "DOWNLOAD_RESUME") {
      const file = await fetchResumeBinary(message.resumeId);
      sendResponse({ ok: true, file });
      return;
    }
    sendResponse({ ok: false, error: "Mensagem desconhecida" });
  })().catch((err) => {
    sendResponse({ ok: false, error: err?.message || "Erro inesperado" });
  });
  return true;
});

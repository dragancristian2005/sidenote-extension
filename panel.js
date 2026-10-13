const $ = (id) => document.getElementById(id);
const MAX_PAGE_CHARS = 200000;
const MAX_PDF_BYTES = 15 * 1024 * 1024; // inline request limit is ~20MB incl. base64 overhead

let history = []; // Gemini "contents" array
let busy = false;

// ---------- settings ----------
// Models are whatever IDs the user adds; there are no built-in defaults.
let models = [];
let selectedModel = "";

async function saveModels() {
  await chrome.storage.local.set({ models, model: selectedModel });
  renderModels();
}

function renderModels() {
  const sel = $("modelSelect");
  sel.textContent = "";
  if (!models.length) {
    sel.add(new Option("(add a model in settings)", ""));
  }
  for (const m of models) sel.add(new Option(m, m));
  sel.value = selectedModel;

  const list = $("modelList");
  list.textContent = "";
  for (const m of models) {
    const li = document.createElement("li");
    const span = document.createElement("span");
    span.textContent = m;
    const del = document.createElement("button");
    del.textContent = "Remove";
    del.onclick = () => {
      models = models.filter((x) => x !== m);
      if (selectedModel === m) selectedModel = models[0] || "";
      saveModels();
    };
    li.append(span, del);
    list.appendChild(li);
  }
}

async function loadSettings() {
  const s = await chrome.storage.local.get(["apiKey", "models", "model"]);
  models = s.models || [];
  selectedModel = models.includes(s.model) ? s.model : models[0] || "";
  $("apiKey").value = s.apiKey || "";
  renderModels();
  if (!s.apiKey || !models.length) $("settings").hidden = false;
}

$("settingsBtn").onclick = () => ($("settings").hidden = !$("settings").hidden);
$("saveSettings").onclick = async () => {
  await chrome.storage.local.set({ apiKey: $("apiKey").value.trim() });
};
$("addModel").onclick = () => {
  const id = $("modelInput").value.trim().replace(/^models\//, "");
  if (!id) return;
  if (!models.includes(id)) models.push(id);
  selectedModel = id;
  $("modelInput").value = "";
  saveModels();
};
$("modelInput").addEventListener("keydown", (e) => e.key === "Enter" && $("addModel").click());
$("modelSelect").onchange = () => {
  selectedModel = $("modelSelect").value;
  saveModels();
};

// ---------- tab helpers ----------
async function getTargetTab() {
  const win = await chrome.windows.getLastFocused({ windowTypes: ["normal"] });
  const [tab] = await chrome.tabs.query({ active: true, windowId: win.id });
  return tab;
}

function looksLikePdfUrl(url = "") {
  try {
    return new URL(url).pathname.toLowerCase().endsWith(".pdf");
  } catch {
    return false;
  }
}

async function refreshTabInfo() {
  const tab = await getTargetTab();
  if (!tab) return ($("tabInfo").textContent = "none");
  const pdf = looksLikePdfUrl(tab.url) ? " (PDF)" : "";
  $("tabInfo").textContent = (tab.title || tab.url || "untitled") + pdf;
  if (pdf) $("usePdf").checked = true;
}
$("refresh").onclick = refreshTabInfo;
chrome.tabs.onActivated.addListener(refreshTabInfo);
chrome.tabs.onUpdated.addListener((_id, info) => info.status === "complete" && refreshTabInfo());

// ---------- context gathering ----------
async function runInTab(tab, func, allFrames = false) {
  const res = await chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames }, func });
  return res.map((r) => r.result);
}

function readSelection() {
  const sel = String(window.getSelection() || "");
  if (sel) return sel;
  const el = document.activeElement;
  if (el && typeof el.selectionStart === "number" && el.selectionEnd > el.selectionStart) {
    return el.value.substring(el.selectionStart, el.selectionEnd);
  }
  return "";
}

function readPageText() {
  return document.body ? document.body.innerText : "";
}

function toBase64(buf) {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

// Returns { parts: [...Gemini parts], notes: [...human-readable notes] }
async function gatherContext() {
  const parts = [];
  const notes = [];
  const tab = await getTargetTab();
  if (!tab) throw new Error("No active browser tab found.");
  const header = `Browser tab: "${tab.title}" (${tab.url})`;
  parts.push({ text: header });

  if ($("useSelection").checked) {
    try {
      const sels = (await runInTab(tab, readSelection, true)).filter(Boolean);
      if (sels.length) {
        parts.push({ text: `Selected text:\n"""\n${sels.join("\n---\n")}\n"""` });
        notes.push("selection");
      } else {
        notes.push("no selection found");
      }
    } catch {
      notes.push("selection unavailable on this page");
    }
  }

  if ($("usePage").checked) {
    try {
      const [text] = await runInTab(tab, readPageText);
      if (text) {
        parts.push({ text: `Page text:\n"""\n${text.slice(0, MAX_PAGE_CHARS)}\n"""` });
        notes.push("page text");
      }
    } catch {
      notes.push("page text unavailable on this page");
    }
  }

  if ($("useShot").checked) {
    try {
      const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "jpeg", quality: 80 });
      parts.push({ inlineData: { mimeType: "image/jpeg", data: dataUrl.split(",")[1] } });
      notes.push("screenshot");
    } catch (e) {
      notes.push("screenshot failed: " + e.message);
    }
  }

  if ($("usePdf").checked) {
    if (!/^(https?|file):/.test(tab.url || "")) {
      notes.push("PDF skipped (tab is not a web/file URL)");
    } else {
      try {
        const resp = await fetch(tab.url);
        if (!resp.ok) throw new Error("HTTP " + resp.status);
        const buf = await resp.arrayBuffer();
        const magic = new TextDecoder().decode(buf.slice(0, 5));
        if (magic !== "%PDF-") {
          notes.push("PDF skipped (current tab is not a PDF)");
        } else if (buf.byteLength > MAX_PDF_BYTES) {
          notes.push(`PDF too large (${(buf.byteLength / 1048576).toFixed(1)} MB, limit 15 MB)`);
        } else {
          parts.push({ inlineData: { mimeType: "application/pdf", data: toBase64(buf) } });
          notes.push("PDF");
        }
      } catch (e) {
        const hint = tab.url.startsWith("file:") ? " (enable 'Allow access to file URLs' for this extension)" : "";
        notes.push("PDF failed: " + e.message + hint);
      }
    }
  }

  return { parts, notes };
}

// ---------- chat UI ----------
function addMsg(cls, text, meta) {
  const div = document.createElement("div");
  div.className = "msg " + cls;
  if (meta) {
    const m = document.createElement("div");
    m.className = "meta";
    m.textContent = meta;
    div.appendChild(m);
  }
  const body = document.createElement("div");
  body.textContent = text;
  div.appendChild(body);
  $("log").appendChild(div);
  $("log").scrollTop = $("log").scrollHeight;
  return body;
}

$("newChat").onclick = () => {
  history = [];
  $("log").textContent = "";
};

// ---------- Gemini call ----------
async function streamGemini(apiKey, model, contents, onText) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({ contents }),
  });
  if (!resp.ok) {
    let msg = "HTTP " + resp.status;
    try { msg = (await resp.json()).error?.message || msg; } catch {}
    throw new Error(msg);
  }
  const reader = resp.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let full = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop();
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const json = line.slice(5).trim();
      if (!json) continue;
      const chunk = JSON.parse(json);
      const text = (chunk.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("");
      if (text) {
        full += text;
        onText(full);
      }
      if (chunk.promptFeedback?.blockReason) throw new Error("Blocked: " + chunk.promptFeedback.blockReason);
    }
  }
  if (!full) throw new Error("Empty response from Gemini.");
  return full;
}

async function send() {
  if (busy) return;
  const question = $("input").value.trim();
  if (!question) return;
  const { apiKey } = await chrome.storage.local.get("apiKey");
  const model = selectedModel;
  if (!apiKey || !model) {
    $("settings").hidden = false;
    return addMsg("error", "Add your API key and at least one model ID in settings first.");
  }

  busy = true;
  $("send").disabled = true;
  $("input").value = "";
  try {
    const { parts, notes } = await gatherContext();
    addMsg("user", question, notes.length ? "Attached: " + notes.join(", ") : "No context attached");
    const turn = { role: "user", parts: [...parts, { text: question }] };
    const body = addMsg("model", "…", model);
    const reply = await streamGemini(apiKey, model, [...history, turn], (t) => {
      body.textContent = t;
      $("log").scrollTop = $("log").scrollHeight;
    });
    history.push(turn, { role: "model", parts: [{ text: reply }] });
  } catch (e) {
    addMsg("error", "Error: " + e.message);
  } finally {
    busy = false;
    $("send").disabled = false;
    $("input").focus();
  }
}

$("send").onclick = send;
$("input").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    send();
  }
});

loadSettings();
refreshTabInfo();

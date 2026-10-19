const $ = (id) => document.getElementById(id);
const MAX_PAGE_CHARS = 200000;
const MAX_EXTRA_TABS_CHARS = 400000; // total budget for other tabs, split evenly
const MAX_PDF_BYTES = 15 * 1024 * 1024; // inline request limit is ~20MB incl. base64 overhead

const KEEP_ATTACHED_TURNS = 2; // earlier exchanges that keep their page text / screenshots / PDFs
const LONG_CHAT_TOKENS = 60000; // rough estimate that triggers the "long chat" banner

let history = []; // Gemini-style "contents" array (see providers.js)
let busy = false;

// Attachment parts are tagged with what they are so old ones can be swapped for a placeholder.
const attachmentKind = new WeakMap();
const tag = (part, kind) => (attachmentKind.set(part, kind), part);

// Copy of the history for sending: attachments older than the last KEEP_ATTACHED_TURNS
// exchanges become short placeholders (the stored history keeps everything).
function trimHistory(h) {
  const cutoff = h.length - 2 * KEEP_ATTACHED_TURNS;
  return h.map((turn, i) => {
    if (i >= cutoff || turn.role !== "user") return turn;
    const parts = [];
    for (const p of turn.parts) {
      const kind = attachmentKind.get(p);
      if (!kind) { parts.push(p); continue; }
      const text = `[${kind} from an earlier message omitted]`;
      if (parts[parts.length - 1]?.text !== text) parts.push({ text });
    }
    return { ...turn, parts };
  });
}

// Very rough token estimate: ~4 characters per token, flat cost for images, bytes/100 for PDFs.
function estimateTokens(contents) {
  let n = 0;
  for (const t of contents) {
    for (const p of t.parts) {
      if (p.text !== undefined) n += p.text.length / 4;
      else if (p.inlineData.mimeType === "application/pdf") n += (p.inlineData.data.length * 0.75) / 100;
      else n += 1500;
    }
  }
  return Math.round(n);
}

// ---------- settings ----------
// Per-provider config: { apiKey, baseUrl, models: [ids the user added], model: selected id }.
// There are no built-in model IDs; the user adds the exact IDs from the provider's docs.
let providerId = "gemini";
let providerCfg = {};

const cur = () => (providerCfg[providerId] ||= { apiKey: "", baseUrl: "", models: [], model: "" });

async function saveConfig() {
  await chrome.storage.local.set({ provider: providerId, providerCfg });
  renderModels();
}

function renderProviders() {
  const sel = $("providerSelect");
  sel.textContent = "";
  for (const [id, p] of Object.entries(PROVIDERS)) sel.add(new Option(p.name, id));
  sel.value = providerId;
}

function renderModels() {
  const c = cur();
  const sel = $("modelSelect");
  sel.textContent = "";
  if (!c.models.length) sel.add(new Option("(add a model in settings)", ""));
  for (const m of c.models) sel.add(new Option(m, m));
  sel.value = c.model;

  const list = $("modelList");
  list.textContent = "";
  for (const m of c.models) {
    const li = document.createElement("li");
    const span = document.createElement("span");
    span.textContent = m;
    const del = document.createElement("button");
    del.textContent = "Remove";
    del.onclick = () => {
      c.models = c.models.filter((x) => x !== m);
      if (c.model === m) c.model = c.models[0] || "";
      saveConfig();
    };
    li.append(span, del);
    list.appendChild(li);
  }
}

function link(href, text) {
  const a = document.createElement("a");
  a.href = href;
  a.textContent = text;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  return a;
}

// Fill the settings form for the active provider.
function renderSettings() {
  const p = PROVIDERS[providerId], c = cur();
  $("keyLabel").textContent = `${p.name} API key`;
  $("apiKey").placeholder = p.keyPlaceholder;
  $("apiKey").value = c.apiKey;
  $("baseUrl").value = c.baseUrl || p.baseUrl;
  $("baseUrlLabel").hidden = !p.editableUrl;
  $("providerLinks").replaceChildren(link(p.keyUrl, "Get an API key"), " · ", link(p.modelsUrl, "Model IDs"));
  $("keyHint").textContent = `The key is stored locally in this browser and only sent to ${new URL(c.baseUrl || p.baseUrl).host}.`;
  $("modelInput").placeholder = `exact ${p.name} model ID`;
  renderModels();
  renderPrivacy();
}

// ---------- privacy note ----------
let privacyAck = false;

function renderPrivacy() {
  const p = PROVIDERS[providerId];
  const host = new URL(cur().baseUrl || p.baseUrl).host;
  $("privacyText").textContent = `Nothing leaves your browser until you press send. Then your message and whatever context you ticked go straight to ${p.name} (${host}) with your API key.`;
  $("privacyNote").hidden = privacyAck;

  const items = [
    `Sent on each message: your text plus the ticked context (selection, page text, other tabs, screenshot, PDF) and the earlier messages of the chat. There is no server of ours in between; the extension has no analytics.`,
    `The extension reads the selection on the current tab to auto-tick "Selection", but sends nothing until you send a message. Untick context (or don't use it) on pages with private data such as banking, email or medical pages.`,
    `Stored in this browser only, unencrypted: your API keys and saved chats (text only). Screenshots and PDFs are never saved. Delete chats in History.`,
    p.name === "Gemini"
      ? `Google's free Gemini API tier may use what you send to improve its products and humans may review it; paid usage is excluded. Check Google's current terms.`
      : `${p.name} handles what you send under its own terms (retention, training use, where data is processed). Check its privacy policy.`,
  ];
  const list = $("privacyList");
  list.textContent = "";
  for (const t of items) {
    const li = document.createElement("li");
    li.textContent = t;
    list.appendChild(li);
  }
  $("privacyLink").replaceChildren(...(p.privacyUrl ? [link(p.privacyUrl, `${p.name} privacy / data terms`)] : []));
}

$("privacyDetails").onclick = () => {
  $("settings").hidden = false;
  $("privacyBox").open = true;
  $("privacyBox").scrollIntoView?.({ block: "nearest" });
};
$("privacyOk").onclick = () => {
  privacyAck = true;
  $("privacyNote").hidden = true;
  chrome.storage.local.set({ privacyAck: true });
};

async function loadSettings() {
  const s = await chrome.storage.local.get(["provider", "providerCfg", "apiKey", "models", "model", "privacyAck"]);
  providerCfg = s.providerCfg || {};
  privacyAck = !!s.privacyAck;
  // Migrate the old single-provider (Gemini-only) settings.
  if (!s.providerCfg && (s.apiKey || s.models)) {
    providerCfg.gemini = { apiKey: s.apiKey || "", baseUrl: "", models: s.models || [], model: s.model || "" };
    await chrome.storage.local.remove(["apiKey", "models", "model"]);
  }
  providerId = PROVIDERS[s.provider] ? s.provider : "gemini";
  const c = cur();
  if (!c.models.includes(c.model)) c.model = c.models[0] || "";
  await saveConfig();
  renderProviders();
  renderSettings();
  if (!c.apiKey || !c.models.length) $("settings").hidden = false;
}

$("settingsBtn").onclick = () => ($("settings").hidden = !$("settings").hidden);
$("providerSelect").onchange = () => {
  providerId = $("providerSelect").value;
  const c = cur();
  if (!c.models.includes(c.model)) c.model = c.models[0] || "";
  saveConfig();
  renderSettings();
  if (!c.apiKey || !c.models.length) $("settings").hidden = false;
};
$("saveSettings").onclick = async () => {
  const c = cur(), p = PROVIDERS[providerId];
  c.apiKey = $("apiKey").value.trim();
  const url = $("baseUrl").value.trim().replace(/\/+$/, "");
  c.baseUrl = p.editableUrl && url && url !== p.baseUrl ? url : "";
  try { new URL(c.baseUrl || p.baseUrl); } catch { c.baseUrl = ""; }
  await saveConfig();
  renderSettings();
};
$("addModel").onclick = () => {
  const c = cur();
  const id = $("modelInput").value.trim().replace(/^models\//, "");
  if (!id) return;
  if (!c.models.includes(id)) c.models.push(id);
  c.model = id;
  $("modelInput").value = "";
  saveConfig();
};
$("modelInput").addEventListener("keydown", (e) => e.key === "Enter" && $("addModel").click());
$("modelSelect").onchange = () => {
  cur().model = $("modelSelect").value;
  saveConfig();
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

// Auto-tick "Selection" when text gets selected on the page while the panel is open
// (and untick it again when the selection goes away, unless the user touched the pill).
let selAuto = false;
$("useSelection").addEventListener("change", () => (selAuto = false));
async function pollSelection() {
  if (document.hidden || busy) return;
  try {
    const tab = await getTargetTab();
    if (!tab) return;
    const has = (await runInTab(tab, readSelection, true)).some(Boolean);
    const box = $("useSelection");
    if (has && !box.checked) { box.checked = true; selAuto = true; }
    else if (!has && box.checked && selAuto) { box.checked = false; selAuto = false; }
  } catch {} // restricted pages (brave://, Web Store) can't be scripted
}
setInterval(pollSelection, 1000);

// ---------- extra tabs picker ----------
const extraTabs = new Set(); // ids of other tabs whose text is attached to every message

function updateTabsBtn() {
  $("tabsBtn").textContent = (extraTabs.size ? `Tabs (${extraTabs.size})` : "Tabs") + (" ▾");
  $("tabsBtn").classList.toggle("active", extraTabs.size > 0);
}

async function renderTabList() {
  const wins = await chrome.windows.getAll({ populate: true });
  const active = await getTargetTab();
  const tabs = wins.filter((w) => w.type === "normal").flatMap((w) => w.tabs).filter((t) => /^(https?|file):/.test(t.url || ""));
  for (const id of [...extraTabs]) if (!tabs.some((t) => t.id === id)) extraTabs.delete(id); // closed
  const list = $("tabList");
  list.textContent = "";
  for (const t of tabs) {
    const isActive = t.id === active?.id;
    const li = document.createElement("li");
    const label = document.createElement("label");
    if (isActive) label.className = "disabled";
    const box = document.createElement("input");
    box.type = "checkbox";
    box.checked = isActive || extraTabs.has(t.id);
    box.disabled = isActive;
    box.onchange = () => {
      box.checked ? extraTabs.add(t.id) : extraTabs.delete(t.id);
      updateTabsBtn();
    };
    const title = document.createElement("span");
    title.className = "t";
    title.textContent = t.title || t.url;
    title.title = t.url;
    label.append(box, title);
    if (isActive || looksLikePdfUrl(t.url)) {
      const tag = document.createElement("small");
      tag.textContent = isActive ? "current" : "PDF, skipped";
      label.append(tag);
    }
    li.appendChild(label);
    list.appendChild(li);
  }
  updateTabsBtn();
}

$("tabsBtn").onclick = () => {
  $("tabPicker").hidden = !$("tabPicker").hidden;
  if (!$("tabPicker").hidden) renderTabList();
};
for (const ev of ["onCreated", "onRemoved", "onUpdated", "onActivated"]) {
  chrome.tabs[ev].addListener(() => !$("tabPicker").hidden && renderTabList());
}

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
        parts.push(tag({ text: `Selected text:\n"""\n${sels.join("\n---\n")}\n"""` }, "selected text"));
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
        parts.push(tag({ text: `Page text:\n"""\n${text.slice(0, MAX_PAGE_CHARS)}\n"""` }, "page text"));
        notes.push("page text");
      }
    } catch {
      notes.push("page text unavailable on this page");
    }
  }

  if (extraTabs.size) {
    const others = (await Promise.all([...extraTabs].map((id) => chrome.tabs.get(id).catch(() => null))))
      .filter((t) => t && t.id !== tab.id);
    for (const id of [...extraTabs]) if (!others.some((t) => t.id === id)) extraTabs.delete(id); // closed
    updateTabsBtn();
    const budget = Math.min(MAX_PAGE_CHARS, Math.floor(MAX_EXTRA_TABS_CHARS / Math.max(others.length, 1)));
    let added = 0;
    for (const t of others) {
      if (looksLikePdfUrl(t.url)) { notes.push(`tab "${t.title}" skipped (PDF)`); continue; }
      try {
        const [text] = await runInTab(t, readPageText);
        if (!text) { notes.push(`tab "${t.title}" has no text`); continue; }
        parts.push(tag({ text: `Other open tab "${t.title}" (${t.url}), page text:\n"""\n${text.slice(0, budget)}\n"""` }, "other tab text"));
        added++;
      } catch {
        notes.push(`tab "${t.title}" unavailable (restricted or asleep)`);
      }
    }
    if (added) notes.push(`${added} extra tab${added > 1 ? "s" : ""}`);
  }

  const caps = capsFor(providerId, cur().model);
  if ($("useShot").checked && !caps.image) {
    notes.push(`screenshot skipped (${PROVIDERS[providerId].name} can't read images with this model)`);
  } else if ($("useShot").checked) {
    try {
      const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "jpeg", quality: 80 });
      parts.push(tag({ text: "The following image is a screenshot of the user's currently visible browser tab. You can see it; use it to answer." }, "screenshot"));
      parts.push(tag({ inlineData: { mimeType: "image/jpeg", data: dataUrl.split(",")[1] } }, "screenshot"));
      notes.push("screenshot");
    } catch (e) {
      const blocked = /activeTab|cannot access|permission/i.test(e.message);
      notes.push(blocked
        ? "screenshot blocked (brave:// pages, the New Tab page and the Web Store can't be captured; on a normal site, set the extension's Site access to 'On all sites' in brave://extensions)"
        : "screenshot failed: " + e.message);
    }
  }

  if ($("usePdf").checked) {
    if (!caps.pdf) {
      notes.push(`PDF skipped (${PROVIDERS[providerId].name} can't read PDFs; try Page text)`);
    } else if (!/^(https?|file):/.test(tab.url || "")) {
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
          parts.push(tag({ inlineData: { mimeType: "application/pdf", data: toBase64(buf) } }, "PDF"));
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

// ---------- minimal markdown ----------
function esc(s) { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
function inline(s) {
  const codes = [];
  s = s.replace(/`([^`]+)`/g, (_, c) => (codes.push(c), "\u0000" + (codes.length - 1) + "\u0000"));
  s = esc(s)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => "<code>" + esc(codes[i]) + "</code>");
}
function renderMarkdown(src) {
  const lines = src.replace(/\r/g, "").split("\n");
  let out = "", i = 0, para = [];
  const flush = () => { if (para.length) out += "<p>" + inline(para.join("\n")).replace(/\n/g, "<br>") + "</p>"; para = []; };
  while (i < lines.length) {
    const l = lines[i];
    let m;
    if ((m = l.match(/^```/))) {
      flush();
      const code = [];
      for (i++; i < lines.length && !/^```/.test(lines[i]); i++) code.push(lines[i]);
      i++;
      out += '<div class="codeblock"><button class="copy">Copy</button><pre><code>' + esc(code.join("\n")) + "</code></pre></div>";
    } else if ((m = l.match(/^(#{1,4})\s+(.*)/))) {
      flush(); out += "<h" + m[1].length + ">" + inline(m[2]) + "</h" + m[1].length + ">"; i++;
    } else if (/^\s*([-*+]|\d+\.)\s+/.test(l)) {
      flush();
      const ord = /^\s*\d+\./.test(l), tag = ord ? "ol" : "ul";
      out += "<" + tag + ">";
      while (i < lines.length && /^\s*([-*+]|\d+\.)\s+/.test(lines[i])) {
        out += "<li>" + inline(lines[i].replace(/^\s*([-*+]|\d+\.)\s+/, "")) + "</li>"; i++;
      }
      out += "</" + tag + ">";
    } else if (/^>\s?/.test(l)) {
      flush(); const q = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) q.push(lines[i++].replace(/^>\s?/, ""));
      out += "<blockquote>" + inline(q.join("\n")).replace(/\n/g, "<br>") + "</blockquote>";
    } else if (/^---+\s*$/.test(l)) {
      flush(); out += "<hr>"; i++;
    } else if (!l.trim()) {
      flush(); i++;
    } else { para.push(l); i++; }
  }
  flush();
  return out;
}
function setBody(body, text) {
  if (body.classList.contains("md")) body.innerHTML = renderMarkdown(text);
  else body.textContent = text;
}
$("log").addEventListener("click", (e) => {
  const b = e.target.closest(".copy");
  if (!b) return;
  navigator.clipboard.writeText(b.nextElementSibling.textContent);
  b.textContent = "Copied";
  setTimeout(() => (b.textContent = "Copy"), 1200);
});

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
  if (cls === "model") body.classList.add("md");
  if (text === "…") body.innerHTML = '<span class="typing"><i></i><i></i><i></i></span>';
  else setBody(body, text);
  div.appendChild(body);
  $("log").appendChild(div);
  $("log").scrollTop = $("log").scrollHeight;
  return body;
}

// ---------- saved chats (text only; screenshots/PDFs are not stored) ----------
let chats = [];
let current = null; // created lazily on the first message

function persistChats() {
  return chrome.storage.local.set({ chats, lastChat: current?.id || null });
}

// ---------- long-chat banner + "Summarize and continue" ----------
let bannerDismissed = false;

function updateBanner() {
  const tokens = estimateTokens(trimHistory(history));
  const show = !bannerDismissed && tokens >= LONG_CHAT_TOKENS;
  $("longBanner").hidden = !show;
  if (show) $("longText").textContent = `This chat is getting long (~${Math.round(tokens / 1000)}k tokens per message). Long chats cost more and the model uses the early parts less well.`;
}

let summaryPromise;
function loadSummaryPrompt() {
  summaryPromise ||= fetch(chrome.runtime.getURL("instructions/summarize.md")).then((r) => r.text()).catch(() => "");
  return summaryPromise;
}

async function summarizeAndContinue() {
  if (busy || !history.length) return;
  const { apiKey, baseUrl, model } = cur();
  if (!apiKey || !model) return ($("settings").hidden = false);
  busy = true;
  $("send").disabled = true;
  $("summarize").disabled = true;
  $("longText").textContent = "Summarizing…";
  try {
    const prompt = (await loadSummaryPrompt()) || "Summarize our conversation so far: decisions made, key facts, open questions.";
    const summary = await streamChat(providerId, { apiKey, baseUrl }, model,
      [...trimHistory(history), { role: "user", parts: [{ text: prompt }] }], await loadSystemInstruction(), () => {},
      (msg) => ($("longText").textContent = msg));
    const label = `Summary of previous chat · ${PROVIDERS[providerId].name} · ${model}`;
    const title = "Summary: " + (current?.title || "chat");
    current = {
      id: Date.now().toString(36), title, updated: Date.now(),
      msgs: [{ cls: "model", text: summary, meta: label }],
      history: [
        { role: "user", parts: [{ text: "Summary of our previous conversation (use it as context):\n\n" + summary }] },
        { role: "model", parts: [{ text: "Understood. I'll continue from that summary." }] },
      ],
    };
    chats.unshift(current);
    history = [...current.history];
    bannerDismissed = false;
    $("log").textContent = "";
    addMsg("model", summary, label);
    renderChatList();
    persistChats();
  } catch (e) {
    addMsg("error", "Summary failed: " + e.message);
  } finally {
    busy = false;
    $("send").disabled = false;
    $("summarize").disabled = false;
    updateBanner();
  }
}
$("summarize").onclick = summarizeAndContinue;
$("dismissBanner").onclick = () => { bannerDismissed = true; updateBanner(); };

function startNewChat() {
  current = null;
  history = [];
  bannerDismissed = false;
  updateBanner();
  $("log").textContent = "";
  renderChatList();
  persistChats();
}

function openChat(id) {
  const c = chats.find((x) => x.id === id);
  if (!c || busy) return;
  current = c;
  history = [...c.history];
  bannerDismissed = false;
  updateBanner();
  $("log").textContent = "";
  for (const m of c.msgs) addMsg(m.cls, m.text, m.meta);
  $("history").hidden = true;
  renderChatList();
  persistChats();
}

function renderChatList() {
  const list = $("chatList");
  list.textContent = "";
  for (const c of chats) {
    const li = document.createElement("li");
    if (c === current) li.className = "active";
    const open = document.createElement("button");
    open.className = "open";
    const t = document.createElement("b");
    t.textContent = c.title;
    const d = document.createElement("small");
    d.textContent = new Date(c.updated).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
    open.append(t, d);
    open.onclick = () => openChat(c.id);
    const del = document.createElement("button");
    del.className = "del";
    del.textContent = "✕";
    del.title = "Delete this chat";
    del.onclick = () => {
      if (busy) return;
      chats = chats.filter((x) => x !== c);
      if (c === current) startNewChat();
      else { renderChatList(); persistChats(); }
    };
    li.append(open, del);
    list.appendChild(li);
  }
}

function saveTurn(question, notes, meta, reply, model) {
  if (!current) {
    current = { id: Date.now().toString(36), title: question.replace(/\s+/g, " ").slice(0, 60), msgs: [], history: [], updated: 0 };
    chats.unshift(current);
  }
  current.msgs.push({ cls: "user", text: question, meta }, { cls: "model", text: reply, meta: model });
  current.history.push(
    { role: "user", parts: [{ text: question + (notes.length ? `\n\n[Attached to that message: ${notes.join(", ")}]` : "") }] },
    { role: "model", parts: [{ text: reply }] }
  );
  current.updated = Date.now();
  chats = [current, ...chats.filter((x) => x !== current)];
  renderChatList();
  persistChats();
}

async function loadChats() {
  const { chats: saved = [], lastChat } = await chrome.storage.local.get(["chats", "lastChat"]);
  chats = saved;
  renderChatList();
  if (lastChat) openChat(lastChat);
}

$("historyBtn").onclick = () => ($("history").hidden = !$("history").hidden);
$("newChat").onclick = () => {
  if (!busy) startNewChat();
};

// ---------- model call ----------
const INSTRUCTION_FILES = ["01-environment.md", "02-capabilities.md", "03-style.md"];
let systemPromise;
function loadSystemInstruction() {
  systemPromise ||= Promise.all(
    INSTRUCTION_FILES.map((f) => fetch(chrome.runtime.getURL("instructions/" + f)).then((r) => r.text()))
  ).then((t) => t.join("\n\n")).catch(() => "");
  return systemPromise;
}

async function send() {
  if (busy) return;
  const question = $("input").value.trim();
  if (!question) return;
  const { apiKey, baseUrl, model } = cur();
  if (!apiKey || !model) {
    $("settings").hidden = false;
    return addMsg("error", `Add your ${PROVIDERS[providerId].name} API key and at least one model ID in settings first.`);
  }
  const label = `${PROVIDERS[providerId].name} · ${model}`;

  if (sent[sent.length - 1] !== question) sent.push(question);
  recall = -1;
  busy = true;
  $("send").disabled = true;
  $("input").value = "";
  $("input").style.height = "auto";
  try {
    const { parts, notes } = await gatherContext();
    const userMeta = notes.length ? "Attached: " + notes.join(", ") : "No context attached";
    addMsg("user", question, userMeta);
    const turn = { role: "user", parts: [...parts, { text: question }] };
    const body = addMsg("model", "…", label);
    const reply = await streamChat(providerId, { apiKey, baseUrl }, model, [...trimHistory(history), turn], await loadSystemInstruction(), (t) => {
      setBody(body, t);
      $("log").scrollTop = $("log").scrollHeight;
    }, (msg) => (body.textContent = msg));
    history.push(turn, { role: "model", parts: [{ text: reply }] });
    saveTurn(question, notes, userMeta, reply, label);
    updateBanner();
  } catch (e) {
    addMsg("error", "Error: " + e.message);
  } finally {
    busy = false;
    $("send").disabled = false;
    $("input").focus();
  }
}

// Up/Down arrow recalls previously sent messages (like a shell).
const sent = [];
let recall = -1, draft = "";
function recallMsg(e) {
  const t = $("input");
  if (e.key === "ArrowUp" && sent.length && t.selectionStart === t.selectionEnd && !t.value.slice(0, t.selectionStart).includes("\n")) {
    if (recall === -1) { draft = t.value; recall = sent.length - 1; }
    else if (recall > 0) recall--;
    else return;
  } else if (e.key === "ArrowDown" && recall !== -1 && !t.value.slice(t.selectionEnd).includes("\n")) {
    recall = recall < sent.length - 1 ? recall + 1 : -1;
  } else return;
  e.preventDefault();
  t.value = recall === -1 ? draft : sent[recall];
  t.setSelectionRange(t.value.length, t.value.length);
  t.dispatchEvent(new Event("input"));
}

$("send").onclick = send;
$("input").addEventListener("input", () => {
  const t = $("input");
  t.style.height = "auto";
  t.style.height = Math.min(t.scrollHeight, 140) + "px";
});
$("input").addEventListener("keydown", (e) => {
  recallMsg(e);
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    send();
  }
});

// Let the background know this panel is open (enables the toggle shortcut).
const bgPort = chrome.runtime.connect({ name: "panel" });
chrome.windows.getCurrent().then((w) => bgPort.postMessage({ windowId: w.id }));
bgPort.onMessage.addListener((msg) => {
  if (msg?.type === "focus-input") { window.focus(); $("input").focus(); }
});
$("input").focus();
loadSettings();
loadChats();
refreshTabInfo();

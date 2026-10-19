// Provider adapters. Conversation history is kept in Gemini's "contents" shape
//   { role: "user" | "model", parts: [{ text } | { inlineData: { mimeType, data } }] }
// and each adapter converts it to its own API. `caps` says which attachments a
// provider can read; unsupported ones are dropped with a text placeholder.

const RETRY_STATUS = [429, 500, 502, 503, 504, 529];

// POST with retry/backoff on busy/overloaded responses.
async function postWithRetry(url, headers, body, onRetry) {
  let resp;
  for (let attempt = 0; ; attempt++) {
    resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
    if (resp.ok) return resp;
    let msg = "HTTP " + resp.status;
    try { msg = (await resp.json()).error?.message || msg; } catch {}
    if (resp.status === 401 || resp.status === 403) msg += " (check the API key for this provider)";
    if (!RETRY_STATUS.includes(resp.status) || attempt >= 4) throw new Error(msg);
    const wait = 2 * 2 ** attempt;
    for (let s = wait; s > 0; s--) {
      onRetry?.(`Model is busy, retrying in ${s}s (${attempt + 1}/4)…`);
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}

// Yields the payload of each SSE "data:" line.
async function* sseData(resp) {
  const reader = resp.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop();
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (data) yield data;
    }
  }
  if (buf.startsWith("data:") && buf.slice(5).trim()) yield buf.slice(5).trim();
}

function omitted(part, label) {
  const kind = part.inlineData.mimeType === "application/pdf" ? "PDF" : "image";
  return { text: `[${kind} omitted: ${label} cannot read it]` };
}

// Provider `caps` is an object or a function of the model ID (vision is per-model for some).
function capsFor(providerId, model) {
  const c = PROVIDERS[providerId].caps;
  return typeof c === "function" ? c(model) : c;
}

// ---------- Gemini ----------
async function streamGemini({ apiKey, baseUrl, model, contents, system, onText, onRetry }) {
  const url = `${baseUrl}/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`;
  const resp = await postWithRetry(url, { "x-goog-api-key": apiKey },
    { contents, systemInstruction: { parts: [{ text: system }] } }, onRetry);
  let full = "";
  for await (const data of sseData(resp)) {
    const chunk = JSON.parse(data);
    const text = (chunk.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("");
    if (text) onText((full += text));
    if (chunk.promptFeedback?.blockReason) throw new Error("Blocked: " + chunk.promptFeedback.blockReason);
  }
  return full;
}

// ---------- Anthropic ----------
function toAnthropicMessages(contents) {
  return contents.map((t) => ({
    role: t.role === "model" ? "assistant" : "user",
    content: t.parts
      .map((p) => {
        if (p.text !== undefined) return p.text.trim() ? { type: "text", text: p.text } : null;
        const { mimeType, data } = p.inlineData;
        return mimeType === "application/pdf"
          ? { type: "document", source: { type: "base64", media_type: mimeType, data } }
          : { type: "image", source: { type: "base64", media_type: mimeType, data } };
      })
      .filter(Boolean),
  }));
}

// Claude's max output differs per model and I don't hardcode it: ask for a lot, and if the API
// says the model's cap is lower ("max_tokens: 64000 > 32000, which is the maximum…"), retry at that cap.
const anthropicCaps = {}; // model -> learned cap
async function streamAnthropic({ apiKey, baseUrl, model, contents, system, onText, onRetry }) {
  const headers = {
    "x-api-key": apiKey,
    "anthropic-version": "2023-06-01",
    "anthropic-dangerous-direct-browser-access": "true",
  };
  const messages = toAnthropicMessages(contents);
  let resp;
  for (let tryNo = 0; ; tryNo++) {
    try {
      resp = await postWithRetry(`${baseUrl}/messages`, headers,
        { model, max_tokens: anthropicCaps[model] || 64000, system, messages, stream: true }, onRetry);
      break;
    } catch (e) {
      const m = /max_tokens:\s*\d+\s*>\s*(\d+)/.exec(e.message);
      if (!m || tryNo > 0) throw e;
      anthropicCaps[model] = +m[1];
    }
  }
  let full = "";
  for await (const data of sseData(resp)) {
    const ev = JSON.parse(data);
    if (ev.type === "error") throw new Error(ev.error?.message || "Anthropic stream error");
    if (ev.type === "content_block_delta" && ev.delta?.type === "text_delta") onText((full += ev.delta.text));
  }
  return full;
}

// ---------- OpenAI-compatible (OpenAI, DeepSeek, xAI Grok, Qwen/DashScope) ----------
function toOpenAIMessages(contents, system, caps, label) {
  const msgs = [{ role: "system", content: system }];
  for (const t of contents) {
    if (t.role === "model") {
      msgs.push({ role: "assistant", content: t.parts.map((p) => p.text || "").join("") });
      continue;
    }
    const parts = t.parts.map((p) => {
      if (p.text !== undefined) return p;
      const pdf = p.inlineData.mimeType === "application/pdf";
      return (pdf ? caps.pdf : caps.image) ? p : omitted(p, label);
    });
    if (parts.every((p) => p.text !== undefined)) {
      msgs.push({ role: "user", content: parts.map((p) => p.text).join("\n\n") });
      continue;
    }
    msgs.push({
      role: "user",
      content: parts.map((p) => {
        if (p.text !== undefined) return { type: "text", text: p.text };
        const { mimeType, data } = p.inlineData;
        const url = `data:${mimeType};base64,${data}`;
        return mimeType === "application/pdf"
          ? { type: "file", file: { filename: "document.pdf", file_data: url } }
          : { type: "image_url", image_url: { url } };
      }),
    });
  }
  return msgs;
}

async function streamOpenAICompat({ apiKey, baseUrl, model, contents, system, onText, onRetry, provider, caps }) {
  const resp = await postWithRetry(`${baseUrl}/chat/completions`, { Authorization: "Bearer " + apiKey },
    { model, messages: toOpenAIMessages(contents, system, caps, provider.name), stream: true }, onRetry);
  let full = "";
  for await (const data of sseData(resp)) {
    if (data === "[DONE]") break;
    const chunk = JSON.parse(data);
    if (chunk.error) throw new Error(chunk.error.message || "Stream error");
    const text = chunk.choices?.[0]?.delta?.content;
    if (text) onText((full += text));
  }
  return full;
}

const PROVIDERS = {
  gemini: {
    name: "Gemini", stream: streamGemini, caps: { image: true, pdf: true },
    baseUrl: "https://generativelanguage.googleapis.com/v1beta", editableUrl: false,
    keyPlaceholder: "AIza...",
    keyUrl: "https://aistudio.google.com/apikey",
    modelsUrl: "https://ai.google.dev/gemini-api/docs/models",
    privacyUrl: "https://ai.google.dev/gemini-api/terms",
  },
  anthropic: {
    name: "Claude", stream: streamAnthropic, caps: { image: true, pdf: true },
    baseUrl: "https://api.anthropic.com/v1", editableUrl: false,
    keyPlaceholder: "sk-ant-...",
    keyUrl: "https://console.anthropic.com/settings/keys",
    modelsUrl: "https://docs.anthropic.com/en/docs/about-claude/models",
    privacyUrl: "https://www.anthropic.com/legal/privacy",
  },
  openai: {
    name: "OpenAI", stream: streamOpenAICompat, caps: { image: true, pdf: true },
    baseUrl: "https://api.openai.com/v1", editableUrl: true,
    keyPlaceholder: "sk-...",
    keyUrl: "https://platform.openai.com/api-keys",
    modelsUrl: "https://platform.openai.com/docs/models",
    privacyUrl: "https://openai.com/policies/privacy-policy",
  },
  deepseek: {
    name: "DeepSeek", stream: streamOpenAICompat,
    // Only DeepSeek's vision model IDs (e.g. "...-vision-exp") accept images; the regular chat models are text-only.
    caps: (model) => ({ image: /vision/i.test(model), pdf: false }),
    baseUrl: "https://api.deepseek.com", editableUrl: true,
    keyPlaceholder: "sk-...",
    keyUrl: "https://platform.deepseek.com/api_keys",
    modelsUrl: "https://api-docs.deepseek.com/quick_start/pricing",
    privacyUrl: "https://cdn.deepseek.com/policies/en-US/deepseek-privacy-policy.html",
  },
  grok: {
    name: "Grok", stream: streamOpenAICompat, caps: { image: true, pdf: false },
    baseUrl: "https://api.x.ai/v1", editableUrl: true,
    keyPlaceholder: "xai-...",
    keyUrl: "https://console.x.ai",
    modelsUrl: "https://docs.x.ai/docs/models",
    privacyUrl: "https://x.ai/legal/privacy-policy",
  },
  qwen: {
    name: "Qwen", stream: streamOpenAICompat, caps: { image: true, pdf: false },
    // International DashScope endpoint; mainland China uses https://dashscope.aliyuncs.com/compatible-mode/v1
    baseUrl: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1", editableUrl: true,
    keyPlaceholder: "sk-...",
    keyUrl: "https://bailian.console.alibabacloud.com/?apiKey=1",
    modelsUrl: "https://www.alibabacloud.com/help/en/model-studio/models",
  },
};

// Streams a reply, calling onText(fullTextSoFar). `cfg` = { apiKey, baseUrl }.
async function streamChat(providerId, cfg, model, contents, system, onText, onRetry) {
  const provider = PROVIDERS[providerId];
  const baseUrl = (cfg.baseUrl || provider.baseUrl).replace(/\/+$/, "");
  const full = await provider.stream({ apiKey: cfg.apiKey, baseUrl, model, contents, system, onText, onRetry, provider, caps: capsFor(providerId, model) });
  if (!full) throw new Error(`Empty response from ${provider.name}.`);
  return full;
}

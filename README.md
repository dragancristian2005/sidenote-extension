# Gemini Sidekick

Brave/Chrome (Manifest V3) extension: a side panel to chat with an AI model about what's in your current tab. Bring your own API key for Gemini, Claude (Anthropic), OpenAI, DeepSeek, Grok (xAI) or Qwen (DashScope).

Context you can attach per message: selected text, page text, a screenshot of the visible tab, or the PDF open in the tab.

## Install
1. Get an API key from the provider you want (the settings panel links to each provider's key page). A chat subscription (Google AI Pro, ChatGPT Plus, Claude Pro…) does not include API access; the API is billed separately or has its own free tier.
2. Open `brave://extensions`, enable **Developer mode**, click **Load unpacked**, pick this folder.
3. For local PDFs (`file://`), open the extension's details and enable **Allow access to file URLs**.
4. Click the toolbar icon, open ⚙, pick a provider, paste the key and save it.
5. Add at least one model ID (copy it exactly from the provider's docs). There are no built-in models; pick the active provider and model from the dropdowns. Keys and models are stored per provider.

## Providers

| Provider | Endpoint | Screenshot | PDF |
|---|---|---|---|
| Gemini | `generativelanguage.googleapis.com` | yes | yes |
| Claude | `api.anthropic.com` | yes | yes |
| OpenAI | `api.openai.com/v1` (chat completions) | yes | yes |
| Grok | `api.x.ai/v1` | yes | no |
| Qwen | `dashscope-intl.aliyuncs.com/compatible-mode/v1` | yes (vision models) | no |
| DeepSeek | `api.deepseek.com` | only vision model IDs (e.g. `…vision…`) | no |

OpenAI, Grok, Qwen and DeepSeek use the OpenAI-compatible chat API, and their base URL is editable (e.g. Qwen in mainland China, or any compatible endpoint). When a provider can't read an attachment the extension skips it and says so; use *Page text* instead. Providers are defined in `providers.js`.

## Notes
- Falls back to a popup window if the browser lacks the `sidePanel` API.
- PDFs are sent inline (limit 15 MB). The built-in PDF viewer's text selection isn't readable, so the whole PDF is sent.
- Models are only the IDs you add yourself; remove them in settings.
- Switching provider mid-chat keeps the text history; images/PDFs the new provider can't read are replaced with a placeholder.

## Built-in instructions

The `instructions/*.md` files are sent to Gemini as the system instruction on every request (environment, what it can/can't see, answer style). Edit them to change how Gemini behaves, and add new files to `INSTRUCTION_FILES` in `panel.js`.

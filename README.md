# Gemini Sidekick

Brave/Chrome (Manifest V3) extension: a side panel to chat with Gemini about what's in your current tab.

Context you can attach per message: selected text, page text, a screenshot of the visible tab, or the PDF open in the tab.

## Install
1. Get an API key at https://aistudio.google.com/apikey (a Google AI Pro/Plus subscription does not include API access; the API has its own free tier / billing).
2. Open `brave://extensions`, enable **Developer mode**, click **Load unpacked**, pick this folder.
3. For local PDFs (`file://`), open the extension's details and enable **Allow access to file URLs**.
4. Click the toolbar icon, open ⚙, paste the key and save it.
5. Add at least one model ID (copy it exactly from AI Studio). There are no built-in models; pick the active one from the dropdown.

## Notes
- Falls back to a popup window if the browser lacks the `sidePanel` API.
- PDFs are sent inline (limit 15 MB). The built-in PDF viewer's text selection isn't readable, so the whole PDF is sent.
- Models are only the IDs you add yourself; remove them in settings.

## Built-in instructions

The `instructions/*.md` files are sent to Gemini as the system instruction on every request (environment, what it can/can't see, answer style). Edit them to change how Gemini behaves, and add new files to `INSTRUCTION_FILES` in `panel.js`.

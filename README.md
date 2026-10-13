# Gemini Sidekick

Brave/Chrome (Manifest V3) extension: a side panel to chat with Gemini about what's in your current tab.

Context you can attach per message: selected text, page text, a screenshot of the visible tab, or the PDF open in the tab.

## Install
1. Get an API key at https://aistudio.google.com/apikey (a Google AI Pro/Plus subscription does not include API access; the API has its own free tier / billing).
2. Open `brave://extensions`, enable **Developer mode**, click **Load unpacked**, pick this folder.
3. For local PDFs (`file://`), open the extension's details and enable **Allow access to file URLs**.
4. Click the toolbar icon, open ⚙, paste the key, save.

## Notes
- Falls back to a popup window if the browser lacks the `sidePanel` API.
- PDFs are sent inline (limit 15 MB). The built-in PDF viewer's text selection isn't readable, so the whole PDF is sent.
- Model name is editable in settings (default `gemini-2.5-flash`).

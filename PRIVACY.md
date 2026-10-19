# Sidenote Privacy Policy

_Last updated: 19 October 2026_

Sidenote is a browser extension (Chrome, Brave and other Chromium browsers) that adds a side panel where you chat with an AI model about the page you are viewing. This policy explains what data the extension handles, where it goes, and what it does not do.

**In short:** Sidenote has no server and no analytics. When you send a message, the extension sends it, plus the context you chose to attach, directly from your browser to the AI provider you picked, using your own API key. Nothing is sent to the developer.

## Who is responsible

Sidenote is developed by an individual developer based in Romania, European Union. Contact: **cristiandragan34@yahoo.ro**.

The developer does not operate any server that receives your data and therefore does not collect, receive or store it. The AI provider you choose receives the data you send and is responsible for it under its own terms (see "AI providers" below).

## What Sidenote sends, and when

Nothing is sent until you press send. When you send a message, the extension sends the following to the AI provider you selected (Google Gemini, Anthropic Claude, OpenAI, DeepSeek, xAI Grok or Alibaba Cloud Qwen, or a custom compatible endpoint you entered):

- your message text and the earlier messages of the current chat;
- the **title and URL of the active tab** (sent with every message, even if you attach no other context);
- only the context you ticked for that message: selected text, the text of the page, the text of other open tabs you chose in the Tabs picker, a screenshot of the visible part of the active tab, and/or the PDF open in the active tab;
- instructions written by the developer (the files in the `instructions/` folder) that tell the model how to behave.

To save cost, attachments from older messages are replaced by a short placeholder text when the chat is re-sent. Your API key is sent to the provider as an authentication header, as the provider's API requires.

If you use "Summarize and continue", the chat so far is sent to the selected provider with a request to summarize it.

## What Sidenote stores

Sidenote stores the following in your browser's extension storage (`chrome.storage.local`), on your device only. It is not synced and is not sent to the developer:

- your API keys, custom API base URLs and the model IDs you added, per provider;
- your saved chats: titles and message text (**text only**; screenshots, PDFs and page text attached in earlier messages are not saved) and a short note of what was attached;
- the selected provider and whether you dismissed the first-run privacy notice.

This data is stored unencrypted, as is usual for browser extension storage. Anyone with access to your browser profile or your device could read it. You can delete individual chats in the History panel, and removing the extension deletes all of it.

## What Sidenote reads on pages

- When you press send, the extension reads the content you ticked from the active tab (and from tabs you selected in the picker) and sends it as described above.
- While the panel is open, the extension checks the active tab's text selection about once per second so that it can automatically tick "Selection". The selection is only read in your browser and is not sent anywhere until you send a message. This only works on sites you have given the extension access to.
- To attach a PDF, the extension downloads the PDF from its URL, from your browser, and sends it to the provider.
- The extension cannot read `brave://`, `chrome://` or Web Store pages.

## Permissions and why they are needed

- **activeTab, scripting:** read the selection and page text of the tab you are using.
- **tabs:** show the title of the current tab and list your open tabs in the Tabs picker.
- **storage:** keep your settings, API keys and saved chats on your device.
- **sidePanel:** show Sidenote in the browser side panel.
- **Optional site access:** the extension asks for access to a website the first time you attach content from it, and for the API host of your chosen AI provider when you save a key or send. Access is remembered until you remove it in your browser's extensions page. A setting named "Allow all sites" grants this for all websites at once; it is off by default and you can switch it off at any time.

## What Sidenote does not do

- It does not collect analytics, usage statistics or crash reports.
- It does not run ads or contain third-party trackers.
- It does not sell, rent or share your data, and it does not use it for any purpose other than responding to the messages you send.
- It does not load or run remote code.
- It does not transfer or use data for credit or lending decisions, or for any purpose unrelated to the extension's single purpose of chatting with an AI model about your browsing context.

The use of information received from Chrome APIs adheres to the [Chrome Web Store User Data Policy](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq), including the Limited Use requirements.

## AI providers

Once data reaches your chosen provider, its own terms and privacy policy apply, including how long it keeps the data, whether it uses it to train models, whether people may review it, and in which countries it is processed. These differ by provider and by plan (for example, free and paid API tiers can be treated differently). Please read the policy of the provider you use before attaching sensitive content:

- Google Gemini API: https://ai.google.dev/gemini-api/terms
- Anthropic: https://www.anthropic.com/legal/privacy
- OpenAI: https://openai.com/policies/privacy-policy
- xAI (Grok): https://x.ai/legal/privacy-policy
- DeepSeek: https://cdn.deepseek.com/policies/en-US/deepseek-privacy-policy.html
- Alibaba Cloud (Qwen): see the Alibaba Cloud Model Studio terms for the region you use.

Do not attach pages that contain private information (for example banking, email, medical or confidential work pages) unless you are comfortable with that information being processed by your chosen provider.

## Your choices and rights

You decide what is attached to each message and which provider receives it. You can remove your API keys and delete saved chats in the extension at any time, revoke site access in your browser's extensions page, and remove the extension to delete all locally stored data.

Because the developer does not receive or store your data, there is no personal data held by the developer to access, correct or erase. For data held by an AI provider, contact that provider. If you are in the EU/EEA, you also have the right to lodge a complaint with your local data protection authority (in Romania: ANSPDCP).

## Children

Sidenote is not directed at children, and AI providers generally require users to be adults.

## Changes

If this policy changes, the new version will be published at the same address with an updated date, and material changes will be mentioned in the extension's release notes.

## Contact

Questions about this policy: **cristiandragan34@yahoo.ro**.

# Web Store screenshots: shot list

The Store takes 1-5 screenshots, **1280x800** (or 640x400), JPEG or 24-bit PNG without alpha.
`shoot.sh` resizes Brave to 1280x800, counts down, captures, and converts to exactly that format.

```sh
store/shoot.sh 01-selection        # 8 s countdown by default; output: store/shots/01-selection.jpg
store/shoot.sh 02-pdf 12           # custom countdown
store/prep_screenshot.sh some.png  # convert any screenshot you took yourself
```

First run: allow **Screen Recording** for your terminal (System Settings > Privacy & Security) and
**Automation** (control Brave). If the capture is black or the window doesn't resize, that's why.

## Set up once (clean, consistent shots)

- New Brave profile (or guest-like): no personal tabs, bookmarks, or other extension icons. Hide the bookmarks bar.
- Load Sidenote unpacked, pin its icon, add **one** real key + model (Gemini is fine). The key field shows dots, but
  don't open the settings with a real key visible in plain text anywhere.
- Zoom 100%, light theme for all five (consistent), or dark for all. Widen the side panel to about 420 px by dragging its edge.
- Use public, boring pages (below). No logins, no names, no email, no private URLs in the tab strip.
- Ask real questions and wait for the real answer to finish streaming. Don't edit the images afterwards, except for cropping/blurring.
  Store policy requires screenshots to show the actual product.

## The five shots

| # | Caption (add as text in the Dashboard or overlay) | Scene |
|---|---|---|
| 1 | Ask about what you're reading | Open https://en.wikipedia.org/wiki/Photosynthesis. Select a paragraph on light-dependent reactions (**Selection** ticks itself). Ask: *Explain this in simple terms with one everyday analogy.* Capture with the answer visible. |
| 2 | Chat with a PDF | Open https://arxiv.org/pdf/1706.03762 (Attention Is All You Need) in the browser. Tick **PDF** (it ticks itself on PDF tabs). Pick a provider that reads PDFs (Gemini, Claude or OpenAI). Ask: *Summarize the main contribution in 3 bullets and mention which section each comes from.* |
| 3 | Ask across several tabs | Open 3 MDN pages: `.../docs/Web/API/Fetch_API`, `.../Web/API/XMLHttpRequest`, `.../Web/API/WebSocket_API`. Open the **Tabs** picker, tick the other two, leave it open. Ask: *Compare these three APIs: when would I use each?* Capture with the picker visible (or after the answer, with the pill showing "Tabs (2)"). |
| 4 | Gemini, Claude, OpenAI, DeepSeek, Grok, Qwen | Open the **provider dropdown** so all six names show (start the countdown, then click it open; the native menu is captured because it's a screen capture). Behind it: any short finished chat. |
| 5 | Your key, your data | Open ⚙ settings, expand **Privacy**, scroll so the "Allow all sites" box and the privacy bullets are visible. (Use a dummy key like `sk-demo-1234`; it shows as dots.) Alternative: the long-chat banner with *Summarize & continue* if you have a chat long enough. |

Optional small promo tile (440x280) and marquee (1400x560) are not required. A tile can be the icon on a blue background with the name.

## Checklist before uploading

- [ ] Exactly 1280x800 (run `sips -g pixelWidth -g pixelHeight store/shots/*.jpg`).
- [ ] No personal data in the tab strip, URL bar, bookmarks, or other extension icons.
- [ ] No API key visible; answers fully loaded (no spinner or error).
- [ ] The first screenshot is the most compelling one: the Store shows it first.

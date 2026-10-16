// Open the side panel on toolbar click; fall back to a popup window
// if this browser build lacks the sidePanel API.
const hasSidePanel = !!(chrome.sidePanel && chrome.sidePanel.setPanelBehavior);

if (hasSidePanel) {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);
} else {
  chrome.action.onClicked.addListener(() => {
    chrome.windows.create({
      url: chrome.runtime.getURL("panel.html"),
      type: "popup",
      width: 420,
      height: 700,
    });
  });
}

// Track which windows have the panel open (the panel connects a port while alive).
const openPanels = new Map(); // windowId -> port
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "panel") return;
  let winId;
  port.onMessage.addListener((m) => {
    winId = m.windowId;
    openPanels.set(winId, port);
  });
  port.onDisconnect.addListener(() => {
    if (openPanels.get(winId) === port) openPanels.delete(winId);
  });
});

// Keyboard shortcut: toggle. Closed -> open the panel and focus the message box;
// open -> close it.
chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command !== "focus-input") return;
  const win = tab?.windowId ?? (await chrome.windows.getLastFocused({ windowTypes: ["normal"] })).id;
  const port = openPanels.get(win);
  if (port) {
    if (chrome.sidePanel?.close) await chrome.sidePanel.close({ windowId: win }).catch(() => port.postMessage({ type: "close" }));
    else port.postMessage({ type: "close" });
    return;
  }
  if (hasSidePanel) {
    try {
      await chrome.sidePanel.open({ windowId: win });
    } catch (e) {
      console.error(e);
    }
  } else {
    chrome.windows.create({ url: chrome.runtime.getURL("panel.html"), type: "popup", width: 420, height: 700 });
  }
});

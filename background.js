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

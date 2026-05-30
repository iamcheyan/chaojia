// ChaoJia Background Service Worker
// Routes messages between chat page and content scripts in AI site iframes
export {}

// Track the chat tab
let chatTabId: number | null = null

// Open chat page when extension icon is clicked
chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL('chat.html'), active: true })
})

// Listen for messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // From chat page: user sent a prompt
  // Forward as FILL_AND_SEND to all frames in the chat tab
  if (message.type === 'SEND_PROMPT') {
    chatTabId = sender.tab?.id ?? chatTabId
    if (chatTabId) {
      // Send to all frames in the chat tab (ChatGPT iframe + Gemini iframe)
      chrome.tabs.sendMessage(chatTabId, {
        type: 'FILL_AND_SEND',
        content: message.content,
      }).catch(() => {})
    }
    sendResponse({ ok: true })
    return true
  }

  if (message.type === 'START_NEW_CHAT') {
    chatTabId = sender.tab?.id ?? chatTabId
    if (chatTabId) {
      chrome.tabs.sendMessage(chatTabId, {
        type: 'START_NEW_CHAT',
      }).catch(() => {})
    }
    sendResponse({ ok: true })
    return true
  }

  // From content scripts: ROLE_REPLY and ROLE_STATUS
  // These are sent via chrome.runtime.sendMessage, which broadcasts to ALL extension
  // contexts (including chat.html). So we don't need to forward them here.
  // We just acknowledge receipt.
  if (message.type === 'ROLE_REPLY' || message.type === 'ROLE_STATUS') {
    sendResponse({ ok: true })
    return true
  }

  return false
})

// Clean up when chat tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId === chatTabId) {
    chatTabId = null
  }
})

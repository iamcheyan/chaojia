import { getActiveChatSiteAdapter } from './sites'
import { createReplyObserver } from './replyObserver'
import type { CapturedReply, ChatSiteAdapter } from './sites/types'

// Guard against double-loading
if (typeof (window as any).__CHAOJIA_LOADED__ === 'undefined') {
  ;(window as any).__CHAOJIA_LOADED__ = true

  // Only activate in embedded frames (iframes)
  if (window.parent !== window) {
    const siteAdapter: ChatSiteAdapter = getActiveChatSiteAdapter()
    const replyObserver = createReplyObserver({
      siteAdapter,
      onReply(reply: CapturedReply, isFinal?: boolean) {
        chrome.runtime.sendMessage({
          type: 'ROLE_REPLY',
          site: siteAdapter.id,
          content: reply.content,
          contentFormat: reply.format,
          pageUrl: location.href,
          isFinal,
        })
      },
      onStatusChange(status: 'generating' | 'idle' | 'error', detail?: string) {
        chrome.runtime.sendMessage({
          type: 'ROLE_STATUS',
          site: siteAdapter.id,
          status,
          detail,
          pageUrl: location.href,
        })
      },
    })

    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message.type === 'FILL_AND_SEND') {
        const { content, autoSend } = message
        replyObserver.captureBaseline()
        replyObserver.startPolling()
        siteAdapter.fillAndSend(content, autoSend).catch((err: Error) => {
          console.error('[ChaoJia] fillAndSend failed:', err)
          replyObserver.stop()
          chrome.runtime.sendMessage({
            type: 'ROLE_STATUS',
            site: siteAdapter.id,
            status: 'error',
            detail: err.message,
          })
        })
        sendResponse({ ok: true })
        return true
      }

      if (message.type === 'START_NEW_CHAT') {
        siteAdapter.startNewChat()
          .then((ok) => sendResponse({ ok }))
          .catch((err: Error) => {
            chrome.runtime.sendMessage({
              type: 'ROLE_STATUS',
              site: siteAdapter.id,
              status: 'error',
              detail: err.message,
              pageUrl: location.href,
            })
            sendResponse({ ok: false, error: err.message })
          })
        return true
      }
    })
  }
}

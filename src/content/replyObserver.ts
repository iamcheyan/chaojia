import type { CapturedReply, ChatSiteAdapter } from './sites/types'

export interface ReplyObserverOptions {
  siteAdapter: ChatSiteAdapter
  onReply(reply: CapturedReply, isFinal?: boolean): void
  onStatusChange(status: 'generating' | 'idle' | 'error', detail?: string): void
}

export function createReplyObserver(options: ReplyObserverOptions): {
  captureBaseline(): void
  startPolling(): void
  stop(): void
} {
  const { siteAdapter, onReply, onStatusChange } = options

  let baselineContainers: Element[] = []
  let observer: MutationObserver | null = null
  let pollTimer: ReturnType<typeof setInterval> | null = null
  let timeoutTimer: ReturnType<typeof setTimeout> | null = null
  let stabilityTimer: ReturnType<typeof setTimeout> | null = null
  let lastReplySignature = ''
  let active = false

  function clearTimers() {
    if (pollTimer !== null) { clearInterval(pollTimer); pollTimer = null }
    if (timeoutTimer !== null) { clearTimeout(timeoutTimer); timeoutTimer = null }
    if (stabilityTimer !== null) { clearTimeout(stabilityTimer); stabilityTimer = null }
  }

  function stopObserving() {
    if (observer) { observer.disconnect(); observer = null }
  }

  function isNewContainer(el: Element): boolean {
    return !baselineContainers.includes(el)
  }

  function getNewReplies(): CapturedReply[] {
    const all = siteAdapter.getResponseContainers()
    const newOnes = all.filter(isNewContainer)
    return newOnes.map(c => siteAdapter.readResponse(c)).filter(reply => reply.content.length > 0)
  }

  function getLatestReply(): CapturedReply | null {
    const replies = getNewReplies()
    return replies.length > 0 ? replies[replies.length - 1] : null
  }

  function sendStreamUpdate() {
    const reply = getLatestReply()
    if (!reply || reply.content.length === 0) return
    const signature = `${reply.format}:${reply.content}`
    
    // 只要文本有变化就发送更新
    if (signature !== lastReplySignature) {
      lastReplySignature = signature
      onReply(reply, false) // isFinal = false，表示这是流式更新
      onStatusChange('generating')
    }
  }

  function checkCompletion() {
    const reply = getLatestReply()
    if (!reply || reply.content.length === 0) return

    // 检查是否生成完成
    if (!siteAdapter.isGenerating()) {
      // 再等一小会儿，确保文本完全稳定
      if (stabilityTimer === null) {
        stabilityTimer = setTimeout(() => {
          if (!active) return
          const finalReply = getLatestReply()
          if (finalReply && finalReply.content.length > 0) {
            onReply(finalReply, true) // isFinal = true，表示这是最终回复
            onStatusChange('idle')
          }
          stopInternal()
        }, 800)
      }
    }
  }

  function setupObserver() {
    stopObserving()
    observer = new MutationObserver(() => {
      if (!active) return
      sendStreamUpdate()
    })
    observer.observe(document.body, { childList: true, subtree: true, characterData: true })
  }

  function startPolling() {
    if (pollTimer !== null) return
    pollTimer = setInterval(() => {
      if (!active) return
      sendStreamUpdate()
      checkCompletion()
    }, 300) // 更频繁地轮询，提供更好的流式体验
  }

  function startTimeout() {
    if (timeoutTimer !== null) return
    timeoutTimer = setTimeout(() => {
      if (!active) return
      const reply = getLatestReply()
      if (reply && reply.content.length > 0) {
        onReply(reply, true)
      }
      onStatusChange('error', 'timeout')
      stopInternal()
    }, 120000)
  }

  function stopInternal() {
    active = false
    stopObserving()
    clearTimers()
  }

  return {
    captureBaseline() {
      baselineContainers = siteAdapter.getResponseContainers()
      lastReplySignature = ''
    },

    startPolling() {
      active = true
      setupObserver()
      startPolling()
      startTimeout()
      onStatusChange('generating')
    },

    stop() {
      stopInternal()
    },
  }
}

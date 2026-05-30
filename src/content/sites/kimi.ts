import type { CapturedReply, ChatSiteAdapter } from './types'
import { setContentEditableText } from '../contentEditable'
import { waitForElement, waitForClickableButton, isClickableButton } from './waitForElement'

const EDITOR_SELECTORS =
  'textarea[placeholder], div[contenteditable="true"][role="textbox"], textarea[contenteditable="true"], div.chat-input-editor[contenteditable="true"]'

const SEND_BUTTON_SELECTORS =
  'button[aria-label*="发送"], button[aria-label*="Send"], button[type="submit"], button[aria-label*="送信"], button[aria-label*="送る"], .send-button-container:not(.disabled)'

const NEW_CHAT_SELECTORS =
  'a[href="/"], button[aria-label*="新对话"], button[aria-label*="New Chat"], button[aria-label*="新しいチャット"], a[aria-label*="新对话"], a.new-chat-btn'

const RESPONSE_SELECTORS = '.markdown, .prose, [data-testid="message"], [class*="message"], [class*="response"], [class*="chat-message"]'

const STOP_SELECTORS =
  'button[aria-label*="停止"], button[aria-label*="Stop"], button[aria-label*="中止"], button[aria-label*="ストップ"], .stop-button'

const ACTIVITY_INDICATORS =
  '.result-streaming, [data-is-streaming="true"], .animate-pulse, [class*="loading"], [class*="typing"], [class*="generating"]'

const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'SVG'])
const CONTENT_ROOT_SELECTORS = [
  '.markdown',
  '.prose',
  '[data-testid="message"] .markdown',
  '[class*="message"] .markdown',
  '[class*="chat-message"] .markdown',
]

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function sanitizeHref(href: string | null): string {
  if (!href) return ''
  const normalizedHref = href.trim()
  return /^https?:\/\//i.test(normalizedHref) ? normalizedHref : ''
}

function sanitizeImageSrc(src: string | null): string {
  if (!src) return ''
  const normalizedSrc = src.trim()
  return /^(https?:\/\/|data:image\/|blob:)/i.test(normalizedSrc) ? normalizedSrc : ''
}

function extractUrlsFromSrcset(srcset: string | null): string[] {
  if (!srcset) return []
  return srcset
    .split(',')
    .map(part => sanitizeImageSrc(part.trim().split(/\s+/)[0] ?? ''))
    .filter(Boolean)
}

function extractUrlsFromStyle(styleValue: string | null): string[] {
  if (!styleValue) return []
  const matches = Array.from(styleValue.matchAll(/url\((['"]?)(.*?)\1\)/g))
  return matches
    .map(match => sanitizeImageSrc(match[2] ?? ''))
    .filter(Boolean)
}

function getNodeTextLength(node: Element): number {
  return (node.textContent ?? '').replace(/\s+/g, ' ').trim().length
}

function getContentRoot(container: Element): Element {
  const candidates: Element[] = []

  for (const selector of CONTENT_ROOT_SELECTORS) {
    if (container instanceof HTMLElement && container.matches(selector)) {
      candidates.push(container)
    }
    candidates.push(...container.querySelectorAll(selector))
  }

  const uniqueCandidates = Array.from(new Set(candidates))
    .filter(node => getNodeTextLength(node) > 0)
    .sort((a, b) => getNodeTextLength(b) - getNodeTextLength(a))

  return uniqueCandidates[0] ?? container
}

function collectContainerImageHtml(container: Element, root: Element): string {
  const seen = new Set<string>()
  const parts: string[] = []

  const addImage = (src: string, alt = ''): void => {
    const normalizedSrc = sanitizeImageSrc(src)
    if (!normalizedSrc || seen.has(normalizedSrc)) return
    seen.add(normalizedSrc)
    parts.push(`<img src="${escapeHtml(normalizedSrc)}" alt="${escapeHtml(alt)}">`)
  }

  for (const img of Array.from(container.querySelectorAll<HTMLImageElement>('img'))) {
    if (root.contains(img)) continue
    addImage(img.currentSrc || img.getAttribute('src') || '', img.getAttribute('alt') ?? '')
    for (const src of extractUrlsFromSrcset(img.getAttribute('srcset'))) {
      addImage(src, img.getAttribute('alt') ?? '')
    }
  }

  for (const source of Array.from(container.querySelectorAll('source'))) {
    if (root.contains(source)) continue
    for (const src of extractUrlsFromSrcset(source.getAttribute('srcset'))) {
      addImage(src)
    }
  }

  const imageDataAttrs = ['data-src', 'data-image-src', 'data-image-url', 'data-full-image-url', 'data-thumbnail-url']
  for (const el of Array.from(container.querySelectorAll<HTMLElement>('*'))) {
    if (root.contains(el)) continue
    for (const attr of imageDataAttrs) {
      const value = el.getAttribute(attr)
      if (value) addImage(value, el.getAttribute('aria-label') ?? '')
    }
    for (const src of extractUrlsFromStyle(el.getAttribute('style'))) {
      addImage(src, el.getAttribute('aria-label') ?? '')
    }
  }

  return parts.join('')
}

function serializeNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return escapeHtml(node.textContent ?? '')
  }

  if (!(node instanceof HTMLElement)) return ''
  if (SKIP_TAGS.has(node.tagName)) return ''

  const inner = Array.from(node.childNodes).map(serializeNode).join('')

  switch (node.tagName) {
    case 'BR':
      return '<br>'
    case 'P':
      return `<p>${inner}</p>`
    case 'DIV':
    case 'SECTION':
    case 'ARTICLE':
      return inner.trim() ? `<div>${inner}</div>` : ''
    case 'SPAN':
      return inner
    case 'STRONG':
    case 'B':
      return `<strong>${inner}</strong>`
    case 'EM':
    case 'I':
      return `<em>${inner}</em>`
    case 'CODE':
      return node.closest('pre') ? inner : `<code>${inner}</code>`
    case 'PRE': {
      const code = node.querySelector('code')
      const codeText = escapeHtml(code?.textContent ?? node.textContent ?? '')
      return `<pre><code>${codeText}</code></pre>`
    }
    case 'A': {
      const href = sanitizeHref(node.getAttribute('href'))
      return href
        ? `<a href="${escapeHtml(href)}" target="_blank" rel="noreferrer noopener">${inner}</a>`
        : inner
    }
    case 'BUTTON':
      return inner
    case 'IMG': {
      const src = sanitizeImageSrc((node as HTMLImageElement).currentSrc || node.getAttribute('src'))
      if (!src) return ''
      const alt = escapeHtml(node.getAttribute('alt') ?? '')
      return `<img src="${escapeHtml(src)}" alt="${alt}">`
    }
    case 'UL':
      return `<ul>${inner}</ul>`
    case 'OL':
      return `<ol>${inner}</ol>`
    case 'LI':
      return `<li>${inner}</li>`
    case 'BLOCKQUOTE':
      return `<blockquote>${inner}</blockquote>`
    case 'H1':
    case 'H2':
    case 'H3':
    case 'H4':
    case 'H5':
    case 'H6':
      return `<${node.tagName.toLowerCase()}>${inner}</${node.tagName.toLowerCase()}>`
    case 'HR':
      return '<hr>'
    case 'TABLE':
    case 'THEAD':
    case 'TBODY':
    case 'TR':
    case 'TH':
    case 'TD':
      return `<${node.tagName.toLowerCase()}>${inner}</${node.tagName.toLowerCase()}>`
    default:
      return inner
  }
}

function normalizeHtml(html: string): string {
  return html.replace(/(?:<div>\s*<\/div>|\s+\n)/g, '').trim()
}

function captureReply(container: Element): CapturedReply {
  const root = getContentRoot(container)
  const html = normalizeHtml(`${serializeNode(root)}${collectContainerImageHtml(container, root)}`)
  const fallbackText = (container.textContent ?? '').replace(/\s+/g, ' ').trim()
  return {
    content: html || escapeHtml(fallbackText),
    format: 'html',
  }
}

export function createKimiAdapter(): ChatSiteAdapter {
  return {
    id: 'kimi',

    getResponseContainers(): Element[] {
      const candidates = [...document.querySelectorAll(RESPONSE_SELECTORS)]
      // Filter to only assistant messages
      return candidates.filter(el => {
        // Exclude the input/editor area
        if (el.querySelector(EDITOR_SELECTORS)) return false
        // Must have some text content
        return getNodeTextLength(el) > 0
      })
    },

    getAllAssistantReplies(): CapturedReply[] {
      const containers = this.getResponseContainers()
      return containers.map(c => captureReply(c)).filter(reply => reply.content.length > 0)
    },

    readResponse(node: Node): CapturedReply {
      return captureReply(node as Element)
    },

    isGenerating(): boolean {
      // Check for stop button
      const stopBtn = document.querySelector<HTMLElement>(STOP_SELECTORS)
      if (stopBtn) return true

      // Check for streaming/activity indicators
      return document.querySelector(ACTIVITY_INDICATORS) !== null
    },

    async stopGenerating(): Promise<boolean> {
      const stopBtn = document.querySelector<HTMLElement>(STOP_SELECTORS)
      if (!stopBtn) return false
      if (!isClickableButton(stopBtn)) return false
      stopBtn.click()
      return true
    },

    async startNewChat(): Promise<boolean> {
      const candidates = [...document.querySelectorAll<HTMLElement>(NEW_CHAT_SELECTORS)]
      const newChatBtn = candidates.find(el => {
        const text = (el.textContent ?? '').trim()
        const label = el.getAttribute('aria-label') ?? ''
        const href = el instanceof HTMLAnchorElement ? el.href : ''
        return /new chat|新对话|新建会话|新しいチャット/i.test(text) ||
          /new chat|新对话|新建会话|新しいチャット/i.test(label) ||
          /\/new$/i.test(href)
      })

      if (newChatBtn && isClickableButton(newChatBtn)) {
        newChatBtn.click()
        return true
      }

      // Fallback: navigate to new chat URL
      location.href = 'https://kimi.moonshot.cn/'
      return true
    },

    async fillAndSend(content: string, autoSend = true): Promise<void> {
      const editor = await waitForElement(EDITOR_SELECTORS, 10000)
      setContentEditableText(editor, content)
      if (!autoSend) return

      const sendBtn = await waitForClickableButton(SEND_BUTTON_SELECTORS, 10000, 'Send button not found or not clickable')
      sendBtn.click()
    },
  }
}
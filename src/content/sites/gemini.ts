import type { CapturedReply, ChatSiteAdapter } from './types'
import { setContentEditableText } from '../contentEditable'
import { waitForElement, waitForClickableButton, isClickableButton } from './waitForElement'

const EDITOR_SELECTORS =
  'div.ql-editor[contenteditable="true"], rich-textarea div[contenteditable="true"]'

const SEND_BUTTON_SELECTORS =
  'button.send-button[aria-label*="发送"], button.send-button[aria-label*="Send"], button[aria-label*="Send message"], button[aria-label*="发送消息"]'
const NEW_CHAT_SELECTORS =
  'button[aria-label*="New chat"], button[aria-label*="新对话"], button[aria-label*="新しいチャット"], a[href="/app"], a[href="/"], button'

const RESPONSE_SELECTORS = 'model-response, .model-response-text, message-content, .response-content'

const STOP_RE = /stop|stopping|停止|中止/i

const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'SVG'])
const CONTENT_ROOT_SELECTORS = [
  '.markdown',
  '.model-response-text',
  'message-content',
  '.response-content',
]
const RESPONSE_CONTAINER_SELECTORS = 'model-response, message-content, .response-content'
const EXTRA_IMAGE_SKIP_SELECTORS = 'nav, form'

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function sanitizeHref(href: string | null): string {
  if (!href) return ''
  return /^https?:\/\//i.test(href) ? href : ''
}

function sanitizeImageSrc(src: string | null): string {
  if (!src) return ''
  return /^(https?:\/\/|data:image\/|blob:)/i.test(src) ? src : ''
}

function getContentRoot(container: Element): Element {
  const candidates = [
    ...CONTENT_ROOT_SELECTORS
      .map(selector => container.querySelector(selector))
      .filter((node): node is Element => Boolean(node)),
  ]

  const textCandidate = candidates
    .map(node => ({
      node,
      textLength: (node.textContent ?? '').replace(/\s+/g, ' ').trim().length,
    }))
    .sort((a, b) => b.textLength - a.textLength)[0]

  if (textCandidate && textCandidate.textLength > 0) {
    return textCandidate.node
  }
  return container
}

function getExtraImageHtml(container: Element, root: Element): string {
  const seen = new Set<string>()
  const images = Array.from(container.querySelectorAll('img'))

  return images
    .filter((img) => !root.contains(img))
    .filter((img) => !img.closest(EXTRA_IMAGE_SKIP_SELECTORS))
    .map((img) => {
      const src = sanitizeImageSrc(img.getAttribute('src'))
      if (!src || seen.has(src)) return ''
      seen.add(src)
      const alt = escapeHtml(img.getAttribute('alt') ?? '')
      return `<img src="${escapeHtml(src)}" alt="${alt}">`
    })
    .filter(Boolean)
    .join('')
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
      const src = sanitizeImageSrc(node.getAttribute('src'))
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
  const html = normalizeHtml(`${serializeNode(root)}${getExtraImageHtml(container, root)}`)
  const fallbackText = (container.textContent ?? '').replace(/\s+/g, ' ').trim()
  return {
    content: html || escapeHtml(fallbackText),
    format: 'html',
  }
}

export function createGeminiAdapter(): ChatSiteAdapter {
  return {
    id: 'gemini',

    getResponseContainers(): Element[] {
      const candidates = [...document.querySelectorAll(RESPONSE_SELECTORS)]
      const containers = candidates.map((node) => node.closest(RESPONSE_CONTAINER_SELECTORS) ?? node)
      return Array.from(new Set(containers))
    },

    getAllAssistantReplies(): CapturedReply[] {
      const containers = this.getResponseContainers()
      return containers.map(c => captureReply(c)).filter(reply => reply.content.length > 0)
    },

    readResponse(node: Node): CapturedReply {
      return captureReply(node as Element)
    },

    isGenerating(): boolean {
      const buttons = [...document.querySelectorAll<HTMLElement>('button')]
      return buttons.some(b => {
        const label = b.getAttribute('aria-label') ?? b.textContent ?? ''
        return STOP_RE.test(label)
      })
    },

    async stopGenerating(): Promise<boolean> {
      const buttons = [...document.querySelectorAll<HTMLElement>('button')]
      const stopBtn = buttons.find(b => {
        const label = b.getAttribute('aria-label') ?? b.textContent ?? ''
        return STOP_RE.test(label)
      })
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
        return /new chat|新对话|新しいチャット/i.test(text) ||
          /new chat|新对话|新しいチャット/i.test(label)
      })

      if (newChatBtn && isClickableButton(newChatBtn)) {
        newChatBtn.click()
        return true
      }

      location.href = 'https://gemini.google.com/app'
      return true
    },

    async fillAndSend(content: string, autoSend = true): Promise<void> {
      const editor = await waitForElement(EDITOR_SELECTORS, 10000)
      setContentEditableText(editor, content)
      if (!autoSend) return

      try {
        const sendBtn = await waitForClickableButton(SEND_BUTTON_SELECTORS, 5000, 'Send button not found')
        sendBtn.click()
      } catch {
        // Fallback: dispatch Enter key
        editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }))
        editor.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }))
        editor.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }))
      }
    },
  }
}

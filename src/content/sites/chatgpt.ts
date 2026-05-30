import type { CapturedReply, ChatSiteAdapter } from './types'
import { setContentEditableText } from '../contentEditable'
import { waitForElement, waitForClickableButton, isClickableButton } from './waitForElement'

const EDITOR_SELECTORS =
  'form[data-type="unified-composer"] #prompt-textarea[contenteditable="true"], #prompt-textarea.ProseMirror[contenteditable="true"]'

const SEND_BUTTON_SELECTORS =
  'button[data-testid="send-button"], button[aria-label*="发送"], button[aria-label*="Send"]'
const NEW_CHAT_SELECTORS =
  'a[href="/"], a[href="https://chatgpt.com/"], button[data-testid*="new-chat"], nav a[href="/"], nav button'

const RESPONSE_SELECTORS = '[data-message-author-role="assistant"]'

const TURN_SELECTORS =
  'section[data-turn="assistant"][data-testid^="conversation-turn-"], [data-turn="assistant"][data-testid^="conversation-turn-"]'

const ACTIVITY_INDICATORS =
  '.result-streaming[aria-busy="true"], [aria-busy="true"] .result-streaming, [data-testid*="thinking"], [data-testid*="reasoning"]'

const STOP_RE = /stop|stopping|停止|中止/i

const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'SVG'])
const CONTENT_ROOT_SELECTORS = [
  '.markdown',
  '.prose',
  '[data-testid="conversation-turn-"] .markdown',
  '[data-testid="conversation-turn-"] .prose',
]
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

export function createChatGptAdapter(): ChatSiteAdapter {
  return {
    id: 'chatgpt',

    getResponseContainers(): Element[] {
      const turns = [...document.querySelectorAll(TURN_SELECTORS)]
      if (turns.length > 0) return turns
      return [...document.querySelectorAll(RESPONSE_SELECTORS)]
    },

    getAllAssistantReplies(): CapturedReply[] {
      const containers = this.getResponseContainers()
      return containers.map(c => captureReply(c)).filter(reply => reply.content.length > 0)
    },

    readResponse(node: Node): CapturedReply {
      return captureReply(node as Element)
    },

    isGenerating(): boolean {
      // Look for stop button
      const buttons = [...document.querySelectorAll<HTMLElement>('button')]
      const hasStopButton = buttons.some(b => {
        const label = b.getAttribute('aria-label') ?? b.textContent ?? ''
        return STOP_RE.test(label)
      })
      if (hasStopButton) return true

      // Look for activity indicators
      return document.querySelector(ACTIVITY_INDICATORS) !== null
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
        const href = el instanceof HTMLAnchorElement ? el.href : ''
        return /new chat|新对话|新しいチャット/i.test(text) ||
          /new chat|新对话|新しいチャット/i.test(label) ||
          href === 'https://chatgpt.com/' ||
          href === 'https://chat.openai.com/'
      })

      if (newChatBtn && isClickableButton(newChatBtn)) {
        newChatBtn.click()
        return true
      }

      location.href = 'https://chatgpt.com/'
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

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
const CAROUSEL_SELECTOR = 'image-carousel'
const CAROUSEL_DOT_SELECTOR = '.carousel-dots .dot'
const CAROUSEL_PREV_SELECTOR = 'button[aria-label*="前"], button[aria-label*="previous"], button[aria-label*="Previous"]'
const CAROUSEL_NEXT_SELECTOR = 'button[aria-label*="次"], button[aria-label*="next"], button[aria-label*="Next"]'

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

function collectContainerImageHtml(container: Element): string {
  const seen = new Set<string>()
  const parts: string[] = []

  const addImage = (src: string, alt = ''): void => {
    const nextSrc = sanitizeImageSrc(src)
    if (!nextSrc || seen.has(nextSrc)) return
    seen.add(nextSrc)
    parts.push(`<img src="${escapeHtml(nextSrc)}" alt="${escapeHtml(alt)}">`)
  }

  for (const img of Array.from(container.querySelectorAll('img'))) {
    addImage((img as HTMLImageElement).currentSrc || img.getAttribute('src') || '', img.getAttribute('alt') ?? '')
    for (const src of extractUrlsFromSrcset(img.getAttribute('srcset'))) {
      addImage(src, img.getAttribute('alt') ?? '')
    }
  }

  for (const source of Array.from(container.querySelectorAll('source'))) {
    for (const src of extractUrlsFromSrcset(source.getAttribute('srcset'))) {
      addImage(src)
    }
  }

  const imageDataAttrs = ['data-src', 'data-image-src', 'data-image-url', 'data-full-image-url', 'data-thumbnail-url']
  for (const el of Array.from(container.querySelectorAll<HTMLElement>('*'))) {
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

function isButtonUsable(button: HTMLButtonElement | null): button is HTMLButtonElement {
  if (!button) return false
  return !button.disabled && button.getAttribute('aria-disabled') !== 'true'
}

function getCarouselActiveIndex(carousel: Element): number {
  const dots = Array.from(carousel.querySelectorAll(CAROUSEL_DOT_SELECTOR))
  const activeIndex = dots.findIndex(dot => dot.classList.contains('active'))
  return activeIndex >= 0 ? activeIndex : 0
}

function getCarouselImageUrls(carousel: Element): string[] {
  const fullSizeUrls: string[] = []
  const previewUrls: string[] = []
  const pushUrl = (target: string[], value: string | null): void => {
    const nextValue = sanitizeImageSrc(value)
    if (nextValue && !target.includes(nextValue)) {
      target.push(nextValue)
    }
  }

  for (const el of Array.from(carousel.querySelectorAll<HTMLElement>('[data-full-size-image-uri]'))) {
    pushUrl(fullSizeUrls, el.getAttribute('data-full-size-image-uri'))
  }

  if (fullSizeUrls.length > 0) {
    return fullSizeUrls
  }

  for (const img of Array.from(carousel.querySelectorAll<HTMLImageElement>('img'))) {
    pushUrl(previewUrls, img.currentSrc || img.getAttribute('src'))
    for (const src of extractUrlsFromSrcset(img.getAttribute('srcset'))) {
      pushUrl(previewUrls, src)
    }
  }

  return previewUrls
}

function buildImageHtml(urls: string[]): string {
  return urls
    .map(src => `<img src="${escapeHtml(src)}" alt="">`)
    .join('')
}

async function captureCarouselReply(container: Element): Promise<CapturedReply> {
  const carousel = container.querySelector(CAROUSEL_SELECTOR)
  if (!carousel) {
    return captureReply(container)
  }

  const root = getContentRoot(container)
  const originalIndex = getCarouselActiveIndex(carousel)
  const seenSlides = new Set<string>()
  const collectedUrls: string[] = []

  const addCurrentSlide = (): void => {
    const slideUrls = getCarouselImageUrls(carousel)
    const signature = slideUrls.join('|')
    if (!signature || seenSlides.has(signature)) return
    seenSlides.add(signature)
    for (const url of slideUrls) {
      if (!collectedUrls.includes(url)) {
        collectedUrls.push(url)
      }
    }
  }

  let prevGuard = 0
  while (prevGuard < 12) {
    const prevButton = carousel.querySelector<HTMLButtonElement>(CAROUSEL_PREV_SELECTOR)
    if (!isButtonUsable(prevButton)) break
    prevButton.click()
    await sleep(180)
    prevGuard += 1
  }

  addCurrentSlide()

  let nextGuard = 0
  while (nextGuard < 12) {
    const nextButton = carousel.querySelector<HTMLButtonElement>(CAROUSEL_NEXT_SELECTOR)
    if (!isButtonUsable(nextButton)) break
    nextButton.click()
    await sleep(180)
    addCurrentSlide()
    nextGuard += 1
  }

  const restoreSteps = Math.max(0, collectedUrls.length - 1 - originalIndex)
  for (let i = 0; i < restoreSteps; i += 1) {
    const prevButton = carousel.querySelector<HTMLButtonElement>(CAROUSEL_PREV_SELECTOR)
    if (!isButtonUsable(prevButton)) break
    prevButton.click()
    await sleep(120)
  }

  const html = normalizeHtml(`${serializeNode(root)}${buildImageHtml(collectedUrls) || collectContainerImageHtml(container)}`)
  const fallbackText = (container.textContent ?? '').replace(/\s+/g, ' ').trim()
  return {
    content: html || escapeHtml(fallbackText),
    format: 'html',
  }
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
      return ''
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
  const html = normalizeHtml(`${serializeNode(root)}${collectContainerImageHtml(container)}`)
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
      const uniqueContainers = Array.from(new Set(containers))
      return uniqueContainers
    },

    getAllAssistantReplies(): CapturedReply[] {
      const containers = this.getResponseContainers()
      return containers.map(c => captureReply(c)).filter(reply => reply.content.length > 0)
    },

    readResponse(node: Node): CapturedReply {
      return captureReply(node as Element)
    },

    async captureFinalReply(container: Element): Promise<CapturedReply | null> {
      return captureCarouselReply(container)
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

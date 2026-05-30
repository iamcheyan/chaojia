// src/chat/index.ts

import JSZip from 'jszip'
import hljs from 'highlight.js/lib/common'

type MessageContentFormat = 'text' | 'html'
type ThemeMode = 'wechat' | 'chatgpt-light' | 'chatgpt-dark'
type LanguageMode = 'zh-CN' | 'en' | 'ja'
type SiteRole = 'chatgpt' | 'gemini'

interface ChatSessionUrls {
  chatgpt?: string
  gemini?: string
}

interface ChatMessage {
  id: string
  role: 'user' | 'chatgpt' | 'gemini'
  content: string
  contentFormat?: MessageContentFormat
  timestamp: number
  isStreaming?: boolean
}

interface ChatHistory {
  id: string
  title: string
  messages: ChatMessage[]
  sessionUrls?: ChatSessionUrls
  createdAt: number
  updatedAt: number
}

const STORAGE_KEY = 'chaojia-history'
const PANEL_WIDTH_KEY = 'chaojia-chat-panel-width'
const THEME_KEY = 'chaojia-theme'
const LANGUAGE_KEY = 'chaojia-language'
const SIDEBAR_COLLAPSED_KEY = 'chaojia-sidebar-collapsed'
const ACTIVE_PROVIDERS_KEY = 'chaojia-active-providers'
const MAX_HISTORY = 50
const CHAT_PANEL_MIN_WIDTH = 360
const AI_PANEL_MIN_WIDTH = 320
const AI_PANEL_COLLAPSED_WIDTH = 64
const AI_PANEL_COLLAPSE_THRESHOLD = 180
const PANEL_RESIZER_WIDTH = 10

let currentChatId: string | null = null
let chatHistories: ChatHistory[] = []
let messages: ChatMessage[] = []

const messagesEl = document.getElementById('messages')!
const inputEl = document.getElementById('input') as HTMLTextAreaElement
const sendBtn = document.getElementById('send-btn') as HTMLButtonElement
const statusChatgpt = document.getElementById('status-chatgpt')!
const statusGemini = document.getElementById('status-gemini')!
const sidebarEl = document.getElementById('sidebar')!
const sidebarRailEl = document.getElementById('sidebar-rail') as HTMLDivElement
const sidebarCollapseBtn = document.getElementById('sidebar-collapse-btn') as HTMLButtonElement
const sidebarRailToggleBtn = document.getElementById('sidebar-rail-toggle') as HTMLButtonElement
const sidebarRailNewChatBtn = document.getElementById('sidebar-rail-new-chat') as HTMLButtonElement
const sidebarRailSearchBtn = document.getElementById('sidebar-rail-search') as HTMLButtonElement
const sidebarRailThemeBtn = document.getElementById('sidebar-rail-theme') as HTMLButtonElement
const overlayEl = document.getElementById('overlay')!
const menuBtn = document.getElementById('menu-btn')!
const closeSidebarBtn = document.getElementById('close-sidebar')!
const historyListEl = document.getElementById('history-list')!
const newChatBtn = document.getElementById('new-chat')!
const newChatLabelEl = document.getElementById('new-chat-label') as HTMLSpanElement
const sidebarNavSearchBtn = document.getElementById('sidebar-nav-search') as HTMLButtonElement
const sidebarNavSearchLabelEl = document.getElementById('sidebar-nav-search-label') as HTMLSpanElement
const sidebarSectionRecentEl = document.getElementById('sidebar-section-recent') as HTMLDivElement
const settingsToggleBtn = document.getElementById('settings-toggle') as HTMLButtonElement
const settingsPopoverEl = document.getElementById('settings-popover') as HTMLDivElement
const settingsProviderTitleEl = document.getElementById('settings-provider-title') as HTMLDivElement
const settingsThemeTitleEl = document.getElementById('settings-theme-title') as HTMLDivElement
const settingsLanguageTitleEl = document.getElementById('settings-language-title') as HTMLDivElement
const providerOptionsEl = document.getElementById('provider-options') as HTMLDivElement
const themeOptionsEl = document.getElementById('theme-options') as HTMLDivElement
const languageOptionsEl = document.getElementById('language-options') as HTMLDivElement
const searchOverlayEl = document.getElementById('search-overlay') as HTMLDivElement
const searchInputEl = document.getElementById('search-input') as HTMLInputElement
const searchCloseBtn = document.getElementById('search-close-btn') as HTMLButtonElement
const searchNewChatBtn = document.getElementById('search-new-chat-btn') as HTMLButtonElement
const searchNewChatLabelEl = document.getElementById('search-new-chat-label') as HTMLSpanElement
const searchHistoryGroupsEl = document.getElementById('search-history-groups') as HTMLDivElement
const layoutEl = document.getElementById('layout') as HTMLDivElement
const chatPanelEl = document.getElementById('chat-panel') as HTMLDivElement
const exportChatBtn = document.getElementById('export-chat-btn') as HTMLButtonElement
const aiPanelEl = document.getElementById('ai-panel') as HTMLDivElement
const chatgptFrameWrapperEl = document.getElementById('ai-frame-wrapper-chatgpt') as HTMLDivElement
const geminiFrameWrapperEl = document.getElementById('ai-frame-wrapper-gemini') as HTMLDivElement
const panelResizerEl = document.getElementById('panel-resizer') as HTMLDivElement
const chatgptFrameEl = document.getElementById('frame-chatgpt') as HTMLIFrameElement
const geminiFrameEl = document.getElementById('frame-gemini') as HTMLIFrameElement
const chatgptIconUrl = chrome.runtime.getURL('icons/chatgpt.png')
const geminiIconUrl = chrome.runtime.getURL('icons/gemini.png')
const DEFAULT_SITE_URLS: Record<SiteRole, string> = {
  chatgpt: 'https://chatgpt.com/',
  gemini: 'https://gemini.google.com/app',
}

const TRANSLATIONS: Record<LanguageMode, Record<string, string>> = {
  'zh-CN': {
    newChat: '新对话',
    searchChat: '搜索聊天',
    settings: '设置',
    recent: '最近',
    providers: '供应商',
    theme: '主题',
    language: '语言',
    providerAtLeastOne: '至少保留一个供应商',
    themeWechat: 'WeChat',
    themeChatGptLight: 'ChatGPT 亮色',
    themeChatGptDark: 'ChatGPT 深色',
    historyEmpty: '暂无历史消息',
    deleteChat: '删除对话',
    inputPlaceholder: '输入问题，同时发给 ChatGPT 和 Gemini...',
    send: '发送',
    labelYou: '你',
    statusReady: '就绪',
    statusGenerating: '生成中',
    statusError: '错误',
    statusOffline: '未连接',
    today: '今天',
    yesterday: '昨天',
    openSidebar: '打开侧边栏',
    collapseSidebar: '折叠侧边栏',
    closeSidebar: '关闭侧边栏',
    openSettings: '打开设置',
    closeSearch: '关闭搜索',
    downloadChat: '下载对话',
    searchPlaceholder: '搜索聊天...',
    noSearchResults: '没有找到相关历史记录',
    exportEmpty: '当前没有可下载的聊天内容',
    exportingChat: '正在打包对话...',
    exportFailed: '下载失败，请稍后重试',
    chatTitle: 'MultiChat - AI 聊天聚合器',
  },
  en: {
    newChat: 'New Chat',
    searchChat: 'Search',
    settings: 'Settings',
    recent: 'Recent',
    providers: 'Providers',
    theme: 'Theme',
    language: 'Language',
    providerAtLeastOne: 'Keep at least one provider enabled',
    themeWechat: 'WeChat',
    themeChatGptLight: 'ChatGPT Light',
    themeChatGptDark: 'ChatGPT Dark',
    historyEmpty: 'No chat history',
    deleteChat: 'Delete chat',
    inputPlaceholder: 'Ask something and send to ChatGPT and Gemini...',
    send: 'Send',
    labelYou: 'You',
    statusReady: 'Ready',
    statusGenerating: 'Generating',
    statusError: 'Error',
    statusOffline: 'Offline',
    today: 'Today',
    yesterday: 'Yesterday',
    openSidebar: 'Open sidebar',
    collapseSidebar: 'Collapse sidebar',
    closeSidebar: 'Close sidebar',
    openSettings: 'Open settings',
    closeSearch: 'Close search',
    downloadChat: 'Download chat',
    searchPlaceholder: 'Search chats...',
    noSearchResults: 'No matching chat history',
    exportEmpty: 'No chat content to export',
    exportingChat: 'Preparing chat export...',
    exportFailed: 'Export failed. Please try again.',
    chatTitle: 'MultiChat - AI Chat Aggregator',
  },
  ja: {
    newChat: '新しいチャット',
    searchChat: 'チャット検索',
    settings: '設定',
    recent: '最近',
    providers: 'プロバイダー',
    theme: 'テーマ',
    language: '言語',
    providerAtLeastOne: '少なくとも1つのプロバイダーを有効にしてください',
    themeWechat: 'WeChat',
    themeChatGptLight: 'ChatGPT ライト',
    themeChatGptDark: 'ChatGPT ダーク',
    historyEmpty: '履歴はまだありません',
    deleteChat: 'チャットを削除',
    inputPlaceholder: '入力して ChatGPT と Gemini に同時送信...',
    send: '送信',
    labelYou: 'あなた',
    statusReady: '準備完了',
    statusGenerating: '生成中',
    statusError: 'エラー',
    statusOffline: '未接続',
    today: '今日',
    yesterday: '昨日',
    openSidebar: 'サイドバーを開く',
    collapseSidebar: 'サイドバーを折りたたむ',
    closeSidebar: 'サイドバーを閉じる',
    openSettings: '設定を開く',
    closeSearch: '検索を閉じる',
    downloadChat: 'チャットをダウンロード',
    searchPlaceholder: 'チャットを検索...',
    noSearchResults: '一致する履歴がありません',
    exportEmpty: 'ダウンロードできるチャット内容がありません',
    exportingChat: 'チャットを書き出しています...',
    exportFailed: 'ダウンロードに失敗しました。もう一度お試しください。',
    chatTitle: 'MultiChat - AI チャットアグリゲーター',
  },
}

let currentTheme: ThemeMode = 'wechat'
let currentLanguage: LanguageMode = 'zh-CN'
let isSidebarCollapsed = false
let isExportingChat = false
let currentSessionUrls: ChatSessionUrls = {}
let activeProviders: Record<SiteRole, boolean> = {
  chatgpt: true,
  gemini: true,
}
const siteStatuses: Record<SiteRole, string> = {
  chatgpt: 'offline',
  gemini: 'offline',
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

// HTML 转义
function escapeHtml(text: string): string {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

function sanitizeAiHtml(html: string): string {
  const template = document.createElement('template')
  template.innerHTML = html

  const allowedTags = new Set([
    'A', 'ARTICLE', 'BLOCKQUOTE', 'BR', 'CODE', 'DIV', 'EM', 'H1', 'H2', 'H3',
    'H4', 'H5', 'H6', 'HR', 'I', 'IMG', 'LI', 'OL', 'P', 'PRE', 'SECTION', 'SPAN',
    'STRONG', 'TABLE', 'TBODY', 'TD', 'TH', 'THEAD', 'TR', 'UL',
  ])

  const sanitizeNode = (node: Node): void => {
    if (!(node instanceof HTMLElement)) return

    if (!allowedTags.has(node.tagName)) {
      const parent = node.parentNode
      if (!parent) return
      while (node.firstChild) parent.insertBefore(node.firstChild, node)
      parent.removeChild(node)
      return
    }

    for (const attr of Array.from(node.attributes)) {
      const normalizedValue = attr.value.trim()
      const keepHref = node.tagName === 'A' && attr.name === 'href' && /^https?:\/\//i.test(normalizedValue)
      const keepImgSrc = node.tagName === 'IMG' && attr.name === 'src' && /^(https?:\/\/|data:image\/|blob:)/i.test(normalizedValue)
      const keepImgAlt = node.tagName === 'IMG' && attr.name === 'alt'
      if (!keepHref && !keepImgSrc && !keepImgAlt) {
        node.removeAttribute(attr.name)
        continue
      }

      if ((keepHref || keepImgSrc) && normalizedValue !== attr.value) {
        node.setAttribute(attr.name, normalizedValue)
      }
    }

    if (node.tagName === 'A' && node.getAttribute('href')) {
      node.setAttribute('target', '_blank')
      node.setAttribute('rel', 'noreferrer noopener')
    }

    if (node.tagName === 'IMG' && node.getAttribute('src')) {
      node.setAttribute('loading', 'lazy')
      node.setAttribute('decoding', 'async')
    }

    for (const child of Array.from(node.childNodes)) {
      sanitizeNode(child)
    }
  }

  for (const child of Array.from(template.content.childNodes)) {
    sanitizeNode(child)
  }

  return template.innerHTML
}

function extractGalleryImageNodes(node: Node): HTMLImageElement[] {
  if (!(node instanceof HTMLElement)) return []
  if (node.classList.contains('message-image-row') || node.classList.contains('message-image-card')) return []
  if (node.tagName === 'IMG') return [node as HTMLImageElement]

  if (node.childElementCount === 1 && node.firstElementChild instanceof HTMLImageElement) {
    const text = (node.textContent ?? '').trim()
    if (!text) return [node.firstElementChild]
  }

  const images = Array.from(node.querySelectorAll<HTMLImageElement>('img'))
  if (images.length > 0) {
    const cloned = node.cloneNode(true) as HTMLElement
    for (const image of Array.from(cloned.querySelectorAll('img'))) {
      image.remove()
    }
    const text = (cloned.textContent ?? '').trim()
    if (!text) return images
  }

  return []
}

function removeEmptyImageWrappers(container: HTMLElement): void {
  const elements = Array.from(container.querySelectorAll<HTMLElement>('*')).reverse()
  for (const element of elements) {
    if (element.tagName === 'IMG') continue
    if (element.classList.contains('message-image-row') || element.classList.contains('message-image-card')) continue
    if (element.querySelector('.message-image-row, .message-image-card')) continue
    if (element.querySelector('img')) continue
    if ((element.textContent ?? '').trim()) continue
    element.remove()
  }
}

function promoteWrappedImageGallery(container: HTMLElement): void {
  const children = Array.from(container.children) as HTMLElement[]
  for (const child of children) {
    if (child.classList.contains('message-image-row') || child.classList.contains('message-image-card')) continue

    const images = Array.from(child.querySelectorAll<HTMLImageElement>('img'))
      .filter(image => !image.closest('.message-image-row, .message-image-card'))

    if (images.length >= 2) {
      const clone = child.cloneNode(true) as HTMLElement
      for (const image of Array.from(clone.querySelectorAll('img'))) {
        image.remove()
      }
      const remainingText = (clone.textContent ?? '').trim()

      if (remainingText) {
        const rowEl = document.createElement('div')
        rowEl.className = 'message-image-row'
        child.insertBefore(rowEl, child.firstChild)

        for (const image of images) {
          const cardEl = document.createElement('div')
          cardEl.className = 'message-image-card'
          rowEl.appendChild(cardEl)
          cardEl.appendChild(image)
        }

        removeEmptyImageWrappers(child)
      }
    }

    promoteWrappedImageGallery(child)
  }
}

function mergeAdjacentImageRows(container: HTMLElement): void {
  const children = Array.from(container.children) as HTMLElement[]
  let currentRow: HTMLElement | null = null

  for (const child of children) {
    if (child.classList.contains('message-image-row')) {
      if (!currentRow) {
        currentRow = child
        continue
      }

      while (child.firstChild) {
        currentRow.appendChild(child.firstChild)
      }
      child.remove()
      continue
    }

    currentRow = null
    mergeAdjacentImageRows(child)
  }
}

function layoutMessageImagesInContainer(container: HTMLElement): void {
  if (container.classList.contains('message-image-row') || container.classList.contains('message-image-card')) return

  const nodes = Array.from(container.childNodes)
  let currentGroup: { source: HTMLElement, image: HTMLImageElement, removeSource: boolean }[] = []

  const flushGroup = (): void => {
    if (currentGroup.length === 0) {
      currentGroup = []
      return
    }

    const anchorEl = currentGroup[0].source
    if (!anchorEl.isConnected || anchorEl.parentElement !== container) {
      currentGroup = []
      return
    }

    const rowEl = document.createElement('div')
    rowEl.className = 'message-image-row'
    container.insertBefore(rowEl, anchorEl)
    const sourcesToRemove = new Set<HTMLElement>()

    for (const item of currentGroup) {
      const cardEl = document.createElement('div')
      cardEl.className = 'message-image-card'
      rowEl.appendChild(cardEl)
      cardEl.appendChild(item.image)
      if (item.removeSource) {
        sourcesToRemove.add(item.source)
      }
    }

    for (const source of sourcesToRemove) {
      if (source.isConnected && source.parentElement === container) {
        source.remove()
      }
    }

    currentGroup = []
  }

  for (const node of nodes) {
    const images = extractGalleryImageNodes(node)
    if (images.length > 0 && node instanceof HTMLElement && node.parentElement === container) {
      for (const image of images) {
        currentGroup.push({
          source: node,
          image,
          removeSource: node !== image,
        })
      }
      continue
    }

    flushGroup()
  }

  flushGroup()

  const children = Array.from(container.children) as HTMLElement[]
  for (const child of children) {
    layoutMessageImagesInContainer(child)
  }
}

function layoutMessageImages(contentEl: HTMLElement): void {
  promoteWrappedImageGallery(contentEl)
  layoutMessageImagesInContainer(contentEl)
  mergeAdjacentImageRows(contentEl)
}

function highlightCodeBlocks(contentEl: HTMLElement): void {
  const codeBlocks = contentEl.querySelectorAll<HTMLElement>('pre code')
  for (const codeEl of codeBlocks) {
    const rawCode = codeEl.textContent ?? ''
    if (!rawCode.trim()) continue

    const languageClass = Array.from(codeEl.classList).find(className => className.startsWith('language-'))
    const preferredLanguage = languageClass?.slice('language-'.length)
    const result = preferredLanguage && hljs.getLanguage(preferredLanguage)
      ? hljs.highlight(rawCode, { language: preferredLanguage, ignoreIllegals: true })
      : hljs.highlightAuto(rawCode)

    codeEl.innerHTML = result.value
    codeEl.classList.add('hljs')
    if (result.language) {
      codeEl.dataset.language = result.language
      codeEl.parentElement?.setAttribute('data-language', result.language)
    }
  }
}

function renderAiContent(contentEl: HTMLElement, content: string, contentFormat: MessageContentFormat): void {
  contentEl.innerHTML = contentFormat === 'html'
    ? sanitizeAiHtml(content)
    : simpleMarkdown(content)
  highlightCodeBlocks(contentEl)
  layoutMessageImages(contentEl)
}

function sanitizeFileName(name: string): string {
  return name
    .trim()
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, '')
    .slice(0, 12) || 'chat'
}

function buildExportTimestamp(date = new Date()): string {
  const pad = (value: number, length = 2): string => String(value).padStart(length, '0')
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    '-',
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
    pad(date.getMilliseconds(), 3),
  ].join('')
}

function buildExportFileName(title: string): string {
  return `${sanitizeFileName(title)}-${buildExportTimestamp()}.zip`
}

function inferImageExtension(url: string): string {
  try {
    const parsed = new URL(url)
    if (parsed.hostname.endsWith('images.openai.com')) {
      return '.jpg'
    }
    const pathname = parsed.pathname.toLowerCase()
    const extMatch = pathname.match(/\.(png|jpe?g|gif|webp|bmp|svg)$/)
    if (extMatch) return extMatch[0]
  } catch {}
  return '.png'
}

function pickExportImageSource(src: string, alt: string): { src: string, alt: string } {
  const normalizedSrc = src.trim()
  const normalizedAlt = alt.trim()
  let preferredSrc = normalizedSrc

  try {
    const altUrl = new URL(normalizedAlt)
    if ((altUrl.protocol === 'https:' || altUrl.protocol === 'http:')
      && /(?:^|[?&])purpose=fullsize(?:&|$)/.test(altUrl.search)) {
      preferredSrc = altUrl.toString()
    }
  } catch {}

  return {
    src: preferredSrc,
    alt: normalizedAlt && !/^https?:\/\//i.test(normalizedAlt) ? normalizedAlt : 'image',
  }
}

function getCurrentChatTitle(): string {
  const currentChat = chatHistories.find(chat => chat.id === currentChatId)
  if (currentChat?.title) return currentChat.title
  const firstUserMessage = messages.find(message => message.role === 'user')?.content
  return firstUserMessage?.slice(0, 30) || 'chat'
}

function getRoleDisplayName(role: ChatMessage['role']): string {
  if (role === 'user') return t('labelYou')
  return role === 'chatgpt' ? 'ChatGPT' : 'Gemini'
}

function downloadBlobFile(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function setExportButtonState(exporting: boolean): void {
  isExportingChat = exporting
  exportChatBtn.disabled = exporting
  exportChatBtn.classList.toggle('is-loading', exporting)
  exportChatBtn.title = exporting ? t('exportingChat') : t('downloadChat')
  exportChatBtn.setAttribute('aria-label', exporting ? t('exportingChat') : t('downloadChat'))
}

function convertHtmlToMarkdown(
  html: string,
  registerImage: (src: string, alt: string) => string,
): string {
  const template = document.createElement('template')
  template.innerHTML = sanitizeAiHtml(html)

  const convertNode = (node: Node, listDepth = 0): string => {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent ?? ''
    }
    if (!(node instanceof HTMLElement)) return ''

    const text = Array.from(node.childNodes).map(child => convertNode(child, listDepth)).join('')
    switch (node.tagName) {
      case 'BR':
        return '\n'
      case 'P':
      case 'DIV':
      case 'SECTION':
      case 'ARTICLE': {
        const value = text.trim()
        return value ? `${value}\n\n` : ''
      }
      case 'STRONG':
      case 'B':
        return `**${text.trim()}**`
      case 'EM':
      case 'I':
        return `*${text.trim()}*`
      case 'A': {
        const href = node.getAttribute('href') ?? ''
        const label = text.trim() || href
        return href ? `[${label}](${href})` : label
      }
      case 'IMG': {
        const src = node.getAttribute('src')?.trim() ?? ''
        if (!src) return ''
        const alt = node.getAttribute('alt')?.trim() ?? ''
        const preferred = pickExportImageSource(src, alt)
        const path = registerImage(preferred.src, preferred.alt)
        return path ? `![${preferred.alt}](${path})\n\n` : ''
      }
      case 'PRE': {
        const codeText = node.textContent?.replace(/\n$/, '') ?? ''
        return codeText ? `\`\`\`\n${codeText}\n\`\`\`\n\n` : ''
      }
      case 'CODE':
        return node.closest('pre') ? text : `\`${text.trim()}\``
      case 'UL': {
        const items = Array.from(node.children)
          .map(child => child instanceof HTMLElement ? `${'  '.repeat(listDepth)}- ${convertNode(child, listDepth + 1).trim()}` : '')
          .filter(Boolean)
        return items.length > 0 ? `${items.join('\n')}\n\n` : ''
      }
      case 'OL': {
        const items = Array.from(node.children)
          .map((child, index) => child instanceof HTMLElement ? `${'  '.repeat(listDepth)}${index + 1}. ${convertNode(child, listDepth + 1).trim()}` : '')
          .filter(Boolean)
        return items.length > 0 ? `${items.join('\n')}\n\n` : ''
      }
      case 'LI':
        return text.replace(/\n{3,}/g, '\n\n').trim()
      case 'BLOCKQUOTE': {
        const value = text.trim()
        return value ? `${value.split('\n').map(line => `> ${line}`).join('\n')}\n\n` : ''
      }
      case 'H1':
      case 'H2':
      case 'H3':
      case 'H4':
      case 'H5':
      case 'H6': {
        const level = Number(node.tagName.slice(1))
        return `${'#'.repeat(level)} ${text.trim()}\n\n`
      }
      case 'HR':
        return '---\n\n'
      default:
        return text
    }
  }

  return Array.from(template.content.childNodes)
    .map(node => convertNode(node).trimEnd())
    .filter(Boolean)
    .join('\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

async function exportCurrentChat(): Promise<void> {
  if (messages.length === 0) {
    window.alert(t('exportEmpty'))
    return
  }

  setExportButtonState(true)
  try {
    const zip = new JSZip()
    const imageEntries = new Map<string, { path: string, alt: string }>()
    let imageIndex = 0

    const registerImage = (src: string, alt: string): string => {
      if (!imageEntries.has(src)) {
        imageIndex += 1
        imageEntries.set(src, {
          path: `images/image-${String(imageIndex).padStart(3, '0')}${inferImageExtension(src)}`,
          alt,
        })
      }
      return imageEntries.get(src)?.path ?? ''
    }

    const markdownParts = [
      `# ${getCurrentChatTitle()}`,
      '',
      `- Exported At: ${new Date().toISOString()}`,
      '',
    ]

    for (const message of messages) {
      markdownParts.push(`## ${getRoleDisplayName(message.role)}`)
      markdownParts.push('')

      if (message.role === 'user' || message.contentFormat !== 'html') {
        markdownParts.push(message.content.trim())
      } else {
        markdownParts.push(convertHtmlToMarkdown(message.content, registerImage))
      }

      markdownParts.push('')
    }

    zip.file('chat.md', markdownParts.join('\n').replace(/\n{3,}/g, '\n\n').trim())

    for (const [src, entry] of imageEntries) {
      try {
        const response = await fetch(src)
        if (!response.ok) continue
        const blob = await response.blob()
        zip.file(entry.path, blob)
      } catch {}
    }

    const archiveBlob = await zip.generateAsync({ type: 'blob' })
    const fileName = buildExportFileName(getCurrentChatTitle())
    downloadBlobFile(archiveBlob, fileName)
  } catch (error) {
    console.error('Failed to export chat:', error)
    window.alert(t('exportFailed'))
  } finally {
    setExportButtonState(false)
  }
}

// 简单但可靠的 Markdown 解析器
function simpleMarkdown(text: string): string {
  if (!text) return ''
  
  let html = ''
  const lines = text.split('\n')
  let inCodeBlock = false
  let codeBlockContent = ''
  let inList = false
  let inParagraph = false
  
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i]
    
    // 代码块开始/结束
    if (line.trim().startsWith('```')) {
      // 如果在段落中，先关闭段落
      if (inParagraph) {
        html += '</p>'
        inParagraph = false
      }
      // 如果在列表中，先关闭列表
      if (inList) {
        html += '</ul>'
        inList = false
      }
      
      if (inCodeBlock) {
        html += `<pre><code>${escapeHtml(codeBlockContent.trim())}</code></pre>`
        inCodeBlock = false
        codeBlockContent = ''
      } else {
        inCodeBlock = true
        codeBlockContent = ''
      }
      continue
    }
    
    if (inCodeBlock) {
      codeBlockContent += line + '\n'
      continue
    }
    
    // 空行
    if (line.trim() === '') {
      if (inParagraph) {
        html += '</p>'
        inParagraph = false
      }
      if (inList) {
        html += '</ul>'
        inList = false
      }
      continue
    }
    
    // 列表项
    const listMatch = line.match(/^(\s*[-*+]|\s*\d+\.)\s+(.*)$/)
    if (listMatch) {
      if (inParagraph) {
        html += '</p>'
        inParagraph = false
      }
      if (!inList) {
        html += '<ul>'
        inList = true
      }
      let content = listMatch[2]
      content = processInlineMarkdown(content)
      html += `<li>${content}</li>`
      continue
    }
    
    // 不是列表项但在列表中，结束列表
    if (inList) {
      html += '</ul>'
      inList = false
    }
    
    // 标题
    if (line.trim().startsWith('### ')) {
      if (inParagraph) {
        html += '</p>'
        inParagraph = false
      }
      let content = line.trim().substring(4)
      content = processInlineMarkdown(content)
      html += `<h3>${content}</h3>`
      continue
    }
    if (line.trim().startsWith('## ')) {
      if (inParagraph) {
        html += '</p>'
        inParagraph = false
      }
      let content = line.trim().substring(3)
      content = processInlineMarkdown(content)
      html += `<h2>${content}</h2>`
      continue
    }
    if (line.trim().startsWith('# ')) {
      if (inParagraph) {
        html += '</p>'
        inParagraph = false
      }
      let content = line.trim().substring(2)
      content = processInlineMarkdown(content)
      html += `<h1>${content}</h1>`
      continue
    }
    
    // 引用
    if (line.trim().startsWith('> ')) {
      if (inParagraph) {
        html += '</p>'
        inParagraph = false
      }
      let content = line.trim().substring(2)
      content = processInlineMarkdown(content)
      html += `<blockquote>${content}</blockquote>`
      continue
    }
    
    // 分隔线
    if (line.trim() === '---') {
      if (inParagraph) {
        html += '</p>'
        inParagraph = false
      }
      html += '<hr>'
      continue
    }
    
    // 普通段落
    if (!inParagraph) {
      html += '<p>'
      inParagraph = true
    } else {
      html += ' '
    }
    line = processInlineMarkdown(line)
    html += line
  }
  
  // 清理未闭合的标签
  if (inCodeBlock) {
    html += `<pre><code>${escapeHtml(codeBlockContent.trim())}</code></pre>`
  }
  if (inList) {
    html += '</ul>'
  }
  if (inParagraph) {
    html += '</p>'
  }
  
  return html
}

// 处理内联 Markdown（粗体、斜体、行内代码、链接）
function processInlineMarkdown(text: string): string {
  let result = text
  
  // 行内代码 - 先处理，防止被其他格式影响
  result = result.replace(/`([^`]+)`/g, (_, code) => {
    return `<code>${escapeHtml(code)}</code>`
  })
  
  // 链接 [text](url)
  result = result.replace(/\[([^\]]*)\]\(([^)]*)\)/g, (_, linkText, url) => {
    return `<a href="${escapeHtml(url)}" target="_blank">${escapeHtml(linkText)}</a>`
  })
  
  // 粗体 **text**
  result = result.replace(/\*\*([^*]+)\*\*/g, (_, content) => {
    return `<strong>${escapeHtml(content)}</strong>`
  })
  
  // 斜体 *text* - 在粗体之后处理，避免冲突
  result = result.replace(/\*([^*]+)\*/g, (_, content) => {
    return `<em>${escapeHtml(content)}</em>`
  })
  
  // 剩余内容转义 HTML
  // 但不要转义已经处理过的 HTML 标签
  // 简单处理：只转义没有被标签包围的部分
  // 这里我们假设除了我们自己添加的标签外，其他都是纯文本
  result = result.split(/(<[^>]+>)/g).map(part => {
    if (part.startsWith('<') && part.endsWith('>')) {
      return part // 已经是 HTML 标签，不转义
    }
    return escapeHtml(part)
  }).join('')
  
  return result
}

// 格式化时间
function formatTime(timestamp: number): string {
  const date = new Date(timestamp)
  const now = new Date()
  const locale = currentLanguage === 'ja' ? 'ja-JP' : currentLanguage === 'en' ? 'en-US' : 'zh-CN'
  
  // 今天
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
  }
  
  // 昨天
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  if (date.toDateString() === yesterday.toDateString()) {
    return `${t('yesterday')} ${date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}`
  }
  
  // 今年
  if (date.getFullYear() === now.getFullYear()) {
    return `${date.getMonth() + 1}月${date.getDate()}日`
  }
  
  // 往年
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`
}

function t(key: keyof typeof TRANSLATIONS['zh-CN']): string {
  return TRANSLATIONS[currentLanguage][key] ?? TRANSLATIONS['zh-CN'][key] ?? key
}

function renderLanguageOptions(): void {
  const options = languageOptionsEl.querySelectorAll<HTMLButtonElement>('.language-option')
  for (const option of options) {
    option.classList.toggle('active', option.dataset.language === currentLanguage)
  }
}

function isProviderEnabled(site: SiteRole): boolean {
  return activeProviders[site] !== false
}

function getEnabledProviders(): SiteRole[] {
  return (Object.keys(activeProviders) as SiteRole[]).filter(isProviderEnabled)
}

function renderProviderOptions(): void {
  const options = providerOptionsEl.querySelectorAll<HTMLButtonElement>('.provider-option')
  for (const option of options) {
    const site = option.dataset.provider as SiteRole | undefined
    if (!site) continue
    option.classList.toggle('active', isProviderEnabled(site))
    option.setAttribute('aria-pressed', String(isProviderEnabled(site)))
  }
}

function applyProviderVisibility(): void {
  chatgptFrameWrapperEl.hidden = !isProviderEnabled('chatgpt')
  geminiFrameWrapperEl.hidden = !isProviderEnabled('gemini')
  statusChatgpt.hidden = !isProviderEnabled('chatgpt')
  statusGemini.hidden = !isProviderEnabled('gemini')
  aiPanelEl.classList.toggle('single-provider', getEnabledProviders().length === 1)
}

function saveActiveProviders(): void {
  try {
    localStorage.setItem(ACTIVE_PROVIDERS_KEY, JSON.stringify(activeProviders))
  } catch (e) {
    console.error('Failed to save active providers:', e)
  }
}

function setProviderEnabled(site: SiteRole, enabled: boolean): void {
  if (!enabled && getEnabledProviders().length === 1) {
    return
  }

  activeProviders = {
    ...activeProviders,
    [site]: enabled,
  }

  renderProviderOptions()
  applyProviderVisibility()
  saveActiveProviders()
}

function initializeActiveProviders(): void {
  try {
    const stored = localStorage.getItem(ACTIVE_PROVIDERS_KEY)
    if (!stored) return
    const parsed = JSON.parse(stored) as Partial<Record<SiteRole, boolean>>
    activeProviders = {
      chatgpt: parsed.chatgpt !== false,
      gemini: parsed.gemini !== false,
    }
    if (getEnabledProviders().length === 0) {
      activeProviders.chatgpt = true
    }
  } catch (e) {
    console.error('Failed to load active providers:', e)
  }
}

function updateStaticTexts(): void {
  document.documentElement.lang = currentLanguage
  document.title = t('chatTitle')
  newChatLabelEl.textContent = t('newChat')
  sidebarNavSearchLabelEl.textContent = t('searchChat')
  sidebarSectionRecentEl.textContent = t('recent')
  settingsProviderTitleEl.textContent = t('providers')
  settingsThemeTitleEl.textContent = t('theme')
  settingsLanguageTitleEl.textContent = t('language')
  inputEl.placeholder = t('inputPlaceholder')
  sendBtn.textContent = t('send')
  settingsToggleBtn.title = t('openSettings')
  sidebarCollapseBtn.title = t('collapseSidebar')
  closeSidebarBtn.title = t('closeSidebar')
  searchInputEl.placeholder = t('searchPlaceholder')
  searchCloseBtn.title = t('closeSearch')
  searchCloseBtn.setAttribute('aria-label', t('closeSearch'))
  searchNewChatLabelEl.textContent = t('newChat')
  sidebarRailToggleBtn.title = t('openSidebar')
  sidebarRailNewChatBtn.title = t('newChat')
  sidebarRailSearchBtn.title = t('searchChat')
  sidebarRailThemeBtn.title = t('settings')
  if (!isExportingChat) {
    exportChatBtn.title = t('downloadChat')
    exportChatBtn.setAttribute('aria-label', t('downloadChat'))
  }

  const themeButtons = themeOptionsEl.querySelectorAll<HTMLButtonElement>('.theme-option')
  for (const button of themeButtons) {
    if (button.dataset.theme === 'wechat') button.title = t('themeWechat')
    if (button.dataset.theme === 'chatgpt-light') button.title = t('themeChatGptLight')
    if (button.dataset.theme === 'chatgpt-dark') button.title = t('themeChatGptDark')
  }
}

function applyLanguage(language: LanguageMode): void {
  currentLanguage = language
  updateStaticTexts()
  renderProviderOptions()
  renderThemeOptions()
  renderLanguageOptions()
  renderHistoryList()
  renderSearchResults(searchInputEl.value.trim())
  renderMessages()
  updateStatus('chatgpt', siteStatuses.chatgpt)
  updateStatus('gemini', siteStatuses.gemini)

  try {
    localStorage.setItem(LANGUAGE_KEY, language)
  } catch (e) {
    console.error('Failed to save language:', e)
  }
}

function initializeLanguage(): void {
  try {
    const stored = localStorage.getItem(LANGUAGE_KEY)
    if (stored === 'zh-CN' || stored === 'en' || stored === 'ja') {
      currentLanguage = stored
    }
  } catch (e) {
    console.error('Failed to load language:', e)
  }
}

// 从存储加载历史
function loadHistory(): void {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      chatHistories = JSON.parse(stored).map((chat: ChatHistory) => ({
        ...chat,
        sessionUrls: chat.sessionUrls ?? {},
      }))
    }
  } catch (e) {
    console.error('Failed to load history:', e)
    chatHistories = []
  }
}

// 保存历史到存储
function saveHistory(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(chatHistories))
  } catch (e) {
    console.error('Failed to save history:', e)
  }
}

// 保存当前对话
function saveCurrentChat(): void {
  if (!currentChatId || messages.length === 0) return
  
  const existingIndex = chatHistories.findIndex(h => h.id === currentChatId)
  const userMessages = messages.filter(m => m.role === 'user')
  const title = userMessages.length > 0 ? userMessages[0].content.substring(0, 30) : t('newChat')
  
  if (existingIndex >= 0) {
    chatHistories[existingIndex].messages = [...messages]
    chatHistories[existingIndex].sessionUrls = { ...currentSessionUrls }
    chatHistories[existingIndex].updatedAt = Date.now()
    chatHistories[existingIndex].title = title
    // 移到最前面
    const [chat] = chatHistories.splice(existingIndex, 1)
    chatHistories.unshift(chat)
  } else {
    const newChat: ChatHistory = {
      id: currentChatId,
      title,
      messages: [...messages],
      sessionUrls: { ...currentSessionUrls },
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
    chatHistories.unshift(newChat)
    // 限制数量
    if (chatHistories.length > MAX_HISTORY) {
      chatHistories = chatHistories.slice(0, MAX_HISTORY)
    }
  }
  
  saveHistory()
  renderHistoryList()
}

// 渲染历史列表
function renderHistoryList(): void {
  historyListEl.innerHTML = ''
  
  if (chatHistories.length === 0) {
    historyListEl.innerHTML = `<div class="history-empty">${t('historyEmpty')}</div>`
    return
  }
  
  for (const chat of chatHistories) {
    const itemEl = document.createElement('div')
    itemEl.className = `history-item ${chat.id === currentChatId ? 'active' : ''}`
    itemEl.dataset.id = chat.id
    
    itemEl.innerHTML = `
      <div class="history-item-main">
        <div class="history-item-title">${escapeHtml(chat.title)}</div>
        <button class="history-item-delete" data-id="${chat.id}" aria-label="${t('deleteChat')}">×</button>
      </div>
      <div class="history-item-time">${formatTime(chat.updatedAt)}</div>
    `
    
    itemEl.addEventListener('click', (e) => {
      const target = e.target as HTMLElement
      if (target.classList.contains('history-item-delete')) {
        e.stopPropagation()
        deleteChat(chat.id)
      } else {
        loadChat(chat.id)
      }
    })
    
    historyListEl.appendChild(itemEl)
  }
}

function normalizeSearchText(text: string): string {
  return text.trim().toLocaleLowerCase()
}

function formatSearchGroupLabel(timestamp: number): string {
  const date = new Date(timestamp)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
  const diffDays = Math.round((today - target) / 86400000)

  if (diffDays === 0) return t('today')
  if (diffDays === 1) return t('yesterday')

  const locale = currentLanguage === 'ja' ? 'ja-JP' : currentLanguage === 'en' ? 'en-US' : 'zh-CN'
  return date.toLocaleDateString(locale, {
    month: 'long',
    day: 'numeric',
  })
}

function getSearchableChatText(chat: ChatHistory): string {
  const parts = [chat.title]
  for (const message of chat.messages) {
    parts.push(message.content)
  }
  return normalizeSearchText(parts.join('\n'))
}

function renderSearchResults(query: string): void {
  const normalizedQuery = normalizeSearchText(query)
  const filteredChats = normalizedQuery
    ? chatHistories.filter(chat => getSearchableChatText(chat).includes(normalizedQuery))
    : [...chatHistories]

  searchHistoryGroupsEl.innerHTML = ''

  if (filteredChats.length === 0) {
    searchHistoryGroupsEl.innerHTML = `<div class="search-empty">${escapeHtml(t('noSearchResults'))}</div>`
    return
  }

  let currentGroupLabel = ''
  let currentGroupEl: HTMLDivElement | null = null

  for (const chat of filteredChats) {
    const groupLabel = formatSearchGroupLabel(chat.updatedAt)
    if (groupLabel !== currentGroupLabel) {
      currentGroupLabel = groupLabel
      currentGroupEl = document.createElement('div')
      currentGroupEl.className = 'search-group'
      currentGroupEl.innerHTML = `<div class="search-group-title">${escapeHtml(groupLabel)}</div>`
      searchHistoryGroupsEl.appendChild(currentGroupEl)
    }

    const button = document.createElement('button')
    button.type = 'button'
    button.className = `search-history-item ${chat.id === currentChatId ? 'active' : ''}`
    button.dataset.id = chat.id
    button.innerHTML = `
      <span class="search-history-item-icon" aria-hidden="true">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 11.5a8.5 8.5 0 1 1-4.17-7.34"></path>
          <path d="M8 19l-3 2 .9-3.6"></path>
        </svg>
      </span>
      <span class="search-history-item-text">${escapeHtml(chat.title)}</span>
    `
    button.addEventListener('click', () => {
      closeSearchOverlay()
      loadChat(chat.id)
    })
    currentGroupEl?.appendChild(button)
  }
}

function openSearchOverlay(): void {
  toggleSettingsPopover(false)
  closeSidebar()
  searchOverlayEl.hidden = false
  searchOverlayEl.classList.add('open')
  renderSearchResults(searchInputEl.value.trim())
  requestAnimationFrame(() => {
    searchInputEl.focus()
    searchInputEl.select()
  })
}

function closeSearchOverlay(): void {
  searchOverlayEl.classList.remove('open')
  searchOverlayEl.hidden = true
}

function navigateSiteFrame(site: SiteRole, url?: string, forceReload = false): void {
  const targetUrl = url || DEFAULT_SITE_URLS[site]
  const frame = site === 'chatgpt' ? chatgptFrameEl : geminiFrameEl
  if (forceReload) {
    frame.src = 'about:blank'
    requestAnimationFrame(() => {
      frame.src = withReloadNonce(targetUrl)
    })
    return
  }

  if (frame.src !== targetUrl) {
    frame.src = targetUrl
  }
}

function applySessionUrls(sessionUrls?: ChatSessionUrls): void {
  const shouldForceReload = !sessionUrls?.chatgpt && !sessionUrls?.gemini
  navigateSiteFrame('chatgpt', sessionUrls?.chatgpt, shouldForceReload)
  navigateSiteFrame('gemini', sessionUrls?.gemini, shouldForceReload)
}

function updateCurrentSessionUrl(site: SiteRole, pageUrl?: string): void {
  if (!pageUrl || !/^https?:\/\//i.test(pageUrl)) return
  currentSessionUrls = {
    ...currentSessionUrls,
    [site]: pageUrl,
  }

  const currentChat = chatHistories.find(h => h.id === currentChatId)
  if (currentChat) {
    currentChat.sessionUrls = { ...currentSessionUrls }
    saveHistory()
  }
}

// 加载对话
function loadChat(chatId: string): void {
  const chat = chatHistories.find(h => h.id === chatId)
  if (!chat) return
  
  currentChatId = chatId
  messages = [...chat.messages]
  currentSessionUrls = { ...(chat.sessionUrls ?? {}) }
  renderMessages()
  applySessionUrls(chat.sessionUrls)
  toggleSettingsPopover(false)
  closeSearchOverlay()
  closeSidebar()
  renderHistoryList()
}

// 删除对话
function deleteChat(chatId: string): void {
  chatHistories = chatHistories.filter(h => h.id !== chatId)
  saveHistory()
  renderHistoryList()
  
  if (currentChatId === chatId) {
    createNewChat()
  }
}

// 创建新对话
function createNewChat(): void {
  const enabledProviders = getEnabledProviders()
  currentChatId = generateId()
  messages = []
  currentSessionUrls = {}
  renderMessages()
  applySessionUrls()
  toggleSettingsPopover(false)
  closeSearchOverlay()
  renderHistoryList()
  chrome.runtime.sendMessage({ type: 'START_NEW_CHAT', activeSites: enabledProviders })
}

// 打开侧边栏
function openSidebar(): void {
  if (currentTheme !== 'wechat') {
    setSidebarCollapsed(false)
    return
  }
  sidebarEl.classList.add('open')
  overlayEl.classList.add('open')
  renderHistoryList()
}

// 关闭侧边栏
function closeSidebar(): void {
  sidebarEl.classList.remove('open')
  overlayEl.classList.remove('open')
}

function toggleSettingsPopover(force?: boolean): void {
  const nextState = typeof force === 'boolean' ? force : !settingsPopoverEl.classList.contains('open')
  settingsPopoverEl.classList.toggle('open', nextState)
  settingsToggleBtn.classList.toggle('active', nextState)
}

function setSidebarCollapsed(collapsed: boolean): void {
  isSidebarCollapsed = collapsed
  document.body.classList.toggle('sidebar-collapsed', collapsed)
  sidebarEl.classList.toggle('collapsed', collapsed)
  sidebarRailEl.setAttribute('aria-hidden', String(!collapsed))

  try {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? '1' : '0')
  } catch (e) {
    console.error('Failed to save sidebar collapsed state:', e)
  }
}

function initializeSidebarCollapsedState(): void {
  try {
    isSidebarCollapsed = localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1'
  } catch (e) {
    console.error('Failed to load sidebar collapsed state:', e)
    isSidebarCollapsed = false
  }

  setSidebarCollapsed(isSidebarCollapsed)
}

function renderThemeOptions(): void {
  const options = themeOptionsEl.querySelectorAll<HTMLButtonElement>('.theme-option')
  for (const option of options) {
    option.classList.toggle('active', option.dataset.theme === currentTheme)
  }
}

function applyTheme(theme: ThemeMode): void {
  const wasSidebarCollapsed = isSidebarCollapsed
  currentTheme = theme
  document.body.dataset.theme = theme

  setSidebarCollapsed(wasSidebarCollapsed)
  closeSidebar()
  renderThemeOptions()

  try {
    localStorage.setItem(THEME_KEY, theme)
  } catch (e) {
    console.error('Failed to save theme:', e)
  }
}

function initializeTheme(): void {
  try {
    const stored = localStorage.getItem(THEME_KEY)
    if (stored === 'wechat' || stored === 'chatgpt-light' || stored === 'chatgpt-dark') {
      applyTheme(stored)
      return
    }
  } catch (e) {
    console.error('Failed to load theme:', e)
  }

  applyTheme('wechat')
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function withReloadNonce(url: string): string {
  try {
    const nextUrl = new URL(url)
    nextUrl.searchParams.set('_cj_reload', String(Date.now()))
    return nextUrl.toString()
  } catch {
    return `${url}${url.includes('?') ? '&' : '?'}_cj_reload=${Date.now()}`
  }
}

function getLayoutContentMetrics(): { width: number, paddingLeft: number } {
  const styles = window.getComputedStyle(layoutEl)
  const paddingLeft = Number.parseFloat(styles.paddingLeft) || 0
  const paddingRight = Number.parseFloat(styles.paddingRight) || 0
  const width = layoutEl.clientWidth - paddingLeft - paddingRight

  return {
    width: Math.max(0, width),
    paddingLeft,
  }
}

function applyChatPanelWidth(requestedWidth: number): void {
  const { width: contentWidth } = getLayoutContentMetrics()
  if (!contentWidth) return

  const shouldCollapse = contentWidth - requestedWidth - PANEL_RESIZER_WIDTH <= AI_PANEL_COLLAPSE_THRESHOLD
  const aiWidth = shouldCollapse ? AI_PANEL_COLLAPSED_WIDTH : AI_PANEL_MIN_WIDTH
  const maxChatWidth = Math.max(CHAT_PANEL_MIN_WIDTH, contentWidth - PANEL_RESIZER_WIDTH - aiWidth)
  const nextWidth = clamp(requestedWidth, CHAT_PANEL_MIN_WIDTH, maxChatWidth)

  chatPanelEl.style.width = `${nextWidth}px`
  layoutEl.classList.toggle('ai-collapsed', shouldCollapse)
  aiPanelEl.classList.toggle('ai-collapsed', shouldCollapse)

  try {
    localStorage.setItem(PANEL_WIDTH_KEY, String(nextWidth))
  } catch (e) {
    console.error('Failed to save panel width:', e)
  }
}

function initializeResizableLayout(): void {
  const { width: contentWidth } = getLayoutContentMetrics()
  const defaultWidth = Math.round(contentWidth * 0.45)

  try {
    const stored = localStorage.getItem(PANEL_WIDTH_KEY)
    if (stored) {
      applyChatPanelWidth(Number(stored))
    } else {
      applyChatPanelWidth(defaultWidth)
    }
  } catch (e) {
    console.error('Failed to load panel width:', e)
    applyChatPanelWidth(defaultWidth)
  }

  let isDragging = false

  const updateWidthFromPointer = (clientX: number) => {
    const layoutRect = layoutEl.getBoundingClientRect()
    const { paddingLeft } = getLayoutContentMetrics()
    applyChatPanelWidth(clientX - layoutRect.left - paddingLeft)
  }

  const stopDragging = () => {
    if (!isDragging) return
    isDragging = false
    document.body.classList.remove('resizing')
  }

  panelResizerEl.addEventListener('mousedown', (event) => {
    isDragging = true
    document.body.classList.add('resizing')
    updateWidthFromPointer(event.clientX)
    event.preventDefault()
  })

  window.addEventListener('mousemove', (event) => {
    if (!isDragging) return
    updateWidthFromPointer(event.clientX)
  })

  window.addEventListener('mouseup', stopDragging)
  window.addEventListener('mouseleave', stopDragging)

  window.addEventListener('resize', () => {
    const currentWidth = chatPanelEl.getBoundingClientRect().width || defaultWidth
    applyChatPanelWidth(currentWidth)
  })
}

function getAvatarMarkup(role: ChatMessage['role']): string {
  if (role === 'chatgpt') {
    return `<img src="${chatgptIconUrl}" alt="ChatGPT" class="message-avatar-image">`
  }

  if (role === 'gemini') {
    return `<img src="${geminiIconUrl}" alt="Gemini" class="message-avatar-image">`
  }

  return '<span class="message-avatar-fallback">U</span>'
}

function renderMessages(): void {
  messagesEl.innerHTML = ''

  let currentGroup: ChatMessage[] = []
  const groups: ChatMessage[][] = []

  for (const msg of messages) {
    if (msg.role === 'user') {
      if (currentGroup.length > 0) groups.push(currentGroup)
      currentGroup = [msg]
    } else {
      currentGroup.push(msg)
    }
  }
  if (currentGroup.length > 0) groups.push(currentGroup)

  for (const group of groups) {
    const groupEl = document.createElement('div')
    groupEl.className = 'message-group'

    for (const msg of group) {
      const msgEl = document.createElement('div')
      msgEl.className = `message message-${msg.role}`
      msgEl.dataset.messageId = msg.id

      // 头像容器
      const avatarWrapper = document.createElement('div')
      avatarWrapper.className = 'message-avatar-wrapper'
      
      // 头像
      const avatarEl = document.createElement('div')
      avatarEl.className = `message-avatar message-avatar-${msg.role}`
      avatarEl.innerHTML = getAvatarMarkup(msg.role)
      avatarWrapper.appendChild(avatarEl)

      // 消息容器
      const messageWrapper = document.createElement('div')
      messageWrapper.className = 'message-wrapper'

      const labelEl = document.createElement('div')
      labelEl.className = 'message-label'
      labelEl.textContent = msg.role === 'user' ? t('labelYou') : msg.role === 'chatgpt' ? 'ChatGPT' : 'Gemini'

      const contentEl = document.createElement('div')
      contentEl.className = 'message-content markdown-body'
      contentEl.dataset.messageId = msg.id

      if (msg.role === 'user') {
        // 用户消息纯文本显示
        contentEl.textContent = msg.content
      } else {
        renderAiContent(contentEl, msg.content, msg.contentFormat === 'html' ? 'html' : 'text')
      }

      if (msg.content === '正在思考...' || msg.isStreaming) {
        contentEl.classList.add('thinking')
      }

      messageWrapper.appendChild(labelEl)
      messageWrapper.appendChild(contentEl)
      
      // 用户消息头像在右边，AI 消息头像在左边
      if (msg.role === 'user') {
        msgEl.appendChild(messageWrapper)
      } else {
        msgEl.appendChild(avatarWrapper)
        msgEl.appendChild(messageWrapper)
      }
      
      groupEl.appendChild(msgEl)
    }

    messagesEl.appendChild(groupEl)
  }

  messagesEl.scrollTop = messagesEl.scrollHeight
}

function updateMessageContent(
  messageId: string,
  content: string,
  contentFormat: MessageContentFormat,
  isFinal: boolean,
): void {
  // 先尝试直接更新 DOM（更高效）
  const contentEl = messagesEl.querySelector(`.message-content[data-message-id="${messageId}"]`) as HTMLElement
  if (contentEl) {
    const msg = messages.find(m => m.id === messageId)
    if (msg && msg.role === 'user') {
      contentEl.textContent = content
    } else {
      renderAiContent(contentEl, content, contentFormat)
    }
    if (isFinal) {
      contentEl.classList.remove('thinking')
    } else {
      contentEl.classList.add('thinking')
    }
    messagesEl.scrollTop = messagesEl.scrollHeight
  }

  // 同时更新数据
  const msg = messages.find(m => m.id === messageId)
  if (msg) {
    msg.content = content
    msg.contentFormat = contentFormat
    msg.isStreaming = !isFinal
  }
  
  // 保存到历史
  if (isFinal) {
    saveCurrentChat()
  }
}

function sendMessage(): void {
  const content = inputEl.value.trim()
  if (!content) return
  const enabledProviders = getEnabledProviders()
  if (enabledProviders.length === 0) return

  // 如果没有当前对话 ID，创建一个
  if (!currentChatId) {
    currentChatId = generateId()
  }

  const questionId = generateId()

  messages.push({
    id: questionId,
    role: 'user',
    content,
    contentFormat: 'text',
    timestamp: Date.now(),
  })

  for (const site of enabledProviders) {
    messages.push({
      id: generateId() + `-${site}`,
      role: site,
      content: '正在思考...',
      contentFormat: 'text',
      timestamp: Date.now(),
      isStreaming: true,
    })
  }

  renderMessages()
  inputEl.value = ''
  
  // 保存初始消息
  saveCurrentChat()

  chrome.runtime.sendMessage({ type: 'SEND_PROMPT', content, activeSites: enabledProviders })
}

function updateStatus(site: string, status: string): void {
  const el = site === 'chatgpt' ? statusChatgpt : statusGemini
  if (site === 'chatgpt' || site === 'gemini') {
    siteStatuses[site] = status
  }
  const dot = status === 'idle' ? '🟢' : status === 'generating' ? '🟡' : status === 'error' ? '🔴' : '⚪'
  const label = site === 'chatgpt' ? 'ChatGPT' : 'Gemini'
  const statusText =
    status === 'idle' ? t('statusReady') :
    status === 'generating' ? t('statusGenerating') :
    status === 'error' ? t('statusError') : t('statusOffline')
  el.textContent = `${dot} ${label}: ${statusText}`
}

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'ROLE_REPLY') {
    const site = message.site as 'chatgpt' | 'gemini'
    if (!isProviderEnabled(site)) return
    const isFinal = message.isFinal !== false // 默认 true
    const contentFormat = message.contentFormat === 'html' ? 'html' : 'text'
    updateCurrentSessionUrl(site, message.pageUrl)

    // 查找对应的消息（最后一个该 role 的消息）
    let targetMsg = messages.slice().reverse().find(m => m.role === site)

    if (targetMsg) {
      updateMessageContent(targetMsg.id, message.content, contentFormat, isFinal)
    } else {
      // 如果找不到，添加新消息
      messages.push({
        id: generateId(),
        role: site,
        content: message.content,
        contentFormat,
        timestamp: Date.now(),
        isStreaming: !isFinal,
      })
      renderMessages()
    }
  }

  if (message.type === 'ROLE_STATUS') {
    if (message.site === 'chatgpt' || message.site === 'gemini') {
      if (!isProviderEnabled(message.site)) return
      updateCurrentSessionUrl(message.site, message.pageUrl)
    }
    updateStatus(message.site, message.status)
  }
})

// 事件监听
sendBtn.addEventListener('click', sendMessage)
exportChatBtn.addEventListener('click', () => {
  void exportCurrentChat()
})
inputEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    sendMessage()
  }
})

menuBtn.addEventListener('click', openSidebar)
sidebarCollapseBtn.addEventListener('click', () => setSidebarCollapsed(true))
sidebarRailToggleBtn.addEventListener('click', openSidebar)
sidebarRailNewChatBtn.addEventListener('click', () => {
  createNewChat()
  openSidebar()
})
sidebarRailSearchBtn.addEventListener('click', openSearchOverlay)
sidebarRailThemeBtn.addEventListener('click', () => {
  openSidebar()
  toggleSettingsPopover(true)
})
sidebarNavSearchBtn.addEventListener('click', openSearchOverlay)
settingsToggleBtn.addEventListener('click', () => toggleSettingsPopover())
closeSidebarBtn.addEventListener('click', closeSidebar)
overlayEl.addEventListener('click', closeSidebar)
newChatBtn.addEventListener('click', () => {
  createNewChat()
  closeSidebar()
})
providerOptionsEl.addEventListener('click', (event) => {
  const target = event.target as HTMLElement
  const button = target.closest<HTMLButtonElement>('.provider-option')
  if (!button) return

  const site = button.dataset.provider
  if (site === 'chatgpt' || site === 'gemini') {
    setProviderEnabled(site, !isProviderEnabled(site))
  }
})
themeOptionsEl.addEventListener('click', (event) => {
  const target = event.target as HTMLElement
  const button = target.closest<HTMLButtonElement>('.theme-option')
  if (!button) return

  const theme = button.dataset.theme
  if (theme === 'wechat' || theme === 'chatgpt-light' || theme === 'chatgpt-dark') {
    applyTheme(theme)
  }
})
languageOptionsEl.addEventListener('click', (event) => {
  const target = event.target as HTMLElement
  const button = target.closest<HTMLButtonElement>('.language-option')
  if (!button) return

  const language = button.dataset.language
  if (language === 'zh-CN' || language === 'en' || language === 'ja') {
    applyLanguage(language)
  }
})
searchInputEl.addEventListener('input', () => renderSearchResults(searchInputEl.value))
searchCloseBtn.addEventListener('click', closeSearchOverlay)
searchNewChatBtn.addEventListener('click', () => {
  createNewChat()
})
searchOverlayEl.addEventListener('click', (event) => {
  if (event.target === searchOverlayEl) {
    closeSearchOverlay()
  }
})
document.addEventListener('click', (event) => {
  const target = event.target as Node
  if (settingsPopoverEl.contains(target) || settingsToggleBtn.contains(target)) return
  toggleSettingsPopover(false)
})
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !searchOverlayEl.hidden) {
    closeSearchOverlay()
  }
})

// 初始化
initializeSidebarCollapsedState()
initializeLanguage()
initializeActiveProviders()
initializeTheme()
applyLanguage(currentLanguage)
loadHistory()
renderHistoryList()
initializeResizableLayout()
renderLanguageOptions()
renderProviderOptions()
applyProviderVisibility()

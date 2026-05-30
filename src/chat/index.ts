// src/chat/index.ts

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
const sidebarNavSearchBtn = document.getElementById('sidebar-nav-search') as HTMLButtonElement
const sidebarSectionRecentEl = document.getElementById('sidebar-section-recent') as HTMLDivElement
const settingsToggleBtn = document.getElementById('settings-toggle') as HTMLButtonElement
const settingsPopoverEl = document.getElementById('settings-popover') as HTMLDivElement
const settingsThemeTitleEl = document.getElementById('settings-theme-title') as HTMLDivElement
const settingsLanguageTitleEl = document.getElementById('settings-language-title') as HTMLDivElement
const themeOptionsEl = document.getElementById('theme-options') as HTMLDivElement
const languageOptionsEl = document.getElementById('language-options') as HTMLDivElement
const layoutEl = document.getElementById('layout') as HTMLDivElement
const chatPanelEl = document.getElementById('chat-panel') as HTMLDivElement
const aiPanelEl = document.getElementById('ai-panel') as HTMLDivElement
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
    theme: '主题',
    language: '语言',
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
    yesterday: '昨天',
    openSidebar: '打开侧边栏',
    collapseSidebar: '折叠侧边栏',
    closeSidebar: '关闭侧边栏',
    openSettings: '打开设置',
    chatTitle: 'ChaoJia - AI 聊天聚合器',
  },
  en: {
    newChat: 'New Chat',
    searchChat: 'Search',
    settings: 'Settings',
    recent: 'Recent',
    theme: 'Theme',
    language: 'Language',
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
    yesterday: 'Yesterday',
    openSidebar: 'Open sidebar',
    collapseSidebar: 'Collapse sidebar',
    closeSidebar: 'Close sidebar',
    openSettings: 'Open settings',
    chatTitle: 'ChaoJia - AI Chat Aggregator',
  },
  ja: {
    newChat: '新しいチャット',
    searchChat: 'チャット検索',
    settings: '設定',
    recent: '最近',
    theme: 'テーマ',
    language: '言語',
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
    yesterday: '昨日',
    openSidebar: 'サイドバーを開く',
    collapseSidebar: 'サイドバーを折りたたむ',
    closeSidebar: 'サイドバーを閉じる',
    openSettings: '設定を開く',
    chatTitle: 'ChaoJia - AI チャットアグリゲーター',
  },
}

let currentTheme: ThemeMode = 'wechat'
let currentLanguage: LanguageMode = 'zh-CN'
let isSidebarCollapsed = false
let currentSessionUrls: ChatSessionUrls = {}
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
    'H4', 'H5', 'H6', 'HR', 'I', 'LI', 'OL', 'P', 'PRE', 'SECTION', 'SPAN',
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
      const keepHref = node.tagName === 'A' && attr.name === 'href' && /^https?:\/\//i.test(attr.value)
      if (!keepHref) node.removeAttribute(attr.name)
    }

    if (node.tagName === 'A' && node.getAttribute('href')) {
      node.setAttribute('target', '_blank')
      node.setAttribute('rel', 'noreferrer noopener')
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

function updateStaticTexts(): void {
  document.documentElement.lang = currentLanguage
  document.title = t('chatTitle')
  newChatBtn.textContent = `+ ${t('newChat')}`
  sidebarNavSearchBtn.textContent = t('searchChat')
  sidebarSectionRecentEl.textContent = t('recent')
  settingsThemeTitleEl.textContent = t('theme')
  settingsLanguageTitleEl.textContent = t('language')
  inputEl.placeholder = t('inputPlaceholder')
  sendBtn.textContent = t('send')
  settingsToggleBtn.title = t('openSettings')
  sidebarCollapseBtn.title = t('collapseSidebar')
  closeSidebarBtn.title = t('closeSidebar')
  sidebarRailToggleBtn.title = t('openSidebar')
  sidebarRailNewChatBtn.title = t('newChat')
  sidebarRailSearchBtn.title = t('searchChat')
  sidebarRailThemeBtn.title = t('settings')

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
  renderThemeOptions()
  renderLanguageOptions()
  renderHistoryList()
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
  currentChatId = generateId()
  messages = []
  currentSessionUrls = {}
  renderMessages()
  applySessionUrls()
  toggleSettingsPopover(false)
  renderHistoryList()
  chrome.runtime.sendMessage({ type: 'START_NEW_CHAT' })
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
        contentEl.innerHTML = msg.contentFormat === 'html'
          ? sanitizeAiHtml(msg.content)
          : simpleMarkdown(msg.content)
      }

      if (msg.content === '正在思考...' || msg.isStreaming) {
        contentEl.classList.add('thinking')
      }

      messageWrapper.appendChild(labelEl)
      messageWrapper.appendChild(contentEl)
      
      // 用户消息头像在右边，AI 消息头像在左边
      if (msg.role === 'user') {
        msgEl.appendChild(messageWrapper)
        msgEl.appendChild(avatarWrapper)
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
      contentEl.innerHTML = contentFormat === 'html'
        ? sanitizeAiHtml(content)
        : simpleMarkdown(content)
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

  const chatgptMsgId = generateId() + '-chatgpt'
  const geminiMsgId = generateId() + '-gemini'

  messages.push({
    id: chatgptMsgId,
    role: 'chatgpt',
    content: '正在思考...',
    contentFormat: 'text',
    timestamp: Date.now(),
    isStreaming: true,
  })
  messages.push({
    id: geminiMsgId,
    role: 'gemini',
    content: '正在思考...',
    contentFormat: 'text',
    timestamp: Date.now(),
    isStreaming: true,
  })

  renderMessages()
  inputEl.value = ''
  
  // 保存初始消息
  saveCurrentChat()

  chrome.runtime.sendMessage({ type: 'SEND_PROMPT', content })
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
      updateCurrentSessionUrl(message.site, message.pageUrl)
    }
    updateStatus(message.site, message.status)
  }
})

// 事件监听
sendBtn.addEventListener('click', sendMessage)
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
sidebarRailSearchBtn.addEventListener('click', openSidebar)
sidebarRailThemeBtn.addEventListener('click', () => {
  openSidebar()
  toggleSettingsPopover(true)
})
sidebarNavSearchBtn.addEventListener('click', openSidebar)
settingsToggleBtn.addEventListener('click', () => toggleSettingsPopover())
closeSidebarBtn.addEventListener('click', closeSidebar)
overlayEl.addEventListener('click', closeSidebar)
newChatBtn.addEventListener('click', () => {
  createNewChat()
  closeSidebar()
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
document.addEventListener('click', (event) => {
  const target = event.target as Node
  if (settingsPopoverEl.contains(target) || settingsToggleBtn.contains(target)) return
  toggleSettingsPopover(false)
})

// 初始化
initializeSidebarCollapsedState()
initializeLanguage()
initializeTheme()
applyLanguage(currentLanguage)
loadHistory()
renderHistoryList()
initializeResizableLayout()
renderLanguageOptions()

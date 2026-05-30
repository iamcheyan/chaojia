import { createChatGptAdapter } from './chatgpt'
import { createGeminiAdapter } from './gemini'
import { createClaudeAdapter } from './claude'
import { createDeepSeekAdapter } from './deepseek'
import { createKimiAdapter } from './kimi'
import { createDoubaoAdapter } from './doubao'
import { createYiyanAdapter } from './yiyan'
import { createTongyiAdapter } from './tongyi'
import { createPlaceholderAdapter } from './placeholder'
import type { ChatSiteAdapter } from './types'

/**
 * Supported AI chat platforms.
 * Each entry maps a hostname to its adapter factory function.
 *
 * Platforms with placeholder adapters will log warnings when methods are called.
 * They will be replaced with full implementations in subsequent user stories.
 */
const adapterMap: Record<string, () => ChatSiteAdapter> = {
  // OpenAI ChatGPT
  'chatgpt.com': createChatGptAdapter,
  'chat.openai.com': createChatGptAdapter,

  // Google Gemini
  'gemini.google.com': createGeminiAdapter,

  // Anthropic Claude
  'claude.ai': createClaudeAdapter,

  // DeepSeek
  'chat.deepseek.com': createDeepSeekAdapter,

  // Kimi
  'kimi.moonshot.cn': createKimiAdapter,

  // 豆包 (Doubao by ByteDance)
  'www.doubao.com': createDoubaoAdapter,
  'doubao.com': createDoubaoAdapter,

  // 文心一言 (Yiyan by Baidu)
  'yiyan.baidu.com': createYiyanAdapter,

  // 通义千问 (Tongyi by Alibaba)
  'tongyi.aliyun.com': createTongyiAdapter,

  // Perplexity (placeholder - full adapter in US-008)
  'www.perplexity.ai': () => createPlaceholderAdapter('perplexity', 'www.perplexity.ai'),
  'perplexity.ai': () => createPlaceholderAdapter('perplexity', 'perplexity.ai'),
}

/**
 * Get the list of all supported hostnames.
 * Useful for UI to display available platforms.
 */
export function getSupportedHostnames(): string[] {
  return Object.keys(adapterMap)
}

/**
 * Check if a given hostname is supported.
 */
export function isSupportedHostname(hostname: string): boolean {
  return hostname in adapterMap
}

/**
 * Get the active chat site adapter based on the current hostname.
 *
 * @returns The matching ChatSiteAdapter
 * @throws Error if no adapter matches the current hostname
 */
export function getActiveChatSiteAdapter(): ChatSiteAdapter {
  const hostname = location.hostname
  const adapterFactory = adapterMap[hostname]

  if (adapterFactory) {
    console.log(`[MultiChat] Using adapter for: ${hostname}`)
    return adapterFactory()
  }

  // No matching adapter found - throw an error
  // The calling code (content/index.ts) should handle this gracefully
  throw new Error(
    `[MultiChat] No adapter found for hostname: ${hostname}. ` +
    `Supported hostnames: ${getSupportedHostnames().join(', ')}`
  )
}

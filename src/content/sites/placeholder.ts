import type { CapturedReply, ChatSiteAdapter } from './types'

/**
 * Creates a placeholder adapter for platforms that haven't been fully implemented yet.
 * This allows the routing infrastructure to be set up before the actual adapters are ready.
 *
 * @param id - The platform identifier (e.g., 'claude', 'deepseek')
 * @param hostname - The hostname for logging purposes
 */
export function createPlaceholderAdapter(id: string, hostname: string): ChatSiteAdapter {
  const warn = (method: string) => {
    console.warn(`[MultiChat] ${id} adapter: ${method} not yet implemented (${hostname})`)
  }

  return {
    id,

    getResponseContainers(): Element[] {
      warn('getResponseContainers')
      return []
    },

    getAllAssistantReplies(): CapturedReply[] {
      warn('getAllAssistantReplies')
      return []
    },

    readResponse(_node: Node): CapturedReply {
      warn('readResponse')
      return { content: '', format: 'text' }
    },

    isGenerating(): boolean {
      return false
    },

    async stopGenerating(): Promise<boolean> {
      warn('stopGenerating')
      return false
    },

    async startNewChat(): Promise<boolean> {
      warn('startNewChat')
      return false
    },

    async fillAndSend(_content: string, _autoSend?: boolean): Promise<void> {
      warn('fillAndSend')
    },
  }
}

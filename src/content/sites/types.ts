export interface CapturedReply {
  content: string
  format: 'text' | 'html'
}

export interface ChatSiteAdapter {
  readonly id: string
  getResponseContainers(): Element[]
  getAllAssistantReplies(): CapturedReply[]
  readResponse(node: Node): CapturedReply
  isGenerating(): boolean
  stopGenerating(): Promise<boolean>
  startNewChat(): Promise<boolean>
  fillAndSend(content: string, autoSend?: boolean): Promise<void>
}

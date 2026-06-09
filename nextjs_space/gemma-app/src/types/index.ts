// ─── API Response from /api/ai/chat ────────────────────────────────────

export type ResponseType = 'text' | 'question' | 'rich' | 'confirmation' | 'error'

export interface RichData {
  type: 'phone' | 'contact' | 'booking' | 'inventory' | 'summary' | 'list'
  [key: string]: any
}

export interface ChatResponse {
  reply: string
  type: ResponseType
  richData: RichData | null
  quickReplies: string[]
  chatId: string
  action?: string
}

// ─── Chat Message ──────────────────────────────────────────────────────

export type MessageRole = 'user' | 'gemma' | 'system'

export interface Attachment {
  name: string
  uri: string
  type: 'image' | 'pdf'
  size?: number
}

export interface ChatMessage {
  id: string
  role: MessageRole
  text: string
  richData?: RichData | null
  quickReplies?: string[]
  timestamp: Date
  status?: 'sending' | 'sent' | 'error'
  attachments?: Attachment[]
}

// ─── Auth ────────────────────────────────────────────────────────────────

export interface AuthCredentials {
  email: string
  password: string
}

export interface AuthSession {
  userId: string
  tenantId: string
  name: string
  email: string
  token: string
}

// ─── Quick Reply ────────────────────────────────────────────────────────

export interface QuickReply {
  text: string
  icon?: string
}

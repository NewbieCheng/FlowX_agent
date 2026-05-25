// ============================================================
// 本地 Agent WebSocket 协议类型
// 与 src/agent/types.ts 保持对称
// ============================================================

// ─── AI 工具 → Extension 的请求 ─────────────────────────────

export interface AgentPublishRequest {
  draft?: {
    title: string
    html?: string
    markdown?: string
    cover?: string
    images?: { url: string; alt?: string }[]
    materialType?: "article" | "image_text"
  }
  captureId?: string
  platforms: string[]
}

export interface AgentInboundMessage {
  type: "PUBLISH" | "LIST_PLATFORMS" | "CHECK_AUTH"
  requestId: string
  payload?: AgentPublishRequest
  channelId?: string
}

// ─── Extension → AI 工具的响应 ─────────────────────────────

export interface SyncResultForAgent {
  channelId: string
  success: boolean
  postUrl?: string
  postId?: string
  error?: string
}

export interface AgentOutboundMessage {
  type: "PUBLISH_RESULT" | "PLATFORM_LIST" | "AUTH_CHECK_RESULT" | "ERROR"
  requestId: string
  results?: SyncResultForAgent[]
  channels?: {
    id: string
    name: string
    homepage: string
    authed: boolean
    username?: string
  }[]
  channelId?: string
  ok?: boolean
  username?: string
  error?: string
}

// ─── 服务器内部消息包装（用于路由）─────────────────────────

export interface WsEnvelope {
  /** 消息来源：extension | tool */
  from: "extension" | "tool"
  /** 原始消息 */
  message: AgentInboundMessage | AgentOutboundMessage
}
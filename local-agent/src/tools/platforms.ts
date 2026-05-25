// ============================================================
// PLATFORMS 工具：查询可用平台列表
// ============================================================

import type WebSocket from "ws"
import type { AgentInboundMessage } from "../types"
import { trackRequest } from "./request-tracker"

export function requestListPlatforms(
  ws: WebSocket,
  extensionWs: WebSocket | null,
  payload: AgentInboundMessage
): void {
  if (!extensionWs) {
    ws.send(
      JSON.stringify({
        type: "PLATFORM_LIST",
        requestId: payload.requestId,
        channels: [],
      })
    )
    return
  }

  trackRequest(payload.requestId, ws)
  extensionWs.send(JSON.stringify({ from: "tool", message: payload }))
}

export function requestCheckAuth(
  ws: WebSocket,
  extensionWs: WebSocket | null,
  payload: AgentInboundMessage
): void {
  if (!extensionWs) {
    ws.send(
      JSON.stringify({
        type: "AUTH_CHECK_RESULT",
        requestId: payload.requestId,
        channelId: payload.channelId,
        ok: false,
      })
    )
    return
  }

  trackRequest(payload.requestId, ws)
  extensionWs.send(JSON.stringify({ from: "tool", message: payload }))
}
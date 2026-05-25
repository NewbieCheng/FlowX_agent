// ============================================================
// PUBLISH 工具：将 AI 发布请求转发给 Extension
// ============================================================

import type WebSocket from "ws"
import type { AgentInboundMessage } from "../types"
import { trackRequest } from "./request-tracker"

export function requestPublish(
  ws: WebSocket,
  extensionWs: WebSocket | null,
  payload: AgentInboundMessage
): void {
  if (!extensionWs) {
    ws.send(
      JSON.stringify({
        type: "PUBLISH_RESULT",
        requestId: payload.requestId,
        results: [], // ❌ handle by error below
      })
    )
    ws.send(
      JSON.stringify({
        type: "ERROR",
        requestId: payload.requestId,
        error: "Extension 未连接，请确认浏览器插件已开启",
      })
    )
    return
  }

  trackRequest(payload.requestId, ws)
  extensionWs.send(JSON.stringify({ from: "tool", message: payload }))
}
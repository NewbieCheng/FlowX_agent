// ============================================================
// 请求追踪器：管理 requestId → WebSocket 连接的映射
// 用于将 Extension 的响应路由回正确的 AI 工具连接
// ============================================================

import type WebSocket from "ws"

const pendingRequests = new Map<string, WebSocket>()

export function trackRequest(requestId: string, ws: WebSocket): void {
  pendingRequests.set(requestId, ws)
}

export function resolveRequest(requestId: string): WebSocket | undefined {
  const ws = pendingRequests.get(requestId)
  if (ws) {
    pendingRequests.delete(requestId)
  }
  return ws
}

export function clearConnection(ws: WebSocket): void {
  for (const [requestId, conn] of pendingRequests) {
    if (conn === ws) {
      pendingRequests.delete(requestId)
    }
  }
}

export function getPendingRequestCount(): number {
  return pendingRequests.size
}
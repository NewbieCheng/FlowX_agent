// ============================================================
// WebSocket 服务端核心逻辑
// 监听 ws://localhost:8765，桥接 Chrome Extension 与 AI 工具
// 可被 CLI / Electron 主进程导入
// ============================================================

import { WebSocketServer, WebSocket } from "ws"
import { resolveRequest, clearConnection } from "./tools/request-tracker"
import { requestListPlatforms, requestCheckAuth } from "./tools/platforms"
import { requestPublish } from "./tools/publish"
import type { AgentInboundMessage, AgentOutboundMessage } from "./types"

export type ServerStatus = {
  running: boolean
  port: number
  extensionConnected: boolean
  toolCount: number
  logs: LogEntry[]
}

export type LogEntry = {
  time: string
  level: "info" | "warn" | "error"
  msg: string
}

export type StatusListener = (status: ServerStatus) => void

const MAX_LOGS = 200

export class FlowxAgentServer {
  private wss: WebSocketServer | null = null
  private extensionWs: WebSocket | null = null
  private toolCount = 0
  private logs: LogEntry[] = []
  private listeners: Set<StatusListener> = new Set()
  private _port: number

  get port() { return this._port }
  get status(): ServerStatus {
    return {
      running: this.wss !== null,
      port: this._port,
      extensionConnected: this.extensionWs !== null && this.extensionWs.readyState === WebSocket.OPEN,
      toolCount: this.toolCount,
      logs: this.logs,
    }
  }

  constructor(port = 8765) {
    this._port = port
  }

  onStatus(fn: StatusListener) {
    this.listeners.add(fn)
    return () => { this.listeners.delete(fn) }
  }

  private emit() {
    const s = this.status
    for (const fn of this.listeners) fn(s)
  }

  private log(level: LogEntry["level"], msg: string) {
    const entry: LogEntry = { time: new Date().toLocaleTimeString(), level, msg }
    this.logs.push(entry)
    if (this.logs.length > MAX_LOGS) this.logs.shift()
    if (level === "error") console.error(`[flowx-agent] ${msg}`)
    else console.log(`[flowx-agent] ${msg}`)
    this.emit()
  }

  start(): Promise<number> {
    return new Promise((resolve, reject) => {
      if (this.wss) { resolve(this._port); return }

      this.wss = new WebSocketServer({ port: this._port })

      this.wss.on("listening", () => {
        this.log("info", `WebSocket 服务端已启动: ws://localhost:${this._port}`)
        resolve(this._port)
      })

      this.wss.on("connection", (ws) => this.handleConnection(ws))
      this.wss.on("error", (err) => {
        this.log("error", `服务端错误: ${err.message}`)
        reject(err)
      })
    })
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.wss) { resolve(); return }
      this.wss.close(() => {
        this.wss = null
        this.extensionWs = null
        this.toolCount = 0
        this.log("info", "服务端已停止")
        resolve()
      })
    })
  }

  private sendToExtension(data: unknown): boolean {
    if (this.extensionWs && this.extensionWs.readyState === WebSocket.OPEN) {
      this.extensionWs.send(JSON.stringify(data))
      return true
    }
    return false
  }

  private handleToolMessage(ws: WebSocket, msg: AgentInboundMessage): void {
    switch (msg.type) {
      case "PUBLISH":
        requestPublish(ws, this.extensionWs, msg)
        break
      case "LIST_PLATFORMS":
        requestListPlatforms(ws, this.extensionWs, msg)
        break
      case "CHECK_AUTH":
        requestCheckAuth(ws, this.extensionWs, msg)
        break
      default:
        ws.send(JSON.stringify({ type: "ERROR", requestId: (msg as any).requestId ?? "unknown", error: `Unknown: ${(msg as any).type}` }))
    }
  }

  private handleExtensionMessage(data: AgentOutboundMessage): void {
    const targetWs = resolveRequest(data.requestId)
    if (targetWs && targetWs.readyState === WebSocket.OPEN) {
      // 包装为 { message: ... } 格式，与 MCP bridge 的接收逻辑一致
      targetWs.send(JSON.stringify({ message: data }))
    }
  }

  private handleConnection(ws: WebSocket): void {
    let role: "extension" | "tool" | "unknown" = "unknown"

    ws.on("message", (raw: Buffer) => {
      let data: any
      try { data = JSON.parse(raw.toString()) } catch { return }

      if (role === "unknown") {
        if (data.from === "extension") {
          role = "extension"
          this.extensionWs = ws
          this.log("info", "Extension 已连接")
          return
        }
        if (data.from === "tool") {
          role = "tool"
          this.toolCount++
          this.log("info", "工具已连接")
          if (data.message) this.handleToolMessage(ws, data.message as AgentInboundMessage)
          return
        }
      }

      if (role === "extension" && data.message) {
        this.handleExtensionMessage(data.message as AgentOutboundMessage)
      } else if (role === "tool" && data.message) {
        this.handleToolMessage(ws, data.message as AgentInboundMessage)
      }
    })

    ws.on("close", () => {
      if (role === "extension") {
        this.extensionWs = null
        this.log("info", "Extension 已断开")
      } else if (role === "tool") {
        this.toolCount = Math.max(0, this.toolCount - 1)
        this.log("info", "工具已断开")
        clearConnection(ws)
      }
    })

    ws.on("error", (err) => {
      this.log("error", `WebSocket 错误: ${err.message}`)
    })
  }
}

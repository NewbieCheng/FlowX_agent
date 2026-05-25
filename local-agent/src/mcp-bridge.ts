// ============================================================
// MCP Bridge 入口
// 供 Cursor / Claude Desktop / Codex 等 AI 工具通过 MCP 协议启动
// 配置示例：
// {
//   "mcpServers": {
//     "flowx-publish": {
//       "command": "node",
//       "args": ["<path>/local-agent/dist/mcp-bridge.js"]
//     }
//   }
// }
// ============================================================

import WebSocket from "ws"
import { McpServer } from "./mcp-server"

const WS_URL = process.env.FLOWX_WS_URL || "ws://localhost:8765"

let ws: WebSocket | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null

const mcpServer = new McpServer(ws)

function connect(): void {
  if (ws && ws.readyState === WebSocket.OPEN) return

  try {
    ws = new WebSocket(WS_URL)
  } catch {
    scheduleReconnect()
    return
  }

  ws.on("open", () => {
    // 向服务端标识身份为 tool
    ws!.send(JSON.stringify({ from: "tool" }))
    mcpServer.setWs(ws)
  })

  ws.on("message", (raw: Buffer) => {
    let data: any
    try {
      data = JSON.parse(raw.toString())
    } catch {
      return
    }

    // Extension 的响应路由回 MCP Server
    if (data.message) {
      mcpServer.handleExtensionResponse(data.message)
    }
  })

  ws.on("close", () => {
    mcpServer.setWs(null)
    scheduleReconnect()
  })

  ws.on("error", () => {
    scheduleReconnect()
  })
}

function scheduleReconnect(): void {
  if (reconnectTimer) return
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    connect()
  }, 3000)
}

// ─── MCP stdio 通信 ──────────────────────────────────────────

process.stdin.setEncoding("utf-8")
process.stdin.on("data", (chunk: string) => {
  mcpServer.handleMessage(chunk, (response) => {
    process.stdout.write(response + "\n")
  })
})

process.stdin.on("end", () => {
  if (reconnectTimer) clearTimeout(reconnectTimer)
  if (ws) {
    ws.close()
    ws = null
  }
})

// 启动时先尝试连接 WebSocket 服务端
connect()
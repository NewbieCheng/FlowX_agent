// ============================================================
// CLI 入口：纯命令行启动 WebSocket 服务端
// ============================================================

import { FlowxAgentServer } from "./server"

const port = parseInt(process.env.FLOWX_PORT || "8765", 10)
const server = new FlowxAgentServer(port)

server.start().catch((err) => {
  console.error("[flowx-agent] 启动失败:", err.message)
  process.exit(1)
})
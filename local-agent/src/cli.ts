// ============================================================
// CLI 命令行工具
// 通过 WebSocket 连接本地 Agent 执行发布/查询操作
// 用法：
//   node dist/cli.js publish --title "xxx" --content "xxx" --platforms juejin,zhihu
//   node dist/cli.js list-platforms
//   node dist/cli.js check-auth --channel-id juejin
// ============================================================

import WebSocket from "ws"

const DEFAULT_WS_URL = "ws://localhost:8765"
const WS_URL = process.env.FLOWX_WS_URL || DEFAULT_WS_URL

function parseArgs(): Record<string, string> {
  const args: Record<string, string> = {}
  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i]
    if (arg.startsWith("--")) {
      const eq = arg.indexOf("=")
      if (eq >= 0) {
        args[arg.slice(2, eq)] = arg.slice(eq + 1)
      } else {
        args[arg.slice(2)] = process.argv[i + 1] ?? "true"
        i++
      }
    }
  }
  return args
}

function main(): void {
  const cmd = process.argv[2]
  const args = parseArgs()
  const wsUrl = args["ws-url"] ? `ws://${args["ws-url"]}` : WS_URL

  const ws = new WebSocket(wsUrl)

  ws.on("open", () => {
    const requestId = `cli-${Date.now()}`

    switch (cmd) {
      case "publish": {
        const title = args["title"] || ""
        const content = args["content"] || ""
        const platformsStr = args["platforms"] || ""
        const platforms = platformsStr
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)

        if (platforms.length === 0) {
          console.error("请指定 --platforms（逗号分隔的平台 ID）")
          process.exit(1)
        }

        ws.send(
          JSON.stringify({
            from: "tool",
            message: {
              type: "PUBLISH",
              requestId,
              payload: {
                draft: { title: title || "未命名", markdown: content },
                platforms,
              },
            },
          })
        )
        break
      }

      case "list-platforms":
        ws.send(
          JSON.stringify({
            from: "tool",
            message: { type: "LIST_PLATFORMS", requestId },
          })
        )
        break

      case "check-auth": {
        const channelId = args["channel-id"] || ""
        if (!channelId) {
          console.error("请指定 --channel-id（平台 ID）")
          process.exit(1)
        }

        ws.send(
          JSON.stringify({
            from: "tool",
            message: { type: "CHECK_AUTH", requestId, channelId },
          })
        )
        break
      }

      default:
        console.error(`未知命令: ${cmd}`)
        console.error("可用命令: publish | list-platforms | check-auth")
        ws.close()
        process.exit(1)
    }
  })

  ws.on("message", (raw: Buffer) => {
    let data: any
    try {
      data = JSON.parse(raw.toString())
    } catch {
      return
    }

    if (!data.message) return

    switch (data.message.type) {
      case "PUBLISH_RESULT": {
        console.log("发布结果:")
        for (const r of data.message.results ?? []) {
          console.log(
            `  ${r.channelId}: ${r.success ? `成功 → ${r.postUrl ?? "(无链接)"}` : `失败 — ${r.error ?? "未知错误"}`}`
          )
        }
        break
      }
      case "PLATFORM_LIST": {
        console.log("平台列表:")
        for (const c of data.message.channels ?? []) {
          console.log(
            `  ${c.id} (${c.name}): ${c.authed ? "已登录" + (c.username ? ` (${c.username})` : "") : "未登录"}`
          )
        }
        break
      }
      case "AUTH_CHECK_RESULT": {
        console.log(
          `${data.message.channelId}: ${data.message.ok ? "已登录" + (data.message.username ? ` (${data.message.username})` : "") : "未登录"}`
        )
        break
      }
      case "ERROR": {
        console.error(`错误: ${data.message.error}`)
        break
      }
    }

    ws.close()
    process.exit(0)
  })

  ws.on("error", (err) => {
    console.error("连接失败:", err.message)
    console.error("请确认 FlowX 本地 Agent 服务已启动（node local-agent/dist/index.js）")
    process.exit(1)
  })
}

main()
// ============================================================
// MCP 协议适配层
// 实现 MCP (Model Context Protocol) Server，暴露 3 个工具
// 与外部 AI 通过 stdio 通信，内部通过 WebSocket 转发到 Extension
// ============================================================

import { WebSocket } from "ws"

type McpRequest = {
  jsonrpc: "2.0"
  id: number | string
  method: string
  params?: any
}

type McpResponse = {
  jsonrpc: "2.0"
  id: number | string
  result?: any
  error?: { code: number; message: string }
}

export class McpServer {
  private ws: WebSocket | null
  private requestIdCounter = 0
  private pendingCallbacks = new Map<string, (response: McpResponse) => void>()

  constructor(ws: WebSocket | null) {
    this.ws = ws
  }

  setWs(ws: WebSocket | null): void {
    this.ws = ws
  }

  handleMessage(raw: string, send: (response: string) => void): void {
    let req: McpRequest
    try {
      req = JSON.parse(raw)
    } catch {
      return
    }

    switch (req.method) {
      case "initialize":
        send(
          JSON.stringify({
            jsonrpc: "2.0",
            id: req.id,
            result: {
              protocolVersion: "2024-11-05",
              capabilities: { tools: {} },
              serverInfo: {
                name: "flowx-publish",
                version: "1.0.0",
              },
            },
          } as McpResponse)
        )
        break

      case "tools/list":
        send(
          JSON.stringify({
            jsonrpc: "2.0",
            id: req.id,
            result: {
              tools: [
                {
                  name: "flowx_publish",
                  description:
                    "发布内容到指定平台。可将标题和正文发布到掘金、知乎、微信公众号、小红书等平台。",
                  inputSchema: {
                    type: "object",
                    properties: {
                      title: { type: "string", description: "文章标题" },
                      content: {
                        type: "string",
                        description: "文章正文（支持 Markdown 或 HTML）",
                      },
                      platforms: {
                        type: "array",
                        items: { type: "string" },
                        description: "目标平台 ID 列表，如：[\"juejin\", \"zhihu\"]",
                      },
                      captureId: {
                        type: "string",
                        description: "已有素材 ID，可选",
                      },
                      materialType: {
                        type: "string",
                        enum: ["article", "image_text"],
                        description: "素材类型",
                      },
                      publishMode: {
                        type: "string",
                        enum: ["article", "image_text", "image_draft"],
                        description: "发布模式：article=文章, image_text=图文混排(小红书/抖音), image_draft=贴图草稿(微信)",
                      },
                      images: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            url: { type: "string", description: "图片 URL" },
                            alt: { type: "string", description: "图片描述，可选" },
                          },
                        },
                        description: "图片列表，用于图文发布",
                      },
                    },
                    required: ["platforms"],
                  },
                },
                {
                  name: "flowx_list_platforms",
                  description: "列出所有可用发布平台及其登录状态",
                  inputSchema: {
                    type: "object",
                    properties: {},
                  },
                },
                {
                  name: "flowx_check_auth",
                  description: "检查指定平台的登录状态",
                  inputSchema: {
                    type: "object",
                    properties: {
                      channelId: {
                        type: "string",
                        description: "平台 ID，如 juejin, zhihu, weixin",
                      },
                    },
                    required: ["channelId"],
                  },
                },
                {
                  name: "flowx_upload_images",
                  description: "上传 base64 图片，获取临时 URL，用于 flowx_publish 的 images 参数",
                  inputSchema: {
                    type: "object",
                    properties: {
                      images: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            dataUrl: { type: "string", description: "base64 data URL，如 data:image/png;base64,..." },
                            filename: { type: "string", description: "文件名，可选" },
                          },
                          required: ["dataUrl"],
                        },
                        description: "base64 图片列表",
                      },
                    },
                    required: ["images"],
                  },
                },
                {
                  name: "flowx_read_local_files",
                  description: "读取本地文件（图片或文本），图片自动托管为 URL，文本返回内容。用于发布本地图片或读取本地文章内容。",
                  inputSchema: {
                    type: "object",
                    properties: {
                      filePaths: {
                        type: "array",
                        items: { type: "string" },
                        description: "本地文件路径列表，如 [\"C:/1.png\", \"./article.md\"]",
                      },
                    },
                    required: ["filePaths"],
                  },
                },
              ],
            },
          } as McpResponse)
        )
        break

      case "tools/call":
        this.handleToolCall(req, send)
        break

      default:
        send(
          JSON.stringify({
            jsonrpc: "2.0",
            id: req.id,
            error: { code: -32601, message: `Method not found: ${req.method}` },
          } as McpResponse)
        )
    }
  }

  private handleToolCall(
    req: McpRequest,
    send: (response: string) => void
  ): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      send(
        JSON.stringify({
          jsonrpc: "2.0",
          id: req.id,
          result: {
            content: [
              {
                type: "text",
                text: "FlowX 插件未连接，请确认 Chrome 已打开且本地 Agent 开关已开启。",
              },
            ],
          },
        } as McpResponse)
      )
      return
    }

    const { name, arguments: args } = req.params ?? {}

    const requestId = `mcp-${++this.requestIdCounter}-${Date.now()}`

    switch (name) {
      case "flowx_publish": {
        const platforms = Array.isArray(args?.platforms) ? args.platforms : []
        const title = typeof args?.title === "string" ? args.title : undefined
        const content = typeof args?.content === "string" ? args.content : undefined
        const captureId = typeof args?.captureId === "string" ? args.captureId : undefined

        const agentMsg = {
          type: "PUBLISH" as const,
          requestId,
          payload: {
            draft: title || content
              ? {
                  title: title ?? "未命名",
                  markdown: content ?? "",
                  materialType: args?.materialType,
                }
              : undefined,
            captureId,
            platforms,
            publishMode: args?.publishMode,
            images: args?.images,
          },
        }

        this.pendingCallbacks.set(requestId, (response: McpResponse) => {
          send(JSON.stringify(response))
        })

        this.ws.send(
          JSON.stringify({ from: "tool", message: agentMsg })
        )
        break
      }

      case "flowx_list_platforms": {
        const agentMsg = {
          type: "LIST_PLATFORMS" as const,
          requestId,
        }

        this.pendingCallbacks.set(requestId, (response: McpResponse) => {
          send(JSON.stringify(response))
        })

        this.ws.send(
          JSON.stringify({ from: "tool", message: agentMsg })
        )
        break
      }

      case "flowx_check_auth": {
        const channelId = args?.channelId

        const agentMsg = {
          type: "CHECK_AUTH" as const,
          requestId,
          channelId,
        }

        this.pendingCallbacks.set(requestId, (response: McpResponse) => {
          send(JSON.stringify(response))
        })

        this.ws.send(
          JSON.stringify({ from: "tool", message: agentMsg })
        )
        break
      }

      case "flowx_upload_images": {
        // 转发到 Extension 处理图片上传
        const agentMsg = {
          type: "UPLOAD_IMAGES" as const,
          requestId,
          payload: {
            images: args?.images ?? [],
          },
        }

        this.pendingCallbacks.set(requestId, (response: McpResponse) => {
          send(JSON.stringify(response))
        })

        this.ws.send(
          JSON.stringify({ from: "tool", message: agentMsg })
        )
        break
      }

      case "flowx_read_local_files": {
        // 本地读取文件，不需要转发到 Extension
        const filePaths: string[] = Array.isArray(args?.filePaths) ? args.filePaths : []
        const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp"])
        const TEXT_EXTS = new Set([".md", ".txt", ".html", ".json", ".csv"])

        const results: Array<{ path: string; type: "image" | "text"; url?: string; content?: string; error?: string }> = []

        for (const fp of filePaths) {
          try {
            const fs = require("fs")
            const path = require("path")
            const ext = path.extname(fp).toLowerCase()

            if (IMAGE_EXTS.has(ext)) {
              const buf = fs.readFileSync(fp)
              const mime = ext === ".svg" ? "image/svg+xml" : `image/${ext.slice(1)}`
              const dataUrl = `data:${mime};base64,${buf.toString("base64")}`
              results.push({ path: fp, type: "image", url: dataUrl })
            } else if (TEXT_EXTS.has(ext)) {
              const content = fs.readFileSync(fp, "utf-8")
              results.push({ path: fp, type: "text", content })
            } else {
              results.push({ path: fp, type: "text", error: `不支持的文件类型: ${ext}` })
            }
          } catch (e: any) {
            results.push({ path: fp, type: "text", error: e?.message ?? "读取失败" })
          }
        }

        send(JSON.stringify({
          jsonrpc: "2.0",
          id: req.id,
          result: {
            content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
          },
        } as McpResponse))
        break
      }

      default:
        send(
          JSON.stringify({
            jsonrpc: "2.0",
            id: req.id,
            error: { code: -32601, message: `Tool not found: ${name}` },
          } as McpResponse)
        )
    }
  }

  /** 处理来自 Extension 的响应，转发给 MCP Client */
  handleExtensionResponse(data: any): void {
    const callback = this.pendingCallbacks.get(data.requestId)
    if (!callback) return
    this.pendingCallbacks.delete(data.requestId)

    let text = ""

    switch (data.type) {
      case "PUBLISH_RESULT": {
        const results = data.results ?? []
        if (results.length === 0) {
          text = "没有发布结果返回"
        } else {
          text = results
            .map(
              (r: any) =>
                `${r.channelId}: ${r.success ? `成功 → ${r.postUrl ?? "(无链接)"}` : `失败 — ${r.error ?? "未知错误"}`}`
            )
            .join("\n")
        }
        break
      }
      case "PLATFORM_LIST": {
        const channels = data.channels ?? []
        if (channels.length === 0) {
          text = "暂无可用平台"
        } else {
          text = channels
            .map(
              (c: any) =>
                `${c.id} (${c.name}): ${c.authed ? "已登录" + (c.username ? ` (${c.username})` : "") : "未登录"}`
            )
            .join("\n")
        }
        break
      }
      case "AUTH_CHECK_RESULT": {
        text = `${data.channelId}: ${data.ok ? "已登录" + (data.username ? ` (${data.username})` : "") : "未登录"}`
        break
      }
      case "UPLOAD_IMAGES_RESULT": {
        const urls = data.urls ?? []
        if (urls.length === 0) {
          text = "图片上传失败，未返回 URL"
        } else {
          text = urls.map((u: any) => u.url ?? u).join("\n")
        }
        break
      }
      case "ERROR": {
        text = `错误: ${data.error ?? "未知错误"}`
        break
      }
      default:
        text = JSON.stringify(data, null, 2)
    }

    callback({
      jsonrpc: "2.0",
      id: data.requestId,
      result: {
        content: [{ type: "text", text }],
      },
    })
  }
}
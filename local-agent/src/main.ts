// ============================================================
// Electron 主进程入口
// 创建窗口 + 启动 WebSocket 服务端
// ============================================================

import { app, BrowserWindow, ipcMain, Menu, nativeImage } from "electron"
import * as path from "path"
import { FlowxAgentServer } from "./server"

let win: BrowserWindow | null = null
let server: FlowxAgentServer | null = null

function createWindow() {
  // 图标
  const iconPath = path.join(__dirname, "renderer", "icon.png")

  win = new BrowserWindow({
    width: 480,
    height: 720,
    minWidth: 400,
    minHeight: 560,
    title: "FlowX Agent",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : undefined,
    backgroundColor: "#ffffff",
    resizable: true,
    icon: nativeImage.createFromPath(iconPath),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  // 隐藏默认菜单栏
  Menu.setApplicationMenu(null)

  win.loadFile(path.join(__dirname, "renderer", "index.html"))
  win.on("closed", () => { win = null })
}

function startServer() {
  const port = parseInt(process.env.FLOWX_PORT || "8765", 10)
  server = new FlowxAgentServer(port)

  // 推送状态到渲染进程
  server.onStatus((status) => {
    if (win && !win.isDestroyed()) {
      win.webContents.send("status", status)
    }
  })

  server.start().catch((err) => {
    console.error("[flowx-agent] 启动失败:", err.message)
  })
}

// IPC: 渲染进程查询状态
ipcMain.handle("get-status", () => server?.status ?? null)

// IPC: 渲染进程请求启动/停止
ipcMain.handle("toggle-server", async (_e: any, shouldStart: boolean) => {
  if (shouldStart && server) {
    await server.start()
  } else if (!shouldStart && server) {
    await server.stop()
  }
  return server?.status ?? null
})

app.whenReady().then(() => {
  startServer()
  createWindow()

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit()
})

app.on("before-quit", async () => {
  if (server) await server.stop()
})

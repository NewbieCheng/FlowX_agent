// ============================================================
// Electron preload — 暴露安全 API 给渲染进程
// ============================================================

const { contextBridge, ipcRenderer, shell } = require("electron")

contextBridge.exposeInMainWorld("flowxAPI", {
  getStatus: () => ipcRenderer.invoke("get-status"),
  toggleServer: (start: boolean) => ipcRenderer.invoke("toggle-server", start),
  onStatus: (cb: (status: any) => void) => {
    ipcRenderer.on("status", (_e: any, status: any) => cb(status))
  },
  openExternal: (url: string) => shell.openExternal(url),
})

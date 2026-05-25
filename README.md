# FlowX Agent

FlowX 本地 Agent — MCP Bridge + Electron 桌面版

## 安装

```bash
npm ci
npm run build
npm start
```

## Electron 桌面版

```bash
npm run electron:dev
```

## MCP 配置

在 Cursor / Windsurf / Claude Desktop 中添加：

```json
{
  "mcpServers": {
    "flowx-publish": {
      "command": "node",
      "args": ["<path>/local-agent/dist/mcp-bridge.js"]
    }
  }
}
```

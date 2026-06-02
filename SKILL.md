---
name: flowx-publish
description: Publish articles and image-text content to Chinese content platforms (Juejin, Zhihu, WeChat, Xiaohongshu, Douyin, etc.) via FlowX MCP tools. Use when the user wants to publish, post, sync, or distribute content to platforms, or mentions publishing to 掘金/知乎/微信公众号/小红书/抖音/头条/Bilibili/微博.
---

# FlowX Publish — 跨平台内容发布

通过 FlowX MCP Server 将文章和图文内容一键发布到国内主流内容平台。

## 前置条件

用户必须已安装并配置 FlowX Native Host + MCP Bridge。如果报 "Native Host 未运行"，让用户检查 Chrome 是否打开、插件是否激活。

## 可用工具

### 1. flowx_publish — 发布内容

**参数：**

| 参数 | 必填 | 说明 |
|------|------|------|
| `platforms` | 是 | 目标平台 ID 数组，如 `["juejin", "zhihu"]` |
| `title` | 提供草稿时必填 | 文章标题 |
| `content` | 否 | 正文（Markdown 或 HTML） |
| `contentFormat` | 否 | `"markdown"` 或 `"html"`，默认 markdown |
| `coverUrl` | 否 | 封面图 URL |
| `images` | 否 | 图片数组 `[{ url, alt? }]` |
| `publishMode` | 否 | 发布模式：`"article"`（默认）、`"image_text"`（小红书/抖音）、`"image_draft"`（贴图/微信） |
| `captureId` | 否 | 引用已抓取素材（与 title 互斥） |

### 2. flowx_list_platforms — 查看平台

无参数。返回可用平台及登录状态。

### 3. flowx_check_auth — 检查登录

| 参数 | 必填 | 说明 |
|------|------|------|
| `channelId` | 是 | 平台 ID |

### 4. flowx_upload_images — 上传 base64 图片

将 base64 图片托管为临时 URL，然后可传入 `flowx_publish` 的 `images` 参数。

| 参数 | 必填 | 说明 |
|------|------|------|
| `images` | 是 | `[{ dataUrl, filename? }]` |

### 5. flowx_read_local_files — 读取本地文件（新增）

读取用户本地图片或文本文件，图片自动托管为 URL，文本返回内容。

| 参数 | 必填 | 说明 |
|------|------|------|
| `filePaths` | 是 | 本地文件路径数组，如 `["C:/1.png", "./readme.md"]` |

**适用场景：** 用户说"把桌面上这张图发到小红书"或"用我本地文件夹里的文章内容发布"。

**处理规则：**
- 图片文件（png/jpg/gif/webp/svg） → 上传 → 返回 URL
- 文本文件（md/txt/html/json） → 返回原始内容摘要，AI 自行组装
- 返回的 URL 可直接给 `flowx_publish` 的 `images` 参数

## 发布模式（图文 vs 文章）

用 `publishMode` 参数控制以什么形式发布：

### 各平台支持的模式

| 平台 | `"article"` 文章 | `"image_text"` 图文 | `"image_draft"` 贴图 |
|------|:---:|:---:|:---:|
| `juejin` 掘金 | ✅ | ❌ | ❌ |
| `zhihu` 知乎 | ✅ | ❌ | ❌ |
| `weixin` 微信公众号 | ✅ 文章 | ❌ | ✅ **贴图草稿** |
| `xiaohongshu` 小红书 | ✅ 图文笔记 | ✅ 图文混排 | ❌ |
| `douyin` 抖音 | ✅ 文章 | ✅ **图文模式** | ❌ |
| `bilibili` Bilibili | ✅ | ❌ | ❌ |
| `toutiao` 今日头条 | ✅ | ❌ | ❌ |
| `weibo` 微博 | ✅ | ❌ | ❌ |

### 如何判断用户想发什么

| 用户说法 | 判断为 | publishMode |
|---------|--------|-------------|
| "帮我把这篇文章发到掘金" | 纯文章 | `"article"` |
| "把这篇图文笔记发到小红书" | 图文混排 | `"image_text"` |
| "把这几张图发到公众号做贴图草稿" | 微信贴图 | `"image_draft"` |
| "把我的博客发布到掘金和知乎" | 跨平台文章 | `"article"` |
| "帮我一篇图文发到抖音" | 抖音图文 | `"image_text"` |

**决策逻辑（给 Agent 的规则）：**
1. 如果内容只有正文文字 → `article`
2. 如果需要独立图片列表 + 正文 → 检查目标平台：
   - 小红书 / 抖音 → `image_text`
   - 微信公众号 → `image_draft`（贴图模式）或 `article`（文章模式）
   - 其他 → `article`（`images` 参数自动注入正文内联）
3. 如果只有图片没有正文 → 目标平台仅微信 → `image_draft`
4. 如果目标含微信且 publishMode 为 `image_text` → 转为 `article`（微信图文模式仅支持文章或贴图）

### 跨平台多模式发布

**场景：用户想把同一篇图文发到小红书（图文）和掘金（文章）。** 分析要点是同一篇内容同时有文字和图片，平台各自用各自模式：

```json
{
  "platforms": ["xiaohongshu", "juejin"],
  "title": "今日笔记",
  "content": "正文内容...",
  "images": [{ "url": "https://...", "alt": "示意图" }],
  "publishMode": "image_text"
}
```

- 小红书：走图文模式（正文 + 独立图片列表）
- 掘金：忽略 publishMode，只用文章模式
- 微信（如果出现）：`image_draft` 时走贴图；`image_text` 时降级为 `article`

## 处理用户本地文件的完整流程

当用户说"把本地文件夹里的图片发到小红书"时：

```
Step 1: flowx_read_local_files({ filePaths: ["C:/Users/.../1.png", "C:/Users/.../2.png"] })
  → 返回托管 URL

Step 2: flowx_publish({
    platforms: ["xiaohongshu"],
    title: "用户给的标题",
    content: "用户的内容",
    images: [{ url: "http://127.0.0.1:port/.../1.png", alt: "" }, { url: "http://127.0.0.1:port/.../2.png", alt: "" }],
    publishMode: "image_text"
  })
  → 发布到小红书
```

当用户说"用本地 markdown 文件内容发到掘金"时：

```
Step 1: flowx_read_local_files({ filePaths: ["./article.md"] })
  → 返回文本内容

Step 2: 从内容中提取标题和正文
  → 调用 flowx_publish({
      platforms: ["juejin"],
      title: "...",
      content: "...",
      contentFormat: "markdown"
    })
```

## 平台 ID 速查

| ID | 平台 | 默认格式 | 特有模式 |
|----|------|---------|---------|
| `juejin` | 掘金 | Markdown | — |
| `zhihu` | 知乎 | HTML | — |
| `weixin` | 微信公众号 | HTML | `image_draft` 贴图草稿 |
| `xiaohongshu` | 小红书 | HTML | `image_text` 图文笔记 |
| `douyin` | 抖音 | Markdown | `image_text` 图文模式 |
| `bilibili` | Bilibili | HTML | — |
| `toutiao` | 今日头条 | HTML | — |
| `weibo` | 微博 | HTML | — |

## CLI 版本命令

```bash
# 发布文章到掘金
node dist/cli.js publish --title "标题" --content "正文" --platforms juejin

# 图文发布到小红书
node dist/cli.js publish --title "标题" --content "正文" --platforms xiaohongshu --publish-mode image_text

# 微信贴图草稿
node dist/cli.js publish --title "标题" --platforms weixin --publish-mode image_draft

# 读取本地文件
node dist/cli.js read-local C:/Users/桌面/1.png ./docs/article.md
```

## 发布前检查清单

- [ ] 用户已明确指定目标平台
- [ ] 确定发布模式：纯文章 / 图文混排 / 贴图
- [ ] 内容已准备好（标题 + 正文 + 图片）
- [ ] 如果用本地文件，先调 `flowx_read_local_files` 获取 URL
- [ ] 图片 URL 确保可访问

## 错误处理

| 错误 | 处理方式 |
|------|---------|
| "Native Host 未运行" | 告知用户：打开 Chrome，确认插件已激活，配置中心 → 本地 Agent 为开启状态 |
| "平台未登录" | 让用户在浏览器中手动登录目标平台 |
| "发布失败" | 检查返回的具体 error；检查内容格式和平台限制 |
| "文件不存在或无法读取" | 确认路径正确，文件权限可读 |
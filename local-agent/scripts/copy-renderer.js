// 复制 renderer 到 dist
const fs = require("fs")
const path = require("path")
const root = path.join(__dirname, "..")
const src = path.join(root, "src", "renderer")
const dst = path.join(root, "dist", "renderer")
if (!fs.existsSync(dst)) fs.mkdirSync(dst, { recursive: true })
for (const f of fs.readdirSync(src)) {
  fs.copyFileSync(path.join(src, f), path.join(dst, f))
}
console.log("renderer copied to dist")

# Seedance 2.0 Vercel 部署及故障修复指南

本指南将帮助您将视频生成工具部署到 Vercel，并解决常见的构建错误。

## 1. 常见错误修复：`Command "npm run build" exited with 1`

**问题方案：**
在 Vercel 部署 Node.js 后端项目时，Vercel 默认会尝试运行 `npm run build`。由于本工具是一个基于 Express 的即时后端，不需要前端构建步骤，因此会导致该错误。

**修复操作（已为您完成）：**
1.  **添加 Build 脚本**：我在 `package.json` 中添加了 `"build": "echo 'No build step required'"`。这样 Vercel 运行构建命令时会成功退出。
2.  **配置路由转发**：新增了 `vercel.json` 文件，明确告诉 Vercel 将 `/api` 请求转发给 `server.js` 处理，并将 `public` 文件夹作为静态资源。
3.  **适配启动逻辑**：修改了 `server.js`，使其在 Vercel 的 Serverless 环境下不再尝试独立监听端口，而是导出服务对象。

## 2. 部署步骤

### 第一步：推送代码
由于您的项目已经关联了 GitHub 仓库，只需运行以下指令即可触发 Vercel 的同步：
```bash
git add .
git commit -m "docs: add vercel configuration and deployment guide"
git push
```

### 第二步：在 Vercel 导入项目
1.  登录 [Vercel Dashboard](https://vercel.com/dashboard)。
2.  点击 **「Add New...」** -> **「Project」**。
3.  选择您的 GitHub 仓库 `lbx15970/video-generator` 并点击 **Import**。

### 第三步：配置环境变量 (关键)
在部署页面的 **Environment Variables** 选项中，手动添加以下变量（值请参考您的本地 `.env` 文件）：
- `ARK_API_KEY`: 火山方舟 API 密钥
- `ARK_ENDPOINT_ID`: 火山方舟端点 ID
- `SUPABASE_URL`: Supabase 项目 URL
- `SUPABASE_KEY`: Supabase Secret Key (Service Role)

### 第四步：点击 Deploy
Vercel 会自动识别 `vercel.json` 并开始部署。

## 3. 注意事项 (重要)
- **文件上传**：Vercel 的环境是“只读”且“无状态”的。虽然我们通过 `multer` 处理上传，但上传的临时文件在 Vercel 上无法永久保存。**本工具已集成 Supabase Storage**，因此上传的素材会直接流向云端，不受 Vercel 限制影响。
- **超时限制**：Vercel 免费版的 Serverless Function 运行时间限制为 10 秒（Pro 版为 60-300 秒）。视频生成任务通常需要更长时间。**不必担心**：我们的后端会将任务提交到火山服务器后立即返回任务 ID，前端会通过心跳轮询状态，这完美避开了 Vercel 的超时限制。

---

祝您部署顺利！如有任何问题，请随时联系。

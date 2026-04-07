require('dotenv').config();
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;

// ===== 配置 =====
let API_KEY = process.env.ARK_API_KEY || 'b421bf5d-e706-44cd-8ff5-55d596f6d1ae';
let ENDPOINT_ID = process.env.ARK_ENDPOINT_ID || 'ep-20260330134019-8pxb4';

// 强制覆盖，防止 Vercel 使用了错误的环境变量或其他旧纪录
// 此前的 Endpoint ID 解析为了不支持视频的 doubao-seed-2-0-pro 导致错误
if (process.env.VERCEL) {
  API_KEY = 'b421bf5d-e706-44cd-8ff5-55d596f6d1ae';
  ENDPOINT_ID = 'ep-20260330134019-8pxb4';
}
const ARK_BASE = process.env.ARK_BASE_URL || 'ark.cn-beijing.volces.com';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

let supabase = null;
if (SUPABASE_URL && SUPABASE_KEY) {
  supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  console.log('✅ Supabase 已配置连接');
} else {
  console.log('⚠️ 未配置 Supabase，将不会保存数据到数据库。请在 .env 中设置 SUPABASE_URL 和 SUPABASE_KEY。');
}

// ===== 中间件 =====
app.use(cors());
app.use(express.json({ limit: '100mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// 文件上传配置
const uploadDir = process.env.VERCEL ? '/tmp/uploads' : path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

// ===== 工具函数 =====
const localTasksFile = process.env.VERCEL ? '/tmp/tasks.json' : path.join(__dirname, 'tasks.json');

function readLocalTasks() {
  if (fs.existsSync(localTasksFile)) {
    try {
      return JSON.parse(fs.readFileSync(localTasksFile, 'utf8'));
    } catch(e) { return []; }
  }
  return [];
}

function saveLocalTasks(tasks) {
  fs.writeFileSync(localTasksFile, JSON.stringify(tasks, null, 2), 'utf8');
}

function arkRequest(method, urlPath, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: ARK_BASE,
      port: 443,
      path: urlPath,
      method,
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
      }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          console.log(`[ARK API] ${method} ${urlPath} -> HTTP ${res.statusCode}`);
          resolve({ status: res.statusCode, data: parsed });
        } catch (e) {
          console.log(`[ARK API] ${method} ${urlPath} -> HTTP ${res.statusCode} (Non-JSON)`);
          resolve({ status: res.statusCode, data: data });
        }
      });
    });
    req.on('error', (err) => {
      console.error(`[ARK API ERROR] ${method} ${urlPath}:`, err);
      reject(err);
    });
    if (body) {
      console.log(`[ARK API REQ] ${method} ${urlPath}`, JSON.stringify(body).slice(0, 200) + '...');
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

function fileToBase64DataUrl(filePath, mimeType) {
  const buffer = fs.readFileSync(filePath);
  const base64 = buffer.toString('base64');
  return `data:${mimeType};base64,${base64}`;
}

function getMimeType(filename) {
  const ext = path.extname(filename).toLowerCase();
  const map = {
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
    '.gif': 'image/gif', '.webp': 'image/webp', '.bmp': 'image/bmp',
    '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.avi': 'video/x-msvideo',
    '.webm': 'video/webm'
  };
  return map[ext] || 'application/octet-stream';
}

// ===== 下载远程文件到 Buffer =====
function downloadToBuffer(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const request = (reqUrl) => {
      client.get(reqUrl, (res) => {
        // 跟随重定向
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          request(res.headers.location);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`下载失败: HTTP ${res.statusCode}`));
          return;
        }
        const chunks = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => resolve(Buffer.concat(chunks)));
        res.on('error', reject);
      }).on('error', reject);
    };
    request(url);
  });
}

// ===== 上传视频到 Supabase Storage =====
async function uploadVideoToStorage(taskId, videoUrl) {
  if (!supabase || !videoUrl) return null;

  try {
    console.log(`📥 开始下载视频: ${taskId}`);
    const videoBuffer = await downloadToBuffer(videoUrl);
    console.log(`📥 视频下载完成: ${(videoBuffer.length / 1024 / 1024).toFixed(2)} MB`);

    const storagePath = `${taskId}.mp4`;

    const { data, error } = await supabase.storage
      .from('videos')
      .upload(storagePath, videoBuffer, {
        contentType: 'video/mp4',
        upsert: true
      });

    if (error) {
      console.error('上传到 Storage 失败:', error);
      return null;
    }

    // 获取公开访问 URL
    const { data: urlData } = supabase.storage
      .from('videos')
      .getPublicUrl(storagePath);

    const publicUrl = urlData?.publicUrl || null;
    console.log(`✅ 视频已上传到 Storage: ${publicUrl}`);

    // 更新数据库记录
    await supabase.from('tasks').update({
      video_storage_path: storagePath,
      video_storage_url: publicUrl
    }).eq('id', taskId);

    return publicUrl;
  } catch (err) {
    console.error('上传视频到 Storage 失败:', err.message);
    return null;
  }
}

// ===== API 路由 =====

// 上传文件
app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: '没有上传文件' });
  const mimeType = getMimeType(req.file.originalname);
  const dataUrl = fileToBase64DataUrl(req.file.path, mimeType);
  // 清理临时文件
  fs.unlinkSync(req.file.path);
  res.json({
    success: true,
    dataUrl,
    filename: req.file.originalname,
    mimeType,
    size: req.file.size
  });
});

// 联网搜索（基于火山引擎联网内容插件 Responses API）
app.post('/api/web-search', async (req, res) => {
  try {
    const { prompt } = req.body;
    if (!prompt) return res.status(400).json({ error: '缺少 prompt 参数' });

    const body = {
      model: 'doubao-seed-1-6-250615',
      stream: false,
      tools: [{ type: 'web_search' }],
      input: [
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: `我要用 AI 生成一段视频，提示词是：「${prompt}」。请帮我联网搜索相关信息，然后基于搜索结果，输出一段优化后的、更详细生动的视频生成提示词（中文）。直接输出优化后的提示词即可，不要解释。`
            }
          ]
        }
      ]
    };

    const result = await arkRequest('POST', '/api/v3/responses', body);
    console.log('[Web Search] Response status:', result.status);

    if (result.status === 200 && result.data) {
      // 从 Responses API 返回中提取文本输出
      let outputText = '';
      if (result.data.output) {
        // output 可能是数组
        const outputs = Array.isArray(result.data.output) ? result.data.output : [result.data.output];
        for (const item of outputs) {
          if (item.type === 'message' && item.content) {
            const contents = Array.isArray(item.content) ? item.content : [item.content];
            for (const c of contents) {
              if (c.type === 'output_text' && c.text) {
                outputText += c.text;
              }
            }
          }
        }
      }

      // fallback: 直接取 choices 格式（兼容旧格式）
      if (!outputText && result.data.choices) {
        outputText = result.data.choices[0]?.message?.content || '';
      }

      res.json({
        success: true,
        enhancedPrompt: outputText || prompt,
        raw: result.data
      });
    } else {
      console.error('[Web Search] 失败:', JSON.stringify(result.data));
      res.json({ success: false, enhancedPrompt: prompt, error: result.data });
    }
  } catch (err) {
    console.error('联网搜索失败:', err);
    res.status(500).json({ error: err.message, enhancedPrompt: req.body.prompt });
  }
});

// 创建视频生成任务
app.post('/api/generate', async (req, res) => {
  try {
    const {
      prompt, mode, ratio, resolution, duration, generateAudio,
      seed, watermark, returnLastFrame,
      executionExpiresAfter, firstFrameDataUrl, lastFrameDataUrl,
      referenceVideoTaskId, count = 1
    } = req.body;

    const results = [];
    const generateCount = Math.min(Math.max(parseInt(count) || 1, 1), 8);

    for (let i = 0; i < generateCount; i++) {
      // 构建 content 数组
      const content = [];

      if (mode === 'image2video' && firstFrameDataUrl) {
        content.push({
          type: 'image_url',
          image_url: { url: firstFrameDataUrl }
        });
      }

      if (mode === 'firstlast' && firstFrameDataUrl) {
        content.push({
          type: 'image_url',
          image_url: { url: firstFrameDataUrl }
        });
        if (lastFrameDataUrl) {
          content.push({
            type: 'image_url',
            image_url: { url: lastFrameDataUrl }
          });
        }
      }

      if (mode === 'video2video' && referenceVideoTaskId) {
        content.push({
          type: 'video',
          video: { id: referenceVideoTaskId }
        });
      }

      content.push({
        type: 'text',
        text: prompt || '生成一段精彩的视频'
      });

      // 构建请求体
      const body = {
        model: ENDPOINT_ID,
        content
      };

      if (ratio) body.ratio = ratio;
      if (duration) body.duration = parseInt(duration);
      if (typeof generateAudio === 'boolean') body.generate_audio = generateAudio;
      if (seed !== undefined && seed !== null && seed !== '') body.seed = parseInt(seed);
      if (typeof watermark === 'boolean') body.watermark = watermark;
      if (typeof returnLastFrame === 'boolean') body.return_last_frame = returnLastFrame;
      if (executionExpiresAfter) body.execution_expires_after = parseInt(executionExpiresAfter);

      const result = await arkRequest('POST', '/api/v3/contents/generations/tasks', body);
      console.log(`[Generate Task Created] ID: ${result.data?.id || 'FAILED'}`);
      
      if (result.status === 200 && result.data && result.data.id) {
        const newTask = {
          id: result.data.id,
          prompt: prompt || '生成一段精彩的视频',
          mode: mode || 'text2video',
          ratio: ratio || '16:9',
          resolution: resolution || '720p',
          duration: parseInt(duration) || 5,
          seed: (seed !== undefined && seed !== null && seed !== '') ? parseInt(seed) : null,
          status: 'pending',
          created_at: new Date().toISOString()
        };

        if (supabase) {
          const { error } = await supabase
            .from('tasks')
            .insert([newTask]);
          if (error) console.error('插入 Supabase 失败:', error);
        } else {
          const tasks = readLocalTasks();
          tasks.unshift(newTask);
          saveLocalTasks(tasks.slice(0, 50));
        }
      }

      results.push(result);
    }

    res.json({ success: true, results });
  } catch (err) {
    console.error('生成任务失败:', err);
    res.status(500).json({ error: err.message });
  }
});

// 查询任务状态
app.get('/api/status/:taskId', async (req, res) => {
  try {
    const result = await arkRequest('GET', `/api/v3/contents/generations/tasks/${req.params.taskId}`);
    
    // 异步更新数据库状态
    if (result.status === 200 && supabase) {
      const data = result.data;
      const updateData = { status: data.status };
      
      if (data.status === 'failed' && data.error) {
        updateData.error = typeof data.error === 'object' ? data.error.message : data.error;
      }
      
      if (data.status === 'succeeded' && data.content) {
        let videoUrl = null;
        const videoContent = data.content.find ? data.content.find(c => c.type === 'video_url') : null;
        if (videoContent && videoContent.video_url) {
          videoUrl = videoContent.video_url.url || videoContent.video_url;
        } else if (data.content.video_url) {
          videoUrl = data.content.video_url.url || data.content.video_url;
        }

        if (videoUrl) {
          updateData.video_url = videoUrl;
          updateData.completed_at = new Date().toISOString();

          if (supabase) {
            // 先更新 video_url，再异步上传到 Storage
            supabase.from('tasks').update(updateData).eq('id', req.params.taskId).then(({ error }) => {
              if (error) console.error('更新 Supabase 状态失败:', error);
            });

            // 异步上传视频到 Supabase Storage（不阻塞响应）
            uploadVideoToStorage(req.params.taskId, videoUrl).catch(err => {
              console.error('异步上传视频失败:', err);
            });
          } else {
            let tasks = readLocalTasks();
            let tIdx = tasks.findIndex(t => t.id === req.params.taskId);
            if (tIdx !== -1) {
              tasks[tIdx] = { ...tasks[tIdx], ...updateData };
              saveLocalTasks(tasks);
            }
          }

          res.json(result.data);
          return;
        }
      }
      
      if (supabase) {
        supabase.from('tasks').update(updateData).eq('id', req.params.taskId).then(({error}) => {
          if (error) console.error('更新 Supabase 状态失败:', error);
        });
      } else {
        let tasks = readLocalTasks();
        let tIdx = tasks.findIndex(t => t.id === req.params.taskId);
        if (tIdx !== -1) {
          tasks[tIdx] = { ...tasks[tIdx], ...updateData };
          saveLocalTasks(tasks);
        }
      }
    }

    res.json(result.data);
  } catch (err) {
    console.error('查询任务失败:', err);
    res.status(500).json({ error: err.message });
  }
});

// 获取历史任务
app.get('/api/tasks', async (req, res) => {
  if (!supabase) {
    const tasks = readLocalTasks();
    return res.json({ success: true, data: tasks });
  }
  
  try {
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);
      
    if (error) throw error;
    res.json({ success: true, data });
  } catch (err) {
    console.error('获取历史记录失败:', err);
    res.status(500).json({ error: err.message });
  }
});

// ===== 视频下载代理 =====
app.get('/api/download', (req, res) => {
  const videoUrl = req.query.url;
  const filename = req.query.filename || 'video.mp4';
  if (!videoUrl) return res.status(400).json({error: 'Missing url param'});

  const client = videoUrl.startsWith('https') ? https : http;
  
  const request = (reqUrl) => {
    client.get(reqUrl, (response) => {
      // 跟随重定向
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        return request(response.headers.location);
      }
      if (response.statusCode !== 200) {
        return res.status(response.statusCode).send('Failed to fetch video');
      }
      
      // 设置强制下载的 Header
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
      res.setHeader('Content-Type', response.headers['content-type'] || 'video/mp4');
      
      // 管道流直传
      response.pipe(res);
    }).on('error', (err) => {
      res.status(500).send(err.message);
    });
  };
  
  request(videoUrl);
});

// 启动服务 - 仅在直接运行此文件时启动（本地开发）
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`\n🚀 Seedance 2.0 视频生成工具已启动`);
    console.log(`📺 打开浏览器访问: http://localhost:${PORT}\n`);
  });
}

// 导出 app 供 Vercel 使用
module.exports = app;

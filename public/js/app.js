// ===== Seedance 2.0 Frontend App =====

// ===== State =====
const state = {
  mode: 'text2video',
  // 上传的素材列表，每个 { id, name, dataUrl, localPreviewUrl, fileName }
  assets: [],
  assetCounter: 0,
  tasks: [],
  pollingIntervals: {},
  mentionActiveIndex: 0
};

// ===== DOM Elements =====
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// ===== Toast =====
function showToast(message, type = 'info') {
  let container = $('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.animation = 'slideOut 0.3s ease forwards';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ===== Mode Switching =====
$$('.mode-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    $$('.mode-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.mode = btn.dataset.mode;
    updateUploadVisibility();
  });
});

function updateUploadVisibility() {
  const uploadPanel = $('#uploadPanel');
  const lastFrameZone = $('#lastFrameZone');
  const uploadTitle = $('#uploadTitle');

  if (state.mode === 'text2video') {
    uploadPanel.style.display = 'none';
  } else if (state.mode === 'image2video') {
    uploadPanel.style.display = 'block';
    lastFrameZone.style.display = 'none';
    uploadTitle.textContent = '参考图片（首帧）';
  } else if (state.mode === 'firstlast') {
    uploadPanel.style.display = 'block';
    lastFrameZone.style.display = 'block';
    uploadTitle.textContent = '首尾帧图片';
  }
}

// ===== 素材管理 =====
function addAsset(dataUrl, localPreviewUrl, fileName, role) {
  state.assetCounter++;
  const asset = {
    id: state.assetCounter,
    name: `素材${state.assetCounter}`,
    dataUrl,
    localPreviewUrl,
    fileName,
    role  // 'firstFrame' | 'lastFrame'
  };
  // 移除相同 role 的旧素材
  state.assets = state.assets.filter(a => a.role !== role);
  state.assets.push(asset);
  updateAssetTags();
  return asset;
}

function removeAssetByRole(role) {
  state.assets = state.assets.filter(a => a.role !== role);
  updateAssetTags();
}

function getAssetByRole(role) {
  return state.assets.find(a => a.role === role);
}

// ===== @素材标签 =====
function updateAssetTags() {
  const container = $('#uploadedAssets');
  const tagsEl = $('#assetsTags');

  if (state.assets.length === 0) {
    container.style.display = 'none';
    return;
  }

  container.style.display = 'block';
  tagsEl.innerHTML = state.assets.map(a => `
    <span class="asset-tag" data-name="${a.name}" title="点击插入 @${a.name} 到提示词中">
      <img src="${a.localPreviewUrl}" class="asset-tag-thumb" alt="${a.name}">
      ${a.name}
      <span style="color:var(--text-muted);font-size:0.65rem">(${a.fileName})</span>
    </span>
  `).join('');

  tagsEl.querySelectorAll('.asset-tag').forEach(tag => {
    tag.addEventListener('click', () => {
      insertMention(tag.dataset.name);
    });
  });
}

function insertMention(name) {
  const input = $('#promptInput');
  const cursorPos = input.selectionStart;
  const text = input.value;

  // 检查光标前是否已有 @ 开头的部分 mention 文本，需要替换
  const beforeCursor = text.slice(0, cursorPos);
  const atIdx = beforeCursor.lastIndexOf('@');

  let insertStart = cursorPos;
  if (atIdx !== -1) {
    // 检查 @ 到光标之间没有空格（说明正在输入 mention）
    const between = beforeCursor.slice(atIdx + 1);
    if (!between.includes(' ') && !between.includes('\n')) {
      insertStart = atIdx;
    }
  }

  const insertText = `@${name} `;
  input.value = text.slice(0, insertStart) + insertText + text.slice(cursorPos);
  input.focus();
  input.selectionStart = input.selectionEnd = insertStart + insertText.length;
  hideMentionPopup();
  showToast(`已插入 @${name}`, 'success');
}

// ===== @Mention 自动弹出 =====
function showMentionPopup(filter = '') {
  const popup = $('#mentionPopup');
  const assets = state.assets.filter(a =>
    filter === '' || a.name.includes(filter)
  );

  if (assets.length === 0) {
    hideMentionPopup();
    return;
  }

  state.mentionActiveIndex = 0;

  popup.innerHTML = `
    <div class="mention-popup-header">选择素材引用</div>
    ${assets.map((a, i) => `
      <div class="mention-item ${i === 0 ? 'active' : ''}" data-name="${a.name}" data-index="${i}">
        <img src="${a.localPreviewUrl}" class="mention-item-thumb" alt="${a.name}">
        <div class="mention-item-info">
          <span class="mention-item-name">${a.name}</span>
          <span class="mention-item-file">${a.fileName}</span>
        </div>
      </div>
    `).join('')}
  `;

  popup.style.display = 'block';

  // 点击选择
  popup.querySelectorAll('.mention-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      insertMention(item.dataset.name);
    });
  });
}

function hideMentionPopup() {
  $('#mentionPopup').style.display = 'none';
}

function updateMentionHighlight() {
  const items = $$('#mentionPopup .mention-item');
  items.forEach((item, i) => {
    item.classList.toggle('active', i === state.mentionActiveIndex);
  });
}

// 提示词输入框监听
$('#promptInput').addEventListener('input', (e) => {
  const input = e.target;
  const text = input.value;
  const cursorPos = input.selectionStart;
  const beforeCursor = text.slice(0, cursorPos);

  // 找最近的 @
  const atIdx = beforeCursor.lastIndexOf('@');
  if (atIdx !== -1) {
    const between = beforeCursor.slice(atIdx + 1);
    // @ 后面没有空格/换行 → 正在输入 mention
    if (!between.includes(' ') && !between.includes('\n')) {
      if (state.assets.length > 0) {
        showMentionPopup(between);
        return;
      }
    }
  }
  hideMentionPopup();
});

$('#promptInput').addEventListener('keydown', (e) => {
  const popup = $('#mentionPopup');
  if (popup.style.display === 'none') return;

  const items = popup.querySelectorAll('.mention-item');
  if (items.length === 0) return;

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    state.mentionActiveIndex = (state.mentionActiveIndex + 1) % items.length;
    updateMentionHighlight();
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    state.mentionActiveIndex = (state.mentionActiveIndex - 1 + items.length) % items.length;
    updateMentionHighlight();
  } else if (e.key === 'Enter') {
    e.preventDefault();
    const activeItem = items[state.mentionActiveIndex];
    if (activeItem) insertMention(activeItem.dataset.name);
  } else if (e.key === 'Escape') {
    hideMentionPopup();
  }
});

// 点击外部关闭
document.addEventListener('click', (e) => {
  if (!e.target.closest('.prompt-wrapper')) {
    hideMentionPopup();
  }
});

// ===== File Upload =====
function setupUploadZone(zoneId, inputId, previewId, placeholderId, removeId, role) {
  const zone = $(`#${zoneId}`);
  const input = $(`#${inputId}`);
  const preview = $(`#${previewId}`);
  const placeholder = $(`#${placeholderId}`);
  const removeBtn = $(`#${removeId}`);

  zone.addEventListener('click', (e) => {
    if (e.target !== removeBtn) input.click();
  });

  zone.addEventListener('dragover', (e) => {
    e.preventDefault();
    zone.classList.add('dragover');
  });

  zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));

  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('dragover');
    if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
  });

  input.addEventListener('change', () => {
    if (input.files[0]) handleFile(input.files[0]);
  });

  removeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    clearUpload();
  });

  function handleFile(file) {
    if (!file.type.startsWith('image/')) {
      showToast('请上传图片文件', 'error');
      return;
    }
    // 先读取本地预览
    const reader = new FileReader();
    reader.onload = () => {
      const localPreviewUrl = reader.result;
      preview.src = localPreviewUrl;
      preview.style.display = 'block';
      placeholder.style.display = 'none';
      removeBtn.style.display = 'flex';
      zone.classList.add('has-file');

      // 上传到服务器获取 base64
      uploadFile(file).then(dataUrl => {
        if (!dataUrl) return;
        const asset = addAsset(dataUrl, localPreviewUrl, file.name, role);
        showToast(`已上传为 ${asset.name}`, 'success');
      });
    };
    reader.readAsDataURL(file);
  }

  function clearUpload() {
    removeAssetByRole(role);
    preview.src = '';
    preview.style.display = 'none';
    placeholder.style.display = 'flex';
    removeBtn.style.display = 'none';
    zone.classList.remove('has-file');
    input.value = '';
  }
}

setupUploadZone('firstFrameZone', 'firstFrameInput', 'firstFramePreview', 'firstFramePlaceholder', 'firstFrameRemove', 'firstFrame');
setupUploadZone('lastFrameZone', 'lastFrameInput', 'lastFramePreview', 'lastFramePlaceholder', 'lastFrameRemove', 'lastFrame');

async function uploadFile(file) {
  const formData = new FormData();
  formData.append('file', file);
  try {
    const res = await fetch('/api/upload', { method: 'POST', body: formData });
    const data = await res.json();
    if (data.success) return data.dataUrl;
    throw new Error(data.error);
  } catch (err) {
    showToast('文件上传失败: ' + err.message, 'error');
    return null;
  }
}

// ===== Duration Slider =====
const durationSlider = $('#durationSlider');
const durationValue = $('#durationValue');
durationSlider.addEventListener('input', () => {
  durationValue.textContent = `${durationSlider.value} 秒`;
  updateCostEstimate();
});

// ===== Count Input =====
const countInput = $('#countInput');
$('#countMinus').addEventListener('click', () => {
  countInput.value = Math.max(1, parseInt(countInput.value) - 1);
  updateCostEstimate();
});
$('#countPlus').addEventListener('click', () => {
  countInput.value = Math.min(8, parseInt(countInput.value) + 1);
  updateCostEstimate();
});
countInput.addEventListener('change', () => {
  countInput.value = Math.min(8, Math.max(1, parseInt(countInput.value) || 1));
  updateCostEstimate();
});

// ===== Advanced Params Toggle =====
$('#advancedToggle').addEventListener('click', () => {
  const params = $('#advancedParams');
  const toggle = $('#advancedToggle');
  const isOpen = params.style.display !== 'none';
  params.style.display = isOpen ? 'none' : 'block';
  toggle.classList.toggle('open', !isOpen);
});

// ===== Cost Estimate =====
function updateCostEstimate() {
  const duration = parseInt(durationSlider.value);
  const count = parseInt(countInput.value) || 1;
  const resolution = $('#resolutionSelect').value;

  const tokensPerSec = resolution === '720p' ? 1800 : 1200;
  const totalTokens = duration * tokensPerSec;
  const singleCost = (totalTokens / 1000) * 0.046;
  const totalCost = singleCost * count;

  $('#singleCost').textContent = `≈ ¥${singleCost.toFixed(3)}`;
  $('#totalCost').textContent = `≈ ¥${totalCost.toFixed(3)}`;
}

$('#resolutionSelect').addEventListener('change', updateCostEstimate);
updateCostEstimate();

// ===== Generate =====
$('#generateBtn').addEventListener('click', async () => {
  const prompt = $('#promptInput').value.trim();
  if (!prompt && state.mode === 'text2video') {
    showToast('请输入视频描述', 'error');
    return;
  }

  const firstFrameAsset = getAssetByRole('firstFrame');
  const lastFrameAsset = getAssetByRole('lastFrame');

  if (state.mode === 'image2video' && !firstFrameAsset) {
    showToast('请上传首帧参考图片', 'error');
    return;
  }
  if (state.mode === 'firstlast' && !firstFrameAsset) {
    showToast('请上传首帧图片', 'error');
    return;
  }

  const btn = $('#generateBtn');
  btn.disabled = true;
  btn.classList.add('loading');
  btn.innerHTML = `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
    生成中...
  `;

  try {
    let finalPrompt = prompt || '生成一段精彩的视频';

    // 如果开启了联网搜索，先用联网搜索增强提示词
    const webSearchEnabled = $('#webSearchToggle').checked;
    if (webSearchEnabled && finalPrompt) {
      btn.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        联网搜索中...
      `;
      try {
        const searchRes = await fetch('/api/web-search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: finalPrompt })
        });
        const searchData = await searchRes.json();
        if (searchData.success && searchData.enhancedPrompt) {
          finalPrompt = searchData.enhancedPrompt;
          showToast('联网搜索完成，已优化提示词', 'success');
        } else {
          showToast('联网搜索未返回有效结果，使用原始提示词', 'info');
        }
      } catch (searchErr) {
        console.error('联网搜索失败:', searchErr);
        showToast('联网搜索失败，使用原始提示词继续', 'error');
      }
      btn.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
        生成中...
      `;
    }

    const body = {
      prompt: finalPrompt,
      mode: state.mode,
      resolution: $('#resolutionSelect').value,
      ratio: $('#ratioSelect').value,
      duration: parseInt(durationSlider.value),
      generateAudio: $('#audioToggle').checked,
      count: parseInt(countInput.value) || 1,
      watermark: $('#watermarkToggle').checked,
      returnLastFrame: $('#lastFrameToggle').checked
    };

    const seed = $('#seedInput').value;
    if (seed && seed.trim() !== '' && parseInt(seed) !== -1) body.seed = parseInt(seed);

    const timeout = $('#timeoutInput').value;
    if (timeout && timeout.trim() !== '') body.executionExpiresAfter = parseInt(timeout);

    if (firstFrameAsset) body.firstFrameDataUrl = firstFrameAsset.dataUrl;
    if (lastFrameAsset) body.lastFrameDataUrl = lastFrameAsset.dataUrl;

    const apiUrl = new URL('/api/generate', window.location.origin).href;
    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(body)
    });

    const data = await res.json();

    if (data.success && data.results) {
      data.results.forEach((result, index) => {
        if (result.status === 200 && result.data && result.data.id) {
          const task = {
            id: result.data.id,
            index: state.tasks.length + 1,
            status: result.data.status || 'pending',
            prompt: finalPrompt,
            resolution: $('#resolutionSelect').value,
            ratio: $('#ratioSelect').value,
            duration: body.duration || 5,
            createdAt: new Date().toISOString(),
            videoUrl: null,
            error: null,
            progress: 0
          };
          state.tasks.push(task);
          addResultCard(task);
          startPolling(task.id);
        } else {
          showToast(`第 ${index + 1} 条任务创建失败: ${JSON.stringify(result.data)}`, 'error');
        }
      });
      updateTaskCounter();
      showToast(`已提交 ${data.results.length} 个生成任务`, 'success');
    } else {
      showToast('任务创建失败: ' + JSON.stringify(data), 'error');
    }
  } catch (err) {
    console.error(err);
    showToast('请求失败: ' + (err.name ? err.name + ': ' : '') + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.classList.remove('loading');
    btn.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
      开始生成
    `;
  }
});

// ===== Result Cards =====
function addResultCard(task) {
  const emptyState = $('#emptyState');
  if (emptyState) emptyState.style.display = 'none';

  const grid = $('#resultsGrid');
  const card = document.createElement('div');
  card.className = 'result-card';
  card.id = `task-${task.id}`;
  card.innerHTML = `
    <div class="result-card-header">
      <span class="result-card-title">任务 #${task.index}</span>
      <span class="result-status pending" id="status-${task.id}">
        <span class="status-dot pulse"></span>
        排队中
      </span>
    </div>
    <div class="result-card-info" style="font-size: 0.8rem; color: var(--text-secondary); margin: 8px 16px 0; display: flex; flex-direction: column; gap: 4px;">
      <div style="font-weight: 500; color: var(--text-primary); text-overflow: ellipsis; overflow: hidden; white-space: nowrap;" title="${task.prompt || ''}">提示词: ${task.prompt || '默认提示词'}</div>
      <div>参数: ${task.resolution || '720p'} | ${task.ratio || '16:9'} | ${task.duration || 5} 秒</div>
    </div>
    <div class="result-card-body" id="body-${task.id}">
      <div class="result-loading">
        <div class="loading-spinner"></div>
        <span>等待生成...</span>
        <div class="progress-container">
          <div class="progress-bar indeterminate"></div>
        </div>
        <button class="refresh-btn" onclick="refreshTaskStatus('${task.id}')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
          刷新进度
        </button>
      </div>
    </div>
  `;
  grid.prepend(card);
}

function renderLoadingBody(task) {
  const isProcessing = task.status === 'processing';
  const statusText = isProcessing ? '视频生成中' : '排队等待中';
  const progress = task.progress || 0;
  const hasProgress = isProcessing && progress > 0;

  const estimatedTimeSeconds = (task.duration || 5) * 15;
  const estimatedTimeText = estimatedTimeSeconds > 60 
    ? `约 ${Math.floor(estimatedTimeSeconds/60)}分${estimatedTimeSeconds%60}秒` 
    : `约 ${estimatedTimeSeconds} 秒`;

  return `
    <div class="result-loading">
      <div class="loading-spinner"></div>
      <span>${statusText}${hasProgress ? ` · ${progress}%` : '...'}</span>
      <div style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 6px;">
        预计生成时间与视频时长有关：${estimatedTimeText}
      </div>
      <div class="progress-container">
        <div class="progress-bar ${hasProgress ? '' : 'indeterminate'}" style="${hasProgress ? `width:${progress}%` : ''}"></div>
      </div>
      <button class="refresh-btn" onclick="refreshTaskStatus('${task.id}')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
        刷新进度
      </button>
    </div>
  `;
}

async function refreshTaskStatus(taskId) {
  const taskEl = document.getElementById(`task-${taskId}`);
  const btn = taskEl ? taskEl.querySelector('.refresh-btn') : null;
  if (btn) {
    btn.disabled = true;
    btn.classList.add('spinning');
  }

  try {
    const res = await fetch(`/api/status/${taskId}`);
    const data = await res.json();
    const task = state.tasks.find(t => t.id === taskId);
    if (!task) return;

    task.status = data.status || task.status;
    // 尝试从各种可能的字段中解析进度
    if (data.progress !== undefined) {
      task.progress = Math.round(data.progress);
    } else if (data.usage && data.usage.completion_tokens && data.usage.total_tokens) {
      task.progress = Math.round((data.usage.completion_tokens / data.usage.total_tokens) * 100);
    }

    if (data.status === 'succeeded' || data.status === 'failed') {
      if (data.status === 'succeeded') {
        extractVideoUrl(task, data);
      } else {
        task.error = data.error?.message || data.error || '未知错误';
      }
      stopPolling(taskId);
      updateTaskCounter();
    }

    updateResultCard(task);
    if (task.status === 'pending' || task.status === 'processing') {
      showToast(`任务 #${task.index}: ${task.status === 'processing' ? '生成中' : '排队中'}${task.progress ? ` (${task.progress}%)` : ''}`, 'info');
    }
  } catch (err) {
    showToast('刷新失败: ' + err.message, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.classList.remove('spinning');
    }
  }
}

function updateResultCard(task) {
  const statusEl = document.getElementById(`status-${task.id}`);
  const bodyEl = document.getElementById(`body-${task.id}`);
  const cardEl = document.getElementById(`task-${task.id}`);

  if (!statusEl || !bodyEl) return;

  const statusMap = {
    pending: { text: '排队中', class: 'pending', dot: 'pulse' },
    processing: { text: `生成中${task.progress ? ` ${task.progress}%` : ''}`, class: 'processing', dot: 'pulse' },
    succeeded: { text: '已完成', class: 'succeeded', dot: '' },
    failed: { text: '失败', class: 'failed', dot: '' }
  };

  const s = statusMap[task.status] || statusMap.pending;
  statusEl.className = `result-status ${s.class}`;
  statusEl.innerHTML = `<span class="status-dot ${s.dot}"></span>${s.text}`;

  if (task.status === 'pending' || task.status === 'processing') {
    bodyEl.innerHTML = renderLoadingBody(task);
  }

  if (task.status === 'succeeded' && task.videoUrl) {
    bodyEl.innerHTML = `
      <video controls autoplay muted loop>
        <source src="${task.videoUrl}" type="video/mp4">
      </video>
    `;
    const existingFooter = cardEl.querySelector('.result-card-footer');
    if (!existingFooter) {
      const footer = document.createElement('div');
      footer.className = 'result-card-footer';
      footer.innerHTML = `
        <a href="/api/download?url=${encodeURIComponent(task.videoUrl)}&filename=${encodeURIComponent('Seedance_' + task.id + '.mp4')}" class="result-action-btn" target="_blank">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          下载
        </a>
        <button class="result-action-btn" onclick="window.open('${task.videoUrl}','_blank')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
          新窗口
        </button>
      `;
      cardEl.appendChild(footer);
    }
  }

  if (task.status === 'failed') {
    bodyEl.innerHTML = `
      <div class="result-error">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
        <p style="margin-top:8px">${task.error || '生成失败，请重试'}</p>
      </div>
    `;
  }
}

// ===== 提取视频 URL =====
function extractVideoUrl(task, data) {
  if (!data.content) return;
  const videoContent = data.content.find ? data.content.find(c => c.type === 'video_url') : null;
  if (videoContent && videoContent.video_url) {
    task.videoUrl = videoContent.video_url.url || videoContent.video_url;
  } else if (data.content.video_url) {
    task.videoUrl = data.content.video_url.url || data.content.video_url;
  } else if (typeof data.content === 'object') {
    for (const key of Object.keys(data.content)) {
      const val = data.content[key];
      if (typeof val === 'string' && (val.includes('http') || val.includes('.mp4'))) {
        task.videoUrl = val;
        break;
      }
    }
  }
}

// ===== Polling =====
function startPolling(taskId) {
  // 如果已经有正在运行的轮询，不要再开一个新的
  if (state.pollingIntervals[taskId]) {
    console.log(`[Polling] 任务 ${taskId} 的轮询已在进行中`);
    return;
  }

  const poll = async () => {
    try {
      const res = await fetch(`/api/status/${taskId}`);
      const data = await res.json();

      const task = state.tasks.find(t => t.id === taskId);
      if (!task) {
        stopPolling(taskId);
        return;
      }

      task.status = data.status || task.status;

      // 解析并更新进度
      if (data.progress !== undefined) {
        task.progress = Math.round(data.progress);
      } else if (data.usage && data.usage.completion_tokens && data.usage.total_tokens) {
        task.progress = Math.round((data.usage.completion_tokens / data.usage.total_tokens) * 100);
      }

      // 处理终态
      if (data.status === 'succeeded' || data.status === 'failed') {
        if (data.status === 'succeeded') {
          extractVideoUrl(task, data);
        } else {
          task.error = data.error?.message || data.error || '生成失败';
        }
        stopPolling(taskId);
        updateTaskCounter();
      }

      // 刷新 UI 卡片显示
      updateResultCard(task);
      
      // 如果还在运行中，安排下一次轮询
      if (task.status === 'pending' || task.status === 'processing') {
        state.pollingIntervals[taskId] = setTimeout(poll, 5000);
      }
    } catch (err) {
      console.error(`[Polling Error] 任务 ${taskId} 轮询失败:`, err);
      // 报错也别死，5秒后再试一次
      state.pollingIntervals[taskId] = setTimeout(poll, 5000);
    }
  };

  // 稍微延迟后发起第一次请求
  state.pollingIntervals[taskId] = setTimeout(poll, 2000);
}

function stopPolling(taskId) {
  if (state.pollingIntervals[taskId]) {
    clearTimeout(state.pollingIntervals[taskId]);
    delete state.pollingIntervals[taskId];
  }
}

function updateTaskCounter() {
  const running = state.tasks.filter(t => t.status === 'pending' || t.status === 'processing').length;
  const total = state.tasks.length;
  $('.counter-badge').textContent = running;
  $('.task-counter span:last-child').textContent = `${total} 任务`;
}

async function loadHistory() {
  try {
    const res = await fetch('/api/tasks');
    const response = await res.json();
    if (response.success && response.data && response.data.length > 0) {
      state.tasks = response.data.map((item, i) => ({
        id: item.id,
        index: response.data.length - i,
        status: item.status,
        prompt: item.prompt,
        resolution: item.resolution || '720p',
        ratio: item.ratio || '16:9',
        duration: item.duration || 5,
        createdAt: item.created_at,
        videoUrl: item.video_url,
        error: item.error,
        progress: 0
      }));
      
      const grid = $('#resultsGrid');
      if (grid) grid.innerHTML = '';
      
      [...state.tasks].reverse().forEach(task => {
        addResultCard(task);
        if (task.status === 'pending' || task.status === 'processing') {
          startPolling(task.id);
        } else {
          updateResultCard(task);
        }
      });
      updateTaskCounter();
    }
  } catch (err) {
    console.error('加载历史记录失败:', err);
  }
}

// ===== Init =====
updateUploadVisibility();
updateCostEstimate();
loadHistory();

// ===== Mobile Tab Navigation =====
function isMobile() {
  return window.matchMedia('(max-width: 768px)').matches;
}

function initMobileTabs() {
  const tabs = document.querySelectorAll('.mobile-tab');
  const sidebar = document.querySelector('.sidebar');
  const content = document.querySelector('.content');

  if (!tabs.length || !sidebar || !content) return;

  function switchTab(tabName) {
    tabs.forEach(t => t.classList.remove('active'));
    const activeTab = document.querySelector(`.mobile-tab[data-tab="${tabName}"]`);
    if (activeTab) activeTab.classList.add('active');

    if (tabName === 'settings') {
      sidebar.classList.remove('hidden');
      content.classList.add('hidden');
    } else {
      sidebar.classList.add('hidden');
      content.classList.remove('hidden');
    }
  }

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      switchTab(tab.dataset.tab);
    });
  });

  // 初始状态：在移动端默认显示设置面板
  if (isMobile()) {
    switchTab('settings');
  }

  // 监听窗口变化：恢复桌面端状态
  window.addEventListener('resize', () => {
    if (!isMobile()) {
      sidebar.classList.remove('hidden');
      content.classList.remove('hidden');
    } else {
      // 确保有一个 Tab 处于 active
      const activeTab = document.querySelector('.mobile-tab.active');
      if (activeTab) switchTab(activeTab.dataset.tab);
    }
  });

  // 暴露到全局以供 generate 后自动切换
  window._switchMobileTab = switchTab;
}

initMobileTabs();

// ===== 更新移动端 badge =====
const _origUpdateTaskCounter = updateTaskCounter;
updateTaskCounter = function() {
  _origUpdateTaskCounter();
  const badge = document.getElementById('mobileTaskBadge');
  if (badge) {
    const running = state.tasks.filter(t => t.status === 'pending' || t.status === 'processing').length;
    if (running > 0) {
      badge.textContent = running;
      badge.style.display = 'flex';
    } else {
      badge.style.display = 'none';
    }
  }
};

// ===== 生成后自动切到结果 Tab =====
const origGenerateHandler = $('#generateBtn').onclick;
$('#generateBtn').addEventListener('click', () => {
  // 延迟切换，等任务创建后
  setTimeout(() => {
    if (isMobile() && state.tasks.length > 0 && window._switchMobileTab) {
      window._switchMobileTab('results');
    }
  }, 500);
}, true); // capture phase, runs alongside existing handler

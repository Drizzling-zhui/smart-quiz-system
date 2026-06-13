// ============================================================
// AI CHAT PANEL
// ============================================================
var chatState = {
  messages: [],
  questionContext: null,
  loading: false
};
var chatWidth = 350;       // current panel width
var chatMinWidth = 260;    // minimum width
var chatMaxWidth = 700;    // maximum width
var chatResizing = false;
var chatFastMode = false;  // fast mode: skip thinking/reasoning

function loadChatWidth() {
  try {
    var saved = localStorage.getItem('quiz_app_chat_width');
    if (saved) chatWidth = Math.max(chatMinWidth, Math.min(chatMaxWidth, parseInt(saved) || 350));
  } catch (e) { chatWidth = 350; }
}

function saveChatWidth() {
  try { localStorage.setItem('quiz_app_chat_width', String(chatWidth)); } catch (e) {}
}

function loadChatFastMode() {
  try {
    var saved = localStorage.getItem('quiz_app_fast_mode');
    chatFastMode = saved === 'true';
  } catch (e) { chatFastMode = false; }
}

function saveChatFastMode() {
  try { localStorage.setItem('quiz_app_fast_mode', String(chatFastMode)); } catch (e) {}
}

function loadChatHistory() {
  try {
    var raw = localStorage.getItem('quiz_app_chat');
    if (raw) chatState.messages = JSON.parse(raw);
    if (!Array.isArray(chatState.messages)) chatState.messages = [];
  } catch (e) { chatState.messages = []; }
}

function saveChatHistory() {
  try { localStorage.setItem('quiz_app_chat', JSON.stringify(chatState.messages)); } catch (e) {}
}

function openChat() {
  var panel = document.getElementById('chat-panel');
  if (panel.classList.contains('open')) return;
  panel.classList.add('open');
  panel.style.width = chatWidth + 'px';
  if (currentNodeId) setChatContext();
  ensureWelcomeMessage();
  renderChatMessages();
  document.getElementById('chat-messages').scrollTop = document.getElementById('chat-messages').scrollHeight;
}

function ensureWelcomeMessage() {
  if (!chatState.messages.length) {
    chatState.messages.push({ role: 'assistant', content: '你好！我是AI助手，可以帮你解答当前题库中的题目。选择一道题点击"问AI"按钮，或者直接输入你的问题。\n\n支持 **Markdown** 格式，AI 回复会以富文本显示。' });
  }
}

function toggleChat() {
  var panel = document.getElementById('chat-panel');
  if (panel.classList.contains('open')) {
    panel.classList.remove('open');
    panel.style.width = '';
    chatState.questionContext = null;
    document.getElementById('chat-context').style.display = 'none';
  } else {
    openChat();
  }
}

function toggleFastMode() {
  chatFastMode = !chatFastMode;
  saveChatFastMode();
  var btn = document.getElementById('btn-fast-mode');
  if (btn) {
    btn.classList.toggle('active', chatFastMode);
    btn.title = chatFastMode ? '快速模式：已开启' : '快速模式：已关闭';
  }
}

function updateFastModeBtn() {
  var btn = document.getElementById('btn-fast-mode');
  if (btn) {
    btn.classList.toggle('active', chatFastMode);
    btn.title = chatFastMode ? '快速模式：已开启' : '快速模式：已关闭';
  }
}

// ============================================================
// RESIZE HANDLE
// ============================================================
function initChatResize() {
  var panel = document.getElementById('chat-panel');
  if (!panel) return;

  // Create resize handle
  var handle = document.createElement('div');
  handle.className = 'chat-resize-handle';
  handle.addEventListener('mousedown', function (e) {
    e.preventDefault();
    chatResizing = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.body.classList.add('resizing');
  });
  panel.appendChild(handle);

  document.addEventListener('mousemove', function (e) {
    if (!chatResizing) return;
    var newWidth = window.innerWidth - e.clientX;
    newWidth = Math.max(chatMinWidth, Math.min(chatMaxWidth, newWidth));
    chatWidth = newWidth;
    var p = document.getElementById('chat-panel');
    if (p) p.style.width = chatWidth + 'px';
  });

  document.addEventListener('mouseup', function () {
    if (!chatResizing) return;
    chatResizing = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    document.body.classList.remove('resizing');
    var p = document.getElementById('chat-panel');
    if (p && p.classList.contains('open')) {
      saveChatWidth();
    }
  });
}

function setChatContext(qId) {
  var q;
  if (qId) {
    q = findQuestionById(qId);
    if (q) window._chatQuestionId = qId;
  } else if (window._chatQuestionId) {
    q = findQuestionById(window._chatQuestionId);
  }
  if (!q) {
    chatState.questionContext = null;
    document.getElementById('chat-context').style.display = 'none';
    return;
  }
  chatState.questionContext = q;
  var ctx = document.getElementById('chat-context');
  ctx.style.display = 'block';
  ctx.innerHTML =
    '<span class="ctx-label">📌 题目</span>' +
    '<span class="ctx-text">' + escHtml(q.question.slice(0, 30)) + (q.question.length > 30 ? '…' : '') + '</span>' +
    '<button onclick="clearChatContext()" class="ctx-close">✕</button>' +
    '<button onclick="askAIAboutQuestion(' + q.id + ')" class="ctx-parse-btn">一键解析</button>';
}

function clearChatContext() {
  chatState.questionContext = null;
  window._chatQuestionId = null;
  document.getElementById('chat-context').style.display = 'none';
}

function findQuestionById(qId) {
  for (var i = 0; i < appData.subjects.length; i++) {
    var nodes = appData.subjects[i].nodes || [];
    for (var j = 0; j < nodes.length; j++) {
      if (nodes[j].type === 'file' && nodes[j].questions) {
        var found = nodes[j].questions.find(function (q) { return q.id === qId; });
        if (found) return found;
      }
    }
  }
  return null;
}

function askAIAboutQuestion(qId) {
  if (!hasApiConfigured()) return toast('请先配置API', 'warning');
  var q = findQuestionById(qId);
  if (!q) return toast('题目未找到', 'error');
  setChatContext(qId);
  var typeMap = { choice: '单选题', multi: '多选题', judge: '判断题', fill: '填空题', short: '简答题' };
  var prompt = '请帮我讲解这道' + typeMap[q.type] + '：\n\n题目：' + q.question + '\n';
  if (q.type === 'choice' && q.options) {
    prompt += '选项：\n' + q.options.map(function (o) { return o.label + '. ' + o.text; }).join('\n') + '\n';
  }
  prompt += '正确答案：' + q.answer + '\n';
  if (q.explanation) prompt += '官方解析：' + q.explanation + '\n';
  prompt += '\n请详细解释这道题的解题思路和涉及的知识点。';
  sendChatMessage(prompt);
}

function sendChatMessage(text) {
  if (!text) {
    text = document.getElementById('chat-input').value.trim();
    if (!text) return;
  }
  if (!hasApiConfigured()) return toast('请先配置API', 'warning');

  chatState.messages.push({ role: 'user', content: text });
  document.getElementById('chat-input').value = '';
  renderChatMessages();
  document.getElementById('chat-messages').scrollTop = document.getElementById('chat-messages').scrollHeight;

  var cfg = getApiConfig();
  var msgs = [{ role: 'system', content: '你是一个专业的题目讲解助手。请用简洁清晰的中文回答，帮助学生理解题目涉及的知识点。回答时可以使用 Markdown 格式来排版（标题、列表、加粗、代码块等），让回答结构清晰易读。' }];

  if (chatState.questionContext) {
    var q = chatState.questionContext;
    var typeMap = { choice: '单选题', multi: '多选题', judge: '判断题', fill: '填空题', short: '简答题' };
    var ctx = '当前讨论的题目：\n类型：' + typeMap[q.type] + '\n题干：' + q.question + '\n';
    if (q.options && q.options.length) ctx += '选项：' + q.options.map(function (o) { return o.label + '. ' + o.text; }).join('；') + '\n';
    ctx += '正确答案：' + q.answer;
    if (q.explanation) ctx += '\n官方解析：' + q.explanation;
    msgs.push({ role: 'system', content: ctx });
  }

  msgs = msgs.concat(chatState.messages.slice(-20));

  chatState.loading = true;
  window._chatReasoning = '';
  window._streamRAF = false;
  renderChatMessages();

  var body = {
    model: cfg.model,
    messages: msgs,
    max_tokens: 2048,
    temperature: 0.3,
    stream: true
  };
  // Fast mode: disable deep thinking for compatible APIs (Doubao/DeepSeek)
  if (chatFastMode) {
    body.thinking = { type: 'disabled' };
  }

  fetch(cfg.endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + cfg.key },
    body: JSON.stringify(body)
  }).then(function (r) {
    if (!r.ok) throw new Error('API请求失败(HTTP ' + r.status + ')');
    return readStream(r);
  }).catch(function (e) {
    chatState.messages.push({ role: 'assistant', content: '抱歉，请求失败：' + e.message });
    chatState.loading = false;
    renderChatMessages();
    saveChatHistory();
  });
}

function readStream(response) {
  var reader = response.body.getReader();
  var decoder = new TextDecoder();
  var buffer = '';
  var content = '';

  function read() {
    reader.read().then(function (result) {
      if (result.done) {
        // Stream complete
        chatState.messages.push({ role: 'assistant', content: content });
        chatState.loading = false;
        renderChatMessages();
        saveChatHistory();
        return;
      }
      buffer += decoder.decode(result.value, { stream: true });
      var lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        if (line.indexOf('data: ') !== 0) continue;
        var data = line.slice(6).trim();
        if (data === '[DONE]') continue;
        try {
          var json = JSON.parse(data);
          var delta = (json.choices && json.choices[0] && json.choices[0].delta) || {};
          if (delta.content) content += delta.content;
          // Handle reasoning_content from deep-thinking models
          if (delta.reasoning_content) {
            if (!window._chatReasoning) window._chatReasoning = '';
            window._chatReasoning += delta.reasoning_content;
          }
          updateStreamingContent(content);
        } catch (e) {}
      }
      read();
    }).catch(function (e) {
      if (content) {
        chatState.messages.push({ role: 'assistant', content: content });
      } else {
        chatState.messages.push({ role: 'assistant', content: '请求失败：' + e.message });
      }
      chatState.loading = false;
      renderChatMessages();
      saveChatHistory();
    });
  }
  read();
}

function isChatAtBottom() {
  var container = document.getElementById('chat-messages');
  return container.scrollHeight - container.scrollTop - container.clientHeight < 50;
}

function updateStreamingContent(content) {
  // Store latest content for batched rendering
  window._streamContent = content;
  if (window._streamRAF) return; // RAF already scheduled
  window._streamRAF = true;
  requestAnimationFrame(function () {
    window._streamRAF = false;
    var container = document.getElementById('chat-messages');
    var wasAtBottom = isChatAtBottom();
    // Remove the loading dots placeholder
    var loadingEl = container.querySelector('.chat-msg.loading');
    if (loadingEl) loadingEl.remove();
    // Update or create streaming element
    var streamEl = container.querySelector('.chat-msg.streaming');
    if (!streamEl) {
      streamEl = document.createElement('div');
      streamEl.className = 'chat-msg assistant streaming';
      container.appendChild(streamEl);
    }
    // RAF throttles to max 60fps — renderMD is fine at this rate
    var html = renderMD(window._streamContent);
    if (window._chatReasoning) {
      html = '<details class="reasoning-block" open><summary>thinking</summary>' + renderMD(window._chatReasoning) + '</details>' + html;
    }
    streamEl.innerHTML = html;
    if (wasAtBottom) {
      container.scrollTop = container.scrollHeight;
    }
  });
}

function renderChatMessages() {
  var container = document.getElementById('chat-messages');
  var html = '';
  chatState.messages.forEach(function (msg) {
    var body = msg.role === 'assistant' ? renderMD(msg.content) : escHtml(msg.content).replace(/\n/g, '<br>');
    html += '<div class="chat-msg ' + msg.role + '">' + body + '</div>';
  });
  if (chatState.loading) {
    html += '<div class="chat-msg assistant loading"><span class="loading-dots">思考中<span>.</span><span>.</span><span>.</span></span></div>';
  }
  container.innerHTML = html;
}

function clearChat() {
  if (!confirm('确定清空聊天记录？')) return;
  chatState.messages = [];
  chatState.questionContext = null;
  window._chatQuestionId = null;
  document.getElementById('chat-context').style.display = 'none';
  saveChatHistory();
  renderChatMessages();
}

loadChatWidth();
loadChatHistory();
loadChatFastMode();
initChatResize();

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

function loadChatWidth() {
  try {
    var saved = localStorage.getItem('quiz_app_chat_width');
    if (saved) chatWidth = Math.max(chatMinWidth, Math.min(chatMaxWidth, parseInt(saved) || 350));
  } catch (e) { chatWidth = 350; }
}

function saveChatWidth() {
  try { localStorage.setItem('quiz_app_chat_width', String(chatWidth)); } catch (e) {}
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
    // Calculate width: mouse X from the right edge of the viewport
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
    '<button onclick="askAIAboutQuestion(' + q.id + ')" class="ctx-parse-btn">✨ 解析</button>' +
    '<button onclick="clearChatContext()" class="ctx-close">✕</button>';
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
  renderChatMessages();

  fetch(cfg.endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + cfg.key },
    body: JSON.stringify({
      model: cfg.model,
      messages: msgs,
      max_tokens: 2048,
      temperature: 0.3
    })
  }).then(function (r) {
    if (!r.ok) throw new Error('API请求失败(HTTP ' + r.status + ')');
    return r.json();
  }).then(function (data) {
    var content = '';
    if (data.choices && data.choices[0]) content = data.choices[0].message.content;
    else if (data.content && data.content[0]) content = data.content[0].text;
    else throw new Error('无法解析API响应');
    chatState.messages.push({ role: 'assistant', content: content });
  }).catch(function (e) {
    chatState.messages.push({ role: 'assistant', content: '抱歉，请求失败：' + e.message });
  }).finally(function () {
    chatState.loading = false;
    renderChatMessages();
    saveChatHistory();
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
    html += '<div class="chat-msg assistant"><span class="loading-dots">思考中<span>.</span><span>.</span><span>.</span></span></div>';
  }
  container.innerHTML = html;
  container.scrollTop = container.scrollHeight;
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
initChatResize();

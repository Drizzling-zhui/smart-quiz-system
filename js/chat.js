// ============================================================
// AI CHAT PANEL
// ============================================================
var chatState = {
  messages: [],
  questionContext: null,
  loading: false
};

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
  if (currentNodeId) setChatContext();
  ensureWelcomeMessage();
  renderChatMessages();
}

function ensureWelcomeMessage() {
  if (!chatState.messages.length) {
    chatState.messages.push({ role: 'assistant', content: '你好！我是AI助手，可以帮你解答当前题库中的题目。选择一道题点击"问AI"按钮，或者直接输入你的问题。' });
  }
}

function toggleChat() {
  var panel = document.getElementById('chat-panel');
  if (panel.classList.contains('open')) {
    panel.classList.remove('open');
    chatState.questionContext = null;
    document.getElementById('chat-context').style.display = 'none';
  } else {
    openChat();
  }
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
  ctx.innerHTML = '<span style="font-size:12px;color:var(--gray-500)">📌 当前题目：</span>' +
    '<span style="font-size:12px;font-weight:600">' + escHtml(q.question.slice(0, 40)) + (q.question.length > 40 ? '...' : '') + '</span>' +
    '<button onclick="clearChatContext()" style="background:none;border:none;cursor:pointer;font-size:14px;margin-left:4px" title="清除上下文">✕</button>';
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
  var typeMap = { choice: '单选题', fill: '填空题', short: '简答题' };
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
  var msgs = [{ role: 'system', content: '你是一个专业的题目讲解助手。请用简洁清晰的中文回答，帮助学生理解题目涉及的知识点。如果题目有错误或歧义，请指出。' }];

  if (chatState.questionContext) {
    var q = chatState.questionContext;
    var typeMap = { choice: '单选题', fill: '填空题', short: '简答题' };
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
    html += '<div class="chat-msg ' + msg.role + '">' + escHtml(msg.content).replace(/\n/g, '<br>') + '</div>';
  });
  if (chatState.loading) {
    html += '<div class="chat-msg assistant" style="color:var(--gray-400)">思考中...</div>';
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

loadChatHistory();

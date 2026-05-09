// ============================================================
// TEXT PARSER
// ============================================================
function parseQuizText(text) {
  var lines = text.split('\n').map(function (l) { return l.trim(); }).filter(function (l) { return l; });
  var questions = [];
  var currentType = 'choice';
  var i = 0;

  for (; i < lines.length; i++) {
    if (/^[一二三四五六七八九十]+\.\s*(单选|多选|填空|判断|简答|名词解释|论述)/.test(lines[i])) {
      if (/填空/.test(lines[i])) currentType = 'fill';
      else if (/简答|名词解释|论述/.test(lines[i])) currentType = 'short';
      else currentType = 'choice';
      i++; break;
    }
  }

  var currentQ = null;
  var questionTextLines = [];

  for (; i < lines.length; i++) {
    var line = lines[i];
    var qNumMatch = line.match(/^(\d+)\.\s*(?:\(([^)]+)\))?\s*$/);
    if (qNumMatch) {
      if (currentQ) { finalizeQ(currentQ, questionTextLines); if (currentQ.question) questions.push(currentQ); }
      currentQ = { id: Date.now() + questions.length, type: currentType, question: '', options: [], answer: '', explanation: '', score: 1, stats: { attempts: 0, correct: 0, wrong: 0 } };
      questionTextLines = [];
      if (qNumMatch[2]) {
        if (qNumMatch[2].includes('填空')) currentQ.type = 'fill';
        else if (qNumMatch[2].includes('简答') || qNumMatch[2].includes('名词解释') || qNumMatch[2].includes('论述')) currentQ.type = 'short';
        else currentQ.type = 'choice';
        currentType = currentQ.type;
      }
      continue;
    }
    if (!currentQ) continue;

    var am = line.match(/我的答案[：:]\s*(.+?)\s*正确答案[：:]\s*(.+?)(?:\s*$|$)/);
    if (am) {
      var ca = am[2].trim();
      if (currentQ.type === 'choice') {
        var lm = ca.match(/^([A-Da-d])/);
        currentQ.answer = lm ? lm[1].toUpperCase() : ca;
      } else currentQ.answer = ca.replace(/^[A-Da-d][：:]\s*/, '').trim();
      continue;
    }
    var sm = line.match(/^([\d.]+)分/);
    if (sm) { currentQ.score = parseFloat(sm[1]) || 1; continue; }
    var em = line.match(/^答案解析[：:]\s*(.+)/);
    if (em) { currentQ.explanation = em[1].trim(); continue; }
    if (/^AI讲解/.test(line) || /^智能分析/.test(line)) continue;

    var om = line.match(/^([A-Za-z])[.、．]\s*(.+)/);
    if (om && currentQ.type === 'choice') {
      currentQ.options.push({ label: om[1].toUpperCase(), text: om[2].trim() });
      continue;
    }
    var optAlone = line.match(/^([A-Za-z])\.\s*$/);
    if (optAlone && currentQ && currentQ.type === 'choice') {
      var nextIdx = i + 1;
      if (nextIdx < lines.length && lines[nextIdx] &&
          !/^\d+\./.test(lines[nextIdx]) &&
          !/^(我的答案|正确答案|答案|解析|AI讲解)/.test(lines[nextIdx]) &&
          !/^[A-Za-z]\./.test(lines[nextIdx])) {
        currentQ.options.push({ label: optAlone[1].toUpperCase(), text: lines[nextIdx] });
        i = nextIdx;
      }
      continue;
    }
    if (/^[，。、；：！？\s,.!?:;]+$/.test(line)) continue;
    questionTextLines.push(line);
  }
  if (currentQ) { finalizeQ(currentQ, questionTextLines); if (currentQ.question) questions.push(currentQ); }
  return { questions: questions };
}

function finalizeQ(q, lines) {
  var text = lines.join(' ').trim().replace(/^[，。、；：！？\s,.!?:;—-]+/, '').replace(/[，。、；：！？\s,.!?:;—-]+$/, '');
  q.question = text || '（题目内容为空）';
  if (q.type === 'choice' && q.options.length === 0) {
    var op = /([A-D])[.、．]\s*([^A-D]+?)(?=(?:[A-D][.、．])|$)/g;
    var m;
    var opts = [];
    var lastIndex = 0;
    while ((m = op.exec(text)) !== null) {
      opts.push({ label: m[1], text: m[2].trim() });
      lastIndex = op.lastIndex;
    }
    if (opts.length) { q.options = opts; q.question = text.slice(0, text.indexOf(opts[0].label + '.')).trim(); }
  }
}

// ============================================================
// IMPORT VIA PARSER
// ============================================================
function parseTextImport() {
  var text = document.getElementById('import-text').value.trim();
  if (!text) return toast('请粘贴题目文本', 'warning');
  var result = parseQuizText(text);
  if (!result.questions.length) return toast('未能解析出题目', 'error');

  var preview = document.getElementById('import-preview-text');
  preview.innerHTML =
    '<div style="margin:10px 0;padding:8px 14px;background:#f0fdf4;border-radius:6px;color:#166534;font-size:13px">' +
      '✅ 解析出 ' + result.questions.length + ' 道题' +
      '<button class="btn-primary btn-sm" style="margin-left:8px" onclick="importParsedQuestions()">确认导入</button>' +
      '<button class="btn-outline btn-sm" style="margin-left:4px" onclick="document.getElementById(\'import-preview-text\').innerHTML=\'\'">取消</button>' +
    '</div>' +
    '<div class="preview-list">' + result.questions.map(function (q, i) {
      var typeLabel = q.type === 'choice' ? '单选' : q.type === 'fill' ? '填空' : '简答';
      var qText = (q.question || '').slice(0, 50);
      if ((q.question || '').length > 50) qText += '...';
      return '<div class="pv-item"><span class="status">✅</span> #' + (i + 1) + ' [' + typeLabel + '] ' + escHtml(qText) + '</div>';
    }).join('') + '</div>';
  window._parsedQ = result.questions;
  toast('解析出 ' + result.questions.length + ' 道题', 'info');
}

function importParsedQuestions() {
  if (!window._parsedQ || !window._parsedQ.length) return;
  if (!currentNodeId) return toast('请先在左侧文件树中选择一个题库文件', 'warning');
  var file = getNode(currentNodeId);
  if (!file || file.type !== 'file') return toast('请先选择一个题库文件', 'warning');

  var qs = window._parsedQ.map(function (q) {
    return { id: Date.now() + Math.floor(Math.random() * 10000), type: q.type, question: q.question, options: q.options || [], answer: q.answer || '', score: q.score || 1, explanation: q.explanation || '', stats: { attempts: 0, correct: 0, wrong: 0 } };
  });
  qs.forEach(function (q) { file.questions.push(q); });
  saveData(); renderSidebar(); renderBrowse();
  document.getElementById('import-preview-text').innerHTML = ''; document.getElementById('import-text').value = '';
  window._parsedQ = null; toast('导入成功！', 'success');
}

function aiParseText() {
  var text = document.getElementById('import-text').value.trim();
  if (!text) return toast('请粘贴题目文本', 'warning');
  if (!hasApiConfigured()) {
    return toast('请先在设置中配置 API', 'warning');
  }
  var btn = document.getElementById('btn-ai-parse');
  btn.textContent = '⏳ AI解析中...'; btn.disabled = true;
  var cfg = getApiConfig();
  var prompt = '你是一个题目解析助手。请从以下文本中提取所有题目，以JSON数组格式返回，不要包含其他文字。\n\n每个题目格式：\n{\n  "type": "choice" | "fill" | "short",\n  "question": "题干",\n  "options": [{"label":"A","text":"选项内容"}],\n  "answer": "正确答案",\n  "score": 分值(数字),\n  "explanation": "解析内容"\n}\n\n规则：\n- 选择题type为choice，填空题type为fill，简答题type为short\n- 选择题必须提取选项(A/B/C/D)\n- 提取正确答案，选择题提取字母选项\n- 分值未标明则设为1\n- 忽略页眉页脚和无关信息\n- 解析内容可能为空\n\n文本内容：\n' + text;

  fetch(cfg.endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + cfg.key },
    body: JSON.stringify({
      model: cfg.model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 4096,
      temperature: 0.1
    })
  }).then(function (r) {
    if (!r.ok) throw new Error('API请求失败(HTTP ' + r.status + ')');
    return r.json();
  }).then(function (data) {
    var content = '';
    if (data.choices && data.choices[0]) content = data.choices[0].message.content;
    else if (data.content && data.content[0]) content = data.content[0].text;
    else throw new Error('无法解析API响应');
    var jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error('AI返回格式异常，未找到JSON数组');
    var questions = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(questions) || !questions.length) throw new Error('未解析出题目');
    questions.forEach(function (q) {
      if (!q.type) q.type = 'choice';
      if (!q.score) q.score = 1;
      if (!q.explanation) q.explanation = '';
      if (!q.options) q.options = [];
      if (!q.answer) q.answer = '';
      if (!q.stats) q.stats = { attempts: 0, correct: 0, wrong: 0 };
    });
    var preview = document.getElementById('import-preview-text');
    var previewHtml = '<div style="margin:10px 0;padding:8px 14px;background:#f0fdf4;border-radius:6px;color:#166534;font-size:13px">';
    previewHtml += '✅ AI解析出 ' + questions.length + ' 道题';
    previewHtml += '<button class="btn-primary btn-sm" style="margin-left:8px" onclick="importParsedQuestions()">确认导入</button>';
    previewHtml += '<button class="btn-outline btn-sm" style="margin-left:4px" onclick="document.getElementById(\'import-preview-text\').innerHTML=\'\'">取消</button>';
    previewHtml += '</div><div class="preview-list">';
    questions.forEach(function (q, i) {
      var typeLabel = q.type === 'choice' ? '单选' : (q.type === 'fill' ? '填空' : '简答');
      var qText = (q.question || '').slice(0, 50);
      if ((q.question || '').length > 50) qText += '...';
      previewHtml += '<div class="pv-item"><span class="status">✅</span> #' + (i + 1) + ' [' + typeLabel + '] ' + escHtml(qText) + '</div>';
    });
    previewHtml += '</div>';
    preview.innerHTML = previewHtml;
    window._parsedQ = questions;
    toast('AI解析完成！', 'success');
  }).catch(function (e) {
    toast('AI解析失败：' + e.message + '，尝试正则解析', 'warning');
    parseTextImport();
  }).finally(function () {
    btn.textContent = '🤖 AI 智能解析'; btn.disabled = false;
  });
}

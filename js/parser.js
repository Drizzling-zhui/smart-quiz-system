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
      if (/多选/.test(lines[i])) currentType = 'multi';
      else if (/填空/.test(lines[i])) currentType = 'fill';
      else if (/判断/.test(lines[i])) currentType = 'judge';
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
      currentQ = { id: Date.now() + questions.length, type: currentType, question: '', options: [], answer: '', explanation: '', stats: { attempts: 0, correct: 0, wrong: 0 } };
      questionTextLines = [];
      if (qNumMatch[2]) {
        if (qNumMatch[2].includes('多选')) currentQ.type = 'multi';
        else if (qNumMatch[2].includes('填空')) currentQ.type = 'fill';
        else if (qNumMatch[2].includes('判断')) currentQ.type = 'judge';
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
    if (/^([\d.]+)分/.test(line)) continue;
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
      var typeMap = { choice: '单选', multi: '多选', judge: '判断', fill: '填空', short: '简答' };
      var typeLabel = typeMap[q.type] || q.type;
      var qText = (q.question || '').slice(0, 50);
      if ((q.question || '').length > 50) qText += '...';
      return '<div class="pv-item"><span class="status">✅</span> #' + (i + 1) + ' [' + typeLabel + '] ' + escHtml(qText) + '</div>';
    }).join('') + '</div>';
  window._parsedQ = result.questions;
  toast('解析出 ' + result.questions.length + ' 道题', 'info');
}

function importParsedQuestions() {
  if (!window._parsedQ || !window._parsedQ.length) return;

  function doImport(targetFileId) {
    var file = getNode(targetFileId);
    if (!file || file.type !== 'file') return toast('目标题库无效', 'error');
    var qs = window._parsedQ.map(function (q) {
      return { id: Date.now() + Math.floor(Math.random() * 10000), type: q.type, question: q.question, options: q.options || [], answer: q.answer || '', explanation: q.explanation || '', stats: { attempts: 0, correct: 0, wrong: 0 } };
    });
    qs.forEach(function (q) { file.questions.push(q); });
    saveData(); renderSidebar(); renderBrowse();
    document.getElementById('import-preview-text').innerHTML = ''; document.getElementById('import-text').value = '';
    window._parsedQ = null; toast('导入成功！', 'success');
  }

  showImportPicker(doImport);
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

  var systemPrompt = '你是一个专业的题目解析助手，从用户提供的文本中提取所有题目，返回JSON数组。\n\n' +
    '核心规则（严格遵守）：\n' +
    '1. 题干(question) = 纯题目文字，不要把答案、选项、解析混入题干\n' +
    '2. 答案(answer) = 从文本中准确提取正确答案。选择题只保留字母(A/B/C/D)，多选题字母连写如"ABD"。判断题只写"正确"或"错误"。填空/简答写关键词语\n' +
    '3. 选项(options) = 仅选择题需要，每个选项{label, text}，文本完整提取\n' +
    '4. 如果原文同时出现"我的答案"和"正确答案"，以"正确答案"为准\n' +
    '5. 类型(type)：choice=单选, multi=多选, judge=判断, fill=填空, short=简答\n' +
    '6. 解析(explanation) = 提取原文中的答案解析，没有则为空字符串""\n\n' +
    '输出格式：只返回一个```json代码块，不要任何其他说明文字。';

  var body = {
    model: cfg.model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: '请解析以下文本中的题目：\n\n' + text }
    ],
    max_tokens: 4096,
    temperature: 0.1
  };
  if (typeof chatFastMode !== 'undefined' && chatFastMode) {
    body.thinking = { type: 'disabled' };
  }

  fetch(cfg.endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + cfg.key },
    body: JSON.stringify(body)
  }).then(function (r) {
    if (!r.ok) throw new Error('API请求失败(HTTP ' + r.status + ')');
    return r.json();
  }).then(function (data) {
    var content = '';
    if (data.choices && data.choices[0]) content = data.choices[0].message.content;
    else throw new Error('无法解析API响应');

    // 1. Try ```json code block first (standard AI output format)
    var jsonStr = '';
    var codeMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeMatch) {
      jsonStr = codeMatch[1].trim();
    } else {
      // 2. Try bare JSON array
      var arrMatch = content.match(/\[[\s\S]*\]/);
      if (arrMatch) jsonStr = arrMatch[0];
    }
    if (!jsonStr) throw new Error('AI返回格式异常，未找到JSON数据');

    // 3. Use fixJSON for robust parsing (8-layer auto-fix)
    var fixResult = fixJSON(jsonStr);
    if (!fixResult.success || !fixResult.output) {
      throw new Error('JSON解析失败：' + (fixResult.error || '未知错误'));
    }

    // 4. Handle both array and {questions:[...]} wrapper
    var questions = Array.isArray(fixResult.output) ? fixResult.output : (fixResult.output.questions || []);
    if (!questions.length) throw new Error('未解析出题目');

    // 5. Normalize each question
    questions.forEach(function (q) {
      if (!q.type) q.type = 'choice';
      if (!q.explanation) q.explanation = '';
      if (!q.options) q.options = [];
      if (!q.answer) q.answer = '';
      if (!q.stats) q.stats = { attempts: 0, correct: 0, wrong: 0 };
      // Strip "正确答案：X" from answer field if AI mistakenly included it
      var correctMatch = (q.answer || '').match(/正确答案[：:]\s*(.+)/);
      if (correctMatch) q.answer = correctMatch[1].trim();
      // Normalize choice answer: ensure single uppercase letter
      if ((q.type === 'choice' || q.type === 'judge') && q.options && q.options.length) {
        var letterMatch = (q.answer || '').match(/[A-Da-d]/);
        if (letterMatch) q.answer = letterMatch[0].toUpperCase();
      }
      // Normalize multi answer: remove non-letter chars, uppercase
      if (q.type === 'multi' && q.options && q.options.length && q.answer) {
        q.answer = q.answer.replace(/[^A-Za-z]/g, '').toUpperCase();
      }
      // Normalize type from answer content
      if (!q.type || q.type === 'choice') {
        if (q.answer === '正确' || q.answer === '错误') q.type = 'judge';
      }
    });

    var preview = document.getElementById('import-preview-text');
    var fixNote = (fixResult.fixes && fixResult.fixes.length && fixResult.fixes[0] !== '完美解析')
      ? ' <span style="font-size:11px;color:var(--warning)">（JSON自动修复：' + fixResult.fixes.join(' → ') + '）</span>' : '';
    var previewHtml = '<div style="margin:10px 0;padding:8px 14px;background:#f0fdf4;border-radius:6px;color:#166534;font-size:13px">';
    previewHtml += '✅ AI解析出 ' + questions.length + ' 道题' + fixNote;
    previewHtml += '<button class="btn-primary btn-sm" style="margin-left:8px" onclick="importParsedQuestions()">确认导入</button>';
    previewHtml += '<button class="btn-outline btn-sm" style="margin-left:4px" onclick="document.getElementById(\'import-preview-text\').innerHTML=\'\'">取消</button>';
    previewHtml += '</div><div class="preview-list">';
    questions.forEach(function (q, i) {
      var typeMap2 = { choice: '单选', multi: '多选', judge: '判断', fill: '填空', short: '简答' };
      var typeLabel = typeMap2[q.type] || q.type;
      var qText = (q.question || '').slice(0, 50);
      if ((q.question || '').length > 50) qText += '...';
      previewHtml += '<div class="pv-item"><span class="status">✅</span> #' + (i + 1) + ' [' + typeLabel + '] ' + escHtml(qText) + '</div>';
    });
    previewHtml += '</div>';
    preview.innerHTML = previewHtml;
    window._parsedQ = questions;
    toast('AI解析完成！', 'success');
  }).catch(function (e) {
    var preview = document.getElementById('import-preview-text');
    preview.innerHTML =
      '<div style="margin:10px 0;padding:8px 14px;background:#fef2f2;border-radius:6px;color:#991b1b;font-size:13px">' +
        '❌ AI解析失败：' + escHtml(e.message) +
        '<button class="btn-outline btn-sm" style="margin-left:8px" onclick="parseTextImport()">改用正则解析</button>' +
        '<button class="btn-outline btn-sm" style="margin-left:4px" onclick="document.getElementById(\'import-preview-text\').innerHTML=\'\'">关闭</button>' +
      '</div>';
    toast('AI解析失败：' + e.message, 'error');
  }).finally(function () {
    btn.textContent = '🤖 AI 智能解析'; btn.disabled = false;
  });
}

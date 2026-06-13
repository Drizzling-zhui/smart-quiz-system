// ============================================================
// QUIZ ENGINE
// ============================================================
var quizState = {
  mode: 'sequential',
  questions: [],
  currentIdx: 0,
  submitted: [],
  started: false
};
var quizTypeFilter = new Set(['all', 'choice', 'multi', 'judge', 'fill', 'short']);

function updateQuizSetup() {
  var selNodeId = document.getElementById('quiz-node-select').value;
  var subj = selNodeId ? getSubjectByNodeId(selNodeId) : null;
  var avail = document.getElementById('quiz-avail-count');
  if (subj && selNodeId) {
    var pool = getAllQuestionsFromNode(selNodeId);
    if (!quizTypeFilter.has('all')) pool = pool.filter(function (q) { return quizTypeFilter.has(q.type); });
    if (quizState.mode === 'wrong') {
      var wrongPool = pool.filter(function (q) { return q.stats && q.stats.wrong > 0; });
      avail.textContent = '（错题：' + wrongPool.length + '题）';
    } else {
      avail.textContent = '（可用：' + pool.length + '题）';
      var countEl = document.getElementById('quiz-count');
      countEl.value = pool.length;
      countEl.max = pool.length;
    }
  } else avail.textContent = '';
}

// Quiz dropdown tree
var _quizTreeExpanded = {};
var _quizSelectedNodeId = '';
var _quizDropdownOpen = false;

function renderQuizTree() {
  _quizTreeExpanded = {};
  _quizSelectedNodeId = '';
  var hidden = document.getElementById('quiz-node-select');
  if (hidden) hidden.value = '';
  var display = document.getElementById('quiz-tree-display-text');
  if (display) { display.textContent = '— 请选择题库 —'; display.classList.add('placeholder'); }
  var icon = document.getElementById('quiz-tree-display-icon');
  if (icon) icon.textContent = '📁';
  rebuildQuizTree();
}

function rebuildQuizTree() {
  var container = document.getElementById('quiz-tree-scroll');
  if (!container) return;
  if (!appData.subjects.length) {
    container.innerHTML = '<div class="tree-empty">暂无学科，请先添加学科</div>';
    return;
  }
  var html = '';
  var first = true;
  appData.subjects.forEach(function (subj) {
    var root = getRootNode(subj);
    if (!root) return;
    if (!first) html += '<div class="subject-divider" style="margin:4px 8px"></div>';
    first = false;
    if (!(root.id in _quizTreeExpanded)) _quizTreeExpanded[root.id] = true;
    // Render root folder as tree-node + children (subjects = folders)
    html += buildQuizNodeHTML(root, subj, 0);
  });
  container.innerHTML = html || '<div class="tree-empty">暂无题库</div>';
}

function buildQuizNodeHTML(node, subj, depth) {
  var isFolder = node.type === 'folder';
  var isExpanded = _quizTreeExpanded[node.id] === true;
  var qCount = isFolder ? countQuestionsInNode(node.id) : (node.questions || []).length;
  var isSelected = _quizSelectedNodeId === node.id;
  var pad = 14 + depth * 18;

  var html = '<div class="tree-node' + (isSelected ? ' active' : '') + (isFolder ? ' folder-node' : ' file-node') + '" style="padding-left:' + pad + 'px"' +
    ' data-qtn-id="' + node.id + '" data-qtn-type="' + node.type + '">';

  if (isFolder) {
    html += '<span class="tree-arrow" onclick="event.stopPropagation();toggleQuizFolder(\'' + node.id + '\')">' +
      (isExpanded ? '▼' : '▶') + '</span>';
  } else {
    html += '<span class="tree-arrow" style="visibility:hidden">▶</span>';
  }

  html += '<span class="tree-icon">' + (isFolder ? (isExpanded ? '📂' : '📁') : '📄') + '</span>';
  html += '<span class="tree-name" onclick="event.stopPropagation();' +
    (isFolder ? "toggleQuizFolder('" + node.id + "')" : "selectQuizNode('" + node.id + "')") + '">' +
    escHtml(node.name) + '</span>';
  html += '<span class="tree-count">' + qCount + (isFolder ? '' : '题') + '</span>';
  html += '</div>';

  // Render children if folder and expanded
  if (isFolder && isExpanded) {
    var sub = buildQuizTreeHTML(node.id, subj, depth + 1);
    if (!sub) {
      html += '<div class="tree-empty" style="padding-left:' + (14 + (depth + 1) * 18) + 'px">空文件夹</div>';
    } else {
      html += sub;
    }
  }
  return html;
}

function buildQuizTreeHTML(nodeId, subj, depth) {
  var children = getChildrenNodes(nodeId, subj);
  children.sort(smartSortName);

  var html = '';
  children.forEach(function (n) {
    var isFolder = n.type === 'folder';
    var isExpanded = _quizTreeExpanded[n.id] === true;
    var qCount = isFolder ? countQuestionsInNode(n.id) : (n.questions || []).length;
    var isSelected = _quizSelectedNodeId === n.id;
    var pad = 14 + depth * 18;

    html += '<div class="tree-node' + (isSelected ? ' active' : '') + (isFolder ? ' folder-node' : ' file-node') + '" style="padding-left:' + pad + 'px"' +
      ' data-qtn-id="' + n.id + '" data-qtn-type="' + n.type + '">';

    if (isFolder) {
      html += '<span class="tree-arrow" onclick="event.stopPropagation();toggleQuizFolder(\'' + n.id + '\')">' +
        (isExpanded ? '▼' : '▶') + '</span>';
    } else {
      html += '<span class="tree-arrow" style="visibility:hidden">▶</span>';
    }

    html += '<span class="tree-icon">' + (isFolder ? (isExpanded ? '📂' : '📁') : '📄') + '</span>';

    html += '<span class="tree-name" onclick="event.stopPropagation();' +
      (isFolder ? "toggleQuizFolder('" + n.id + "')" : "selectQuizNode('" + n.id + "')") + '">' +
      escHtml(n.name) + '</span>';

    html += '<span class="tree-count">' + qCount + (isFolder ? '' : '题') + '</span>';

    html += '</div>';

    if (isFolder && isExpanded) {
      var sub = buildQuizTreeHTML(n.id, subj, depth + 1);
      if (!sub) {
        html += '<div class="tree-empty" style="padding-left:' + (14 + (depth + 1) * 18) + 'px">空文件夹</div>';
      } else {
        html += sub;
      }
    }
  });
  return html;
}

function toggleQuizFolder(nodeId) {
  _quizTreeExpanded[nodeId] = !_quizTreeExpanded[nodeId];
  rebuildQuizTree();
}

function selectQuizNode(nodeId) {
  _quizSelectedNodeId = nodeId;
  var hidden = document.getElementById('quiz-node-select');
  if (hidden) hidden.value = nodeId;
  var node = getNode(nodeId);
  if (node) {
    var display = document.getElementById('quiz-tree-display-text');
    if (display) { display.textContent = node.name; display.classList.remove('placeholder'); }
    var icon = document.getElementById('quiz-tree-display-icon');
    if (icon) icon.textContent = node.type === 'folder' ? '📁' : '📄';
  }
  expandQuizPath(nodeId);
  rebuildQuizTree();
  closeQuizDropdown();
  updateQuizSetup();
}

function expandQuizPath(nodeId) {
  var node = getNode(nodeId);
  while (node && node.parentId) {
    _quizTreeExpanded[node.parentId] = true;
    node = getNode(node.parentId);
  }
}

function toggleQuizDropdown() {
  _quizDropdownOpen = !_quizDropdownOpen;
  var dd = document.getElementById('quiz-tree-dropdown');
  var display = document.getElementById('quiz-tree-display');
  var backdrop = document.getElementById('quiz-dropdown-backdrop');
  if (_quizDropdownOpen) {
    dd.classList.remove('hidden');
    display.classList.add('open');
    if (backdrop) backdrop.classList.add('open');
  } else {
    dd.classList.add('hidden');
    display.classList.remove('open');
    if (backdrop) backdrop.classList.remove('open');
  }
}

function closeQuizDropdown() {
  if (!_quizDropdownOpen) return;
  _quizDropdownOpen = false;
  var dd = document.getElementById('quiz-tree-dropdown');
  if (dd) dd.classList.add('hidden');
  var display = document.getElementById('quiz-tree-display');
  if (display) display.classList.remove('open');
  var backdrop = document.getElementById('quiz-dropdown-backdrop');
  if (backdrop) backdrop.classList.remove('open');
}

function toggleQuizType(type, el) {
  var allTypes = ['choice', 'multi', 'judge', 'fill', 'short'];
  if (type === 'all') {
    var allActive = el.classList.contains('active');
    if (allActive) {
      el.classList.remove('active');
      document.querySelectorAll('.qtc[data-qt!="all"]').forEach(function (b) { b.classList.add('active'); });
      quizTypeFilter = new Set(allTypes);
    } else {
      document.querySelectorAll('.qtc').forEach(function (b) { b.classList.add('active'); });
      quizTypeFilter = new Set(['all'].concat(allTypes));
    }
  } else {
    el.classList.toggle('active');
    var allEl = document.querySelector('[data-qt="all"]');
    var activeTypes = new Set();
    document.querySelectorAll('.qtc[data-qt!="all"]').forEach(function (b) {
      if (b.classList.contains('active')) activeTypes.add(b.dataset.qt);
    });
    if (activeTypes.size === allTypes.length) {
      allEl.classList.add('active');
      quizTypeFilter = new Set(['all'].concat(allTypes));
    } else {
      allEl.classList.remove('active');
      quizTypeFilter = activeTypes;
    }
  }
  updateQuizSetup();
}

function selectQuizMode(mode, el) {
  quizState.mode = mode;
  document.querySelectorAll('.mode-btn').forEach(function (b) { b.classList.toggle('active', b.dataset.mode === mode); });
  var countField = document.getElementById('quiz-count-field');
  if (mode === 'wrong') {
    countField.style.display = 'none';
  } else {
    countField.style.display = '';
  }
  updateQuizSetup();
}

function renderQuizSetup() {
  quizState.started = false;
  clearQuizResume();
  document.getElementById('quiz-setup').style.display = 'block';
  document.getElementById('quiz-playing').style.display = 'none';
  document.getElementById('quiz-result-area').style.display = 'none';

  // Build quiz tree (all subjects)
  renderQuizTree();

  if (quizTypeFilter.size === 0 || quizTypeFilter.has('all')) {
    document.querySelectorAll('.qtc').forEach(function (b) { b.classList.add('active'); });
    quizTypeFilter = new Set(['all', 'choice', 'multi', 'judge', 'fill', 'short']);
  }
  var countField = document.getElementById('quiz-count-field');
  if (quizState.mode === 'wrong') {
    countField.style.display = 'none';
  } else {
    countField.style.display = '';
  }
  updateQuizSetup();
}

function startQuiz() {
  var nodeId = document.getElementById('quiz-node-select').value;
  var count = parseInt(document.getElementById('quiz-count').value) || 0;
  if (!nodeId) return toast('请选择题库', 'warning');
  var subj = getSubjectByNodeId(nodeId);
  if (!subj) return toast('该题库不存在', 'warning');

  var pool = getAllQuestionsFromNode(nodeId);
  if (!pool.length) return toast('所选题库暂无题目', 'warning');

  if (!quizTypeFilter.has('all')) pool = pool.filter(function (q) { return quizTypeFilter.has(q.type); });
  if (!pool.length) return toast('所选类型暂无题目', 'warning');

  if (quizState.mode === 'wrong') {
    pool = pool.filter(function (q) { return q.stats && q.stats.wrong > 0; });
    if (!pool.length) return toast('没有做错的题目！', 'success');
  }

  // Shuffle or sort
  pool = [].concat(pool);
  if (quizState.mode === 'random' || quizState.mode === 'wrong') {
    for (var i = pool.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = pool[i]; pool[i] = pool[j]; pool[j] = tmp;
    }
  } else {
    // Sequential: favorites first
    pool.sort(function (a, b) {
      var aFav = isFavorite(a.id) ? 0 : 1;
      var bFav = isFavorite(b.id) ? 0 : 1;
      return aFav - bFav;
    });
  }
  if (quizState.mode !== 'wrong' && count > 0 && count < pool.length) pool = pool.slice(0, count);

  quizState.questions = pool;
  quizState.currentIdx = 0;
  quizState.submitted = [];
  quizState.started = true;
  clearQuizResume();
  saveQuizResume();

  document.getElementById('quiz-setup').style.display = 'none';
  document.getElementById('quiz-playing').style.display = 'block';
  document.getElementById('quiz-result-area').style.display = 'none';
  // Ensure quiz tab is active without resetting the quiz state
  if (!document.getElementById('view-quiz').classList.contains('active')) {
    document.querySelectorAll('.tab-btn').forEach(function (b) { b.classList.toggle('active', b.dataset.tab === 'quiz'); });
    document.querySelectorAll('.view').forEach(function (v) { v.classList.remove('active'); });
    document.getElementById('view-quiz').classList.add('active');
  }
  renderQuizQuestion();
}

function jumpToQuestion(idx) {
  if (idx < 0 || idx >= quizState.questions.length) return;
  quizState.currentIdx = idx;
  renderQuizQuestion();
  saveQuizResume();
}

var _quizNumGridCollapsed = false;

function toggleQuizNumGrid() {
  _quizNumGridCollapsed = !_quizNumGridCollapsed;
  var grid = document.getElementById('quiz-num-grid');
  var toggle = document.getElementById('quiz-num-toggle');
  if (grid) grid.classList.toggle('collapsed', _quizNumGridCollapsed);
  if (toggle) toggle.textContent = _quizNumGridCollapsed ? '▼' : '▲';
}

function renderQuizNumGrid() {
  var grid = document.getElementById('quiz-num-grid');
  if (!grid) return;
  var questions = quizState.questions;
  var currentIdx = quizState.currentIdx;
  var submitted = quizState.submitted;
  var answered = submitted.filter(function (s) { return s.attempts > 0; }).length;
  var correct = submitted.filter(function (s) { return s.correct; }).length;

  var html = '';
  for (var i = 0; i < questions.length; i++) {
    var sub = submitted.find(function (s) { return s.qId === questions[i].id; });
    var cls = 'quiz-num-item';
    if (i === currentIdx) cls += ' current';
    if (sub && sub.attempts > 0) {
      cls += sub.correct ? ' answered' : ' answered-wrong';
    }
    html += '<div class="' + cls + '" onclick="jumpToQuestion(' + i + ')" title="第' + (i + 1) + '题' + (sub && sub.attempts > 0 ? (sub.correct ? ' ✅' : ' ❌') : '') + '">' + (i + 1) + '</div>';
  }
  grid.innerHTML = html;
  if (_quizNumGridCollapsed) grid.classList.add('collapsed');

  var summary = document.getElementById('quiz-num-summary');
  if (summary) summary.textContent = '已答 ' + answered + ' · 对 ' + correct + ' · 错 ' + (answered - correct);
}

function renderQuizQuestion() {
  var questions = quizState.questions;
  var currentIdx = quizState.currentIdx;
  var submitted = quizState.submitted;
  if (!questions.length || currentIdx >= questions.length) return finishQuiz();

  renderQuizNumGrid();

  var q = questions[currentIdx];
  var sub = submitted.find(function (s) { return s.qId === q.id; });
  var isSubmitted = sub ? sub.attempts > 0 : false;
  var total = questions.length;
  var answered = submitted.filter(function (s) { return s.attempts > 0; }).length;
  var isFav = isFavorite(q.id);

  document.getElementById('quiz-bar').style.width = ((currentIdx + 1) / total * 100) + '%';
  document.getElementById('quiz-progress-info').textContent = '第 ' + (currentIdx + 1) + '/' + total + ' 题 · 已答 ' + answered + ' 题';

  var card = document.getElementById('quiz-question-card');
  var typeMap = { choice: '单选题', multi: '多选题', judge: '判断题', fill: '填空题', short: '简答题' };

  var answerHtml = '';
  if (q.type === 'choice') {
    var optionsHtml = q.options.map(function (o) {
      var cls = 'quiz-option';
      if (isSubmitted) {
        cls += ' disabled';
        if (o.label === q.answer) cls += ' reveal-correct';
        else if (o.label === sub.userAnswer) cls += ' wrong';
      } else {
        if (o.label === (sub ? sub.userAnswer : null)) cls += ' selected';
      }
      return '<div class="' + cls + '" onclick="' + (isSubmitted ? '' : "selectQuizOption('" + o.label + "')") + '">' +
        '<span class="opt-label">' + o.label + '</span>' + escHtml(o.text) +
      '</div>';
    }).join('');
    answerHtml = '<div class="quiz-options">' + optionsHtml + '</div>';
  } else if (q.type === 'multi') {
    var optionsHtml = q.options.map(function (o) {
      var cls = 'quiz-option';
      var userAnswers = sub ? (sub.userAnswer || '').split('') : [];
      if (isSubmitted) {
        cls += ' disabled';
        if ((q.answer || '').indexOf(o.label) !== -1) cls += ' reveal-correct';
        else if (userAnswers.indexOf(o.label) !== -1) cls += ' wrong';
      } else {
        if (userAnswers.indexOf(o.label) !== -1) cls += ' selected';
      }
      return '<div class="' + cls + '" onclick="' + (isSubmitted ? '' : "toggleMultiOption('" + o.label + "')") + '">' +
        '<span class="opt-label">' + o.label + '</span>' + escHtml(o.text) +
      '</div>';
    }).join('');
    answerHtml = '<div class="quiz-options">' + optionsHtml + '</div>';
  } else if (q.type === 'judge') {
    var userJudge = sub ? sub.userAnswer : '';
    var correctBtn = 'quiz-option';
    var wrongBtn = 'quiz-option';
    if (isSubmitted) {
      correctBtn += ' disabled' + (q.answer === '正确' ? ' reveal-correct' : (userJudge === '正确' ? ' wrong' : ''));
      wrongBtn += ' disabled' + (q.answer === '错误' ? ' reveal-correct' : (userJudge === '错误' ? ' wrong' : ''));
    } else {
      if (userJudge === '正确') correctBtn += ' selected';
      if (userJudge === '错误') wrongBtn += ' selected';
    }
    answerHtml = '<div class="quiz-options">' +
      '<div class="' + correctBtn + '" onclick="' + (isSubmitted ? '' : "selectQuizOption('正确')") + '"><span class="opt-label">✅</span>正确</div>' +
      '<div class="' + wrongBtn + '" onclick="' + (isSubmitted ? '' : "selectQuizOption('错误')") + '"><span class="opt-label">❌</span>错误</div>' +
    '</div>';
  } else if (q.type === 'fill') {
    var val = sub ? sub.userAnswer : '';
    var cls = 'quiz-fill-input' + (isSubmitted ? (sub.correct ? ' correct submitted' : ' wrong submitted') : '');
    var disabled = isSubmitted ? 'disabled' : '';
    answerHtml = '<input class="' + cls + '" type="text" value="' + escHtml(val) + '" placeholder="输入答案..." ' + disabled + ' onchange="setQuizFillAnswer(this.value)">';
  } else {
    var val2 = sub ? sub.userAnswer : '';
    var disabled2 = isSubmitted ? 'disabled' : '';
    answerHtml = '<textarea class="quiz-short-input" placeholder="输入你的答案..." ' + disabled2 + ' onchange="setQuizFillAnswer(this.value)">' + escHtml(val2) + '</textarea>';
  }

  var feedbackHtml = '';
  if (isSubmitted) {
    var noteHtml = '';
    if (q.note) {
      noteHtml = '<div class="fb-note-preview" id="fb-note-display-' + q.id + '" onclick="event.stopPropagation();toggleQuizNote(' + q.id + ')">📝 ' + escHtml(q.note) + '</div>';
    }
    feedbackHtml = '<div class="quiz-feedback ' + (sub.correct ? 'correct' : 'wrong') + '">' +
      '<div class="fb-label">' + (sub.correct ? '✅ 回答正确！' : '❌ 回答错误') + '</div>' +
      (!sub.correct ? '<div class="fb-answer">' + (q.type === 'choice' ? '正确答案：' + q.answer : '参考答案：' + escHtml(q.answer)) + '</div>' : '') +
      (q.explanation ? '<div class="fb-explain">💡 ' + escHtml(q.explanation) + '</div>' : '') +
      (sub.attempts > 1 ? '<div class="fb-explain" style="margin-top:4px;color:var(--warning)">本题已答 ' + sub.attempts + ' 次</div>' : '') +
      noteHtml +
      '<div class="quiz-fb-actions">' +
        '<button class="fb-btn fb-btn-ai" onclick="event.stopPropagation();openChat();setChatContext(' + q.id + ')">🤖 AI 提问</button>' +
        '<button class="fb-btn fb-btn-edit" onclick="event.stopPropagation();editQuestion(' + q.id + ')">✏️ 编辑题目</button>' +
        '<button class="fb-btn fb-btn-note" id="fb-btn-note-' + q.id + '" onclick="event.stopPropagation();toggleQuizNote(' + q.id + ')">' + (q.note ? '📝 编辑备注' : '📝 添加备注') + '</button>' +
      '</div>' +
      '<div class="fb-note-editor" id="fb-note-editor-' + q.id + '" style="display:none">' +
        '<textarea id="fb-note-ta-' + q.id + '" placeholder="添加个人备注...">' + escHtml(q.note || '') + '</textarea>' +
        '<div class="fb-note-editor-btns">' +
          '<button class="btn-primary btn-sm" onclick="event.stopPropagation();saveQuizNote(' + q.id + ')">保存</button>' +
          '<button class="btn-outline btn-sm" onclick="event.stopPropagation();toggleQuizNote(' + q.id + ')">取消</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  card.innerHTML =
    '<div class="quiz-card">' +
      '<div class="q-meta">' +
        '<span class="q-type ' + q.type + '">' + typeMap[q.type] + '</span>' +
        (q.stats && q.stats.attempts > 0 ? '<span style="font-size:11px;color:var(--gray-400)">📊 此前答' + q.stats.attempts + '次 · 正确率' + Math.round(q.stats.correct / q.stats.attempts * 100) + '%</span>' : '') +
        '<span style="cursor:pointer;font-size:16px;margin-left:auto" onclick="toggleFavorite(' + q.id + ');renderQuizQuestion()" title="' + (isFav ? '取消收藏' : '收藏') + '">' + (isFav ? '⭐' : '☆') + '</span>' +
      '</div>' +
      '<div class="q-text">' + (currentIdx + 1) + '. ' + escHtml(q.question) + '</div>' +
      answerHtml +
      feedbackHtml +
    '</div>';

  var nav = document.getElementById('quiz-nav-bar');
  var canPrev = currentIdx > 0;
  var canNext = currentIdx < questions.length - 1;
  var submitBtn = '';
  if (!isSubmitted) {
    submitBtn = '<button class="btn-submit" onclick="submitQuizAnswer()" id="quiz-submit-btn">提交答案</button>' +
      '<button class="btn-dunno" onclick="submitDunno()">不知道</button>';
  }

  nav.innerHTML =
    '<div>' +
      '<button class="btn-prev" onclick="prevQuizQuestion()" ' + (canPrev ? '' : 'disabled') + '>← 上一题</button>' +
      '<button class="btn-quit" onclick="confirmAction(\'确定要退出答题吗？\', renderQuizSetup)">退出</button>' +
      '<button class="btn-finish" onclick="confirmAction(\'确定要提前结束答题并查看结果吗？未作答的题目将计为未答。\', finishQuiz)">结果统计</button>' +
    '</div>' +
    '<div>' +
      submitBtn +
      '<button class="btn-next" onclick="nextQuizQuestion()" ' + (isSubmitted ? '' : 'disabled') + ' id="quiz-next-btn">' +
        (canNext ? '下一题 →' : '查看结果') +
      '</button>' +
    '</div>';

  if (isSubmitted) {
    document.getElementById('quiz-next-btn').disabled = false;
  }
}

function toggleMultiOption(label) {
  var q = quizState.questions[quizState.currentIdx];
  if (!q) return;
  var sub = quizState.submitted.find(function (s) { return s.qId === q.id && s.attempts > 0; });
  if (sub) return;
  var idx = quizState.submitted.findIndex(function (s) { return s.qId === q.id; });
  var current = '';
  if (idx >= 0) current = quizState.submitted[idx].userAnswer || '';
  if (idx >= 0) quizState.submitted.splice(idx, 1);
  if (current.indexOf(label) !== -1) {
    current = current.replace(label, '');
  } else {
    current = (current + label).split('').sort().join('');
  }
  quizState.submitted.push({ qId: q.id, userAnswer: current, correct: false, attempts: 0 });
  renderQuizQuestion();
  saveQuizResume();
}

function selectQuizOption(label) {
  var q = quizState.questions[quizState.currentIdx];
  if (!q) return;
  var submitted = quizState.submitted.find(function (s) { return s.qId === q.id && s.attempts > 0; });
  if (submitted) return;
  var idx = quizState.submitted.findIndex(function (s) { return s.qId === q.id; });
  if (idx >= 0) quizState.submitted.splice(idx, 1);
  quizState.submitted.push({ qId: q.id, userAnswer: label, correct: false, attempts: 0 });
  renderQuizQuestion();
  saveQuizResume();
}

function setQuizFillAnswer(val) {
  var q = quizState.questions[quizState.currentIdx];
  if (!q) return;
  var existing = quizState.submitted.find(function (s) { return s.qId === q.id && s.attempts === 0; });
  if (existing) { existing.userAnswer = val; saveQuizResume(); return; }
  quizState.submitted.push({ qId: q.id, userAnswer: val, correct: false, attempts: 0 });
  saveQuizResume();
}

function submitQuizAnswer() {
  var q = quizState.questions[quizState.currentIdx];
  if (!q) return;
  var sub = quizState.submitted.find(function (s) { return s.qId === q.id; });
  if (!sub) return toast('请先作答', 'warning');
  if (sub.userAnswer === null || sub.userAnswer === '') return toast('请先作答', 'warning');

  if (!q.stats) q.stats = { attempts: 0, correct: 0, wrong: 0 };
  q.stats.attempts++;

  var correct = false;
  if (q.type === 'choice' || q.type === 'judge') {
    correct = sub.userAnswer === q.answer;
  } else if (q.type === 'multi') {
    var userSorted = (sub.userAnswer || '').split('').sort().join('');
    var ansSorted = (q.answer || '').split('').sort().join('');
    correct = userSorted === ansSorted;
  } else if (q.type === 'fill') {
    correct = sub.userAnswer.trim().toLowerCase() === q.answer.trim().toLowerCase();
  } else {
    var ua = sub.userAnswer.trim().toLowerCase();
    var ca = q.answer.trim().toLowerCase();
    var keywords = ca.split(/[；;，,、\s]+/).filter(function (k) { return k.length > 2; });
    if (keywords.length > 0) {
      var matchCount = keywords.filter(function (k) { return ua.includes(k); }).length;
      correct = matchCount / keywords.length >= 0.5;
    } else {
      correct = ua.includes(ca) || ca.includes(ua);
    }
  }

  if (correct) { q.stats.correct++; sub.correct = true; }
  else { q.stats.wrong++; sub.correct = false; }

  sub.attempts++;
  saveData(true);
  saveQuizResume();
  renderSidebar();
  renderQuizQuestion();
}

function submitDunno() {
  var q = quizState.questions[quizState.currentIdx];
  if (!q) return;
  // Remove any existing unsubmitted answer
  var idx = quizState.submitted.findIndex(function (s) { return s.qId === q.id && s.attempts === 0; });
  if (idx >= 0) quizState.submitted.splice(idx, 1);
  // Submit as wrong with empty answer
  quizState.submitted.push({ qId: q.id, userAnswer: '', correct: false, attempts: 1 });
  if (!q.stats) q.stats = { attempts: 0, correct: 0, wrong: 0 };
  q.stats.attempts++;
  q.stats.wrong++;
  saveData(true);
  saveQuizResume();
  renderSidebar();
  renderQuizQuestion();
}

function nextQuizQuestion() {
  if (quizState.currentIdx < quizState.questions.length - 1) {
    quizState.currentIdx++;
    renderQuizQuestion();
    saveQuizResume();
  } else {
    finishQuiz();
  }
}

function prevQuizQuestion() {
  if (quizState.currentIdx > 0) {
    quizState.currentIdx--;
    renderQuizQuestion();
    saveQuizResume();
  }
}

function finishQuiz() {
  var questions = quizState.questions;
  var submitted = quizState.submitted;
  var correct = 0, wrong = 0, unanswered = 0;

  questions.forEach(function (q) {
    var s = submitted.find(function (sub) { return sub.qId === q.id; });
    if (s && s.correct) { correct++; }
    else if (s && !s.correct) { wrong++; }
    else { unanswered++; }
  });

  var total = questions.length;
  var attempted = correct + wrong;
  var pct = attempted > 0 ? Math.round((correct / attempted) * 100) : 0;
  var grade = 'poor', gradeText = '继续加油！';
  if (pct >= 90) { grade = 'perfect'; gradeText = '太棒了！🎉'; }
  else if (pct >= 70) { grade = 'good'; gradeText = '不错！继续保持 💪'; }
  else if (pct >= 50) { grade = 'fair'; gradeText = '还需努力 📚'; }

  clearQuizResume();
  document.getElementById('quiz-playing').style.display = 'none';
  var resultArea = document.getElementById('quiz-result-area');
  resultArea.style.display = 'block';

  var reviewHtml = questions.map(function (q, i) {
    var s = submitted.find(function (sub) { return sub.qId === q.id; });
    var isCorrect = s && s.correct;
    var isWrong = s && !s.correct;
    var color = isCorrect ? 'var(--success)' : isWrong ? 'var(--danger)' : 'var(--gray-400)';
    var icon = isCorrect ? '✅' : isWrong ? '❌' : '⚪';
    var ua = s ? s.userAnswer : '未作答';
    var tm = { choice: '单选题', multi: '多选题', judge: '判断题', fill: '填空题', short: '简答题' };
    var att = s ? s.attempts : 0;
    return '<div class="rv-item" style="border-left-color:' + color + '">' +
      '<div class="rv-header">' +
        '<span class="q-type ' + q.type + '">' + tm[q.type] + '</span>' +
        '<span>' + icon + '</span>' +
      '</div>' +
      '<div class="rv-question">' + (i + 1) + '. ' + escHtml(q.question) + '</div>' +
      '<div class="rv-answer">' +
        ((q.type === 'choice' || q.type === 'multi' || q.type === 'judge')
          ? '你的答案：<span style="' + (isCorrect ? 'color:var(--success)' : isWrong ? 'color:var(--danger)' : 'color:var(--gray-400)') + '">' + escHtml(ua || '未作答') + '</span> · 正确答案：<span style="color:var(--success);font-weight:600">' + escHtml(q.answer) + '</span>'
          : '你的答案：<span style="' + (isCorrect ? 'color:var(--success)' : isWrong ? 'color:var(--danger)' : 'color:var(--gray-400)') + '">' + escHtml(ua || '未作答') + '</span> · 参考答案：<span style="color:var(--success);font-weight:600">' + escHtml(q.answer) + '</span>'
        ) +
        (q.explanation ? '<br>💡 ' + escHtml(q.explanation) : '') +
        (att > 1 ? '<br><span class="rv-attempts">提交了 ' + att + ' 次</span>' : '') +
      '</div>' +
    '</div>';
  }).join('');

  resultArea.innerHTML =
    '<div class="quiz-result">' +
      '<div class="score-circle ' + grade + '">' + pct + '%</div>' +
      '<h2 style="margin-bottom:4px;font-size:18px">' + gradeText + '</h2>' +
      '<p style="color:var(--gray-500);font-size:13px;margin-bottom:12px">已答 ' + attempted + ' 题 · 答对 ' + correct + ' 题 · 共 ' + total + ' 题</p>' +
      '<div class="detail">' +
        '<div class="stat correct"><div class="num">' + correct + '</div><div class="lbl">正确</div></div>' +
        '<div class="stat wrong"><div class="num">' + wrong + '</div><div class="lbl">错误</div></div>' +
        (unanswered > 0 ? '<div class="stat"><div class="num" style="color:var(--gray-400)">' + unanswered + '</div><div class="lbl">未答</div></div>' : '') +
        '<div class="stat"><div class="num">' + total + '</div><div class="lbl">总题数</div></div>' +
      '</div>' +
      '<div>' +
        '<button onclick="renderQuizSetup()">返回练习设置</button>' +
        '<button onclick="retryWrongQuiz()" style="margin-left:6px;background:var(--gray-100);color:var(--gray-600)">重做错题</button>' +
      '</div>' +
      '<div class="review">' +
        '<h3 style="font-size:14px;margin-bottom:10px">📋 答题回顾</h3>' +
        reviewHtml +
      '</div>' +
    '</div>';
}

function retryWrongQuiz() {
  var wrong = quizState.questions.filter(function (q) {
    var s = quizState.submitted.find(function (sub) { return sub.qId === q.id; });
    return !s || !s.correct;
  });
  if (!wrong.length) return toast('没有错题！', 'success');

  quizState.questions = wrong;
  quizState.currentIdx = 0;
  quizState.submitted = [];
  clearQuizResume();
  saveQuizResume();

  document.getElementById('quiz-result-area').style.display = 'none';
  document.getElementById('quiz-playing').style.display = 'block';
  renderQuizQuestion();
  toast('开始重做 ' + wrong.length + ' 道错题', 'info');
}

function toggleQuizNote(qId) {
  var editor = document.getElementById('fb-note-editor-' + qId);
  var display = document.getElementById('fb-note-display-' + qId);
  if (!editor) return;
  var isShowing = editor.style.display !== 'none';
  editor.style.display = isShowing ? 'none' : 'block';
  if (!isShowing) {
    var ta = document.getElementById('fb-note-ta-' + qId);
    if (ta) ta.focus();
  }
}

function saveQuizNote(qId) {
  var ta = document.getElementById('fb-note-ta-' + qId);
  if (!ta) return;
  var note = ta.value.trim();
  var q = findQuestionById(qId);
  if (!q) return toast('题目未找到', 'error');
  q.note = note;
  saveData();
  if (note) {
    var display = document.getElementById('fb-note-display-' + qId);
    if (display) {
      display.textContent = '📝 ' + note;
      display.style.display = 'block';
    } else {
      // Note display doesn't exist yet, re-render
      renderQuizQuestion();
      return;
    }
  } else {
    var display = document.getElementById('fb-note-display-' + qId);
    if (display) display.style.display = 'none';
  }
  var btn = document.getElementById('fb-btn-note-' + qId);
  if (btn) btn.textContent = note ? '📝 编辑备注' : '📝 添加备注';
  var editor = document.getElementById('fb-note-editor-' + qId);
  if (editor) editor.style.display = 'none';
  toast(note ? '备注已保存' : '备注已删除', 'success');
}

// ============================================================
// QUIZ AUTO-SAVE & RESUME
// ============================================================
var _pendingResumeData = null;

function saveQuizResume() {
  if (!quizState.started || !quizState.questions.length) return;
  // Only save question IDs, not full objects — avoids stale copies on resume
  var qIds = quizState.questions.map(function (q) { return q.id; });
  var data = {
    qIds: qIds,
    currentIdx: quizState.currentIdx,
    submitted: quizState.submitted,
    mode: quizState.mode,
    savedAt: Date.now()
  };
  try {
    localStorage.setItem('quiz_resume', JSON.stringify(data));
  } catch (e) {}
}

function clearQuizResume() {
  localStorage.removeItem('quiz_resume');
  _pendingResumeData = null;
}

function checkQuizResume() {
  try {
    var raw = localStorage.getItem('quiz_resume');
    if (!raw) return;
    var data = JSON.parse(raw);
    var totalQ = (data.qIds || data.questions || []).length;
    if (!totalQ) { clearQuizResume(); return; }
    var hasProgress = data.submitted && data.submitted.some(function (s) { return s.attempts > 0 || s.userAnswer; });
    if (!hasProgress && data.currentIdx === 0) { clearQuizResume(); return; }
    _pendingResumeData = data;
    var answered = data.submitted ? data.submitted.filter(function (s) { return s.attempts > 0; }).length : 0;
    document.getElementById('resume-info').textContent =
      '您有未完成的答题：共 ' + totalQ + ' 题，已答 ' + answered + ' 题，当前第 ' + (data.currentIdx + 1) + ' 题。是否继续？';
    document.getElementById('modal-quiz-resume').classList.add('active');
  } catch (e) { clearQuizResume(); }
}

function dismissQuizResume() {
  document.getElementById('modal-quiz-resume').classList.remove('active');
  clearQuizResume();
}

function resumeQuiz() {
  document.getElementById('modal-quiz-resume').classList.remove('active');
  var data = _pendingResumeData;
  _pendingResumeData = null;
  if (!data) return;

  quizState.mode = data.mode || 'sequential';
  // Reconstruct questions from appData using saved IDs (not saved copies)
  quizState.questions = [];
  if (data.qIds) {
    data.qIds.forEach(function (id) {
      var q = findQuestionById(id);
      if (q) quizState.questions.push(q);
    });
  } else if (data.questions) {
    // Backward compat: old format saved full objects, try to find originals
    data.questions.forEach(function (savedQ) {
      var q = findQuestionById(savedQ.id);
      if (q) quizState.questions.push(q);
    });
  }
  // If no questions reconstructed, fall back to saved copies
  if (!quizState.questions.length && data.questions) {
    quizState.questions = data.questions;
  }
  quizState.currentIdx = data.currentIdx;
  quizState.submitted = data.submitted;
  quizState.started = true;

  document.getElementById('quiz-setup').style.display = 'none';
  document.getElementById('quiz-playing').style.display = 'block';
  document.getElementById('quiz-result-area').style.display = 'none';

  document.querySelectorAll('.tab-btn').forEach(function (b) { b.classList.toggle('active', b.dataset.tab === 'quiz'); });
  document.querySelectorAll('.view').forEach(function (v) { v.classList.remove('active'); });
  document.getElementById('view-quiz').classList.add('active');

  renderQuizQuestion();
  toast('已恢复答题进度', 'info');
}

// Save on page unload to catch in-progress text inputs
window.addEventListener('beforeunload', function () {
  if (!quizState.started) return;
  var q = quizState.questions[quizState.currentIdx];
  if (q && (q.type === 'fill' || q.type === 'short')) {
    var input = document.querySelector('.quiz-fill-input, .quiz-short-input');
    if (input) {
      var val = input.value;
      var existing = quizState.submitted.find(function (s) { return s.qId === q.id && s.attempts === 0; });
      if (existing) { existing.userAnswer = val; }
      else if (val) { quizState.submitted.push({ qId: q.id, userAnswer: val, correct: false, attempts: 0 }); }
    }
  }
  saveQuizResume();
});

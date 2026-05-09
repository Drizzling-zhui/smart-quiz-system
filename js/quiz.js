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
  var subjName = document.getElementById('quiz-subject-select').value;
  var subj = getSubject(subjName);
  var avail = document.getElementById('quiz-avail-count');
  if (subj) {
    var selNodeId = document.getElementById('quiz-node-select').value;
    var pool = [];
    if (selNodeId) {
      pool = getAllQuestionsFromNode(selNodeId);
    }
    if (!quizTypeFilter.has('all')) pool = pool.filter(function (q) { return quizTypeFilter.has(q.type); });
    avail.textContent = '（可用：' + pool.length + '题）';
  } else avail.textContent = '';
}

function buildQuizNodeSelect(subj) {
  if (!subj) return '<option value="">— 请选择题库 —</option>';
  var options = '';
  function walk(nodeId, depth, nodes) {
    getChildrenNodes(nodeId, subj).forEach(function (n) {
      if (n.type === 'file') {
        var qCount = (n.questions || []).length;
        options += '<option value="' + n.id + '"' + (currentNodeId === n.id ? ' selected' : '') + '>' +
          '│  '.repeat(depth) + '📄 ' + escHtml(n.name) + '（' + qCount + '题）</option>';
      } else if (n.type === 'folder') {
        options += '<option value="' + n.id + '" style="font-weight:600">' +
          '│  '.repeat(depth) + '📁 ' + escHtml(n.name) + '</option>';
        walk(n.id, depth + 1, nodes);
      }
    });
  }
  var root = getRootNode(subj);
  if (root) {
    var totalQ = countQuestionsInNode(root.id);
    options += '<option value="' + root.id + '">📁 ' + escHtml(subj.name) + '（全部，' + totalQ + '题）</option>';
    walk(root.id, 0, subj.nodes);
  }
  return options;
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
}

function renderQuizSetup() {
  quizState.started = false;
  document.getElementById('quiz-setup').style.display = 'block';
  document.getElementById('quiz-playing').style.display = 'none';
  document.getElementById('quiz-result-area').style.display = 'none';
  var sel = document.getElementById('quiz-subject-select');
  sel.innerHTML = appData.subjects.map(function (s) {
    return '<option value="' + escHtml(s.name) + '" ' + (s.name === currentSubject ? 'selected' : '') + '>' + escHtml(s.name) + '</option>';
  }).join('');
  if (!appData.subjects.length) sel.innerHTML = '<option value="">— 暂无学科 —</option>';

  // Build node selector
  var nodeSel = document.getElementById('quiz-node-select');
  var curSubj = getSubject(document.getElementById('quiz-subject-select').value);
  nodeSel.innerHTML = buildQuizNodeSelect(curSubj);

  if (quizTypeFilter.size === 0 || quizTypeFilter.has('all')) {
    document.querySelectorAll('.qtc').forEach(function (b) { b.classList.add('active'); });
    quizTypeFilter = new Set(['all', 'choice', 'multi', 'judge', 'fill', 'short']);
  }
  updateQuizSetup();
}

function startQuiz() {
  var subjName = document.getElementById('quiz-subject-select').value;
  var nodeId = document.getElementById('quiz-node-select').value;
  var count = parseInt(document.getElementById('quiz-count').value) || 0;
  if (!subjName || !nodeId) return toast('请选择学科和题库', 'warning');
  var subj = getSubject(subjName);
  if (!subj) return toast('该学科不存在', 'warning');

  var pool = getAllQuestionsFromNode(nodeId);
  if (!pool.length) return toast('所选题库暂无题目', 'warning');

  if (!quizTypeFilter.has('all')) pool = pool.filter(function (q) { return quizTypeFilter.has(q.type); });
  if (!pool.length) return toast('所选类型暂无题目', 'warning');

  // Shuffle or sort
  pool = [].concat(pool);
  if (quizState.mode === 'random') {
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
  if (count > 0 && count < pool.length) pool = pool.slice(0, count);

  quizState.questions = pool;
  quizState.currentIdx = 0;
  quizState.submitted = [];
  quizState.started = true;

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

function renderQuizQuestion() {
  var questions = quizState.questions;
  var currentIdx = quizState.currentIdx;
  var submitted = quizState.submitted;
  if (!questions.length || currentIdx >= questions.length) return finishQuiz();

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
    feedbackHtml = '<div class="quiz-feedback ' + (sub.correct ? 'correct' : 'wrong') + '">' +
      '<div class="fb-label">' + (sub.correct ? '✅ 回答正确！' : '❌ 回答错误') + '</div>' +
      (!sub.correct ? '<div class="fb-answer">' + (q.type === 'choice' ? '正确答案：' + q.answer : '参考答案：' + escHtml(q.answer)) + '</div>' : '') +
      (q.explanation ? '<div class="fb-explain">💡 ' + escHtml(q.explanation) + '</div>' : '') +
      (sub.attempts > 1 ? '<div class="fb-explain" style="margin-top:4px;color:var(--warning)">本题已答 ' + sub.attempts + ' 次</div>' : '') +
      '<button class="ask-ai" onclick="event.stopPropagation();openChat();setChatContext(' + q.id + ');askAIAboutQuestion(' + q.id + ')" style="margin-top:8px">🤖 AI 解析</button>' +
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
    submitBtn = '<button class="btn-submit" onclick="submitQuizAnswer()" id="quiz-submit-btn">提交答案</button>';
  }

  nav.innerHTML =
    '<div>' +
      '<button class="btn-prev" onclick="prevQuizQuestion()" ' + (canPrev ? '' : 'disabled') + '>← 上一题</button>' +
      '<button class="btn-quit" onclick="confirmAction(\'确定要退出答题吗？\', renderQuizSetup)">退出</button>' +
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
}

function setQuizFillAnswer(val) {
  var q = quizState.questions[quizState.currentIdx];
  if (!q) return;
  var existing = quizState.submitted.find(function (s) { return s.qId === q.id && s.attempts === 0; });
  if (existing) { existing.userAnswer = val; return; }
  quizState.submitted.push({ qId: q.id, userAnswer: val, correct: false, attempts: 0 });
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
  saveData();
  renderSidebar();
  renderQuizQuestion();
}

function nextQuizQuestion() {
  if (quizState.currentIdx < quizState.questions.length - 1) {
    quizState.currentIdx++;
    renderQuizQuestion();
  } else {
    finishQuiz();
  }
}

function prevQuizQuestion() {
  if (quizState.currentIdx > 0) {
    quizState.currentIdx--;
    renderQuizQuestion();
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
  var pct = total > 0 ? Math.round((correct / total) * 100) : 0;
  var grade = 'poor', gradeText = '继续加油！';
  if (pct >= 90) { grade = 'perfect'; gradeText = '太棒了！🎉'; }
  else if (pct >= 70) { grade = 'good'; gradeText = '不错！继续保持 💪'; }
  else if (pct >= 50) { grade = 'fair'; gradeText = '还需努力 📚'; }

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
          ? '你的答案：<span style="' + (isCorrect ? 'color:var(--success)' : isWrong ? 'color:var(--danger);text-decoration:line-through' : 'color:var(--gray-400)') + '">' + escHtml(ua || '未作答') + '</span> · 正确答案：<span style="color:var(--success);font-weight:600">' + escHtml(q.answer) + '</span>'
          : '你的答案：<span style="' + (isCorrect ? 'color:var(--success)' : isWrong ? 'color:var(--danger);text-decoration:line-through' : 'color:var(--gray-400)') + '">' + escHtml(ua || '未作答') + '</span> · 参考答案：<span style="color:var(--success);font-weight:600">' + escHtml(q.answer) + '</span>'
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
      '<p style="color:var(--gray-500);font-size:13px;margin-bottom:12px">答对 ' + correct + ' / ' + total + ' 题</p>' +
      '<div class="detail">' +
        '<div class="stat correct"><div class="num">' + correct + '</div><div class="lbl">正确</div></div>' +
        '<div class="stat wrong"><div class="num">' + wrong + '</div><div class="lbl">错误</div></div>' +
        (unanswered > 0 ? '<div class="stat"><div class="num" style="color:var(--gray-400)">' + unanswered + '</div><div class="lbl">未答</div></div>' : '') +
        '<div class="stat"><div class="num">' + questions.length + '</div><div class="lbl">总题数</div></div>' +
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

  document.getElementById('quiz-result-area').style.display = 'none';
  document.getElementById('quiz-playing').style.display = 'block';
  renderQuizQuestion();
  toast('开始重做 ' + wrong.length + ' 道错题', 'info');
}

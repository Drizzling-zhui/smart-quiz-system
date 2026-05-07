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
var quizTypeFilter = new Set(['all', 'choice', 'fill', 'short']);

function updateQuizSetup() {
  var subjName = document.getElementById('quiz-subject-select').value;
  var subj = getSubject(subjName);
  var avail = document.getElementById('quiz-avail-count');
  if (subj) {
    var pool = subj.questions;
    if (!quizTypeFilter.has('all')) pool = pool.filter(function (q) { return quizTypeFilter.has(q.type); });
    avail.textContent = '（可用：' + pool.length + '题）';
  } else avail.textContent = '';
}

function toggleQuizType(type, el) {
  if (type === 'all') {
    var allActive = el.classList.contains('active');
    if (allActive) {
      el.classList.remove('active');
      document.querySelectorAll('.qtc[data-qt!="all"]').forEach(function (b) { b.classList.add('active'); });
      quizTypeFilter = new Set(['choice', 'fill', 'short']);
    } else {
      document.querySelectorAll('.qtc').forEach(function (b) { b.classList.add('active'); });
      quizTypeFilter = new Set(['all', 'choice', 'fill', 'short']);
    }
  } else {
    el.classList.toggle('active');
    var allEl = document.querySelector('[data-qt="all"]');
    var activeTypes = new Set();
    document.querySelectorAll('.qtc[data-qt!="all"]').forEach(function (b) {
      if (b.classList.contains('active')) activeTypes.add(b.dataset.qt);
    });
    if (activeTypes.size === 3) {
      allEl.classList.add('active');
      quizTypeFilter = new Set(['all', 'choice', 'fill', 'short']);
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
  document.getElementById('quiz-setup').style.display = 'block';
  document.getElementById('quiz-playing').style.display = 'none';
  document.getElementById('quiz-result-area').style.display = 'none';
  var sel = document.getElementById('quiz-subject-select');
  sel.innerHTML = appData.subjects.map(function (s) {
    return '<option value="' + escHtml(s.name) + '" ' + (s.name === currentSubject ? 'selected' : '') + '>' + escHtml(s.name) + '（' + s.questions.length + '题）</option>';
  }).join('');
  if (!appData.subjects.length) sel.innerHTML = '<option value="">— 暂无学科 —</option>';
  if (quizTypeFilter.size === 0 || quizTypeFilter.has('all')) {
    document.querySelectorAll('.qtc').forEach(function (b) { b.classList.add('active'); });
    quizTypeFilter = new Set(['all', 'choice', 'fill', 'short']);
  }
  updateQuizSetup();
}

function startQuiz() {
  var subjName = document.getElementById('quiz-subject-select').value;
  var count = parseInt(document.getElementById('quiz-count').value) || 0;
  if (!subjName) return toast('请选择学科', 'warning');
  var subj = getSubject(subjName);
  if (!subj || !subj.questions.length) return toast('该学科暂无题目', 'warning');

  var pool = subj.questions;
  if (!quizTypeFilter.has('all')) pool = pool.filter(function (q) { return quizTypeFilter.has(q.type); });
  if (!pool.length) return toast('所选类型暂无题目', 'warning');

  pool = [].concat(pool);
  if (quizState.mode === 'random') {
    for (var i = pool.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = pool[i]; pool[i] = pool[j]; pool[j] = tmp;
    }
  }
  if (count > 0 && count < pool.length) pool = pool.slice(0, count);

  quizState.questions = pool;
  quizState.currentIdx = 0;
  quizState.submitted = [];
  quizState.started = true;

  document.getElementById('quiz-setup').style.display = 'none';
  document.getElementById('quiz-playing').style.display = 'block';
  document.getElementById('quiz-result-area').style.display = 'none';
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

  document.getElementById('quiz-bar').style.width = ((currentIdx + 1) / total * 100) + '%';
  document.getElementById('quiz-progress-info').textContent = '第 ' + (currentIdx + 1) + '/' + total + ' 题 · 已答 ' + answered + ' 题';

  var card = document.getElementById('quiz-question-card');
  var typeMap = { choice: '单选题', fill: '填空题', short: '简答题' };

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
    '</div>';
  }

  card.innerHTML =
    '<div class="quiz-card">' +
      '<div class="q-meta">' +
        '<span class="q-type ' + q.type + '">' + typeMap[q.type] + '</span>' +
        '<span style="font-size:12px;color:var(--gray-400)">' + (q.score || 1) + '分</span>' +
        (q.stats && q.stats.attempts > 0 ? '<span style="font-size:11px;color:var(--gray-400)">📊 此前答' + q.stats.attempts + '次 · 正确率' + Math.round(q.stats.correct / q.stats.attempts * 100) + '%</span>' : '') +
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
  if (q.type === 'choice') {
    correct = sub.userAnswer === q.answer;
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
  var correct = 0, wrong = 0, totalScore = 0, earnedScore = 0;

  questions.forEach(function (q) {
    var s = submitted.find(function (sub) { return sub.qId === q.id; });
    var score = q.score || 1;
    totalScore += score;
    if (s && s.correct) { correct++; earnedScore += score; }
    else { wrong++; }
  });

  var pct = totalScore > 0 ? Math.round((earnedScore / totalScore) * 100) : 0;
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
    var color = isCorrect ? 'var(--success)' : 'var(--danger)';
    var ua = s ? s.userAnswer : '未作答';
    var tm = { choice: '单选题', fill: '填空题', short: '简答题' };
    var att = s ? s.attempts : 0;
    return '<div class="rv-item" style="border-left-color:' + color + '">' +
      '<div class="rv-header">' +
        '<span class="q-type ' + q.type + '">' + tm[q.type] + '</span>' +
        '<span>' + (isCorrect ? '✅' : '❌') + ' ' + (q.score || 1) + '分</span>' +
      '</div>' +
      '<div class="rv-question">' + (i + 1) + '. ' + escHtml(q.question) + '</div>' +
      '<div class="rv-answer">' +
        (q.type === 'choice'
          ? '你的答案：<span style="' + (isCorrect ? 'color:var(--success)' : 'color:var(--danger);text-decoration:line-through') + '">' + escHtml(ua) + '</span> · 正确答案：<span style="color:var(--success);font-weight:600">' + escHtml(q.answer) + '</span>'
          : '你的答案：<span style="' + (isCorrect ? 'color:var(--success)' : 'color:var(--danger);text-decoration:line-through') + '">' + escHtml(ua) + '</span> · 参考答案：<span style="color:var(--success);font-weight:600">' + escHtml(q.answer) + '</span>'
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
      '<p style="color:var(--gray-500);font-size:13px;margin-bottom:12px">获得 ' + earnedScore.toFixed(1) + ' / ' + totalScore.toFixed(1) + ' 分</p>' +
      '<div class="detail">' +
        '<div class="stat correct"><div class="num">' + correct + '</div><div class="lbl">正确</div></div>' +
        '<div class="stat wrong"><div class="num">' + wrong + '</div><div class="lbl">错误</div></div>' +
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

// ============================================================
// BROWSE
// ============================================================
function selectSubject(name) {
  currentSubject = name; currentFilter = 'all';
  document.querySelectorAll('.filter-btn').forEach(function (b) { b.classList.toggle('active', b.dataset.filter === 'all'); });
  renderSidebar(); renderBrowse();
}

function renderBrowse() {
  var title = document.getElementById('browse-title');
  var filterBar = document.getElementById('filter-bar');
  var addBtn = document.getElementById('btn-add-q');
  var resetBtn = document.getElementById('btn-reset-stats');
  var list = document.getElementById('question-list');
  var empty = document.getElementById('empty-browse');

  if (!currentSubject || !getSubject(currentSubject)) {
    title.textContent = '请选择一个学科'; filterBar.style.display = 'none';
    addBtn.style.display = 'none'; resetBtn.style.display = 'none';
    list.innerHTML = '';
    empty.style.display = 'block'; empty.innerHTML = '<div class="icon">📂</div><p>左侧选择一个学科开始浏览题目</p>';
    return;
  }
  var subj = getSubject(currentSubject);
  title.textContent = '📖 ' + subj.name + '（共 ' + subj.questions.length + ' 题）';
  filterBar.style.display = 'flex'; addBtn.style.display = 'inline-block'; resetBtn.style.display = 'inline-block';

  var filtered = subj.questions;
  if (currentFilter !== 'all') filtered = filtered.filter(function (q) { return q.type === currentFilter; });
  document.getElementById('stat-info').textContent = '筛选：' + filtered.length + '/' + subj.questions.length + ' 题';

  if (!filtered.length) {
    list.innerHTML = ''; empty.style.display = 'block';
    empty.innerHTML = '<div class="icon">📝</div><p>暂无题目</p>'; return;
  }
  empty.style.display = 'none';

  list.innerHTML = filtered.map(function (q, idx) {
    var tm = { choice: '单选题', fill: '填空题', short: '简答题' };
    var optsHtml = q.type === 'choice' && q.options ? q.options.map(function (o) {
      return '<div class="opt">' + o.label + '. ' + escHtml(o.text) + '</div>';
    }).join('') : '';

    var st = q.stats || { attempts: 0, correct: 0, wrong: 0 };
    var acc = st.attempts > 0 ? Math.round(st.correct / st.attempts * 100) : -1;
    var accCls = 'stat-badge acc';
    if (acc >= 0) accCls += acc >= 80 ? ' high' : acc >= 50 ? ' medium' : ' low';

    return '<div class="q-card">' +
      '<div class="q-header">' +
        '<span class="q-number">#' + (idx + 1) + '</span>' +
        '<span class="q-type ' + q.type + '">' + tm[q.type] + '</span>' +
        '<span style="font-size:11px;color:var(--gray-400)">' + (q.score || 1) + '分</span>' +
      '</div>' +
      '<div class="q-text">' + escHtml(q.question) + '</div>' +
      (optsHtml ? '<div class="q-options">' + optsHtml + '</div>' : '') +
      (st.attempts > 0 ? '<div class="q-stats">' +
        '<span class="stat-badge attempt">📝 ' + st.attempts + '次</span>' +
        '<span class="stat-badge wrong">❌ ' + st.wrong + '次错</span>' +
        '<span class="' + accCls + '">' + (acc >= 0 ? '✅ ' + acc + '%' : '') + '</span>' +
      '</div>' : '<div class="q-stats"><span class="stat-badge" style="color:var(--gray-300)">尚未答题</span></div>') +
      '<div class="q-footer">' +
        '<button class="edit" onclick="editQuestion(' + q.id + ')">✏️ 编辑</button>' +
        '<button class="del" onclick="confirmAction(\'确定删除此题？\',function(){deleteQuestion(' + q.id + ')})">🗑️ 删除</button>' +
      '</div>' +
    '</div>';
  }).join('');
}

function filterQuestions(filter, btn) {
  currentFilter = filter;
  document.querySelectorAll('.filter-btn').forEach(function (b) { b.classList.toggle('active', b.dataset.filter === filter); });
  renderBrowse();
}

// ============================================================
// QUESTION CRUD
// ============================================================
function addQuestion(subjectName, q) {
  var subj = getSubject(subjectName); if (!subj) return;
  q.id = Date.now() + Math.floor(Math.random() * 1000);
  if (!q.stats) q.stats = { attempts: 0, correct: 0, wrong: 0 };
  subj.questions.push(q); saveData(); renderBrowse(); renderSidebar();
}

function updateQuestion(subjectName, qId, data) {
  var subj = getSubject(subjectName); if (!subj) return;
  var idx = subj.questions.findIndex(function (q) { return q.id === qId; });
  if (idx === -1) return;
  Object.assign(subj.questions[idx], data);
  if (!subj.questions[idx].stats) subj.questions[idx].stats = { attempts: 0, correct: 0, wrong: 0 };
  saveData(); renderBrowse();
}

function deleteQuestion(qId) {
  var subj = getSubject(currentSubject); if (!subj) return;
  subj.questions = subj.questions.filter(function (q) { return q.id !== qId; });
  saveData(); renderBrowse(); renderSidebar();
  toast('题目已删除', 'info');
}

function resetAllStats() {
  if (!confirm('确定重置当前学科所有题目的答题统计数据？')) return;
  var subj = getSubject(currentSubject); if (!subj) return;
  subj.questions.forEach(function (q) { q.stats = { attempts: 0, correct: 0, wrong: 0 }; });
  saveData(); renderBrowse();
  toast('统计数据已重置', 'info');
}

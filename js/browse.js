// ============================================================
// BROWSE
// ============================================================
function selectNode(nodeId) {
  var node = getNode(nodeId);
  if (!node || node.type !== 'file') return;
  currentNodeId = nodeId;
  var subj = getSubjectByNodeId(nodeId);
  currentSubject = subj ? subj.name : null;
  currentFilter = 'all';
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

  if (!currentNodeId || !getNode(currentNodeId)) {
    title.textContent = '请选择一个题库文件';
    filterBar.style.display = 'none'; addBtn.style.display = 'none'; resetBtn.style.display = 'none'; document.getElementById('btn-toggle-chat').style.display = 'none';
    list.innerHTML = '';
    empty.style.display = 'block';
    empty.innerHTML = '<div class="icon">📂</div><p>在左侧文件树中选择一个题库文件（📄）开始浏览</p>';
    return;
  }

  var node = getNode(currentNodeId);
  if (!node || node.type !== 'file') {
    title.textContent = '请选择一个题库文件';
    filterBar.style.display = 'none'; addBtn.style.display = 'none'; resetBtn.style.display = 'none'; document.getElementById('btn-toggle-chat').style.display = 'none';
    list.innerHTML = '';
    empty.style.display = 'block';
    return;
  }

  var questions = node.questions || [];
  var subj = getSubjectByNodeId(currentNodeId);
  var subjectName = subj ? subj.name : '';

  // Build breadcrumb
  var breadcrumb = buildBreadcrumb(currentNodeId);

  title.innerHTML = '📖 ' + escHtml(subjectName) + ' &gt; <span style="color:var(--primary)">' + escHtml(node.name) + '</span>（共 ' + questions.length + ' 题）';
  filterBar.style.display = 'flex'; addBtn.style.display = 'inline-block'; resetBtn.style.display = 'inline-block';
  document.getElementById('btn-toggle-chat').style.display = 'inline-block';

  // Filter by type
  var filtered = questions;
  if (currentFilter !== 'all') filtered = filtered.filter(function (q) { return q.type === currentFilter; });

  // Sort: favorites first, then by mode
  filtered.sort(function (a, b) {
    var aFav = isFavorite(a.id) ? 0 : 1;
    var bFav = isFavorite(b.id) ? 0 : 1;
    if (aFav !== bFav) return aFav - bFav;
    return 0; // preserve relative order
  });

  document.getElementById('stat-info').innerHTML =
    '筛选：' + filtered.length + '/' + questions.length + ' 题' +
    ' &nbsp;<button class="filter-btn" onclick="toggleBrowseMode()" style="margin-left:8px" title="切换顺序/随机浏览">' + (currentBrowseMode === 'sequential' ? '📋 顺序' : '🔀 随机') + '</button>';

  if (!filtered.length) {
    list.innerHTML = ''; empty.style.display = 'block';
    empty.innerHTML = '<div class="icon">📝</div><p>暂无题目</p>'; return;
  }
  empty.style.display = 'none';

  // If random mode, shuffle non-favorites among themselves
  if (currentBrowseMode === 'random') {
    // Split into favorites and non-favorites
    var favPart = [];
    var nonFavPart = [];
    filtered.forEach(function (q) {
      if (isFavorite(q.id)) favPart.push(q);
      else nonFavPart.push(q);
    });
    // Shuffle non-favorites
    for (var i = nonFavPart.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = nonFavPart[i]; nonFavPart[i] = nonFavPart[j]; nonFavPart[j] = tmp;
    }
    filtered = favPart.concat(nonFavPart);
  }

  list.innerHTML = filtered.map(function (q, idx) {
    var tm = { choice: '单选题', multi: '多选题', judge: '判断题', fill: '填空题', short: '简答题' };
    var isFav = isFavorite(q.id);
    var optsHtml = q.type === 'choice' && q.options ? q.options.map(function (o) {
      return '<div class="opt">' + o.label + '. ' + escHtml(o.text) + '</div>';
    }).join('') : '';

    var st = q.stats || { attempts: 0, correct: 0, wrong: 0 };
    var acc = st.attempts > 0 ? Math.round(st.correct / st.attempts * 100) : -1;
    var accCls = 'stat-badge acc';
    if (acc >= 0) accCls += acc >= 80 ? ' high' : acc >= 50 ? ' medium' : ' low';

    return '<div class="q-card">' +
      '<div class="q-header">' +
        (isFav ? '<span style="cursor:pointer;font-size:14px" onclick="toggleFavorite(' + q.id + ');renderBrowse()" title="取消收藏">⭐</span>' : '<span style="cursor:pointer;font-size:14px;opacity:0.3" onclick="toggleFavorite(' + q.id + ');renderBrowse()" title="收藏">☆</span>') +
        '<span class="q-number">#' + (idx + 1) + '</span>' +
        '<span class="q-type ' + q.type + '">' + tm[q.type] + '</span>' +
      '</div>' +
      '<div class="q-text">' + escHtml(q.question) + '</div>' +
      (optsHtml ? '<div class="q-options">' + optsHtml + '</div>' : '') +
      (st.attempts > 0 ? '<div class="q-stats">' +
        '<span class="stat-badge attempt">📝 ' + st.attempts + '次</span>' +
        '<span class="stat-badge wrong">❌ ' + st.wrong + '次错</span>' +
        '<span class="' + accCls + '">' + (acc >= 0 ? '✅ ' + acc + '%' : '') + '</span>' +
      '</div>' : '<div class="q-stats"><span class="stat-badge" style="color:var(--gray-300)">尚未答题</span></div>') +
      '<div class="q-footer">' +
        '<button class="ask-ai" onclick="event.stopPropagation();openChat();setChatContext(' + q.id + ');askAIAboutQuestion(' + q.id + ')">🤖 问AI</button>' +
        '<button class="edit" onclick="editQuestion(' + q.id + ')">✏️ 编辑</button>' +
        '<button class="del" onclick="confirmAction(\'确定删除此题？\',function(){deleteQuestion(' + q.id + ')})">🗑️ 删除</button>' +
      '</div>' +
    '</div>';
  }).join('');
}

function toggleBrowseMode() {
  currentBrowseMode = currentBrowseMode === 'sequential' ? 'random' : 'sequential';
  renderBrowse();
}

function filterQuestions(filter, btn) {
  currentFilter = filter;
  document.querySelectorAll('.filter-btn').forEach(function (b) { b.classList.toggle('active', b.dataset.filter === filter); });
  renderBrowse();
}

function buildBreadcrumb(nodeId) {
  var parts = [];
  var current = getNode(nodeId);
  while (current) {
    parts.unshift(current.name);
    if (current.parentId) current = getNode(current.parentId);
    else break;
  }
  return parts.join(' > ');
}

// ============================================================
// QUESTION CRUD
// ============================================================
function addQuestion(subjectName, q) {
  if (!currentNodeId) return toast('请先选择一个题库文件', 'warning');
  var node = getNode(currentNodeId);
  if (!node || node.type !== 'file') return toast('请先选择一个题库文件', 'warning');
  q.id = Date.now() + Math.floor(Math.random() * 1000);
  if (!q.stats) q.stats = { attempts: 0, correct: 0, wrong: 0 };
  if (!node.questions) node.questions = [];
  node.questions.push(q); saveData(); renderBrowse(); renderSidebar();
}

function updateQuestion(subjectName, qId, data) {
  if (!currentNodeId) return;
  var node = getNode(currentNodeId);
  if (!node || !node.questions) return;
  var idx = node.questions.findIndex(function (q) { return q.id === qId; });
  if (idx === -1) return;
  Object.assign(node.questions[idx], data);
  if (!node.questions[idx].stats) node.questions[idx].stats = { attempts: 0, correct: 0, wrong: 0 };
  saveData(); renderBrowse();
}

function deleteQuestion(qId) {
  if (!currentNodeId) return;
  var node = getNode(currentNodeId);
  if (!node || !node.questions) return;
  node.questions = node.questions.filter(function (q) { return q.id !== qId; });
  // Also remove from favorites
  var favIdx = favorites.indexOf(qId);
  if (favIdx >= 0) { favorites.splice(favIdx, 1); saveFavorites(); }
  saveData(); renderBrowse(); renderSidebar();
  toast('题目已删除', 'info');
}

function resetAllStats() {
  if (!confirm('确定重置当前题库所有题目的答题统计数据？')) return;
  if (!currentNodeId) return;
  var node = getNode(currentNodeId);
  if (!node || !node.questions) return;
  node.questions.forEach(function (q) { q.stats = { attempts: 0, correct: 0, wrong: 0 }; });
  saveData(); renderBrowse();
  toast('统计数据已重置', 'info');
}

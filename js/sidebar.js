// ============================================================
// SIDEBAR
// ============================================================
function renderSidebar() {
  var c = document.getElementById('subject-list');
  if (!appData.subjects.length) {
    c.innerHTML = '<div class="empty-state" style="padding:30px 10px"><div class="icon">📭</div><p>暂无学科</p></div>';
    return;
  }
  c.innerHTML = appData.subjects.map(function (s) {
    var total = s.questions.length;
    var totalAttempts = s.questions.reduce(function (sum, q) { return sum + (q.stats ? q.stats.attempts : 0); }, 0);
    return '<div class="subject-item ' + (currentSubject === s.name ? 'active' : '') + '" onclick="selectSubject(\'' + escHtml(s.name) + '\')">' +
      '<span class="name">' + escHtml(s.name) + '</span>' +
      '<span class="count" title="' + total + '题 · 共' + totalAttempts + '次答题">' + total + '</span>' +
      '<span class="subj-actions">' +
        '<button onclick="event.stopPropagation();showModal(\'subject\',\'' + escHtml(s.name) + '\')" title="重命名">✏️</button>' +
        '<button class="del" onclick="event.stopPropagation();confirmAction(\'删除学科「' + escHtml(s.name) + '」及其全部题目？\',function(){deleteSubject(\'' + escHtml(s.name) + '\')})" title="删除">🗑️</button>' +
      '</span>' +
    '</div>';
  }).join('');
}

// ============================================================
// SUBJECT CRUD
// ============================================================
function addSubject(name) {
  if (!name.trim()) return toast('请输入学科名称', 'warning');
  if (getSubject(name.trim())) return toast('该学科已存在', 'warning');
  appData.subjects.push({ name: name.trim(), description: '', questions: [] });
  saveData(); renderSidebar(); switchTab('browse');
  selectSubject(name.trim());
  toast('学科「' + name.trim() + '」已添加', 'success');
}

function renameSubject(oldName, newName) {
  if (!newName.trim()) return toast('名称不能为空', 'warning');
  if (oldName !== newName.trim() && getSubject(newName.trim())) return toast('已存在同名学科', 'warning');
  var subj = getSubject(oldName); if (!subj) return;
  subj.name = newName.trim(); saveData(); renderSidebar(); renderBrowse();
  if (currentSubject === oldName) { currentSubject = newName.trim(); selectSubject(newName.trim()); }
}

function deleteSubject(name) {
  var idx = appData.subjects.findIndex(function (s) { return s.name === name; });
  if (idx === -1) return;
  appData.subjects.splice(idx, 1); saveData(); renderSidebar();
  if (currentSubject === name) { currentSubject = null; renderBrowse(); }
  toast('学科已删除', 'info');
}

function confirmAction(msg, fn) {
  if (confirm(msg)) fn();
}

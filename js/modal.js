// ============================================================
// MODALS
// ============================================================
var editingQuestionId = null;

function showModal(type, data) {
  if (type === 'question') {
    editingQuestionId = null;
    document.getElementById('modal-q-title').textContent = '添加题目';
    document.getElementById('q-type-select').value = 'choice';
    document.getElementById('q-text-input').value = '';
    document.getElementById('q-answer-select').value = 'A';
    document.getElementById('q-answer-judge-select').value = '正确';
    document.getElementById('q-answer-text').value = '';
    document.querySelectorAll('.multi-ans').forEach(function (cb) { cb.checked = false; });
    document.getElementById('q-explain-input').value = '';
    document.querySelectorAll('.opt-input').forEach(function (i) { i.value = ''; });
    toggleQuestionModalOptions();
    // Reset to single-add tab
    switchModalTab('single', document.querySelector('[data-mtab="single"]'));
    updateSingleTargetDisplay();
    document.getElementById('modal-question').classList.add('active');
  }
}

function updateSingleTargetDisplay() {
  var display = document.getElementById('single-target-display');
  if (currentNodeId) {
    var node = getNode(currentNodeId);
    var subj = getSubjectByNodeId(currentNodeId);
    if (node && node.type === 'file' && subj) {
      display.textContent = subj.name + ' / ' + node.name + '（' + (node.questions || []).length + '题）';
      display.style.color = 'var(--gray-800)';
      return;
    }
  }
  display.textContent = '请选择目标题库（点击右侧"更改"按钮）';
  display.style.color = 'var(--gray-500)';
}

function pickTargetForSingle() {
  showImportPicker(function (targetFileId) {
    var node = getNode(targetFileId);
    var subj = getSubjectByNodeId(targetFileId);
    if (node && subj) {
      currentNodeId = targetFileId;
      currentSubject = subj.name;
      updateSingleTargetDisplay();
      renderSidebar();
    }
  });
}

function switchModalTab(tab, btn) {
  document.querySelectorAll('.modal-tab').forEach(function (b) { b.classList.remove('active'); });
  document.querySelectorAll('.mtab-content').forEach(function (c) { c.classList.remove('active'); });
  if (btn) btn.classList.add('active');
  document.getElementById('mtab-' + tab).classList.add('active');
}

function switchModalSubTab(tab, btn) {
  document.querySelectorAll('.modal-subtab').forEach(function (b) { b.classList.remove('active'); });
  document.querySelectorAll('.mstab-content').forEach(function (c) { c.classList.remove('active'); });
  if (btn) btn.classList.add('active');
  document.getElementById('mstab-' + tab).classList.add('active');
}

function hideModal(type) {
  document.getElementById('modal-' + type).classList.remove('active');
}

function toggleQuestionModalOptions() {
  var t = document.getElementById('q-type-select').value;
  var showOpts = t === 'choice' || t === 'multi';
  document.getElementById('q-options-field').style.display = showOpts ? 'block' : 'none';
  document.getElementById('q-answer-choice').style.display = t === 'choice' ? 'block' : 'none';
  document.getElementById('q-answer-multi').style.display = t === 'multi' ? 'block' : 'none';
  document.getElementById('q-answer-judge').style.display = t === 'judge' ? 'block' : 'none';
  document.getElementById('q-answer-text').style.display = (t === 'fill' || t === 'short') ? 'block' : 'none';
  var labelMap = { choice: '正确答案', multi: '正确答案（可多选）', judge: '判断结果', fill: '答案', short: '参考答案' };
  document.getElementById('q-answer-label').textContent = labelMap[t] || '答案';
}

function saveQuestion() {
  if (!currentNodeId) return toast('请先选择一个题库文件', 'warning');
  if (!currentSubject) return toast('请先选择学科', 'warning');
  var type = document.getElementById('q-type-select').value;
  var question = document.getElementById('q-text-input').value.trim();
  if (!question) return toast('请输入题目内容', 'warning');
  var explanation = document.getElementById('q-explain-input').value.trim();
  var options = [], answer = '';
  if (type === 'choice' || type === 'multi') {
    document.querySelectorAll('.opt-input').forEach(function (inp) {
      if (inp.value.trim()) options.push({ label: String.fromCharCode(65 + parseInt(inp.dataset.idx)), text: inp.value.trim() });
    });
    if (options.length < 2) return toast('至少需要2个选项', 'warning');
    if (type === 'multi') {
      var checked = [];
      document.querySelectorAll('.multi-ans:checked').forEach(function (cb) { checked.push(cb.value); });
      if (!checked.length) return toast('请至少选择一个正确答案', 'warning');
      answer = checked.sort().join('');
    } else {
      answer = document.getElementById('q-answer-select').value;
    }
  } else if (type === 'judge') {
    answer = document.getElementById('q-answer-judge-select').value;
  } else {
    answer = document.getElementById('q-answer-text').value.trim();
    if (!answer) return toast('请输入答案', 'warning');
  }
  var qData = { type: type, question: question, options: options, answer: answer, explanation: explanation };
  if (editingQuestionId) {
    updateQuestion(currentSubject, editingQuestionId, qData);
    toast('题目已更新', 'success');
  } else {
    addQuestion(currentSubject, qData);
    toast('题目已添加', 'success');
  }
  hideModal('question');
}

function editQuestion(qId) {
  // Search across all file nodes (v2.0 tree model)
  var q = null;
  var fileNodeId = null;
  for (var i = 0; i < appData.subjects.length; i++) {
    var nodes = appData.subjects[i].nodes || [];
    for (var j = 0; j < nodes.length; j++) {
      if (nodes[j].type === 'file' && nodes[j].questions) {
        var found = nodes[j].questions.find(function (x) { return x.id === qId; });
        if (found) { q = found; fileNodeId = nodes[j].id; currentSubject = appData.subjects[i].name; break; }
      }
    }
    if (q) break;
  }
  if (!q) return;
  currentNodeId = fileNodeId;
  editingQuestionId = qId;
  document.getElementById('modal-q-title').textContent = '编辑题目';
  document.getElementById('q-type-select').value = q.type;
  document.getElementById('q-text-input').value = q.question;
  document.getElementById('q-explain-input').value = q.explanation || '';
  if ((q.type === 'choice' || q.type === 'multi') && q.options) {
    document.querySelectorAll('.opt-input').forEach(function (inp, i) { inp.value = q.options[i] ? q.options[i].text : ''; });
    if (q.type === 'multi') {
      document.querySelectorAll('.multi-ans').forEach(function (cb) { cb.checked = (q.answer || '').indexOf(cb.value) !== -1; });
    } else {
      document.getElementById('q-answer-select').value = q.answer || 'A';
    }
  } else if (q.type === 'judge') {
    document.getElementById('q-answer-judge-select').value = q.answer || '正确';
  } else { document.getElementById('q-answer-text').value = q.answer || ''; }
  toggleQuestionModalOptions();
  switchModalTab('single', document.querySelector('[data-mtab="single"]'));
  updateSingleTargetDisplay();
  document.getElementById('modal-question').classList.add('active');
}

// ============================================================
// JSON FIXER
// ============================================================
function fixJSON(input) {
  if (!input || !input.trim()) return { success: false, error: '输入为空', output: input };
  var text = input.trim();
  var fixes = [];
  try { return { success: true, output: JSON.parse(text), fixes: ['完美解析'] }; } catch (e) {}

  var nt = text.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']');
  if (nt !== text) { fixes.push('去除尾逗号'); text = nt; }
  try { return { success: true, output: JSON.parse(text), fixes: fixes }; } catch (e) {}

  nt = text.replace(/'/g, '"');
  if (nt !== text) { fixes.push('单引号→双引号'); text = nt; }
  try { return { success: true, output: JSON.parse(text), fixes: fixes }; } catch (e) {}

  nt = text.replace(/([{,]\s*)([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:/g, '$1"$2":');
  if (nt !== text) { fixes.push('补全属性名引号'); text = nt; }
  try { return { success: true, output: JSON.parse(text), fixes: fixes }; } catch (e) {}

  nt = text.replace(/:\s*([^"{}\[\]\d\s,][^,}\]]*?)(\s*[,}\]])/g, function (m, v, sep) {
    var val = v.trim();
    if (/^(true|false|null)$/i.test(val)) return ': ' + val.toLowerCase() + sep;
    if (/^-?\d+\.?\d*$/.test(val)) return ': ' + val + sep;
    return ': "' + val.replace(/"/g, '\\"') + '"' + sep;
  });
  if (nt !== text) { fixes.push('补全值引号'); text = nt; }
  try { return { success: true, output: JSON.parse(text), fixes: fixes }; } catch (e) {}

  return { success: false, error: '无法修复', output: text, fixes: fixes };
}

// ============================================================
// IMPORT DESTINATION PICKER
// ============================================================
var _importPickerCallback = null;
var _importPickerSelectedFile = null;

function showImportPicker(callback) {
  _importPickerCallback = callback;
  _importPickerSelectedFile = null;
  document.getElementById('btn-import-confirm').disabled = true;
  document.getElementById('import-picker-selected').textContent = '';
  document.getElementById('modal-import-picker').classList.add('active');
  renderImportPickerTree();
}

function hideImportPicker() {
  document.getElementById('modal-import-picker').classList.remove('active');
  _importPickerCallback = null;
  _importPickerSelectedFile = null;
}

function confirmImportPicker() {
  if (!_importPickerSelectedFile || !_importPickerCallback) return;
  _importPickerCallback(_importPickerSelectedFile);
  hideImportPicker();
}

function importPickerSelectFile(nodeId) {
  _importPickerSelectedFile = nodeId;
  var node = getNode(nodeId);
  var subj = getSubjectByNodeId(nodeId);
  var path = subj ? subj.name + ' / ' + node.name : node.name;
  document.getElementById('import-picker-selected').textContent = '已选择：' + path + '（' + (node.questions ? node.questions.length : 0) + '题）';
  document.getElementById('btn-import-confirm').disabled = false;
  document.querySelectorAll('#import-picker-tree .ip-tree-file').forEach(function (el) {
    el.classList.toggle('active', el.dataset.nodeId === nodeId);
  });
}

function importPickerToggleFolder(nodeId) {
  var node = getNode(nodeId);
  if (!node || node.type !== 'folder') return;
  node.expanded = node.expanded === false ? true : false;
  renderImportPickerTree();
}

function importPickerNewFolder(parentId) {
  var name = prompt('新建文件夹名称：');
  if (!name || !name.trim()) return;
  var subj = getSubjectByNodeId(parentId);
  if (!subj) return;
  addFolder(parentId, name.trim());
  renderImportPickerTree();
}

function importPickerNewFile(parentId) {
  var name = prompt('新建题库名称：');
  if (!name || !name.trim()) return;
  var subj = getSubjectByNodeId(parentId);
  if (!subj) return;
  addFile(parentId, name.trim());
  renderImportPickerTree();
}

function importPickerNewSubject() {
  var name = prompt('新建学科名称：');
  if (!name || !name.trim()) return;
  if (getSubject(name.trim())) return toast('该学科已存在', 'warning');
  var rootId = 'node_' + Date.now() + '_' + Math.floor(Math.random() * 10000);
  appData.subjects.push({
    name: name.trim(),
    description: '',
    nodes: [
      { id: rootId, type: 'folder', name: name.trim(), parentId: null, expanded: true }
    ]
  });
  saveData();
  renderImportPickerTree();
}

function renderImportPickerTree() {
  var container = document.getElementById('import-picker-tree');
  if (!appData.subjects.length) {
    container.innerHTML = '<div style="padding:20px;text-align:center;color:var(--gray-400);font-size:13px">暂无学科，请先新建学科</div>';
    return;
  }
  var html = '';
  appData.subjects.forEach(function (s) {
    var root = getRootNode(s);
    if (!root) return;
    html += '<div style="margin-bottom:2px">';
    html += '<div class="ip-subject-header" style="display:flex;align-items:center;gap:4px;padding:4px 6px;font-weight:600;font-size:12px;border-radius:4px">';
    html += '<span onclick="importPickerToggleFolder(\'' + root.id + '\')" style="font-size:10px;width:12px;cursor:pointer">' + (root.expanded !== false ? '▼' : '▶') + '</span>';
    html += '<span onclick="importPickerToggleFolder(\'' + root.id + '\')" style="cursor:pointer">📁 ' + escHtml(s.name) + '</span>';
    html += '<span style="margin-left:auto;display:flex;gap:2px">' +
      '<button onclick="event.stopPropagation();importPickerNewFolder(\'' + root.id + '\')" style="border:none;background:none;cursor:pointer;font-size:10px" title="新建文件夹">📁+</button>' +
      '<button onclick="event.stopPropagation();importPickerNewFile(\'' + root.id + '\')" style="border:none;background:none;cursor:pointer;font-size:10px" title="新建题库">📄+</button>' +
    '</span>';
    html += '</div>';
    if (root.expanded !== false) {
      html += '<div style="padding-left:16px">';
      html += renderImportPickerChildren(root.id, s);
      html += '</div>';
    }
    html += '</div>';
  });
  container.innerHTML = html;
}

function renderImportPickerChildren(parentId, subject) {
  var children = getChildrenNodes(parentId, subject);
  if (!children.length) {
    return '<div style="padding:4px 6px;font-size:11px;color:var(--gray-400);display:flex;gap:4px;align-items:center">' +
      '<span>空文件夹</span>' +
      '<button onclick="event.stopPropagation();importPickerNewFolder(\'' + parentId + '\')" style="border:none;background:none;cursor:pointer;font-size:11px" title="新建文件夹">📁+</button>' +
      '<button onclick="event.stopPropagation();importPickerNewFile(\'' + parentId + '\')" style="border:none;background:none;cursor:pointer;font-size:11px" title="新建题库">📄+</button>' +
    '</div>';
  }
  // Sort: folders first, then files, A-Z
  children.sort(function (a, b) {
    if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
    return a.name.localeCompare(b.name, 'zh-CN');
  });
  return children.map(function (node) {
    if (node.type === 'folder') {
      var expanded = node.expanded !== false;
      var childHtml = '<div class="ip-tree-folder">';
      childHtml += '<div onclick="importPickerToggleFolder(\'' + node.id + '\')" style="display:flex;align-items:center;gap:4px;padding:3px 6px;cursor:pointer;font-size:12px;border-radius:4px">';
      childHtml += '<span style="font-size:10px;width:12px">' + (expanded ? '▼' : '▶') + '</span>';
      childHtml += '<span>📁 ' + escHtml(node.name) + '</span>';
      childHtml += '<span style="margin-left:auto;display:flex;gap:2px">' +
        '<button onclick="event.stopPropagation();importPickerNewFolder(\'' + node.id + '\')" style="border:none;background:none;cursor:pointer;font-size:10px" title="新建文件夹">📁+</button>' +
        '<button onclick="event.stopPropagation();importPickerNewFile(\'' + node.id + '\')" style="border:none;background:none;cursor:pointer;font-size:10px" title="新建题库">📄+</button>' +
      '</span>';
      childHtml += '</div>';
      if (expanded) {
        childHtml += '<div style="padding-left:16px">' + renderImportPickerChildren(node.id, subject) + '</div>';
      }
      childHtml += '</div>';
      return childHtml;
    } else {
      var qCount = (node.questions || []).length;
      return '<div class="ip-tree-file" data-node-id="' + node.id + '" onclick="importPickerSelectFile(\'' + node.id + '\')" style="display:flex;align-items:center;gap:4px;padding:3px 6px;cursor:pointer;font-size:12px;border-radius:4px;margin:1px 0">' +
        '<span style="width:12px"></span>' +
        '<span>📄 ' + escHtml(node.name) + '</span>' +
        '<span style="font-size:10px;color:var(--gray-400)">' + qCount + '题</span>' +
      '</div>';
    }
  }).join('');
}

// ============================================================
// IMPORT / EXPORT
// ============================================================
function fixAndPreviewJSON() {
  var input = document.getElementById('import-json').value.trim();
  if (!input) return toast('请粘贴JSON数据', 'warning');
  var result = fixJSON(input);
  var preview = document.getElementById('import-preview-json');
  if (result.success) {
    var data = result.output;
    var qc = data.subjects ? data.subjects.reduce(function (s, sub) { return s + (sub.questions ? sub.questions.length : 0); }, 0) : 0;
    preview.innerHTML = '<div style="margin:10px 0;padding:8px 14px;background:#f0fdf4;border-radius:6px;color:#166534;font-size:13px">' +
      '✅ 修复成功！' + (result.fixes ? result.fixes.join('、') : '') + '<br>' +
      (data.subjects ? data.subjects.length : 0) + '个学科，' + qc + '道题' +
      '<button class="btn-primary btn-sm" style="margin-top:6px" onclick="importFixedJSON()">确认导入</button>' +
    '</div>';
    window._fixedJSON = data;
  } else {
    preview.innerHTML = '<div style="margin:10px 0;padding:8px 14px;background:#fef2f2;border-radius:6px;color:#991b1b;font-size:13px">' +
      '❌ 修复失败：' + result.error +
      '<details style="margin-top:6px"><summary style="cursor:pointer">查看原文</summary>' +
      '<pre style="margin-top:4px;padding:6px;background:var(--gray-100);border-radius:4px;font-size:11px;overflow-x:auto">' + escHtml(result.output) + '</pre></details>' +
    '</div>';
  }
}

function importFixedJSON() {
  if (!window._fixedJSON) return;

  function doImport(targetFileId) {
    var file = getNode(targetFileId);
    if (!file || file.type !== 'file') return toast('目标题库无效', 'error');
    var data = window._fixedJSON;
    if (data.subjects && Array.isArray(data.subjects)) {
      data.subjects.forEach(function (sub) {
        var qs = (sub.questions || []).map(function (q) {
          return { id: Date.now() + Math.floor(Math.random() * 10000), type: q.type, question: q.question, options: q.options || [], answer: q.answer || '', score: q.score || 1, explanation: q.explanation || '', stats: q.stats || { attempts: 0, correct: 0, wrong: 0 } };
        });
        qs.forEach(function (q) { file.questions.push(q); });
      });
    } else if (data.questions && Array.isArray(data.questions)) {
      var qs = data.questions.map(function (q) {
        return { id: Date.now() + Math.floor(Math.random() * 10000), type: q.type, question: q.question, options: q.options || [], answer: q.answer || '', score: q.score || 1, explanation: q.explanation || '', stats: q.stats || { attempts: 0, correct: 0, wrong: 0 } };
      });
      qs.forEach(function (q) { file.questions.push(q); });
    }
    saveData(); renderSidebar(); renderBrowse();
    document.getElementById('import-preview-json').innerHTML = ''; document.getElementById('import-json').value = '';
    window._fixedJSON = null; toast('JSON导入成功！', 'success');
  }

  showImportPicker(doImport);
}

function importJSON() {
  var input = document.getElementById('import-json').value.trim();
  if (!input) return toast('请粘贴JSON', 'warning');
  var r = fixJSON(input);
  if (!r.success) {
    document.getElementById('import-preview-json').innerHTML =
      '<div style="margin:10px 0;padding:8px 14px;background:#fef2f2;border-radius:6px;color:#991b1b;font-size:13px">❌ JSON格式错误，请使用修复预览</div>';
    return;
  }
  window._fixedJSON = r.output; importFixedJSON();
}

function exportData() {
  var json = JSON.stringify(appData, null, 2);
  var blob = new Blob([json], { type: 'application/json' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a'); a.href = url;
  a.download = '题库_' + new Date().toISOString().slice(0, 10) + '.json';
  a.click(); URL.revokeObjectURL(url);
  toast('导出成功', 'success');
}

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
    return '<div style="padding:4px 6px;font-size:11px;color:var(--gray-400)">空文件夹</div>';
  }
  // Sort: folders first, then files, A-Z
  children.sort(smartSortName);
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


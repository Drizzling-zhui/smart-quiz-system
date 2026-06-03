// ============================================================
// SIDEBAR — Tree File System
// ============================================================
function renderSidebar() {
  var c = document.getElementById('subject-list');
  if (!appData.subjects.length) {
    c.innerHTML = '<div class="empty-state" style="padding:30px 10px"><div class="icon">📭</div><p>暂无学科</p></div>';
    return;
  }
  var html = '';
  appData.subjects.forEach(function (s, idx) {
    var root = getRootNode(s);
    if (!root) return;
    if (idx > 0) html += '<div class="subject-divider"></div>';
    // Root folder is a regular draggable tree-node — subjects and folders are identical
    html += renderTreeNode(root, s, 0);
  });
  c.innerHTML = html;
}

function renderTreeNode(node, subject, depth) {
  var pad = 14 + depth * 18;
  var isFolder = node.type === 'folder';
  var isSelected = currentNodeId === node.id;
  var isExpanded = node.expanded !== false;
  var qCount = isFolder ? countQuestionsInNode(node.id) : (node.questions || []).length;

  var html = '<div class="tree-node' + (isSelected ? ' active' : '') + (isFolder ? ' folder-node' : ' file-node') + '" style="padding-left:' + pad + 'px" data-node-id="' + node.id + '"' +
    ' draggable="true" ondragstart="handleDragStart(event,\'' + node.id + '\')" ondragend="handleDragEnd(event)"' +
    (isFolder ? ' ondragover="handleDragOver(event,\'' + node.id + '\')" ondragleave="handleDragLeave(event)" ondrop="handleDrop(event,\'' + node.id + '\')"' : '') +
    '>';

  // Arrow or spacer
  if (isFolder) {
    html += '<span class="tree-arrow" onclick="event.stopPropagation();toggleFolder(\'' + node.id + '\')">' + (isExpanded ? '▼' : '▶') + '</span>';
  } else {
    html += '<span class="tree-arrow" style="visibility:hidden">▶</span>';
  }

  // Icon
  html += '<span class="tree-icon">' + (isFolder ? (isExpanded ? '📂' : '📁') : '📄') + '</span>';

  // Name
  html += '<span class="tree-name" onclick="' + (isFolder ? "toggleFolder('" + node.id + "')" : "selectNode('" + node.id + "')") + '">' + escHtml(node.name) + '</span>';

  // Count
  if (isFolder) {
    html += '<span class="tree-count">' + qCount + '</span>';
  } else {
    html += '<span class="tree-count">' + qCount + '题</span>';
  }

  // Actions on hover
  html += '<span class="tree-actions">';
  if (isFolder) {
    html += '<button onclick="event.stopPropagation();promptNewFolder(\'' + node.id + '\')" title="新建文件夹">📁+</button>';
    html += '<button onclick="event.stopPropagation();promptNewFile(\'' + node.id + '\')" title="新建题库">📄+</button>';
  }
  html += '<button onclick="event.stopPropagation();promptRenameNode(\'' + node.id + '\')" title="重命名">✏️</button>';
  html += '<button class="del" onclick="event.stopPropagation();confirmAction(\'确定删除「' + escHtml(node.name) + '\」？' + (isFolder ? '文件夹内所有内容将一并删除。' : '') + '\',function(){deleteNode(\'' + node.id + '\')})" title="删除">🗑️</button>';
  html += '</span>';

  html += '</div>';

  // Render children if folder and expanded
  if (isFolder && isExpanded) {
    var children = getChildrenNodes(node.id, subject);
    if (children.length) {
      // Sort: folders first (A-Z), then files (A-Z)
      children.sort(function (a, b) {
        if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
        return a.name.localeCompare(b.name, 'zh-CN');
      });
      children.forEach(function (child) {
        html += renderTreeNode(child, subject, depth + 1);
      });
    } else {
      html += '<div class="tree-empty" style="padding-left:' + (14 + (depth + 1) * 18) + 'px">空文件夹</div>';
    }
  }

  return html;
}

function toggleFolder(nodeId) {
  var node = getNode(nodeId);
  if (!node || node.type !== 'folder') return;
  node.expanded = node.expanded === false ? true : false;
  saveData();
  renderSidebar();
}

function promptNewFolder(parentId) {
  var name = prompt('新建文件夹名称：');
  if (!name || !name.trim()) return;
  addFolder(parentId, name.trim());
}

function promptNewFile(parentId) {
  var name = prompt('新建题库名称：');
  if (!name || !name.trim()) return;
  addFile(parentId, name.trim());
}

function promptRenameNode(nodeId) {
  var node = getNode(nodeId);
  if (!node) return;
  var newName = prompt('重命名：', node.name);
  if (!newName || !newName.trim() || newName.trim() === node.name) return;
  renameNode(nodeId, newName.trim());
}

function addFolder(parentId, name) {
  var subject = getSubjectByNodeId(parentId);
  if (!subject) return;
  var newNode = {
    id: 'node_' + Date.now() + '_' + Math.floor(Math.random() * 10000),
    type: 'folder',
    name: name,
    parentId: parentId,
    expanded: true
  };
  subject.nodes.push(newNode);
  saveData();
  renderSidebar();
  toast('文件夹「' + name + '」已创建', 'success');
}

function addFile(parentId, name) {
  var subject = getSubjectByNodeId(parentId);
  if (!subject) return;
  var newNode = {
    id: 'node_' + Date.now() + '_' + Math.floor(Math.random() * 10000),
    type: 'file',
    name: name,
    parentId: parentId,
    questions: []
  };
  subject.nodes.push(newNode);
  saveData();
  renderSidebar();
  toast('题库「' + name + '」已创建', 'success');
}

function renameNode(nodeId, newName) {
  var node = getNode(nodeId);
  if (!node) return;
  node.name = newName;
  // Root node: also rename the subject
  if (node.parentId === null) {
    var subject = getSubjectByNodeId(nodeId);
    if (subject) subject.name = newName;
  }
  saveData();
  renderSidebar();
  renderBrowse();
  toast('已重命名', 'info');
}

function deleteNode(nodeId) {
  var subject = getSubjectByNodeId(nodeId);
  if (!subject) return;
  var node = getNode(nodeId);
  // Root node: delete the entire subject
  if (node && node.parentId === null) {
    deleteSubject(subject.name);
    return;
  }
  // Recursively delete all children
  var toDelete = [nodeId];
  collectDescendantIds(nodeId, subject, toDelete);
  subject.nodes = subject.nodes.filter(function (n) { return toDelete.indexOf(n.id) === -1; });
  if (currentNodeId === nodeId) { currentNodeId = null; }
  saveData();
  renderSidebar();
  renderBrowse();
  toast('已删除', 'info');
}

function collectDescendantIds(nodeId, subject, result) {
  getChildrenNodes(nodeId, subject).forEach(function (child) {
    result.push(child.id);
    if (child.type === 'folder') collectDescendantIds(child.id, subject, result);
  });
}

function isDescendantOf(ancestorId, nodeId) {
  var subject = getSubjectByNodeId(nodeId);
  if (!subject) return false;
  var current = getNode(nodeId);
  while (current && current.parentId) {
    if (current.parentId === ancestorId) return true;
    current = getNode(current.parentId);
  }
  return false;
}

var _dragNodeId = null;

function handleDragStart(e, nodeId) {
  _dragNodeId = nodeId;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', nodeId);
  setTimeout(function () { e.target.classList.add('dragging'); }, 0);
}

function handleDragEnd(e) {
  _dragNodeId = null;
  document.querySelectorAll('.tree-node.dragging, .tree-node.drag-over, .tree-node.drag-invalid').forEach(function (el) {
    el.classList.remove('dragging', 'drag-over', 'drag-invalid');
  });
}

function handleDragOver(e, nodeId) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  var el = e.currentTarget;
  if (!_dragNodeId || _dragNodeId === nodeId || isDescendantOf(_dragNodeId, nodeId)) {
    el.classList.add('drag-invalid');
    el.classList.remove('drag-over');
    return;
  }
  el.classList.add('drag-over');
  el.classList.remove('drag-invalid');
}

function handleDragLeave(e) {
  var el = e.currentTarget;
  if (e.relatedTarget && el.contains(e.relatedTarget)) return;
  el.classList.remove('drag-over', 'drag-invalid');
}

function handleDrop(e, targetNodeId) {
  e.preventDefault();
  e.currentTarget.classList.remove('drag-over', 'drag-invalid');
  var nodeId = _dragNodeId;
  _dragNodeId = null;
  if (!nodeId || nodeId === targetNodeId) return;
  moveNode(nodeId, targetNodeId);
}

function moveNode(nodeId, targetParentId) {
  var node = getNode(nodeId);
  var target = getNode(targetParentId);
  if (!node || !target) return;
  if (target.type !== 'folder') return;
  if (node.parentId === targetParentId) return;
  if (isDescendantOf(nodeId, targetParentId)) return;

  var sourceSubj = getSubjectByNodeId(nodeId);
  var targetSubj = getSubjectByNodeId(targetParentId);
  if (!sourceSubj || !targetSubj) return;

  // Collect node and all descendants to move
  var toMoveIds = [nodeId];
  collectDescendantIds(nodeId, sourceSubj, toMoveIds);

  if (sourceSubj !== targetSubj) {
    // Move nodes between subjects
    var movedNodes = [];
    for (var i = sourceSubj.nodes.length - 1; i >= 0; i--) {
      if (toMoveIds.indexOf(sourceSubj.nodes[i].id) !== -1) {
        movedNodes.push(sourceSubj.nodes[i]);
        sourceSubj.nodes.splice(i, 1);
      }
    }
    targetSubj.nodes = targetSubj.nodes.concat(movedNodes);
  }

  node.parentId = targetParentId;
  target.expanded = true;
  saveData();
  renderSidebar();
  toast('已移动「' + node.name + '」', 'info');
}

// ============================================================
// SUBJECT CRUD
// ============================================================
function promptNewSubject() {
  var name = prompt('新建学科名称：');
  if (!name || !name.trim()) return;
  addSubject(name.trim());
}

function addSubject(name) {
  if (!name.trim()) return toast('请输入学科名称', 'warning');
  if (getSubject(name.trim())) return toast('该学科已存在', 'warning');
  var rootId = 'node_' + Date.now() + '_' + Math.floor(Math.random() * 10000);
  appData.subjects.push({
    name: name.trim(),
    description: '',
    nodes: [
      { id: rootId, type: 'folder', name: name.trim(), parentId: null, expanded: true }
    ]
  });
  saveData(); renderSidebar(); switchTab('browse');
  toast('学科「' + name.trim() + '」已添加', 'success');
}

function promptRenameSubject(oldName) {
  var newName = prompt('重命名学科：', oldName);
  if (!newName || !newName.trim() || newName.trim() === oldName) return;
  renameSubject(oldName, newName.trim());
}

function renameSubject(oldName, newName) {
  if (!newName.trim()) return toast('名称不能为空', 'warning');
  if (oldName !== newName.trim() && getSubject(newName.trim())) return toast('已存在同名学科', 'warning');
  var subj = getSubject(oldName); if (!subj) return;
  subj.name = newName.trim();
  var root = getRootNode(subj);
  if (root) root.name = newName.trim();
  saveData(); renderSidebar(); renderBrowse();
  if (currentSubject === oldName) { currentSubject = newName.trim(); }
}

function deleteSubject(name) {
  var idx = appData.subjects.findIndex(function (s) { return s.name === name; });
  if (idx === -1) return;
  appData.subjects.splice(idx, 1); saveData(); renderSidebar();
  if (currentSubject === name) { currentSubject = null; currentNodeId = null; renderBrowse(); }
  toast('学科已删除', 'info');
}

function confirmAction(msg, fn) {
  if (confirm(msg)) fn();
}

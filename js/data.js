// ============================================================
// DATA MODEL
// ============================================================
var STORAGE_KEY = 'quiz_app_data_v3';
var FAVORITES_KEY = 'quiz_app_favorites';
var CHAT_KEY = 'quiz_app_chat';

var appData = { version: '2.0', subjects: [] };
var currentSubject = null;
var currentNodeId = null;
var currentFilter = 'all';
var currentBrowseMode = 'sequential';
var showAnswers = false;
var favorites = [];

function loadFavorites() {
  try {
    var raw = localStorage.getItem(FAVORITES_KEY);
    if (raw) favorites = JSON.parse(raw);
    if (!Array.isArray(favorites)) favorites = [];
  } catch (e) { favorites = []; }
}

function saveFavorites() {
  try { localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites)); } catch (e) {}
}

function isFavorite(qId) {
  return favorites.indexOf(qId) !== -1;
}

function toggleFavorite(qId) {
  var idx = favorites.indexOf(qId);
  if (idx >= 0) favorites.splice(idx, 1);
  else favorites.push(qId);
  saveFavorites();
}

function loadData() {
  try {
    var raw = localStorage.getItem(STORAGE_KEY);
    if (raw) appData = JSON.parse(raw);
    if (!appData.subjects) appData.subjects = [];
    // Migration from v1/v2 to v2.0 (tree model)
    if (!appData.version || appData.version !== '2.0') {
    appData.subjects.forEach(function (s) {
      if (!s.nodes) {
        // Old format: questions[] directly on subject
        var oldQuestions = s.questions || [];
        var rootId = 'node_' + Date.now() + '_' + Math.floor(Math.random() * 10000);
        var fileId = 'node_' + (Date.now() + 1) + '_' + Math.floor(Math.random() * 10000);
        s.nodes = [
          { id: rootId, type: 'folder', name: s.name, parentId: null, expanded: true },
          { id: fileId, type: 'file', name: '默认题库', parentId: rootId, questions: oldQuestions }
        ];
        delete s.questions;
      }
      // Ensure all nodes have IDs and stats
      s.nodes.forEach(function (n) {
        if (n.type === 'file' && n.questions) {
          n.questions.forEach(function (q) {
            if (!q.id) q.id = Date.now() + Math.floor(Math.random() * 10000);
            if (!q.stats) q.stats = { attempts: 0, correct: 0, wrong: 0 };
          });
        }
      });
    });
    appData.version = '2.0';
    saveData();
    }
  } catch (e) { console.warn('Load error', e); }
  loadFavorites();
}

var _saveDebounceTimer = null;
function saveData() {
  // Debounce: rapid successive calls only write once (300ms)
  if (_saveDebounceTimer) clearTimeout(_saveDebounceTimer);
  _saveDebounceTimer = setTimeout(function () {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(appData, null, 2)); } catch (e) {}
    // Skip local file sync on mobile/Capacitor — tablet has no local folder binding
    if (typeof backupToFile === 'function' && !(typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform && Capacitor.isNativePlatform())) {
      backupToFile();
    }
  }, 300);
}

// Remove aiGenerated flag from all questions across all subjects
function clearAllAiGenerated() {
  var count = 0;
  (appData.subjects || []).forEach(function (s) {
    (s.nodes || []).forEach(function (n) {
      if (n.type === 'file' && n.questions) {
        n.questions.forEach(function (q) {
          if (q.aiGenerated) { delete q.aiGenerated; count++; }
          if (q.aiConfidence) { delete q.aiConfidence; }
          if (q.aiReasoning) { delete q.aiReasoning; }
        });
      }
    });
  });
  saveData();
  renderSidebar();
  renderBrowse();
  toast('已清除 ' + count + ' 道题目的 AI 标记', 'success');
}

function getSubject(name) {
  return appData.subjects.find(function (s) { return s.name === name; });
}

function getNode(nodeId) {
  for (var i = 0; i < appData.subjects.length; i++) {
    var nodes = appData.subjects[i].nodes;
    if (!nodes) continue;
    for (var j = 0; j < nodes.length; j++) {
      if (nodes[j].id === nodeId) return nodes[j];
    }
  }
  return null;
}

function getSubjectByNodeId(nodeId) {
  for (var i = 0; i < appData.subjects.length; i++) {
    var nodes = appData.subjects[i].nodes;
    if (!nodes) continue;
    for (var j = 0; j < nodes.length; j++) {
      if (nodes[j].id === nodeId) return appData.subjects[i];
    }
  }
  return null;
}

function getChildrenNodes(parentId, subject) {
  return (subject.nodes || []).filter(function (n) { return n.parentId === parentId; });
}

function getRootNode(subject) {
  return (subject.nodes || []).find(function (n) { return n.parentId === null; });
}

function getAllQuestionsFromNode(nodeId) {
  var node = getNode(nodeId);
  if (!node) return [];
  if (node.type === 'file') return node.questions || [];
  // For folders, recursively collect questions from all file descendants
  var result = [];
  var subject = getSubjectByNodeId(nodeId);
  if (!subject) return result;
  collectQuestions(nodeId, subject, result);
  return result;
}

function collectQuestions(nodeId, subject, result) {
  getChildrenNodes(nodeId, subject).forEach(function (child) {
    if (child.type === 'file') {
      result.push.apply(result, child.questions || []);
    } else if (child.type === 'folder') {
      collectQuestions(child.id, subject, result);
    }
  });
}

function countQuestionsInNode(nodeId) {
  var node = getNode(nodeId);
  if (!node) return 0;
  if (node.type === 'file') return (node.questions || []).length;
  var subject = getSubjectByNodeId(nodeId);
  if (!subject) return 0;
  return countRecursive(nodeId, subject);
}

function countRecursive(nodeId, subject) {
  var total = 0;
  getChildrenNodes(nodeId, subject).forEach(function (child) {
    if (child.type === 'file') total += (child.questions || []).length;
    else if (child.type === 'folder') total += countRecursive(child.id, subject);
  });
  return total;
}

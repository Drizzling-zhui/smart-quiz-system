// ============================================================
// APP INIT
// ============================================================
function switchTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(function (b) { b.classList.toggle('active', b.dataset.tab === tab); });
  document.querySelectorAll('.view').forEach(function (v) { v.classList.remove('active'); });
  document.getElementById('view-' + tab).classList.add('active');
  if (tab === 'browse') renderBrowse();
  if (tab === 'quiz') {
    if (!quizState.started) renderQuizSetup();
    var panel = document.getElementById('chat-panel');
    if (panel.classList.contains('open')) toggleChat();
  }
}

// Init
loadData();
renderSidebar();
if (appData.subjects.length && appData.subjects[0].nodes) {
  var firstFile = appData.subjects[0].nodes.find(function (n) { return n.type === 'file'; });
  if (firstFile) { currentNodeId = firstFile.id; currentSubject = appData.subjects[0].name; }
}
renderBrowse();

if (!hasApiConfigured()) {
  setTimeout(function () {
    document.getElementById('banner-api').classList.add('active');
  }, 500);
}

document.querySelectorAll('.modal-overlay').forEach(function (o) {
  o.addEventListener('click', function (e) {
    if (e.target === o) {
      o.classList.remove('active');
      if (o.id === 'modal-import-picker') { _importPickerCallback = null; _importPickerSelectedFile = null; }
    }
  });
});
document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape') document.querySelectorAll('.modal-overlay.active').forEach(function (m) { m.classList.remove('active'); });
  if (e.key === 'Enter' && document.querySelector('.modal-overlay.active')) {
    var m = document.querySelector('.modal-overlay.active');
    if (m.id === 'modal-question') saveQuestion();
  }
});

console.log('📚 智能题库系统 v2 已加载');
updateFastModeBtn();
initFileSync();
setTimeout(function () { checkQuizResume(); }, 300);

// ============================================================
// SIDEBAR DRAWER (swipe to show/hide on mobile)
// ============================================================
function toggleSidebar() {
  var sb = document.getElementById('sidebar');
  if (sb.classList.contains('open')) closeSidebar();
  else openSidebar();
}

function openSidebar() {
  document.getElementById('sidebar').classList.add('open');
}

function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
}

// Close sidebar when selecting a node
var _origSelectNode = selectNode;
selectNode = function (nodeId) {
  _origSelectNode(nodeId);
  if (window.innerWidth <= 768) closeSidebar();
};

// Swipe gesture detection
(function () {
  var touchStartX = 0, touchStartY = 0, tracking = false;

  document.addEventListener('touchstart', function (e) {
    if (e.touches.length !== 1) return;
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
    tracking = true;
  }, { passive: true });

  document.addEventListener('touchend', function (e) {
    if (!tracking) return;
    tracking = false;
    var dx = (e.changedTouches[0] || {}).clientX - touchStartX;
    var dy = Math.abs(((e.changedTouches[0] || {}).clientY || touchStartY) - touchStartY);

    // Swipe right from left edge → open sidebar
    if (dx > 60 && Math.abs(dx) > dy && touchStartX < 30) {
      openSidebar();
      return;
    }
    // Swipe left anywhere on screen → close sidebar
    if (dx < -50 && Math.abs(dx) > dy && document.getElementById('sidebar').classList.contains('open')) {
      closeSidebar();
      return;
    }
  }, { passive: true });
})();

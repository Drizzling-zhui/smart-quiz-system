// ============================================================
// APP INIT
// ============================================================
function switchTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(function (b) { b.classList.toggle('active', b.dataset.tab === tab); });
  document.querySelectorAll('.view').forEach(function (v) { v.classList.remove('active'); });
  document.getElementById('view-' + tab).classList.add('active');
  if (tab === 'browse') renderBrowse();
  if (tab === 'quiz') renderQuizSetup();
}

// Init
loadData();
renderSidebar();
if (appData.subjects.length) { selectSubject(appData.subjects[0].name); }
else renderBrowse();

if (!hasApiConfigured()) {
  setTimeout(function () {
    document.getElementById('banner-api').classList.add('active');
  }, 500);
}

document.querySelectorAll('.modal-overlay').forEach(function (o) {
  o.addEventListener('click', function (e) { if (e.target === o) o.classList.remove('active'); });
});
document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape') document.querySelectorAll('.modal-overlay.active').forEach(function (m) { m.classList.remove('active'); });
  if (e.key === 'Enter' && document.querySelector('.modal-overlay.active')) {
    var m = document.querySelector('.modal-overlay.active');
    if (m.id === 'modal-subject') saveSubject();
    else if (m.id === 'modal-question') saveQuestion();
  }
});

console.log('📚 智能题库系统 v2 已加载');

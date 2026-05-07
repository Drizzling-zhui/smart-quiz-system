// ============================================================
// DATA MODEL
// ============================================================
var STORAGE_KEY = 'quiz_app_data_v2';
var appData = { version: '1.0', subjects: [] };
var currentSubject = null;
var currentFilter = 'all';

function loadData() {
  try {
    var raw = localStorage.getItem(STORAGE_KEY);
    if (raw) appData = JSON.parse(raw);
    if (!appData.subjects) appData.subjects = [];
    appData.subjects.forEach(function (s) {
      (s.questions || []).forEach(function (q) {
        if (!q.stats) q.stats = { attempts: 0, correct: 0, wrong: 0 };
        if (q.type === 'choice' && q.options && q.options.length > 0) {
          var allEmpty = q.options.every(function (o) { return !o.text || o.text.trim() === ''; });
          if (allEmpty && q.question) {
            var words = q.question.split(/\s+/).filter(function (w) { return w.length > 0; });
            if (words.length >= q.options.length + 3) {
              var optWords = words.slice(-q.options.length);
              q.options.forEach(function (o, idx) {
                o.text = optWords[idx] || '';
              });
              q.question = words.slice(0, -q.options.length).join(' ');
            }
          }
        }
      });
    });
    saveData();
  } catch (e) { console.warn('Load error'); }
}

function saveData() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(appData, null, 2)); } catch (e) {}
}

function getSubject(name) {
  return appData.subjects.find(function (s) { return s.name === name; });
}

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
  var data = window._fixedJSON;
  if (data.subjects && Array.isArray(data.subjects)) {
    data.subjects.forEach(function (sub) {
      var ex = getSubject(sub.name);
      var qs = (sub.questions || []).map(function (q) {
        return { id: Date.now() + Math.floor(Math.random() * 10000), type: q.type, question: q.question, options: q.options || [], answer: q.answer || '', score: q.score || 1, explanation: q.explanation || '', stats: q.stats || { attempts: 0, correct: 0, wrong: 0 } };
      });
      if (ex) { qs.forEach(function (q) { ex.questions.push(q); }); }
      else { appData.subjects.push({ name: sub.name, description: '', questions: qs }); }
    });
  } else if (data.questions && Array.isArray(data.questions)) {
    var name = data.name || '导入题目';
    var ex = getSubject(name);
    var qs = data.questions.map(function (q) {
      return { id: Date.now() + Math.floor(Math.random() * 10000), type: q.type, question: q.question, options: q.options || [], answer: q.answer || '', score: q.score || 1, explanation: q.explanation || '', stats: q.stats || { attempts: 0, correct: 0, wrong: 0 } };
    });
    if (ex) { qs.forEach(function (q) { ex.questions.push(q); }); }
    else { appData.subjects.push({ name: name, description: '', questions: qs }); }
  } else return toast('JSON格式无效', 'error');
  saveData(); renderSidebar(); switchTab('browse');
  document.getElementById('import-preview-json').innerHTML = ''; document.getElementById('import-json').value = '';
  window._fixedJSON = null; toast('JSON导入成功！', 'success');
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

function switchImportTab(tab, btn) {
  document.querySelectorAll('.itab').forEach(function (b) { b.classList.remove('active'); });
  document.querySelectorAll('.tab-content').forEach(function (c) { c.classList.remove('active'); });
  if (btn) btn.classList.add('active');
  document.getElementById('itab-' + tab).classList.add('active');
}

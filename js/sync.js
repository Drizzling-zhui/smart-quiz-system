// ============================================================
// DATA SYNC: ENCRYPT / DECRYPT (Web Crypto API)
// ============================================================

// PBKDF2 + AES-GCM. Salt(16B) + IV(12B) prepended to ciphertext.
// File format: [salt:16][iv:12][aes-gcm(ciphertext+tag)]

var SYNC_SALT_LEN = 16;
var SYNC_IV_LEN = 12;
var SYNC_ITERATIONS = 100000;

function _syncBufferToBase64(buf) {
  var bytes = new Uint8Array(buf);
  var bin = '';
  for (var i = 0; i < bytes.length; i++) {
    bin += String.fromCharCode(bytes[i]);
  }
  return btoa(bin);
}

function _syncBase64ToBuffer(b64) {
  var bin = atob(b64);
  var buf = new ArrayBuffer(bin.length);
  var bytes = new Uint8Array(buf);
  for (var i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return buf;
}

function _syncDeriveKey(password, salt) {
  var enc = new TextEncoder();
  var keyMaterial = enc.encode(password);
  return crypto.subtle.importKey('raw', keyMaterial, 'PBKDF2', false, ['deriveKey']).then(function (baseKey) {
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: salt, iterations: SYNC_ITERATIONS, hash: 'SHA-256' },
      baseKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  });
}

function encryptQuizData(password) {
  if (!password || !password.trim()) return Promise.reject(new Error('口令不能为空'));
  password = password.trim();
  if (password.length < 4) return Promise.reject(new Error('口令至少4位'));

  var salt = crypto.getRandomValues(new Uint8Array(SYNC_SALT_LEN));
  var iv = crypto.getRandomValues(new Uint8Array(SYNC_IV_LEN));
  var enc = new TextEncoder();
  var plaintext = enc.encode(JSON.stringify(appData));

  return _syncDeriveKey(password, salt).then(function (key) {
    return crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, plaintext);
  }).then(function (ciphertext) {
    // Concat: salt + iv + ciphertext
    var result = new Uint8Array(SYNC_SALT_LEN + SYNC_IV_LEN + ciphertext.byteLength);
    result.set(salt, 0);
    result.set(iv, SYNC_SALT_LEN);
    result.set(new Uint8Array(ciphertext), SYNC_SALT_LEN + SYNC_IV_LEN);
    return _syncBufferToBase64(result.buffer);
  });
}

function decryptQuizData(base64Data, password) {
  if (!password || !password.trim()) return Promise.reject(new Error('口令不能为空'));
  password = password.trim();
  if (!base64Data) return Promise.reject(new Error('数据为空'));

  try {
    var buf = _syncBase64ToBuffer(base64Data);
  } catch (e) {
    return Promise.reject(new Error('数据格式无效'));
  }

  if (buf.byteLength < SYNC_SALT_LEN + SYNC_IV_LEN + 1) {
    return Promise.reject(new Error('数据不完整'));
  }

  var salt = new Uint8Array(buf, 0, SYNC_SALT_LEN);
  var iv = new Uint8Array(buf, SYNC_SALT_LEN, SYNC_IV_LEN);
  var ciphertext = new Uint8Array(buf, SYNC_SALT_LEN + SYNC_IV_LEN);

  return _syncDeriveKey(password, salt).then(function (key) {
    return crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv }, key, ciphertext);
  }).then(function (plaintext) {
    var dec = new TextDecoder();
    return JSON.parse(dec.decode(plaintext));
  }).catch(function (e) {
    if (e.name === 'OperationError') {
      throw new Error('口令错误或数据已损坏');
    }
    throw e;
  });
}

// ============================================================
// EXPORT / IMPORT UI
// ============================================================

function exportEncrypted() {
  var password = document.getElementById('sync-password').value;
  if (!password) return toast('请先设置同步口令', 'warning');
  if (password.length < 4) return toast('口令至少4位', 'warning');
  if (!appData || !appData.subjects || !appData.subjects.length) {
    return toast('没有可导出的题库数据', 'warning');
  }

  var statusEl = document.getElementById('sync-status');
  statusEl.textContent = '⏳ 正在加密...';
  statusEl.style.color = 'var(--gray-500)';

  var totalQuestions = appData.subjects.reduce(function (s, sub) {
    return s + (sub.questions ? sub.questions.length : 0);
  }, 0);

  encryptQuizData(password).then(function (b64) {
    var blob = new Blob([b64], { type: 'application/octet-stream' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'quiz-data_' + new Date().toISOString().slice(0, 10) + '.enc';
    a.click();
    URL.revokeObjectURL(url);

    statusEl.textContent = '✅ 导出成功！' + appData.subjects.length + '个学科，' + totalQuestions + '道题';
    statusEl.style.color = 'var(--success)';
    toast('加密导出成功', 'success');
  }).catch(function (e) {
    statusEl.textContent = '❌ 加密失败：' + e.message;
    statusEl.style.color = 'var(--danger)';
    toast('加密失败：' + e.message, 'error');
  });
}

function importEncrypted(file) {
  if (!file) return;
  var password = document.getElementById('sync-password').value;
  if (!password) return toast('请输入同步口令', 'warning');
  if (password.length < 4) return toast('口令至少4位', 'warning');

  var statusEl = document.getElementById('sync-status');
  statusEl.textContent = '⏳ 正在解密...';
  statusEl.style.color = 'var(--gray-500)';

  var reader = new FileReader();
  reader.onload = function () {
    decryptQuizData(reader.result, password).then(function (data) {
      if (!data.subjects || !Array.isArray(data.subjects)) {
        throw new Error('数据格式不正确，缺少学科数据');
      }
      // Validate and normalize imported data
      appData = data;
      if (!appData.version) appData.version = '1.0';
      appData.subjects.forEach(function (sub) {
        if (!sub.questions) sub.questions = [];
        sub.questions.forEach(function (q) {
          if (!q.id) q.id = Date.now() + Math.floor(Math.random() * 10000);
          if (!q.stats) q.stats = { attempts: 0, correct: 0, wrong: 0 };
          if (!q.explanation) q.explanation = '';
          if (!q.options) q.options = [];
        });
      });
      saveData();
      renderSidebar();
      renderBrowse();
      var totalQ = appData.subjects.reduce(function (s, sub) { return s + sub.questions.length; }, 0);
      statusEl.textContent = '✅ 导入成功！' + appData.subjects.length + '个学科，' + totalQ + '道题';
      statusEl.style.color = 'var(--success)';
      document.getElementById('sync-import-file').value = '';
      toast('题库导入成功', 'success');
    }).catch(function (e) {
      statusEl.textContent = '❌ ' + e.message;
      statusEl.style.color = 'var(--danger)';
      document.getElementById('sync-import-file').value = '';
      toast(e.message, 'error');
    });
  };
  reader.onerror = function () {
    statusEl.textContent = '❌ 读取文件失败';
    statusEl.style.color = 'var(--danger)';
  };
  reader.readAsText(file);
}

// Clear password field on settings close
var _origHideSettings = hideModal;
hideModal = function (type) {
  if (type === 'settings') {
    var pw = document.getElementById('sync-password');
    if (pw && document.activeElement !== pw) pw.value = '';
  }
  _origHideSettings(type);
};

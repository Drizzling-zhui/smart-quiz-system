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

  // Bundle full profile: appData + apiConfig + favorites
  var bundle = {
    appData: appData,
    apiConfig: typeof getApiConfig === 'function' ? getApiConfig() : null,
    favorites: typeof favorites !== 'undefined' ? favorites : [],
    version: '2.0',
    exportedAt: new Date().toISOString()
  };

  var salt = crypto.getRandomValues(new Uint8Array(SYNC_SALT_LEN));
  var iv = crypto.getRandomValues(new Uint8Array(SYNC_IV_LEN));
  var enc = new TextEncoder();
  var plaintext = enc.encode(JSON.stringify(bundle));

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

  var totalQuestions = 0;
  (appData.subjects || []).forEach(function (s) {
    (s.nodes || []).forEach(function (n) {
      if (n.type === 'file' && n.questions) totalQuestions += n.questions.length;
    });
  });

  encryptQuizData(password).then(function (b64) {
    var hasApi = !!(getApiConfig().key);
    var fileName = 'quiz-data_' + new Date().toISOString().slice(0, 10) + '.enc';

    var blob = new Blob([b64], { type: 'application/octet-stream' });
    var msg = '✅ 导出成功！' + appData.subjects.length + '个学科，' + totalQuestions + '道题';
    statusEl.textContent = msg;
    statusEl.style.color = 'var(--success)';

    // Save file: desktop downloads, mobile shares or saves
    _saveExportFile(blob, fileName, b64, totalQuestions, hasApi);
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
    decryptQuizData(reader.result, password).then(function (raw) {
      var extraInfo = [];
      // Detect new bundle format vs old format
      var data, bundle;
      if (raw.appData) {
        // New bundle format: { appData, apiConfig, favorites, ... }
        bundle = raw;
        data = raw.appData;
        extraInfo.push('全量配置');
      } else {
        // Old format: raw is the appData directly
        data = raw;
      }

      if (!data.subjects || !Array.isArray(data.subjects)) {
        throw new Error('数据格式不正确，缺少学科数据');
      }

      // Normalize incoming data
      if (!data.version) data.version = '2.0';
      data.subjects.forEach(function (sub) {
        if (!sub.nodes) sub.nodes = [];
        sub.nodes.forEach(function (n) {
          if (n.type === 'file' && n.questions) {
            n.questions.forEach(function (q) {
              if (!q.id) q.id = Date.now() + Math.floor(Math.random() * 10000);
              if (!q.stats) q.stats = { attempts: 0, correct: 0, wrong: 0 };
              if (!q.explanation) q.explanation = '';
              if (!q.options) q.options = [];
            });
          }
        });
      });

      // Merge: for each incoming subject, find matching local subject and merge
      var newSubjects = 0, newQuestions = 0, updatedQuestions = 0;
      data.subjects.forEach(function (inSubj) {
        var localSubj = getSubject(inSubj.name);
        if (!localSubj) {
          // New subject: add it
          appData.subjects.push(inSubj);
          newSubjects++;
          inSubj.nodes.forEach(function (n) {
            if (n.type === 'file' && n.questions) newQuestions += n.questions.length;
          });
        } else {
          // Existing subject: merge nodes
          mergeNodes(localSubj, inSubj);
        }
      });

      function mergeNodes(localSubj, inSubj) {
        if (!inSubj.nodes) return;
        // Build a lookup of local nodes by path (name + parent name)
        function nodePath(n, subj) {
          var parts = [n.name];
          var current = n;
          while (current.parentId) {
            var parent = (subj.nodes || []).find(function (x) { return x.id === current.parentId; });
            if (!parent) break;
            parts.unshift(parent.name);
            current = parent;
          }
          return parts.join('/');
        }

        var localPaths = {};
        (localSubj.nodes || []).forEach(function (n) {
          localPaths[nodePath(n, localSubj)] = n;
        });

        (inSubj.nodes || []).forEach(function (inNode) {
          var path = nodePath(inNode, inSubj);
          var localNode = localPaths[path];
          if (localNode && localNode.type === 'file' && inNode.type === 'file') {
            // Merge questions by ID
            var localQMap = {};
            (localNode.questions || []).forEach(function (q) { localQMap[q.id] = q; });
            (inNode.questions || []).forEach(function (inQ) {
              if (localQMap[inQ.id]) {
                // Update existing question (preserve local stats if newer)
                var localQ = localQMap[inQ.id];
                localQ.question = inQ.question;
                localQ.answer = inQ.answer;
                localQ.options = inQ.options;
                localQ.type = inQ.type;
                if (inQ.explanation) localQ.explanation = inQ.explanation;
                updatedQuestions++;
              } else {
                // New question
                localNode.questions.push(inQ);
                newQuestions++;
              }
            });
          } else if (!localNode) {
            // New node (folder or file)
            localSubj.nodes.push(inNode);
            if (inNode.type === 'file' && inNode.questions) newQuestions += inNode.questions.length;
          }
          // If local node exists and is a folder, keep local version (folders are structural)
        });
      }

      saveData();

      // Merge API config if present in bundle
      if (bundle && bundle.apiConfig && bundle.apiConfig.endpoint) {
        try { localStorage.setItem('quiz_app_api_config', JSON.stringify(bundle.apiConfig)); } catch (e) {}
        extraInfo.push('API配置');
      }

      // Merge favorites if present in bundle (union of both sets)
      if (bundle && Array.isArray(bundle.favorites)) {
        var favSet = {};
        favorites.forEach(function (id) { favSet[id] = true; });
        bundle.favorites.forEach(function (id) { favSet[id] = true; });
        favorites = Object.keys(favSet).map(function (id) { return parseInt(id) || id; });
        saveFavorites();
        extraInfo.push('收藏');
      }

      renderSidebar();
      renderBrowse();

      var totalQ = 0;
      (appData.subjects || []).forEach(function (s) {
        (s.nodes || []).forEach(function (n) {
          if (n.type === 'file' && n.questions) totalQ += n.questions.length;
        });
      });
      var mergeMsg = '✅ 导入成功！' + appData.subjects.length + '个学科，' + totalQ + '道题';
      if (newSubjects > 0) mergeMsg += '（新增' + newSubjects + '个学科）';
      if (newQuestions > 0) mergeMsg += '（新增' + newQuestions + '题）';
      if (updatedQuestions > 0) mergeMsg += '（更新' + updatedQuestions + '题）';
      statusEl.textContent = mergeMsg + (extraInfo.length ? '，' + extraInfo.join('、') + '已恢复' : '');
      statusEl.style.color = 'var(--success)';
      document.getElementById('sync-import-file').value = '';
      toast('导入成功：新增' + newQuestions + '题' + (updatedQuestions > 0 ? '，更新' + updatedQuestions + '题' : ''), 'success');
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

// Save export file — download on desktop, share modal on all platforms
// Save export file — use Capacitor native Filesystem on mobile, download on desktop
function _saveExportFile(blob, fileName, b64, totalQuestions, hasApi) {
  // Try Capacitor native Filesystem first (APK)
  try {
    var C = window.Capacitor;
    if (C && C.Plugins) {
      var FS = C.Plugins.Filesystem;
      // If plugin not registered yet, register it now
      if (!FS && C.registerPlugin) {
        FS = C.registerPlugin('Filesystem');
      }
      if (FS && FS.writeFile) {
        FS.writeFile({ path: fileName, data: b64, directory: 'DOCUMENTS', recursive: true }).then(function (r) {
          var path = r.uri || 'Documents/' + fileName;
          _showExportModal(fileName, b64, totalQuestions, blob, path);
        }).catch(function (e) {
          _showExportModal(fileName, b64, totalQuestions, blob, '保存失败: ' + (e.message || ''));
        });
        return;
      }
    }
  } catch (e) {}

  // Desktop fallback: anchor download
  try {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 2000);
    _showExportModal(fileName, b64, totalQuestions, blob, '下载目录');
    return;
  } catch (e) {}

  _showExportModal(fileName, b64, totalQuestions, blob, '');
}

function _showExportModal(fileName, content, totalQuestions, blob, savedPath) {
  var existing = document.getElementById('modal-export-result');
  if (existing) existing.remove();

  var overlay = document.createElement('div');
  overlay.className = 'modal-overlay active';
  overlay.id = 'modal-export-result';
  overlay.innerHTML = '<div class="modal" style="max-width:400px;text-align:center">' +
    '<h3>📤 加密导出成功</h3>' +
    '<p style="font-size:13px;color:var(--gray-700);margin:6px 0">' + totalQuestions + '题 · ' + fileName + '</p>' +
    (savedPath ? '<p style="font-size:11px;color:var(--primary);margin:4px 0">📁 ' + savedPath + '</p>' : '') +
    '<div style="display:flex;gap:8px;justify-content:center;margin-top:12px;flex-wrap:wrap">' +
      '<button class="btn-primary" id="btn-export-share">📤 分享文件</button>' +
      '<button class="btn-cancel" id="btn-export-close">关闭</button>' +
    '</div>' +
    '</div>';
  document.body.appendChild(overlay);

  document.getElementById('btn-export-close').onclick = function () { overlay.remove(); };
  document.getElementById('btn-export-share').onclick = function () {
    var file = new File([blob], fileName, { type: 'application/octet-stream' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file], title: '题库加密导出' }).catch(function () {});
    } else if (navigator.share) {
      navigator.share({ title: '题库加密导出', text: content }).catch(function () {});
    } else {
      // Create hidden textarea, copy, and prompt
      var ta = document.createElement('textarea');
      ta.value = content;
      ta.style.cssText = 'position:fixed;left:-9999px;top:-9999px';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      toast('已复制加密内容，请粘贴到备忘录保存为 ' + fileName, 'info');
    }
  };

  overlay.addEventListener('click', function (e) { if (e.target === overlay) overlay.remove(); });
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

// ============================================================
// LAN SYNC (PC server: sync_server.py)
// ============================================================
var _lanPollTimer = null;
var _lanServerAddr = '';

function _lanServerURL() {
  return 'http://' + (_lanServerAddr || '127.0.0.1:8081');
}

function _lanGenQR(text) {
  var encoded = encodeURIComponent(text);
  return 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=' + encoded;
}

function _lanUpdateStatus(icon, text, connected) {
  var iconEl = document.getElementById('lan-status-icon');
  var textEl = document.getElementById('lan-status-text');
  if (iconEl) iconEl.textContent = icon;
  if (textEl) textEl.textContent = text;
  var statusEl = document.getElementById('lan-sync-status');
  if (statusEl) {
    statusEl.classList.toggle('connected', !!connected);
  }
}

// Ping the local sync server
function lanCheckServer() {
  return fetch(_lanServerURL() + '/ping').then(function (r) {
    return r.json();
  }).then(function (data) {
    _lanServerAddr = data.ip + ':' + data.port;
    _lanUpdateStatus('🟢', '服务器已连接 (' + _lanServerAddr + ')', true);
    document.getElementById('btn-lan-launch').style.display = 'none';
    document.getElementById('btn-lan-receive').style.display = '';
    document.getElementById('btn-lan-send').style.display = '';
    return data;
  }).catch(function () {
    _lanUpdateStatus('⚪', '服务器未连接', false);
    document.getElementById('btn-lan-launch').style.display = '';
    document.getElementById('btn-lan-receive').style.display = 'none';
    document.getElementById('btn-lan-send').style.display = 'none';
    return null;
  });
}

// Launch the Python sync server via batch file
function lanLaunchServer() {
  var launchBtn = document.getElementById('btn-lan-launch');
  launchBtn.textContent = '⏳ 启动中...';
  launchBtn.disabled = true;
  // Trigger download/open of the batch file
  var a = document.createElement('a');
  a.href = 'sync_server.bat';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  _lanUpdateStatus('🟡', '等待服务器启动...', false);
  // Poll for server to come online
  var attempts = 0;
  var poll = setInterval(function () {
    attempts++;
    fetch('http://127.0.0.1:8081/ping').then(function (r) {
      return r.json();
    }).then(function (data) {
      clearInterval(poll);
      _lanServerAddr = data.ip + ':' + data.port;
      _lanUpdateStatus('🟢', '服务器已连接 (' + _lanServerAddr + ')', true);
      document.getElementById('btn-lan-launch').style.display = 'none';
      document.getElementById('btn-lan-receive').style.display = '';
      document.getElementById('btn-lan-send').style.display = '';
      launchBtn.textContent = '▶ 启动服务';
      launchBtn.disabled = false;
      toast('服务器已启动', 'success');
    }).catch(function () {
      if (attempts >= 20) {
        clearInterval(poll);
        _lanUpdateStatus('⚪', '服务器启动超时，请手动双击 sync_server.bat', false);
        launchBtn.textContent = '▶ 启动服务';
        launchBtn.disabled = false;
      }
    });
  }, 500);
}

// PC: Start receive mode - poll for incoming data
function lanStartReceive() {
  lanCheckServer().then(function (data) {
    if (!data) {
      return toast('请先在命令行启动 sync_server.py', 'warning');
    }
    // Show QR code for phone to push
    var url = 'http://' + _lanServerAddr;
    document.getElementById('lan-url-text').textContent = url + '/push';
    document.getElementById('lan-qr-img').src = _lanGenQR(url + '/push');
    document.getElementById('lan-qr-hint').textContent = '手机扫码后点「推送到电脑」';
    document.getElementById('lan-qr-area').style.display = '';
    document.getElementById('btn-lan-receive').style.display = 'none';
    document.getElementById('btn-lan-send').style.display = 'none';
    document.getElementById('btn-lan-stop').style.display = '';

    _lanUpdateStatus('🔵', '等待手机推送... (' + _lanServerAddr + ')', true);
    toast('已启动接收，等待手机推送', 'info');

    // Start polling for incoming data
    _lanPollTimer = setInterval(function () {
      fetch(_lanServerURL() + '/check-incoming').then(function (r) {
        return r.json();
      }).then(function (res) {
        if (res && res.hasData) {
          clearInterval(_lanPollTimer);
          _lanPollTimer = null;
          // Fetch the incoming data
          return fetch(_lanServerURL() + '/pull').then(function (r) {
            if (!r.ok) throw new Error('no data');
            return r.text();
          }).then(function (encData) {
            // Clear the incoming flag
            fetch(_lanServerURL() + '/clear-incoming', { method: 'POST' });
            // Import the data
            var blob = new Blob([encData], { type: 'text/plain' });
            var file = new File([blob], 'lan_sync.enc', { type: 'text/plain' });
            importEncrypted(file);
            lanStopServer();
            toast('已从手机接收并导入数据', 'success');
          });
        }
      });
    }, 2000);
  });
}

// PC: Send data to phone - upload to server for phone to pull
function lanSendToPhone() {
  if (!appData || !appData.subjects || !appData.subjects.length) {
    return toast('没有可发送的题库数据', 'warning');
  }
  lanCheckServer().then(function (data) {
    if (!data) {
      return toast('请先在命令行启动 sync_server.py', 'warning');
    }
    var password = document.getElementById('sync-password').value;
    if (!password || password.length < 4) {
      return toast('请先在数据同步区域设置口令（至少4位）', 'warning');
    }
    encryptQuizData(password).then(function (b64) {
      return fetch(_lanServerURL() + '/upload-outgoing', {
        method: 'POST',
        body: b64
      });
    }).then(function () {
      var url = 'http://' + _lanServerAddr + '/pull';
      document.getElementById('lan-url-text').textContent = url;
      document.getElementById('lan-qr-img').src = _lanGenQR(url);
      document.getElementById('lan-qr-hint').textContent = '手机扫码后点「从电脑拉取」，口令与电脑端相同';
      document.getElementById('lan-qr-area').style.display = '';
      document.getElementById('btn-lan-receive').style.display = 'none';
      document.getElementById('btn-lan-send').style.display = 'none';
      document.getElementById('btn-lan-stop').style.display = '';
      _lanUpdateStatus('🟢', '数据已就绪，等待手机拉取', true);
      toast('数据已准备，请用手机扫码拉取', 'success');
    }).catch(function (e) {
      toast('发送失败：' + (e.message || '未知错误'), 'error');
    });
  });
}

// PC: Stop LAN server mode
function lanStopServer() {
  if (_lanPollTimer) { clearInterval(_lanPollTimer); _lanPollTimer = null; }
  document.getElementById('lan-qr-area').style.display = 'none';
  document.getElementById('btn-lan-receive').style.display = '';
  document.getElementById('btn-lan-send').style.display = '';
  document.getElementById('btn-lan-stop').style.display = 'none';
  _lanUpdateStatus('⚪', '已停止');
  // Clear server state
  fetch(_lanServerURL() + '/clear-incoming', { method: 'POST' }).catch(function () {});
}

// Phone: Pull data from PC
function lanPullFromPC() {
  var addr = document.getElementById('lan-pc-address').value.trim();
  if (!addr) return toast('请输入电脑IP地址', 'warning');
  if (addr.indexOf(':') === -1) addr += ':8081';
  var base = 'http://' + addr;
  var statusEl = document.getElementById('sync-status');
  statusEl.textContent = '⏳ 正在从电脑拉取...';
  statusEl.style.color = 'var(--gray-500)';

  fetch(base + '/pull').then(function (r) {
    if (!r.ok) throw new Error('电脑暂无待拉取的数据，请先在电脑端点「发送到手机」');
    return r.text();
  }).then(function (encData) {
    var blob = new Blob([encData], { type: 'text/plain' });
    var file = new File([blob], 'lan_pull.enc', { type: 'text/plain' });
    importEncrypted(file);
  }).catch(function (e) {
    statusEl.textContent = '❌ ' + e.message;
    statusEl.style.color = 'var(--danger)';
  });
}

// Phone: Push data to PC
function lanPushToPC() {
  var addr = document.getElementById('lan-pc-address').value.trim();
  if (!addr) return toast('请输入电脑IP地址', 'warning');
  if (addr.indexOf(':') === -1) addr += ':8081';
  var base = 'http://' + addr;
  var password = document.getElementById('sync-password').value;
  if (!password || password.length < 4) {
    return toast('请先设置同步口令（至少4位）', 'warning');
  }
  var statusEl = document.getElementById('sync-status');
  statusEl.textContent = '⏳ 正在推送到电脑...';
  statusEl.style.color = 'var(--gray-500)';

  encryptQuizData(password).then(function (b64) {
    return fetch(base + '/push', { method: 'POST', body: b64 });
  }).then(function (r) {
    return r.json();
  }).then(function (res) {
    if (res.success) {
      statusEl.textContent = '✅ 已推送到电脑！';
      statusEl.style.color = 'var(--success)';
      toast('数据已推送到电脑', 'success');
    } else {
      throw new Error(res.error || '推送失败');
    }
  }).catch(function (e) {
    statusEl.textContent = '❌ ' + (e.message || '连接失败，请确认电脑已启动 sync_server.py');
    statusEl.style.color = 'var(--danger)';
  });
}

// ============================================================
// LOCAL FILE SYNC (File System Access API)
// ============================================================
var localDirHandle = null;
var localSyncEnabled = false;
var localDirName = '';

var LOCAL_DIR_NAME_KEY = 'quiz_app_dir_name';

// Restore dir name from localStorage (survives even if IndexedDB handle loses permission)
(function () {
  try {
    var saved = localStorage.getItem(LOCAL_DIR_NAME_KEY);
    if (saved) localDirName = saved;
  } catch (e) {}
})();

// IndexedDB for persisting directory handle across page reloads
function _openFSDB() {
  return new Promise(function (resolve, reject) {
    var req = indexedDB.open('quiz_fs_db', 1);
    req.onupgradeneeded = function (e) { e.target.result.createObjectStore('handles'); };
    req.onsuccess = function (e) { resolve(e.target.result); };
    req.onerror = function (e) { reject(e.target.error); };
  });
}

function _getStoredHandle() {
  return _openFSDB().then(function (db) {
    return new Promise(function (resolve) {
      var tx = db.transaction('handles', 'readonly');
      var req = tx.objectStore('handles').get('dataDir');
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { resolve(null); };
    });
  });
}

function _setStoredHandle(handle) {
  return _openFSDB().then(function (db) {
    return new Promise(function (resolve) {
      var tx = db.transaction('handles', 'readwrite');
      tx.objectStore('handles').put(handle, 'dataDir');
      tx.oncomplete = function () { resolve(); };
      tx.onerror = function () { resolve(); };
    });
  });
}

// Init: try to restore saved directory handle
function initFileSync() {
  if (!window.showDirectoryPicker) {
    updateSyncIndicator();
    return;
  }
  _getStoredHandle().then(function (handle) {
    if (!handle) { updateSyncIndicator(); return; }
    return handle.queryPermission({ mode: 'readwrite' }).then(function (state) {
      if (state === 'granted') {
        localDirHandle = handle;
        localSyncEnabled = true;
        localDirName = handle.name;
        try { localStorage.setItem(LOCAL_DIR_NAME_KEY, handle.name); } catch (e) {}
        updateSyncIndicator();
        updateDirDisplay();
        checkLocalData();
      } else {
        return handle.requestPermission({ mode: 'readwrite' }).then(function (newState) {
          if (newState === 'granted') {
            localDirHandle = handle;
            localSyncEnabled = true;
            localDirName = handle.name;
            try { localStorage.setItem(LOCAL_DIR_NAME_KEY, handle.name); } catch (e) {}
            updateSyncIndicator();
            updateDirDisplay();
            checkLocalData();
          } else {
            // Permission denied by user
            updateSyncIndicator();
            updateDirDisplay();
          }
        }).catch(function () {
          // requestPermission failed (likely no user gesture on page load)
          // Keep dir name from localStorage so UI shows it was previously bound
          updateSyncIndicator();
          updateDirDisplay();
        });
      }
    });
  }).catch(function () { updateSyncIndicator(); });
}

// Pick data directory (user-initiated, has user gesture)
function pickDataDirectory() {
  if (!window.showDirectoryPicker) {
    return toast('当前浏览器不支持本地文件访问，请使用 Chrome 或 Edge', 'warning');
  }
  // First, try to re-authorize an existing stored handle (user gesture available now)
  _getStoredHandle().then(function (storedHandle) {
    if (storedHandle) {
      return storedHandle.queryPermission({ mode: 'readwrite' }).then(function (state) {
        if (state === 'granted') {
          // Already authorized, just restore
          localDirHandle = storedHandle;
          localSyncEnabled = true;
          localDirName = storedHandle.name;
          try { localStorage.setItem(LOCAL_DIR_NAME_KEY, storedHandle.name); } catch (e) {}
          updateSyncIndicator();
          updateDirDisplay();
          toast('已恢复本地文件夹绑定', 'success');
          backupToFile();
          return 'restored';
        }
        return storedHandle.requestPermission({ mode: 'readwrite' }).then(function (newState) {
          if (newState === 'granted') {
            localDirHandle = storedHandle;
            localSyncEnabled = true;
            localDirName = storedHandle.name;
            try { localStorage.setItem(LOCAL_DIR_NAME_KEY, storedHandle.name); } catch (e) {}
            updateSyncIndicator();
            updateDirDisplay();
            toast('已恢复本地文件夹绑定', 'success');
            backupToFile();
            return 'restored';
          }
          return 'denied';
        }).catch(function () { return 'denied'; });
      });
    }
    return 'no-handle';
  }).then(function (result) {
    if (result === 'restored') return;
    // Need to pick a new directory
    return window.showDirectoryPicker({ mode: 'readwrite' }).then(function (handle) {
      // Validate: check if this looks like a subject subdirectory
      return _validateSyncRoot(handle).then(function () {
        localDirHandle = handle;
        localSyncEnabled = true;
        localDirName = handle.name;
        try { localStorage.setItem(LOCAL_DIR_NAME_KEY, handle.name); } catch (e) {}
        return _setStoredHandle(handle).then(function () {
          updateSyncIndicator();
          updateDirDisplay();
          toast('已绑定本地文件夹，数据将自动同步', 'success');
          backupToFile();
        });
      });
    });
  }).catch(function (e) {
    if (e.name !== 'AbortError') toast('绑定失败：' + e.message, 'error');
  });
}

// Release directory binding
function releaseDataDirectory() {
  localDirHandle = null;
  localSyncEnabled = false;
  localDirName = '';
  try { localStorage.removeItem(LOCAL_DIR_NAME_KEY); } catch (e) {}
  _setStoredHandle(null).then(function () {
    updateSyncIndicator();
    updateDirDisplay();
    toast('已解除本地文件夹绑定', 'info');
  });
}

// Validate that the picked directory is not a subject subdirectory to prevent
// cross-contamination: if _data.json is written inside a subject folder, tree
// sync will nest all subjects under that folder.
function _validateSyncRoot(dirHandle) {
  // Check 1: if directory already has _data.json, it's an existing sync root
  return dirHandle.getFileHandle('_data.json').then(function () {
    // _data.json exists — this is a valid existing root
    return true;
  }).catch(function () {
    // No _data.json — new directory, check if name matches a subject
    var dirName = dirHandle.name;
    var subjects = (appData && appData.subjects) ? appData.subjects : [];
    var match = subjects.some(function (s) { return s.name === dirName; });
    if (match) {
      return new Promise(function (resolve, reject) {
        var confirmed = confirm(
          '⚠️ 目录名「' + dirName + '」与学科同名，可能是学科子目录而非同步根目录。\n\n' +
          '如果绑定此目录，数据将嵌套写入，导致本地文件结构混乱。\n\n' +
          '建议选择上级目录（包含所有学科的目录）。\n\n' +
          '确定仍要绑定此目录吗？'
        );
        if (confirmed) {
          resolve(true);
        } else {
          reject(new Error('AbortError'));
        }
      });
    }
    // Not a subject name, proceed normally
    return true;
  });
}

// Navigate/create path and get file handle
function _getFileHandle(dirHandle, pathParts) {
  var current = Promise.resolve(dirHandle);
  for (var i = 0; i < pathParts.length - 1; i++) {
    (function (idx) {
      current = current.then(function (d) {
        return d.getDirectoryHandle(pathParts[idx], { create: true });
      });
    })(i);
  }
  return current.then(function (d) {
    return d.getFileHandle(pathParts[pathParts.length - 1], { create: true });
  });
}

// Write appData to local data/subjects/ folder (tree structure + full backup)
function backupToFile() {
  if (!localDirHandle || !localSyncEnabled) return;
  // Safety: never overwrite local data with empty subjects
  if (!appData || !appData.subjects || !appData.subjects.length) {
    console.warn('backupToFile: appData is empty, skipping to prevent data loss');
    return;
  }
  var dirHandle = localDirHandle;
  dirHandle.queryPermission({ mode: 'readwrite' }).then(function (state) {
    if (state !== 'granted') {
      return dirHandle.requestPermission({ mode: 'readwrite' });
    }
    return 'granted';
  }).then(function (state) {
    if (state !== 'granted') {
      localSyncEnabled = false;
      updateSyncIndicator();
      return;
    }
    // 1. Write full backup _data.json (for quick sync)
    return _getFileHandle(dirHandle, ['_data.json']).then(function (fileHandle) {
      return fileHandle.createWritable().then(function (writable) {
        return writable.write(JSON.stringify(appData, null, 2)).then(function () {
          return writable.close();
        });
      });
    }).then(function () {
      // 2. Write individual files in tree structure
      return _backupTreeStructure(dirHandle);
    });
  }).catch(function (e) {
    console.warn('Backup failed:', e);
  });
}

// Write individual quiz files in tree structure: data/subjects/{学科}/{path}/{题库名}.json
function _backupTreeStructure(dirHandle) {
  var subjects = appData.subjects || [];
  var promises = [];
  subjects.forEach(function (subj) {
    var root = subj.nodes ? subj.nodes.find(function (n) { return n.type === 'folder' && !n.parentId; }) : null;
    if (!root) return;
    // Get all file nodes and build their paths
    var fileNodes = (subj.nodes || []).filter(function (n) { return n.type === 'file'; });
    fileNodes.forEach(function (fileNode) {
      var pathParts = _buildFilePath(subj, fileNode);
      if (!pathParts.length) return;
      var files = fileNode.questions || [];
      var p = _getFileHandle(dirHandle, pathParts).then(function (fh) {
        return fh.createWritable().then(function (w) {
          return w.write(JSON.stringify(files, null, 2)).then(function () { return w.close(); });
        });
      });
      promises.push(p);
    });
  });
  return Promise.all(promises);
}

// Build relative path for a file node: [subjectName, ...folders, fileName.json]
function _buildFilePath(subject, fileNode) {
  var parts = [subject.name];
  // Build folder path from root to file's parent
  var parentId = fileNode.parentId;
  var folderPath = [];
  while (parentId) {
    var parent = (subject.nodes || []).find(function (n) { return n.id === parentId; });
    if (!parent) break;
    folderPath.unshift(parent.name);
    parentId = parent.parentId || null;
  }
  // Skip the root folder name (same as subject name)
  folderPath = folderPath.filter(function (name) { return name !== subject.name; });
  parts = parts.concat(folderPath);
  parts.push(fileNode.name + '.json');
  return parts;
}

// One-click sync: load from local _data.json and merge
function syncFromLocal() {
  if (!localDirHandle) return toast('请先绑定本地文件夹', 'warning');
  var btn = document.getElementById('btn-sync-now');
  if (btn) { btn.textContent = '⏳ 同步中...'; btn.disabled = true; }
  loadFromFile().then(function (fileData) {
    if (!fileData || !fileData.subjects) {
      toast('未找到本地数据文件', 'warning');
      return;
    }
    mergeLocalData(fileData);
  }).catch(function (e) {
    toast('同步失败：' + (e.message || '未知错误'), 'error');
  }).finally(function () {
    if (btn) { btn.textContent = '🔄 一键同步'; btn.disabled = false; }
  });
}

// Load data from local _data.json
function loadFromFile() {
  if (!localDirHandle) return Promise.resolve(null);
  return localDirHandle.queryPermission({ mode: 'readwrite' }).then(function (state) {
    if (state !== 'granted') {
      return localDirHandle.requestPermission({ mode: 'readwrite' });
    }
    return state;
  }).then(function (state) {
    if (state !== 'granted') return null;
    return localDirHandle.getFileHandle('_data.json').then(function (fileHandle) {
      return fileHandle.getFile().then(function (file) {
        return file.text().then(function (text) {
          return JSON.parse(text);
        });
      });
    }).catch(function () { return null; });
  });
}

// Check if local data is newer and offer to import
function checkLocalData() {
  loadFromFile().then(function (fileData) {
    if (!fileData || !fileData.subjects) return;
    // Compare question counts as a simple heuristic
    var localTotal = countAllQuestions(fileData);
    var memTotal = countAllQuestions(appData);
    if (localTotal > memTotal || JSON.stringify(fileData) !== JSON.stringify(appData)) {
      var localDate = fileData._lastModified || '';
      showDataSyncBanner(fileData);
    }
  }).catch(function () {});
}

function countAllQuestions(data) {
  var total = 0;
  (data.subjects || []).forEach(function (s) {
    (s.nodes || []).forEach(function (n) {
      if (n.type === 'file' && n.questions) total += n.questions.length;
    });
  });
  return total;
}

function showDataSyncBanner(fileData) {
  var banner = document.getElementById('banner-data-sync');
  if (!banner) return;
  banner.classList.add('active');
  banner.querySelector('.b-sync-action').onclick = function () {
    mergeLocalData(fileData);
    banner.classList.remove('active');
  };
  banner.querySelector('.b-sync-ignore').onclick = function () {
    banner.classList.remove('active');
  };
}

function mergeLocalData(fileData) {
  if (!fileData || !fileData.subjects || !fileData.subjects.length) {
    toast('本地数据文件为空，已跳过同步', 'warning');
    return;
  }
  appData = fileData;
  saveData();
  renderSidebar();
  renderBrowse();
  toast('已从本地文件同步数据', 'success');
}

// Update the sync indicator in sidebar (compact)
function updateSyncIndicator() {
  var el = document.getElementById('sync-status');
  if (!el) return;
  if (localSyncEnabled) {
    el.innerHTML = '<span style="color:var(--success);font-size:11px">🟢 已同步到本地</span>';
  } else if (localDirName) {
    el.innerHTML = '<span style="color:var(--warning, #e6a817);font-size:11px">⚠️ 点击重新授权目录</span>';
  } else if (window.showDirectoryPicker) {
    el.innerHTML = '<span style="color:var(--gray-400);font-size:11px">📁 未绑定目录</span>';
  } else {
    el.innerHTML = '';
  }
}

// Update the directory display in settings modal
function updateDirDisplay() {
  var pathText = document.getElementById('dir-path-text');
  var bindBtn = document.getElementById('btn-bind-dir');
  var unbindBtn = document.getElementById('btn-unbind-dir');
  var syncBtn = document.getElementById('btn-sync-now');
  if (!pathText) return;
  if (localSyncEnabled && localDirName) {
    pathText.textContent = '…\\' + localDirName;
    pathText.style.color = 'var(--gray-700)';
    if (bindBtn) bindBtn.textContent = '更改目录';
    if (unbindBtn) unbindBtn.style.display = '';
    if (syncBtn) syncBtn.style.display = '';
  } else if (localDirName) {
    pathText.textContent = '…\\' + localDirName + ' (需重新授权)';
    pathText.style.color = 'var(--warning, #e6a817)';
    if (bindBtn) bindBtn.textContent = '重新授权';
    if (unbindBtn) unbindBtn.style.display = '';
    if (syncBtn) syncBtn.style.display = 'none';
  } else {
    pathText.textContent = '未绑定';
    pathText.style.color = 'var(--gray-400)';
    if (bindBtn) bindBtn.textContent = '选择目录';
    if (unbindBtn) unbindBtn.style.display = 'none';
    if (syncBtn) syncBtn.style.display = 'none';
  }
}

// Import data from a local JSON file (fallback for non-FSA browsers)

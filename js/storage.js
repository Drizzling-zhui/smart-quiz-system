// ============================================================
// LOCAL FILE SYNC (File System Access API)
// ============================================================
var localDirHandle = null;
var localSyncEnabled = false;

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
    // File System Access API not available
    updateSyncIndicator();
    return;
  }
  _getStoredHandle().then(function (handle) {
    if (!handle) { updateSyncIndicator(); return; }
    return handle.queryPermission({ mode: 'readwrite' }).then(function (state) {
      if (state === 'granted') {
        localDirHandle = handle;
        localSyncEnabled = true;
        updateSyncIndicator();
        // Check if local file is newer than last backup
        checkLocalData();
      } else {
        return handle.requestPermission({ mode: 'readwrite' }).then(function (newState) {
          if (newState === 'granted') {
            localDirHandle = handle;
            localSyncEnabled = true;
            updateSyncIndicator();
            checkLocalData();
          } else {
            updateSyncIndicator();
          }
        });
      }
    });
  }).catch(function () { updateSyncIndicator(); });
}

// Pick data directory (user-initiated)
function pickDataDirectory() {
  if (!window.showDirectoryPicker) {
    return toast('当前浏览器不支持本地文件访问，请使用 Chrome 或 Edge', 'warning');
  }
  window.showDirectoryPicker({ mode: 'readwrite' }).then(function (handle) {
    localDirHandle = handle;
    localSyncEnabled = true;
    _setStoredHandle(handle).then(function () {
      updateSyncIndicator();
      toast('已绑定本地文件夹，数据将自动同步', 'success');
      backupToFile();
    });
  }).catch(function (e) {
    if (e.name !== 'AbortError') toast('绑定失败：' + e.message, 'error');
  });
}

// Release directory binding
function releaseDataDirectory() {
  localDirHandle = null;
  localSyncEnabled = false;
  _setStoredHandle(null).then(function () {
    updateSyncIndicator();
    toast('已解除本地文件夹绑定', 'info');
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

// Write appData to local data/subjects/ folder
function backupToFile() {
  if (!localDirHandle || !localSyncEnabled) return;
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
    // Write full data to _data.json (at root of selected directory)
    return _getFileHandle(dirHandle, ['_data.json']).then(function (fileHandle) {
      return fileHandle.createWritable().then(function (writable) {
        return writable.write(JSON.stringify(appData, null, 2)).then(function () {
          return writable.close();
        });
      });
    });
  }).catch(function (e) {
    console.warn('Backup failed:', e);
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
  if (!fileData || !fileData.subjects) return;
  appData = fileData;
  saveData();
  renderSidebar();
  renderBrowse();
  toast('已从本地文件同步数据', 'success');
}

// Update the sync indicator in sidebar
function updateSyncIndicator() {
  var el = document.getElementById('sync-status');
  if (!el) return;
  if (localSyncEnabled) {
    el.innerHTML = '<span style="color:var(--success)" title="本地同步已启用">🟢 本地同步</span>';
  } else if (window.showDirectoryPicker) {
    el.innerHTML = '<a href="#" onclick="pickDataDirectory();return false" style="color:var(--gray-400);font-size:11px;text-decoration:none" title="点击绑定本地文件夹">📁 绑定本地文件夹</a>';
  } else {
    el.innerHTML = '<span style="color:var(--gray-400);font-size:11px">💻 浏览器存储</span>';
  }
}

// Import data from a local JSON file (fallback for non-FSA browsers)
function importFromLocalFile() {
  var input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = function () {
    var file = input.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var data = JSON.parse(reader.result);
        if (!data.subjects && !Array.isArray(data)) {
          return toast('文件格式不正确，需要包含 subjects 字段', 'error');
        }
        // If it's an array of questions, let user pick target
        if (Array.isArray(data)) {
          return toast('请使用 JSON 导入功能导入题目数组', 'warning');
        }
        appData = data;
        if (!appData.version) appData.version = '2.0';
        saveData();
        renderSidebar();
        renderBrowse();
        toast('已从本地文件加载数据（' + countAllQuestions(appData) + ' 题）', 'success');
      } catch (e) {
        toast('文件解析失败：' + e.message, 'error');
      }
    };
    reader.readAsText(file);
  };
  input.click();
}

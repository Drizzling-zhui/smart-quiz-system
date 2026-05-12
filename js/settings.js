// ============================================================
// API CONFIG
// ============================================================
var API_CONFIG_KEY = 'quiz_app_api_config';

function getApiConfig() {
  try {
    var raw = localStorage.getItem(API_CONFIG_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return { endpoint: 'https://api.openai.com/v1/chat/completions', model: 'gpt-4o-mini', key: '' };
}

function saveApiConfig(config) {
  localStorage.setItem(API_CONFIG_KEY, JSON.stringify(config));
}

function hasApiConfigured() {
  var cfg = getApiConfig();
  return !!(cfg.endpoint && cfg.key && cfg.model);
}

function showApiSettings() {
  var cfg = getApiConfig();
  document.getElementById('api-endpoint').value = cfg.endpoint;
  document.getElementById('api-model').value = cfg.model;
  document.getElementById('api-key').value = cfg.key;
  if (typeof updateDirDisplay === 'function') updateDirDisplay();
  document.getElementById('modal-settings').classList.add('active');
}

function saveApiSettings() {
  var config = {
    endpoint: document.getElementById('api-endpoint').value.trim(),
    model: document.getElementById('api-model').value.trim(),
    key: document.getElementById('api-key').value.trim()
  };
  if (!config.endpoint) return toast('请输入API地址', 'warning');
  if (!config.model) return toast('请输入模型名称', 'warning');
  if (!config.key) return toast('请输入API密钥', 'warning');
  saveApiConfig(config);
  hideModal('settings');
  toast('API配置已保存', 'success');
}

function testApiConnection() {
  var cfg = {
    endpoint: document.getElementById('api-endpoint').value.trim(),
    model: document.getElementById('api-model').value.trim(),
    key: document.getElementById('api-key').value.trim()
  };
  if (!cfg.endpoint || !cfg.model || !cfg.key) return toast('请先填写完整配置', 'warning');
  var btn = document.getElementById('btn-test-api');
  btn.textContent = '⏳ 测试中...'; btn.disabled = true;
  fetch(cfg.endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + cfg.key },
    body: JSON.stringify({
      model: cfg.model,
      messages: [{ role: 'user', content: '回复"连接成功"四个字' }],
      max_tokens: 20
    })
  }).then(function (r) {
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }).then(function () {
    toast('✅ 连接成功！', 'success');
  }).catch(function (e) {
    toast('❌ 连接失败：' + e.message, 'error');
  }).finally(function () {
    btn.textContent = '🔌 测试连接'; btn.disabled = false;
  });
}

function hideBanner() {
  document.getElementById('banner-api').classList.remove('active');
}

function closeBannerAndOpenSettings() {
  hideBanner();
  showApiSettings();
}

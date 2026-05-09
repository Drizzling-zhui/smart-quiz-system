// ============================================================
// UTILITIES
// ============================================================
function escHtml(s) {
  return typeof s === 'string'
    ? s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/'/g, '&#39;').replace(/"/g, '&quot;')
    : s;
}

function renderMD(text) {
  if (!text || typeof text !== 'string') return escHtml(text || '');

  // Step 1: escape HTML
  var html = escHtml(text);

  // Step 2: extract and protect fenced code blocks
  var codeBlocks = [];
  html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, function (_, lang, code) {
    codeBlocks.push('<pre><code>' + code.trim() + '</code></pre>');
    return '%%CODEBLOCK_' + (codeBlocks.length - 1) + '%%';
  });

  // Step 3: headers (must be at line start)
  html = html.replace(/^#### (.+)$/gm, '<h4>$1</h4>');
  html = html.replace(/^### (.+)$/gm, '<h4>$1</h4>');
  html = html.replace(/^## (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^# (.+)$/gm, '<h2>$1</h2>');

  // Step 4: horizontal rule
  html = html.replace(/^---$/gm, '<hr>');

  // Step 5: unordered lists — group consecutive lines
  html = html.replace(/((?:^[\-\*] .+(?:\n|$))+)/gm, function (block) {
    var items = block.trim().split('\n').map(function (line) {
      return '<li>' + line.replace(/^[\-\*] /, '') + '</li>';
    }).join('');
    return '<ul>' + items + '</ul>';
  });

  // Step 6: ordered lists
  html = html.replace(/((?:^\d+\. .+(?:\n|$))+)/gm, function (block) {
    var items = block.trim().split('\n').map(function (line) {
      return '<li>' + line.replace(/^\d+\. /, '') + '</li>';
    }).join('');
    return '<ol>' + items + '</ol>';
  });

  // Step 7: tables — consecutive lines starting with |
  html = html.replace(/((?:^\|.+\|(?:\n|$))+)/gm, function (block) {
    var lines = block.trim().split('\n');
    if (lines.length < 2) return block;
    // Check second line is a separator row
    if (!/^\|[\s\-:]+\|$/.test(lines[1])) return block;
    var renderRow = function (line, tag) {
      var cells = line.replace(/^\||\|$/g, '').split('|');
      return '<tr>' + cells.map(function (c) { return '<' + tag + '>' + c.trim() + '</' + tag + '>'; }).join('') + '</tr>';
    };
    var thead = '<thead>' + renderRow(lines[0], 'th') + '</thead>';
    var tbody = '<tbody>' + lines.slice(2).map(function (l) { return renderRow(l, 'td'); }).join('') + '</tbody>';
    return '<table>' + thead + tbody + '</table>';
  });

  // Step 8: bold (after lists to avoid conflicts with * prefix)
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

  // Step 8: italic (single *, not part of **)
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // Step 9: inline code (after bold/italic to avoid matching inside tags)
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Step 10: links [text](url)
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');

  // Step 11: restore code blocks
  html = html.replace(/%%CODEBLOCK_(\d+)%%/g, function (_, i) {
    return codeBlocks[parseInt(i)] || '';
  });

  // Step 12: paragraphs — double newlines become paragraph breaks
  var parts = html.split(/\n\n+/);
  html = parts.map(function (p) {
    p = p.trim();
    if (!p) return '';
    // Skip wrapping if already a block element
    if (/^<(h[2-4]|ul|ol|pre|hr|li)/.test(p)) return p;
    return '<p>' + p.replace(/\n/g, '<br>') + '</p>';
  }).join('');

  return html;
}

function toast(msg, type) {
  type = type || 'info';
  var c = document.getElementById('toast-container');
  var el = document.createElement('div');
  el.className = 'toast ' + type;
  el.textContent = msg;
  c.appendChild(el);
  setTimeout(function () {
    el.style.opacity = '0';
    el.style.transition = 'opacity .3s';
    setTimeout(function () { el.remove(); }, 300);
  }, 2800);
}

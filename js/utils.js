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
    if (!/^\|[\s\-:|]+\|$/.test(lines[1])) return block;
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

// Extract Chinese number from a string and return its integer value.
// e.g. "第一章" → 1, "第十三章" → 13, "第二十五节" → 25, "操作系统" → null
// Also handles Arabic numerals: "第3章" → 3
function parseChineseNumber(str) {
  if (!str || typeof str !== 'string') return null;

  // Try Arabic numerals first: "第3章", "练习12", etc.
  var arabicMatch = str.match(/(\d+)/);
  if (arabicMatch) return parseInt(arabicMatch[1], 10);

  // Collect consecutive Chinese digit characters
  var cnDigits = '一二三四五六七八九十百';
  var numStr = '';
  for (var i = 0; i < str.length; i++) {
    if (cnDigits.indexOf(str[i]) !== -1) {
      numStr += str[i];
    }
  }
  if (!numStr) return null;

  // Convert Chinese number string to integer
  var digits = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9 };

  if (numStr === '十') return 10;
  if (numStr === '百') return 100;

  var val = 0;
  if (numStr[0] === '十') {
    // 十X = 10 + X (十三=13)
    val = 10 + (digits[numStr[1]] || 0);
  } else if (numStr[numStr.length - 1] === '十') {
    // X十 = X * 10 (二十=20)
    val = (digits[numStr[0]] || 0) * 10;
  } else if (numStr.indexOf('十') !== -1) {
    // X十Y = X * 10 + Y (二十五=25)
    var parts = numStr.split('十');
    val = (digits[parts[0]] || 0) * 10 + (digits[parts[1]] || 0);
  } else {
    // Single digit (五=5)
    val = digits[numStr] || 0;
  }

  return val;
}

// Smart sort for tree nodes: folders first, then by Chinese/Arabic number, then localeCompare
function smartSortName(a, b) {
  // 1. Folders before files
  if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;

  // 2. Try numeric sorting by Chinese/Arabic number in name
  var numA = parseChineseNumber(a.name);
  var numB = parseChineseNumber(b.name);

  if (numA !== null && numB !== null) {
    if (numA !== numB) return numA - numB;
    // Same number, fallback to localeCompare
    return a.name.localeCompare(b.name, 'zh-CN');
  }

  // 3. Items with numbers come before items without
  if (numA !== null) return -1;
  if (numB !== null) return 1;

  // 4. No numbers in either — plain localeCompare
  return a.name.localeCompare(b.name, 'zh-CN');
}

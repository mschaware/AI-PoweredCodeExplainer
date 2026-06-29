/**
 * CodeLens AI — Frontend Application
 * Handles code submission, result rendering, history management,
 * diff view generation, and UI state management.
 */

'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// STATE
// ─────────────────────────────────────────────────────────────────────────────
const state = {
  language: 'python',
  history: JSON.parse(localStorage.getItem('cl_history') || '[]'),
  currentResult: null,
  isLoading: false,
  activeHistoryId: null
};

// ─────────────────────────────────────────────────────────────────────────────
// DOM REFERENCES
// ─────────────────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const els = {
  sidebar:          $('sidebar'),
  main:             $('main'),
  sidebarToggle:    $('sidebarToggle'),
  menuToggle:       $('menuToggle'),
  historyList:      $('historyList'),
  clearHistoryBtn:  $('clearHistoryBtn'),
  breadcrumbLang:   $('breadcrumbLang'),
  providerLabel:    $('providerLabel'),
  langPython:       $('langPython'),
  langJS:           $('langJS'),
  codeInput:        $('codeInput'),
  lineNumbers:      $('lineNumbers'),
  clearCodeBtn:     $('clearCodeBtn'),
  pasteExampleBtn:  $('pasteExampleBtn'),
  lineCount:        $('lineCount'),
  charCount:        $('charCount'),
  explainBtn:       $('explainBtn'),
  optimizeBtn:      $('optimizeBtn'),
  resultsSection:   $('resultsSection'),
  welcomeSection:   $('welcomeSection'),
  // Result fields
  explanationText:  $('explanationText'),
  confidenceNote:   $('confidenceNote'),
  resultLangBadge:  $('resultLangBadge'),
  timeComplexity:   $('timeComplexity'),
  spaceComplexity:  $('spaceComplexity'),
  highlightedCode:  $('highlightedCode'),
  annotationsPanel: $('annotationsPanel'),
  issuesList:       $('issuesList'),
  copyCodeBtn:      $('copyCodeBtn'),
  copyOptimizedBtn: $('copyOptimizedBtn'),
  diffCard:         $('diffCard'),
  diffView:         $('diffView'),
  optimizationNotes:$('optimizationNotes'),
  errorToast:       $('errorToast'),
  toastMessage:     $('toastMessage'),
  toastClose:       $('toastClose')
};

// ─────────────────────────────────────────────────────────────────────────────
// EXAMPLE SNIPPETS
// ─────────────────────────────────────────────────────────────────────────────
const EXAMPLES = {
  'bubble-sort': {
    lang: 'python',
    code: `def bubble_sort(arr):
    n = len(arr)
    for i in range(n):
        swapped = False
        for j in range(0, n - i - 1):
            if arr[j] > arr[j + 1]:
                arr[j], arr[j + 1] = arr[j + 1], arr[j]
                swapped = True
        if not swapped:
            break
    return arr

# Test
numbers = [64, 34, 25, 12, 22, 11, 90]
print(bubble_sort(numbers))`
  },
  'fibonacci': {
    lang: 'python',
    code: `def fibonacci(n, memo={}):
    if n in memo:
        return memo[n]
    if n <= 1:
        return n
    memo[n] = fibonacci(n - 1, memo) + fibonacci(n - 2, memo)
    return memo[n]

# Generate fibonacci sequence
sequence = [fibonacci(i) for i in range(15)]
print("Fibonacci sequence:", sequence)`
  },
  'fetch-api': {
    lang: 'javascript',
    code: `async function fetchUserData(userId) {
  try {
    const response = await fetch(\`https://api.example.com/users/\${userId}\`);
    
    if (!response.ok) {
      throw new Error(\`HTTP error! status: \${response.status}\`);
    }
    
    const data = await response.json();
    return {
      id: data.id,
      name: data.name,
      email: data.email,
      avatar: data.avatar_url
    };
  } catch (error) {
    console.error('Failed to fetch user:', error);
    throw error;
  }
}

// Usage
fetchUserData(42)
  .then(user => console.log('User:', user))
  .catch(err => console.error(err));`
  },
  'binary-search': {
    lang: 'python',
    code: `def binary_search(arr, target):
    left, right = 0, len(arr) - 1
    
    while left <= right:
        mid = (left + right) // 2
        
        if arr[mid] == target:
            return mid
        elif arr[mid] < target:
            left = mid + 1
        else:
            right = mid - 1
    
    return -1

# Example usage
sorted_array = [2, 5, 8, 12, 16, 23, 38, 56, 72, 91]
result = binary_search(sorted_array, 23)
print(f"Found at index: {result}")`
  },
  'class-example': {
    lang: 'javascript',
    code: `class EventEmitter {
  constructor() {
    this.events = {};
  }

  on(event, listener) {
    if (!this.events[event]) {
      this.events[event] = [];
    }
    this.events[event].push(listener);
    return this;
  }

  off(event, listener) {
    if (this.events[event]) {
      this.events[event] = this.events[event].filter(l => l !== listener);
    }
    return this;
  }

  emit(event, ...args) {
    if (this.events[event]) {
      this.events[event].forEach(listener => listener(...args));
    }
    return this;
  }

  once(event, listener) {
    const wrapper = (...args) => {
      listener(...args);
      this.off(event, wrapper);
    };
    return this.on(event, wrapper);
  }
}

const emitter = new EventEmitter();
emitter.on('data', (msg) => console.log('Received:', msg));
emitter.emit('data', 'Hello World!');`
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────────────────────────────────────
async function init() {
  bindEvents();
  renderHistory();
  updateLineNumbers();
  checkServerHealth();

  // Restore last session code if any
  const lastCode = sessionStorage.getItem('cl_last_code');
  const lastLang = sessionStorage.getItem('cl_last_lang');
  if (lastCode) {
    els.codeInput.value = lastCode;
    if (lastLang) setLanguage(lastLang, false);
    updateCounts();
    updateLineNumbers();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// EVENT BINDING
// ─────────────────────────────────────────────────────────────────────────────
function bindEvents() {
  // Sidebar toggle
  els.sidebarToggle.addEventListener('click', toggleSidebar);
  els.menuToggle.addEventListener('click', toggleSidebar);

  // Language selector
  els.langPython.addEventListener('click', () => setLanguage('python'));
  els.langJS.addEventListener('click', () => setLanguage('javascript'));

  // Code editor
  els.codeInput.addEventListener('input', handleCodeInput);
  els.codeInput.addEventListener('keydown', handleTabKey);
  els.codeInput.addEventListener('scroll', syncScroll);

  // Toolbar buttons
  els.clearCodeBtn.addEventListener('click', clearCode);
  els.pasteExampleBtn.addEventListener('click', loadExample);

  // Submit buttons
  els.explainBtn.addEventListener('click', () => submitCode('explain'));
  els.optimizeBtn.addEventListener('click', () => submitCode('optimize'));

  // Copy buttons
  els.copyCodeBtn.addEventListener('click', () => copyToClipboard(els.codeInput.value, els.copyCodeBtn));
  els.copyOptimizedBtn.addEventListener('click', copyOptimizedCode);

  // History
  els.clearHistoryBtn.addEventListener('click', clearHistory);

  // Toast close
  els.toastClose.addEventListener('click', hideToast);

  // Example chips
  document.querySelectorAll('.chip[data-example]').forEach(chip => {
    chip.addEventListener('click', () => loadExampleByKey(chip.dataset.example));
  });

  // Close mobile sidebar on outside click
  document.addEventListener('click', e => {
    if (window.innerWidth <= 900 &&
        els.sidebar.classList.contains('mobile-open') &&
        !els.sidebar.contains(e.target) &&
        !els.menuToggle.contains(e.target)) {
      els.sidebar.classList.remove('mobile-open');
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// SIDEBAR
// ─────────────────────────────────────────────────────────────────────────────
function toggleSidebar() {
  if (window.innerWidth <= 900) {
    els.sidebar.classList.toggle('mobile-open');
  } else {
    els.sidebar.classList.toggle('collapsed');
    els.main.classList.toggle('sidebar-hidden');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// LANGUAGE SELECTOR
// ─────────────────────────────────────────────────────────────────────────────
function setLanguage(lang, updateBreadcrumb = true) {
  state.language = lang;
  els.langPython.classList.toggle('active', lang === 'python');
  els.langJS.classList.toggle('active', lang === 'javascript');
  if (updateBreadcrumb) {
    els.breadcrumbLang.textContent = lang === 'python' ? 'Python' : 'JavaScript';
  }
  sessionStorage.setItem('cl_last_lang', lang);
}

// ─────────────────────────────────────────────────────────────────────────────
// CODE EDITOR HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function handleCodeInput() {
  updateCounts();
  updateLineNumbers();
  sessionStorage.setItem('cl_last_code', els.codeInput.value);
  sessionStorage.setItem('cl_last_lang', state.language);
}

function handleTabKey(e) {
  if (e.key === 'Tab') {
    e.preventDefault();
    const start = els.codeInput.selectionStart;
    const end = els.codeInput.selectionEnd;
    const spaces = '  '; // 2-space tab
    els.codeInput.value = els.codeInput.value.substring(0, start) + spaces + els.codeInput.value.substring(end);
    els.codeInput.selectionStart = els.codeInput.selectionEnd = start + spaces.length;
    handleCodeInput();
  }
}

function syncScroll() {
  els.lineNumbers.scrollTop = els.codeInput.scrollTop;
}

function updateCounts() {
  const code = els.codeInput.value;
  const lines = code ? code.split('\n').length : 0;
  els.lineCount.textContent = lines;
  els.charCount.textContent = code.length;
}

function updateLineNumbers() {
  const lines = (els.codeInput.value || '').split('\n').length;
  els.lineNumbers.innerHTML = Array.from({ length: Math.max(lines, 1) }, (_, i) => i + 1).join('<br>');
}

function clearCode() {
  els.codeInput.value = '';
  updateCounts();
  updateLineNumbers();
  sessionStorage.removeItem('cl_last_code');
  els.codeInput.focus();
}

function loadExample() {
  const keys = Object.keys(EXAMPLES);
  const key = keys[Math.floor(Math.random() * keys.length)];
  loadExampleByKey(key);
}

function loadExampleByKey(key) {
  const ex = EXAMPLES[key];
  if (!ex) return;
  els.codeInput.value = ex.code;
  setLanguage(ex.lang);
  updateCounts();
  updateLineNumbers();
  els.codeInput.focus();
}

// ─────────────────────────────────────────────────────────────────────────────
// API CALLS
// ─────────────────────────────────────────────────────────────────────────────
async function submitCode(mode = 'explain') {
  const code = els.codeInput.value.trim();
  if (!code) {
    showToast('Please paste some code first.');
    return;
  }
  if (state.isLoading) return;

  setLoading(true, mode);

  try {
    const endpoint = mode === 'optimize' ? '/api/optimize' : '/api/explain';
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, language: state.language, mode })
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || `Server error: ${res.status}`);
    }

    const result = await res.json();
    state.currentResult = result;

    renderResults(result, mode);
    addToHistory(code, state.language, result);

  } catch (err) {
    showToast(err.message || 'Something went wrong. Check the server logs.');
    console.error('Submit error:', err);
  } finally {
    setLoading(false, mode);
  }
}

function setLoading(loading, mode) {
  state.isLoading = loading;
  const btn = els.explainBtn;
  const btnText = btn.querySelector('.btn-text');
  const btnLoader = btn.querySelector('.btn-loader');
  const btnIcon = btn.querySelector('svg');

  if (loading) {
    btn.disabled = true;
    els.optimizeBtn.disabled = true;
    btnText.textContent = mode === 'optimize' ? 'Optimizing...' : 'Analyzing...';
    btnIcon.hidden = true;
    btnLoader.hidden = false;
  } else {
    btn.disabled = false;
    els.optimizeBtn.disabled = false;
    btnText.textContent = 'Explain Code';
    btnIcon.hidden = false;
    btnLoader.hidden = true;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// RENDER RESULTS
// ─────────────────────────────────────────────────────────────────────────────
function renderResults(result, mode) {
  // Show results, hide welcome
  els.welcomeSection.hidden = true;
  els.resultsSection.hidden = false;

  const lang = result.language || state.language;

  // ── Language Badge ──
  els.resultLangBadge.textContent = lang === 'python' ? 'Python' : 'JavaScript';
  els.resultLangBadge.className = `lang-badge ${lang}`;

  // ── Explanation ──
  els.explanationText.textContent = result.explanation || 'No explanation available.';
  els.confidenceNote.textContent = result.confidenceNote || '';
  els.confidenceNote.hidden = !result.confidenceNote;

  // ── Complexity ──
  if (result.complexity) {
    els.timeComplexity.textContent = result.complexity.time || 'N/A';
    els.spaceComplexity.textContent = result.complexity.space || 'N/A';
  }

  // ── Highlighted Code ──
  const code = result.originalCode || els.codeInput.value;
  els.highlightedCode.className = `language-${lang}`;
  els.highlightedCode.textContent = code;
  hljs.highlightElement(els.highlightedCode);

  // ── Annotations ──
  renderAnnotations(result.keyHighlights || [], result.astAnnotations || []);

  // ── Issues ──
  renderIssues(result.potentialIssues || []);

  // ── Diff View (if optimized code available) ──
  if (result.optimizedCode) {
    renderDiff(code, result.optimizedCode, lang, result.optimizationNotes || []);
    els.diffCard.hidden = false;
  } else {
    els.diffCard.hidden = true;
  }

  // Smooth scroll to results
  els.resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ── Annotations Panel ──
function renderAnnotations(highlights, astAnnotations) {
  // Merge LLM highlights with AST annotations
  const combined = [];

  // Add LLM highlights first (they have descriptions)
  highlights.forEach(h => {
    combined.push({
      type: h.label || 'Highlight',
      name: h.label || '',
      line: h.lineStart || 1,
      endLine: h.lineEnd || h.lineStart || 1,
      description: h.description || '',
      source: 'llm'
    });
  });

  // Add AST annotations not already covered
  const llmLines = new Set(combined.map(h => h.line));
  astAnnotations.forEach(a => {
    if (!llmLines.has(a.line)) {
      combined.push({ ...a, description: '', source: 'ast' });
    }
  });

  combined.sort((a, b) => a.line - b.line);

  if (combined.length === 0) {
    els.annotationsPanel.innerHTML = '<div class="annotation-empty">No key elements detected</div>';
    return;
  }

  els.annotationsPanel.innerHTML = combined.map(item => `
    <div class="annotation-item" data-line="${item.line}" title="Click to highlight line">
      <div class="annotation-type">${escHtml(item.type)}</div>
      <div class="annotation-name">${escHtml(item.name)}</div>
      <div class="annotation-line">Line ${item.line}${item.endLine && item.endLine !== item.line ? `–${item.endLine}` : ''}</div>
      ${item.description ? `<div class="annotation-desc">${escHtml(item.description)}</div>` : ''}
    </div>
  `).join('');

  // Click to highlight lines
  els.annotationsPanel.querySelectorAll('.annotation-item').forEach(item => {
    item.addEventListener('click', () => {
      const line = parseInt(item.dataset.line);
      highlightCodeLine(line);
    });
  });
}

function highlightCodeLine(lineNum) {
  // Remove existing highlights
  els.highlightedCode.querySelectorAll('.hljs-highlight-line').forEach(el => {
    el.className = el.className.replace(' hljs-highlight-line', '');
    const content = el.innerHTML;
    el.outerHTML = content;
  });

  // Get lines from the highlighted code
  const codeEl = els.highlightedCode;
  const text = codeEl.textContent;
  const lines = text.split('\n');

  if (lineNum > 0 && lineNum <= lines.length) {
    // Scroll code into view
    const lineHeight = parseFloat(getComputedStyle(codeEl).lineHeight) || 26;
    codeEl.parentElement.scrollTop = (lineNum - 1) * lineHeight - 60;
  }
}

// ── Issues ──
function renderIssues(issues) {
  if (!issues || issues.length === 0) {
    els.issuesList.innerHTML = '<div class="issues-empty">✅ No obvious issues detected</div>';
    return;
  }
  els.issuesList.innerHTML = issues.map(issue => `<li>${escHtml(issue)}</li>`).join('');
}

// ── Diff View ──
function renderDiff(original, optimized, lang, notes) {
  // Render optimization note chips
  els.optimizationNotes.innerHTML = notes.length > 0
    ? notes.map(n => `<span class="opt-note">✓ ${escHtml(n)}</span>`).join('')
    : '';

  // Build unified diff string
  const diff = createUnifiedDiff(original, optimized, lang);

  els.diffView.innerHTML = '';

  try {
    const diff2htmlUi = new Diff2HtmlUI(els.diffView, diff, {
      drawFileList: false,
      matching: 'lines',
      outputFormat: 'side-by-side',
      synchronisedScroll: true,
      highlight: true,
      renderNothingWhenEmpty: false
    });
    diff2htmlUi.draw();
    diff2htmlUi.highlightCode();
  } catch (e) {
    // Fallback: plain text comparison
    els.diffView.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:1px;background:var(--border)">
        <div style="background:var(--bg-card);padding:16px">
          <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:8px">ORIGINAL</div>
          <pre style="font-family:'JetBrains Mono',monospace;font-size:0.8rem;color:var(--text-code);white-space:pre-wrap">${escHtml(original)}</pre>
        </div>
        <div style="background:var(--bg-card);padding:16px">
          <div style="font-size:0.75rem;color:var(--green-400);margin-bottom:8px">OPTIMIZED</div>
          <pre style="font-family:'JetBrains Mono',monospace;font-size:0.8rem;color:var(--text-code);white-space:pre-wrap">${escHtml(optimized)}</pre>
        </div>
      </div>
    `;
  }
}

function createUnifiedDiff(original, optimized, lang) {
  const ext = lang === 'python' ? 'py' : 'js';
  const origLines = original.split('\n');
  const optLines = optimized.split('\n');

  // Simple line-by-line diff
  const chunks = computeDiffChunks(origLines, optLines);
  let diff = `--- a/original.${ext}\n+++ b/optimized.${ext}\n`;

  let origLine = 1;
  let optLine = 1;

  for (const chunk of chunks) {
    const origCount = chunk.filter(l => l.type !== 'add').length;
    const optCount = chunk.filter(l => l.type !== 'remove').length;

    diff += `@@ -${origLine},${origCount} +${optLine},${optCount} @@\n`;

    for (const line of chunk) {
      if (line.type === 'same') {
        diff += ` ${line.text}\n`;
        origLine++; optLine++;
      } else if (line.type === 'remove') {
        diff += `-${line.text}\n`;
        origLine++;
      } else if (line.type === 'add') {
        diff += `+${line.text}\n`;
        optLine++;
      }
    }
  }

  return diff;
}

function computeDiffChunks(origLines, optLines) {
  // LCS-based simple diff
  const m = origLines.length;
  const n = optLines.length;

  // Build LCS table (limit size for performance)
  const maxLines = 300;
  if (m > maxLines || n > maxLines) {
    // For large diffs, just show all as changed
    return [[
      ...origLines.slice(0, 5).map(text => ({ type: 'same', text })),
      ...origLines.slice(5).map(text => ({ type: 'remove', text })),
      ...optLines.slice(5).map(text => ({ type: 'add', text }))
    ]];
  }

  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      if (origLines[i] === optLines[j]) {
        dp[i][j] = dp[i + 1][j + 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  const result = [];
  let i = 0, j = 0;
  while (i < m || j < n) {
    if (i < m && j < n && origLines[i] === optLines[j]) {
      result.push({ type: 'same', text: origLines[i] });
      i++; j++;
    } else if (j < n && (i >= m || dp[i][j + 1] >= dp[i + 1][j])) {
      result.push({ type: 'add', text: optLines[j] });
      j++;
    } else {
      result.push({ type: 'remove', text: origLines[i] });
      i++;
    }
  }

  // Group into a single chunk (simple unified diff)
  return [result];
}

// ─────────────────────────────────────────────────────────────────────────────
// HISTORY
// ─────────────────────────────────────────────────────────────────────────────
function addToHistory(code, language, result) {
  const item = {
    id: Date.now().toString(),
    code,
    language,
    result,
    timestamp: new Date().toISOString(),
    preview: code.split('\n')[0].trim().substring(0, 48)
  };

  state.history.unshift(item);
  if (state.history.length > 50) state.history.pop(); // cap at 50

  localStorage.setItem('cl_history', JSON.stringify(state.history));
  state.activeHistoryId = item.id;
  renderHistory();
}

function renderHistory() {
  if (state.history.length === 0) {
    els.historyList.innerHTML = `
      <div class="history-empty">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M9 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9l-6-6z"/>
          <path d="M9 3v6h6"/>
        </svg>
        <p>No snippets yet</p>
        <span>Paste code and click Explain</span>
      </div>`;
    return;
  }

  els.historyList.innerHTML = state.history.map(item => `
    <div class="history-item ${item.id === state.activeHistoryId ? 'active' : ''}"
         data-id="${item.id}">
      <div class="history-item-header">
        <span class="history-lang ${item.language}">${item.language === 'python' ? 'PY' : 'JS'}</span>
        <span class="history-time">${formatRelativeTime(item.timestamp)}</span>
      </div>
      <div class="history-preview">${escHtml(item.preview || '...')}</div>
    </div>
  `).join('');

  // Click handlers
  els.historyList.querySelectorAll('.history-item').forEach(el => {
    el.addEventListener('click', () => loadFromHistory(el.dataset.id));
  });
}

function loadFromHistory(id) {
  const item = state.history.find(h => h.id === id);
  if (!item) return;

  els.codeInput.value = item.code;
  setLanguage(item.language);
  updateCounts();
  updateLineNumbers();
  state.activeHistoryId = id;
  state.currentResult = item.result;

  renderResults(item.result, 'explain');
  renderHistory(); // update active state

  // Close mobile sidebar
  if (window.innerWidth <= 900) {
    els.sidebar.classList.remove('mobile-open');
  }
}

function clearHistory() {
  if (state.history.length === 0) return;
  if (!confirm('Clear all history?')) return;
  state.history = [];
  state.activeHistoryId = null;
  localStorage.removeItem('cl_history');
  renderHistory();
}

// ─────────────────────────────────────────────────────────────────────────────
// COPY TO CLIPBOARD
// ─────────────────────────────────────────────────────────────────────────────
async function copyToClipboard(text, btn) {
  try {
    await navigator.clipboard.writeText(text);
    const originalText = btn.innerHTML;
    btn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="20 6 9 17 4 12"/>
      </svg>
      Copied!`;
    btn.classList.add('copied');
    setTimeout(() => {
      btn.innerHTML = originalText;
      btn.classList.remove('copied');
    }, 2000);
  } catch {
    showToast('Could not copy to clipboard.');
  }
}

function copyOptimizedCode() {
  const code = state.currentResult?.optimizedCode;
  if (!code) {
    showToast('No optimized code available.');
    return;
  }
  copyToClipboard(code, els.copyOptimizedBtn);
}

// ─────────────────────────────────────────────────────────────────────────────
// SERVER HEALTH CHECK
// ─────────────────────────────────────────────────────────────────────────────
async function checkServerHealth() {
  try {
    const res = await fetch('/api/health');
    if (res.ok) {
      const data = await res.json();
      const providerNames = { gemini: 'Gemini AI', openai: 'GPT-4o' };
      els.providerLabel.textContent = providerNames[data.provider] || data.provider;
    }
  } catch {
    els.providerLabel.textContent = 'Offline';
    document.querySelector('.provider-dot').style.background = '#f87171';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// TOAST
// ─────────────────────────────────────────────────────────────────────────────
let toastTimer = null;
function showToast(message) {
  els.toastMessage.textContent = message;
  els.errorToast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, 5000);
}
function hideToast() {
  els.errorToast.hidden = true;
}

// ─────────────────────────────────────────────────────────────────────────────
// UTILITIES
// ─────────────────────────────────────────────────────────────────────────────
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatRelativeTime(isoString) {
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ─────────────────────────────────────────────────────────────────────────────
// BOOT
// ─────────────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);

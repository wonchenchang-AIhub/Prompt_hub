/* ═══════════════════════════════════════════════════════════════════════════
   app.js  ·  AI 提示詞資料庫（桌機版）
   按鈕設計：
     ① 複製提示詞（藍色）  ─ 複製主提示詞全文
     ② 複製案例（綠色）    ─ 複製案例情境提示詞
   案例內容存在 window.__caseCache，按鈕只傳 index，完全避開 HTML encode 問題。
═══════════════════════════════════════════════════════════════════════════ */

/* ── State ─────────────────────────────────────────────────────────────── */
let currentCat = 'all';
let searchQuery = '';

/* ── Case prompt cache ───────────────────────────────────────────────────── */
window.__caseCache = [];
let __modalCaseCache = [];

function storeCasePrompt(text) {
  window.__caseCache.push(text);
  return window.__caseCache.length - 1;
}
function getCasePrompt(idx) {
  return window.__caseCache[idx] || '';
}

/* ── Copy-count persistence (GitHub Gist + localStorage fallback) ───────── */
var _GH_TOKEN   = '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';
var _GIST_ID    = '9b698905014cc381f348a36b95e9aab2';
var _GIST_URL   = 'https://api.github.com/gists/' + _GIST_ID;
var _LS_KEY     = 'prompt_copy_counts';
var _memCounts  = null;
var _pushTimer  = null;

function _lsLoad() {
  try { return JSON.parse(localStorage.getItem(_LS_KEY) || '{}'); } catch(e) { return {}; }
}
function _lsSave(c) {
  try { localStorage.setItem(_LS_KEY, JSON.stringify(c)); } catch(e) {}
}

function getCount(id) {
  return (_memCounts || _lsLoad())[id] || 0;
}

// 從 Gist 拉最新數據，合併後更新本地
function syncFromGist() {
  fetch(_GIST_URL, {
    headers: {
      'Authorization': 'token ' + _GH_TOKEN,
      'Accept': 'application/vnd.github+json'
    }
  })
  .then(function(r) { return r.ok ? r.json() : null; })
  .then(function(data) {
    if (!data) return;
    var remote = {};
    try { remote = JSON.parse(data.files['counts.json'].content).counts || {}; } catch(e) {}
    var local  = _lsLoad();
    var merged = Object.assign({}, local);
    Object.keys(remote).forEach(function(k) {
      merged[k] = Math.max(parseInt(merged[k]) || 0, parseInt(remote[k]) || 0);
    });
    _memCounts = merged;
    _lsSave(merged);
    refreshAllCountPills();
  })
  .catch(function() { _memCounts = _lsLoad(); });
}

// 防抖推送：500ms 內多次複製只推一次
function pushToGist() {
  clearTimeout(_pushTimer);
  _pushTimer = setTimeout(function() {
    var payload = JSON.stringify({ counts: _memCounts || _lsLoad() });
    fetch(_GIST_URL, {
      method: 'PATCH',
      headers: {
        'Authorization': 'token ' + _GH_TOKEN,
        'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ files: { 'counts.json': { content: payload } } })
    }).catch(function() {});
  }, 500);
}

function incrementCount(id) {
  var c = _memCounts || _lsLoad();
  c[id] = (c[id] || 0) + 1;
  _memCounts = c;
  _lsSave(c);
  pushToGist();
  return c[id];
}

window.addEventListener('DOMContentLoaded', function() {
  _memCounts = _lsLoad();
  syncFromGist();
});

function getCount(id) { return loadCounts()[id] || 0; }
function incrementCount(id) {
  const c = loadCounts();
  c[id] = (c[id] || 0) + 1;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(c));
  return c[id];
}
function fmt(n) { return n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n); }

/* ── Helpers ────────────────────────────────────────────────────────────── */
function catInfo(key) {
  return CATEGORIES[key] || { label: key, icon: '◉', class: '' };
}
function previewText(content) {
  return content.replace(/#+\s/g, '').replace(/[│|]/g, '').replace(/\n+/g, ' ').trim();
}
function getCases(pid) {
  return (typeof CASES_BY_PROMPT !== 'undefined' && CASES_BY_PROMPT[pid])
    ? CASES_BY_PROMPT[pid] : [];
}
function caseTagClass(type) {
  if (type === 'practice') return 'practice';
  return '';
}
function escapeHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* ── Copy utilities ─────────────────────────────────────────────────────── */
function doPromptCopy(text, btn) {
  navigator.clipboard.writeText(text).then(() => {
    btn.classList.add('copied-prompt');
    const orig = btn.innerHTML;
    btn.innerHTML = '✓ 已複製！';
    setTimeout(() => { btn.classList.remove('copied-prompt'); btn.innerHTML = orig; }, 2000);
  }).catch(err => console.error('複製失敗', err));
}

function doCaseCopy(text, btn) {
  navigator.clipboard.writeText(text).then(() => {
    btn.classList.add('copied-case');
    btn.textContent = '✓ 已複製';
    setTimeout(() => { btn.classList.remove('copied-case'); btn.textContent = '⎘ 複製案例'; }, 2000);
  }).catch(err => console.error('複製失敗', err));
}

/* ── Card rendering ─────────────────────────────────────────────────────── */
function renderCards() {
  window.__caseCache = [];
  const grid = document.getElementById('cardGrid');
  const q    = searchQuery.toLowerCase();

  const filtered = PROMPTS.filter(p => {
    const matchCat = currentCat === 'all' || p.cat === currentCat;
    const matchQ   = !q || p.title.toLowerCase().includes(q) || p.content.toLowerCase().includes(q);
    return matchCat && matchQ;
  });

  document.getElementById('count-all').textContent = PROMPTS.length;

  if (!filtered.length) {
    grid.innerHTML = `<div class="no-results"><span>◎</span><p>找不到符合「${searchQuery}」的提示詞</p></div>`;
    return;
  }

  grid.innerHTML = filtered.map((p, i) => {
    const cat   = catInfo(p.cat);
    const cnt   = getCount(p.id);
    const badge = cnt > 0
      ? `<span class="card-copies" title="已複製 ${cnt} 次">⎘ ${fmt(cnt)}</span>`
      : `<span class="card-copies card-copies-zero">⎘ 0</span>`;

    const footer = `
      <div class="card-footer">
        <span class="card-chars">${p.content.length.toLocaleString()} 字元</span>
        <div class="card-footer-actions">
          ${badge}
          <button class="card-copy-prompt-btn"
            onclick="cardCopyPromptById(event,this,${p.id})"
            title="複製提示詞全文">
            ⎘ 複製提示詞
          </button>
        </div>
      </div>`;

    const cases = getCases(p.id);
    const casesHTML = cases.length ? (() => {
      const caseItems = cases.map(c => {
        const cacheIdx = storeCasePrompt(c.prompt);
        return `
            <div class="case-item">
              <div class="case-item-header">
                <span class="case-tag ${caseTagClass(c.type)}">${c.typeLabel}</span>
                <button class="case-copy-btn"
                  onclick="cardCopyCase(event,this,${cacheIdx})"
                  title="複製此案例的完整提示詞">
                  ⎘ 複製案例
                </button>
              </div>
              <div class="case-title">${escapeHtml(c.title)}</div>
              <div class="case-scene">${escapeHtml(c.scene)}</div>
            </div>`;
      }).join('');
      return `
      <div class="card-cases">
        <button class="cases-toggle" onclick="toggleCases(event,this)">
          <span class="cases-toggle-icon">▶</span>
          <span class="cases-toggle-label">📋 實戰案例</span>
          <span class="cases-toggle-count">${cases.length}</span>
        </button>
        <div class="cases-list">${caseItems}</div>
      </div>`;
    })() : '';

    return `
      <div class="card ${cat.class}" style="animation-delay:${Math.min(i*.04,.4)}s" data-id="${p.id}">
        <div class="card-top" onclick="openModal(${p.id})" style="cursor:pointer;">
          <span class="card-cat">${cat.icon} ${cat.label}</span>
          <span class="card-arrow">↗</span>
        </div>
        <div class="card-title"  onclick="openModal(${p.id})" style="cursor:pointer;">${escapeHtml(p.title)}</div>
        <div class="card-preview" onclick="openModal(${p.id})" style="cursor:pointer;">${escapeHtml(previewText(p.content))}</div>
        ${footer}
        ${casesHTML}
      </div>`;
  }).join('');
}

/* 卡片：複製提示詞（藍）*/
function cardCopyPromptById(e, btn, id) {
  e.stopPropagation();
  const p = PROMPTS.find(x => x.id === id);
  if (!p) return;
  navigator.clipboard.writeText(p.content).then(() => {
    const newCnt = incrementCount(id);
    btn.classList.add('copied-prompt');
    btn.textContent = '✓ 已複製！';
    setTimeout(() => { btn.classList.remove('copied-prompt'); btn.textContent = '⎘ 複製提示詞'; }, 2000);
    const card = document.querySelector(`.card[data-id="${id}"]`);
    if (card) {
      const b = card.querySelector('.card-copies');
      if (b) { b.textContent = `⎘ ${fmt(newCnt)}`; b.title = `已複製 ${newCnt} 次`; b.classList.remove('card-copies-zero'); b.classList.add('card-copies-bump'); setTimeout(() => b.classList.remove('card-copies-bump'), 500); }
    }
  }).catch(err => console.error('複製失敗', err));
}

/* 卡片：複製案例（綠）*/
function cardCopyCase(e, btn, cacheIdx) {
  e.stopPropagation();
  const text = getCasePrompt(cacheIdx);
  if (!text) return;
  doCaseCopy(text, btn);
}

/* 折疊開關 */
function toggleCases(e, btn) {
  e.stopPropagation();
  const list = btn.nextElementSibling;
  const open = btn.classList.toggle('open');
  list.classList.toggle('open', open);
}

/* ── Modal ──────────────────────────────────────────────────────────────── */
function openModal(id) {
  __modalCaseCache = [];
  const p = PROMPTS.find(x => x.id === id);
  if (!p) return;
  const cat = catInfo(p.cat);

  const catTag = document.getElementById('modalCat');
  catTag.textContent = `${cat.icon} ${cat.label}`;
  catTag.className   = `modal-cat-tag ${cat.class}`;
  document.getElementById('modalTitle').textContent = p.title;
  document.getElementById('modalContent').textContent = p.content;

  const cnt = getCount(id);
  document.getElementById('modalCopyCount').textContent = cnt > 0 ? `已複製 ${cnt} 次` : '';

  const cases       = getCases(id);
  const casesPanelEl = document.getElementById('modalCases');
  const casesListEl  = document.getElementById('modalCasesList');

  if (cases.length) {
    casesPanelEl.style.display = 'block';
    casesListEl.innerHTML = cases.map(c => {
      const idx = __modalCaseCache.length;
      __modalCaseCache.push(c.prompt);
      const tipsHtml = (c.tips && c.tips.length) ? `
        <div class="modal-case-section">
          <div class="modal-case-section-label">💡 進階練習</div>
          <div class="modal-case-text">${c.tips.map(t => '• ' + escapeHtml(t)).join('\n')}</div>
        </div>` : '';
      return `
        <div class="modal-case-item">
          <div class="modal-case-header">
            <span class="case-tag ${caseTagClass(c.type)}">${c.typeLabel}</span>
            <span class="modal-case-title">${escapeHtml(c.title)}</span>
            <button class="modal-case-copy"
              onclick="modalCopyCase(this,${idx})"
              title="複製此案例的完整提示詞">
              ⎘ 複製案例
            </button>
          </div>
          <div class="modal-case-section">
            <div class="modal-case-section-label">📍 適用場景</div>
            <div class="modal-case-text">${escapeHtml(c.scene)}</div>
          </div>
          <div class="modal-case-section">
            <div class="modal-case-section-label">🔧 使用前準備</div>
            <div class="modal-case-text">${escapeHtml(c.prep || '')}</div>
          </div>
          ${tipsHtml}
          <div class="modal-case-section">
            <div class="modal-case-section-label">📋 完整案例提示詞</div>
            <pre class="modal-case-prompt" data-modal-case-idx="${idx}"></pre>
          </div>
        </div>`;
    }).join('');
    casesListEl.querySelectorAll('.modal-case-prompt[data-modal-case-idx]').forEach(pre => {
      const idx = parseInt(pre.dataset.modalCaseIdx);
      pre.textContent = __modalCaseCache[idx] || '';
    });
  } else {
    casesPanelEl.style.display = 'none';
    casesListEl.innerHTML = '';
  }

  const overlay = document.getElementById('modalOverlay');
  overlay.classList.add('open');
  overlay.dataset.promptId = id;
  document.body.style.overflow = 'hidden';
  document.getElementById('copyConfirm').classList.remove('show');
}

/* Modal：複製提示詞（藍）*/
document.getElementById('copyBtn').addEventListener('click', () => {
  const id = parseInt(document.getElementById('modalOverlay').dataset.promptId);
  const p  = PROMPTS.find(x => x.id === id);
  if (!p) return;
  navigator.clipboard.writeText(p.content).then(() => {
    const newCnt = incrementCount(id);
    const btn = document.getElementById('copyBtn');
    btn.classList.add('copied-prompt');
    btn.innerHTML = '<span class="copy-icon">✓</span> 已複製！';
    setTimeout(() => { btn.classList.remove('copied-prompt'); btn.innerHTML = '<span class="copy-icon">⎘</span> 複製提示詞'; }, 2200);
    const confirm = document.getElementById('copyConfirm');
    confirm.textContent = `第 ${newCnt} 次複製`;
    confirm.classList.add('show');
    setTimeout(() => confirm.classList.remove('show'), 2400);
    document.getElementById('modalCopyCount').textContent = `已複製 ${newCnt} 次`;
    const card = document.querySelector(`.card[data-id="${id}"]`);
    if (card) {
      const b = card.querySelector('.card-copies');
      if (b) { b.textContent = `⎘ ${fmt(newCnt)}`; b.title = `已複製 ${newCnt} 次`; b.classList.remove('card-copies-zero'); b.classList.add('card-copies-bump'); setTimeout(() => b.classList.remove('card-copies-bump'), 500); }
      const cpBtn = card.querySelector('.card-copy-prompt-btn');
      if (cpBtn) { cpBtn.classList.add('copied-prompt'); cpBtn.textContent = '✓ 已複製！'; setTimeout(() => { cpBtn.classList.remove('copied-prompt'); cpBtn.textContent = '⎘ 複製提示詞'; }, 2200); }
    }
  }).catch(err => console.error('複製失敗', err));
});

/* Modal：複製案例（綠）*/
function modalCopyCase(btn, idx) {
  const text = __modalCaseCache[idx];
  if (!text) return;
  doCaseCopy(text, btn);
}

/* ── Close modal ────────────────────────────────────────────────────────── */
function closeModal() {
  document.getElementById('modalOverlay').classList.remove('open');
  document.body.style.overflow = '';
}
document.getElementById('modalClose').addEventListener('click', closeModal);
document.getElementById('modalOverlay').addEventListener('click', e => {
  if (e.target === document.getElementById('modalOverlay')) closeModal();
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

/* ── Category nav ───────────────────────────────────────────────────────── */
document.getElementById('catNav').addEventListener('click', e => {
  const btn = e.target.closest('.cat-btn');
  if (!btn) return;
  document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  currentCat = btn.dataset.cat;
  renderCards();
});

/* ── Search ─────────────────────────────────────────────────────────────── */
document.getElementById('searchInput').addEventListener('input', e => {
  searchQuery = e.target.value;
  renderCards();
});

/* ── Init ───────────────────────────────────────────────────────────────── */
renderCards();

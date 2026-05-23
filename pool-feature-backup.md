# Pool Tab — Feature Backup

Removed from the active app on 2026-05-23. The pool tab provided a cross-card
list view of all books with filter chips (All / Unassigned / Planned / Read)
and search-by-title. Removed because most users interact with books through
squares directly, and the tab duplicated information already visible on the card.

If restoring: paste each section back into `rfantasy_bingo_2026.html` at the
indicated location and remove the no-op stub for `buildInlinePool`.

---

## HTML — replace the simple grid wrap with this tab structure

Goes inside `.container`, after the `.stats` div and before `.export-row`:

```html
<div class="tab-bar">
  <button class="tab-btn active" id="tab-card-btn" onclick="switchTab('card')">✨ Bingo Card</button>
  <button class="tab-btn inactive" id="tab-pool-btn" onclick="switchTab('pool')">📚 My Pool <span class="tab-count" id="pool-count">0</span></button>
</div>

<div id="tab-card-panel">
  <div class="grid-wrap" id="grid-wrap">
    <div class="grid" id="grid"></div>
  </div>
</div>

<div id="tab-pool-panel" style="display:none">
  <div class="inline-pool-wrap" id="inline-pool"></div>
</div>
```

## JS — pool state, switching, filtering, and rendering

Replace the no-op `buildInlinePool` stub with these functions. Goes right
after the `// ── Pool tab ──` comment.

```javascript
let poolFilter   = 'all';   // 'all' | 'unassigned' | 'planned' | 'read'
let poolQuery    = '';

function switchTab(tab) {
  document.getElementById('tab-card-panel').style.display = tab === 'card' ? '' : 'none';
  document.getElementById('tab-pool-panel').style.display = tab === 'pool'  ? '' : 'none';
  document.getElementById('tab-card-btn').className = 'tab-btn ' + (tab === 'card' ? 'active' : 'inactive');
  document.getElementById('tab-pool-btn').className = 'tab-btn ' + (tab === 'pool' ? 'active' : 'inactive');
  document.getElementById('btn-clear-board').style.display = tab === 'card' ? '' : 'none';
  if (tab === 'pool') buildInlinePool();
}

function poolCounts() {
  const bookToSquare = {};
  Object.entries(asgn).forEach(([k, v]) => { bookToSquare[v.bookId] = parseInt(k); });
  let list = pool;
  if (poolQuery.trim()) {
    const q = poolQuery.toLowerCase();
    list = pool.filter(b => b.title.toLowerCase().includes(q) || (b.author||'').toLowerCase().includes(q));
  }
  let unassigned = 0, planned = 0, read = 0;
  list.forEach(b => {
    const at = bookToSquare[b.id] ?? -1;
    if (at < 0) { unassigned++; return; }
    const st = asgn[at]?.status;
    if (st === 'assigned') planned++;
    else if (st === 'read') read++;
    else unassigned++;
  });
  return { all: list.length, unassigned, planned, read };
}

function getFilteredPool() {
  const bookToSquare = {};
  Object.entries(asgn).forEach(([k, v]) => { bookToSquare[v.bookId] = parseInt(k); });

  let list = [...pool];
  if (poolFilter !== 'all') {
    list = list.filter(b => {
      const at = bookToSquare[b.id] ?? -1;
      if (poolFilter === 'unassigned') return at < 0;
      if (at < 0) return false;
      const st = asgn[at]?.status;
      return poolFilter === 'planned' ? st === 'assigned' : st === 'read';
    });
  }
  if (poolQuery.trim()) {
    const q = poolQuery.toLowerCase();
    list = list.filter(b => b.title.toLowerCase().includes(q) || (b.author||'').toLowerCase().includes(q));
  }
  return list;
}

function renderPoolList(listEl) {
  const filtered = getFilteredPool();
  if (!filtered.length) {
    const empty = el('div', 'pool-empty-state');
    empty.textContent = pool.length === 0 ? 'Add books to start planning your bingo — assign them to squares on the card.' : 'No books match this filter.';
    listEl.appendChild(empty); return;
  }
  const bookToSquare = {};
  Object.entries(asgn).forEach(([k, v]) => { bookToSquare[v.bookId] = parseInt(k); });
  filtered.forEach(b => {
    const assignedAt = bookToSquare[b.id] ?? -1;
    const status     = assignedAt >= 0 ? (asgn[assignedAt]?.status || 'assigned') : null;
    const statusKey  = status === 'read' ? 'read' : status === 'assigned' ? 'assigned' : 'unassigned';

    const row = el('div', 'pool-row');
    row.onclick = () => openBookDetail(b.id);

    const cov = el('div', `pool-cover status-${statusKey}`);
    if (b.coverUrl) {
      const img = el('img'); img.src = proxyCover(b.coverUrl); img.alt = b.title;
      img.onerror = () => { img.remove(); cov.textContent = '📚'; };
      cov.appendChild(img);
    } else { cov.textContent = '📚'; }
    row.appendChild(cov);

    const info = el('div', 'pool-info');
    const titleEl = el('div', 'pool-book-title'); titleEl.textContent = b.title; info.appendChild(titleEl);
    if (b.author) { const au = el('div', 'pool-book-author'); au.textContent = b.author; info.appendChild(au); }
    const meta = el('div', 'pool-book-meta');
    if (assignedAt >= 0) {
      const sqSpan = el('span', 'pool-meta-sq'); sqSpan.textContent = SQUARES[assignedAt].name; meta.appendChild(sqSpan);
    } else {
      const noSq = el('span'); noSq.textContent = 'Not assigned'; noSq.style.fontStyle = 'italic'; meta.appendChild(noSq);
    }
    const qualN = (b.qualifies || []).length;
    if (qualN > 0) {
      const qSpan = el('span', 'pool-meta-qual'); qSpan.textContent = `Qualifies for ${qualN} square${qualN === 1 ? '' : 's'}`; meta.appendChild(qSpan);
    }
    if (assignedAt >= 0 && b.author) {
      const conflictAt = authorConflictAt(b.author, b.id, assignedAt);
      if (conflictAt >= 0) {
        const warn = el('span', 'cand-author-warn');
        warn.textContent = `⚠ Same author as "${SQUARES[conflictAt].name}"`;
        meta.appendChild(warn);
      }
    }
    info.appendChild(meta);
    row.appendChild(info);

    const badgeLabel = statusKey === 'read' ? 'Read' : statusKey === 'assigned' ? 'Planned' : 'Unassigned';
    const badge = el('span', `statebadge s-${statusKey}`);
    const dot = el('span', 'dot'); badge.appendChild(dot);
    badge.appendChild(document.createTextNode(badgeLabel));
    row.appendChild(badge);

    listEl.appendChild(row);
  });
}

function buildInlinePool() {
  const wrap = document.getElementById('inline-pool');
  wrap.innerHTML = '';

  const toolbar = el('div', 'pool-toolbar');
  const searchPill = el('div', 'pool-search-pill');
  const si = el('span', 'pool-search-icon'); si.textContent = '🔍';
  const sin = el('input', 'pool-search-input');
  sin.type = 'text'; sin.placeholder = 'Search title or author…'; sin.value = poolQuery;
  sin.oninput = () => { poolQuery = sin.value; refreshList(); };
  searchPill.appendChild(si); searchPill.appendChild(sin);
  toolbar.appendChild(searchPill);
  const addToggle = el('button', 'pool-add-toggle');
  addToggle.innerHTML = '＋ Add a book';
  addToggle.onclick = () => openAddSheet();
  toolbar.appendChild(addToggle);
  wrap.appendChild(toolbar);

  const counts = poolCounts();
  const chipsEl = el('div', 'pool-chips');
  [['all','All'], ['unassigned','Unassigned'], ['planned','Planned'], ['read','Read']].forEach(([id, label]) => {
    const chip = el('button', `pool-chip${poolFilter === id ? ' active' : ''}`);
    chip.appendChild(document.createTextNode(label + ' '));
    const ct = el('span', 'pool-chip-ct'); ct.textContent = counts[id];
    chip.appendChild(ct);
    chip.onclick = () => { poolFilter = id; buildInlinePool(); };
    chipsEl.appendChild(chip);
  });
  wrap.appendChild(chipsEl);

  let listEl = el('div', 'pool-list');
  renderPoolList(listEl);
  wrap.appendChild(listEl);

  function refreshList() {
    const fresh = el('div', 'pool-list');
    renderPoolList(fresh);
    listEl.replaceWith(fresh);
    listEl = fresh;
  }

  if (pool.length) {
    const footer = el('div', 'pool-footer');
    const clearBtn = el('button', 'btn-clear-pool'); clearBtn.textContent = '🗑 Clear pool';
    clearBtn.onclick = () => {
      if (!confirm('Remove all books from your pool? Square assignments will also be cleared.')) return;
      pool = []; asgn = {}; savePool(); saveAsgn(); poolFilter = 'all'; poolQuery = '';
      renderGrid(); buildInlinePool(); updateStats();
    };
    footer.appendChild(clearBtn);
    wrap.appendChild(footer);
  }
}
```

## updateStats — add this line back

```javascript
document.getElementById('pool-count').textContent = pool.length;
```

## CSS

All `.pool-*`, `.tab-*`, `.inline-pool-*`, `.statebadge*`, `.btn-clear-pool`,
`.cover-picker-*` (overlap), and `.pool-overlay`/`.pool-modal` styles can stay
in the HTML — they're harmless when unused. They're still needed for the
stats drill-down modal which uses pool-row/pool-cover/etc. styling.

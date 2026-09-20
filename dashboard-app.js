(() => {
  const STORAGE_BATCHES = 'novel-dashboard-batches-v1';
  const STORAGE_DRAFTS = 'novel-dashboard-drafts-v1';
  const STORAGE_API = 'novel-dashboard-api-base';
  const STORAGE_ACCESS = 'novel-dashboard-access-key';
  const FACETS = ['穿越', '系統', '透視', '鑑寶', '機甲', '星際', '軍工', '商業', '投資', '職場', '男主', '女主', '大女主', '末日', '重生', '流放', '懸疑', '經營'];
  const CATEGORY_HELP = {
    '古今互通／資源經營': '兩界交換、固定道具與資源回報',
    '系統／重生／末日逆襲': '任務、倒數、升級與生存危機',
    '商業／投資／職場創業': '資金壓力、決策反轉與階級翻身',
    '透視眼／鑑寶／賭石超能力': '能力限制、專業拆局與即時回報',
    '機甲／星際／軍工科技': '科技反差、團隊任務與成本控制',
    '大女主／流放／懸疑泛受眾': '女性翻身、關係張力與謎團'
  };

  const byId = (id) => document.getElementById(id);
  const safeJson = (value, fallback) => { try { return JSON.parse(value); } catch { return fallback; } };
  const stored = (key, fallback) => safeJson(localStorage.getItem(key) || '', fallback);
  const save = (key, value) => localStorage.setItem(key, JSON.stringify(value));
  const plain = (value) => String(value || '').replace(/\s+/g, ' ').trim();
  const scoreClass = (score) => score >= 8.5 ? 'high' : score >= 7 ? 'mid' : 'low';
  const tier = (score) => score >= 8.5 ? '優先研究' : score >= 7 ? '值得追蹤' : '僅取元素';
  const currentApiBase = () => (localStorage.getItem(STORAGE_API) || window.NOVEL_API_BASE || '').replace(/\/$/, '');
  const cards = [];
  let activeFilter = 'all';

  function notify(message, error = false) {
    const target = byId('find-status');
    target.textContent = message;
    target.style.color = error ? 'var(--red)' : 'var(--green)';
  }

  function setBusy(button, busy, text) {
    button.disabled = busy;
    button.dataset.originalText ||= button.textContent;
    button.textContent = busy ? text : button.dataset.originalText;
    button.classList.toggle('is-busy', busy);
  }

  function setApiBase() {
    const previous = currentApiBase();
    const value = window.prompt('貼上 Cloudflare Worker API 網址（例如 https://xxx.workers.dev）。此網址不是金鑰。', previous);
    if (value === null) return;
    const normalized = value.trim().replace(/\/$/, '');
    if (!/^https?:\/\//.test(normalized)) return notify('API 網址格式不正確。', true);
    localStorage.setItem(STORAGE_API, normalized);
    notify('API 網址已儲存。接著按「再找 60 本」即可。');
  }

  function accessKey() {
    let key = sessionStorage.getItem(STORAGE_ACCESS);
    if (key) return key;
    key = window.prompt('輸入 Dashboard Access Key（不是 OpenAI API Key；只保留在本分頁）。');
    if (!key) return '';
    sessionStorage.setItem(STORAGE_ACCESS, key.trim());
    return key.trim();
  }

  async function api(path, body) {
    const base = currentApiBase();
    if (!base) throw new Error('尚未設定 API 網址。請先按「設定 API」。');
    const key = accessKey();
    if (!key) throw new Error('尚未輸入 Dashboard Access Key。');
    const response = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-dashboard-key': key },
      body: JSON.stringify(body || {})
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || '服務請求失敗。');
    return payload;
  }

  function tagsFor(card) {
    const raw = [card.dataset.category, card.dataset.leadGender, card.dataset.tags, card.textContent].filter(Boolean).join(' ').toLowerCase();
    return FACETS.filter((facet) => raw.includes(facet.toLowerCase()));
  }

  function sourceFromCard(card) {
    return {
      title: plain(card.querySelector('h3')?.textContent),
      category: card.dataset.category || '未分類',
      tags: safeJson(card.dataset.tags || '[]', tagsFor(card)),
      summary: plain(card.querySelector('.abstract')?.textContent),
      verdict: plain(card.querySelector('.verdict')?.textContent).replace(/^公正評語：/, '')
    };
  }

  function hydrateCard(card) {
    if (card.dataset.hydrated) return card;
    const section = card.closest('section');
    const scoreNode = card.querySelector('.score');
    const score = Number.parseFloat(card.dataset.score || scoreNode?.textContent || '0');
    card.dataset.category ||= section?.querySelector('h2')?.textContent.trim() || '未分類';
    card.dataset.batch ||= '2026-09-20';
    card.dataset.score = Number.isFinite(score) ? score : 0;
    card.dataset.tags ||= JSON.stringify(tagsFor(card));
    card.dataset.leadGender ||= /女主|女性|母女|閨蜜|惡女/.test(card.textContent) ? '女主' : /男主|大叔|青年|縣令/.test(card.textContent) ? '男主' : '未明';
    card.classList.remove('high', 'mid', 'low');
    card.classList.add(scoreClass(Number(card.dataset.score)));
    scoreNode.innerHTML = `<small>${tier(Number(card.dataset.score))}</small><strong>${Number(card.dataset.score).toFixed(1)}</strong><em>/10</em>`;
    const meta = document.createElement('div');
    meta.className = 'card-meta';
    meta.dataset.meta = 'true';
    card.querySelector('.abstract')?.before(meta);
    const actions = document.createElement('div');
    actions.className = 'card-actions';
    const five = document.createElement('button');
    five.type = 'button'; five.className = 'card-generate'; five.textContent = '生成原創五集';
    five.addEventListener('click', () => generateDraft(card, 'five', five));
    const full = document.createElement('button');
    full.type = 'button'; full.className = 'card-generate full'; full.textContent = '生成原創全集';
    full.addEventListener('click', () => generateDraft(card, 'full', full));
    actions.append(five, full);
    card.append(actions);
    card.dataset.hydrated = 'true';
    cards.push(card);
    return card;
  }

  function updateMeta() {
    const batches = [...new Set(cards.map((card) => card.dataset.batch))].sort();
    const newest = batches.at(-1);
    rebuildBatchList();
    cards.forEach((card) => {
      const score = Number(card.dataset.score);
      card.dataset.age = card.dataset.batch === newest ? 'new' : 'old';
      const modelHot = card.dataset.hot === 'true';
      card.dataset.hot = modelHot || score >= 8.5 ? 'true' : 'false';
      const meta = card.querySelector('[data-meta="true"]');
      meta.innerHTML = `${card.dataset.age === 'new' ? '<span class="new">🆕 最新收錄</span>' : '<span class="old">舊資料</span>'}${card.dataset.hot === 'true' ? '<span class="hot">🔥 熱門題材</span>' : ''}${score < 7 ? '<span class="low">僅取元素</span>' : ''}`;
    });
    const average = cards.length ? cards.reduce((sum, card) => sum + Number(card.dataset.score), 0) / cards.length : 0;
    byId('stat-total').textContent = cards.length;
    byId('stat-average').textContent = average.toFixed(1);
    byId('stat-high').textContent = cards.filter((card) => Number(card.dataset.score) >= 8.5).length;
    byId('stat-batches').textContent = batches.length;
    const counts = Object.entries(CATEGORY_HELP).map(([name]) => `${name} ${cards.filter((card) => card.dataset.category === name).length} 本`).filter((item) => !item.endsWith(' 0 本'));
    byId('category-breakdown').textContent = counts.join(' · ') || '尚無分類資料';
  }

  function allCategories() { return [...new Set(cards.map((card) => card.dataset.category))].sort(); }
  function matchesFilter(card, filter) {
    if (filter === 'all') return true;
    if (filter === 'hot') return card.dataset.hot === 'true';
    if (filter === 'new' || filter === 'old') return card.dataset.age === filter;
    if (filter.startsWith('category:')) return card.dataset.category === filter.slice(9);
    if (filter.startsWith('facet:')) return tagsFor(card).includes(filter.slice(6));
    return true;
  }

  function rebuildTabs() {
    const root = byId('library-tabs');
    const definitions = [
      ['all', '全部小說'], ['hot', '🔥 熱門題材'], ['new', '🆕 最新收錄'], ['old', '舊資料'],
      ...allCategories().map((category) => [`category:${category}`, category]),
      ...FACETS.filter((facet) => cards.some((card) => tagsFor(card).includes(facet))).map((facet) => [`facet:${facet}`, facet])
    ];
    root.replaceChildren();
    definitions.forEach(([filter, label]) => {
      const button = document.createElement('button');
      button.type = 'button'; button.className = `tab${filter === activeFilter ? ' active' : ''}`;
      button.textContent = `${label} ${cards.filter((card) => matchesFilter(card, filter)).length}`;
      button.addEventListener('click', () => { activeFilter = filter; applyFilters(); });
      root.append(button);
    });
  }

  function applyFilters() {
    const query = byId('library-search').value.trim().toLocaleLowerCase();
    cards.forEach((card) => {
      const visible = matchesFilter(card, activeFilter) && card.textContent.toLocaleLowerCase().includes(query);
      card.classList.toggle('hidden-card', !visible);
    });
    document.querySelectorAll('main > section').forEach((section) => {
      section.hidden = !section.querySelector('.card:not(.hidden-card)');
    });
    rebuildTabs();
  }

  function cardForItem(item, batch, no) {
    const card = document.createElement('article');
    const score = Number(item.score) || 0;
    card.className = `card ${scoreClass(score)}`;
    card.dataset.category = plain(item.category) || '未分類';
    card.dataset.batch = batch.date;
    card.dataset.score = score;
    card.dataset.tags = JSON.stringify(Array.isArray(item.tags) ? item.tags.map(plain) : []);
    card.dataset.leadGender = plain(item.leadGender) || '未明';
    card.dataset.hot = item.hot ? 'true' : 'false';
    const top = document.createElement('div'); top.className = 'top';
    const number = document.createElement('span'); number.className = 'no'; number.textContent = no;
    const heading = document.createElement('h3');
    const link = document.createElement('a'); link.href = item.sourceUrl; link.target = '_blank'; link.rel = 'noopener'; link.textContent = plain(item.title);
    heading.append(link); top.append(number, heading);
    const scoreNode = document.createElement('span'); scoreNode.className = 'score'; scoreNode.textContent = score;
    const label = document.createElement('div'); label.className = 'label'; label.textContent = `${plain(item.platform)} · ${plain(item.audience)} · AI 難度：${plain(item.aiDifficulty)}`;
    const abstract = document.createElement('p'); abstract.className = 'abstract'; abstract.textContent = plain(item.summary);
    const verdict = document.createElement('p'); verdict.className = 'verdict';
    const bold = document.createElement('b'); bold.textContent = '公正評語：'; verdict.append(bold, document.createTextNode(plain(item.verdict)));
    card.append(scoreNode, top, label, abstract, verdict);
    return card;
  }

  function appendBatch(batch, persist = false) {
    const items = Array.isArray(batch.items) ? batch.items : [];
    const byCategory = new Map();
    items.forEach((item) => {
      const category = plain(item.category) || '未分類';
      if (!byCategory.has(category)) byCategory.set(category, []);
      byCategory.get(category).push(item);
    });
    let itemNumber = cards.length;
    [...byCategory].forEach(([category, entries]) => {
      const section = document.createElement('section');
      section.dataset.dynamicBatch = batch.date;
      const head = document.createElement('div'); head.className = 'section-head';
      const h2 = document.createElement('h2'); h2.textContent = category;
      const span = document.createElement('span'); span.textContent = `${batch.date} · ${CATEGORY_HELP[category] || '本批研究新增分類'}`;
      const grid = document.createElement('div'); grid.className = 'grid';
      head.append(h2, span); section.append(head, grid);
      entries.forEach((item) => grid.append(hydrateCard(cardForItem(item, batch, ++itemNumber))));
      document.querySelector('.footer').before(section);
    });
    if (persist) {
      const batches = stored(STORAGE_BATCHES, []).filter((old) => old.id !== batch.id);
      batches.push(batch); save(STORAGE_BATCHES, batches);
    }
    updateMeta(); rebuildTabs(); applyFilters();
  }

  function rebuildBatchList() {
    const root = document.querySelector('.batches');
    root.querySelectorAll('.batch, .batch-list').forEach((node) => node.remove());
    const list = document.createElement('div');
    list.className = 'batch-list';
    const base = document.createElement('div'); base.className = 'batch';
    base.innerHTML = '<b>批次 01 · 2026-09-20</b><span>30 本｜既有資料，採樣 YT 趨勢後建立。</span>';
    list.append(base);
    stored(STORAGE_BATCHES, []).sort((a, b) => String(b.date).localeCompare(String(a.date))).forEach((batch, index) => {
      const row = document.createElement('div'); row.className = 'batch';
      const title = document.createElement('b'); title.textContent = `批次 ${String(index + 2).padStart(2, '0')} · ${batch.date}`;
      const text = document.createElement('span'); text.textContent = `${batch.items.length} 本｜${plain(batch.batchConclusion)}`;
      row.append(title, text); list.append(row);
    });
    const breakdown = document.createElement('div'); breakdown.className = 'batch';
    breakdown.innerHTML = '<b>分類分布</b><span id="category-breakdown">計算中…</span>';
    list.append(breakdown);
    root.append(list);
  }

  function refreshTrend(batch) {
    const snapshot = batch.trendSnapshot || {};
    const panel = document.querySelector('.trend');
    const heading = panel.querySelector('h2');
    const sub = panel.querySelector('.sub');
    panel.querySelectorAll('.signal').forEach((node) => node.remove());
    sub.textContent = `${snapshot.date || batch.date} · YouTube 公開搜尋抽樣，不是全站排行榜`;
    (snapshot.signals || []).slice(0, 8).forEach((signal) => {
      const row = document.createElement('div'); row.className = 'signal';
      const topic = document.createElement('b'); topic.textContent = plain(signal.topic);
      const text = document.createElement('span');
      const info = [plain(signal.title), plain(signal.channel), plain(signal.views), plain(signal.published)].filter(Boolean).join('｜');
      if (signal.url) { const link = document.createElement('a'); link.href = signal.url; link.target = '_blank'; link.rel = 'noopener'; link.textContent = info || '查看公開案例'; text.append(link); }
      else text.textContent = info;
      if (signal.observation) text.append(document.createTextNode(`：${plain(signal.observation)}`));
      row.append(topic, text); panel.append(row);
    });
    heading.textContent = '最新 YT 趨勢快照';
  }

  async function findSixty(button) {
    setBusy(button, true, '正在查 YT 趨勢與 60 本小說…');
    notify('先查 YouTube 公開趨勢，再查番茄／七貓公開作品頁；這次約需 1–3 分鐘。');
    try {
      const result = await api('/api/research');
      const now = new Date();
      const batch = { id: crypto.randomUUID(), date: result.trendSnapshot?.date || now.toISOString().slice(0, 10), createdAt: now.toISOString(), ...result };
      appendBatch(batch, true); refreshTrend(batch);
      activeFilter = 'new'; applyFilters();
      notify(`完成：已新增 ${batch.items.length} 本，並切換到「最新收錄」。`);
    } catch (error) { notify(error.message || '找小說失敗。', true); }
    finally { setBusy(button, false); }
  }

  async function generateDraft(card, mode, button) {
    setBusy(button, true, mode === 'full' ? '正在生成原創全集…' : '正在生成原創五集…');
    notify(mode === 'full' ? '正在生成完整 20 集原創短劇，可能需要幾分鐘。' : '正在生成可閱讀的原創五集。');
    try {
      const draft = await api('/api/generate', { mode, source: sourceFromCard(card) });
      const drafts = stored(STORAGE_DRAFTS, {}); drafts[draft.id] = draft; save(STORAGE_DRAFTS, drafts);
      window.location.href = `原創短劇稿.html?draft=${encodeURIComponent(draft.id)}`;
    } catch (error) { notify(error.message || '生成失敗。', true); setBusy(button, false); }
  }

  function restoreSavedBatches() {
    stored(STORAGE_BATCHES, []).sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt))).forEach((batch) => appendBatch(batch, false));
  }

  document.querySelectorAll('.card').forEach(hydrateCard);
  updateMeta();
  restoreSavedBatches();
  byId('library-search').addEventListener('input', applyFilters);
  byId('find-sixty').addEventListener('click', (event) => findSixty(event.currentTarget));
  byId('api-settings').addEventListener('click', setApiBase);
  rebuildTabs(); applyFilters();
})();

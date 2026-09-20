const JSON_HEADERS = { 'content-type': 'application/json; charset=UTF-8' };

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = env.ALLOWED_ORIGIN || '';
  if (!origin || !allowed || origin === allowed) {
    return {
      'access-control-allow-origin': origin || allowed || '*',
      'access-control-allow-headers': 'content-type, x-dashboard-key',
      'access-control-allow-methods': 'GET, POST, OPTIONS',
      vary: 'Origin'
    };
  }
  return {};
}

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), { status, headers: { ...JSON_HEADERS, ...extraHeaders } });
}

function outputText(response) {
  if (typeof response.output_text === 'string' && response.output_text.trim()) return response.output_text.trim();
  return (response.output || []).flatMap((item) => item.content || [])
    .filter((content) => content.type === 'output_text' || content.type === 'text')
    .map((content) => content.text || '')
    .join('\n')
    .trim();
}

function parseJson(text) {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('模型沒有回傳可讀取的 JSON。');
  return JSON.parse(trimmed.slice(start, end + 1));
}

function cleanText(value, max = 8000) {
  return String(value || '').replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

function requireAccess(request, env) {
  return Boolean(env.DASHBOARD_ACCESS_KEY) && request.headers.get('x-dashboard-key') === env.DASHBOARD_ACCESS_KEY;
}

async function readStore(env, key, fallback) {
  if (!env.NOVEL_STORE) return fallback;
  const value = await env.NOVEL_STORE.get(key, 'json');
  return value ?? fallback;
}

async function writeStore(env, key, value) {
  if (env.NOVEL_STORE) await env.NOVEL_STORE.put(key, JSON.stringify(value));
}

async function callOpenAI(env, input, { web = false, maxOutputTokens = 12000 } = {}) {
  if (!env.OPENAI_API_KEY) throw new Error('尚未設定 OPENAI_API_KEY。');
  const payload = {
    model: env.OPENAI_MODEL || 'gpt-5-mini',
    input,
    max_output_tokens: maxOutputTokens,
    store: false
  };
  if (web) payload.tools = [{ type: 'web_search' }];
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.OPENAI_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body?.error?.message || 'OpenAI 請求失敗。');
  const text = outputText(body);
  if (!text) throw new Error('模型沒有產生內容。');
  return text;
}

function researchPrompt() {
  return `你是繁體中文的網路小說短劇選題研究員。今天先使用網路搜尋，查核 YouTube 上中文 AI 短劇／爽文故事的公開趨勢，再找番茄小說與七貓小說「公開作品頁」的候選作品。\n\n工作規格：\n1. 先查 YouTube：古今互通／物資、系統／逆襲、女主／流放／經營、商業／投資、透視眼／鑑寶、機甲／星際。挑 4–8 個有公開觀看數與發佈時間的近期例子；這只是抽樣，不得宣稱全站排行榜。\n2. 再找剛好 60 本候選小說，六組各 10 本：古今互通／資源經營、系統／重生／末日逆襲、商業／投資／職場創業、透視眼／鑑寶／賭石超能力、機甲／星際／軍工科技、大女主／流放／懸疑泛受眾。優先番茄與七貓公開作品頁。\n3. 每本必須是可公開查到的作品；沒有可靠作品頁 URL 的不要編造。摘要只限公開簡介的高層次轉述，絕不重現章節、角色關係或具體事件序列。\n4. 以 YouTube 短劇角度公正評分 0–10，評估前 30 秒鉤子、持續回報、情緒回報、縮圖可懂性、Pippit 製作難度與撞題風險。要明確說出風險；分數不保證爆紅。\n5. 回傳純 JSON，不要 Markdown、不要程式碼區塊。JSON 結構必須完全符合：\n{\n  "trendSnapshot": {"date":"YYYY-MM-DD","conclusion":"...","signals":[{"topic":"...","title":"...","channel":"...","views":"...","published":"...","url":"...","observation":"..."}]},\n  "items":[{"title":"...","sourceUrl":"https://...","platform":"番茄|七貓","category":"...","tags":["..."],"leadGender":"男主|女主|雙主角|未明","audience":"...","aiDifficulty":"低|中|高","summary":"...","score":8.2,"verdict":"...","hot":true}],\n  "batchConclusion":"..."\n}\nitems 必須剛好 60 筆，sourceUrl 只能是 fanqienovel.com 或 qimao.com 網域。`;
}

function generationPrompt(source, mode) {
  const scope = mode === 'full'
    ? '寫出第一季完整 20 集短劇稿；每集約 500–800 字，含集名、開場鉤子、核心衝突、明確轉折、結尾懸念。'
    : '寫出可直接閱讀的前 5 集短劇稿；每集約 650–900 字，含集名、開場鉤子、核心衝突、關鍵動作或對話、結尾懸念。';
  return `你是繁體中文短劇編劇。依下列「題材評估訊號」創作一部可商用、完全獨立原創的短劇。\n\n題材評估訊號（不可抄寫、不可延續、不可映射）：\n- 原作品標題：${cleanText(source.title, 180)}\n- 類別：${cleanText(source.category, 120)}\n- 公開摘要：${cleanText(source.summary, 500)}\n- 評估：${cleanText(source.verdict, 500)}\n- 標籤：${(source.tags || []).map((tag) => cleanText(tag, 40)).join('、')}\n\n硬性版權規則：這些資料只能告訴你「類型可能有效」，不可使用原作書名、人名、角色關係、特有道具、世界規則、具體事件、事件順序、反派、場景或結局。請先自行另創高概念、角色、道具規則與衝突鏈，避免讓人聯想到原作。\n\n${scope}\n要求：節奏適合 60–90 秒短集；第一集 10 秒內丟出危機；每集至少一個可視覺化爽點；控制 2–5 名固定核心角色與可重複場景；避免大規模戰爭與昂貴特效，除非題材必要且能用有限場景呈現。\n\n請用純文字回覆，格式為：\n# 原創劇名\n## 高概念\n## 角色與規則\n## 第 1 集：集名\n（完整可讀劇稿）\n...\n最後加上 ## 第一季主線與結局。`;
}

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request, env);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    const url = new URL(request.url);
    if (url.pathname === '/api/health') return json({ ok: true, model: env.OPENAI_MODEL || 'gpt-5-mini', persistentStore: Boolean(env.NOVEL_STORE) }, 200, cors);
    if (!url.pathname.startsWith('/api/')) return json({ error: 'Not found' }, 404, cors);
    if (!requireAccess(request, env)) return json({ error: '未授權。請先設定 Dashboard Access Key。' }, 401, cors);
    if (request.method === 'GET' && url.pathname === '/api/library') {
      return json({ batches: await readStore(env, 'batches', []) }, 200, cors);
    }
    if (request.method === 'GET' && url.pathname.startsWith('/api/drafts/')) {
      const draft = await readStore(env, `draft:${url.pathname.slice('/api/drafts/'.length)}`, null);
      return draft ? json(draft, 200, cors) : json({ error: '找不到草稿。' }, 404, cors);
    }
    if (request.method !== 'POST') return json({ error: '只接受 POST。' }, 405, cors);
    try {
      if (url.pathname === '/api/research') {
        const content = await callOpenAI(env, researchPrompt(), { web: true, maxOutputTokens: 26000 });
        const result = parseJson(content);
        if (!Array.isArray(result.items) || result.items.length !== 60) throw new Error('研究結果不是剛好 60 本，請重新執行。');
        const batch = { id: crypto.randomUUID(), date: result.trendSnapshot?.date || new Date().toISOString().slice(0, 10), createdAt: new Date().toISOString(), ...result };
        const batches = await readStore(env, 'batches', []);
        await writeStore(env, 'batches', [...batches, batch]);
        return json(batch, 200, cors);
      }
      if (url.pathname === '/api/generate') {
        const body = await request.json();
        const mode = body?.mode === 'full' ? 'full' : 'five';
        const source = body?.source || {};
        if (!source.title || !source.category) return json({ error: '缺少選題資料。' }, 400, cors);
        const content = await callOpenAI(env, generationPrompt(source, mode), { maxOutputTokens: mode === 'full' ? 30000 : 10000 });
        const title = (content.match(/^#\s+(.+)$/m) || [])[1] || '未命名原創短劇';
        const draft = { id: crypto.randomUUID(), mode, title: cleanText(title, 120), content, createdAt: new Date().toISOString() };
        await writeStore(env, `draft:${draft.id}`, draft);
        return json(draft, 200, cors);
      }
      return json({ error: 'Not found' }, 404, cors);
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : '服務暫時失敗。' }, 500, cors);
    }
  }
};

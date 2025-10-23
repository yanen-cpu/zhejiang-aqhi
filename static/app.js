const LEVEL_TO_CLASS = {
  "绿色": "lvl-green",
  "蓝色": "lvl-blue",
  "黄色": "lvl-yellow",
  "红色": "lvl-red",
};

function api(path){
  const base = (window.AQHI_API_BASE || localStorage.getItem('AQHI_API_BASE') || '').replace(/\/$/, '');
  return base + path;
}

// 当站点未配置 /api/* 路由时，自动回退到 workers.dev，避免用户手动设置
const DEFAULT_WORKER_BASE = 'https://zj-aqhi-worker.1779939926.workers.dev';

async function fetchWithFallback(urlPath, options){
  const primary = api(urlPath);
  try {
    const r = await fetch(primary, options);
    if (r && r.ok) return r;
    // 若 base 为空或 primary 失败，回退到 workers.dev
  } catch(_) {}
  try {
    const r2 = await fetch(DEFAULT_WORKER_BASE.replace(/\/$/, '') + urlPath, options);
    return r2;
  } catch (e) {
    throw e;
  }
}

async function fetchMeta() {
  try {
    const res = await fetchWithFallback('/api/meta');
    if (!res.ok) throw new Error('meta failed');
    return await res.json();
  } catch { return null; }
}

async function updateDataSourceLabel() {
  const el = document.getElementById('ds-text-home');
  if (!el) return;
  const meta = await fetchMeta();
  const ds = (meta && meta.data_source) ? String(meta.data_source).toLowerCase() : 'unknown';
  const map = { mock: '演示 Mock', custom: '自定义', cnemc: 'CNEMC 官方' };
  el.textContent = map[ds] || ds;
}

async function fetchAll() {
  const res = await fetchWithFallback('/api/aqhi-all');
  if (!res.ok) throw new Error('API 请求失败');
  return await res.json();
}

function render(cards) {
  const grid = document.getElementById('grid');
  grid.innerHTML = '';
  for (const c of cards) {
    const lvlClass = LEVEL_TO_CLASS[c.color] || '';
    const aqhiText = c.aqhi == null ? '--' : c.aqhi.toFixed(1);
    const levelText = c.level || '无数据';
    const advice = c.advice || '暂无建议（等待足够数据）';

    const div = document.createElement('div');
    div.className = `card ${lvlClass}`;
    div.innerHTML = `
      <div class="title">
        <div class="city">${c.city}</div>
        <div class="badge">${levelText}</div>
      </div>
      <div class="value">${aqhiText}</div>
      <div class="meta">近3小时平均 | ER=${c.er_total ?? '--'}</div>
      <div class="advice">${advice}</div>
    `;
    grid.appendChild(div);
  }
}

async function tick() {
  try {
    const data = await fetchAll();
    render(data);
  } catch (e) {
    console.error(e);
  }
}

setInterval(tick, 60 * 1000);
window.addEventListener('load', () => { tick(); updateDataSourceLabel(); });

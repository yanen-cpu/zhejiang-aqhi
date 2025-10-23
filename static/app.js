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

async function fetchAll() {
  const res = await fetch(api('/api/aqhi-all'));
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
window.addEventListener('load', tick);

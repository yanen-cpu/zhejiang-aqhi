// 浙江 AQHI · 百度地图版（无需本地 GeoJSON）
// 通过 BMapGL.Boundary 按城市名称抓取行政边界，并按 AQHI 设色

// ---- 配置 ----
const ZJ_CITIES = [
  '杭州','宁波','温州','嘉兴','湖州','绍兴','金华','衢州','舟山','台州','丽水'
];

// AQHI 配色（可按需与现有 map.js 对齐）
function colorByAQHI(v){
  if (v == null) return '#ccc';
  if (v < 1) return '#8dd3c7';
  if (v < 2) return '#80b1d3';
  if (v < 3) return '#bebada';
  if (v < 4) return '#fdb462';
  if (v < 5) return '#fb8072';
  if (v < 6) return '#b3de69';
  return '#d9d9d9';
}

// ---- Banner ----
function showBanner(msg){
  const el = document.getElementById('map-banner');
  if (!el) return;
  el.style.display = 'block';
  el.textContent = msg;
}

// ---- 初始化地图 ----
if (!(window.BMapGL && BMapGL.Map)){
  showBanner('百度地图 SDK 未加载。请检查 AK 是否正确、域名是否加入白名单，以及网络是否可访问 api.map.baidu.com。');
  // 不再继续执行，以免后续报错
  throw new Error('BMapGL SDK not loaded');
}

const map = new BMapGL.Map('map', { enableBizAuth: false });
const center = new BMapGL.Point(120.1551, 30.2741); // 杭州
map.centerAndZoom(center, 8);
map.enableScrollWheelZoom(true);
map.setDisplayOptions({ skyColors: ['#87CEFA', '#ffffff'] });

// ---- 工具：localStorage 缓存 ----
function cacheGet(key){
  try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
}
function cacheSet(key, value){
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

// ---- 抓取某市行政边界（返回若干段边界折线，每段为“lng,lat;lng,lat;...”字符串）----
function fetchBoundaryStrings(city){
  const cacheKey = `BMAP_BOUNDARY_${city}`;
  const cached = cacheGet(cacheKey);
  if (cached && Array.isArray(cached) && cached.length) {
    return Promise.resolve(cached);
  }

  return new Promise((resolve, reject) => {
    try {
      const bd = new BMapGL.Boundary();
      // 在省内检索该地级市：例如“杭州市”
      let settled = false;
      const timer = setTimeout(() => {
        if (!settled){
          settled = true;
          reject(new Error(`获取 ${city} 边界超时`));
        }
      }, 12000);
      bd.get(`${city}市`, res => {
        if (settled) return;
        clearTimeout(timer);
        settled = true;
        if (res && Array.isArray(res.boundaries) && res.boundaries.length) {
          cacheSet(cacheKey, res.boundaries);
          resolve(res.boundaries);
        } else {
          reject(new Error(`未获取到 ${city} 边界`));
        }
      });
    } catch (e) {
      reject(e);
    }
  });
}

// ---- 将边界字符串解析为点集数组 ----
function parseBoundaryToRings(boundaryStr){
  // 边界字符串形如："lng,lat;lng,lat;..."
  const pts = boundaryStr.split(';').filter(Boolean).map(pair => {
    const [lngStr, latStr] = pair.split(',');
    const lng = parseFloat(lngStr), lat = parseFloat(latStr);
    return new BMapGL.Point(lng, lat);
  });
  return pts;
}

// ---- 绘制某市多边形并返回所有点，用于 setViewport ----
function drawCityPolygon(city, aqhiValue){
  const fill = colorByAQHI(aqhiValue);
  return fetchBoundaryStrings(city).then(boundaries => {
    const allPts = [];
    boundaries.forEach(bstr => {
      const ring = parseBoundaryToRings(bstr);
      if (ring.length) {
        const polygon = new BMapGL.Polygon(ring, {
          strokeColor: '#555', strokeWeight: 1, strokeOpacity: 0.7,
          fillColor: fill, fillOpacity: 0.6
        });
        polygon.addEventListener('mouseover', () => {
          polygon.setFillOpacity(0.85);
          map.setDefaultCursor(`${city}：AQHI ${aqhiValue ?? '—'}`);
        });
        polygon.addEventListener('mouseout', () => {
          polygon.setFillOpacity(0.6);
          map.setDefaultCursor('default');
        });
        map.addOverlay(polygon);
        allPts.push(...ring);
      }
    });
    return allPts;
  });
}

// ---- 图例 ----
function renderLegend(){
  const legend = document.getElementById('legend');
  const breaks = [0,1,2,3,4,5,6];
  legend.innerHTML = breaks.map((b,i) => {
    const v = i < breaks.length-1 ? `${breaks[i]} - ${breaks[i+1]}` : `${breaks[i]}+`;
    return `<div class="item"><span class="swatch" style="background:${colorByAQHI(b)}"></span>${v}</div>`;
  }).join('');
}

renderLegend();

// ---- API 访问（与旧版 map.js 一致的回退）----
function api(path){
  const base = (window.AQHI_API_BASE || localStorage.getItem('AQHI_API_BASE') || '').replace(/\/$/, '');
  return base + path;
}
const DEFAULT_WORKER_BASE = 'https://zj-aqhi-worker.1779939926.workers.dev';
async function fetchWithFallback(urlPath, options){
  const primary = api(urlPath);
  try {
    if (primary) {
      const r = await fetch(primary, options);
      if (r && r.ok) return r;
    }
  } catch(_) {}
  try {
    const r2 = await fetch(DEFAULT_WORKER_BASE.replace(/\/$/, '') + urlPath, options);
    return r2;
  } catch (e) { throw e; }
}

async function fetchMeta(){
  try{
    const res = await fetchWithFallback('/api/meta');
    if(!res.ok) throw new Error('meta failed');
    return await res.json();
  }catch{ return null; }
}
async function updateDataSourceLabel(){
  const el = document.getElementById('ds-text-map');
  if(!el) return;
  const meta = await fetchMeta();
  const ds = (meta && meta.data_source) ? String(meta.data_source).toLowerCase() : 'unknown';
  const mapName = { mock: '演示 Mock', custom: '自定义', cnemc: 'CNEMC 官方' };
  el.textContent = mapName[ds] || ds;
}

// ---- 主流程：加载 AQHI → 按市绘制 ----
fetchWithFallback('/api/aqhi-all')
  .then(r => r.json())
  .then(list => {
    const aqhiByCity = {};
    for (const item of list) {
      // 期望 item.city 为中文市名（不带“市”）
      aqhiByCity[item.city] = item.aqhi;
    }

    // 逐市绘制，并收集所有点以适配视图
    const tasks = ZJ_CITIES.map(name => drawCityPolygon(name, aqhiByCity[name]));
    return Promise.allSettled(tasks).then(results => {
      const allPts = [];
      results.forEach(r => { if (r.status === 'fulfilled' && Array.isArray(r.value)) allPts.push(...r.value); });
      if (allPts.length) {
        try { map.setViewport(allPts); } catch {}
      }
    });
    updateDataSourceLabel();
  })
  .catch(err => {
    console.error('加载 AQHI 或绘制失败：', err);
    showBanner('加载失败：' + (err && err.message ? err.message : err));
  });

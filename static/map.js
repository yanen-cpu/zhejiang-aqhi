// 城市经纬度（WGS84），用于在地图上定位圆标
const CITY_COORDS = {
  "杭州": [30.2741, 120.1551],
  "宁波": [29.8683, 121.5440],
  "温州": [27.9949, 120.6993],
  "嘉兴": [30.7450, 120.7555],
  "湖州": [30.8943, 120.0868],
  "绍兴": [30.0303, 120.5802],
  "金华": [29.0791, 119.6474],
  "衢州": [28.9701, 118.8595],
  "舟山": [29.9853, 122.2078],
  "台州": [28.6583, 121.4140],
  "丽水": [28.4676, 119.9229],
};

const LEVEL_COLOR = {
  "绿色": "#16a34a",
  "蓝色": "#2563eb",
  "黄色": "#eab308",
  "红色": "#ef4444",
};

let map;
let markers = {};
let debugInfo = { leaflet:false, api:false, count:0 };
let leafletReady = false;

function colorFor(level){
  return LEVEL_COLOR[level] || "#94a3b8";
}

function radiusFor(aqhi){
  if (aqhi == null) return 8;
  return Math.max(8, Math.min(26, 8 + aqhi * 1.6));
}

function showBanner(msg){
  const el = document.getElementById('map-banner');
  if (!el) return;
  el.style.display = 'block';
  el.textContent = msg;
}

function initMap(){
  if (!(window.L && L.map)){
    showBanner('地图库未加载成功（Leaflet）。请检查网络或稍后重试。');
    debugInfo.leaflet = false;
    return;
  }
  debugInfo.leaflet = true;
  leafletReady = true;
  map = L.map('map').setView([29.2, 120.3], 8);
  const osm = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);
  osm.on('tileerror', () => {
    showBanner('底图瓦片加载失败，可能是网络问题。AQHI 站点仍可用，但无法显示地理底图。');
  });
  // 尝试加载边界（如存在）
  loadBoundaries().catch(()=>{});

  // 图例
  const legend = L.control({position:'bottomleft'});
  legend.onAdd = function(){
    const div = L.DomUtil.create('div', 'legend');
    div.innerHTML = `
      <div class="legend-row"><span class="dot" style="background:#16a34a"></span> 绿色（一级）</div>
      <div class="legend-row"><span class="dot" style="background:#2563eb"></span> 蓝色（二级）</div>
      <div class="legend-row"><span class="dot" style="background:#eab308"></span> 黄色（三级）</div>
      <div class="legend-row"><span class="dot" style="background:#ef4444"></span> 红色（四级）</div>
    `;
    return div;
  };
  legend.addTo(map);
}

function api(path){
  const base = (window.AQHI_API_BASE || localStorage.getItem('AQHI_API_BASE') || '').replace(/\/$/, '');
  return base + path;
}

async function fetchMeta(){
  try{
    const res = await fetch(api('/api/meta'));
    if(!res.ok) throw new Error('meta failed');
    return await res.json();
  }catch{ return null; }
}

async function updateDataSourceLabel(){
  const el = document.getElementById('ds-text-map');
  if(!el) return;
  const meta = await fetchMeta();
  const ds = (meta && meta.data_source) ? String(meta.data_source).toLowerCase() : 'unknown';
  const map = { mock: '演示 Mock', custom: '自定义', cnemc: 'CNEMC 官方' };
  el.textContent = map[ds] || ds;
}

async function fetchAll(){
  const res = await fetch(api('/api/aqhi-all'));
  if(!res.ok) throw new Error('API 请求失败');
  const data = await res.json();
  debugInfo.api = true;
  debugInfo.count = Array.isArray(data) ? data.length : 0;
  updateDebug();
  return data;
}

function upsertMarker(city, info){
  if (!leafletReady || !window.L || !map) return;
  const coord = CITY_COORDS[city];
  if(!coord) return;
  const color = colorFor(info.color);
  const radius = radiusFor(info.aqhi);

  const popupHtml = `
    <div style="font-weight:600;margin-bottom:4px">${city}</div>
    <div>AQHI：${info.aqhi == null ? '--' : info.aqhi.toFixed(1)}（${info.level || '无级别'}）</div>
    <div>ER：${info.er_total ?? '--'}</div>
    <div style="margin-top:6px;white-space:pre-wrap;max-width:240px">${info.advice || '暂无建议'}</div>
  `;

  if(markers[city]){
    markers[city].setStyle({color, fillColor: color, radius});
    markers[city].setPopupContent(popupHtml);
  } else {
    const circle = L.circleMarker(coord, {
      radius,
      color,
      weight: 2,
      fillColor: color,
      fillOpacity: 0.35,
    }).addTo(map);
    circle.bindPopup(popupHtml);
    circle.on('mouseover', () => circle.openPopup());
    markers[city] = circle;

    // 城市名标签
    const label = L.marker(coord, {
      icon: L.divIcon({
        className: 'city-label',
        html: `<div style="color:#e2e8f0;text-shadow:0 1px 2px #000;font-size:12px">${city}</div>`,
        iconSize: [0,0],
      }),
      interactive: false
    }).addTo(map);
  }
}

async function tick(){
  try{
    const data = await fetchAll();
    if (leafletReady && window.L && map){
      for(const info of data){
        upsertMarker(info.city, info);
      }
      // 若边界存在，更新区域着色
      updateBoundaryStyle(data);
    } else {
  showBanner('地图库未就绪，已获取数据但无法绘制。请检查 /vendor/leaflet/leaflet.js 与 /vendor/leaflet/leaflet.css 是否可用。');
    }
  }catch(e){
    console.error(e);
    showBanner('数据获取失败：' + (e && e.message ? e.message : e));
  }
}

window.addEventListener('load', () => {
  initMap();
  updateDataSourceLabel();
  tick();
  setInterval(tick, 60*1000);
});

function updateDebug(){
  console.log('[AQHI-Map] debug:', JSON.stringify(debugInfo));
  const el = document.getElementById('map-banner');
  if(!el) return;
  // 若已显示其他重要提示，不覆盖
  if(el.style.display !== 'block'){
    el.style.display = 'block';
    el.textContent = `Leaflet: ${debugInfo.leaflet ? 'OK' : 'FAIL'} | API: ${debugInfo.api ? 'OK' : 'WAIT'} | Cities: ${debugInfo.count}`;
  }
}

// ---------- GeoJSON 行政边界（可选） ----------
let boundaryLayer = null;
let lastCityAqhi = {};

function pickCityName(props){
  if(!props) return undefined;
  return props.name || props.NAME || props.NAME99 || props.NAME_99 || props.city || props.City || props.CITY;
}

// 常见别名/拼音 -> 中文标准名
const CITY_NAME_ALIASES = {
  '杭州市': '杭州', 'Hangzhou': '杭州', 'HANGZHOU': '杭州',
  '宁波市': '宁波', 'Ningbo': '宁波', 'NINGBO': '宁波',
  '温州市': '温州', 'Wenzhou': '温州', 'WENZHOU': '温州',
  '嘉兴市': '嘉兴', 'Jiaxing': '嘉兴', 'JIAXING': '嘉兴',
  '湖州市': '湖州', 'Huzhou': '湖州', 'HUZHOU': '湖州',
  '绍兴市': '绍兴', 'Shaoxing': '绍兴', 'SHAOXING': '绍兴',
  '金华市': '金华', 'Jinhua': '金华', 'JINHUA': '金华',
  '衢州市': '衢州', 'Quzhou': '衢州', 'QUZHOU': '衢州',
  '舟山市': '舟山', 'Zhoushan': '舟山', 'ZHOUSHAN': '舟山',
  '台州市': '台州', 'Taizhou': '台州', 'TAIZHOU': '台州',
  '丽水市': '丽水', 'Lishui': '丽水', 'LISHUI': '丽水',
};

function normalizeCityName(raw){
  if(!raw) return raw;
  const s = String(raw).trim();
  if (CITY_NAME_ALIASES[s]) return CITY_NAME_ALIASES[s];
  // 去掉尾部“市”再匹配
  const noShi = s.endsWith('市') ? s.slice(0, -1) : s;
  if (CITY_NAME_ALIASES[noShi]) return CITY_NAME_ALIASES[noShi];
  return noShi;
}

async function loadBoundaries(){
  try{
    const res = await fetch('/geo/zhejiang_cities.geo.json', {cache:'no-store'});
    if(!res.ok) return; // 文件不存在则跳过
    const gj = await res.json();
    const style = (feature)=>{
      const name = normalizeCityName(pickCityName(feature && feature.properties));
      const color = colorFor(levelForCity(name));
      return { color: '#334155', weight: 1, fillColor: color, fillOpacity: 0.25 };
    };
    boundaryLayer = L.geoJSON(gj, { style }).addTo(map);
    try{ map.fitBounds(boundaryLayer.getBounds(), {padding:[20,20]}); }catch(_){}
  }catch(e){
    console.warn('边界加载失败', e);
  }
}

function levelForCity(city){
  const info = lastCityAqhi[normalizeCityName(city)];
  return info && info.level ? info.level : null;
}

function updateBoundaryStyle(data){
  if(!boundaryLayer || !data) return;
  lastCityAqhi = {};
  for(const item of data){
    lastCityAqhi[normalizeCityName(item.city)] = item;
  }
  boundaryLayer.setStyle(feature => {
    const name = normalizeCityName(pickCityName(feature && feature.properties));
    const color = colorFor(levelForCity(name));
    return { color: '#334155', weight: 1, fillColor: color, fillOpacity: 0.25 };
  });
}

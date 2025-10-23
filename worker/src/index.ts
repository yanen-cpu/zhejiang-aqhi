import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { CITIES, City, floorToHour, hourEpoch, shanghaiNow } from './config';
import { ADVICE_MAP, calculateERComponents, getAQHI } from './aqhi';
import { MockDataSource } from './datasource/mock';

type Bindings = {
  AQHI_DB: any; // D1Database
  DATA_SOURCE?: string;
};

function getDataSource(env: Bindings) {
  const type = (env.DATA_SOURCE || 'mock').toLowerCase();
  switch (type) {
    case 'mock':
    default:
      return new MockDataSource();
  }
}

async function insertOrUpdate(db: any, m: { city: City; ts_hour: number; pm25: number; o3: number; no2: number; so2: number; }) {
  const sql = `INSERT INTO measurements (city, ts_hour, pm25, o3, no2, so2)
              VALUES (?1, ?2, ?3, ?4, ?5, ?6)
              ON CONFLICT(city, ts_hour) DO UPDATE SET pm25=excluded.pm25, o3=excluded.o3, no2=excluded.no2, so2=excluded.so2`;
  await db.prepare(sql).bind(m.city, m.ts_hour, m.pm25, m.o3, m.no2, m.so2).run();
}

async function ensureSchema(db: any) {
  await db.exec(`CREATE TABLE IF NOT EXISTS measurements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    city TEXT NOT NULL,
    ts_hour INTEGER NOT NULL,
    pm25 REAL NOT NULL,
    o3 REAL NOT NULL,
    no2 REAL NOT NULL,
    so2 REAL NOT NULL,
    UNIQUE(city, ts_hour)
  );
  CREATE INDEX IF NOT EXISTS idx_measurements_city_ts ON measurements(city, ts_hour);`);
}

async function fetchOnceAll(env: Bindings) {
  const ds = getDataSource(env);
  const nowHour = floorToHour(shanghaiNow());
  const tsHour = hourEpoch(nowHour);
  for (const city of CITIES) {
    const m = await ds.fetchCurrent(city);
    // 强制 ts_hour 为当前整点，避免不同数据源偏移
    m.ts_hour = tsHour;
    await insertOrUpdate(env.AQHI_DB, m);
  }
}

async function coldStartEnsure(env: Bindings) {
  // 若当前整点没有任何数据，且是 mock 模式，则抓取一次，避免前端显示 "--"
  const nowHour = floorToHour(shanghaiNow());
  const tsHour = hourEpoch(nowHour);
  const r = await env.AQHI_DB.prepare("SELECT COUNT(*) as c FROM measurements WHERE ts_hour = ?1").bind(tsHour).first();
  const count = r && typeof r.c !== 'undefined' ? Number(r.c) : 0;
  if (count === 0) {
    if ((env.DATA_SOURCE || 'mock').toLowerCase() === 'mock') {
      await fetchOnceAll(env);
    }
  }
}

async function getCityWindow(env: Bindings, city: City) {
  const endHour = hourEpoch(floorToHour(shanghaiNow()));
  const startHour = endHour - 2 * 3600;
  const stmt = env.AQHI_DB.prepare(`SELECT AVG(pm25) as apm25, AVG(o3) as ao3, AVG(no2) as ano2, AVG(so2) as aso2, COUNT(*) as cnt
    FROM measurements WHERE city = ?1 AND ts_hour BETWEEN ?2 AND ?3`);
  const row: any = await stmt.bind(city, startHour, endHour).first();
  if (!row || !row.cnt) {
    return {
      city,
      aqhi: null,
      level: null,
      color: null,
      advice: null,
      window_hours: 3,
      available_points: 0,
    } as const;
  }
  const pm25 = Number(row.apm25);
  const o3 = Number(row.ao3);
  const no2 = Number(row.ano2);
  const so2 = Number(row.aso2);
  const [erComps, erTotal] = calculateERComponents(pm25, o3, so2, no2);
  const [aqhi, level, color] = getAQHI(erTotal);
  const advice = level ? ADVICE_MAP[level] ?? null : null;
  return {
    city,
    aqhi: aqhi == null ? null : Math.round(aqhi * 10) / 10,
    level,
    color,
    advice,
    er_total: Math.round(erTotal * 100) / 100,
    er_components: Object.fromEntries(Object.entries(erComps).map(([k, v]) => [k, Math.round(v * 100) / 100])),
    avg: { pm25, o3, no2, so2 },
    window_hours: 3,
    available_points: row.cnt | 0,
  };
}

async function getHistory(env: Bindings, city: City, hours: number) {
  const endHour = hourEpoch(floorToHour(shanghaiNow()));
  const startHour = endHour - (hours - 1) * 3600;
  const rows: any = await env.AQHI_DB.prepare(
    `SELECT ts_hour, pm25, o3, no2, so2 FROM measurements
     WHERE city = ?1 AND ts_hour BETWEEN ?2 AND ?3
     ORDER BY ts_hour ASC`
  ).bind(city, startHour, startHour + (hours - 1) * 3600).all();
  const series = rows.results?.map((r: any) => ({
    ts: new Date(r.ts_hour * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z'),
    pm25: r.pm25,
    o3: r.o3,
    no2: r.no2,
    so2: r.so2,
  })) ?? [];
  return { city, series };
}

const app = new Hono<{ Bindings: Bindings }>();

// CORS（默认允许所有来源；可改为指定域名）
app.use('/api/*', cors({ origin: '*', allowMethods: ['GET', 'OPTIONS'] }));

// 健康检查
app.get('/api/health', (c: any) => c.json({ ok: true }));

// 列出城市
app.get('/api/cities', async (c: any) => {
  await ensureSchema(c.env.AQHI_DB);
  await coldStartEnsure(c.env);
  return c.json(CITIES);
});

// 单城市 AQHI
app.get('/api/aqhi', async (c: any) => {
  const city = (c.req.query('city') || '') as City;
  if (!CITIES.includes(city)) return c.json({ error: '未知城市' }, 400);
  await ensureSchema(c.env.AQHI_DB);
  await coldStartEnsure(c.env);
  const data = await getCityWindow(c.env, city);
  return c.json(data);
});

// 全部城市 AQHI
app.get('/api/aqhi-all', async (c: any) => {
  await ensureSchema(c.env.AQHI_DB);
  await coldStartEnsure(c.env);
  const results = await Promise.all(CITIES.map(city => getCityWindow(c.env, city)));
  return c.json(results);
});

// 历史曲线
app.get('/api/history', async (c: any) => {
  const city = (c.req.query('city') || '') as City;
  const hours = parseInt(c.req.query('hours') || '24', 10);
  if (!CITIES.includes(city)) return c.json({ error: '未知城市' }, 400);
  if (!(hours >= 1 && hours <= 168)) return c.json({ error: 'hours 需在 1~168 内' }, 400);
  await ensureSchema(c.env.AQHI_DB);
  await coldStartEnsure(c.env);
  const data = await getHistory(c.env, city, hours);
  return c.json(data);
});

export default {
  fetch: app.fetch,
  // 定时抓取（Cloudflare Cron Triggers）
  scheduled: async (_event: any, env: Bindings) => {
    await ensureSchema(env.AQHI_DB);
    await fetchOnceAll(env);
  },
};

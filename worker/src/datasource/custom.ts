import { City, floorToHour, hourEpoch, shanghaiNow } from "../config";
import type { DataSource, MeasurementData } from "./base";

type EnvLike = {
  SOURCE_URL_TEMPLATE?: string; // 如: https://example.com/api?city={city}
  SOURCE_URL?: string;          // 固定 URL（若无城市维度）
  HEADERS_JSON?: string;        // 可选，自定义请求头 JSON 字符串
  FIELD_PM25?: string;          // 默认 pm25
  FIELD_O3?: string;            // 默认 o3
  FIELD_NO2?: string;           // 默认 no2
  FIELD_SO2?: string;           // 默认 so2
  CITY_PARAM_NAME?: string;     // 当需要在 query 中指定城市，且模板不用 {city} 时使用
};

function safeNumber(v: any, fallback = 0): number {
  const n = Number(v);
  if (Number.isFinite(n)) return n;
  return fallback;
}

export class CustomDataSource implements DataSource {
  constructor(private env: EnvLike) {}

  async fetchCurrent(city: City): Promise<MeasurementData> {
    const now = floorToHour(shanghaiNow());
    const ts_hour = hourEpoch(now);

    const url = this.buildUrl(city);
    const headers = this.buildHeaders();
    const res = await fetch(url, { headers });
    if (!res.ok) {
      throw new Error(`SOURCE_HTTP_${res.status}`);
    }

    const ct = (res.headers.get('content-type') || '').toLowerCase();
    let body: any;
    if (ct.includes('application/json')) {
      body = await res.json();
    } else {
      // 非 JSON：尝试当作 JSON 解析（部分站点返回 text/json 或无 CT）
      const text = await res.text();
      try {
        body = JSON.parse(text);
      } catch {
        // 如果网站是 HTML，需要定制化解析：可在此处增加正则或结构化提取
        throw new Error('SOURCE_PARSE_NON_JSON');
      }
    }

    const pm25Key = this.env.FIELD_PM25 || 'pm25';
    const o3Key = this.env.FIELD_O3 || 'o3';
    const no2Key = this.env.FIELD_NO2 || 'no2';
    const so2Key = this.env.FIELD_SO2 || 'so2';

    // 兼容两种返回：
    // 1) 直接是一个数据对象
    // 2) 有城市维度的字典，如 { "杭州": {pm25:..., o3:...}, ... }
    let obj: any = body;
    if (body && typeof body === 'object' && body[city] && typeof body[city] === 'object') {
      obj = body[city];
    }

    const pm25 = Math.max(0, safeNumber(obj?.[pm25Key]));
    const o3 = Math.max(0, safeNumber(obj?.[o3Key]));
    const no2 = Math.max(0, safeNumber(obj?.[no2Key]));
    const so2 = Math.max(0, safeNumber(obj?.[so2Key]));

    return { city, ts_hour, pm25, o3, no2, so2 };
  }

  private buildUrl(city: City): string {
    const tpl = this.env.SOURCE_URL_TEMPLATE || '';
    const fixed = this.env.SOURCE_URL || '';
    if (tpl) return tpl.replace('{city}', encodeURIComponent(city));
    if (fixed) {
      // 可选：如果提供了 CITY_PARAM_NAME，则拼入 query
      if (this.env.CITY_PARAM_NAME) {
        const u = new URL(fixed);
        u.searchParams.set(this.env.CITY_PARAM_NAME, city);
        return u.toString();
      }
      return fixed;
    }
    throw new Error('MISSING_SOURCE_URL');
  }

  private buildHeaders(): Record<string, string> | undefined {
    const s = this.env.HEADERS_JSON;
    if (!s) return undefined;
    try {
      const obj = JSON.parse(s);
      return obj && typeof obj === 'object' ? obj as Record<string, string> : undefined;
    } catch {
      return undefined;
    }
  }
}

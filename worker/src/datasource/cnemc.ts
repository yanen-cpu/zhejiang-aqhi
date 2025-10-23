import type { DataSource, MeasurementData } from "./base";
import type { City } from "../config";

// 浙江城市 -> CNEMC citycode 映射
const CITY_CODE: Record<City, number> = {
  "杭州": 330100,
  "宁波": 330200,
  "温州": 330300,
  "嘉兴": 330400,
  "湖州": 330500,
  "绍兴": 330600,
  "金华": 330700,
  "衢州": 330800,
  "舟山": 330900,
  "台州": 331000,
  "丽水": 331100,
};

function safeNumber(v: any, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export class CNEMCDataSource implements DataSource {
  private base = "https://air.cnemc.cn:18007";

  async fetchCurrent(city: City): Promise<MeasurementData> {
    const code = CITY_CODE[city];
    if (!code) throw new Error(`UNKNOWN_CITY_CODE_${city}`);
    const headers: Record<string, string> = {
      "Accept": "application/json, text/javascript, */*; q=0.01",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      "X-Requested-With": "XMLHttpRequest",
      "Referer": "https://air.cnemc.cn:18007/",
      "Accept-Language": "zh-CN,zh;q=0.9",
      "Origin": "https://air.cnemc.cn:18007",
      "Connection": "keep-alive",
    };

    const paths = [
      `/CityData/GetCityRealTimeAQIHistoryByCondition?citycode=${code}`,
      `/CityData/GetCityRealTimeAqiHistoryByCondition?citycode=${code}`,
      `/CityData/GetCityRealTimeAQIHistoryByCondition?cityCode=${code}`,
      `/CityData/GetCityRealTimeAqiHistoryByCondition?cityCode=${code}`,
    ];

    let data: any = null;
    let lastStatus = 0;
    for (const p of paths) {
      const url = `${this.base}${p}`;
      const res = await fetch(url, { headers });
      lastStatus = res.status;
      if (!res.ok) {
        if (res.status === 404) continue; // 尝试下一个大小写/参数名变体
        throw new Error(`CNEMC_HTTP_${res.status}`);
      }
      const ct = (res.headers.get("content-type") || "").toLowerCase();
      if (ct.includes("application/json")) {
        data = await res.json();
      } else {
        const text = await res.text();
        try { data = JSON.parse(text); } catch { data = null; }
      }
      if (data != null) break;
    }
    if (data == null || (Array.isArray(data) && data.length === 0)) {
      // 回退方案：按站点实时数据做城市平均
      const live = await this.fetchLiveAverage(city, code, headers);
      if (!live) throw new Error(`CNEMC_HTTP_${lastStatus || 0}`);
      const { pm25, o3, no2, so2 } = live;
      return { city, ts_hour: 0, pm25, o3, no2, so2 };
    }
    // 取最新一条（该接口通常按时间升序返回）
    const last = data[data.length - 1] || data[0];
    const pm25 = Math.max(0, safeNumber(last?.["PM2_5"]));
    const o3 = Math.max(0, safeNumber(last?.["O3"]));
    const no2 = Math.max(0, safeNumber(last?.["NO2"]));
    const so2 = Math.max(0, safeNumber(last?.["SO2"]));

    // ts_hour 由上层统一设定为当前整点
    return { city, ts_hour: 0, pm25, o3, no2, so2 };
  }

  // 站点实时接口回退：对所有站点做简单算术平均
  private async fetchLiveAverage(city: City, code: number, headers: Record<string, string>) {
    const candidates = [
      `/CityData/GetAQIDataPublishLive?citycode=${code}`,
      `/CityData/GetAQIDataPublishLive?cityCode=${code}`,
      `/CityData/GetAQIDataPublishLive?cityName=${encodeURIComponent(city + '市')}`,
    ];
    let arr: any = null;
    for (const p of candidates) {
      const url = `${this.base}${p}`;
      const res = await fetch(url, { headers });
      if (!res.ok) {
        if (res.status === 404) continue;
        return null;
      }
      const ct = (res.headers.get("content-type") || "").toLowerCase();
      let body: any = null;
      if (ct.includes("application/json")) body = await res.json();
      else { const t = await res.text(); try { body = JSON.parse(t); } catch { body = null; } }
      if (Array.isArray(body) && body.length) { arr = body; break; }
    }
    if (!Array.isArray(arr) || !arr.length) return null;
    const nums = { pm25: 0, o3: 0, no2: 0, so2: 0 };
    let cnt = 0;
    for (const it of arr) {
      const p25 = safeNumber(it?.["PM2_5"], NaN);
      const _o3 = safeNumber(it?.["O3"], NaN);
      const _n2 = safeNumber(it?.["NO2"], NaN);
      const _s2 = safeNumber(it?.["SO2"], NaN);
      if (Number.isFinite(p25) && Number.isFinite(_o3) && Number.isFinite(_n2) && Number.isFinite(_s2)) {
        nums.pm25 += p25; nums.o3 += _o3; nums.no2 += _n2; nums.so2 += _s2; cnt++;
      }
    }
    if (!cnt) return null;
    return {
      pm25: Math.max(0, nums.pm25 / cnt),
      o3: Math.max(0, nums.o3 / cnt),
      no2: Math.max(0, nums.no2 / cnt),
      so2: Math.max(0, nums.so2 / cnt),
    };
  }
}

import { City, floorToHour, hourEpoch, shanghaiNow } from "../config";
import type { DataSource, MeasurementData } from "./base";

// 生成稳定但随时间变化的伪数据：
// 基于城市名称 seed，叠加按小时的轻微波动
function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 131 + s.charCodeAt(i)) >>> 0;
  return h >>> 0;
}

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class MockDataSource implements DataSource {
  async fetchCurrent(city: City): Promise<MeasurementData> {
    const now = floorToHour(shanghaiNow());
    const ts_hour = hourEpoch(now);

    // 基准值（不同城市略有差异）
    const rngBase = mulberry32(hashString(city) ^ 0x9E3779B9);
    const base_pm25 = 15 + rngBase() * (65 - 15);
    const base_o3 = 40 + rngBase() * (140 - 40);
    const base_no2 = 10 + rngBase() * (60 - 10);
    const base_so2 = 3 + rngBase() * (25 - 3);

    // 小幅小时波动
    const hourSeed = (ts_hour | 0) ^ hashString(city);
    const rngHour = mulberry32(hourSeed >>> 0);
    const pm25 = Math.max(1.0, base_pm25 + (rngHour() * 16 - 8));
    const o3 = Math.max(1.0, base_o3 + (rngHour() * 24 - 12));
    const no2 = Math.max(1.0, base_no2 + (rngHour() * 12 - 6));
    const so2 = Math.max(1.0, base_so2 + (rngHour() * 6 - 3));

    return {
      city,
      ts_hour,
      pm25: Number(pm25),
      o3: Number(o3),
      no2: Number(no2),
      so2: Number(so2),
    };
  }
}

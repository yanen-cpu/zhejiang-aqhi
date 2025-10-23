// AQHI 计算逻辑（从 Python 版本移植）

export const ADVICE_MAP: Record<string, string> = {
  "一级": "一般人群：可正常活动\n敏感人群：可正常活动",
  "二级": "一般人群：可正常活动\n敏感人群：适量减少户外体力消耗和逗留时间",
  "三级": "一般人群：适量减少户外体力消耗和逗留时间\n敏感人群：尽可能减少户外体力消耗和逗留时间；尽可能紧闭门窗，开启空气净化器",
  "四级": "一般人群：尽可能减少户外体力消耗和逗留时间；尽可能紧闭门窗，开启空气净化器\n敏感人群：避免户外体力消耗和逗留；紧闭门窗，开启空气净化器",
};

export type ERComponents = Record<string, number>;

export function calculateERComponents(pm25: number, o3: number, so2: number, no2: number): [ERComponents, number] {
  const beta: Record<string, number> = {
    "PM2.5": 0.000683,
    "O₃": 0.000586,
    "SO₂": 0.002246,
    "NO₂": 0.001314,
  };
  const values: Record<string, number> = { "PM2.5": pm25, "O₃": o3, "SO₂": so2, "NO₂": no2 };
  const erComponents: ERComponents = {};
  for (const k of Object.keys(values)) {
    erComponents[k] = 100 * (Math.exp(beta[k] * Number(values[k])) - 1);
  }
  const erTotal = Object.values(erComponents).reduce((a, b) => a + b, 0);
  return [erComponents, erTotal];
}

export function getAQHI(er: number): [number | null, string | null, string | null] {
  const table: Array<[number, number, number, number, string, string]> = [
    [0, 5.57, 0, 1, "一级", "绿色"],
    [5.57, 11.14, 1, 2, "一级", "绿色"],
    [11.14, 16.71, 2, 3, "一级", "绿色"],
    [16.71, 19.72, 3, 4, "二级", "蓝色"],
    [19.72, 21.78, 4, 5, "二级", "蓝色"],
    [21.78, 25.74, 5, 6, "二级", "蓝色"],
    [25.74, 34.44, 6, 7, "三级", "黄色"],
    [34.44, 43.14, 7, 8, "三级", "黄色"],
    [43.14, 51.84, 8, 9, "三级", "黄色"],
    [51.84, 60.54, 9, 10, "四级", "红色"],
    [60.54, Infinity, 10, 11, "四级", "红色"],
  ];
  for (const [lo, hi, aqLo, aqHi, level, color] of table) {
    if (er >= lo && er <= hi) {
      const aqhi = (er - lo) / (hi - lo) * (aqHi - aqLo) + aqLo;
      return [aqhi, level, color];
    }
  }
  return [null, null, null];
}

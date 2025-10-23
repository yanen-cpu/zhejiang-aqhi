import type { City } from "../config";

export type MeasurementData = {
  city: City;
  ts_hour: number; // epoch seconds at hour (Asia/Shanghai based hour)
  pm25: number;
  o3: number;
  no2: number;
  so2: number;
};

export interface DataSource {
  fetchCurrent(city: City): Promise<MeasurementData>;
}

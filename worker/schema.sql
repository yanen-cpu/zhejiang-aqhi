-- D1 (SQLite) schema for AQHI measurements
CREATE TABLE IF NOT EXISTS measurements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  city TEXT NOT NULL,
  ts_hour INTEGER NOT NULL, -- epoch seconds at hour (Asia/Shanghai)
  pm25 REAL NOT NULL,
  o3 REAL NOT NULL,
  no2 REAL NOT NULL,
  so2 REAL NOT NULL,
  UNIQUE(city, ts_hour)
);

CREATE INDEX IF NOT EXISTS idx_measurements_city_ts ON measurements(city, ts_hour);

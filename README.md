# 🌍 浙江 AQHI 网站免费部署教程（Cloudflare Pages + GitHub + Workers）

本仓库已包含前端静态站点（`static/`）与后端 API（`worker/`）。下面按“从上传代码到 GitHub，到 Cloudflare Pages 免费部署”一步不漏带你上线；再补充 Cloudflare Workers + D1 作为后端与定时任务。

---

## 🧩 一、准备工作

你需要准备：

1) GitHub 账号：注册 https://github.com

2) Cloudflare 账号：注册 https://dash.cloudflare.com/sign-up

3) 本地环境（Windows 推荐）：
- Git（https://git-scm.com/downloads）
- Node.js 18+（https://nodejs.org/），用于 Workers 开发/部署
- Wrangler CLI：`npm i -g wrangler`（也可用 `npx wrangler`）
- 可选：Python + `pip install pyshp`（若要把 Shapefile 转为 GeoJSON）

---

## 💻 二、上传代码到 GitHub

1) 新建 GitHub 仓库
- 右上角 ➕ → New repository
- Repository name：`zhejiang-aqhi`（或自定义）
- Visibility：Public
- 不勾选 “Initialize with a README”
- Create repository

2) 本地推送（在仓库根目录执行 PowerShell）

可直接使用一键脚本（推荐）：
- 首次需要先设置远程：
  - `git remote add origin https://github.com/你的用户名/zhejiang-aqhi.git`
- 双击运行根目录的 `deploy.bat`（或在命令行里传入提交消息，如 `deploy.bat "first commit"`）

或手动命令：
```powershell
git init
git add .
git commit -m "first commit"
git branch -M main
git remote add origin https://github.com/你的用户名/zhejiang-aqhi.git
git push -u origin main
```

登录方式：
- 推荐浏览器登录；如使用 Personal Access Token（PAT），见 https://github.com/settings/tokens

3) 检查上传是否成功
- 打开 https://github.com/你的用户名/zhejiang-aqhi
- 确认能看到 `static/index.html`、`worker/` 等代码文件

---

## ☁️ 三、在 Cloudflare Pages 部署前端

1) 连接 GitHub
- Cloudflare Dashboard → Pages → Create a project → Connect to Git
- 授权访问 GitHub；选择你的仓库 `zhejiang-aqhi`

2) 配置构建参数（关键）
- Framework preset：`None`
- Build command：留空
- Build output directory：`static`（重要：本项目的前端位于 `static/`）

3) Save and Deploy
- 等待几分钟，看到 `Your site is live!` 即表示前端已上线。
- 暂时访问 `https://你的项目.pages.dev/` 可看到页面，但 API 尚未接好（下一节完成后正常）。

路径提示：部署后 Pages 的站点根就是 `static/` 内容，本仓库已修正所有资源路径为根路径（如 `/styles.css`、`/map.html`）。

---

## 🛠️ 四、部署后端 API（Cloudflare Workers + D1）

1) 登录并创建 D1 数据库（一次性）
```powershell
npx wrangler login
npx wrangler d1 create aqhi
```
记录返回的 `database_name` 与 `database_id`。

2) 绑定 D1 到 Worker
- 打开 `worker/wrangler.toml`，在 `[[d1_databases]]` 段：
  - `database_name` 改为上一步的名称（如 `aqhi`）
  - 填写 `database_id`

3) 初始化表结构
```powershell
# 本地（可选）
npx wrangler d1 execute aqhi --local --file worker/schema.sql

# 远端（生产环境）
npx wrangler d1 execute aqhi --file worker/schema.sql
```

4) 部署 Worker
```powershell
cd worker
npm install
npm run deploy
```

5) 配置路由（把你的站点的 /api/* 交给 Worker）
- Cloudflare 控制台 → Workers & Pages → 你的 Worker → Triggers → Routes：
  - 添加 Route：`https://你的域名/api/*`（域名可用 Pages 分配的 *.pages.dev 或自定义域名）

完成后，前端访问 `/api/...` 就会指向 Worker。

6) 验证
- 打开 `https://你的域名/api/aqhi-all` 应返回 JSON 数组
- 刷新站点首页与地图页，AQHI 指标应展示正常

说明：
- Worker 默认 `DATA_SOURCE=cnemc`（已内置接入国家环境监测站 CNEMC 的公开接口），每小时第 5 分（Cron）抓取一次。
- 如果你还没为 Pages 站点配置 `/api/*` 路由到 Worker，也可以在浏览器控制台临时指定前端 API：
  ```js
  localStorage.setItem('AQHI_API_BASE', 'https://你的workers子域.workers.dev');
  // 刷新页面生效
  ```
- CORS 默认允许所有来源（`origin: *`），可在 `worker/src/index.ts` 中按需限制到你的域名。

### 使用 CNEMC 官方数据源（cnemc）

本仓库已默认启用 `cnemc` 数据源，按城市代码调用 `https://air.cnemc.cn:18007` 的公开接口，获取每市 PM2_5、O3、NO2、SO2。

- 已内置浙江 11 市 citycode 映射：
  - 杭州330100，宁波330200，温州330300，嘉兴330400，湖州330500，绍兴330600，金华330700，衢州330800，舟山330900，台州331000，丽水331100
- 调用与容错：
  - 首选“城市实时历史”接口 `GetCityRealTimeAqiHistoryByCondition`（大小写/参数名 citycode/cityCode 多种变体已做回退）。
  - 若该接口不可用，则回退到“站点实时” `GetAQIDataPublishLive`，对全市站点做算术平均得到城市级污染物值。
- 快速测试（不入库）：
  - GET `/api/admin/test-ds?city=宁波`（city 为中文城市名）
- 立即抓取一轮（入库 11 市当前小时）：
  - GET 或 POST `/api/admin/fetch-once`
- 查看聚合结果：
  - GET `/api/aqhi-all` 或 `/api/aqhi?city=宁波`

注意：
- 该接口为公开站点，但可能存在限流或大小写差异；本项目已补充 Referer/Origin/UA 等请求头并内置多种回退路径。
- 回退到站点平均时，结果与官方“城市聚合”可能略有差异，属于可接受偏差范围。

### 接入自定义网站/接口数据源（custom）

如果你有一个网站或接口可以提供各城市污染物数据（pm25、o3、no2、so2），可切换到自定义数据源：

1) 在 `worker/wrangler.toml` 设置：
```
[vars]
DATA_SOURCE = "custom"

# 任选一项：
# 1) URL 模板（优先），会用城市名替换 {city}
# SOURCE_URL_TEMPLATE = "https://example.com/api?city={city}"

# 2) 固定 URL（如果数据不是按城市拆分），可配合 CITY_PARAM_NAME 将城市加入 query
# SOURCE_URL = "https://example.com/api"
# CITY_PARAM_NAME = "city"

# 可选：自定义请求头（JSON 字符串）
# HEADERS_JSON = '{"User-Agent":"AQHI-Bot/1.0","Accept":"application/json"}'

# 字段名映射（当源 JSON 字段名不同于 pm25/o3/no2/so2 时）
# FIELD_PM25 = "pm2_5"
# FIELD_O3 = "o3"
# FIELD_NO2 = "no2"
# FIELD_SO2 = "so2"
```

2) 部署并测试：
- 部署：`cd worker && npm run deploy`
- 测试不入库的抓取：`GET /api/admin/test-custom?city=杭州`
- 手动抓取入库：`POST /api/admin/fetch-once`

注意：
- 建议你的数据源返回 JSON；目前内置解析优先按 JSON 处理（若返回 HTML，需要定制化解析，可联系维护者升级解析逻辑）。
- 建议添加合适的 `User-Agent` 和必要的请求头；遵守源站的使用条款与频率限制。

---

## 🔁 五、后续更新代码

使用一键脚本（推荐）：
- 双击 `deploy.bat`，或命令行执行 `deploy.bat "update"`

或手动：
```powershell
git add .
git commit -m "update"
git push
```

Cloudflare Pages 会自动检测变更并重新部署，几分钟后生效。

---

## 🧭 六、可选：地图边界（Shapefile → GeoJSON）

说明：当前默认地图已切换为百度地图（BMapGL）并在线获取行政边界，无需本地 GeoJSON。本节仅在你选择用 Leaflet 本地渲染或需要自定义/离线边界时参考。

如果使用 Leaflet 方案，前端会尝试加载 `./geo/zhejiang_cities.geo.json` 用于地市区域着色。你可以用 `tools/shp_to_geojson.py` 将 Shapefile 转为 GeoJSON。

1) 安装依赖（本地可选）
- `pip install pyshp`

2) 正确的 PowerShell 命令（单行更稳）：
```powershell
python tools/shp_to_geojson.py --input "C:\Users\你\path\zj_city.shp" --output "static\geo\zhejiang_cities.geo.json" --encoding gbk --name-field NAME
```
注意：不要用 `\` 作为换行续写符（那是 bash 风格）。如果一定要分行，在 PowerShell 用反引号 ` 续行。

提示：
- 坐标系需为 WGS84（EPSG:4326）；如不是，请先用 QGIS/ogr2ogr 转换。
- 字段中如果有 `NAME`（或 `name/city`），脚本会将常见别名标准化为中文城市名，便于和前端对齐。

---

## 📚 七、项目说明与扩展

功能特性：
- 11 城市（杭州、宁波、温州、嘉兴、湖州、绍兴、金华、衢州、舟山、台州、丽水）
- 3 小时滑动平均，提供 ER 分量与总量
- 定时抓取 + 冷启动自动补抓（mock）
- 卡片视图 + 地图视图（默认使用百度地图，行政区边界在线获取），无需本地 GeoJSON；可选 Leaflet + 本地 GeoJSON 方案

目录结构（关键项）：
- `static/`：前端静态资源（Pages 的构建输出目录）
- `worker/`：Cloudflare Worker（API + Cron + D1）
  - `src/index.ts`：HTTP 路由与定时任务
  - `src/aqhi.ts`：AQHI 计算逻辑
  - `src/datasource/mock.ts`：演示数据源
  - `schema.sql`：D1 建表脚本

接入真实数据源：
- 在 `worker/src/datasource/` 新增你的实现；在 `src/index.ts:getDataSource()` 切换；
- 凭据通过 `worker/wrangler.toml` 的 `[vars]` 注入；
- 如需增加字段或表结构，更新 `schema.sql` 并执行迁移。

---

## ✅ 八、常见问题（FAQ）

1) 页面资源 404？
- 请确认 Pages 的 Build output directory 设为 `static`；本仓库已将所有资源路径改为根路径（`/styles.css`、`/map.html` 等）。

2) 地图加载失败或空白（百度地图）？
- 请在 `static/map.html` 中将 `YOUR_AK` 替换为你的百度地图 AK，并在开放平台为该 AK 配置域名白名单（可含 `*.pages.dev` 或你的自定义域名）。
- 检查浏览器控制台是否有 `api.map.baidu.com` 加载或跨域错误，确认网络可访问。
- 如需不依赖外网/AK 的方案，可改用本仓库的 Leaflet 本地版本（`/vendor/leaflet/` 资源 + 自带 `static/map.js` + 可选本地 GeoJSON）。

3) GeoJSON 没加载？（仅 Leaflet 方案适用）
- 请确认 `static/geo/zhejiang_cities.geo.json` 存在，且地图脚本请求路径为 `/geo/zhejiang_cities.geo.json`。

4) API 404 或 CORS 报错？
- 是否已部署 Worker 并配置了 Route 到 `https://你的域名/api/*`？
- CORS 可在 `worker/src/index.ts` 的 `cors()` 中间件配置允许域名。

---

## 📝 许可

仅供学习与演示用途。接入真实数据时请遵守数据源条款与爬取规范。

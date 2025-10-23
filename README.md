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

路径提示：部署后 Pages 的站点根就是 `static/` 内容，本仓库已修正所有资源路径为根路径（如 `/styles.css`、`/map.html`、`/vendor/leaflet/leaflet.js`）。

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
- Worker 默认 `DATA_SOURCE=mock`，每小时第 5 分（Cron）抓取一次；首次访问如果当前小时没有数据，mock 模式会自动补一轮，避免页面显示 `--`。
- CORS 默认允许所有来源（`origin: *`），可在 `worker/src/index.ts` 中按需限制到你的域名。

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

本仓库前端会尝试加载 `./geo/zhejiang_cities.geo.json` 用于地市区域着色。你可以用 `tools/shp_to_geojson.py` 将 Shapefile 转为 GeoJSON。

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
- 卡片视图 + 地图视图（Leaflet），支持边界着色

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

2) 地图底图不显示？
- 浏览器控制台可能提示瓦片加载失败，多为网络因素；不影响 AQHI 数据展示。
- 本仓库使用本地引入的 Leaflet；路径应为 `/vendor/leaflet/leaflet.css` 与 `/vendor/leaflet/leaflet.js`。

3) GeoJSON 没加载？
- 请确认 `static/geo/zhejiang_cities.geo.json` 存在，且地图脚本请求路径为 `/geo/zhejiang_cities.geo.json`。

4) API 404 或 CORS 报错？
- 是否已部署 Worker 并配置了 Route 到 `https://你的域名/api/*`？
- CORS 可在 `worker/src/index.ts` 的 `cors()` 中间件配置允许域名。

---

## 📝 许可

仅供学习与演示用途。接入真实数据时请遵守数据源条款与爬取规范。

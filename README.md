# 变电站继电保护定值整定与二次设备检修管理平台

面向变电站台账、保护装置、定值整定与核对、二次回路检查、保护校验、故障录波分析、主变检修与直流系统监测的一体化电网二次设备运维管理工作台。

这是一个**纯前端**管理平台：Vue 3 + Vite + TypeScript，仓库里没有后端服务。业务数据由
`frontend/src/data/` 下的本地数据层提供：首次打开用示例数据播种，之后的登记、筛选与状态流转
结果都持久化在浏览器 `localStorage` 里，刷新或重开浏览器都还在。dev server 已关掉自动打开页面，
启动后按终端打印的地址手工打开。

## 目录结构

```text
.
├── frontend/                 Vue 3 + Vite + TypeScript 前端（唯一运行单元）
│   ├── src/views/            每个业务模块一个页面
│   ├── src/api/local-service.ts   本地数据服务：登记、筛选、动作流转、复位、导出
│   ├── src/data/             模块元数据 / localStorage 持久化（示例数据在 ../sample/seed.json）
│   ├── sample/seed.json      示例数据唯一权威源（setup 与 reset:dev 共用）
│   └── vite.config.ts        dev server 配置（open: false，无 /api 代理）
├── .gitignore
└── docker-compose.yml
```

## 启动（新同事照这两步即可）

```bash
cd frontend
npm run setup      # 一条命令：按锁文件装齐依赖 + 校验示例数据
npm run dev
```

`npm run setup` 可以反复执行：依赖已与 `package-lock.json` 一致时会跳过安装，装到一半中断后重跑
会自动补齐；示例数据来自唯一权威源 `frontend/sample/seed.json`（当前版本 `2026.10.0`，
18 个模块共 54 条），首次打开页面时自动播种进浏览器 `localStorage`。

> 依赖版本一律精确钉在 `package.json` 与 `package-lock.json` 里，安装走 `npm ci`，
> 不会再出现「本机留的是上月那份、几个人版本对不上」的情况。

前端默认监听 `http://127.0.0.1:5173/`，dev server 不会自动打开浏览器，需要自己访问。

### 把本地数据收回初始状态（仅本地开发）

```bash
npm run reset:dev   # 或在仓库根目录执行 make reset
```

该命令写入一个本地复位令牌（`public/seed-reset.json`，已在 `.gitignore`，不入库、不影响生产）。
**刷新（或打开）页面**后，应用发现令牌更新，就把 `localStorage` 里各模块数据**全量覆盖**回
`sample/seed.json`：

- 两条命令（setup / reset:dev）用的是同一份 `sample/seed.json`，不会装出两份数据；
- 复位是覆盖而不是追加，反复执行、反复刷新都不会多出条目，每个模块的待办清单严格回到起点
  （每模块 3 条、其中 2 条待办）；
- 运营概览页在 dev 下还有一个「收回示例数据（本地开发）」按钮，可直接在页面里复位。

生产构建：

```bash
cd frontend
npm run build
```

## 业务模块

| 模块 | 目录 | 业务对象 | 主要字段 |
| --- | --- | --- | --- |
| 变电站台账 | `substation` | 变电站 | 站名、电压等级、所属供电所 |
| 保护装置台账 | `protectiondevice` | 保护装置 | 装置编号、所属间隔、装置型号 |
| 定值整定 | `settingvalue` | 定值单 | 定值单号、所属装置、定值项目 |
| 定值核对 | `settingcheck` | 核对记录 | 核对编号、所属变电站、装置名称 |
| 二次回路检查 | `secondarycircuit` | 回路检查记录 | 检查编号、所属间隔、回路类别 |
| 保护校验 | `relaytest` | 校验记录 | 校验编号、装置名称、校验项目 |
| 故障录波 | `faultrecord` | 录波记录 | 录波编号、故障线路、故障类型 |
| 保护动作统计 | `tripstat` | 动作统计 | 统计编号、所属线路、动作次数 |
| 主变检修 | `transformermaint` | 主变检修记录 | 检修编号、主变名称、检修类别 |
| 断路器维护 | `breaker` | 断路器 | 设备编号、所属间隔、断路器型号 |
| 直流系统监测 | `dcsystem` | 直流监测记录 | 监测编号、所属变电站、蓄电池组号 |
| 绝缘试验 | `insulationtest` | 试验记录 | 试验编号、试验设备、试验项目 |
| 缺陷处置 | `defect` | 缺陷记录 | 缺陷编号、缺陷设备、缺陷等级 |
| 工作票许可 | `workpermit` | 工作票 | 工作票号、工作任务、所属变电站 |
| 设备巡视 | `patrol` | 巡视记录 | 巡视编号、巡视变电站、巡视路线 |
| 计量装置核查 | `meteringcheck` | 核查记录 | 核查编号、计量点名称、电能表编号 |
| 定值审批 | `settingapprove` | 审批单 | 审批单号、关联定值单、审批层级 |
| 安全工器具检定 | `safetytool` | 安全工器具 | 工器具编号、工器具名称、所属班组 |

## 约定

- 每个模块的页面在 `frontend/src/views/<模块>/index.vue`，页面只负责渲染，读写统一走
  `frontend/src/api/local-service.ts`。
- 字段、状态、动作与流转目标集中在 `frontend/src/data/modules.ts`；示例数据在
  `frontend/src/data/seed.ts`。
- 状态流转只允许在 `local-service.ts` 里改，页面组件不做业务判断。
- 示例数据的唯一权威源是 `frontend/sample/seed.json`，版本与校验规则在
  `frontend/src/data/seed-rules.ts`（浏览器侧）与 `frontend/scripts/seed-lib.mjs`（CLI 侧），
  两边由 `frontend/__tests__/seed-parity.test.ts` 钉住一致。
- localStorage 按「版本 + 示例指纹」整体播种：本机旧数据版本对不上时直接整体替换（不合并、
  不追加）；混进非法记录（异常量/待办不是布尔值、id 非法）的模块会被挡回示例基线。
- 运营概览的「登记总量」与各模块列表用同一个计数函数（`countEntries`），两处永远对得齐；
  登记走 `createEntry`，非法值在写入前挡回。
- 想回到初始数据：`npm run reset:dev` 后刷新页面，或在运营概览页点「收回示例数据（本地开发）」；
  也可以只复位单个模块（`resetModule(模块)`）。

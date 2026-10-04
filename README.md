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
│   ├── src/api/local-service.ts   本地数据服务：列表、筛选、动作流转、导出
│   ├── src/data/             模块元数据 / 示例数据 / localStorage 持久化
│   ├── src/stores/           会话与筛选状态
│   └── vite.config.ts        dev server 配置（open: false，无 /api 代理）
├── .gitignore
└── docker-compose.yml
```

## 启动

新同事只需要一条命令，依赖（按 `package-lock.json` 钉死版本）与示例数据校验一次装到位：

```bash
cd frontend
npm run setup      # 等价：make setup
npm run dev
```

> 不要直接用 `npm install`：仓库已提交 `package-lock.json`，setup 走 `npm ci` 严格按锁安装，
> 不会再出现“几个依赖版本对不上、本机留的是上月那份”。setup 可反复执行，幂等不增量。

前端默认监听 `http://127.0.0.1:5173/`，dev server 不会自动打开浏览器，需要自己访问。

生产构建：

```bash
cd frontend
npm run build
```

## 示例数据与本地复位（仅开发环境）

- 示例数据唯一出处：`frontend/src/data/seed.json`。安装脚本、浏览器播种、复位都读这一份。
  数据信封带版本号；`seed.json` 的 `version` 变化后，浏览器里的旧数据会按模块自动重补，
  逐模块落盘，**装到一半断了重开页面会接着走，反复装载不会多出一份**，刷新后读到的仍是同一份。
- 运营概览的「登记总量」与各模块列表的记录数走同一套计数（`moduleCounts`），天然同步；
  读入本地数据时会校验结构，异常量、待办标记等出现非法值的模块整体挡回示例数据，不带病统计。
- 本地开发想把数据收回初始状态：

  ```bash
  cd frontend
  npm run db:reset     # 等价：make reset
  ```

  脚本会在需要时后台拉起 dev server，并给出 `http://127.0.0.1:5173/__dev_reset` 地址
  （该入口只在 dev server 存在，生产构建没有）。用浏览器打开即完成复位并跳回首页：
  各模块回到示例数据，**每个业务模块的待办清单会多出一条「开发环境数据已复位」尾迹**；
  重复复位不叠加，复位过程中断后重开页面会续跑完成。

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
- 字段、状态、动作与流转目标集中在 `frontend/src/data/modules.ts`；示例数据唯一出处是
  `frontend/src/data/seed.json`（`seed.ts` 只是它的薄封装），改示例数据后记得抬一下 `version`。
- 状态流转只允许在 `local-service.ts` 里改，页面组件不做业务判断。
- 开发环境整体复位用 `npm run db:reset`；只想复位单个模块可调用 `resetModule(模块)`。

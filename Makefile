.PHONY: install setup frontend dev-reset reset build

install:
	cd frontend && npm install

# 一键装到位：锁版本依赖 + 示例数据校验（新人照这一条做即可）
setup:
	cd frontend && npm run setup

frontend:
	cd frontend && npm run dev

# 仅本地开发环境：把浏览器本地数据收回初始状态
dev-reset reset:
	cd frontend && npm run db:reset

build:
	cd frontend && npm run build

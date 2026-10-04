.PHONY: setup reset frontend build test

# 一条命令把依赖与示例数据一起装到位
setup:
	cd frontend && npm run setup

# 只给本地开发环境用：数据收回示例初始状态（刷新页面生效）
reset:
	cd frontend && npm run reset:dev

frontend:
	cd frontend && npm run dev

build:
	cd frontend && npm run build

test:
	cd frontend && npm test

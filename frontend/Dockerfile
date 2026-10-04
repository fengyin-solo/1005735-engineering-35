FROM node:20-alpine
WORKDIR /srv/web
# 依赖版本以锁文件为准（npm ci 精确安装，不会再各装各的版本）
COPY package.json package-lock.json ./
RUN npm ci --no-audit
COPY . .
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]

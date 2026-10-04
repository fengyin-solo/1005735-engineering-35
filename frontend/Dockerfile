FROM node:20-alpine
WORKDIR /srv/web
# 先拷锁文件做严格安装：镜像里的依赖版本与本机、CI 完全一致。
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]

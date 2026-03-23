FROM node:20-slim AS base
RUN corepack enable && corepack prepare pnpm@9 --activate
WORKDIR /app

# 安装依赖
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/core/package.json packages/core/
COPY packages/schema/package.json packages/schema/
COPY packages/preview/package.json packages/preview/
COPY packages/editor/package.json packages/editor/
COPY packages/cli/package.json packages/cli/
COPY packages/web-adapter/package.json packages/web-adapter/
RUN pnpm install --frozen-lockfile || pnpm install

# 复制源码
COPY packages/ packages/
COPY tools/ tools/

# 数据卷：项目文件由外部挂载
VOLUME /data/projects

ENV NODE_ENV=production
ENV TOWER_PROJECTS_DIR=/data/projects
EXPOSE 3000

CMD ["node", "--import", "tsx", "packages/cli/src/index.ts", "serve", \
     "--port", "3000", \
     "--projects-dir", "/data/projects"]

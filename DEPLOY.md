# TowerGUI 团队部署指南

将 TowerGUI Editor 部署为团队共享的在线协作工具。

---

## 架构概览

```
┌─────────────────────────────────────────────┐
│          TowerUI Editor Server              │
│  (Node.js HTTP + WebSocket)                 │
│                                             │
│  /editor          → Web 编辑器 UI           │
│  /api/projects    → 多项目管理              │
│  /api/document    → 文档读写                │
│  /api/presence    → 在线用户 & 编辑锁       │
│  /__editor (WS)   → 实时协作同步            │
├─────────────────────────────────────────────┤
│  /data/projects   → 共享项目目录 (挂载卷)   │
└─────────────────────────────────────────────┘
         ↑                    ↑
   设计师 A 浏览器       设计师 B 浏览器
   http://tower:3000     http://tower:3000
```

---

## 方式一：Docker 部署（推荐）

### 前提条件
- 安装 Docker 及 Docker Compose
- 准备一个共享存储目录（NAS / 网络盘 / 本地目录）

### 1. 拉取并构建

```bash
git clone <your-repo-url> TowerGUI
cd TowerGUI
docker-compose up -d --build
```

### 2. 配置共享项目目录

编辑 `docker-compose.yml`，将 `volumes` 映射到团队共享存储：

```yaml
volumes:
  # 方案 A：本地目录
  - /mnt/shared/tower-projects:/data/projects

  # 方案 B：NAS 挂载
  - //nas-server/ui-projects:/data/projects

  # 方案 C：开发测试
  - ./projects:/data/projects
```

### 3. 访问

```
http://<服务器IP>:3000/editor
```

所有设计师在浏览器中打开此地址即可开始协作。

### 4. 配置 AI 辅助（可选）

```yaml
environment:
  - OPENAI_API_KEY=sk-xxx          # OpenAI
  # 或
  - ANTHROPIC_API_KEY=sk-ant-xxx   # Anthropic Claude
```

---

## 方式二：直接部署

### 前提条件
- Node.js 20+
- pnpm 9+

### 1. 安装依赖

```bash
cd TowerGUI
pnpm install
```

### 2. 启动生产服务

```bash
# 基本启动
pnpm tower-ui serve --port 3000 --projects-dir /shared/projects

# 或使用环境变量
PORT=3000 TOWER_PROJECTS_DIR=/shared/projects pnpm tower-ui serve
```

### 3. 使用 PM2 守护进程（推荐）

```bash
npm install -g pm2

pm2 start "npx tsx packages/cli/src/index.ts serve --port 3000 --projects-dir /shared/projects" \
  --name tower-editor \
  --max-memory-restart 1G

pm2 save
pm2 startup  # 开机自启
```

### 4. Nginx 反向代理（可选）

```nginx
server {
    listen 80;
    server_name tower.yourcompany.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 86400;  # WebSocket 长连接
    }
}
```

---

## 协作功能说明

### 用户标识
- 首次打开编辑器时自动生成用户 ID，存储在浏览器 localStorage
- 用户名默认为 `Designer XXXX`，可在编辑器中修改

### 在线状态
- 顶部显示当前在线的协作者头像及颜色
- 鼠标悬停可查看用户名和正在编辑的文件

### 编辑锁
- 当一个用户正在编辑某文件时，其他用户会收到锁定通知
- 锁定超时为 5 分钟（用户离线后自动释放）
- 同一文件的编辑操作会实时广播到其他客户端

### 操作同步
- `node-update`：节点属性变更实时同步
- `cursor-move`：光标位置同步（显示协作者选中的节点）
- `document-updated`：文档保存后通知所有客户端刷新

---

## 多项目管理

### 项目目录结构

```
/data/projects/
├── GameA_MainUI/
│   ├── tower.project.json
│   ├── screens/
│   ├── components/
│   ├── templates/
│   ├── assets/
│   └── theme.json
├── GameA_BattleUI/
│   ├── tower.project.json
│   └── ...
└── GameB_ShopUI/
    ├── tower.project.json
    └── ...
```

### API 端点

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/projects` | GET | 列出所有项目 |
| `/api/project` | GET | 当前项目信息 |
| `/api/project/open` | POST | 打开项目 |
| `/api/project/create` | POST | 新建项目 |
| `/api/presence` | GET | 在线用户 & 编辑锁 |
| `/api/document` | GET/PUT | 当前文档读写 |
| `/api/templates` | GET/POST/DELETE | 模板管理 |
| `/api/sprites` | GET | 素材列表 |
| `/api/theme` | GET/PUT | Design Token 管理 |

---

## 团队工作流

### 设计师日常

```
1. 浏览器打开 http://tower:3000/editor
2. 从项目列表选择要编辑的项目
3. 在 Files 面板中选择或新建 .tower.json 文件
4. 使用可视化编辑器设计 UI
5. 保存自动同步到共享目录
6. 开发者在 Unity 中运行 TowerPrefabCompiler → 获得 Prefab
```

### 开发者对接

```
1. 共享目录已包含最新 .tower.json
2. Unity 工程中：Tower → Build All Prefabs
3. 自动生成的 Prefab 可直接使用
4. 通过 TowerUIBinder 绑定游戏逻辑
```

### CI/CD 集成

```bash
# 在构建服务器上验证 + 编译
pnpm ci                           # 校验 + 测试
node tools/validate-all.mjs       # Schema 验证
node tools/naming-linter.mjs      # 命名规范检查
```

---

## 常见问题

### Q: 多人同时编辑同一文件会冲突吗？
A: 当前实现为"最后写入者胜出"的乐观锁模型，配合编辑锁通知。对于 100+ 人团队，建议按模块/界面分配责任人，每个 `.tower.json` 同一时间只有一人编辑。

### Q: 项目文件如何版本控制？
A: 共享目录可以是 Git 仓库。设计师通过编辑器编辑，开发者定期 commit/push。`.tower.json` 是纯文本 JSON，合并冲突易于解决。

### Q: 需要多大的服务器？
A: Editor Server 本身非常轻量（约 100MB 内存）。主要瓶颈在共享存储 I/O。推荐：
- 小团队 (< 20人)：4C 8G，本地 SSD
- 中团队 (20-100人)：8C 16G，NAS
- 大团队 (100+人)：多实例 + 负载均衡 + NAS/对象存储

### Q: 如何水平扩展？
A: 当前单实例可支持 50+ 并发编辑。如需更多，可：
1. 按项目分片到不同实例
2. 使用 Redis 共享 WebSocket 状态
3. 前端使用 Nginx 负载均衡

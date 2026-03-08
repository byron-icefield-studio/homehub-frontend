# HomeHub Frontend

GitHub: https://github.com/byron-icefield-studio/homehub-frontend

HomeHub 前端项目（Vue 3 + Vite + TypeScript），负责：

- 服务导航页面与卡片交互
- Docker/系统状态可视化展示
- 内网/外网环境切换与按环境打开地址
- 服务编辑弹窗、图标候选、排序等交互

此仓库是纯前端工程，生产形态为静态文件。

## Features

- 响应式页面（桌面/移动端）
- 右上角悬浮内外网切换
- Docker 卡片资源信息与水位线
- 手动链接与 Docker 服务统一卡片展示
- 保存结果可见反馈（成功/失败）
- 固定顶部品牌栏

## Run (Dev)

```bash
npm install
npm run dev
```

默认通过相对路径访问 `/api/*`，本地开发请确保有后端可访问（代理或同域部署）。

## Build (Prod)

```bash
npm run build
```

构建产物：

- `dist/`

## Docker Build (Build-only Image)

该仓库的 Dockerfile 是“构建产物镜像”，不内置 nginx。

```bash
docker build -t homehub-frontend .
docker run --rm homehub-frontend ls -la /dist
```

说明：

- 镜像内只包含静态文件目录 `/dist`
- 由你现有发布系统或 nginx 将 `/dist` 内容发布到静态站点目录

## Deployment (with existing nginx)

1. 构建前端

```bash
npm run build
```

2. 同步静态文件到你的静态站点目录（示例）

```bash
cp -R dist/. <static_root_dir>/
```

3. nginx 站点建议

- 前端静态根目录指向 `<static_root_dir>`
- `location /` 使用 SPA 回退：`try_files $uri $uri/ /index.html;`
- `location /api/` 反代到 HomeHub 后端

## Environment Behavior

- 切换为 `内网`：只使用 `intranet_url`
- 切换为 `外网`：只使用 `extranet_url`
- 当前模式无对应地址时，前端会给出明确提示，不会静默失败

## Related Repo

- Backend: https://github.com/byron-icefield-studio/HomeHub-backend

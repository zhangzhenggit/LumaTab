# LumaTab · 浮光新页

一个轻量、稳定的 Chrome 新标签页扩展。默认展示 Bing 中国区每日图片，提供固定 Google 搜索、15 列快捷网格、平滑拖放排序和文件夹。

## 当前能力

- Bing 每日图采用缓存优先加载，每 6 小时检查更新；断网或请求失败时使用上次缓存，再回退到内置雪山湖面壁纸。
- 固定尺寸搜索框，输入网址直接打开，其他内容使用 Google 搜索。
- 快捷区没有分类标题和层架横线；桌面每行显示 15 个项目。
- 快速拖动用于换位；拖到现有文件夹会直接加入，悬停普通链接约 650ms 后释放会新建文件夹。
- 文件夹打开后使用居中的紧凑浅色圆角面板。
- 所有自动读取的快捷链接都使用完全相同的通用链路：读取站点根目录图标、页面声明的 `icon` / `shortcut icon` / `apple-touch-icon`，以及 Web App Manifest 图标，全部失败时才生成本地语义符号；不按网站名称或域名预置快捷图标。
- 自动图标与当前导入数据无关：每条用户链接独立解析、独立失败，图片必须通过解码、尺寸和可见像素校验，不使用 Chrome 通用地球占位。
- 自动图标优先显示 LumaTab 的高清缓存；没有缓存时先用 Chrome 官方 favicon 数据库即时显示，适用于访问过的登录站点和内网页面，同时后台继续寻找 Apple Touch、SVG 或 Manifest 大尺寸图标并升级。成功图标保存在 Cache Storage 中 30 天，失败结果缓存 10 分钟。页面空白处右键可以查找高清图标，且不会删除已经成功的缓存。
- Bing 背景维护最近 7 日图片，首次只缓存当前图片，右键切换时按需下载下一张；无需一次下载全部图片。
- 网站图标请求沿用 Chrome 当前的系统代理、PAC 和内外网路由，不在扩展中另设代理。
- 数据保存在 `chrome.storage.local`；开发预览时自动改用 `localStorage`。
- 默认快捷区为空，不附带个人书签或演示链接；可以手动添加，也可以使用转换脚本导入自己的 WeTab 数据。

## 代码结构

```text
src/
  background/       Bing 每日图获取与缓存服务
  components/       搜索、快捷链接、文件夹与弹窗组件
  data/             初始分区和快捷链接
  lib/              背景、图标、URL、持久化逻辑
  App.jsx            页面状态与拖放编排
  styles.css         固定设计令牌和响应式布局
public/
  assets/            内置回退壁纸、扩展图标、站点图标
  manifest.json      Chrome Manifest V3 配置
```

## 开发与构建

```powershell
npm install
npm run dev
npm test
npm run build:extension
```

如需转换 WeTab 导出文件，可以输出到本机任意 JSON 文件，再通过自己的初始化逻辑使用；个人书签文件已被 Git 忽略：

```powershell
npm run convert:wetab -- "C:\path\to\wetab.data" "C:\path\to\shortcuts.json"
```

构建后的可加载扩展位于 `dist/client`。在 `chrome://extensions` 开启开发者模式，选择“加载已解压的扩展程序”，指向该目录。

## 权限说明

- `storage`：保存用户的分区、链接和文件夹结构。
- `http://*/*`、`https://*/*`：新标签页读取用户添加网站公开声明的图标并写入本地缓存；不修改网页内容。
- `https://www.bing.com/*`：获取 Bing 每日图片 JSON 与图片文件，不读取其他站点内容。

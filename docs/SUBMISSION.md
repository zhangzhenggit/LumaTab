# 上架操作清单

从零到提交的完整步骤。文案在 `STORE-LISTING.md`，隐私政策在 `PRIVACY.md`。

---

## 一、生成上架素材（一条命令）

```powershell
npm run store:assets
```

产物在 `dist/store-assets/`：

| 文件 | 用途 | 尺寸 |
| --- | --- | --- |
| `01-home.png` | 主截图 | 1280×800 |
| `02-folder.png` | 分组展开 | 1280×800 |
| `03-settings.png` | 设置面板 | 1280×800 |
| `04-gradient.png` | 纯色背景 | 1280×800 |
| `promo-440x280.png` | 小型宣传图块 | 440×280 |

脚本会临时加载真实构建、填入一批公开网站、截图，然后自己清理干净。

**必须在能上外网的机器上跑。** 图标要现场从各站点抓取；没有外网时会打印
`⚠ 一个真实图标都没取到`，截图里会是字母图标——依然可用，只是不如真实 logo 好看。
如果你的网络走代理，脚本会自动读取 Windows 注册表里的 PAC 地址并传给 Chrome。

想换截图里展示的网站，改脚本顶部的 `DEMO_SITES` 和 `DEMO_FOLDER`。

> 注意：脚本会临时把可选权限改成必需权限，只为了让无头 Chrome 能抓到图标——那正是
> 用户点过「允许」之后的真实状态。这份临时构建在 `.shot-build/`，跑完自动删除，
> **不会**进入上架包。

## 二、生成上架包

```powershell
npm run package
```

产出 `dist/lumatab-<版本>.zip`。打包脚本会拒绝把任何 `data/` 或 `imported-shortcuts`
文件打进去——个人书签不会外泄。上传的就是这个 zip。

## 三、用 GitHub Pages 托管隐私政策

后台要求填一个**公开可访问**的 URL。仓库已经是 `github.com/zhangzhenggit/LumaTab`，
用它的 Pages 最省事，全程免费、无需服务器。

### 3.1 先确认页面是最新的

```powershell
npm run privacy:page
```

这会把 `docs/PRIVACY.md` 渲染成 `docs/index.html`——GitHub Pages 实际提供的就是这个文件。

> 为什么不直接让 Pages 提供 `.md`：Jekyll 只处理带 YAML front matter 的 markdown，
> 裸的 `PRIVACY.md` 会被原样输出，浏览器里看到的是一堆 `#` 和 `|`，不适合交给审核员。
> **`index.html` 是生成产物，不要手改**；要改内容就改 `PRIVACY.md` 再跑一次这条命令。

### 3.2 推送到 GitHub

```powershell
git push origin main
```

### 3.3 开启 Pages

1. 打开 <https://github.com/zhangzhenggit/LumaTab/settings/pages>
2. **Source** 选 `Deploy from a branch`
3. **Branch** 选 `main`，右边的目录下拉选 **`/docs`**
4. 点 **Save**

等 1–2 分钟，页面顶部会出现绿色的 "Your site is live at ..."。地址是：

```
https://zhangzhenggit.github.io/LumaTab/
```

`docs/index.html` 作为目录首页，所以根地址直接就是隐私政策页，不用带文件名。

### 3.4 两个前提条件

- **仓库必须是公开的**（免费账号的 Pages 只支持公开仓库）。在
  Settings → General → 最下方 Danger Zone → `Change repository visibility` 改。
- 公开会连**全部提交历史**一起公开。已经核对过：`public/data/imported-shortcuts.json`
  从未被提交（一直在 `.gitignore` 里），全历史也搜不到内网地址；测试里原本用作示例的
  几个内部系统名也已经换成中性名称。

### 3.5 回填 URL

拿到地址后填到两个地方：

- `docs/STORE-LISTING.md` 详细说明末尾的 `<在这里填你托管后的 URL>`
- 开发者后台「隐私权规范」标签页的「隐私政策网址」字段

### 备选方案

不想公开仓库的话：把 `docs/index.html` 传到任何静态托管（Cloudflare Pages、Vercel、
Netlify 都有免费额度，也都支持私有仓库），拿到的 URL 一样能用。

## 四、在开发者后台提交

<https://chrome.google.com/webstore/devconsole>

1. **首次需要付 5 美元**一次性注册费（如果还没付过）。
2. 「新增项目」→ 上传 `dist/lumatab-<版本>.zip`。
3. **商品详情**标签页：
   - 名称、简短说明、详细说明 → 抄 `STORE-LISTING.md`
   - 类别选「生产工具」，语言选「中文（简体）」
   - 上传截图（至少 1 张，建议 4 张全传）和 440×280 小图块
   - 图标会自动从 manifest 里读取，不用另传
4. **隐私权规范**标签页（最容易被打回的一页，逐项填）：
   - 单一用途说明 → 抄 `STORE-LISTING.md`
   - 逐项填写每个权限的用途说明 → 抄 `STORE-LISTING.md`
   - 「是否使用远程代码」选**否**
   - 数据用途全部选**不收集**，并勾选底部三条声明
   - 填入隐私政策 URL
5. **分发**标签页：选择公开范围与国家/地区。
6. 「提交以供审核」。

## 五、审核期间

- 通常几个工作日；权限说明写得越具体越快。
- 被打回时后台会给出具体条款编号，改完重新提交即可，不用重新走一遍流程。
- 已经把全站访问做成了可选权限，这是审核里最常见的摩擦点，现在应该不会被卡。
  如果仍被问到，回答的依据在 `PRIVACY.md` 和上面的权限用途说明里，两处口径一致。

## 六、上架之后

- 改版本号在 `public/manifest.json` 和 `package.json`，两处要一致。
- 重新 `npm run package`，在后台上传新 zip 即可，商品详情不用重填。
- 功能如果发生了会影响隐私描述的变化，`PRIVACY.md` 必须同步更新——这一点在文件里
  已经写进「政策变更」条款。

# 发布与上架：把 Strata 变成可分发的包

这份文件只回答两件事：**怎么开源**、**怎么进插件市场**。结论先写：

> dsh **没有中心市场，也不内置任何索引源**。所谓"插件市场"就是某个 https 上的一份 JSON 索引
> （format 1），用户在 **插件 → 发现 → 索引源** 里加地址。所以"接入官方市场"= ①把包发到 npm
> （或公开 Git），②拿一份索引指向它，③（可选）把条目提交到社区目录，让公共索引收录你。

## 0. 这个目录已经是什么

仓库根：`C:\Users\86136\Documents\strata`（`package.json` 在根上，可直接当仓库根用）。

`package.json` 里 `dsh.bundle.patch` 指向 `cordis.patch.yml`，patch 只做一件事：插入
`preset-strata` 这一行 `@deepseek-ai/dsh-agent-preset` 声明。没有 JS 入口、没有安装脚本、没有
运行时依赖——纯配置包，这正是最容易过兼容检查、最不容易随 dsh 升级坏掉的那种 bundle。

已完成的检查（可复跑）：

```bash
node scripts/check-index.mjs          # 索引格式自检 → ✓ index ok
npm pack --dry-run                    # 11 个文件，patch / locale / docs / icon 全在
```

```powershell
(Get-FileHash cordis.patch.yml -Algorithm SHA256).Hash
# 必须等于运行中那份 seek/mod/cordis.patch.yml 的 181B3599…；不等就说明这份 patch 落后了
```

## 1. 发布前必须补的两处

| 位置 | 现在 | 改成 |
|---|---|---|
| `package.json`、`market/index.json`、`LICENSE` 里的 `OWNER` | 占位 | 你的 GitHub 用户名 —— 一条命令：`node scripts/set-owner.mjs <用户名>` |
| `package.json` 的 `name` | `dsh-strata-preset` | 若 npm 上已被占用：`@<scope>/dsh-strata-preset`（scoped 包发布要加 `--access public`） |

确认名字可用（注意本机 `~/.npmrc` 把 registry 指向已下线的 `http://registry.cnpmjs.org/`，得显式换掉）：

```bash
npm view dsh-strata-preset version --registry=https://registry.npmjs.org
# 报 404 / E404 才是空的
```

## 2. 开源：三种发法，按本机条件选

本机**没装 git**，`gh` 也没有，浏览器里存着 GitHub 账号密码。三条路的代价不一样：

### A. 浏览器上传（零依赖，最快）

1. GitHub → **New repository** → 名字 `dsh-strata-preset` → **Public** → **不要**勾 Add README /
   .gitignore / license（否则要解决冲突）。
2. 仓库页 → **Add file → Upload files** → 把 `C:\Users\86136\Documents\strata` 里的**内容**（不是
   文件夹本身）拖进去 → Commit。
3. 之后再改，还是同一条路：拖新文件覆盖。

代价：没有提交历史，每次更新是"整包替换"。够用就先这么干。

### B. 装 Git 再推（有历史，推荐长期用）

```powershell
winget install --id Git.Git -e --source winget     # 装完重开终端
cd C:\Users\86136\Documents\strata
git init; git add -A; git commit -m "Strata preset 2.2.0"
git branch -M main
git remote add origin https://github.com/<用户名>/dsh-strata-preset.git
git push -u origin main
```

**注意**：GitHub 早已停用密码认证，浏览器里存的密码给不了 `git push`。第一次 push 会弹
Git Credential Manager 的浏览器授权窗口，走一次 OAuth 即可（那一步用的是你已经登录的浏览器，
不算重新输密码）。或者去 GitHub → Settings → Developer settings → **Personal access token**
建一个 `repo` 权限的 token，把它当密码填。

### C. 发布到 npm

需要 npm 账号登录（`npm login`，或建 `~/.npmrc` 写 `//registry.npmjs.org/:_authToken=...`）。
本机 npm 是 6.14 + 死掉的 registry，装包/发布前都必须显式指定 registry：

```bash
npm publish --registry=https://registry.npmjs.org
```

发完立刻自装一遍——**这是唯一能证明"别人装得上"的证据**：

```bash
dsh plugin --profile <一个新的 profile> add dsh-strata-preset --registry https://registry.npmjs.org
```

或者本机 **插件 → 添加插件** 里填包名，装完**开新会话**，模式列表里应出现 **Strata 层积**。

> 如果你机器上还装着 `@local/dsh-strata-preset`（`link:` 那份），两个包会插入**同一个** Loader 行
> `preset-strata`。先卸载旧的再装新包，否则会出现"谁覆盖谁"的假象。

## 3. 上架：准备索引

索引是**一份 JSON + 一个 icons 目录**，放任意静态托管（GitHub Pages / jsDelivr / 对象存储）。
本仓库的 `market/index.json` 已经写好，`market/icons/strata.svg` 就在旁边，用相对路径引用。

三条路，按省事程度排：

**A. npm 上的索引（最快，且不受 15 秒超时拖累）**
把 `market/` 作为一个小包发布（例如 `dsh-plugin-catalog-strata`），用户添加
`https://cdn.jsdelivr.net/npm/<包名>/index.json`。dsh 给索引源的超时是 15 秒，GitHub Pages 在部分
网络下会超时，jsDelivr 不会。

**B. GitHub Pages / 任意静态站**
用户添加 `https://<用户名>.github.io/dsh-strata-preset/index.json`。要求：UTF-8、2xx、**不重定向**、
`https:`（`http:` 索引路径上任何人可改，包括它给出的安装 spec）。用 Pages 时把 `market/` 发布到
站点根，或用 `/market/` 子路径。

**C. 官方参考生成器**（dsh 仓库里有 `apps/plugin-market-generator`）
喂一个纯文本列表（每行一个 npm 包名或 https Git 地址），它自己拉元数据、算版本、生成
`index.json` 和 `icons/`：

```bash
pnpm --filter @deepseek-ai/dsh-plugin-market-generator start \
  --input plugins.txt --output site/index.json --title "Strata"
```

生成器只读不装、不执行包代码。发版后重跑一次即可。

发索引前跑一遍自检（生成器输出同样适用）：

```bash
node scripts/check-index.mjs market/index.json
```

## 4. 进公共目录（真正意义上的"被市场收录"）

dsh 官方不运营商店，社区目录充当了市场：`awesome-dsh-plugin/awesome-dsh-plugin`。它把条目渲染成
format-1 索引，发布在 `https://cdn.jsdelivr.net/npm/dsh-plugin-catalog/index.json`，
`awesome-dsh-plugin.com/index.json`、`dshmarket.com/index.json` 是同一份的镜像；`dshmarket` 这类
第三方市场客户端订阅的也是它。

做法：fork，加 `data/plugins/<owner>__<repo>.yml`，提 PR。字段照现有条目（**提交前以该仓库的
CONTRIBUTING 为准**，下面的形状来自本机核对过的一条真实条目）：

```yaml
url: https://github.com/<用户名>/dsh-strata-preset
name: <用户名>/dsh-strata-preset
category: presets
description:
  en: 'One or two sentences: what it does, what it needs, what it refuses to do.'
  zh: '一两句话：做什么、需要什么、不做什么。'
icon: https://raw.githubusercontent.com/<用户名>/dsh-strata-preset/main/icon.svg
```

要点：

- 目录只收**发布在 npm 上、有明确版本**的插件；只在 GitHub 上的条目仍可安装，但不会进索引。
- `category` 必须是目录里已声明的分类 id（不是随便写）。
- 名字/描述要写清"它挂的是什么"——preset 不是工具，装完要在模式列表里选，别让人以为装完就生效。

## 5. 每次发版

1. 改 `package.json` 的 `version`（同时改 patch 头部注释与 README 的版本号）。
2. `npm publish --registry=https://registry.npmjs.org`。
3. 重跑索引生成（或手改 `market/index.json`）：加一条 `versions[]`，`publishTimestamp` 是**发布
   时刻的 unix 秒**，`source.type: "npm"`，`engines.dsh` 与包里的 `engines.dsh` **保持一致**——市场
   用它算兼容性，安装时 dsh 还会再查一遍包自己的声明。
4. `node scripts/check-index.mjs market/index.json`，推托管，等缓存（dsh 默认缓存 10 分钟）。
5. Git 版条目额外要求 `commit` 固定成 40 位 sha；分支/标签形式的 Git spec 不可更新。

## 6. 兼容性怎么守

- `engines.dsh: ">=0.2.2-rc.3"` 是**测过的下界**，不是能跑的边界。dsh 版本不满足时安装会被拒。
- 真正的风险是**工具包改名**：patch 挂的是随 dsh 发行的 `@deepseek-ai/dsh-*`，包本身不声明依赖
  （bundle 的推荐做法）。某个包被改名或删除时，这行会解析失败、模式无法激活。每次 dsh 大版本升级
  后跑一遍：装一次、开新会话、看模式能不能选中、persona 首段对不对。
- 已验证 / 未验证要分开写。当前：YAML 与索引格式已机器校验；**运行时行为、他人机器上的安装、市场
  页面渲染都未验证**。

## 7. 上架前清单

- [ ] `node scripts/set-owner.mjs <用户名>` 跑过，`LICENSE` 版权行是真名
- [ ] `npm view <name> --registry=https://registry.npmjs.org` 确认包名可用
- [ ] 仓库已公开（浏览器上传或 git push）
- [ ] `node scripts/check-index.mjs` 通过
- [ ] 索引托管是 https、不重定向、`icons/` 可访问
- [ ] 在 **插件 → 发现** 里用自己的索引地址装一遍（市场路径的唯一验收）
- [ ] 新会话选中 Strata，首段是「你手上的东西都是像，不是对象本身」
- [ ] 社区目录 PR（可选）

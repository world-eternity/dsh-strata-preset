# Strata（层积）· dsh-strata-preset

一个 DeepSeek Harness **agent preset**（打包成 config-only bundle）。

它把一句话落成行动纪律：**你手上的东西都是像，不是对象本身；你能主动改的只有投影核；判定只在把核
施加到世界上的那一刻出现。** 每个任务都是同一条回路的一圈：

> 报像 → 断言核 → 预登记判据 → 行动 → 用新像回来

模式只写能在**一次任务里被违反**的部分。一条规则如果在一次任务里无法被执行、也无法被违反，它就不
该出现在 preset 里。

- 它不是一个新工具。装完只多一个模式选项，**要在新会话里选中它**才生效。
- 它是纯配置包：没有 JS 入口、没有安装脚本、没有运行时依赖。
- 它不声明任何 Host 服务，不改已有会话；已有会话保持启动时的插件版本。

## 装完你得到什么

| 部分 | 落到会话里的东西 |
|---|---|
| persona | 回路本身；两档长度门槛（可回滚的局部改动写一行结论，不可逆／跨版本·层级·作用域走全套）；六个失败词 |
| 失败轴 | 狭窄／畸变／无解／不稳定／前向模型错／选择偏差——每个都配着能把它和邻居分开的那支探针 |
| 更新闸门 | 先写干预作用在**哪一侧**（装置侧／对象侧），再归成伪影／假象／真象／未定 |
| 单向对 | 被禁止的是"返回"，不是读数；反向路径由一条**在换核之前**写定的上界 ε 限定 |
| 工具面 | 文件（read/write/edit/图片）、shell 与持久终端、后台任务、定时、技能、目标、计划模式、压缩、子代理／workflow／ralph、会话查询、web、todo、present |

Host 已经全局提供的（插件管理、Cordis 检视、Office 技能、web provider）**故意不重复挂载**，重复挂
会产生同名工具或重复服务。

## 安装

**1. 从插件索引（发现）**

打开 **插件 → 实验性插件 → 自定义插件索引**，进 **发现** 标签，添加索引源，然后装 *Strata*。
本仓库自带一份 format-1 索引 `market/index.json`，托管到 https 之后把那个地址填进去即可，见
[`PUBLISH.md`](PUBLISH.md)。

**2. 直接装 npm 包**

```bash
dsh plugin --profile <profile> add dsh-strata-preset
```

**3. 装本地目录**

```
plugin_manager { action: install_bundle, target: <本目录的绝对路径> }
```

或 **插件 → 添加插件** 选目录。装 bundle 会在 Host 进程里执行插件代码，因此需要 Full access 或本次
调用的批准。

装完**开一个新会话**，在模式列表里选 **Strata 层积**。

## 兼容性

`engines.dsh: >=0.2.2-rc.3`，这是本 preset 被撰写与实跑过的版本下界。patch 挂的是随 dsh 发行的
`@deepseek-ai/dsh-*` 包，从 dsh 安装目录解析，所以**唯一会把它弄坏的是工具包改名或删除**；dsh 会在
安装时拒掉不满足 `engines.dsh` 的版本，在激活时拒掉解析不出的行。

Windows 与 POSIX 只差一处：`tool-bash` 在 win32 下禁用，`tool-pwsh` 在非 win32 下禁用。

## 目录

| 文件 | 作用 |
|---|---|
| `package.json` | bundle 清单；`dsh.bundle.patch` 指向下面那份 patch |
| `cordis.patch.yml` | preset 声明与插件行（**模式本体全在这里**） |
| `locale/{en,zh}.json` | 插件管理器不激活也能读的展示元信息 |
| `docs/DETAIL*.md`、`docs/preview.svg` | **插件**／**发现** 页里的详情页 |
| `docs/THEORY.md` | 理论如何逐条落到模式里 |
| `market/index.json` | 列出本包的 format-1 插件索引 |
| `scripts/check-index.mjs` | 索引结构自检，发版前跑 |
| `scripts/set-owner.mjs` | 一次性替换所有 `OWNER` 占位符 |
| `PUBLISH.md` | 发布、索引托管、上架社区目录的步骤 |

## 边界与注意

- **preset 不是沙箱**：patch 以 Host 的权限运行。
- persona 是中文写的；工具面与语言无关。
- 已验证：YAML 与索引格式机器校验通过、patch 与运行中的工作副本逐字节同哈希。
  **未验证**：他人机器上的安装、市场页面渲染、长时间运行的行为。

## English summary

A config-only DeepSeek Harness agent preset. It declares one `@deepseek-ai/dsh-agent-preset` row
(`id: strata`, `order: 5`) plus a per-agent tool surface, and turns a single idea into an action
discipline: report the image, assert the kernel, pre-register the criterion, act, come back with a
new image — with six failure modes on three axes, an update gate, and one-way pairs bounded by a
pre-registered ε. Install it, then pick **Strata** in a new session. No Host services, no install
scripts, no runtime dependencies. Compatible with dsh `>= 0.2.2-rc.3`. MIT.

## 许可

MIT，见 [LICENSE](LICENSE)。

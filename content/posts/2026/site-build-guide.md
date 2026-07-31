---
title: 启日月星博客搭建全记录与操作指南
date: 2026-07-17T02:50:00
category: 技术
type: tech
image: /20230707170607705.jpg
---

本文记录了「启日月星」博客从零搭建的完整过程，并整理了日常运营所需的各项操作指南，方便后续维护和内容创作。

---

## 一、网站搭建过程

### 1.1 技术选型

本博客基于 [L33Z22L11/blog-v3](https://github.com/L33Z22L11/blog-v3)（Clarity 主题）构建，核心技术栈：

| 层面 | 技术 |
|------|------|
| 框架 | Nuxt 4 |
| 内容管理 | Nuxt Content v3（基于 Markdown） |
| 语言 | TypeScript + Vue 3 + SCSS |
| 包管理 | pnpm |
| 评论系统 | Twikoo |
| 统计 | Umami（预留） |
| 部署 | 支持 Vercel / Netlify / Cloudflare Pages（SSG 静态生成） |

### 1.2 初始化步骤

**克隆项目并安装依赖：**

```bash
git clone https://github.com/L33Z22L11/blog-v3.git main
cd main
pnpm install
```

**核心配置修改（`blog.config.ts`）：**

```ts
const basicConfig = {
  title: '启日月星',
  subtitle: '分析技术与兴趣',
  description: '启日月星的个人博客，分享技术与兴趣。',
  author: {
    name: '明久',
    avatar: '/avatar.jpg',
    email: 'smshnsj@163.com',
    homepage: 'https://github.com/ming520721',
  },
  favicon: '/logo.png',
  language: 'zh-CN',
  timeEstablished: '2026-07-28',
  timeZone: 'Asia/Shanghai',
  url: 'https://phosphorus.dpdns.org',
}
```

**外观配置（`app/app.config.ts`）：**
- 左侧栏导航：文章、友链、归档
- 页脚：GitHub、邮箱、特别鸣谢纸鹿摸鱼处
- 统计出生年份：`birthYear: 2006`
- 友链随机排序、主题切换（浅色/深色/跟随系统）

**配色方案（`app/assets/css/color.scss`）：**

| 角色 | 色值 |
|------|------|
| 背景 | #F8FAFC / #FFFFFF |
| 主文字 | #0F172A → #374151 |
| 辅助文字 | #64748B |
| 主色 | #2563EB |
| 悬停 | #1D4ED8 |
| 代码背景 | #F3F4F6 |
| 分割线 | #E5E7EB |

### 1.3 启动与构建

**开发模式：**

```bash
set PATH=F:\node.js;F:\blog\npm-global;%PATH%
cd /d F:\blog\main
pnpm dev
```

浏览器访问 `http://localhost:3000`，修改文件后自动热更新。

**生成静态站点（部署用）：**

```bash
pnpm generate
```

生成的静态文件在 `dist/` 目录，可部署到任意静态托管平台。

---

## 二、文章操作指南

### 2.1 新建文章

**方式一：命令行创建（推荐）**

```bash
cd /d F:\blog\main
set PATH=F:\node.js;F:\blog\npm-global;%PATH%
pnpm new 文章标题
```

自动在 `content/posts/当前年份/` 下生成带模板的 `.md` 文件。

**方式二：手动创建**

在 `content/posts/年份/` 目录下新建 `.md` 文件，填写 frontmatter 后写正文。

### 2.2 文章 Frontmatter 配置

每篇文章顶部的 `---` 包裹区域为 frontmatter，用于配置文章元信息：

```yaml
---
title: 文章标题              # 必填
date: 2026-07-17            # 必填，格式 YYYY-MM-DD
updated: 2026-07-18         # 可选，最后更新日期
category: 技术              # 可选，分类名
type: tech                  # 可选，tech=技术排版 / story=故事排版
image: /封面图.jpg           # 可选，封面图片路径
description: 文章摘要        # 可选，显示在文章列表
---
```

**分类说明：**

| 分类 | 图标 | 适用场景 |
|------|------|---------|
| 技术 | tabler:mouse | 工具/系统/部署/排障 |
| 开发 | tabler:code | 编程/工程实践 |
| 安全 | tabler:bug | 漏洞/CTF/安全分析 |
| 杂谈 | tabler:message | 观点讨论/复盘反思 |
| 生活 | tabler:leaf | 个人经历/日常记录 |
| 未分类 | tabler:circle-dashed | 默认分类 |

**排版类型说明：**
- `tech`（默认）：标题左对齐，正文无缩进，适合技术文章
- `story`：标题居中且使用衬线体，正文有缩进，适合叙事类文章

### 2.3 添加文章封面

**步骤一：准备图片**

将封面图片复制到 `public/` 目录下，建议：
- 格式：JPG / WebP / PNG
- 尺寸：推荐 1200×630 左右
- 大小：控制在 500KB 以内

**步骤二：在 frontmatter 中引用**

```yaml
image: /my-cover.jpg
```

**封面展示效果：**
- **首页列表**：封面显示在文章卡片右侧（宽屏）或顶部（窄屏/手机）
- **文章详情页**：封面全宽显示在标题上方
- **精选轮播**：封面作为轮播图背景

### 2.4 编辑与更新文章

1. 直接编辑 `content/posts/` 下对应的 `.md` 文件
2. 修改 `updated` 字段记录更新日期
3. 保存后浏览器自动刷新，无需重启

### 2.5 删除文章

直接删除对应的 `.md` 文件即可。如文章已被搜索引擎收录，可在 `redirects.json` 中添加旧路径到新路径的重定向。

---

## 三、友链管理指南

### 3.1 友链文件位置

友链数据文件：`app/feeds.ts`

### 3.2 添加友链

在 `feeds.ts` 中对应的分组 `entries` 数组内添加新条目：

```ts
{
  author: '博主昵称',
  sitenick: '站点简称',
  title: '博客名称',
  desc: '博客描述',
  link: 'https://example.com/',
  feed: 'https://example.com/atom.xml',   // 可选
  icon: 'https://example.com/favicon.ico',
  avatar: 'https://example.com/avatar.jpg',
  archs: ['Hexo', 'Vercel'],               // 框架和托管平台
  date: '2026-07-17',                      // 添加日期
  comment: '好友描述或备注',
}
```

保存后友链页面自动更新。

### 3.3 添加友链分组

如需新建分组，在 `feeds.ts` 数组中添加：

```ts
{
  name: '分组名称',
  desc: '分组描述',
  entries: [
    // 友链条目...
  ],
}
```

### 3.4 友链申请表单

友链页面的申请说明在 `content/link.md` 中编辑。用户可通过评论区留言或发送邮件到 `smshnsj@163.com` 提交友链申请。

### 3.5 友链展示设置

在 `app/app.config.ts` 中调整友链相关配置：

```ts
link: {
  remindNoFeed: true,   // 无订阅源的站点显示静音图标
  randomInGroup: true,  // 分组内随机排序
},
```

---

## 四、主题与外观调整

### 4.1 切换主题模式

点击左下角主题切换按钮，支持三种模式：
- 浅色模式（太阳图标）
- 深色模式（月亮图标）
- 跟随系统（桌面图标）

### 4.2 修改配色

编辑 `app/assets/css/color.scss`：

```scss
:root,
.light {
  --hue-theme: 221deg;           // 主色调
  --c-text: hsl(221 47% 11%);    // 标题文字
  --c-text-1: hsl(217 19% 27%);  // 正文
  --c-text-2: hsl(215 14% 47%);  // 辅助文字
  --c-bg: hsl(0 0% 100%);        // 卡片背景
  --c-bg-1: hsl(210 40% 98%);    // 页面背景
  --c-primary: hsl(221 83% 53%); // 链接/按钮
}
```

### 4.3 修改导航菜单

编辑 `app/app.config.ts` 中 `nav` 部分：

```ts
nav: [
  {
    title: '',
    items: [
      { icon: 'tabler:files', text: '文章', url: '/' },
      { icon: 'tabler:link', text: '友链', url: '/link' },
      { icon: 'tabler:archive', text: '归档', url: '/archive' },
    ],
  },
]
```

图标可从 [Iconify](https://yesicon.app/tabler) 搜索。

### 4.4 修改页脚信息

编辑 `app/app.config.ts` 中 `footer` 部分，可调整：
- 版权声明
- 侧边栏底部图标导航
- 页脚站点地图链接

---

## 五、评论与统计配置

### 5.1 Twikoo 评论系统

**部署 Twikoo 服务端：**

参考 [Twikoo 文档](https://twikoo.js.org/) 部署到 Vercel / Netlify / Cloudflare 等平台。

**配置博客：**

编辑 `blog.config.ts`：

```ts
twikoo: {
  envId: 'https://你的twikoo地址/',     // 替换为你的 Twikoo 服务地址
  preload: 'https://你的twikoo地址/',   // 同上
},
```

评论功能会自动出现在每篇文章底部和友链页面。

### 5.2 Umami 访问统计

**部署 Umami：**

参考 [Umami 文档](https://umami.is/) 部署统计服务。

**配置博客：**

编辑 `blog.config.ts` 中 `scripts` 部分，取消注释并填入：

```ts
scripts: [
  {
    src: 'https://你的umami地址/umami.js',
    'data-website-id': '你的网站ID',
    defer: true,
  },
],
```

---

## 六、部署上线

### 6.1 部署前检查

1. 修改 `blog.config.ts` 中的 `url` 为实际域名
2. 配置 Twikoo 和 Umami（如使用）
3. 确认头像、Logo、封面图等资源路径正确

### 6.2 部署到 Vercel（推荐）

1. 将项目推送到 GitHub 仓库
2. 在 [Vercel](https://vercel.com/) 导入该仓库
3. 构建设置：
   - Framework: **Nuxt.js**
   - Build Command: `pnpm generate`
   - Output Directory: `dist`
4. 绑定自定义域名

### 6.3 部署到其他平台

支持 Netlify、Cloudflare Pages、EdgeOne 等，构建命令均为 `pnpm generate`，输出目录 `dist`。

---

## 七、日常维护

### 7.1 更新依赖

```bash
cd /d F:\blog\main
set PATH=F:\node.js;F:\blog\npm-global;%PATH%
pnpm bump    # 更新所有依赖到最新版本
```

### 7.2 更新 Clarity 主题

```bash
git pull origin main    # 拉取上游项目更新
pnpm install            # 安装可能新增的依赖
```

注意：拉取前请先备份你的配置文件（`blog.config.ts`、`app/app.config.ts`、`feeds.ts`、`color.scss`）。

### 7.3 备份建议

- 文章内容（`content/posts/`）推送到 GitHub
- 配置文件（`blog.config.ts`、`app.config.ts`）做好版本管理
- 图片资源做好本地和云端双备份

---

## 附录：目录结构速查

```
blog/main/
├── blog.config.ts          # 站点核心配置（名称、作者、评论等）
├── app/
│   ├── app.config.ts       # UI配置（导航、页脚、统计等）
│   ├── feeds.ts            # 友链数据
│   └── assets/css/
│       └── color.scss      # 配色方案
├── content/
│   ├── posts/              # 文章目录（按年份分文件夹）
│   ├── link.md             # 友链申请说明
│   └── theme.md            # 主题文档页
├── public/                 # 静态资源（图片、字体等）
├── nuxt.config.ts          # Nuxt配置（一般无需修改）
└── redirects.json          # URL重定向映射
```

---

> 博客搭建于 2026 年 7 月，基于 Clarity 主题。特别鸣谢 [纸鹿摸鱼处](https://blog.zhilu.site/)。

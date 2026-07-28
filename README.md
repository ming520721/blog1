# 启日月星

分析技术与兴趣 —— 记录技术学习与生活点滴。

基于 [Nuxt](https://nuxt.com/) + [Nuxt Content](https://content.nuxt.com/) 构建的个人博客。

## 感谢

- 主题基于 [纸鹿摸鱼处](https://blog.zhilu.site/) 的 Clarity 主题 ([blog-v3](https://github.com/L33Z22L11/blog-v3))
- 设计风格参考 [Stellar](https://github.com/xaoxuu/hexo-theme-stellar)

## 本地开发

```sh
pnpm i
pnpm dev
```

## 构建部署

```sh
pnpm generate    # 生成静态站点到 .output/public
pnpm preview     # 本地预览构建结果
```

支持 Vercel、EdgeOne Pages 等平台部署，构建命令 `pnpm generate`，输出目录 `.output/public`。

## 许可证

- 项目代码：[MIT](LICENSE)
- 博客文章：[CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/deed.zh-hans)

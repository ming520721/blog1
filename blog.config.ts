import type { FeedEntry } from './app/types/feed'

const basicConfig = {
	title: '启日月星',
	subtitle: '分析技术与兴趣',
	description: '启日月星的个人博客，分享技术与兴趣。记录技术学习与生活点滴，探索编程、工具、安全等领域的知识与实践。',
	author: {
		name: '明久',
		avatar: '/avatar.jpg',
		email: 'smshnsj@163.com',
		homepage: 'https://github.com/ming520721',
	},
	copyright: {
		abbr: 'CC BY-NC-SA 4.0',
		name: '署名-非商业性使用-相同方式共享 4.0 国际',
		url: 'https://creativecommons.org/licenses/by-nc-sa/4.0/deed.zh-hans',
	},
	favicon: '/logo.jpg',
	language: 'zh-CN',
	timeEstablished: '2026-07-28',
	timeZone: 'Asia/Shanghai',
	url: 'https://phosphorus.dpdns.org',
	defaultCategory: '未分类',
}

// 存储 nuxt.config 和 app.config 共用的配置
// 此处为启动时需要的配置，启动后可变配置位于 app/app.config.ts
// @keep-sorted
const blogConfig = {
	...basicConfig,

	article: {
		categories: {
			[basicConfig.defaultCategory]: { icon: 'tabler:circle-dashed' },
			技术: { icon: 'tabler:mouse', color: '#33aaff' },
			开发: { icon: 'tabler:code', color: '#7777ff' },
			安全: { icon: 'tabler:bug', color: '#ff7733' },
			杂谈: { icon: 'tabler:message', color: '#33bbaa' },
			生活: { icon: 'tabler:leaf', color: '#ff7777' },
		},
		types: {
			tech: {},
			story: {},
		},
		order: {
			date: '创建日期',
			updated: '更新日期',
		},
		useRandomPremalink: false,
		hidePostPrefix: true,
		robotsNotIndex: ['/preview', '/previews/*'],
	},

	/** 博客 Atom 订阅源 */
	feed: {
		limit: 50,
		enableStyle: true,
	},

	/** 向 <head> 中添加脚本 */
	scripts: [
		// Umami 统计（后续部署时替换为自己的 Umami 服务地址）
		// { 'src': 'https://your-umami.example.com/umami.js', 'data-website-id': 'your-website-id', 'defer': true },
		// Twikoo 评论系统
		{ src: 'https://cdnjs.snrat.com/ajax/libs/twikoo/1.7.13/twikoo.min.js', defer: true },
	],

	/** Twikoo 评论服务（后续部署时替换） */
	twikoo: {
		envId: 'https://twikoo-plum-delta.vercel.app/',
		preload: 'https://twikoo-plum-delta.vercel.app/',
	},
}

/** 用于生成 OPML 和友链页面配置 */
export const myFeed: FeedEntry = {
	author: blogConfig.author.name,
	sitenick: '启日月星',
	title: blogConfig.title,
	desc: blogConfig.subtitle || blogConfig.description,
	link: blogConfig.url,
	feed: new URL('/atom.xml', blogConfig.url).toString(),
	icon: blogConfig.favicon,
	avatar: blogConfig.author.avatar,
	archs: ['Nuxt', 'Vercel'],
	date: blogConfig.timeEstablished,
	comment: '这是我自己',
}

export default blogConfig

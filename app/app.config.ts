import type { Nav, NavItem } from '~/types/nav'
import { pascalCase } from 'es-toolkit/string'
import { Temporal } from 'temporal-polyfill'
import blogConfig from '~~/blog.config'
import { name, version } from '~~/package.json'

// 图标查询：https://yesicon.app/tabler
// 图标插件：https://marketplace.visualstudio.com/items?itemName=antfu.iconify

// @keep-sorted
export default defineAppConfig({
	// 将 blog.config 中的配置项复制到 appConfig，方便调用
	...blogConfig,

	component: {
		alert: {
			/** 默认使用卡片风格还是扁平风格 */
			defaultStyle: 'card' as 'card' | 'flat',
		},

		codeblock: {
			triggerRows: 32,
			collapsedRows: 16,
			enableIndentGuide: true,
			indent: 4,
			tabSize: 3,
		},

		excerpt: {
			animation: true,
			caret: '_',
		},

		slide: {
			showTitle: true,
		},

		stats: {
			birthYear: 2006,
			wordCount: '约1万',
		},
	},

	// @keep-sorted
	footer: {
		/** 页脚版权信息，支持 <br> 换行等 HTML 标签 */
		copyright: `© ${Temporal.Now.plainDateISO().year.toString()} ${blogConfig.author.name}`,
		/** 侧边栏底部图标导航 */
		iconNav: [
			{ icon: 'tabler:brand-github', text: 'GitHub: ming520721', url: 'https://github.com/ming520721' },
			{ icon: 'tabler:mail', text: blogConfig.author.email, url: `mailto:${blogConfig.author.email}` },
		] satisfies NavItem[],
		/** 页脚站点地图 */
		nav: [
			{
				title: '社交',
				items: [
					{ icon: 'tabler:brand-github', text: 'ming520721', url: 'https://github.com/ming520721' },
					{ icon: 'tabler:mail', text: blogConfig.author.email, url: `mailto:${blogConfig.author.email}` },
				],
			},
			{
				title: '信息',
				items: [
					{ icon: 'simple-icons:nuxt', text: `主题: ${pascalCase(name)} ${version}`, url: 'https://github.com/L33Z22L11/blog-v3' },
					{ icon: 'tabler:color-swatch', text: '主题和组件文档', url: '/theme' },
					{ icon: 'tabler:heart', text: '特别鸣谢: 纸鹿摸鱼处', url: 'https://blog.zhilu.site/' },
				],
			},
		] satisfies Nav,
	},

	/** 左侧栏顶部 Logo */
	header: {
		logo: '/avatar.jpg',
		showTitle: true,
		subtitle: blogConfig.subtitle,
		emojiTail: ['🌟', '🌙', '☀️', '📝', '💻'],
	},

	/** 友链页面 */
	link: {
		remindNoFeed: true,
		randomInGroup: true,
	},

	/** 左侧栏导航 */
	nav: [
		{
			title: '',
			items: [
				{ icon: 'tabler:files', text: '文章', url: '/' },
				{ icon: 'tabler:link', text: '友链', url: '/link' },
				{ icon: 'tabler:archive', text: '归档', url: '/archive' },
			],
		},
	] satisfies Nav,

	pagination: {
		perPage: 10,
		sortOrder: 'date' as keyof typeof blogConfig.article.order,
		allowAscending: false,
	},

	themes: {
		light: {
			icon: 'tabler:sun',
			tip: '浅色模式',
		},
		system: {
			icon: 'tabler:device-desktop',
			tip: '跟随系统',
		},
		dark: {
			icon: 'tabler:moon',
			tip: '深色模式',
		},
	},
})

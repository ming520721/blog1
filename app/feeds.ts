import type { FeedGroup } from '../app/types/feed'
import { myFeed } from '../blog.config'

export default [
	{
		name: '友情链接',
		desc: '欢迎交换友链，一起交流技术与生活。',
		entries: [
			myFeed,
			{
				author: '纸鹿本鹿',
				sitenick: '摸鱼处',
				title: '纸鹿摸鱼处',
				desc: '纸鹿至麓不知路，支炉制露不止漉',
				link: 'https://blog.zhilu.site/',
				feed: 'https://blog.zhilu.site/atom.xml',
				icon: 'https://www.zhilu.site/api/icon.png',
				avatar: 'https://www.zhilu.site/api/avatar.png',
				archs: ['Nuxt', 'Vercel'],
				date: '2019-07-19',
				comment: '特别鸣谢：Clarity 博客主题作者，本网站的技术基础。',
			},
		],
	},
] satisfies FeedGroup[]

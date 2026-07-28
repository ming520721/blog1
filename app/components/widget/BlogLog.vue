<script setup lang="ts">
const { timeEstablished } = useAppConfig()

const blogLog = [
	{ label: timeEstablished, value: '启日月星博客上线，使用 Clarity 主题' },
]
</script>

<template>
<BlogWidget card title="更新日志">
	<ZDlGroup size="large" :items="blogLog" />
</BlogWidget>
</template>

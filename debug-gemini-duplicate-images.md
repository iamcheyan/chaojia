# Debug Session: gemini-duplicate-images

Status: [OPEN]

## Symptom
- Gemini 请求两张图时，左侧聚合区域最终显示四张图。
- 现象表现为图片重复，通常像是每张图被抓取了两次。

## Expected
- 左侧应只显示 Gemini 实际返回的两张图，不应重复。

## Hypotheses
- H1: 单个激活 slide 同时暴露原图地址和预览图地址，当前抓图把两者都计入了结果。
- H2: 轮播遍历过程中，同一 slide 在切换前后被以不同 URL 形式重复收集。
- H3: 最终 HTML 同时拼接了轮播抓取结果和正文里的图片节点，导致二次注入。
- H4: 左侧渲染阶段在图片分组时重复搬运了某些节点，造成 DOM 内重复显示。

## Plan
- 给 Gemini 抓图链路加最小化运行时埋点，记录每个 slide 实际收集到的 URL。
- 让用户复现一次，检查是抓取重复还是渲染重复。
- 基于日志只做最小修复，并再做一次 post-fix 验证。

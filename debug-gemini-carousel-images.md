# Debug Session: gemini-carousel-images

Status: [OPEN]

## Symptom
- 右侧 Gemini 回复里是可左右切换的多图轮播
- 左侧聚合消息当前只能显示其中一张图

## Expected
- 左侧应把 Gemini 这条回复里的整组图片都抓回来，而不是只取当前激活的一张

## Hypotheses
1. Gemini 的多图由轮播 slide 结构承载，当前抓取器只拿到 active slide
2. 其他图片存在于非激活节点或 `aria-hidden` 节点，当前容器选择遗漏
3. 图片资源藏在缩略图/按钮层，当前跳过交互节点时被连带裁掉
4. 轮播的其余图片在首图后延迟插入，observer 提前结束导致漏抓

## Plan
1. 启动 Debug Server
2. 仅添加 Gemini 抓取链路埋点，不修改业务逻辑
3. 让用户复现一条 Gemini 多图轮播回复
4. 根据日志判断图片丢失层级与真实 DOM 结构
5. 基于证据做最小修复

## Evidence
- 用户提供的 Gemini HTML 片段显示当前回复中只有一个 `single-image`
- 当前可见大图地址挂在 `.image-container[data-full-size-image-uri]`
- 轮播页数通过 `.carousel-dots .dot` 表达，而不是多个并列 `img`
- 这说明静态扫描当前 DOM 只能拿到当前激活页，无法直接获得整组轮播图

## Fix Direction
- 在 Gemini 最终回复抓取阶段识别 `image-carousel`
- 自动遍历轮播控件，逐页收集 `data-full-size-image-uri` / 当前图片地址
- 收集完成后恢复到用户原本所在页

# PRD: MultiChat 扩展更多 AI 聊天网站支持

## Introduction

MultiChat 目前支持 ChatGPT 和 Gemini 两个 AI 聊天平台。本 PRD 旨在规划扩展支持更多主流 AI 聊天网站，让用户能够在一个界面中同时与多个不同来源的 AI 进行对话和比较。

### 当前支持

| 平台 | 网站 | 状态 |
|------|------|------|
| ChatGPT | chatgpt.com / chat.openai.com | ✅ 已支持 |
| Gemini | gemini.google.com | ✅ 已支持 |

---

## 可扩展支持的 AI 聊天平台

### 第一优先级（主流国际平台）

| 平台 | 网站 | 优先级 | 难度 | 说明 |
|------|------|--------|------|------|
| **Claude** | claude.ai | 🔴 高 | 中 | Anthropic 的 AI，用户量大，界面简洁 |
| **Perplexity** | perplexity.ai | 🔴 高 | 中 | AI 搜索引擎，带引用来源 |
| **Microsoft Copilot** | copilot.microsoft.com | 🟡 中 | 中 | 微软 AI，集成 Bing 搜索 |
| **Grok** | grok.com | 🟡 中 | 中 | xAI 的 AI，X/Twitter 生态 |
| **DeepSeek** | chat.deepseek.com | 🟡 中 | 低 | 国产开源模型，性价比高 |

### 第二优先级（中国主流平台）

| 平台 | 网站 | 优先级 | 难度 | 说明 |
|------|------|--------|------|------|
| **Kimi** | kimi.moonshot.cn | 🔴 高 | 中 | 月之暗面，长文本处理强 |
| **豆包** | doubao.com | 🟡 中 | 中 | 字节跳动 AI，用户量大 |
| **文心一言** | yiyan.baidu.com | 🟡 中 | 中 | 百度 AI，中文理解强 |
| **通义千问** | tongyi.aliyun.com | 🟡 中 | 中 | 阿里 AI，多模态能力 |
| **智谱清言** | chatglm.cn | 🟢 低 | 中 | 智谱 AI，学术向 |

### 第三优先级（其他平台）

| 平台 | 网站 | 优先级 | 难度 | 说明 |
|------|------|--------|------|------|
| **Poe** | poe.com | 🟡 中 | 高 | Quora AI 聚合，多模型切换 |
| **Mistral** | lechat.mistral.ai | 🟢 低 | 低 | 法国 AI，开源模型 |
| **HuggingChat** | huggingface.co/chat | 🟢 低 | 低 | Hugging Face 开源 AI |
| **Character.ai** | character.ai | 🟢 低 | 高 | 角色扮演 AI，特殊交互 |
| **You.com** | you.com | 🟢 低 | 中 | AI 搜索引擎 |

---

## 目标

- 逐步扩展支持 10+ 个主流 AI 聊天平台
- 保持适配器架构的统一性和可维护性
- 优先支持用户量大、界面稳定的平台
- 确保每个适配器的核心功能完整（发送、接收、停止、新建对话）

---

## User Stories

### US-001: Claude 适配器
**Description:** 作为用户，我希望能在 MultiChat 中同时使用 Claude，以便比较 Claude 与其他 AI 的回答。

**Acceptance Criteria:**
- [ ] 实现 `ChatSiteAdapter` 接口的 Claude 适配器
- [ ] 识别 Claude 的输入框选择器 (`div.ProseMirror` 或 `[contenteditable="true"]`)
- [ ] 识别发送按钮选择器
- [ ] 识别 AI 回复容器选择器
- [ ] 支持停止生成和新建对话
- [ ] 更新 `manifest.json` 添加 claude.ai 的 host_permissions
- [ ] 更新 DNR 规则支持 Claude 的 iframe 嵌入
- [ ] 测试通过：能够发送消息并接收回复

### US-002: Perplexity 适配器
**Description:** 作为用户，我希望能在 MultiChat 中使用 Perplexity，以便获取带引用来源的 AI 搜索结果。

**Acceptance Criteria:**
- [ ] 实现 `ChatSiteAdapter` 接口的 Perplexity 适配器
- [ ] 识别 Perplexity 的输入框选择器
- [ ] 识别发送按钮选择器
- [ ] 识别 AI 回复容器选择器（包含引用链接）
- [ ] 支持停止生成和新建对话
- [ ] 更新 `manifest.json` 添加 perplexity.ai 的 host_permissions
- [ ] 更新 DNR 规则支持 Perplexity 的 iframe 嵌入
- [ ] 测试通过：能够发送消息并接收带引用的回复

### US-003: DeepSeek 适配器
**Description:** 作为用户，我希望能在 MultiChat 中使用 DeepSeek，以便使用高性价比的国产 AI 模型。

**Acceptance Criteria:**
- [ ] 实现 `ChatSiteAdapter` 接口的 DeepSeek 适配器
- [ ] 识别 DeepSeek 的输入框选择器
- [ ] 识别发送按钮选择器
- [ ] 识别 AI 回复容器选择器
- [ ] 支持停止生成和新建对话
- [ ] 更新 `manifest.json` 添加 chat.deepseek.com 的 host_permissions
- [ ] 更新 DNR 规则支持 DeepSeek 的 iframe 嵌入
- [ ] 测试通过：能够发送消息并接收回复

### US-004: Kimi 适配器
**Description:** 作为用户，我希望能在 MultiChat 中使用 Kimi，以便利用其长文本处理能力。

**Acceptance Criteria:**
- [ ] 实现 `ChatSiteAdapter` 接口的 Kimi 适配器
- [ ] 识别 Kimi 的输入框选择器
- [ ] 识别发送按钮选择器
- [ ] 识别 AI 回复容器选择器
- [ ] 支持停止生成和新建对话
- [ ] 更新 `manifest.json` 添加 kimi.moonshot.cn 的 host_permissions
- [ ] 更新 DNR 规则支持 Kimi 的 iframe 嵌入
- [ ] 测试通过：能够发送消息并接收回复

### US-005: 豆包适配器
**Description:** 作为用户，我希望能在 MultiChat 中使用豆包，以便使用字节跳动的 AI 服务。

**Acceptance Criteria:**
- [ ] 实现 `ChatSiteAdapter` 接口的豆包适配器
- [ ] 识别豆包的输入框选择器
- [ ] 识别发送按钮选择器
- [ ] 识别 AI 回复容器选择器
- [ ] 支持停止生成和新建对话
- [ ] 更新 `manifest.json` 添加 doubao.com 的 host_permissions
- [ ] 更新 DNR 规则支持豆包的 iframe 嵌入
- [ ] 测试通过：能够发送消息并接收回复

### US-006: 文心一言适配器
**Description:** 作为用户，我希望能在 MultiChat 中使用文心一言，以便使用百度的 AI 服务。

**Acceptance Criteria:**
- [ ] 实现 `ChatSiteAdapter` 接口的文心一言适配器
- [ ] 识别文心一言的输入框选择器
- [ ] 识别发送按钮选择器
- [ ] 识别 AI 回复容器选择器
- [ ] 支持停止生成和新建对话
- [ ] 更新 `manifest.json` 添加 yiyan.baidu.com 的 host_permissions
- [ ] 更新 DNR 规则支持文心一言的 iframe 嵌入
- [ ] 测试通过：能够发送消息并接收回复

### US-007: 通义千问适配器
**Description:** 作为用户，我希望能在 MultiChat 中使用通义千问，以便使用阿里的 AI 服务。

**Acceptance Criteria:**
- [ ] 实现 `ChatSiteAdapter` 接口的通义千问适配器
- [ ] 识别通义千问的输入框选择器
- [ ] 识别发送按钮选择器
- [ ] 识别 AI 回复容器选择器
- [ ] 支持停止生成和新建对话
- [ ] 更新 `manifest.json` 添加 tongyi.aliyun.com 的 host_permissions
- [ ] 更新 DNR 规则支持通义千问的 iframe 嵌入
- [ ] 测试通过：能够发送消息并接收回复

### US-008: 适配器路由更新
**Description:** 作为开发者，我需要更新适配器路由逻辑，以便根据 URL 正确选择对应的适配器。

**Acceptance Criteria:**
- [ ] 更新 `src/content/sites/index.ts` 的 `getActiveChatSiteAdapter()` 函数
- [ ] 支持根据 `location.hostname` 匹配所有新增的 AI 平台
- [ ] 保持向后兼容，不影响现有 ChatGPT 和 Gemini 适配器
- [ ] 添加默认适配器或错误处理

### US-009: 用户界面支持多平台切换
**Description:** 作为用户，我希望能在 MultiChat 界面中选择启用哪些 AI 平台。

**Acceptance Criteria:**
- [ ] 更新聊天界面，显示所有可用的 AI 平台列表
- [ ] 支持用户勾选/取消勾选特定平台
- [ ] 用户选择状态持久化到 storage
- [ ] 只向启用的平台发送消息

---

## Functional Requirements

- FR-1: 每个新平台必须实现 `ChatSiteAdapter` 接口的所有必需方法
- FR-2: 每个适配器必须包含以下选择器定义：输入框、发送按钮、回复容器、停止按钮、新建对话按钮
- FR-3: 每个适配器必须支持 `fillAndSend()` 方法，能够填入文本并触发发送
- FR-4: 每个适配器必须支持 `isGenerating()` 方法，能够检测 AI 是否正在生成回复
- FR-5: 每个适配器必须支持 `stopGenerating()` 方法，能够停止 AI 生成
- FR-6: 每个适配器必须支持 `startNewChat()` 方法，能够开始新对话
- FR-7: 每个适配器必须支持 `getAllAssistantReplies()` 方法，能够获取所有 AI 回复
- FR-8: `manifest.json` 必须包含所有新平台的 host_permissions
- FR-9: `frame-rules.json` 必须包含所有新平台的 DNR 规则，移除 X-Frame-Options 和 CSP 限制
- FR-10: Content scripts 的 matches 必须包含所有新平台的 URL 模式

---

## Non-Goals (Out of Scope)

- 不支持需要特殊认证或 OAuth 的平台（如需要 API Key 的服务）
- 不支持纯 API 接口（只支持网页版）
- 不支持需要付费订阅才能使用的平台基础功能
- 不支持移动端网页版（仅支持桌面端）
- 不实现平台间的对话历史同步
- 不实现跨平台的对话上下文传递

---

## Technical Considerations

### 适配器架构

```typescript
// 现有的适配器接口
export interface ChatSiteAdapter {
  readonly id: string
  getResponseContainers(): Element[]
  getAllAssistantReplies(): CapturedReply[]
  readResponse(node: Node): CapturedReply
  captureFinalReply?(container: Element): Promise<CapturedReply | null>
  isGenerating(): boolean
  stopGenerating(): Promise<boolean>
  startNewChat(): Promise<boolean>
  fillAndSend(content: string, autoSend?: boolean): Promise<void>
}
```

### 新增适配器文件结构

```
src/content/sites/
  ├── types.ts           # 接口定义（已有）
  ├── index.ts           # 适配器路由（需更新）
  ├── chatgpt.ts         # ChatGPT 适配器（已有）
  ├── gemini.ts          # Gemini 适配器（已有）
  ├── claude.ts          # Claude 适配器（新增）
  ├── perplexity.ts      # Perplexity 适配器（新增）
  ├── deepseek.ts        # DeepSeek 适配器（新增）
  ├── kimi.ts            # Kimi 适配器（新增）
  ├── doubao.ts          # 豆包适配器（新增）
  ├── yiyan.ts           # 文心一言适配器（新增）
  └── tongyi.ts          # 通义千问适配器（新增）
```

### 需要更新的文件

1. **`src/content/sites/index.ts`** - 添加新适配器的导入和路由
2. **`public/manifest.json`** - 添加新平台的 host_permissions 和 content_scripts matches
3. **`public/frame-rules.json`** - 添加新平台的 DNR 规则
4. **`src/chat/index.ts`** - 更新 UI 支持多平台选择

### 潜在技术挑战

1. **X-Frame-Options 限制**：部分网站可能有严格的 iframe 嵌入限制，需要通过 DNR 规则绕过
2. **CSP 限制**：Content Security Policy 可能阻止脚本注入
3. **动态加载内容**：部分平台使用 SPA 架构，内容动态加载，需要 MutationObserver 监听
4. **反爬虫机制**：部分平台可能有反自动化检测
5. **登录状态**：iframe 中的登录状态可能需要特殊处理

---

## Success Metrics

- 成功支持 5+ 个新的 AI 聊天平台
- 每个新适配器的核心功能测试通过率 100%
- 用户能够在同一界面中同时使用 3+ 个 AI 平台
- 新增适配器的代码符合现有代码风格和架构
- 无回归问题，现有 ChatGPT 和 Gemini 适配器正常工作

---

## Implementation Plan

### Phase 1: 高优先级平台（1-2 周）
1. Claude 适配器
2. DeepSeek 适配器
3. 适配器路由更新

### Phase 2: 中国主流平台（2-3 周）
4. Kimi 适配器
5. 豆包适配器
6. 文心一言适配器
7. 通义千问适配器

### Phase 3: 其他平台（按需）
8. Perplexity 适配器
9. Microsoft Copilot 适配器
10. Grok 适配器

### Phase 4: UI 增强（1 周）
11. 多平台选择界面
12. 平台状态指示器
13. 用户偏好持久化

---

## Open Questions

1. 是否需要支持平台的流式输出（streaming）显示？
2. 如何处理不同平台的登录状态同步？
3. 是否需要为每个平台添加图标/品牌标识？
4. 如何处理平台改版导致的选择器失效？
5. 是否需要实现适配器的自动更新机制？
6. 部分中国平台可能需要特殊网络环境，如何处理？

---

## 参考资源

- 现有适配器实现：`src/content/sites/chatgpt.ts`、`src/content/sites/gemini.ts`
- 适配器接口定义：`src/content/sites/types.ts`
- Chrome Extension Manifest V3 文档：https://developer.chrome.com/docs/extensions/reference/
- Declarative Net Request API：https://developer.chrome.com/docs/extensions/reference/declarativeNetRequest/

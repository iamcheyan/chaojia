# MultiChat 设计文档

## 项目目标

一个 Chrome 浏览器扩展，让用户在一个聊天窗口里同时和 ChatGPT、Gemini 对话。输入一个问题，两个 AI 同时回答，回复聚合显示在同一个界面中。

## 架构

```
chat.html (聊天界面)
  → background.js (Service Worker 消息路由)
    → iframe[ChatGPT] + content/chatgpt.js (ChatGPT 适配器)
    → iframe[Gemini]  + content/gemini.js  (Gemini 适配器)
    → 回复通过 chrome.runtime 消息回到 chat.html 聚合显示
```

三个运行时：
1. **Chat 页面**：用户交互界面，发送问题，聚合显示两个 AI 的回复
2. **Background Service Worker**：消息中枢，管理 iframe 生命周期，路由消息
3. **Content Scripts**：注入到 AI 网站 iframe 中，负责填入文本、点击发送、监听回复

## 消息协议

```
chat → background: SEND_PROMPT { content }
background → content: FILL_AND_SEND { content }
content → background: ROLE_REPLY { site, content }
content → background: ROLE_STATUS { site, status }
background → chat: REPLY_UPDATE { site, content }
background → chat: STATUS_UPDATE { site, status }
```

## 技术栈

- TypeScript + Vite 构建
- Chrome Manifest V3
- Content Script 用 esbuild 打包为 IIFE
- DNR 规则移除 AI 网站的 X-Frame-Options 和 CSP

## 目录结构

```
public/
  manifest.json       — MV3 扩展配置
  frame-rules.json    — DNR 响应头修改规则
  chat.html           — 聊天页面 HTML
src/
  background/index.ts — Service Worker
  content/
    index.ts          — Content Script 入口
    replyObserver.ts  — MutationObserver + 轮询回复检测
    contentEditable.ts— 编辑器文本填充工具
    sites/
      types.ts        — ChatSiteAdapter 接口
      chatgpt.ts      — ChatGPT 适配器
      gemini.ts       — Gemini 适配器
      index.ts        — 适配器路由
  chat/
    index.ts          — 聊天页面逻辑
    chat.css          — 聊天界面样式
```

## 参考

适配器代码、DOM 工具、回复检测机制精简自 OpenTeam 项目 (/Users/tetsuya/Development/openteam)，已验证可工作。

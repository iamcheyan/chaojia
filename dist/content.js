"use strict";
(() => {
  // src/content/contentEditable.ts
  function setContentEditableText(editor, content) {
    editor.focus();
    editor.replaceChildren();
    const block = document.createElement("p");
    block.textContent = content;
    editor.append(block);
    editor.dispatchEvent(new InputEvent("beforeinput", { bubbles: true, inputType: "insertText", data: content }));
    editor.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: content }));
    editor.dispatchEvent(new Event("change", { bubbles: true }));
  }

  // src/content/sites/waitForElement.ts
  function querySelectorFirst(selectors) {
    for (const selector of selectors.split(",").map((s) => s.trim())) {
      const el = document.querySelector(selector);
      if (el) return el;
    }
    return null;
  }
  function waitForElement(selectors, timeoutMs) {
    const immediate = querySelectorFirst(selectors);
    if (immediate) return Promise.resolve(immediate);
    return new Promise((resolve, reject) => {
      const startedAt = Date.now();
      const timer = window.setInterval(() => {
        const el = querySelectorFirst(selectors);
        if (el) {
          window.clearInterval(timer);
          resolve(el);
          return;
        }
        if (Date.now() - startedAt >= timeoutMs) {
          window.clearInterval(timer);
          reject(new Error(`Element not found: ${selectors}`));
        }
      }, 250);
    });
  }
  function waitForClickableButton(selectors, timeoutMs, errorMsg) {
    return new Promise((resolve, reject) => {
      const startedAt = Date.now();
      const timer = window.setInterval(() => {
        const buttons = selectors.split(",").map((s) => s.trim()).flatMap((sel) => [...document.querySelectorAll(sel)]);
        const btn = buttons.find((b) => !(b instanceof HTMLButtonElement) || !b.disabled && b.getAttribute("aria-disabled") !== "true");
        if (btn) {
          window.clearInterval(timer);
          resolve(btn);
          return;
        }
        if (Date.now() - startedAt >= timeoutMs) {
          window.clearInterval(timer);
          reject(new Error(errorMsg));
        }
      }, 250);
    });
  }
  function isClickableButton(el) {
    if (!(el instanceof HTMLButtonElement)) return true;
    return !el.disabled && el.getAttribute("aria-disabled") !== "true";
  }

  // src/content/sites/chatgpt.ts
  var EDITOR_SELECTORS = 'form[data-type="unified-composer"] #prompt-textarea[contenteditable="true"], #prompt-textarea.ProseMirror[contenteditable="true"]';
  var SEND_BUTTON_SELECTORS = 'button[data-testid="send-button"], button[aria-label*="\u53D1\u9001"], button[aria-label*="Send"]';
  var NEW_CHAT_SELECTORS = 'a[href="/"], a[href="https://chatgpt.com/"], button[data-testid*="new-chat"], nav a[href="/"], nav button';
  var RESPONSE_SELECTORS = '[data-message-author-role="assistant"]';
  var TURN_SELECTORS = 'section[data-turn="assistant"][data-testid^="conversation-turn-"], [data-turn="assistant"][data-testid^="conversation-turn-"]';
  var ACTIVITY_INDICATORS = '.result-streaming[aria-busy="true"], [aria-busy="true"] .result-streaming, [data-testid*="thinking"], [data-testid*="reasoning"]';
  var STOP_RE = /stop|stopping|停止|中止/i;
  var RATE_LIMIT_RE = /too many requests|request frequency is too high|rate limit|リクエストが多すぎます|リクエストの頻度が高すぎます|请求过多|频率过高/i;
  var ACK_BUTTON_RE = /^(了解|知道了|确定|OK|Got it|Dismiss|承知しました?)$/i;
  var SKIP_TAGS = /* @__PURE__ */ new Set(["SCRIPT", "STYLE", "SVG"]);
  var CONTENT_ROOT_SELECTORS = [
    ".markdown",
    ".prose",
    '[data-testid="conversation-turn-"] .markdown',
    '[data-testid="conversation-turn-"] .prose'
  ];
  var EXTRA_IMAGE_SKIP_SELECTORS = "nav, form";
  function escapeHtml(text) {
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function sanitizeHref(href) {
    if (!href) return "";
    const normalizedHref = href.trim();
    return /^https?:\/\//i.test(normalizedHref) ? normalizedHref : "";
  }
  function sanitizeImageSrc(src) {
    if (!src) return "";
    const normalizedSrc = src.trim();
    return /^(https?:\/\/|data:image\/|blob:)/i.test(normalizedSrc) ? normalizedSrc : "";
  }
  function extractUrlsFromSrcset(srcset) {
    if (!srcset) return [];
    return srcset.split(",").map((part) => sanitizeImageSrc(part.trim().split(/\s+/)[0] ?? "")).filter(Boolean);
  }
  function extractUrlsFromStyle(styleValue) {
    if (!styleValue) return [];
    const matches = Array.from(styleValue.matchAll(/url\((['"]?)(.*?)\1\)/g));
    return matches.map((match) => sanitizeImageSrc(match[2] ?? "")).filter(Boolean);
  }
  function getNodeTextLength(node) {
    return (node.textContent ?? "").replace(/\s+/g, " ").trim().length;
  }
  function getContentRoot(container) {
    const candidates = [];
    for (const selector of CONTENT_ROOT_SELECTORS) {
      if (container instanceof HTMLElement && container.matches(selector)) {
        candidates.push(container);
      }
      candidates.push(...container.querySelectorAll(selector));
    }
    const uniqueCandidates = Array.from(new Set(candidates)).filter((node) => getNodeTextLength(node) > 0).sort((a, b) => getNodeTextLength(b) - getNodeTextLength(a));
    return uniqueCandidates[0] ?? container;
  }
  function getExtraImageHtml(container, root) {
    const seen = /* @__PURE__ */ new Set();
    const parts = [];
    const addImage = (src, alt = "") => {
      const normalizedSrc = sanitizeImageSrc(src);
      if (!normalizedSrc || seen.has(normalizedSrc)) return;
      seen.add(normalizedSrc);
      parts.push(`<img src="${escapeHtml(normalizedSrc)}" alt="${escapeHtml(alt)}">`);
    };
    for (const img of Array.from(container.querySelectorAll("img"))) {
      if (root.contains(img) || img.closest(EXTRA_IMAGE_SKIP_SELECTORS)) continue;
      addImage(img.currentSrc || img.getAttribute("src") || "", img.getAttribute("alt") ?? "");
      for (const src of extractUrlsFromSrcset(img.getAttribute("srcset"))) {
        addImage(src, img.getAttribute("alt") ?? "");
      }
    }
    for (const source of Array.from(container.querySelectorAll("source"))) {
      if (root.contains(source) || source.closest(EXTRA_IMAGE_SKIP_SELECTORS)) continue;
      for (const src of extractUrlsFromSrcset(source.getAttribute("srcset"))) {
        addImage(src);
      }
    }
    const imageDataAttrs = ["data-src", "data-image-src", "data-image-url", "data-full-image-url", "data-thumbnail-url"];
    for (const el of Array.from(container.querySelectorAll("*"))) {
      if (root.contains(el) || el.closest(EXTRA_IMAGE_SKIP_SELECTORS)) continue;
      for (const attr of imageDataAttrs) {
        const value = el.getAttribute(attr);
        if (value) addImage(value, el.getAttribute("aria-label") ?? "");
      }
      for (const src of extractUrlsFromStyle(el.getAttribute("style"))) {
        addImage(src, el.getAttribute("aria-label") ?? "");
      }
    }
    return parts.join("");
  }
  function serializeNode(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      return escapeHtml(node.textContent ?? "");
    }
    if (!(node instanceof HTMLElement)) return "";
    if (SKIP_TAGS.has(node.tagName)) return "";
    const inner = Array.from(node.childNodes).map(serializeNode).join("");
    switch (node.tagName) {
      case "BR":
        return "<br>";
      case "P":
        return `<p>${inner}</p>`;
      case "DIV":
      case "SECTION":
      case "ARTICLE":
        return inner.trim() ? `<div>${inner}</div>` : "";
      case "SPAN":
        return inner;
      case "STRONG":
      case "B":
        return `<strong>${inner}</strong>`;
      case "EM":
      case "I":
        return `<em>${inner}</em>`;
      case "CODE":
        return node.closest("pre") ? inner : `<code>${inner}</code>`;
      case "PRE": {
        const code = node.querySelector("code");
        const codeText = escapeHtml(code?.textContent ?? node.textContent ?? "");
        return `<pre><code>${codeText}</code></pre>`;
      }
      case "A": {
        const href = sanitizeHref(node.getAttribute("href"));
        return href ? `<a href="${escapeHtml(href)}" target="_blank" rel="noreferrer noopener">${inner}</a>` : inner;
      }
      case "BUTTON":
        return inner;
      case "IMG": {
        const src = sanitizeImageSrc(node.currentSrc || node.getAttribute("src"));
        if (!src) return "";
        const alt = escapeHtml(node.getAttribute("alt") ?? "");
        return `<img src="${escapeHtml(src)}" alt="${alt}">`;
      }
      case "UL":
        return `<ul>${inner}</ul>`;
      case "OL":
        return `<ol>${inner}</ol>`;
      case "LI":
        return `<li>${inner}</li>`;
      case "BLOCKQUOTE":
        return `<blockquote>${inner}</blockquote>`;
      case "H1":
      case "H2":
      case "H3":
      case "H4":
      case "H5":
      case "H6":
        return `<${node.tagName.toLowerCase()}>${inner}</${node.tagName.toLowerCase()}>`;
      case "HR":
        return "<hr>";
      case "TABLE":
      case "THEAD":
      case "TBODY":
      case "TR":
      case "TH":
      case "TD":
        return `<${node.tagName.toLowerCase()}>${inner}</${node.tagName.toLowerCase()}>`;
      default:
        return inner;
    }
  }
  function normalizeHtml(html) {
    return html.replace(/(?:<div>\s*<\/div>|\s+\n)/g, "").trim();
  }
  function findRateLimitAckButton() {
    const buttons = [...document.querySelectorAll("button")];
    for (const button of buttons) {
      const label = (button.textContent ?? button.getAttribute("aria-label") ?? "").replace(/\s+/g, " ").trim();
      if (!ACK_BUTTON_RE.test(label)) continue;
      const scope = button.closest('[role="dialog"], [role="alertdialog"], [data-radix-portal], [data-headlessui-portal], body');
      const scopeText = (scope?.textContent ?? "").replace(/\s+/g, " ").trim();
      if (RATE_LIMIT_RE.test(scopeText)) {
        return button;
      }
    }
    return null;
  }
  function dismissRateLimitDialog() {
    const button = findRateLimitAckButton();
    if (!button || !isClickableButton(button)) return false;
    button.click();
    return true;
  }
  function captureReply(container) {
    const root = getContentRoot(container);
    const html = normalizeHtml(`${serializeNode(root)}${getExtraImageHtml(container, root)}`);
    const fallbackText = (container.textContent ?? "").replace(/\s+/g, " ").trim();
    return {
      content: html || escapeHtml(fallbackText),
      format: "html"
    };
  }
  function createChatGptAdapter() {
    return {
      id: "chatgpt",
      getResponseContainers() {
        const turns = [...document.querySelectorAll(TURN_SELECTORS)];
        if (turns.length > 0) return turns;
        return [...document.querySelectorAll(RESPONSE_SELECTORS)];
      },
      getAllAssistantReplies() {
        const containers = this.getResponseContainers();
        return containers.map((c) => captureReply(c)).filter((reply) => reply.content.length > 0);
      },
      readResponse(node) {
        return captureReply(node);
      },
      isGenerating() {
        dismissRateLimitDialog();
        const buttons = [...document.querySelectorAll("button")];
        const hasStopButton = buttons.some((b) => {
          const label = b.getAttribute("aria-label") ?? b.textContent ?? "";
          return STOP_RE.test(label);
        });
        if (hasStopButton) return true;
        return document.querySelector(ACTIVITY_INDICATORS) !== null;
      },
      async stopGenerating() {
        const buttons = [...document.querySelectorAll("button")];
        const stopBtn = buttons.find((b) => {
          const label = b.getAttribute("aria-label") ?? b.textContent ?? "";
          return STOP_RE.test(label);
        });
        if (!stopBtn) return false;
        if (!isClickableButton(stopBtn)) return false;
        stopBtn.click();
        return true;
      },
      async startNewChat() {
        const candidates = [...document.querySelectorAll(NEW_CHAT_SELECTORS)];
        const newChatBtn = candidates.find((el) => {
          const text = (el.textContent ?? "").trim();
          const label = el.getAttribute("aria-label") ?? "";
          const href = el instanceof HTMLAnchorElement ? el.href : "";
          return /new chat|新对话|新しいチャット/i.test(text) || /new chat|新对话|新しいチャット/i.test(label) || href === "https://chatgpt.com/" || href === "https://chat.openai.com/";
        });
        if (newChatBtn && isClickableButton(newChatBtn)) {
          newChatBtn.click();
          return true;
        }
        location.href = "https://chatgpt.com/";
        return true;
      },
      async fillAndSend(content, autoSend = true) {
        dismissRateLimitDialog();
        const editor = await waitForElement(EDITOR_SELECTORS, 1e4);
        setContentEditableText(editor, content);
        if (!autoSend) return;
        const sendBtn = await waitForClickableButton(SEND_BUTTON_SELECTORS, 1e4, "Send button not found or not clickable");
        sendBtn.click();
        window.setTimeout(() => {
          dismissRateLimitDialog();
        }, 300);
        window.setTimeout(() => {
          dismissRateLimitDialog();
        }, 1200);
      }
    };
  }

  // src/content/sites/gemini.ts
  var EDITOR_SELECTORS2 = 'div.ql-editor[contenteditable="true"], rich-textarea div[contenteditable="true"]';
  var SEND_BUTTON_SELECTORS2 = 'button.send-button[aria-label*="\u53D1\u9001"], button.send-button[aria-label*="Send"], button[aria-label*="Send message"], button[aria-label*="\u53D1\u9001\u6D88\u606F"]';
  var NEW_CHAT_SELECTORS2 = 'button[aria-label*="New chat"], button[aria-label*="\u65B0\u5BF9\u8BDD"], button[aria-label*="\u65B0\u3057\u3044\u30C1\u30E3\u30C3\u30C8"], a[href="/app"], a[href="/"], button';
  var RESPONSE_SELECTORS2 = "model-response, .model-response-text, message-content, .response-content";
  var STOP_RE2 = /stop|stopping|停止|中止/i;
  var SKIP_TAGS2 = /* @__PURE__ */ new Set(["SCRIPT", "STYLE", "SVG"]);
  var CONTENT_ROOT_SELECTORS2 = [
    ".markdown",
    ".model-response-text",
    "message-content",
    ".response-content"
  ];
  var RESPONSE_CONTAINER_SELECTORS = "model-response, message-content, .response-content";
  var CAROUSEL_SELECTOR = "image-carousel";
  var CAROUSEL_DOT_SELECTOR = ".carousel-dots .dot";
  var CAROUSEL_PREV_SELECTOR = 'button[aria-label*="\u524D"], button[aria-label*="previous"], button[aria-label*="Previous"]';
  var CAROUSEL_NEXT_SELECTOR = 'button[aria-label*="\u6B21"], button[aria-label*="next"], button[aria-label*="Next"]';
  function escapeHtml2(text) {
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function sanitizeHref2(href) {
    if (!href) return "";
    const normalizedHref = href.trim();
    return /^https?:\/\//i.test(normalizedHref) ? normalizedHref : "";
  }
  function sanitizeImageSrc2(src) {
    if (!src) return "";
    const normalizedSrc = src.trim();
    return /^(https?:\/\/|data:image\/|blob:)/i.test(normalizedSrc) ? normalizedSrc : "";
  }
  function extractUrlsFromSrcset2(srcset) {
    if (!srcset) return [];
    return srcset.split(",").map((part) => sanitizeImageSrc2(part.trim().split(/\s+/)[0] ?? "")).filter(Boolean);
  }
  function extractUrlsFromStyle2(styleValue) {
    if (!styleValue) return [];
    const matches = Array.from(styleValue.matchAll(/url\((['"]?)(.*?)\1\)/g));
    return matches.map((match) => sanitizeImageSrc2(match[2] ?? "")).filter(Boolean);
  }
  function collectContainerImageHtml(container) {
    const seen = /* @__PURE__ */ new Set();
    const parts = [];
    const addImage = (src, alt = "") => {
      const nextSrc = sanitizeImageSrc2(src);
      if (!nextSrc || seen.has(nextSrc)) return;
      seen.add(nextSrc);
      parts.push(`<img src="${escapeHtml2(nextSrc)}" alt="${escapeHtml2(alt)}">`);
    };
    for (const img of Array.from(container.querySelectorAll("img"))) {
      addImage(img.currentSrc || img.getAttribute("src") || "", img.getAttribute("alt") ?? "");
      for (const src of extractUrlsFromSrcset2(img.getAttribute("srcset"))) {
        addImage(src, img.getAttribute("alt") ?? "");
      }
    }
    for (const source of Array.from(container.querySelectorAll("source"))) {
      for (const src of extractUrlsFromSrcset2(source.getAttribute("srcset"))) {
        addImage(src);
      }
    }
    const imageDataAttrs = ["data-src", "data-image-src", "data-image-url", "data-full-image-url", "data-thumbnail-url"];
    for (const el of Array.from(container.querySelectorAll("*"))) {
      for (const attr of imageDataAttrs) {
        const value = el.getAttribute(attr);
        if (value) addImage(value, el.getAttribute("aria-label") ?? "");
      }
      for (const src of extractUrlsFromStyle2(el.getAttribute("style"))) {
        addImage(src, el.getAttribute("aria-label") ?? "");
      }
    }
    return parts.join("");
  }
  function sleep(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }
  function isButtonUsable(button) {
    if (!button) return false;
    return !button.disabled && button.getAttribute("aria-disabled") !== "true";
  }
  function getCarouselActiveIndex(carousel) {
    const dots = Array.from(carousel.querySelectorAll(CAROUSEL_DOT_SELECTOR));
    const activeIndex = dots.findIndex((dot) => dot.classList.contains("active"));
    return activeIndex >= 0 ? activeIndex : 0;
  }
  function getCarouselImageUrls(carousel) {
    const fullSizeUrls = [];
    const previewUrls = [];
    const pushUrl = (target, value) => {
      const nextValue = sanitizeImageSrc2(value);
      if (nextValue && !target.includes(nextValue)) {
        target.push(nextValue);
      }
    };
    for (const el of Array.from(carousel.querySelectorAll("[data-full-size-image-uri]"))) {
      pushUrl(fullSizeUrls, el.getAttribute("data-full-size-image-uri"));
    }
    if (fullSizeUrls.length > 0) {
      return fullSizeUrls;
    }
    for (const img of Array.from(carousel.querySelectorAll("img"))) {
      pushUrl(previewUrls, img.currentSrc || img.getAttribute("src"));
      for (const src of extractUrlsFromSrcset2(img.getAttribute("srcset"))) {
        pushUrl(previewUrls, src);
      }
    }
    return previewUrls;
  }
  function buildImageHtml(urls) {
    return urls.map((src) => `<img src="${escapeHtml2(src)}" alt="">`).join("");
  }
  async function captureCarouselReply(container) {
    const carousel = container.querySelector(CAROUSEL_SELECTOR);
    if (!carousel) {
      return captureReply2(container);
    }
    const root = getContentRoot2(container);
    const originalIndex = getCarouselActiveIndex(carousel);
    const seenSlides = /* @__PURE__ */ new Set();
    const collectedUrls = [];
    const addCurrentSlide = () => {
      const slideUrls = getCarouselImageUrls(carousel);
      const signature = slideUrls.join("|");
      if (!signature || seenSlides.has(signature)) return;
      seenSlides.add(signature);
      for (const url of slideUrls) {
        if (!collectedUrls.includes(url)) {
          collectedUrls.push(url);
        }
      }
    };
    let prevGuard = 0;
    while (prevGuard < 12) {
      const prevButton = carousel.querySelector(CAROUSEL_PREV_SELECTOR);
      if (!isButtonUsable(prevButton)) break;
      prevButton.click();
      await sleep(180);
      prevGuard += 1;
    }
    addCurrentSlide();
    let nextGuard = 0;
    while (nextGuard < 12) {
      const nextButton = carousel.querySelector(CAROUSEL_NEXT_SELECTOR);
      if (!isButtonUsable(nextButton)) break;
      nextButton.click();
      await sleep(180);
      addCurrentSlide();
      nextGuard += 1;
    }
    const restoreSteps = Math.max(0, collectedUrls.length - 1 - originalIndex);
    for (let i = 0; i < restoreSteps; i += 1) {
      const prevButton = carousel.querySelector(CAROUSEL_PREV_SELECTOR);
      if (!isButtonUsable(prevButton)) break;
      prevButton.click();
      await sleep(120);
    }
    const html = normalizeHtml2(`${serializeNode2(root)}${buildImageHtml(collectedUrls) || collectContainerImageHtml(container)}`);
    const fallbackText = (container.textContent ?? "").replace(/\s+/g, " ").trim();
    return {
      content: html || escapeHtml2(fallbackText),
      format: "html"
    };
  }
  function getContentRoot2(container) {
    const candidates = [
      ...CONTENT_ROOT_SELECTORS2.map((selector) => container.querySelector(selector)).filter((node) => Boolean(node))
    ];
    const textCandidate = candidates.map((node) => ({
      node,
      textLength: (node.textContent ?? "").replace(/\s+/g, " ").trim().length
    })).sort((a, b) => b.textLength - a.textLength)[0];
    if (textCandidate && textCandidate.textLength > 0) {
      return textCandidate.node;
    }
    return container;
  }
  function serializeNode2(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      return escapeHtml2(node.textContent ?? "");
    }
    if (!(node instanceof HTMLElement)) return "";
    if (SKIP_TAGS2.has(node.tagName)) return "";
    const inner = Array.from(node.childNodes).map(serializeNode2).join("");
    switch (node.tagName) {
      case "BR":
        return "<br>";
      case "P":
        return `<p>${inner}</p>`;
      case "DIV":
      case "SECTION":
      case "ARTICLE":
        return inner.trim() ? `<div>${inner}</div>` : "";
      case "SPAN":
        return inner;
      case "STRONG":
      case "B":
        return `<strong>${inner}</strong>`;
      case "EM":
      case "I":
        return `<em>${inner}</em>`;
      case "CODE":
        return node.closest("pre") ? inner : `<code>${inner}</code>`;
      case "PRE": {
        const code = node.querySelector("code");
        const codeText = escapeHtml2(code?.textContent ?? node.textContent ?? "");
        return `<pre><code>${codeText}</code></pre>`;
      }
      case "A": {
        const href = sanitizeHref2(node.getAttribute("href"));
        return href ? `<a href="${escapeHtml2(href)}" target="_blank" rel="noreferrer noopener">${inner}</a>` : inner;
      }
      case "BUTTON":
        return inner;
      case "IMG": {
        return "";
      }
      case "UL":
        return `<ul>${inner}</ul>`;
      case "OL":
        return `<ol>${inner}</ol>`;
      case "LI":
        return `<li>${inner}</li>`;
      case "BLOCKQUOTE":
        return `<blockquote>${inner}</blockquote>`;
      case "H1":
      case "H2":
      case "H3":
      case "H4":
      case "H5":
      case "H6":
        return `<${node.tagName.toLowerCase()}>${inner}</${node.tagName.toLowerCase()}>`;
      case "HR":
        return "<hr>";
      case "TABLE":
      case "THEAD":
      case "TBODY":
      case "TR":
      case "TH":
      case "TD":
        return `<${node.tagName.toLowerCase()}>${inner}</${node.tagName.toLowerCase()}>`;
      default:
        return inner;
    }
  }
  function normalizeHtml2(html) {
    return html.replace(/(?:<div>\s*<\/div>|\s+\n)/g, "").trim();
  }
  function captureReply2(container) {
    const root = getContentRoot2(container);
    const html = normalizeHtml2(`${serializeNode2(root)}${collectContainerImageHtml(container)}`);
    const fallbackText = (container.textContent ?? "").replace(/\s+/g, " ").trim();
    return {
      content: html || escapeHtml2(fallbackText),
      format: "html"
    };
  }
  function createGeminiAdapter() {
    return {
      id: "gemini",
      getResponseContainers() {
        const candidates = [...document.querySelectorAll(RESPONSE_SELECTORS2)];
        const containers = candidates.map((node) => node.closest(RESPONSE_CONTAINER_SELECTORS) ?? node);
        const uniqueContainers = Array.from(new Set(containers));
        return uniqueContainers;
      },
      getAllAssistantReplies() {
        const containers = this.getResponseContainers();
        return containers.map((c) => captureReply2(c)).filter((reply) => reply.content.length > 0);
      },
      readResponse(node) {
        return captureReply2(node);
      },
      async captureFinalReply(container) {
        return captureCarouselReply(container);
      },
      isGenerating() {
        const buttons = [...document.querySelectorAll("button")];
        return buttons.some((b) => {
          const label = b.getAttribute("aria-label") ?? b.textContent ?? "";
          return STOP_RE2.test(label);
        });
      },
      async stopGenerating() {
        const buttons = [...document.querySelectorAll("button")];
        const stopBtn = buttons.find((b) => {
          const label = b.getAttribute("aria-label") ?? b.textContent ?? "";
          return STOP_RE2.test(label);
        });
        if (!stopBtn) return false;
        if (!isClickableButton(stopBtn)) return false;
        stopBtn.click();
        return true;
      },
      async startNewChat() {
        const candidates = [...document.querySelectorAll(NEW_CHAT_SELECTORS2)];
        const newChatBtn = candidates.find((el) => {
          const text = (el.textContent ?? "").trim();
          const label = el.getAttribute("aria-label") ?? "";
          return /new chat|新对话|新しいチャット/i.test(text) || /new chat|新对话|新しいチャット/i.test(label);
        });
        if (newChatBtn && isClickableButton(newChatBtn)) {
          newChatBtn.click();
          return true;
        }
        location.href = "https://gemini.google.com/app";
        return true;
      },
      async fillAndSend(content, autoSend = true) {
        const editor = await waitForElement(EDITOR_SELECTORS2, 1e4);
        setContentEditableText(editor, content);
        if (!autoSend) return;
        try {
          const sendBtn = await waitForClickableButton(SEND_BUTTON_SELECTORS2, 5e3, "Send button not found");
          sendBtn.click();
        } catch {
          editor.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, bubbles: true }));
          editor.dispatchEvent(new KeyboardEvent("keypress", { key: "Enter", code: "Enter", keyCode: 13, bubbles: true }));
          editor.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", code: "Enter", keyCode: 13, bubbles: true }));
        }
      }
    };
  }

  // src/content/sites/claude.ts
  var EDITOR_SELECTORS3 = 'div.ProseMirror[contenteditable="true"], div[contenteditable="true"][role="textbox"]';
  var SEND_BUTTON_SELECTORS3 = 'button[aria-label*="Send"], button[aria-label*="\u53D1\u9001"], button[aria-label*="\u9001\u4FE1"], button[aria-label*="\u9001\u308B"]';
  var NEW_CHAT_SELECTORS3 = 'a[href="/new"], button[aria-label*="New chat"], button[aria-label*="\u65B0\u5BF9\u8BDD"], button[aria-label*="\u65B0\u3057\u3044\u30C1\u30E3\u30C3\u30C8"]';
  var RESPONSE_SELECTORS3 = '[data-is-streaming], .font-claude-message, [data-testid="message"]';
  var STOP_SELECTORS = 'button[aria-label*="Stop"], button[aria-label*="\u505C\u6B62"], button[aria-label*="\u4E2D\u6B62"], button[aria-label*="\u30B9\u30C8\u30C3\u30D7"]';
  var ACTIVITY_INDICATORS2 = '.result-streaming, [data-is-streaming="true"], .animate-pulse';
  var SKIP_TAGS3 = /* @__PURE__ */ new Set(["SCRIPT", "STYLE", "SVG"]);
  var CONTENT_ROOT_SELECTORS3 = [
    ".font-claude-message",
    ".markdown",
    ".prose",
    '[data-testid="message"] .markdown'
  ];
  function escapeHtml3(text) {
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function sanitizeHref3(href) {
    if (!href) return "";
    const normalizedHref = href.trim();
    return /^https?:\/\//i.test(normalizedHref) ? normalizedHref : "";
  }
  function sanitizeImageSrc3(src) {
    if (!src) return "";
    const normalizedSrc = src.trim();
    return /^(https?:\/\/|data:image\/|blob:)/i.test(normalizedSrc) ? normalizedSrc : "";
  }
  function extractUrlsFromSrcset3(srcset) {
    if (!srcset) return [];
    return srcset.split(",").map((part) => sanitizeImageSrc3(part.trim().split(/\s+/)[0] ?? "")).filter(Boolean);
  }
  function extractUrlsFromStyle3(styleValue) {
    if (!styleValue) return [];
    const matches = Array.from(styleValue.matchAll(/url\((['"]?)(.*?)\1\)/g));
    return matches.map((match) => sanitizeImageSrc3(match[2] ?? "")).filter(Boolean);
  }
  function getNodeTextLength2(node) {
    return (node.textContent ?? "").replace(/\s+/g, " ").trim().length;
  }
  function getContentRoot3(container) {
    const candidates = [];
    for (const selector of CONTENT_ROOT_SELECTORS3) {
      if (container instanceof HTMLElement && container.matches(selector)) {
        candidates.push(container);
      }
      candidates.push(...container.querySelectorAll(selector));
    }
    const uniqueCandidates = Array.from(new Set(candidates)).filter((node) => getNodeTextLength2(node) > 0).sort((a, b) => getNodeTextLength2(b) - getNodeTextLength2(a));
    return uniqueCandidates[0] ?? container;
  }
  function collectContainerImageHtml2(container, root) {
    const seen = /* @__PURE__ */ new Set();
    const parts = [];
    const addImage = (src, alt = "") => {
      const normalizedSrc = sanitizeImageSrc3(src);
      if (!normalizedSrc || seen.has(normalizedSrc)) return;
      seen.add(normalizedSrc);
      parts.push(`<img src="${escapeHtml3(normalizedSrc)}" alt="${escapeHtml3(alt)}">`);
    };
    for (const img of Array.from(container.querySelectorAll("img"))) {
      if (root.contains(img)) continue;
      addImage(img.currentSrc || img.getAttribute("src") || "", img.getAttribute("alt") ?? "");
      for (const src of extractUrlsFromSrcset3(img.getAttribute("srcset"))) {
        addImage(src, img.getAttribute("alt") ?? "");
      }
    }
    for (const source of Array.from(container.querySelectorAll("source"))) {
      if (root.contains(source)) continue;
      for (const src of extractUrlsFromSrcset3(source.getAttribute("srcset"))) {
        addImage(src);
      }
    }
    const imageDataAttrs = ["data-src", "data-image-src", "data-image-url", "data-full-image-url", "data-thumbnail-url"];
    for (const el of Array.from(container.querySelectorAll("*"))) {
      if (root.contains(el)) continue;
      for (const attr of imageDataAttrs) {
        const value = el.getAttribute(attr);
        if (value) addImage(value, el.getAttribute("aria-label") ?? "");
      }
      for (const src of extractUrlsFromStyle3(el.getAttribute("style"))) {
        addImage(src, el.getAttribute("aria-label") ?? "");
      }
    }
    return parts.join("");
  }
  function serializeNode3(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      return escapeHtml3(node.textContent ?? "");
    }
    if (!(node instanceof HTMLElement)) return "";
    if (SKIP_TAGS3.has(node.tagName)) return "";
    const inner = Array.from(node.childNodes).map(serializeNode3).join("");
    switch (node.tagName) {
      case "BR":
        return "<br>";
      case "P":
        return `<p>${inner}</p>`;
      case "DIV":
      case "SECTION":
      case "ARTICLE":
        return inner.trim() ? `<div>${inner}</div>` : "";
      case "SPAN":
        return inner;
      case "STRONG":
      case "B":
        return `<strong>${inner}</strong>`;
      case "EM":
      case "I":
        return `<em>${inner}</em>`;
      case "CODE":
        return node.closest("pre") ? inner : `<code>${inner}</code>`;
      case "PRE": {
        const code = node.querySelector("code");
        const codeText = escapeHtml3(code?.textContent ?? node.textContent ?? "");
        return `<pre><code>${codeText}</code></pre>`;
      }
      case "A": {
        const href = sanitizeHref3(node.getAttribute("href"));
        return href ? `<a href="${escapeHtml3(href)}" target="_blank" rel="noreferrer noopener">${inner}</a>` : inner;
      }
      case "BUTTON":
        return inner;
      case "IMG": {
        const src = sanitizeImageSrc3(node.currentSrc || node.getAttribute("src"));
        if (!src) return "";
        const alt = escapeHtml3(node.getAttribute("alt") ?? "");
        return `<img src="${escapeHtml3(src)}" alt="${alt}">`;
      }
      case "UL":
        return `<ul>${inner}</ul>`;
      case "OL":
        return `<ol>${inner}</ol>`;
      case "LI":
        return `<li>${inner}</li>`;
      case "BLOCKQUOTE":
        return `<blockquote>${inner}</blockquote>`;
      case "H1":
      case "H2":
      case "H3":
      case "H4":
      case "H5":
      case "H6":
        return `<${node.tagName.toLowerCase()}>${inner}</${node.tagName.toLowerCase()}>`;
      case "HR":
        return "<hr>";
      case "TABLE":
      case "THEAD":
      case "TBODY":
      case "TR":
      case "TH":
      case "TD":
        return `<${node.tagName.toLowerCase()}>${inner}</${node.tagName.toLowerCase()}>`;
      default:
        return inner;
    }
  }
  function normalizeHtml3(html) {
    return html.replace(/(?:<div>\s*<\/div>|\s+\n)/g, "").trim();
  }
  function captureReply3(container) {
    const root = getContentRoot3(container);
    const html = normalizeHtml3(`${serializeNode3(root)}${collectContainerImageHtml2(container, root)}`);
    const fallbackText = (container.textContent ?? "").replace(/\s+/g, " ").trim();
    return {
      content: html || escapeHtml3(fallbackText),
      format: "html"
    };
  }
  function createClaudeAdapter() {
    return {
      id: "claude",
      getResponseContainers() {
        const candidates = [...document.querySelectorAll(RESPONSE_SELECTORS3)];
        return candidates.filter((el) => {
          if (el.querySelector(EDITOR_SELECTORS3)) return false;
          return getNodeTextLength2(el) > 0;
        });
      },
      getAllAssistantReplies() {
        const containers = this.getResponseContainers();
        return containers.map((c) => captureReply3(c)).filter((reply) => reply.content.length > 0);
      },
      readResponse(node) {
        return captureReply3(node);
      },
      isGenerating() {
        const stopBtn = document.querySelector(STOP_SELECTORS);
        if (stopBtn) return true;
        return document.querySelector(ACTIVITY_INDICATORS2) !== null;
      },
      async stopGenerating() {
        const stopBtn = document.querySelector(STOP_SELECTORS);
        if (!stopBtn) return false;
        if (!isClickableButton(stopBtn)) return false;
        stopBtn.click();
        return true;
      },
      async startNewChat() {
        const candidates = [...document.querySelectorAll(NEW_CHAT_SELECTORS3)];
        const newChatBtn = candidates.find((el) => {
          const text = (el.textContent ?? "").trim();
          const label = el.getAttribute("aria-label") ?? "";
          const href = el instanceof HTMLAnchorElement ? el.href : "";
          return /new chat|新对话|新しいチャット/i.test(text) || /new chat|新对话|新しいチャット/i.test(label) || /\/new$/i.test(href);
        });
        if (newChatBtn && isClickableButton(newChatBtn)) {
          newChatBtn.click();
          return true;
        }
        location.href = "https://claude.ai/new";
        return true;
      },
      async fillAndSend(content, autoSend = true) {
        const editor = await waitForElement(EDITOR_SELECTORS3, 1e4);
        setContentEditableText(editor, content);
        if (!autoSend) return;
        const sendBtn = await waitForClickableButton(SEND_BUTTON_SELECTORS3, 1e4, "Send button not found or not clickable");
        sendBtn.click();
      }
    };
  }

  // src/content/sites/placeholder.ts
  function createPlaceholderAdapter(id, hostname) {
    const warn = (method) => {
      console.warn(`[MultiChat] ${id} adapter: ${method} not yet implemented (${hostname})`);
    };
    return {
      id,
      getResponseContainers() {
        warn("getResponseContainers");
        return [];
      },
      getAllAssistantReplies() {
        warn("getAllAssistantReplies");
        return [];
      },
      readResponse(_node) {
        warn("readResponse");
        return { content: "", format: "text" };
      },
      isGenerating() {
        return false;
      },
      async stopGenerating() {
        warn("stopGenerating");
        return false;
      },
      async startNewChat() {
        warn("startNewChat");
        return false;
      },
      async fillAndSend(_content, _autoSend) {
        warn("fillAndSend");
      }
    };
  }

  // src/content/sites/index.ts
  var adapterMap = {
    // OpenAI ChatGPT
    "chatgpt.com": createChatGptAdapter,
    "chat.openai.com": createChatGptAdapter,
    // Google Gemini
    "gemini.google.com": createGeminiAdapter,
    // Anthropic Claude
    "claude.ai": createClaudeAdapter,
    // DeepSeek (placeholder - full adapter in US-003)
    "chat.deepseek.com": () => createPlaceholderAdapter("deepseek", "chat.deepseek.com"),
    // Kimi (placeholder - full adapter in US-004)
    "kimi.moonshot.cn": () => createPlaceholderAdapter("kimi", "kimi.moonshot.cn"),
    // 豆包 (placeholder - full adapter in US-005)
    "www.doubao.com": () => createPlaceholderAdapter("doubao", "www.doubao.com"),
    "doubao.com": () => createPlaceholderAdapter("doubao", "doubao.com"),
    // 文心一言 (placeholder - full adapter in US-006)
    "yiyan.baidu.com": () => createPlaceholderAdapter("yiyan", "yiyan.baidu.com"),
    // 通义千问 (placeholder - full adapter in US-007)
    "tongyi.aliyun.com": () => createPlaceholderAdapter("tongyi", "tongyi.aliyun.com"),
    // Perplexity (placeholder - full adapter in US-008)
    "www.perplexity.ai": () => createPlaceholderAdapter("perplexity", "www.perplexity.ai"),
    "perplexity.ai": () => createPlaceholderAdapter("perplexity", "perplexity.ai")
  };
  function getSupportedHostnames() {
    return Object.keys(adapterMap);
  }
  function getActiveChatSiteAdapter() {
    const hostname = location.hostname;
    const adapterFactory = adapterMap[hostname];
    if (adapterFactory) {
      console.log(`[MultiChat] Using adapter for: ${hostname}`);
      return adapterFactory();
    }
    throw new Error(
      `[MultiChat] No adapter found for hostname: ${hostname}. Supported hostnames: ${getSupportedHostnames().join(", ")}`
    );
  }

  // src/content/replyObserver.ts
  function createReplyObserver(options) {
    const { siteAdapter, onReply, onStatusChange } = options;
    let baselineContainers = [];
    let observer = null;
    let pollTimer = null;
    let timeoutTimer = null;
    let stabilityTimer = null;
    let lastReplySignature = "";
    let active = false;
    function clearTimers() {
      if (pollTimer !== null) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
      if (timeoutTimer !== null) {
        clearTimeout(timeoutTimer);
        timeoutTimer = null;
      }
      if (stabilityTimer !== null) {
        clearTimeout(stabilityTimer);
        stabilityTimer = null;
      }
    }
    function stopObserving() {
      if (observer) {
        observer.disconnect();
        observer = null;
      }
    }
    function isNewContainer(el) {
      return !baselineContainers.includes(el);
    }
    function getNewReplies() {
      const all = siteAdapter.getResponseContainers();
      const newOnes = all.filter(isNewContainer);
      return newOnes.map((c) => siteAdapter.readResponse(c)).filter((reply) => reply.content.length > 0);
    }
    function getLatestReply() {
      const replies = getNewReplies();
      return replies.length > 0 ? replies[replies.length - 1] : null;
    }
    function getLatestContainer() {
      const all = siteAdapter.getResponseContainers();
      const newOnes = all.filter(isNewContainer);
      return newOnes.length > 0 ? newOnes[newOnes.length - 1] : null;
    }
    function sendStreamUpdate() {
      const reply = getLatestReply();
      if (!reply || reply.content.length === 0) return;
      const signature = `${reply.format}:${reply.content}`;
      if (signature !== lastReplySignature) {
        lastReplySignature = signature;
        onReply(reply, false);
        onStatusChange("generating");
      }
    }
    function checkCompletion() {
      const reply = getLatestReply();
      if (!reply || reply.content.length === 0) return;
      if (!siteAdapter.isGenerating()) {
        if (stabilityTimer === null) {
          stabilityTimer = setTimeout(async () => {
            if (!active) return;
            const latestContainer = getLatestContainer();
            const finalReply = latestContainer && siteAdapter.captureFinalReply ? await siteAdapter.captureFinalReply(latestContainer) : getLatestReply();
            if (finalReply && finalReply.content.length > 0) {
              onReply(finalReply, true);
              onStatusChange("idle");
            }
            stopInternal();
          }, 800);
        }
      }
    }
    function setupObserver() {
      stopObserving();
      observer = new MutationObserver(() => {
        if (!active) return;
        sendStreamUpdate();
      });
      observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    }
    function startPolling() {
      if (pollTimer !== null) return;
      pollTimer = setInterval(() => {
        if (!active) return;
        sendStreamUpdate();
        checkCompletion();
      }, 300);
    }
    function startTimeout() {
      if (timeoutTimer !== null) return;
      timeoutTimer = setTimeout(() => {
        if (!active) return;
        const reply = getLatestReply();
        if (reply && reply.content.length > 0) {
          onReply(reply, true);
        }
        onStatusChange("error", "timeout");
        stopInternal();
      }, 12e4);
    }
    function stopInternal() {
      active = false;
      stopObserving();
      clearTimers();
    }
    return {
      captureBaseline() {
        baselineContainers = siteAdapter.getResponseContainers();
        lastReplySignature = "";
      },
      startPolling() {
        active = true;
        setupObserver();
        startPolling();
        startTimeout();
        onStatusChange("generating");
      },
      stop() {
        stopInternal();
      }
    };
  }

  // src/content/index.ts
  function injectEmbeddedScrollbarStyles() {
    if (document.getElementById("multichat-hide-embedded-scrollbar")) return;
    const style = document.createElement("style");
    style.id = "multichat-hide-embedded-scrollbar";
    style.textContent = `
    html, body, * {
      scrollbar-width: none !important;
      -ms-overflow-style: none !important;
    }

    html::-webkit-scrollbar,
    body::-webkit-scrollbar,
    *::-webkit-scrollbar {
      width: 0 !important;
      height: 0 !important;
      display: none !important;
    }
  `;
    (document.head || document.documentElement).appendChild(style);
  }
  if (typeof window.__CHAOJIA_LOADED__ === "undefined") {
    ;
    window.__CHAOJIA_LOADED__ = true;
    if (window.parent !== window) {
      injectEmbeddedScrollbarStyles();
      let siteAdapter;
      try {
        siteAdapter = getActiveChatSiteAdapter();
      } catch (err) {
        console.log("[MultiChat] This site is not supported, content script inactive:", err.message);
      }
      if (siteAdapter) {
        const replyObserver = createReplyObserver({
          siteAdapter,
          onReply(reply, isFinal) {
            chrome.runtime.sendMessage({
              type: "ROLE_REPLY",
              site: siteAdapter.id,
              content: reply.content,
              contentFormat: reply.format,
              pageUrl: location.href,
              isFinal
            });
          },
          onStatusChange(status, detail) {
            chrome.runtime.sendMessage({
              type: "ROLE_STATUS",
              site: siteAdapter.id,
              status,
              detail,
              pageUrl: location.href
            });
          }
        });
        chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
          if (message.type === "FILL_AND_SEND") {
            if (Array.isArray(message.activeSites) && !message.activeSites.includes(siteAdapter.id)) {
              sendResponse({ ok: true, skipped: true });
              return false;
            }
            const { content, autoSend } = message;
            replyObserver.captureBaseline();
            replyObserver.startPolling();
            siteAdapter.fillAndSend(content, autoSend).catch((err) => {
              console.error("[aigumi] fillAndSend failed:", err);
              replyObserver.stop();
              chrome.runtime.sendMessage({
                type: "ROLE_STATUS",
                site: siteAdapter.id,
                status: "error",
                detail: err.message
              });
            });
            sendResponse({ ok: true });
            return true;
          }
          if (message.type === "START_NEW_CHAT") {
            if (Array.isArray(message.activeSites) && !message.activeSites.includes(siteAdapter.id)) {
              sendResponse({ ok: true, skipped: true });
              return false;
            }
            siteAdapter.startNewChat().then((ok) => sendResponse({ ok })).catch((err) => {
              chrome.runtime.sendMessage({
                type: "ROLE_STATUS",
                site: siteAdapter.id,
                status: "error",
                detail: err.message,
                pageUrl: location.href
              });
              sendResponse({ ok: false, error: err.message });
            });
            return true;
          }
        });
      }
    }
  }
})();

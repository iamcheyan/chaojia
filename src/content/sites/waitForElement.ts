export function querySelectorFirst(selectors: string): HTMLElement | null {
  for (const selector of selectors.split(',').map(s => s.trim())) {
    const el = document.querySelector(selector) as HTMLElement | null
    if (el) return el
  }
  return null
}

export function waitForElement(selectors: string, timeoutMs: number): Promise<HTMLElement> {
  const immediate = querySelectorFirst(selectors)
  if (immediate) return Promise.resolve(immediate)
  return new Promise((resolve, reject) => {
    const startedAt = Date.now()
    const timer = window.setInterval(() => {
      const el = querySelectorFirst(selectors)
      if (el) { window.clearInterval(timer); resolve(el); return }
      if (Date.now() - startedAt >= timeoutMs) { window.clearInterval(timer); reject(new Error(`Element not found: ${selectors}`)) }
    }, 250)
  })
}

export function waitForClickableButton(selectors: string, timeoutMs: number, errorMsg: string): Promise<HTMLElement> {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now()
    const timer = window.setInterval(() => {
      const buttons = selectors.split(',').map(s => s.trim()).flatMap(sel => [...document.querySelectorAll<HTMLElement>(sel)])
      const btn = buttons.find(b => !(b instanceof HTMLButtonElement) || (!b.disabled && b.getAttribute('aria-disabled') !== 'true'))
      if (btn) { window.clearInterval(timer); resolve(btn); return }
      if (Date.now() - startedAt >= timeoutMs) { window.clearInterval(timer); reject(new Error(errorMsg)) }
    }, 250)
  })
}

export function isClickableButton(el: HTMLElement): boolean {
  if (!(el instanceof HTMLButtonElement)) return true
  return !el.disabled && el.getAttribute('aria-disabled') !== 'true'
}

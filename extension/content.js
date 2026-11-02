// Videoların üzerinde "İndir" düğmesi gösterir (IDM tarzı).
'use strict'
;(() => {
  const api = globalThis.browser ?? globalThis.chrome
  if (window.__dmVideoButton) return
  window.__dmVideoButton = true

  let config = null
  let button = null
  let current = null
  let hideTimer = null

  const ensureButton = () => {
    if (button) return button
    const host = document.createElement('div')
    host.style.cssText = 'position:fixed;z-index:2147483647;top:0;left:0;display:none'
    // Shadow DOM: sayfanın CSS'i düğmeyi bozmasın
    const shadow = host.attachShadow({ mode: 'closed' })
    shadow.innerHTML = `
      <style>
        button{all:initial;display:flex;align-items:center;gap:6px;padding:6px 11px;border-radius:8px;
          background:rgba(37,99,235,.95);color:#fff;font:600 12.5px/1 -apple-system,'Segoe UI',Roboto,sans-serif;
          cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.35)}
        button:hover{background:#1d4fd8}
        svg{width:14px;height:14px}
      </style>
      <button type="button"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v12M6 11l6 6 6-6M5 21h14"/></svg><span></span></button>`
    const btn = shadow.querySelector('button')
    shadow.querySelector('span').textContent = config.label
    btn.addEventListener('mouseenter', () => clearTimeout(hideTimer))
    btn.addEventListener('mouseleave', scheduleHide)
    btn.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      const src = current && (current.currentSrc || current.src)
      api.runtime.sendMessage({ type: 'videoClick', src: src && !src.startsWith('blob:') ? src : null }, (r) => {
        shadow.querySelector('span').textContent = r && r.ok ? '✓' : '✗'
        setTimeout(() => (shadow.querySelector('span').textContent = config.label), 1800)
      })
    })
    document.documentElement.appendChild(host)
    button = host
    return host
  }

  const place = (video) => {
    const r = video.getBoundingClientRect()
    if (r.width < 200 || r.height < 120) return
    const b = ensureButton()
    b.style.display = 'block'
    b.style.top = `${Math.max(4, r.top + 10)}px`
    b.style.left = `${Math.min(window.innerWidth - 110, r.right - 100)}px`
  }

  function scheduleHide() {
    clearTimeout(hideTimer)
    hideTimer = setTimeout(() => {
      if (button) button.style.display = 'none'
      current = null
    }, 1500)
  }

  const check = (e) => {
    const target = e.target
    const video = target instanceof HTMLVideoElement ? target : target.closest && target.closest('video')
    // Birçok oynatıcı videonun üstüne şeffaf katman koyar; konumdan bul
    const found = video || [...document.querySelectorAll('video')].find((v) => {
      const r = v.getBoundingClientRect()
      return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom
    })
    // Fare videonun üzerinde durdukça düğme kalır; videodan çıkınca kısa süre sonra gizlenir
    if (!found) {
      if (current) scheduleHide()
      return
    }
    current = found
    clearTimeout(hideTimer)
    place(found)
  }

  // 120 ms'de bir kontrol; son hareket de kaçmasın diye sondaki olay ayrıca işlenir
  let lastMove = 0
  let trailing = null
  const onOver = (e) => {
    clearTimeout(trailing)
    const wait = 120 - (performance.now() - lastMove)
    if (wait > 0) {
      trailing = setTimeout(() => onOver(e), wait)
      return
    }
    lastMove = performance.now()
    check(e)
  }

  api.runtime.sendMessage({ type: 'contentConfig' }, (cfg) => {
    if (!cfg || !cfg.videoButton) return
    config = cfg
    document.addEventListener('mousemove', onOver, { passive: true, capture: true })
    document.documentElement.addEventListener('mouseleave', () => current && scheduleHide())
    window.addEventListener('scroll', () => current && place(current), { passive: true })
  })
})()

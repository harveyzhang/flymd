// src/exporters/docx.ts
// 使用 html-to-docx 将 HTML/Element 导出为 DOCX 字节

async function svgToPngDataUrl(svgEl: SVGElement): Promise<string> {
  try {
    const serializer = new XMLSerializer()
    const svgStr = serializer.serializeToString(svgEl)
    const viewBox = svgEl.getAttribute('viewBox')
    let width = Number(svgEl.getAttribute('width')) || 0
    let height = Number(svgEl.getAttribute('height')) || 0
    if ((!width || !height) && viewBox) {
      const parts = viewBox.split(/\s+/).map(Number)
      if (parts.length === 4) { width = parts[2]; height = parts[3] }
    }
    if (!width || !height) {
      width = (svgEl as any).clientWidth || 800
      height = (svgEl as any).clientHeight || 600
    }
    // 创建图片并渲染到 canvas
    const svgBlob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(svgBlob)
    try {
      await new Promise<void>((resolve, reject) => {
        const img = new Image()
        img.onload = () => {
          try {
            const ratio = img.width > 0 ? Math.min(1, 2000 / img.width) : 1
            const cw = Math.max(1, Math.round(img.width * ratio))
            const ch = Math.max(1, Math.round(img.height * ratio))
            const canvas = document.createElement('canvas')
            canvas.width = cw; canvas.height = ch
            const ctx = canvas.getContext('2d')!
            ctx.fillStyle = '#fff'; ctx.fillRect(0,0,cw,ch)
            ctx.drawImage(img, 0, 0, cw, ch)
            ;(img as any)._dataUrl = canvas.toDataURL('image/png')
            resolve()
          } catch (e) { reject(e) }
        }
        img.onerror = () => reject(new Error('svg -> png 加载失败'))
        img.src = url
      })
      const imgEl: any = (await (async () => { const im = new Image(); im.src = url; return im })())
      // 上面加载过一次得到 _dataUrl
      return String((imgEl as any)._dataUrl || '')
    } finally {
      URL.revokeObjectURL(url)
    }
  } catch (e) {
    console.error('svgToPngDataUrl 失败', e)
    return ''
  }
}

async function imgElToDataUrl(imgEl: HTMLImageElement): Promise<string> {
  try {
    // 已经是 data: 则直接返回
    const src = imgEl.currentSrc || imgEl.src || ''
    if (/^data:/i.test(src)) return src
    // 将实际像素绘制到 canvas 获取 PNG，避免跨域失败的源（asset:/file: 通常可用）
    await new Promise<void>((resolve, reject) => {
      if (imgEl.complete && imgEl.naturalWidth) return resolve()
      imgEl.onload = () => resolve()
      imgEl.onerror = () => reject(new Error('img 加载失败'))
    })
    const w = Math.max(1, imgEl.naturalWidth)
    const h = Math.max(1, imgEl.naturalHeight)
    const ratio = w > 0 ? Math.min(1, 2000 / w) : 1
    const cw = Math.round(w * ratio)
    const ch = Math.round(h * ratio)
    const canvas = document.createElement('canvas')
    canvas.width = cw; canvas.height = ch
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#fff'; ctx.fillRect(0,0,cw,ch)
    ctx.drawImage(imgEl, 0, 0, cw, ch)
    return canvas.toDataURL('image/png')
  } catch (e) {
    console.warn('imgElToDataUrl 失败，使用原 src', e)
    return imgEl.src || ''
  }
}

async function preprocessElementForDocx(el: HTMLElement): Promise<string> {
  // 克隆一份，避免污染界面
  const clone = el.cloneNode(true) as HTMLElement

  // 1) 将 SVG 转为 PNG <img>
  const svgs = Array.from(el.querySelectorAll('svg')) as SVGElement[]
  if (svgs.length) {
    const svgDataList = await Promise.all(svgs.map(svgToPngDataUrl))
    const cloneSvgs = Array.from(clone.querySelectorAll('svg')) as Element[]
    for (let i = 0, j = 0; i < cloneSvgs.length && j < svgDataList.length; i++) {
      const dataUrl = svgDataList[j]
      j++
      try {
        const img = document.createElement('img')
        if (dataUrl) img.src = dataUrl
        // 尽量保留尺寸
        const vb = (cloneSvgs[i] as SVGElement).getAttribute('viewBox') || ''
        const w = (cloneSvgs[i] as SVGElement).getAttribute('width')
        const h = (cloneSvgs[i] as SVGElement).getAttribute('height')
        if (w) img.setAttribute('width', w)
        if (h) img.setAttribute('height', h)
        if (!w && vb) {
          const parts = vb.split(/\s+/)
          if (parts.length === 4) img.setAttribute('width', parts[2])
          if (parts.length === 4) img.setAttribute('height', parts[3])
        }
        cloneSvgs[i].replaceWith(img)
      } catch {}
    }
  }

  // 2) 将 IMG 的 src 转为 data:，避免 asset:/file:/相对路径
  const imgsOrig = Array.from(el.querySelectorAll('img')) as HTMLImageElement[]
  const imgsClone = Array.from(clone.querySelectorAll('img')) as HTMLImageElement[]
  if (imgsOrig.length && imgsOrig.length === imgsClone.length) {
    const dataList = await Promise.all(imgsOrig.map(imgElToDataUrl))
    for (let i = 0; i < imgsClone.length; i++) {
      const src = dataList[i]
      if (src) imgsClone[i].src = src
      // 限制在版心内
      imgsClone[i].style.maxWidth = '100%'
      imgsClone[i].style.height = 'auto'
    }
  }

  // 3) 注入基础样式，改善段落/图片/代码块在 DOCX 中的表现
  const style = document.createElement('style')
  style.textContent = `
    .preview-body img, img { max-width: 100% !important; height: auto !important; }
    pre { white-space: pre-wrap; word-break: break-word; }
    code { word-break: break-word; }
  `
  clone.prepend(style)

  return clone.outerHTML
}

export async function exportDocx(htmlOrEl: string | HTMLElement, opt?: any): Promise<Uint8Array> {
  let html = typeof htmlOrEl === 'string' ? htmlOrEl : await preprocessElementForDocx(htmlOrEl)
  const mod: any = await import('html-to-docx')
  const toDocx = mod?.default || mod
  const out: any = await toDocx(html, null, {
    table: { row: { cantSplit: true } },
    ...opt,
  })
  if (out instanceof Blob) {
    const ab = await out.arrayBuffer()
    return new Uint8Array(ab)
  }
  if (out instanceof ArrayBuffer) return new Uint8Array(out)
  if (ArrayBuffer.isView(out)) return new Uint8Array(out.buffer)
  if (out && typeof out === 'object' && typeof out.byteLength === 'number') {
    return new Uint8Array(out as ArrayBufferLike)
  }
  if (typeof out === 'string') {
    const encoder = new TextEncoder()
    return encoder.encode(out)
  }
  throw new Error('未知的 DOCX 输出类型')
}

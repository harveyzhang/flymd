// src/exporters/pdf.ts
// 使用 html2pdf.js 将指定 DOM 元素导出为 PDF 字节
export async function exportPdf(el: HTMLElement, opt?: any): Promise<Uint8Array> {
  const mod: any = await import('html2pdf.js/dist/html2pdf.bundle.min.js')
  const html2pdf: any = (mod && (mod.default || mod)) || mod

  const options = {
    margin: 10, // 单位：mm
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
    pagebreak: { mode: ['css', 'legacy'] },
    ...opt,
  }

  // 克隆并注入基础样式，保证图片不溢出
  const wrap = document.createElement('div')
  wrap.style.position = 'fixed'
  wrap.style.left = '-10000px'
  wrap.style.top = '0'
  const clone = el.cloneNode(true) as HTMLElement
  const style = document.createElement('style')
  style.textContent = `
    .preview-body img, img { max-width: 100% !important; height: auto !important; }
    figure { max-width: 100% !important; }
  `
  clone.prepend(style)
  wrap.appendChild(clone)
  document.body.appendChild(wrap)
  try {
    const ab: ArrayBuffer = await html2pdf().set(options).from(clone).toPdf().output('arraybuffer')
    return new Uint8Array(ab)
  } finally {
    try { document.body.removeChild(wrap) } catch {}
  }
}

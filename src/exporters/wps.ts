// src/exporters/wps.ts
// 最小可用：直接复用 docx 字节，调用方以 .wps 写盘；WPS 可直接打开
import { exportDocx } from './docx'

export async function exportWps(html: string, opt?: any): Promise<Uint8Array> {
  return exportDocx(html as any, opt)
}


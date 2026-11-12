// 界面素材后处理：抠掉纯色底（自动取四边的颜色当底色），可裁掉透明边，再缩到指定尺寸。
// 用法：node scripts/ui-asset.mjs <原图.png> <输出.png> [--max 256] [--trim] [--keep-bg]
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { PNG } from 'pngjs';

const [src, out, ...flags] = process.argv.slice(2);
if (!src || !out) {
  console.error('用法：node scripts/ui-asset.mjs <原图.png> <输出.png> [--max N] [--trim] [--keep-bg]');
  process.exit(1);
}
const max = flags.includes('--max') ? Number(flags[flags.indexOf('--max') + 1]) : 0;
const trim = flags.includes('--trim');
const keepBg = flags.includes('--keep-bg');

let png = PNG.sync.read(fs.readFileSync(src));
const { width: W, height: H, data } = png;
const at = (x, y) => (y * W + x) * 4;

if (!keepBg) {
  // 底色 = 最外一圈像素的中位数
  const ring = [[], [], [], []];
  for (let x = 0; x < W; x++) for (const y of [0, 1, H - 2, H - 1]) for (let c = 0; c < 4; c++) ring[c].push(data[at(x, y) + c]);
  for (let y = 0; y < H; y++) for (const x of [0, 1, W - 2, W - 1]) for (let c = 0; c < 4; c++) ring[c].push(data[at(x, y) + c]);
  const med = ring.map((a) => a.sort((p, q) => p - q)[a.length >> 1]);
  if (med[3] < 16) {
    console.log(`${src}: 已经是透明底，不再抠图`);
  } else {
    const bg = med.slice(0, 3);
    const spread = Math.max(...bg) - Math.min(...bg);
    if (spread < 90) console.warn(`${src}: 警告——底色 rgb(${bg}) 不是鲜艳的纯色，抠图结果可能不干净`);
    const T0 = 0.14, T1 = 0.34;
    for (let i = 0; i < data.length; i += 4) {
      const d = Math.hypot(data[i] - bg[0], data[i + 1] - bg[1], data[i + 2] - bg[2]) / 441.7;
      const a = Math.min(1, Math.max(0, (d - T0) / (T1 - T0)));
      if (a < 1) {
        // 半透明边缘：按「前景 × a + 底色 × (1 − a)」反推出前景色，去掉底色的溢色
        const k = Math.max(a, 0.05);
        for (let c = 0; c < 3; c++) data[i + c] = Math.max(0, Math.min(255, Math.round((data[i + c] - (1 - a) * bg[c]) / k)));
      }
      data[i + 3] = Math.round(data[i + 3] * a);
    }
    console.log(`${src}: 底色 rgb(${bg}) 已抠除`);
  }
}

if (trim) {
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (data[at(x, y) + 3] > 8) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  if (x1 >= 0) {
    const pad = 4;
    x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(W - 1, x1 + pad); y1 = Math.min(H - 1, y1 + pad);
    const cut = new PNG({ width: x1 - x0 + 1, height: y1 - y0 + 1 });
    PNG.bitblt(png, cut, x0, y0, cut.width, cut.height, 0, 0);
    png = cut;
  }
}

fs.writeFileSync(out, PNG.sync.write(png));
if (max && Math.max(png.width, png.height) > max) execFileSync('sips', ['-Z', String(max), out], { stdio: 'ignore' });
const fin = PNG.sync.read(fs.readFileSync(out));
console.log(`${out}: ${fin.width}×${fin.height}`);

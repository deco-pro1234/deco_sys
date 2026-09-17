import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export type ChineseFontPack = {
  regular: Uint8Array;
  bold: Uint8Array;
  regularFamily: string;
  boldFamily: string;
};

let cache: ChineseFontPack | null = null;

function tryResolveFontPath(filename: string): string | null {
  const candidates: string[] = [
    join(process.cwd(), 'public', 'fonts', filename),
    join(process.cwd(), '..', 'public', 'fonts', filename),
    join(process.cwd(), 'src', 'public', 'fonts', filename),
  ];
  for (const c of candidates) {
    try { if (existsSync(c)) return c; } catch { /* ignore */ }
  }
  return null;
}

export function loadChineseFonts(): ChineseFontPack {
  if (cache) return cache;
  const regPath = tryResolveFontPath('NotoSansSC-Regular.ttf');
  const boldPath = tryResolveFontPath('msyh.ttf');
  let regularBuf: Uint8Array;
  let boldBuf: Uint8Array;
  let regularFamily = 'NotoSansSC';
  let boldFamily = 'NotoSansSC-Bold';
  if (!regPath) {
    throw new Error(
      `[loadChineseFonts] 找不到 NotoSansSC-Regular.ttf. cwd=${process.cwd()}. 請確認 public/fonts 已複製到部署容器內.`,
    );
  }
  regularBuf = new Uint8Array(readFileSync(regPath));
  if (boldPath) {
    boldBuf = new Uint8Array(readFileSync(boldPath));
    boldFamily = 'MSYaHei';
  } else {
    boldBuf = regularBuf;
    boldFamily = 'NotoSansSC';
  }
  cache = {
    regular: regularBuf,
    bold: boldBuf,
    regularFamily,
    boldFamily,
  };
  return cache;
}

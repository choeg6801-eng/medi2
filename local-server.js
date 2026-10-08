// 내 컴퓨터에서 사이트를 실행하는 작은 서버입니다. (추가 설치 없이 Node.js만 있으면 됩니다)
// 실행: 터미널에서  npm start   →  브라우저에서 http://localhost:3000
//
// - public/ 폴더의 파일을 보여 주고
// - /api/fx, /api/news 요청은 api/ 폴더의 서버 코드로 넘깁니다. (Vercel에 올리면 Vercel이 같은 일을 합니다)
// - .env 파일의 API 키를 읽어 process.env 에 넣습니다.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, 'public');
const PORT = Number(process.env.PORT) || 3000;

/* .env 읽기 (KEY=VALUE 형식, # 으로 시작하는 줄은 무시) */
const envFile = path.join(ROOT, '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m || line.trim().startsWith('#')) continue;
    const value = m[2].replace(/^["']|["']$/g, '');
    if (!(m[1] in process.env)) process.env[m[1]] = value;
  }
} else {
  console.warn('⚠  .env 파일이 없습니다. .env.example 을 복사해 .env 로 만들고 API 키를 넣으세요. (없어도 예시 데이터로 실행됩니다)');
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  // API 요청 → api/이름.js
  const api = url.pathname.match(/^\/api\/([a-z0-9-]+)\/?$/i);
  if (api) {
    const file = path.join(ROOT, 'api', `${api[1]}.js`);
    if (!fs.existsSync(file)) { res.statusCode = 404; return res.end('{"error":"없는 API입니다."}'); }
    try {
      const mod = await import(pathToFileURL(file).href);
      await mod.default(req, res);
    } catch (e) {
      console.error(e);
      res.statusCode = 500; res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ error: e.message }));
    }
    console.log(`${new Date().toLocaleTimeString('ko-KR')}  ${req.method} ${url.pathname} → ${res.statusCode}`);
    return;
  }

  // 정적 파일
  let file = path.normalize(path.join(PUBLIC, decodeURIComponent(url.pathname)));
  if (!file.startsWith(PUBLIC)) { res.statusCode = 403; return res.end(); }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) file = path.join(PUBLIC, 'index.html');
  res.setHeader('Content-Type', TYPES[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
});

server.listen(PORT, () => {
  console.log('\n  Aurelis Trade Console 실행 중');
  console.log(`  → http://localhost:${PORT}\n`);
  console.log(`  환율 API 키: ${process.env.KOREAEXIM_API_KEY ? '설정됨' : '없음 (ExchangeRate-API 공개 시세 사용)'}`);
  console.log(`  네이버 뉴스 키: ${process.env.NAVER_CLIENT_ID ? '설정됨' : '없음 (Google 뉴스만 사용)'}`);
  console.log('  끄려면 이 터미널에서 Ctrl + C\n');
});

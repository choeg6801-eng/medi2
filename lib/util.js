// 서버 함수들이 함께 쓰는 작은 도우미 모음입니다.

/** JSON 응답을 보냅니다. maxAge(초)를 주면 Vercel CDN이 그 시간 동안 응답을 캐시합니다. */
export function sendJSON(res, status, body, maxAge = 0) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  // GitHub Pages 등 다른 주소의 사이트에서도 이 API를 읽을 수 있게 허용 (공개 데이터만 제공)
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (maxAge > 0 && status === 200) {
    res.setHeader('Cache-Control', `public, s-maxage=${maxAge}, stale-while-revalidate=600`);
  } else {
    res.setHeader('Cache-Control', 'no-store');
  }
  res.end(JSON.stringify(body));
}

/** 서버 메모리 캐시. 서버가 켜져 있는 동안 같은 결과를 재사용해 API 호출 횟수를 아낍니다. */
const memory = new Map();
export async function cached(key, ttlMs, loader) {
  const hit = memory.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value;
  const value = await loader();
  memory.set(key, { at: Date.now(), value });
  return value;
}

/** 한국 시간(KST) 기준 날짜/시각 문자열 */
export function kstDate(d = new Date()) {
  return new Date(d.getTime() + 9 * 3600e3).toISOString().slice(0, 10);
}
export function kstStamp(d = new Date()) {
  return new Date(d.getTime() + 9 * 3600e3).toISOString().slice(0, 16).replace('T', ' ') + ' KST';
}

/** HTML 태그와 &quot; 같은 엔티티를 지워 순수 텍스트로 만듭니다. */
export function cleanText(s = '') {
  return String(s)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 제한 시간을 둔 fetch. 외부 API가 멈춰도 사이트가 오래 기다리지 않게 합니다. */
export async function fetchWithTimeout(url, options = {}, ms = 8000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

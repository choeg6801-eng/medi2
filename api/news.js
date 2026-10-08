// GET /api/news
// 의료기기·무역 관련 최신 기사를 모아 사이트 형식으로 돌려줍니다.
// 각 기사의 url은 원문 기사(또는 원문으로 넘어가는 주소)이므로, 사이트에서 카드를 누르면 실제 기사가 열립니다.
//
// 뉴스 출처
//  1) 네이버 검색 API (뉴스) — NAVER_CLIENT_ID, NAVER_CLIENT_SECRET 이 있으면 사용 (국내 기사, 하루 25,000회)
//  2) Google 뉴스 RSS 검색 — 키 없이 항상 사용 (국내·해외 기사)
//
// 선택 환경 변수
//  NEWS_KEYWORDS_KO : 국내 검색어, 쉼표로 구분 (기본: 의료기기 수출,의료기기 인허가,체외진단 수출)
//  NEWS_KEYWORDS_EN : 해외 검색어, 쉼표로 구분 (기본: medical device regulation,medical device export)

import { sendJSON, cached, kstDate, kstStamp, cleanText, fetchWithTimeout } from '../lib/util.js';

const listEnv = (v, def) => (v ? v.split(',').map(s => s.trim()).filter(Boolean) : def);

/* ---------- 분류 규칙: 제목에 들어간 단어로 태그와 지역을 붙입니다 ---------- */
const TAG_RULES = [
  ['인허가', ['허가', '인증', '승인', '등록', '510(k)', 'clearance', 'approval', 'approved', 'CE mark', 'MDMA', 'ANVISA']],
  ['규제', ['규제', '가이드', '지침', 'regulation', 'regulatory', 'guidance', 'FDA', 'MDR', 'IVDR', 'UDI', '리콜', 'recall', 'rule']],
  ['수출지원', ['지원', '사업', '박람회', '전시회', '상담회', 'KOTRA', '코트라', '진흥원', '바우처', 'expo', 'exhibition']],
];
const REGION_RULES = [
  ['SA', ['사우디', 'Saudi', 'SFDA']], ['AE', ['UAE', '두바이', '아부다비', 'Dubai', 'Abu Dhabi']], ['ME', ['중동', 'Middle East', 'GCC']],
  ['US', ['미국', '美', 'FDA', 'U.S.', 'US']], ['CA', ['캐나다', 'Canada', 'Health Canada']],
  ['MX', ['멕시코', 'Mexico', 'COFEPRIS']], ['BR', ['브라질', 'Brazil', 'ANVISA']], ['CL', ['칠레', 'Chile']],
  ['GB', ['영국', 'UK', 'MHRA', 'Britain']], ['EU', ['유럽', 'EU', 'MDR', 'IVDR', 'EUDAMED', 'Europe']], ['DE', ['독일', 'Germany']], ['FR', ['프랑스', 'France']],
  ['TR', ['튀르키예', '터키', 'Turkey', 'Türkiye']], ['RU', ['러시아', 'Russia', 'Roszdravnadzor']], ['KZ', ['카자흐', 'Kazakhstan']],
  ['CN', ['중국', '中', 'China', 'NMPA']], ['JP', ['일본', '日', 'Japan', 'PMDA']], ['ID', ['인도네시아', 'Indonesia']], ['IN', ['인도 ', '인도의', 'India', 'CDSCO']],
  ['VN', ['베트남', 'Vietnam']], ['TH', ['태국', 'Thailand']], ['MY', ['말레이시아', 'Malaysia']], ['PH', ['필리핀', 'Philippines']], ['SG', ['싱가포르', 'Singapore', 'HSA']], ['AU', ['호주', 'Australia', 'TGA']],
  ['EG', ['이집트', 'Egypt']], ['NG', ['나이지리아', 'Nigeria']], ['ZA', ['남아공', 'South Africa', 'SAHPRA']], ['AF', ['아프리카', 'Africa']],
];
// 영문 단어는 단어 경계로, 대문자 약어(FDA, EU 등)는 대소문자까지 맞춰 찾습니다. (SFDA 안의 FDA 같은 오검출 방지)
const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const matches = (title, w) => {
  if (/[가-힣]/.test(w)) return title.includes(w);
  const acronym = /^[A-Z0-9().]+$/.test(w.trim());
  return new RegExp(`(^|[^A-Za-z])${escapeRe(w.trim())}([^A-Za-z]|$)`, acronym ? '' : 'i').test(title);
};
const pick = (title, rules, fallback) => {
  for (const [name, words] of rules) if (words.some(w => matches(title, w))) return name;
  return fallback;
};

const toDate = s => {
  const d = new Date(s);
  return isNaN(d) ? '' : kstDate(d);
};

/* ---------- 1) 네이버 검색 API ---------- */
async function fromNaver(queries) {
  const id = process.env.NAVER_CLIENT_ID, secret = process.env.NAVER_CLIENT_SECRET;
  if (!id || !secret) return [];
  const all = await Promise.all(queries.map(async q => {
    const url = `https://openapi.naver.com/v1/search/news.json?query=${encodeURIComponent(q)}&display=20&sort=date`;
    const res = await fetchWithTimeout(url, { headers: { 'X-Naver-Client-Id': id, 'X-Naver-Client-Secret': secret } });
    if (!res.ok) throw new Error(`네이버 API 오류 (HTTP ${res.status}) — Client ID/Secret과 '검색' API 사용 설정을 확인하세요.`);
    const data = await res.json();
    return (data.items || []).map(it => {
      const url = it.originallink || it.link;
      let source = '';
      try { source = new URL(url).hostname.replace(/^www\.|^m\./, ''); } catch {}
      return { title: cleanText(it.title), url, source, date: toDate(it.pubDate), lang: 'ko' };
    });
  }));
  return all.flat();
}

/* ---------- 2) Google 뉴스 RSS ---------- */
function parseRSS(xml, lang) {
  const items = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const block = m[1];
    const get = tag => (block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`)) || [])[1] || '';
    const source = cleanText(get('source'));
    let title = cleanText(get('title'));
    if (source && title.endsWith(` - ${source}`)) title = title.slice(0, -(source.length + 3));
    const url = cleanText(get('link'));
    if (title && url) items.push({ title, url, source, date: toDate(cleanText(get('pubDate'))), lang });
  }
  return items;
}
async function fromGoogle(queries, lang) {
  const loc = lang === 'ko' ? 'hl=ko&gl=KR&ceid=KR:ko' : 'hl=en-US&gl=US&ceid=US:en';
  const all = await Promise.all(queries.map(async q => {
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q + ' when:14d')}&${loc}`;
    const res = await fetchWithTimeout(url, { headers: { 'User-Agent': 'Mozilla/5.0 (AurelisTradeConsole)' } });
    if (!res.ok) throw new Error(`Google 뉴스 RSS 오류 (HTTP ${res.status})`);
    return parseRSS(await res.text(), lang).slice(0, 10);
  }));
  return all.flat();
}

/* ---------- 합치기 ---------- */
export function mergeNews(lists, limit = 60) {
  const seen = new Set();
  const out = [];
  for (const it of lists.flat()) {
    const key = it.title.replace(/[^0-9a-z가-힣]/gi, '').slice(0, 40).toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({
      tag: pick(it.title, TAG_RULES, '시장'),
      cc: pick(it.title, REGION_RULES, it.lang === 'ko' ? 'KR' : 'GL'),
      date: it.date,
      title: it.title,
      source: it.source || (it.lang === 'ko' ? '국내 언론' : 'News'),
      url: it.url,
    });
  }
  out.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  return out.slice(0, limit);
}

export { parseRSS };

export default async function handler(req, res) {
  const ko = listEnv(process.env.NEWS_KEYWORDS_KO, ['의료기기 수출', '의료기기 인허가', '체외진단 수출', 'K-의료기기 중동', 'K-의료기기 동남아', '의료기기 중남미']);
  const en = listEnv(process.env.NEWS_KEYWORDS_EN, ['FDA medical device', 'EU MDR medical device', 'NMPA medical device', 'PMDA medical device', 'CDSCO medical device', 'SFDA medical device', 'ANVISA medical device', 'COFEPRIS medical device', 'ASEAN medical device regulation', 'Africa medical device regulation']);
  try {
    const data = await cached(`news:${ko.join('|')}:${en.join('|')}`, 20 * 60e3, async () => {
      const settled = await Promise.allSettled([fromNaver(ko), fromGoogle(ko, 'ko'), fromGoogle(en, 'en')]);
      const lists = settled.filter(s => s.status === 'fulfilled').map(s => s.value);
      const errors = settled.filter(s => s.status === 'rejected').map(s => s.reason.message);
      const items = mergeNews(lists);
      if (!items.length) throw new Error(errors[0] || '기사를 찾지 못했습니다.');
      return { collected: kstStamp(), items, warnings: errors };
    });
    sendJSON(res, 200, data, 20 * 60);
  } catch (e) {
    sendJSON(res, 502, { error: e.message });
  }
}

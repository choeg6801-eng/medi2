// GET /api/regwatch?topic=fda|tariff|fta
// 규제·관세·FTA의 '최근 변경 소식'을 모아 돌려줍니다. 규정 자체를 자동으로 고치는 것이 아니라, 확인할 소식의 목록입니다.
//  fda    : 미국 연방관보(Federal Register)에 올라온 FDA 의료기기 관련 규칙·공고·가이던스 (키 불필요)
//  tariff : 관세 정책 관련 최신 기사 (Google 뉴스 RSS, 키 불필요)
//  fta    : FTA 발효·서명·협정세율 관련 최신 기사 (Google 뉴스 RSS, 키 불필요)

import { sendJSON, cached, kstDate, kstStamp, fetchWithTimeout } from '../lib/util.js';
import { parseRSS } from './news.js';

const TYPE_KO = { Rule: '최종 규칙', 'Proposed Rule': '규칙 제안', Notice: '공고·가이던스', 'Presidential Document': '대통령 문서' };

async function fda() {
  const p = new URLSearchParams();
  p.append('conditions[agencies][]', 'food-and-drug-administration');
  p.append('conditions[term]', 'medical device');
  ['RULE', 'PRORULE', 'NOTICE'].forEach(t => p.append('conditions[type][]', t));
  p.set('order', 'newest'); p.set('per_page', '25');
  const r = await fetchWithTimeout(`https://www.federalregister.gov/api/v1/documents.json?${p}`, { headers: { Accept: 'application/json' } }, 10000);
  if (!r.ok) throw new Error(`연방관보 API 오류 (HTTP ${r.status})`);
  const j = await r.json();
  return (j.results || []).map(x => ({
    title: x.title, url: x.html_url, date: x.publication_date,
    source: '미국 연방관보', kind: TYPE_KO[x.type] || x.type, note: (x.abstract || '').slice(0, 200), lang: 'en',
  }));
}

async function news(queries, lang) {
  const loc = lang === 'ko' ? 'hl=ko&gl=KR&ceid=KR:ko' : 'hl=en-US&gl=US&ceid=US:en';
  const all = await Promise.all(queries.map(async q => {
    const r = await fetchWithTimeout(`https://news.google.com/rss/search?q=${encodeURIComponent(q + ' when:30d')}&${loc}`, { headers: { 'User-Agent': 'Mozilla/5.0 (AurelisTradeConsole)' } });
    if (!r.ok) throw new Error(`Google 뉴스 RSS 오류 (HTTP ${r.status})`);
    return parseRSS(await r.text(), lang).slice(0, 10);
  }));
  const seen = new Set();
  return all.flat().filter(i => { const k = i.title.replace(/\W/g, '').slice(0, 40); if (seen.has(k)) return false; seen.add(k); return true; })
    .map(i => ({ title: i.title, url: i.url, date: i.date, source: i.source || '뉴스', kind: '기사', note: '', lang }));
}

const TOPICS = {
  fda: () => fda(),
  tariff: async () => (await Promise.all([news(['의료기기 관세', '관세 정책 수출 의료기기'], 'ko'), news(['medical devices tariff', 'Section 232 medical devices'], 'en')])).flat(),
  fta: async () => (await Promise.all([news(['FTA 발효', 'FTA 서명 협정세율', '한국 FTA 협상 타결'], 'ko'), news(['Korea FTA enters into force', 'Korea free trade agreement tariff'], 'en')])).flat(),
};

export default async function handler(req, res) {
  const topic = new URL(req.url, 'http://x').searchParams.get('topic') || 'fda';
  if (!TOPICS[topic]) return sendJSON(res, 400, { error: 'topic 은 fda, tariff, fta 중 하나여야 합니다.' });
  try {
    const data = await cached(`regwatch:${topic}`, 60 * 60e3, async () => {
      const items = (await TOPICS[topic]()).sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 25);
      if (!items.length) throw new Error('최근 소식을 찾지 못했습니다.');
      return { topic, collected: kstStamp(), items };
    });
    sendJSON(res, 200, data, 60 * 60);
  } catch (e) {
    sendJSON(res, 502, { error: e.message });
  }
}

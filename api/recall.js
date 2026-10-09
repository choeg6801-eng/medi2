// GET /api/recall?days=90&q=catheter&country=Korea
// 미국 FDA의 의료기기 리콜 공개 데이터(openFDA)를 가져와 사이트 형식으로 돌려줍니다. API 키가 필요 없습니다.
//  days    : 최근 며칠 이내에 시작된 리콜 (기본 90, 최대 365)
//  q       : 제품 설명에 들어 있어야 하는 영어 단어 (선택, 예: catheter)
//  country : 리콜 회사 국가에 들어 있어야 하는 단어, 예) Korea (선택)
// 참고: openFDA는 검색 결과가 없으면 404를 돌려주므로, 그 경우는 '결과 0건'으로 처리합니다.

import { sendJSON, cached, kstDate, kstStamp, fetchWithTimeout } from '../lib/util.js';

const clean = s => String(s || '').replace(/[^0-9A-Za-z가-힣 .\-_/]/g, ' ').trim().slice(0, 60);
const short = (s, n) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };

export default async function handler(req, res) {
  const url = new URL(req.url, 'http://x');
  const days = Math.min(365, Math.max(7, parseInt(url.searchParams.get('days') || '90', 10) || 90));
  const q = clean(url.searchParams.get('q'));
  const country = clean(url.searchParams.get('country')).toLowerCase();
  const from = kstDate(new Date(Date.now() - days * 864e5)), to = kstDate();
  let search = `event_date_initiated:[${from} TO ${to}]`;
  // openFDA는 괄호·OR·여러 AND 조건이 기대대로 동작하지 않는 경우가 있어, 첫 단어만 서버에서 검색하고
  // 나머지 단어는 받은 결과에서 직접 걸러 냅니다.
  const words = q.split(/\s+/).map(w => w.replace(/[^0-9A-Za-z가-힣]/g, '')).filter(Boolean).slice(0, 4);
  if (words[0]) search += ` AND product_description:${words[0]}`;
  // openFDA는 검색어의 공백을 '+'로 받습니다. (%20·%3A 로 보내면 조건이 무시되고 전체가 조회될 수 있음)
  const enc = s => encodeURIComponent(s).replace(/%20/g, '+').replace(/%3A/g, ':').replace(/%5B/g, '[').replace(/%5D/g, ']');
  const api = `https://api.fda.gov/device/recall.json?search=${enc(search)}&sort=${enc('event_date_initiated:desc')}&limit=100`;

  try {
    const data = await cached(`recall:${days}:${q}:${country}`, 30 * 60e3, async () => {
      const r = await fetchWithTimeout(api, { headers: { Accept: 'application/json' } }, 10000);
      let results = [], total = 0, updated = '';
      if (r.status === 404) { /* 결과 없음 */ }
      else if (!r.ok) throw new Error(`openFDA 응답 오류 (HTTP ${r.status})`);
      else { const j = await r.json(); results = j.results || []; total = (j.meta && j.meta.results && j.meta.results.total) || results.length; updated = (j.meta && j.meta.last_updated) || ''; }
      let items = results.map(x => ({
        id: x.product_res_number || '',
        date: x.event_date_initiated || '',
        posted: x.event_date_posted || '',
        firm: x.recalling_firm || '',
        country: x.country || '',
        product: short(x.product_description, 160),
        device: (x.openfda && x.openfda.device_name) || '',
        specialty: (x.openfda && x.openfda.medical_specialty_description) || '',
        deviceClass: (x.openfda && x.openfda.device_class) || '',
        reason: short(x.reason_for_recall, 260),
        cause: x.root_cause_description || '',
        status: x.recall_status || '',
        qty: short(x.product_quantity, 60),
        distribution: short(x.distribution_pattern, 120),
        url: x.cfres_id ? `https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfRES/res.cfm?ID=${encodeURIComponent(x.cfres_id)}` : 'https://www.fda.gov/medical-devices/medical-device-safety/medical-device-recalls',
      }));
      if (country) items = items.filter(i => i.country.toLowerCase().includes(country));
      for (const w of words.slice(1)) items = items.filter(i => (i.product + ' ' + i.device).toLowerCase().includes(w.toLowerCase()));
      return { source: 'openFDA (미국 FDA)', collected: kstStamp(), dataUpdated: updated, from, to, total, shown: items.length, items: items.slice(0, 30) };
    });
    sendJSON(res, 200, data, 30 * 60);
  } catch (e) {
    sendJSON(res, 502, { error: e.message });
  }
}

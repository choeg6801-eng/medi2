// GET /api/trade?kind=export&hs=3004,3002
// GET /api/trade?kind=import&hs=9018,9022&reporters=US,DE,JP
//
// UN Comtrade(유엔 무역통계)에서 실제 무역 값을 가져옵니다.
//  - kind=export : 한국이 해당 HS코드를 어느 나라에 얼마나 수출했는지 (상위 12개국)
//  - kind=import : 각 나라가 해당 HS코드를 전 세계에서 얼마나 수입했는지 + 전년 대비 증가율 (= 실제 수요)
//
// 환경 변수: COMTRADE_KEY (선택). 없어도 동작합니다(공개 미리보기 주소, 호출당 500행 제한).
//           키를 넣으면 comtradedata.org 의 무료 구독 키로 한도가 늘어납니다.
// 통계는 연 단위이고 나라별 보고가 늦어 최신 연도는 1~2년 전입니다. 응답에 기준 연도를 함께 돌려줍니다.
// 결과는 하루(서버)·3일(CDN) 캐시하므로 호출 수가 아주 적습니다.

import { sendJSON, cached, fetchWithTimeout, kstDate } from '../lib/util.js';

export const config = { maxDuration: 30 };

const KEY = () => process.env.COMTRADE_KEY || '';
const PREVIEW = 'https://comtradeapi.un.org/public/v1/preview/C/A/HS';
const FULL = 'https://comtradeapi.un.org/data/v1/get/C/A/HS';

// ISO2 → [Comtrade 국가코드, ISO3]
const C = {
  KR:[410,'KOR'],US:[842,'USA'],CA:[124,'CAN'],MX:[484,'MEX'],BR:[76,'BRA'],CL:[152,'CHL'],AR:[32,'ARG'],CO:[170,'COL'],PE:[604,'PER'],
  DE:[276,'DEU'],FR:[251,'FRA'],IT:[381,'ITA'],ES:[724,'ESP'],GB:[826,'GBR'],NL:[528,'NLD'],CH:[756,'CHE'],HU:[348,'HUN'],BE:[56,'BEL'],
  PL:[616,'POL'],AT:[40,'AUT'],SE:[752,'SWE'],TR:[792,'TUR'],RU:[643,'RUS'],KZ:[398,'KAZ'],UA:[804,'UKR'],
  CN:[156,'CHN'],JP:[392,'JPN'],IN:[699,'IND'],TH:[764,'THA'],VN:[704,'VNM'],ID:[360,'IDN'],MY:[458,'MYS'],PH:[608,'PHL'],SG:[702,'SGP'],
  AU:[36,'AUS'],SA:[682,'SAU'],AE:[784,'ARE'],EG:[818,'EGY'],ZA:[710,'ZAF'],OM:[512,'OMN'],GH:[288,'GHA'],NG:[566,'NGA'],KE:[404,'KEN'],IR:[364,'IRN'],
};
const BY3 = Object.fromEntries(Object.entries(C).map(([k, v]) => [v[1], k]));

async function call(params) {
  const key = KEY();
  const qs = new URLSearchParams({ ...params, partner2Code: '0', customsCode: 'C00', motCode: '0', includeDesc: 'true' });
  const url = (key ? FULL : PREVIEW) + '?' + qs;
  const r = await fetchWithTimeout(url, key ? { headers: { 'Ocp-Apim-Subscription-Key': key } } : {}, 20000);
  if (!r.ok) throw new Error('Comtrade HTTP ' + r.status);
  const j = await r.json();
  return Array.isArray(j.data) ? j.data : [];
}

const val = row => Number(row.primaryValue ?? row.fobvalue ?? row.cifvalue) || 0;

/** 한국 수출: 최신 연도부터 거꾸로 내려가며 자료가 있는 첫 해를 씁니다. */
async function exportRank(hs) {
  const now = new Date().getFullYear();
  for (let y = now - 2; y >= now - 4; y--) {
    const rows = await call({ reporterCode: '410', period: String(y), cmdCode: hs.join(','), flowCode: 'X' });
    const by = {};
    let total = 0;
    for (const r of rows) {
      if (r.partnerCode === 0 || r.partnerISO === 'W00') { total += val(r); continue; }
      const iso3 = r.partnerISO;
      if (!iso3) continue;
      const o = by[iso3] || (by[iso3] = { iso3, c: BY3[iso3] || iso3, name: r.partnerDesc || iso3, v: 0 });
      o.v += val(r);
    }
    const list = Object.values(by).filter(o => o.v > 0).sort((a, b) => b.v - a.v);
    if (list.length >= 5) return { year: y, total: total || list.reduce((s, o) => s + o.v, 0), rows: list.slice(0, 12) };
  }
  return null;
}

/** 각 나라의 수입(= 수요): 최신 두 해를 불러 값과 증가율을 계산합니다. */
async function importDemand(hs, reporters) {
  const now = new Date().getFullYear();
  const codes = reporters.map(c => C[c][0]);
  for (let y = now - 2; y >= now - 4; y--) {
    const rows = await call({ reporterCode: codes.join(','), period: `${y},${y - 1}`, cmdCode: hs.join(','), flowCode: 'M', partnerCode: '0' });
    const agg = {};
    for (const r of rows) {
      const c = BY3[r.reporterISO];
      if (!c) continue;
      const a = agg[c] || (agg[c] = {});
      a[r.period] = (a[r.period] || 0) + val(r);
    }
    const have = Object.keys(agg).filter(c => agg[c][y] > 0).length;
    if (have >= Math.max(3, Math.floor(reporters.length / 2))) {
      const out = {};
      for (const [c, a] of Object.entries(agg)) {
        const cur = a[y] > 0 ? a[y] : (a[y - 1] > 0 ? a[y - 1] : 0);
        if (!cur) continue;
        const yr = a[y] > 0 ? y : y - 1;
        const g = a[y] > 0 && a[y - 1] > 0 ? +(((a[y] / a[y - 1]) - 1) * 100).toFixed(1) : null;
        out[c] = { v: Math.round(cur), y: yr, g };
      }
      return { year: y, rows: out };
    }
  }
  return null;
}

export default async function handler(req, res) {
  try {
    const q = req.query || Object.fromEntries(new URL(req.url, 'http://x').searchParams);
    const kind = q.kind === 'import' ? 'import' : 'export';
    const hs = String(q.hs || '').split(',').map(s => s.trim().replace('.', '')).filter(s => /^\d{4,6}$/.test(s)).slice(0, 6);
    if (!hs.length) return sendJSON(res, 400, { error: 'hs 파라미터가 필요합니다. 예: ?kind=export&hs=3004' });
    const reporters = String(q.reporters || '').split(',').map(s => s.trim().toUpperCase()).filter(c => C[c] && c !== 'KR').slice(0, 45);
    if (kind === 'import' && !reporters.length) return sendJSON(res, 400, { error: 'reporters 파라미터가 필요합니다. 예: &reporters=US,DE' });
    const key = `${kind}|${hs.join(',')}|${reporters.sort().join(',')}`;
    const data = await cached(key, 24 * 3600e3, () => kind === 'export' ? exportRank(hs) : importDemand(hs, reporters));
    if (!data) return sendJSON(res, 502, { error: '최근 3개 연도 무역통계를 찾지 못했습니다.' });
    sendJSON(res, 200, { kind, hs, ...data, asof: kstDate(), source: 'UN Comtrade (HS ' + hs.join(', ') + ')', note: '연 단위 통계 · 나라별 보고 시차로 기준 연도는 1~2년 전입니다.' }, 3 * 86400);
  } catch (e) {
    sendJSON(res, 502, { error: '무역통계를 가져오지 못했습니다: ' + (e.message || e) });
  }
}

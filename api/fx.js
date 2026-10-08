// GET /api/fx
// 한국수출입은행 "현재환율 API"(AP01)를 최근 영업일 여러 날짜로 불러와,
// 사이트가 바로 그릴 수 있는 형태로 정리해 돌려줍니다.
//
// 환경 변수: KOREAEXIM_API_KEY  (한국수출입은행 오픈API 인증키 · 권장)
//           없으면 ExchangeRate-API 공개 주소(키 불필요)로 자동 전환합니다. EXCHANGERATE_API_KEY, FX_PROVIDER 는 선택
// 선택 환경 변수:   FX_DAYS (기본 45, 불러올 달력 일수. 주말은 자동으로 건너뜀)
//
// 수출입은행 API 특징
//  - 하루 1,000회까지 호출 가능. 이 코드는 결과를 12시간 캐시하므로 하루 수십 회만 씁니다.
//  - 영업일 오전 11시경 그날 환율이 올라옵니다. 주말·공휴일·11시 이전에는 빈 결과가 옵니다.
//  - 숫자가 "1,386.4"처럼 쉼표가 들어간 문자열로 옵니다.

import { sendJSON, cached, kstDate, fetchWithTimeout } from '../lib/util.js';

const ENDPOINT = 'https://oapi.koreaexim.go.kr/site/program/financial/exchangeJSON';

// 수출입은행 통화 코드 → 사이트에서 쓰는 코드
const WANT = { 'USD': 'USD', 'EUR': 'EUR', 'JPY(100)': 'JPY100', 'CNH': 'CNY', 'SAR': 'SAR', 'GBP': 'GBP', 'AED': 'AED', 'SGD': 'SGD' };

const RESULT_MESSAGE = {
  2: '요청 데이터 코드(data=AP01)가 잘못되었습니다.',
  3: '인증키가 올바르지 않습니다. .env의 KOREAEXIM_API_KEY를 확인하세요.',
  4: '오늘 호출 한도(1,000회)를 넘었습니다. 내일 다시 시도하세요.',
};

/** 수출입은행 서버는 쿠키를 붙여 리다이렉트하는 경우가 있어, 쿠키를 들고 직접 따라갑니다. */
async function getJSON(url) {
  let cookie = '';
  for (let i = 0; i < 5; i++) {
    const res = await fetchWithTimeout(url, { redirect: 'manual', headers: cookie ? { cookie } : {} });
    if (res.status >= 300 && res.status < 400) {
      const set = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [res.headers.get('set-cookie')].filter(Boolean);
      if (set.length) cookie = set.map(c => c.split(';')[0]).join('; ');
      const loc = res.headers.get('location');
      if (!loc) break;
      url = new URL(loc, url).toString();
      continue;
    }
    if (!res.ok) throw new Error(`수출입은행 응답 오류 (HTTP ${res.status})`);
    const text = await res.text();
    return text.trim() ? JSON.parse(text) : [];
  }
  throw new Error('수출입은행 서버가 리다이렉트를 반복합니다.');
}

const num = v => (v == null || v === '' ? null : Number(String(v).replace(/,/g, '')));

/** 최근 영업일 날짜 목록 (YYYYMMDD), 오래된 날 → 최근 순 */
function businessDays(calendarDays) {
  const out = [];
  const today = new Date(kstDate() + 'T00:00:00Z');
  for (let i = calendarDays - 1; i >= 0; i--) {
    const d = new Date(today.getTime() - i * 864e5);
    const w = d.getUTCDay();
    if (w === 0 || w === 6) continue;
    out.push(d.toISOString().slice(0, 10).replace(/-/g, ''));
  }
  return out;
}

async function loadRates(key, days) {
  const dates = businessDays(days);
  const byDate = {};
  // 동시에 4개씩만 호출해 서버에 부담을 주지 않습니다.
  for (let i = 0; i < dates.length; i += 4) {
    const chunk = dates.slice(i, i + 4);
    const results = await Promise.all(chunk.map(async d => {
      const url = `${ENDPOINT}?authkey=${encodeURIComponent(key)}&searchdate=${d}&data=AP01`;
      try { return [d, await getJSON(url)]; } catch (e) { return [d, { error: e.message }]; }
    }));
    for (const [d, rows] of results) byDate[d] = rows;
  }

  // 인증키 오류 등은 모든 날짜에서 똑같이 나오므로 바로 알려 줍니다.
  const sample = Object.values(byDate).find(r => Array.isArray(r) && r.length);
  const code = sample && (sample[0].result ?? sample[0].RESULT);
  if (code && code !== 1 && RESULT_MESSAGE[code]) throw new Error(RESULT_MESSAGE[code]);
  if (!sample) {
    const err = Object.values(byDate).find(r => r && r.error);
    throw new Error(err ? err.error : '최근 환율 데이터를 찾지 못했습니다.');
  }

  const series = {};
  for (const d of dates) {
    const rows = byDate[d];
    if (!Array.isArray(rows)) continue;
    for (const r of rows) {
      const unit = r.cur_unit ?? r.CUR_UNIT;
      const code = WANT[unit];
      const rate = num(r.deal_bas_r ?? r.DEAL_BAS_R);
      if (!code || !rate) continue;
      (series[code] ||= { code, name: r.cur_nm ?? r.CUR_NM ?? code, history: [], dates: [] });
      series[code].history.push(rate);
      series[code].dates.push(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}`);
    }
  }
  const rates = Object.values(series).map(s => ({ ...s, rate: s.history[s.history.length - 1] }));
  const last = rates[0]?.dates.at(-1) ?? null;
  return { date: last, source: 'koreaexim', rates };
}

// ─────────────────────────────────────────────────────────────
// 대안: ExchangeRate-API (https://www.exchangerate-api.com)
//  - EXCHANGERATE_API_KEY가 있으면 키 방식(v6.exchangerate-api.com), 없으면 키 없는 공개 주소(open.er-api.com)를 씁니다.
//  - 하루 1회 갱신되는 국제 중간 시세입니다(은행 매매기준율과 조금 다를 수 있음).
//  - 무료로는 과거 추이를 주지 않아 오늘 값 하나만 돌려줍니다. 사이트는 그래프 끝점만 실제 값으로 맞춥니다.
//  - 이용 조건: 화면에 "Rates By Exchange Rate API" 링크 표시(사이트가 자동 표시), 응답 캐시 허용, 재배포 금지.
// ─────────────────────────────────────────────────────────────
const ERA_WANT = { USD: ['USD', 1], EUR: ['EUR', 1], JPY: ['JPY100', 100], CNY: ['CNY', 1], SAR: ['SAR', 1], VND: ['VND100', 100], GBP: ['GBP', 1], AED: ['AED', 1], SGD: ['SGD', 1] };
async function loadExchangeRateApi() {
  const key = process.env.EXCHANGERATE_API_KEY;
  const url = key ? `https://v6.exchangerate-api.com/v6/${encodeURIComponent(key)}/latest/KRW` : 'https://open.er-api.com/v6/latest/KRW';
  const res = await fetchWithTimeout(url);
  if (res.status === 429) throw new Error('ExchangeRate-API 호출 한도를 넘었습니다. 20분 뒤 다시 시도하세요.');
  if (!res.ok) throw new Error(`ExchangeRate-API 응답 오류 (HTTP ${res.status})`);
  const j = await res.json();
  const table = j.rates || j.conversion_rates;
  if (j.result !== 'success' || !table) throw new Error('ExchangeRate-API: ' + (j['error-type'] || '알 수 없는 오류'));
  const date = new Date((j.time_last_update_unix || Date.now() / 1000) * 1000).toISOString().slice(0, 10);
  const rates = Object.entries(ERA_WANT).filter(([c]) => table[c]).map(([c, [code, unit]]) => {
    const rate = Math.round((unit / table[c]) * 100) / 100; // 1 KRW당 외화 → 외화 1(또는 100)단위당 원화
    return { code, name: c, rate, history: [rate], dates: [date] };
  });
  return { date, source: 'exchangerate-api', attribution: { text: 'Rates By Exchange Rate API', url: 'https://www.exchangerate-api.com' }, rates };
}

export default async function handler(req, res) {
  const key = process.env.KOREAEXIM_API_KEY;
  const days = Math.min(Math.max(Number(process.env.FX_DAYS) || 45, 7), 120);
  const provider = (process.env.FX_PROVIDER || (key ? 'koreaexim' : 'exchangerate-api')).toLowerCase();
  let firstError = null;
  // 1순위: 수출입은행(키가 있을 때) → 실패하면 2순위: ExchangeRate-API
  if (provider === 'koreaexim' && key) {
    try {
      const data = await cached(`fx:${days}:${kstDate()}`, 12 * 3600e3, () => loadRates(key, days));
      return sendJSON(res, 200, data, 12 * 3600);
    } catch (e) { firstError = e.message; }
  }
  try {
    const data = await cached(`fx-era:${kstDate()}`, 6 * 3600e3, loadExchangeRateApi);
    if (firstError) data.note = `수출입은행 오류로 대체 출처를 사용했습니다: ${firstError}`;
    sendJSON(res, 200, data, 6 * 3600);
  } catch (e) {
    sendJSON(res, 502, { error: firstError ? `${firstError} / ${e.message}` : e.message });
  }
}

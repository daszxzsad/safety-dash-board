// api/delete-permit.js
// 작업(허가서) "소프트 삭제" 엔드포인트
//  - 실제로 행을 지우지 않고 deleted_at(삭제시각)만 기록 → 언제든 복구 가능
//  - restore:true 로 호출하면 복구(다시 화면에 표시)
//  - 대시보드(safety-dash-board)와 도메인이 달라서 CORS 열어둠
//
// 필요 환경변수(이미 bnct-safety 프로젝트에 세팅돼 있음):
//   SUPABASE_URL, SUPABASE_ANON_KEY
//
// ⚠️ 사전 1회 필요: Supabase permits 테이블에 deleted_at 칼럼 추가
//   alter table permits add column if not exists deleted_at timestamptz;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

module.exports = async (req, res) => {
  setCors(res);

  // 브라우저 사전요청(preflight) 처리
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') {
    res.status(405).json({ success: false, error: 'POST 메서드만 허용됩니다' });
    return;
  }

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    res.status(500).json({ success: false, error: 'Supabase 환경변수가 없습니다 (이 API는 bnct-safety 프로젝트에 올려야 함)' });
    return;
  }

  try {
    // body 파싱(Vercel이 보통 자동 파싱하지만 방어적으로)
    let body = req.body;
    if (!body || typeof body === 'string') {
      try { body = JSON.parse(body || '{}'); } catch (e) { body = {}; }
    }

    const { id, token } = body;
    const restore = body.restore === true || body.restore === 'true';

    if (id === undefined && !token) {
      res.status(400).json({ success: false, error: 'id 또는 token 중 하나가 필요합니다' });
      return;
    }

    // 대상 행 지정: id 우선, 없으면 token
    const filter = (id !== undefined)
      ? `id=eq.${encodeURIComponent(id)}`
      : `token=eq.${encodeURIComponent(token)}`;

    // 삭제=현재시각 도장 / 복구=null 로 되돌림
    const value = restore ? null : new Date().toISOString();

    const url = `${SUPABASE_URL}/rest/v1/permits?${filter}`;
    const r = await fetch(url, {
      method: 'PATCH',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({ deleted_at: value })
    });

    let data;
    try { data = await r.json(); } catch (e) { data = null; }

    if (!r.ok) {
      res.status(r.status).json({
        success: false,
        error: (data && (data.message || data.hint || data.details)) || data || 'Supabase 오류',
        hint: 'permits 테이블에 deleted_at 칼럼이 있는지 확인하세요'
      });
      return;
    }

    if (!Array.isArray(data) || data.length === 0) {
      res.status(404).json({ success: false, error: '해당 작업을 찾지 못했습니다 (이미 삭제됐거나 id/token이 틀림)' });
      return;
    }

    res.status(200).json({
      success: true,
      action: restore ? 'restored' : 'deleted',
      count: data.length
    });
  } catch (e) {
    res.status(500).json({ success: false, error: String((e && e.message) || e) });
  }
};

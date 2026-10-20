export const meta = {
  name: 'monster-model',
  description: '몬스터·보스 3D 모델링 — 빌더 여럿이 따로 짓기 → 심사 → 합성 → 적대적 검증 → 수정 (dl-monster-model 스킬)',
  whenToUse: 'dl-monster-model 스킬의 setup.py 로 작업 폴더를 만들고 BRIEF.md 를 채운 뒤. args: { work: "<절대 경로 viewers/_work/이름>", n: 3, effort: "high", mode: "full"|"light" }',
  phases: [
    { title: 'Build', detail: '강조점이 다른 빌더가 각자 b<N>.js 를 짓는다' },
    { title: 'Judge', detail: '원화 충실도 · 게임 가독성/기술 두 관점 심사' },
    { title: 'Synthesize', detail: '우승안에 다른 안의 좋은 점 이식' },
    { title: 'Verify', detail: '게임 호환 · 시각 적대적 검증' },
    { title: 'Fix', detail: '확인된 문제 수정' },
  ],
}

// 품질은 세션 노력 설정이 아니라 이 과정에서 나온다 — 에이전트마다 노력을 여기서 고정한다(세션이 낮아도 그대로).
const A = args || {}
const W = A.work
if (!W) return { error: 'args.work(작업 폴더 절대 경로)가 없다 — dl-monster-model 스킬의 setup.py 부터' }
const EFF = A.effort || 'high'
const LIGHT = A.mode === 'light'
const N = LIGHT ? 1 : Math.max(2, Math.min(4, A.n || 3))
if (A.dryRun) return { work: W, effort: EFF, mode: LIGHT ? 'light' : 'full', builders: N }

const S = '/home/user/my-dungeon/.claude/skills/dl-monster-model/scripts'
const READ = `먼저 ${W}/SPEC.md 와 ${W}/BRIEF.md 를 끝까지 읽는다(규칙·명령·이번 요청). 원화 그림도 Read 로 직접 본다. 저장소 루트(/home/user/my-dungeon)에서 명령을 실행한다.`
const EMPH = [
  '강조점: 원화 충실도 최대 — 비율 · 실루엣 · 세부(정면 · 측면 · 뒷면이 원화와 하나하나 맞게).',
  '강조점: 게임 시점 가독성 최우선 — 51.9° 내려다보는 게임 카메라에서 zoom 1.0~2.0 으로 작게 봐도 실루엣과 핵심 특징이 또렷하게 읽히게(값 대비 · 발광/금 포인트 배치 · 뭉개진 어두운 덩어리 금지). 원화에도 충실하게.',
  '강조점: 생동감 — 걷기 · 공격 자세 · 토글(날개·불꽃 등)에 따라 부위가 그럴듯하게 움직이게(갱신 함수에서 그룹 transform 으로). 원화에도 충실하고 예산 안에서.',
  '강조점: 단순하고 강한 형태 — 적은 메시·삼각형으로 덩어리가 크고 선명하게. 원화에도 충실하게.',
]
const BUILD = {
  type: 'object',
  properties: {
    file: { type: 'string' },
    renders: { type: 'array', items: { type: 'string' }, description: '가장 좋은 최종 렌더 절대 경로(정면 · 측면 · 뒷면 · 게임 시점 · 주요 자세 · 걷기)' },
    probe: { type: 'string', description: 'probe.js 출력 요약(✓/✗ 줄 그대로)' },
    summary: { type: 'string' },
    selfCritique: { type: 'string', description: '원화·요청 대비 남은 약점' },
  },
  required: ['file', 'renders', 'probe', 'summary', 'selfCritique'],
}

phase('Build')
const built = await parallel(Array.from({ length: N }, (_, i) => () => agent(
  `${READ}\n\n너는 빌더 ${i + 1}. 네 파일은 ${W}/b${i + 1}.js, 렌더는 ${W}/r${i + 1}/. ${LIGHT ? '' : EMPH[i % EMPH.length]}\n` +
  `ref.js 를 출발점으로 BRIEF.md 의 요청대로 다시 짓는다. 쓰고 → python3 ${S}/build.py ${W} ${i + 1} → node ${S}/probe.js ${W} ${i + 1} → 여러 시점·자세 렌더 → Read 로 보고 고치기를 여러 바퀴(최소 4~6). probe 가 전부 ✓ 이고 원화·요청에 확실히 맞을 때 끝낸다.`,
  { label: `build:${i + 1}`, phase: 'Build', schema: BUILD, effort: EFF })))
const cands = built.map((r, i) => r ? { n: i + 1, ...r } : null).filter(Boolean)
log(`빌더 완료: ${cands.map(c => c.n).join(', ') || '없음'}`)
if (!cands.length) return { error: '빌더 결과가 없다' }

let finalN = cands[0].n, J = [], synth = null
if (!LIGHT && cands.length > 1) {
  const txt = cands.map(c => `후보 ${c.n}: ${c.file}\n렌더: ${c.renders.join(', ')}\nprobe: ${c.probe}\n요약: ${c.summary}\n스스로 본 약점: ${c.selfCritique}`).join('\n\n')
  const JUDGE = {
    type: 'object',
    properties: {
      scores: { type: 'array', items: { type: 'object', properties: { n: { type: 'number' }, score: { type: 'number', description: '1-10' }, why: { type: 'string' } }, required: ['n', 'score', 'why'] } },
      winner: { type: 'number' },
      graft: { type: 'array', items: { type: 'string' }, description: '다른 후보에서 우승안에 옮겨 붙일 만한 것(후보 번호 + 무엇)' },
      mustFix: { type: 'array', items: { type: 'string' }, description: '우승안에서 꼭 고칠 구체적 문제' },
    },
    required: ['scores', 'winner', 'graft', 'mustFix'],
  }
  const LENS = [
    '관점: 원화 충실도와 사용자 요청(BRIEF.md 원문)을 지켰는가 — 시점마다 원화와 나란히 비교.',
    '관점: 게임 시점 가독성(zoom 1.0~2.0 · 걷기 · 주요 자세)과 기술 건전성(probe ✓ · 예산 · SPEC 함정 — 병합 · _glowMat · 바닥 아래 · 떠 있는 부위 · 관통).',
  ]
  phase('Judge')
  J = (await parallel(LENS.map((lens, i) => () => agent(
    `${READ}\n\n너는 심사 ${i + 1}. b*.js 를 고치지 않는다. ${lens}\n후보:\n\n${txt}\n\n후보 렌더와 원화를 보고, 필요하면 shot.js/probe.js 로 직접 더 찍고 잰다(렌더는 ${W}/j${i + 1}/). 날카롭고 구체적으로. 점수(1~10) · 우승 · 옮겨 붙일 것 · 우승안이 꼭 고칠 것.`,
    { label: `judge:${i + 1}`, phase: 'Judge', schema: JUDGE, effort: EFF })))).filter(Boolean)
  const tally = {}
  for (const j of J) for (const s of j.scores) tally[s.n] = (tally[s.n] || 0) + s.score
  const win = Number(Object.keys(tally).sort((a, b) => tally[b] - tally[a])[0]) || cands[0].n
  log(`심사 합계 ${JSON.stringify(tally)} → 우승 ${win}`)
  finalN = N + 1
  phase('Synthesize')
  synth = await agent(
    `${READ}\n\n너는 합성 담당. ${W}/b${win}.js 를 ${W}/b${finalN}.js 로 복사해 출발한다(렌더는 ${W}/r${finalN}/). 다른 후보(${cands.map(c => c.file).join(', ')})를 읽고 아래를 옮겨 붙인다:\n- ${J.flatMap(j => j.graft).join('\n- ')}\n\n심사가 찾은 꼭 고칠 것:\n- ${J.flatMap(j => j.mustFix).join('\n- ')}\n\n짓고 → probe → 렌더 → 보고 고치기를 반복해 모든 후보보다 확실히 낫고 probe 전부 ✓ 일 때 끝낸다.`,
    { label: 'synthesize', phase: 'Synthesize', schema: BUILD, effort: EFF })
}

const VERIFY = {
  type: 'object',
  properties: { findings: { type: 'array', items: { type: 'object', properties: {
    severity: { type: 'string', enum: ['blocker', 'major', 'minor'] }, issue: { type: 'string' },
    evidence: { type: 'string', description: '렌더 경로 · probe 출력 · 코드 줄' }, fix: { type: 'string' } }, required: ['severity', 'issue', 'evidence', 'fix'] } } },
  required: ['findings'],
}
const VL = [
  `게임 호환 관점: /home/user/my-dungeon/index.html(읽기만!)에서 이 타입과 손잡이 이름을 grep 해 게임이 몸을 어떻게 쓰는지 본다 — 보스/몹 AI 블록 · 공용 걷기(legR/legL/armR/armL) · 무기·손 월드 좌표 · 비행 높이 · applyToon(makeToonChar 가 재질 customProgramCacheKey 를 덮어쓴다 — 자체 셰이더 재질은 userData._toon 이나 그에 맞는 대비가 있는가) · applyEnemyDim/flashObj(_glowMat) · killEnemy 정리 · createAdvancedMonster 의 스케일. 새 몸이 게임이나 패턴을 깨는 구체적 경로를 찾아라(키 누락 · NaN · 바닥 아래 · 갱신 함수의 매 프레임 할당 · 병합 함정 · 난수 소비). probe 를 돌리고, 필요하면 작은 Playwright 검사를 ${W}/v1/ 에 써서 돌린다.`,
  `시각 관점: 모든 시점(정면 · 측면 · 뒷면 · 위 3/4 · 게임 시점)과 모든 자세·토글·걷기를 zoom 1.0(게임 실제 크기)·2.0 으로 찍는다(${W}/v2/). 떠 있거나 끊긴 부위 · 관통(무기가 몸을 뚫음 등) · 구멍/뒤집힌 면 · 하얗게 뜬 재질 · 게임 시점에서 안 읽히는 어두운 덩어리 · 원화·사용자 요청과 어긋나는 곳을 찾는다.`,
]
const target = `${W}/b${finalN}.js`
phase('Verify')
const V = (await parallel((LIGHT ? [VL.join('\n\n그리고 ')] : VL).map((lens, i) => () => agent(
  `${READ}\n\n너는 적대적 검증 ${i + 1} — 대상 ${target} (빌드 번호 ${finalN}). 고치지 않는다. ${lens}\n증거 있는 진짜 문제만 — 추측이면 보고하지 않는다.`,
  { label: `verify:${i + 1}`, phase: 'Verify', schema: VERIFY, effort: EFF })))).filter(Boolean)
const findings = V.flatMap(v => v.findings)
log(`검증 발견 ${findings.length} (blocker/major ${findings.filter(f => f.severity !== 'minor').length})`)

phase('Fix')
let fixed = null
if (findings.length) fixed = await agent(
  `${READ}\n\n너는 수정 담당. ${target} 을 제자리에서 고친다(빌드 번호 ${finalN}, 렌더는 ${W}/r${finalN}/fx/). 각 항목을 먼저 직접 확인하고 blocker/major 는 전부, minor 는 싸면 고친다:\n${findings.map(f => `- [${f.severity}] ${f.issue}\n  증거: ${f.evidence}\n  제안: ${f.fix}`).join('\n')}\n\n고친 뒤 다시 짓고 probe(전부 ✓) · 정면/측면/뒷면/게임 시점 · 주요 자세 · 걷기를 찍어 되돌아간 것이 없는지 본다.`,
  { label: 'fix', phase: 'Fix', schema: BUILD, effort: EFF })
return { final: target, finalN, mode: LIGHT ? 'light' : 'full', effort: EFF, candidates: cands, judges: J, synth, findings, fixed }

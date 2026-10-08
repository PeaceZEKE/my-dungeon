# playbot — 밸런스 측정용 플레이 봇 (v826)

실제 입력 경로(조이스틱 벡터 `joyVec` · 마우스 조준 `mousePos` · `startCharge/releaseCharge` · `startBlock/endBlock` · `startDodge` · `usePotion`)만 써서
던전을 자동으로 플레이한다. 층마다 시간·피해·피격·사망·물약·보스전 길이를 기록하고, 피격마다 (층, 출처 타입, 최대 체력 대비 비율)을 남긴다.
렌더는 하지 않고 `update(1/60)` 만 돌리므로 1층이 실시간 20~30초 → 1초 남짓이다.

```bash
cd <저장소 루트> && python3 -m http.server 8899 &           # 서버는 반드시 저장소 루트에서
cd viewers/playbot
node run.js knight 31 60 777 out/k2_777.json "&bal3=0"       # 직업 · 시작층 · 끝층 · 시드 · 결과 파일 · [추가 URL 플래그]
node run.js knight 31 60 777 out/k2_777_new.json ""
node compare.js                                               # out/{k,m,a}{1,2,3}_{seed}[_new].json 을 전/후로 묶어 표로
```

봇의 능력(= 측정의 전제): 가장 가까운 깨어난 적 → 없으면 가장 가까운 적 → 없으면 계단. 1유닛 격자 BFS(`navFineGet`)로 길을 찾고,
근접 공격 신호(`hitPending`·임팩트 0.3초 전)에 기사·마법사는 방어, 궁수는 회피. 투사체(`fireballs`·`thrownClubs`)가 0.7초 안에
1.3 안으로 지나가면 수직으로 비키고 장판(`firePools`)에서는 나온다(v829 부터 16 방향 중 앞이 트인 쪽으로 — 중심 반대로만 걸으면 벽에 붙어 장판 안에 갇혔다). 체력 40% 아래면 물약. 보상 카드는 첫 장. 죽으면 그 자리에서
체력 60% 로 되살아나 계속한다(`die` 를 덮어씀 — 사망 수가 핵심 지표). 스킬은 안 쓴다. 보스 패턴(점멸·장판·눈보라)은 이해하지 못한다 —
**보스전 수치는 봇 한계가 섞여 있으니 막별 비교에만 쓸 것.** 층당 300초를 넘기면 남은 적을 지우고 계단으로 옮긴다(`timeout` 표시).

시드는 `addInitScript` 로 `Math.random`·`performance.now`·`Date.now` 를 고정하고 `setTimeout` 도 게임 시계 큐(`__flushTimers`, 매 프레임)로 바꾸므로 같은 빌드·같은 시드는 바이트 단위로 같은 결과가 난다 —
수치만 바꾼 두 빌드(객체 수 동일)는 같은 던전에서 붙는다.

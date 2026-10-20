# 몬스터 모델링 작업 규칙 — {{NAME}} ({{TYPE}})

이 파일은 `setup.py` 가 만든다(손으로 고치지 말 것). 이번 작업의 요청·원화 설명·꼭 지킬 것은 **같은 폴더의 `BRIEF.md`** 에 있다 — 반드시 먼저 읽는다.
게임은 Three.js r128 아이소메트릭 던전 크롤러 'Dungeon Legion'. 프로젝트 말은 한국어 — 코드 주석도 한국어로, 짧게, 주변 코드 투로.

## 파일 ({{WORK}})
- `BRIEF.md` — 이번 요청(사용자 말 원문 · 원화 설명 · 꼭 지킬 것). **SPEC 과 BRIEF 가 다르면 BRIEF 가 이긴다.**
- 원화: `{{CONCEPT}}` — Read 도구로 그림을 직접 본다(정면 · 측면(앞이 왼쪽) · 뒷면).
- `ref.js` — 지금 쓰는 빌더 `{{FN}}` 원문. 손잡이(limbs) 목록 · 관절 자리 · 자세 함수 · 갱신 함수를 여기서 그대로 옮긴다.
- `contract.json` — 타입 `{{TYPE}}` · 함수 `{{FN}}` · 자세 함수 `{{POSEFN}}`(자세: {{POSES}}) · 고정 손잡이: {{LOCK}} · 예산. 새 종류 여부: {{NEW}}.
- **내 파일은 `b<N>.js` 하나뿐** — 최상위에 `function {{FN}}(P) { … }` 하나만(도우미는 그 안에). 뷰어에 있는 같은 이름 함수를 덮어쓴다. 렌더는 `r<N>/` 폴더에.
- 공통 도구는 뷰어(`base.html`) 안에 이미 있다 — `a1Kit`(K.box/ico/cyl/cone/seg/plate/band/put/mat/jit/rr …) 과 막별 도구(4막 `a4Kit`·`a4Lava`·`a4Reset`·`A4_PAL`, 3막 `a3*`, 2막 `a2*`), `c3MergeStatic`, `getLowPolyMat`, `markOrganic`. 정확한 함수 모양은 base.html 에서 grep 으로 확인할 것.
- 읽기만: `base.html` · `ref.js` · `contract.json` · `SPEC.md` · `BRIEF.md` · 저장소(`/home/user/my-dungeon`). 저장소·다른 후보 파일은 고치지 않는다.

## 명령(저장소 루트 `/home/user/my-dungeon` 에서)
```bash
S={{SKILL}}/scripts; W={{WORK}}
bash $S/serve.sh                                   # :8898 (viewers/_work) — ERR_CONNECTION_REFUSED 면 다시
python3 $S/build.py $W <N>                          # b<N>.js → v<N>.html
node $S/probe.js $W <N>                             # ✓/✗ 판정 — ✗ 가 하나라도 있으면 끝난 게 아니다
node $S/shot.js $W <N> $W/r<N>/a --views front,side,back,hi,game --zoom 1.8
node $S/shot.js $W <N> $W/r<N>/g --views game --cmp 0 --zoom 1.0   # 게임 실제 크기 · 왼쪽 예전 ↔ 오른쪽 새
node $S/shot.js $W <N> $W/r<N>/p --pose <자세>,1,1 --limbs '{"_xxWing":1}'   # 자세 · 손잡이 토글
node $S/shot.js $W <N> $W/r<N>/w --walk --views side,game                      # 걷기
```
`pkill -f` 를 자기 명령줄과 겹치는 패턴으로 쓰지 말 것(자기 셸이 죽는다). 서버는 serve.sh 로만.

## 일하는 법
- **눈으로 보고 고친다.** 쓰고 → 짓고 → probe → 여러 시점 렌더 → Read 로 그림을 보고 → 고친다. 최소 4~6 바퀴. 원화와 시점마다 나란히 비교할 것.
- **게임 시점(`--views game`)이 실제로 플레이어가 보는 그림이다** — 51.9° 위에서 내려다보고 화면 키가 45~90px 남짓. 윗면·실루엣·밝은 포인트가 읽혀야 한다. zoom 1.0 이 게임 실제 크기.

## 꼭 지킬 것(게임 호환 — 어기면 보스 패턴·층 생성이 깨진다)
1. **손잡이(limbs 키) 목록은 ref 와 같아야 한다**(probe '손잡이 같음'). 게임 AI 가 이 이름으로 팔·무기·자세를 만진다.
2. **고정 손잡이({{LOCK}})는 예전 자리 그대로** — 자세 함수(`{{POSEFN}}`)의 각도와 무기 모양·자리도 ref 그대로 옮긴다. 공격 판정이 이 자리를 믿는다(probe '고정 손잡이').
3. 공용 걷기 애니메이션이 매 프레임 `legR/legL/armR/armL.rotation.x` 를 쓴다. 다리가 없는 몸(뱀·벌레 등)이어도 legR/legL 은 빈 Group 으로 남기고, 필요하면 갱신 함수에서 `legR.rotation.x` 를 걸음 위상으로 읽어 쓴다.
4. 자세 함수가 `bodyGrp` 를 기울인다면, 바닥에 닿아야 하는 부분(똬리·다리 받침 등)은 `P.grp` 에 따로 두어 바닥에 남긴다.
5. **짓는 동안 `Math.random` 소비를 바꾸지 않는다**(probe 'Math.random 소비 같음' — 층 배치가 그대로여야 한다). 디스패처가 a1Lcg 안에서 부르므로 THREE 객체를 아무리 만들어도 괜찮다. 난수가 필요하면 `K.rr()`.
6. 재질은 개체마다 새로(a1Kit/a4Kit 이 이미 그렇게 한다 — 피격 번쩍임이 개체마다). **새로 만드는 MeshBasicMaterial 은 전부 `m._glowMat = true`**(게임의 applyEnemyDim·flashObj 가 color·emissive 를 덮어쓴다). 맥박은 자기 발광 재질의 color 로.
7. 움직이는 부분(날개·불꽃·꼬리·후광·관절)은 따로 Group — 부모를 `c3MergeStatic` 할 때 skip 목록에 넣는다. 애니메이션은 그룹 transform 으로(정점 셰이더로 움직이면 노멀·그림자 패스와 어긋난다).
8. `c3MergeStatic(root, skip)` 은 Group 만 훑는다 — **메시의 자식 메시는 버려진다**(형제로 둘 것). **이미 합친 그룹을 부모 병합 때 skip 안 하면 정점색을 잃어 하얗게 된다.** 불꽃·후광은 합친 뒤 `K.fx(group)`(노멀 패스·외곽선에서 뺀다).
9. 비인덱스 20면체를 정점마다 따로 흔들면 깨진 결정 조각이 된다 — `K.ico(…, det, jitter)`(같은 좌표 같은 오프셋).
10. 판 모양 좌우 대칭은 `K.mir(pts, sx)` — `scale.x = -1` 은 감기가 뒤집혀 뒷면이 그려진다.
11. 캐릭터는 진짜 그림자를 안 진다(castShadow false — 발밑 블롭이 대신).
12. **색은 게임 조명 기준** — 뷰어는 게임과 같은 조명·포스트라 밝은 색을 넣으면 하얗게 바래고 8단 그라데이션이 회색으로 뭉갠다. 어두운 바탕 + 밝은 포인트(용암·금·눈빛). 위를 보는 높은 면(2.5 위)은 횃불이 안 닿아 어둡다 — 발광 포인트로 푼다. 금 0x8c6c2c · 0x55431c 가 읽힌다. 4막 용암 그물은 `K.mat(hex,'crust')` · `a4Kit(seed, cell, width)` 의 cell 0.24~0.42 · width 0.045~0.06 (사용자가 더 잘거나 더 큰 것을 둘 다 물렸다).
13. 바닥(y 0) 아래로 몸이 들어가면 안 된다(무기 끝은 예외) — probe '가장 낮은 점'과 옆 렌더로 확인.
14. 예산: probe 의 메시·삼각형 상한(기본 예전 × 1.6 · × 2.2, 최소 24 · 3000 — contract.json 에서 바꿀 수 있다).

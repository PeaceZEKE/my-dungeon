// 페이지 안에서 도는 플레이 봇 — 실제 입력 경로(joyVec·mousePos·startCharge/releaseCharge·startBlock/endBlock·startDodge·usePotion)만 쓴다.
window.__botInit = function (opts) {
  const B = window.__bot = { opts, deaths: 0, floors: [], fl: null, dmgBy: {}, hitsBy: {}, hitLog: [], t: 0, path: null, pathT: 0, pathKey: '', blockT: 0, chargeT: -1, stuckT: 0, lastP: null, prevHp: player.hp, bossAwakeT: -1, done: false, reason: '' };
  const _die = window.die;
  window.die = function () { if (!player.alive) return; B.deaths++; if (B.fl) B.fl.deaths++; player.hp = Math.floor(player.hpMax * 0.6); player.hurtCooldown = 1.5; isCharging = false; B.prevHp = player.hp; };
  const _dp = window.damagePlayer;
  window.damagePlayer = function (amount, e) { const h0 = player.hp; _dp(amount, e); const lost = h0 - player.hp; if (lost > 0) { const k = e ? ((e.isBoss ? 'boss:' : '') + e.type) : 'env'; B.dmgBy[k] = (B.dmgBy[k] || 0) + lost; B.hitsBy[k] = (B.hitsBy[k] || 0) + 1; if (B.hitLog.length < 6000) B.hitLog.push([player.floor, k, +(lost / player.hpMax).toFixed(3)]); } };
  const _he = window.hurtPlayerEnv;
  window.hurtPlayerEnv = function (a) { const h0 = player.hp; _he(a); const lost = h0 - player.hp; if (lost > 0) { B.dmgBy.env = (B.dmgBy.env || 0) + lost; B.hitsBy.env = (B.hitsBy.env || 0) + 1; } };
  B.newFloor = function () {
    B.fl = { floor: player.floor, t: 0, dmg: 0, hits: 0, deaths: 0, potions: 0, kills0: player.kills, lv0: player.lv, hp0: player.hp, hpMax: player.hpMax, boss: player.floor % 10 === 0, bossT: 0, enemies0: enemies.filter(e => !e.isDead).length, timeout: false };
    B.floors.push(B.fl); if (window.__botNav) { window.__botNav.path = null; window.__botNav.pathKey = ''; } B.stuckT = 0; B.bossAwakeT = -1; B.prevHp = player.hp;
  };
  B.newFloor();
};
window.__botStep = function (dt) {
  const B = window.__bot; if (B.done) return;
  const P = player.obj.position;
  if (B.fl.floor !== player.floor) { B.newFloor(); }
  B.t += dt; B.fl.t += dt;
  // 체력 감소 합계(독 등 damagePlayer 를 안 거치는 것 포함)
  if (player.hp < B.prevHp) { B.fl.dmg += B.prevHp - player.hp; B.fl.hits++; }
  B.prevHp = player.hp;
  if (rewardPaused && bossRewardCur) { pickReward(0); }
  if (inRest || player.floor > B.opts.endFloor) { B.done = true; B.reason = inRest ? 'rest' : 'end'; return; }
  // 층 시간 초과 → 남은 적 처리 후 계단으로 순간이동(기록에 남김)
  if (B.fl.t > B.opts.floorCap) {
    B.fl.timeout = true;
    for (const e of enemies.slice()) if (!e.isDead) killEnemy(e);
    if (stairsMesh) { P.x = stairsMesh.position.x; P.z = stairsMesh.position.z; }
    return;
  }
  const alive = enemies.filter(e => !e.isDead && e.hp > 0 && e.obj);
  const d2 = e => Math.hypot(e.obj.position.x - P.x, e.obj.position.z - P.z);
  let tgt = null, best = 1e9;
  for (const e of alive) { if (!e.awake) continue; const d = d2(e); if (d < 30 && d < best) { best = d; tgt = e; } }
  if (!tgt) for (const e of alive) { const d = d2(e); if (d < best) { best = d; tgt = e; } }
  const boss = alive.find(e => e.isBoss);
  if (boss && boss.awake && B.bossAwakeT < 0) B.bossAwakeT = B.fl.t;
  if (B.bossAwakeT >= 0 && !boss) { B.fl.bossT = B.fl.t - B.bossAwakeT; B.bossAwakeT = -2; }
  // 카메라 축
  camera.updateMatrixWorld(true); camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
  const camFwd = new THREE.Vector3(); camera.getWorldDirection(camFwd); camFwd.y = 0; camFwd.normalize();
  const camRight = new THREE.Vector3().crossVectors(camFwd, new THREE.Vector3(0, 1, 0)).normalize();
  const setJoy = (dx, dz) => { const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l; const mx = dx * camRight.x + dz * camRight.z, mz = -(dx * camFwd.x + dz * camFwd.z); joyVec = { x: mx, y: mz }; };
  const aimAt = (x, z) => { const v = new THREE.Vector3(x, groundHeightAt(P.x, P.z), z).project(camera); mousePos.set(v.x, v.y); };
  const cls = selectedChar;
  // 위협 감지: 임팩트 직전 근접 공격
  let threat = null;
  for (const e of alive) { if (!e.awake || !e.hitPending) continue; const d = d2(e); if (d > 3.2 + (e.radius || 0.5)) continue; const lim = e.type === 'golem' ? 0.38 : 0.3; if (e.swingTimer > 0 && e.swingTimer < lim) { threat = e; break; } }
  if (B.blockT > 0) { B.blockT -= dt; if (B.blockT <= 0 && player.isBlocking) endBlock(); }
  if (threat && cls !== 'archer' && !player.isBlocking && player.sta >= 20 && !isCharging) { aimAt(threat.obj.position.x, threat.obj.position.z); startBlock(); B.blockT = 0.35; B.fl.blocks = (B.fl.blocks || 0) + 1; }
  if (threat && cls === 'archer' && player.dodgeCd <= 0 && player.dodgeT <= 0 && player.sta >= 30) { const ex = threat.obj.position.x - P.x, ez = threat.obj.position.z - P.z; startDodge(-ez, ex); B.fl.dodges = (B.fl.dodges || 0) + 1; }
  // 투사체·장판 회피(사람이면 옆으로 비키는 것) — 0.7초 안에 몸 1.3 안으로 지나갈 투사체는 진행 방향에 수직으로 비킨다
  let evade = null;
  const projs = [];
  for (const f of fireballs) if (f.mesh && !f.reflected) projs.push({ x: f.mesh.position.x, z: f.mesh.position.z, vx: f.vx, vz: f.vz });
  for (const c of thrownClubs) if (c.mesh && !c.embedded) projs.push({ x: c.mesh.position.x, z: c.mesh.position.z, vx: c.vx, vz: c.vz });
  for (const f of projs) { const rx = P.x - f.x, rz = P.z - f.z, v2 = f.vx * f.vx + f.vz * f.vz; if (v2 < 1) continue; const t = (rx * f.vx + rz * f.vz) / v2; if (t < 0 || t > 0.7) continue; const cx = f.x + f.vx * t, cz = f.z + f.vz * t; const pd = Math.hypot(P.x - cx, P.z - cz); if (pd > 1.3) continue; const sv = Math.hypot(f.vx, f.vz); let ex = -f.vz / sv, ez = f.vx / sv; if ((P.x - cx) * ex + (P.z - cz) * ez < 0) { ex = -ex; ez = -ez; } evade = { x: ex, z: ez }; B.fl.evades = (B.fl.evades || 0) + 1; break; }
  // 장판: 중심 반대 방향이 벽에 막혀 있으면 그 자리에 갇힌다(사람은 벽을 따라 옆으로 빠진다) — 16 방향 중 1.5·3 유닛 앞이 트였고 장판 밖으로 나가는 쪽을 고른다(v829)
  if (!evade) for (const pl of firePools) { if (pl.state !== 'active' && pl.state !== 'telegraph') continue; const d = Math.hypot(P.x - pl.x, P.z - pl.z); if (d < pl.radius + 0.6) { const u = d || 1, ax = (P.x - pl.x) / u, az = (P.z - pl.z) / u; let bx = ax, bz = az;
    const G = navFineGet(0.5); if (G) { const free = (x, z) => { const i = Math.floor((x - G.x0) / G.h), j = Math.floor((z - G.z0) / G.h); return i >= 0 && j >= 0 && i < G.FW && j < G.FH && !G.blk[j * G.FW + i]; }; let best = -9;
      for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2, cx = Math.cos(a), cz = Math.sin(a); if (!free(P.x + cx * 1.5, P.z + cz * 1.5) || !free(P.x + cx * 3, P.z + cz * 3)) continue; const sc = cx * ax + cz * az; if (sc > best) { best = sc; bx = cx; bz = cz; } } }
    evade = { x: bx, z: bz }; B.fl.evades = (B.fl.evades || 0) + 1; break; } }
  // v870 4막 바닥 공격 — 용암 분출 줄(예고 띠·남는 장판) · 화산탄 예고 · 바닥 고리(lbRings: 거수 내려찍기·군주 착지) · 터지기 직전 임프.
  // 사람이면 예고를 보고 비키는 것들이라 봇도 비킨다(안 비키면 4막 피해가 과대평가된다 — v826 원칙). 가장 가까운 위험에서 트인 쪽으로
  if (!evade && typeof lavaLines !== 'undefined') {
    let zc = null, zd = 1e9; const near = (x, z, lim) => { const d = Math.hypot(P.x - x, P.z - z); if (d < lim && d < zd) { zd = d; zc = { x, z }; } };
    for (const L of lavaLines) { const live = L.t < L.delay + 0.3 || (L.linger > 0 && L.t < L.delay + L.linger); if (!live) continue; const px = P.x - L.sx, pz = P.z - L.sz, al = Math.max(0, Math.min(L.len, px * L.ux + pz * L.uz)); near(L.sx + L.ux * al, L.sz + L.uz * al, L.w / 2 + 0.9); }
    for (const m of lbMeteors) if (!m.hit) near(m.x, m.z, LB_METEOR_R + 0.7);
    for (const r of lbRings) near(r.position.x, r.position.z, r.geometry.parameters.outerRadius + 0.7);
    for (const e of enemies) if (e.type === 'fireimp' && e._impT >= 0) near(e.obj.position.x, e.obj.position.z, IMP_BLAST_R + 0.8);
    if (zc) { evade = window.__botEscape(zc.x, zc.z); B.fl.evades4 = (B.fl.evades4 || 0) + 1; }
  }
  // 물약
  if (player.hp < player.hpMax * 0.4 && player.potions > 0) { usePotion(); B.fl.potions++; }
  // 목표·이동
  let goal = null, isStairs = false;
  if (tgt) goal = { x: tgt.obj.position.x, z: tgt.obj.position.z };
  else if (stairsMesh && stairsMesh.position.y > -10) { goal = { x: stairsMesh.position.x, z: stairsMesh.position.z }; isStairs = true; }
  joyVec = { x: 0, y: 0 };
  if (!goal && evade) setJoy(evade.x, evade.z);
  if (goal) {
    const d = Math.hypot(goal.x - P.x, goal.z - P.z);
    let reach = 0;
    if (tgt) reach = cls === 'archer' ? 8.5 : (cls === 'mage' ? 2.6 : 2.2) + (tgt.radius || 0.5) * 0.8;
    if (tgt) aimAt(goal.x, goal.z);
    const wantMove = isStairs ? d > 0.3 : (cls === 'archer' ? (d > 11) : d > reach);
    const tooClose = cls === 'archer' && tgt && d < 5;
    if (evade) { setJoy(evade.x, evade.z); if (isCharging) releaseCharge(); }
    else if (wantMove) window.__botNav.moveTo(goal, dt);
    else if (tooClose) setJoy(P.x - goal.x, P.z - goal.z);
    // 공격
    if (tgt && !player.isBlocking && !player.rooted && !evade) {
      const inRange = cls === 'archer' ? d < 13 : d < reach + 0.6;
      if (isCharging) { B.chargeT -= dt; if (B.chargeT <= 0) { releaseCharge(); B.fl.atks = (B.fl.atks || 0) + 1; } }
      else if (inRange && player.attackCooldown <= 0 && swingTimer <= 0) { startCharge(); if (!isCharging) {} else { const heavy = player.sta >= 70 && (B.fl.atks || 0) % 4 === 3; B.chargeT = heavy ? 0.5 : 0.02; } }
    } else if (isCharging) { releaseCharge(); }
    // 끼임 감지
    B.winT = (B.winT || 0) + dt;
    if (B.winT >= 1) { B.winT = 0; if (B.winP) { const mv = Math.hypot(P.x - B.winP.x, P.z - B.winP.z); if (wantMove && mv < 0.5) B.stuckT += 1; else B.stuckT = 0; } B.winP = { x: P.x, z: P.z }; }
    if (B.stuckT >= 3) { B.fl.unstuck = (B.fl.unstuck || 0) + 1; B.stuckT = 0; const d = Math.hypot(goal.x - P.x, goal.z - P.z); if (d < 4) { P.x = goal.x; P.z = goal.z; } else { const nx = window.__botNav.nextCell(goal); if (nx) { P.x = nx.x; P.z = nx.z; } } }
  }
  B.lastP = { x: P.x, z: P.z };
};
// 위험 중심(cx, cz)에서 벗어나는 방향 — 16 방향 중 1.5·3 유닛 앞이 트였고 중심 반대에 가까운 쪽(장판 회피와 같은 요령)
window.__botEscape = function (cx, cz) {
  const P = player.obj.position, d = Math.hypot(P.x - cx, P.z - cz) || 1, ax = (P.x - cx) / d, az = (P.z - cz) / d; let bx = ax, bz = az;
  const G = navFineGet(0.5); if (G) { const free = (x, z) => { const i = Math.floor((x - G.x0) / G.h), j = Math.floor((z - G.z0) / G.h); return i >= 0 && j >= 0 && i < G.FW && j < G.FH && !G.blk[j * G.FW + i]; }; let best = -9;
    for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2, x = Math.cos(a), z = Math.sin(a); if (!free(P.x + x * 1.5, P.z + z * 1.5) || !free(P.x + x * 3, P.z + z * 3)) continue; const sc = x * ax + z * az; if (sc > best) { best = sc; bx = x; bz = z; } } }
  return { x: bx, z: bz };
};
// 길찾기: navFineGet 의 1유닛 격자(충돌체를 몸 반지름만큼 부풀린 것)에서 목표 칸 → 플레이어 칸 BFS
(function () {
  const B = window.__botNav = { path: null, pathKey: '' };
  function bfsFrom(G, gx, gz) {
    const { blk, FW, FH, x0, z0, h } = G; const d = new Int32Array(FW * FH).fill(-1); const q = [];
    let ti = Math.floor((gx - x0) / h), tj = Math.floor((gz - z0) / h);
    // 목표 칸이 막혀 있으면(계단 받침·적 몸 둘레) 둘레에서 가장 가까운 빈 칸들에서 시작
    for (let r = 0; r <= 4 && !q.length; r++) for (let j = tj - r; j <= tj + r; j++) for (let i = ti - r; i <= ti + r; i++) { if (Math.max(Math.abs(i - ti), Math.abs(j - tj)) !== r || i < 0 || j < 0 || i >= FW || j >= FH) continue; const c = j * FW + i; if (!blk[c] && d[c] < 0) { d[c] = 0; q.push(c); } }
    for (let k = 0; k < q.length; k++) { const c = q[k], i = c % FW, j = (c / FW) | 0, dc = d[c] + 1;
      if (i > 0 && !blk[c - 1] && d[c - 1] < 0) { d[c - 1] = dc; q.push(c - 1); }
      if (i < FW - 1 && !blk[c + 1] && d[c + 1] < 0) { d[c + 1] = dc; q.push(c + 1); }
      if (j > 0 && !blk[c - FW] && d[c - FW] < 0) { d[c - FW] = dc; q.push(c - FW); }
      if (j < FH - 1 && !blk[c + FW] && d[c + FW] < 0) { d[c + FW] = dc; q.push(c + FW); } }
    return d;
  }
  B.nextCell = function (goal) {
    const G = navFineGet(0.5); if (!G) return null;
    const key = Math.round(goal.x) + ',' + Math.round(goal.z);
    if (!B.path || B.pathKey !== key || B.pathDgn !== dungeon || B.pathWn !== G.wn) { B.path = bfsFrom(G, goal.x, goal.z); B.pathKey = key; B.pathDgn = dungeon; B.pathWn = G.wn; }
    const { FW, FH, x0, z0, h } = G, d = B.path; const P = player.obj.position;
    let pi = Math.floor((P.x - x0) / h), pj = Math.floor((P.z - z0) / h); if (pi < 0 || pj < 0 || pi >= FW || pj >= FH) return null;
    let c = pj * FW + pi;
    if (d[c] < 0) { // 플레이어 칸이 막혀 있거나 닿지 않음 → 둘레에서 가장 가까운 유효 칸
      let bestC = -1, bestD = 1e9; for (let j = pj - 2; j <= pj + 2; j++) for (let i = pi - 2; i <= pi + 2; i++) { if (i < 0 || j < 0 || i >= FW || j >= FH) continue; const cc = j * FW + i; if (d[cc] >= 0 && d[cc] < bestD) { bestD = d[cc]; bestC = cc; } }
      if (bestC < 0) return null; c = bestC; return { x: x0 + (c % FW + 0.5) * h, z: z0 + (((c / FW) | 0) + 0.5) * h, dist: d[c] };
    }
    // 기울기 따라 2칸 앞을 겨냥(지그재그 방지)
    let cur = c; for (let s = 0; s < 2; s++) { const i = cur % FW, j = (cur / FW) | 0; let nb = cur, nd = d[cur]; for (const [di, dj] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]) { const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= FW || jj >= FH) continue; const cc = jj * FW + ii; if (d[cc] >= 0 && d[cc] < nd && (di === 0 || dj === 0 || (!G.blk[j * FW + ii] && !G.blk[jj * FW + i]))) { nd = d[cc]; nb = cc; } } if (nb === cur) break; cur = nb; }
    if (cur === c) return null;
    return { x: x0 + (cur % FW + 0.5) * h, z: z0 + (((cur / FW) | 0) + 0.5) * h, dist: d[c] };
  };
  B.lineClear = function (ax, az, bx, bz) { const r = player.radius + 0.05; for (let k = 1; k <= 8; k++) { const x = ax + (bx - ax) * k / 8, z = az + (bz - az) * k / 8; for (const w of walls) if (Math.abs(x - w.x) < w.halfW + r && Math.abs(z - w.z) < w.halfD + r) return false; } return true; };
  B.moveTo = function (goal, dt) {
    const P = player.obj.position; const gd = Math.hypot(goal.x - P.x, goal.z - P.z);
    const nx = (gd < 4 && B.lineClear(P.x, P.z, goal.x, goal.z)) ? null : B.nextCell(goal);
    const camFwd = new THREE.Vector3(); camera.getWorldDirection(camFwd); camFwd.y = 0; camFwd.normalize();
    const camRight = new THREE.Vector3().crossVectors(camFwd, new THREE.Vector3(0, 1, 0)).normalize();
    let dx, dz; if (nx) { dx = nx.x - P.x; dz = nx.z - P.z; } else { dx = goal.x - P.x; dz = goal.z - P.z; }
    const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    joyVec = { x: dx * camRight.x + dz * camRight.z, y: -(dx * camFwd.x + dz * camFwd.z) };
  };
})();
window.__botRun = function (frames) {
  const B = window.__bot; let n = 0;
  for (; n < frames && !B.done; n++) { window.__t += 1000 / 60; if (window.__flushTimers) window.__flushTimers(); window.__botStep(1 / 60); let gdt = 1 / 60; if (typeof bossSlowT !== 'undefined' && bossSlowT >= 0) gdt *= bossSlowTick(1 / 60);   // v870: 보스 슬로모(v858)도 메인 루프 몫 — 안 돌리면 끝나지 않아 보상 카드·120층 낙하가 영영 안 온다
    const hf = typeof hsFall !== 'undefined' && hsFall; if (hf) hsFallTick(1 / 60); if (player.alive && !rewardPaused && !(hf && hsFallLock())) update(gdt); }   // v870: 120층 격파 뒤 낙하 연출(메인 루프 몫)을 봇 루프가 대신 돌린다
  return { done: B.done, reason: B.reason, floor: player.floor, lv: player.lv, hp: Math.round(player.hp), hpMax: player.hpMax, deaths: B.deaths, t: Math.round(B.t), nFloors: B.floors.length };
};

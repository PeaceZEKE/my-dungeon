// dl-harness 스니펫 · 도달성 flood fill(--eval-file 로 넣는다)
//   node .claude/skills/dl-harness/scripts/harness.js --floor 25 --seed 5150 --eval "window.__reachR = 0.575" --eval-file .claude/skills/dl-harness/scripts/snippets/reach.js
// 충돌체(walls — 벽 칸·장식·흑요석·쓰러진 기둥 전부)를 반지름 R 만큼 부풀려 S 간격 격자에 찍고,
// 플레이어 자리에서 가장 가까운 빈 표본부터 4방향으로 채운다. 바닥 칸 중 표본이 하나도 안 닿은 칸 = 도달 못 하는 칸.
// 기준(CLAUDE.md '1막 벽 콜라이더는…' · '2막 무너진 성 v2(v796)'): 플레이어 0.5 · 오크 0.575 · 여유 0.6 에서 0 이어야 한다.
// 반경 1.0(보스)은 기준이 아니다(보스는 homeRoom 에 묶인다). 계단 받침은 충돌체가 아니라 밀어내기라 여기 안 들어간다.
// 스폰 자리가 장식 충돌체 안이면 스폰 표본에서 바로 채우면 '전부 못 닿음' 이 나온다 — 그래서 가장 가까운 빈 표본에서 시작한다.
(() => {
  const R = window.__reachR || 0.575, S = window.__reachS || 0.5;
  const g = dungeon.grid, x0 = (-MAP_W / 2 - 0.5) * TILE, z0 = (-MAP_H / 2 - 0.5) * TILE;
  const NX = Math.ceil(MAP_W * TILE / S), NZ = Math.ceil(MAP_H * TILE / S);
  const tileOf = (x, z) => [Math.floor(x / TILE + MAP_W / 2 + 0.5), Math.floor(z / TILE + MAP_H / 2 + 0.5)];
  const isF = (tx, ty) => ty >= 0 && ty < MAP_H && tx >= 0 && tx < MAP_W && g[ty][tx] === 1;
  const free = new Uint8Array(NX * NZ), seen = new Uint8Array(NX * NZ);
  let nFree = 0;
  for (let iz = 0; iz < NZ; iz++) for (let ix = 0; ix < NX; ix++) {
    const x = x0 + (ix + 0.5) * S, z = z0 + (iz + 0.5) * S, [tx, ty] = tileOf(x, z);
    if (isF(tx, ty) && !wallOverlapAt(x, z, R)) { free[iz * NX + ix] = 1; nFree++; }
  }
  const px = player.obj.position.x, pz = player.obj.position.z;
  let best = -1, bd = 1e9;
  for (let i = 0; i < free.length; i++) if (free[i]) { const x = x0 + (i % NX + 0.5) * S, z = z0 + ((i / NX | 0) + 0.5) * S, d = (x - px) ** 2 + (z - pz) ** 2; if (d < bd) { bd = d; best = i; } }
  if (best < 0) return { R, err: '빈 표본 없음' };
  const Q = [best]; seen[best] = 1;
  for (let h = 0; h < Q.length; h++) {
    const i = Q[h], ix = i % NX, iz = i / NX | 0;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const jx = ix + dx, jz = iz + dz; if (jx < 0 || jz < 0 || jx >= NX || jz >= NZ) continue;
      const j = jz * NX + jx; if (free[j] && !seen[j]) { seen[j] = 1; Q.push(j); }
    }
  }
  const tiles = new Map();   // 'tx,ty' → [빈 표본, 닿은 표본]
  for (let i = 0; i < free.length; i++) if (free[i]) {
    const [tx, ty] = tileOf(x0 + (i % NX + 0.5) * S, z0 + ((i / NX | 0) + 0.5) * S), k = tx + ',' + ty;
    const t = tiles.get(k) || [0, 0]; t[0]++; if (seen[i]) t[1]++; tiles.set(k, t);
  }
  let floorTiles = 0; const unreachable = [], blocked = [];
  for (let ty = 0; ty < MAP_H; ty++) for (let tx = 0; tx < MAP_W; tx++) if (isF(tx, ty)) {
    floorTiles++; const t = tiles.get(tx + ',' + ty);
    if (!t) blocked.push([tx, ty]); else if (!t[1]) unreachable.push([tx, ty]);
  }
  return { floor: player.floor, R, S, floorTiles, freeSamples: nFree, reached: Q.length, startDist: +Math.sqrt(bd).toFixed(2),
    unreachable: unreachable.length, unreachableTiles: unreachable.slice(0, 20), fullyBlocked: blocked.length, blockedTiles: blocked.slice(0, 20) };
})()

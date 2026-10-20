#!/bin/bash
# viewers/_work 를 8898 로 서빙(이미 떠 있으면 그대로). 저장소 루트에서 실행.
# 그냥 & 로 띄우면 Bash 호출이 끝날 때 같이 죽는다 — setsid nohup(CLAUDE.md '혼령 히트앤런 빈도' 계측 함정).
PORT=${PORT:-8898}
[ -f index.html ] || { echo "저장소 루트에서 실행할 것"; exit 1; }
mkdir -p viewers/_work
echo ok > viewers/_work/.serve_ok
# 떠 있는 서버가 viewers/_work 를 서빙하는지 표식 파일로 확인(다른 폴더 서버가 같은 포트를 잡고 있으면 404)
if curl -s -o /dev/null --max-time 2 "http://localhost:$PORT/"; then
  if [ "$(curl -s --max-time 2 "http://localhost:$PORT/.serve_ok")" = ok ]; then echo "✓ :$PORT 떠 있음(viewers/_work)"; exit 0; fi
  echo "✗ :$PORT 를 다른 폴더 서버가 잡고 있다 — 그 서버를 끄거나(PID: $(ss -ltnp 2>/dev/null | grep ":$PORT " | grep -o 'pid=[0-9]*' | head -1)) PORT=8896 bash serve.sh 처럼 다른 포트로(shot/probe 도 같은 PORT 환경 변수)"; exit 1
fi
(cd viewers/_work && setsid nohup python3 -m http.server "$PORT" < /dev/null > /dev/null 2>&1 &)
for i in 1 2 3 4 5 6 7 8 9 10; do sleep 0.5; [ "$(curl -s --max-time 2 "http://localhost:$PORT/.serve_ok")" = ok ] && { echo "✓ :$PORT 띄움(viewers/_work)"; exit 0; }; done
echo "✗ :$PORT 서버가 안 뜬다"; exit 1

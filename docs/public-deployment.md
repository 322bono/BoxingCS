# 게임 웹사이트 공개

현재 게임은 웹페이지와 Socket.IO 대전 서버를 하나의 Node 프로세스로 제공합니다. 웹서비스 한 개로 배포해야 같은 HTTPS 주소에서 초대코드·온라인 경기·음악·3D 파일을 사용할 수 있습니다. `render.yaml`은 Render 무료 Node 웹서비스, 싱가포르 리전, 단일 인스턴스를 지정합니다. 별도 데이터베이스나 게임용 API 키는 필요하지 않습니다.

## Render

1. [Render 배포 화면](https://render.com/deploy?repo=https://github.com/322bono/BoxingCS)을 열고 Render 계정으로 로그인합니다.
2. `322bono/BoxingCS`의 `main`과 `render.yaml`을 선택합니다. 서비스 유형은 Node 웹서비스, 플랜은 Free입니다.
3. 배포가 `Live`가 되면 Render가 발급한 HTTPS 주소를 친구들과 공유합니다. 각자 같은 주소에 접속한 뒤 초대코드로 참가합니다.

빌드는 `npm ci --include=dev --no-audit --no-fund && npm run build`, 실행은 `npm start`입니다. 현재 서버 실행기는 `tsx`를 사용하므로 빌드 과정에서 개발 의존성도 설치합니다. Render가 제공하는 `PORT`를 자동으로 사용하며 상태 확인 경로는 `/api/health`입니다. HTTPS와 WebSocket 업그레이드는 Render가 처리합니다. 프로세스는 하나만 사용합니다.

배포 후 서로 다른 두 브라우저에서 초대·준비·공통 카운트다운·경기·재접속·기권 결과를 확인합니다. `/api/health`는 `status: "ok"`, `game: "ring-club"`을 반환해야 합니다. 실제 공개 주소에서 확인하기 전에는 공개 완료로 기록하지 않습니다.

무료 서비스는 사용하지 않을 때 절전 상태가 되어 첫 접속이 늦어질 수 있습니다. 로비는 서버 메모리에 있어 서버 재시작·재배포 시 초기화됩니다. 진행 중인 경기를 유지해야 하는 상시 운영은 항상 실행되는 인스턴스와 별도의 세션 지속 저장 작업이 필요합니다.

## Supabase의 역할

Supabase는 향후 회원·전적·랭킹을 저장하는 데 사용할 수 있습니다. 현재 Express·Socket.IO 서버는 지속 실행과 모든 선수의 공통 시뮬레이션 상태가 필요하므로 별도 Node 호스팅에 둡니다. Supabase Edge Functions는 실행 시간과 CPU 제한이 있어 현재의 긴 팀전 서버를 그대로 대체하는 배포 대상이 아닙니다. 현재 공개에 Supabase 프로젝트를 새로 만들 필요는 없습니다.

공식 문서: [Render Blueprint](https://render.com/docs/blueprint-spec), [Render WebSockets](https://render.com/docs/websocket), [Supabase Edge Functions 제한](https://supabase.com/docs/guides/functions/limits).

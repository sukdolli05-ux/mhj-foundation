MHJ FOUNDATION v9 실행 방법

1. 기존 백엔드/프론트 창을 모두 종료합니다.
2. 압축을 새 폴더에 풉니다.
3. START_BACKEND.bat 실행
4. START_FRONTEND.bat 실행

접속 주소
- 회원: http://localhost:5173
- 관리자: http://localhost:5173/admin/login
- 백엔드 상태: http://127.0.0.1:8000/api/health
- API 문서: http://127.0.0.1:8000/docs

관리자 계정
- ID: admin@mhjfoundation.com
- PW: MHJ-Admin-2026!

회원가입 조건
- 이름 필수
- 정상 이메일
- 비밀번호 8자 이상
- 추천코드는 선택사항
- 추천코드를 넣었다면 실제 존재하는 MHJ 코드 또는 회원 이메일이어야 함

v9 수정사항
- 회원가입 422 원인 메시지를 화면에 자세히 표시
- 회원가입 프론트/백엔드 필드 완전 일치
- 8자 미만 비밀번호 제출 차단
- 빈 추천코드는 null로 전송
- 존재하지 않는 추천코드는 명확한 오류 표시
- 관리자/회원 인증 토큰 자동 정리
- 무한 로딩 방지
- v9 전용 새 DB(mhj_v9.db) 사용

MHJ v10 수정사항

1. 입금 신청 422 개선
- 거래 해시 최소 길이를 3자로 완화
- 금액/거래 해시를 프론트에서 먼저 검사
- 오류 내용을 화면에 표시

2. 관리자 메뉴 실제 클릭 가능
- Dashboard
- Calendar
- Deposits
- Settlements
- Withdrawals
- Treatments
- Ledger

3. 출금/시술/원장 API 추가
- 관리자 출금 승인/완료/거절
- 관리자 시술 일정/완료/취소
- 관리자 원장 조회
- 관리자 정산 이력 조회

4. 409 Conflict 의미
- 동일한 날짜에 정산을 두 번 실행한 경우입니다.
- v10 화면에서는 '이미 정산 완료'라고 표시됩니다.

실행
- START_BACKEND.bat
- START_FRONTEND.bat

관리자
- http://localhost:5173/admin/login
- admin@mhjfoundation.com
- MHJ-Admin-2026!

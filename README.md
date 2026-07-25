
# MHJ Foundation v7 — Medical Hub Japan

A runnable development prototype for:

- Member and separate administrator login
- ExVar / NK Cell / ST Cell program accounts
- Partial USDT deposits and administrator approval
- 1.5% daily reward settlement at KST day-close
- 50% withdrawable USDT + 50% MHJ Coin automatically converted to Medical Credit
- Direct-referral eligibility: two active direct referrals
- One-time referral rewards and daily team bonuses at 5% / 3% / 2%
- Combined 150% reward cap
- Treatment requests from 2026-10-01 after the program target is reached
- Administrator ERP, deposit queue, program cost basis, Excel export and audit ledger
- Idempotent daily settlement: the same KST date cannot be paid twice

## Program policy included

| Program | Target price | Operating cost |
|---|---:|---:|
| ExVar Therapy | 3,500 USDT | 1,000 USDT |
| NK Cell Therapy | 10,000 USDT | 2,200 USDT |
| ST Cell Therapy | 15,000 USDT | 4,000 USDT |

## Run backend (Windows PowerShell)

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
copy .env.example .env
uvicorn main:app --reload
```

API docs: http://127.0.0.1:8000/docs

Bootstrap administrator:

- Email: `admin@mhjfoundation.com`
- Password: `MHJ-Admin-2026!`

Change the password and token secret before any deployment.

## Run frontend

```powershell
cd frontend
npm install
npm run dev
```

Member portal: http://localhost:5173  
Administrator ERP: http://localhost:5173/admin/login

## Important implementation notes

This package is a working development prototype, not a production-certified financial or medical platform. Before real deployment:

1. Replace SQLite with PostgreSQL and use proper database migrations.
2. Replace the compact signed session format with an audited authentication library and add MFA.
3. Add on-chain deposit verification instead of manual TX-hash approval.
4. Add background scheduling (Celery/RQ/APS cheduler) with distributed locks.
5. Add KYC/AML, privacy, medical-consent, hospital-contract and jurisdiction-specific compliance controls.
6. Decide whether MHJ Coin-to-Medical-Credit conversion is fixed, oracle-priced or administrator-priced.
7. Perform load, security, accounting and reconciliation tests.

The daily reward engine deliberately uses the *actual credited reward after cap clipping* as the base for team bonuses.


from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import secrets
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo
from typing import Optional

from fastapi import FastAPI, Depends, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, EmailStr, Field
from openpyxl import Workbook

KST = ZoneInfo("Asia/Seoul")
DB_PATH = os.getenv("MHJ_DB_PATH", "mhj_v13.db")
TOKEN_SECRET = os.getenv("MHJ_TOKEN_SECRET", "change-this-secret")
PLATFORM_WALLET = os.getenv(
    "PLATFORM_DEPOSIT_WALLET",
    "0x2540906f1800e5Ae4dFD4BD533086Cd19E92271E",
)
ADMIN_EMAIL = os.getenv("ADMIN_BOOTSTRAP_EMAIL", "admin@mhjfoundation.com").lower()
ADMIN_PASSWORD = os.getenv("ADMIN_BOOTSTRAP_PASSWORD", "MHJ-Admin-2026!")

DAILY_RATE = 0.015
CYCLE_MULTIPLIER = 1.50
USDT_SHARE = 0.50
MEDICAL_SHARE = 0.50
MIN_WITHDRAWAL_USDT = 100.0
DEPOSIT_REWARD_MULTIPLIER = 0.50  # 1,000 staking earns up to 500 reward (150% total value)
REF_RATES = {1: 0.05, 2: 0.03, 3: 0.02}
DIRECT_REQUIRED = 2
TREATMENT_START = "2026-10-01"

PROGRAMS = {
    "exvar": {"name": "ExVAR Therapy", "price": 3500.0, "cost": 1000.0, "consultation_only": False},
    "nkcell": {"name": "NK Cell Therapy", "price": 10000.0, "cost": 2200.0, "consultation_only": False},
    "stcell": {"name": "Amniotic Stem Cell Therapy", "price": 15000.0, "cost": 4000.0, "consultation_only": False},
    "rknk100": {"name": "RKNK-100 Anti-Aging Solution", "price": 4500.0, "cost": float(os.getenv("RKNK100_COST", "0")), "consultation_only": False},
}

def utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()

def kst_now() -> datetime:
    return datetime.now(KST)

def hash_password(value: str, salt: Optional[str] = None) -> str:
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", value.encode(), salt.encode(), 180_000)
    return f"{salt}${digest.hex()}"

def verify_password(value: str, stored: str) -> bool:
    try:
        salt, expected = stored.split("$", 1)
        actual = hashlib.pbkdf2_hmac("sha256", value.encode(), salt.encode(), 180_000).hex()
        return hmac.compare_digest(actual, expected)
    except Exception:
        return False

def sign_token(payload: dict, hours: int = 12) -> str:
    body = dict(payload)
    body["exp"] = int((datetime.now(timezone.utc) + timedelta(hours=hours)).timestamp())
    raw = base64.urlsafe_b64encode(json.dumps(body, separators=(",", ":")).encode()).decode().rstrip("=")
    sig = hmac.new(TOKEN_SECRET.encode(), raw.encode(), hashlib.sha256).hexdigest()
    return f"{raw}.{sig}"

def read_token(token: str) -> dict:
    try:
        raw, sig = token.split(".", 1)
        expected = hmac.new(TOKEN_SECRET.encode(), raw.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(sig, expected):
            raise ValueError("bad signature")
        padded = raw + "=" * (-len(raw) % 4)
        payload = json.loads(base64.urlsafe_b64decode(padded).decode())
        if int(payload["exp"]) < int(datetime.now(timezone.utc).timestamp()):
            raise ValueError("expired")
        return payload
    except Exception:
        raise HTTPException(401, "Invalid or expired session")

@contextmanager
def db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys=ON")
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()

def init_db():
    with db() as c:
        c.executescript("""
        CREATE TABLE IF NOT EXISTS users(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            password_hash TEXT NOT NULL,
            referral_code TEXT UNIQUE,
            ref1 INTEGER, ref2 INTEGER, ref3 INTEGER,
            wallet TEXT DEFAULT '',
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS admins(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'super_admin',
            must_change_password INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS program_accounts(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            program_key TEXT NOT NULL,
            cash_funded REAL NOT NULL DEFAULT 0,
            medical_credit REAL NOT NULL DEFAULT 0,
            reward_equiv_total REAL NOT NULL DEFAULT 0,
            reward_cap REAL NOT NULL DEFAULT 0,
            usdt_reward REAL NOT NULL DEFAULT 0,
            mhj_coin_reward REAL NOT NULL DEFAULT 0,
            status TEXT NOT NULL DEFAULT 'funding',
            treatment_status TEXT NOT NULL DEFAULT 'not_requested',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY(user_id) REFERENCES users(id)
        );
        CREATE TABLE IF NOT EXISTS deposits(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            account_id INTEGER NOT NULL,
            amount REAL NOT NULL,
            tx_hash TEXT UNIQUE NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            reward_cap REAL NOT NULL DEFAULT 0,
            reward_earned REAL NOT NULL DEFAULT 0,
            staking_status TEXT NOT NULL DEFAULT 'pending',
            created_at TEXT NOT NULL,
            approved_at TEXT,
            FOREIGN KEY(user_id) REFERENCES users(id),
            FOREIGN KEY(account_id) REFERENCES program_accounts(id)
        );
        CREATE TABLE IF NOT EXISTS rewards(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            beneficiary_user_id INTEGER NOT NULL,
            account_id INTEGER,
            source_user_id INTEGER,
            source_account_id INTEGER,
            reward_date TEXT NOT NULL,
            reward_type TEXT NOT NULL,
            level INTEGER,
            gross_equiv REAL NOT NULL,
            usdt_amount REAL NOT NULL,
            mhj_coin_amount REAL NOT NULL,
            medical_credit_amount REAL NOT NULL,
            created_at TEXT NOT NULL,
            UNIQUE(beneficiary_user_id, source_account_id, reward_date, reward_type, level)
        );
        CREATE TABLE IF NOT EXISTS settlements(
            settlement_date TEXT PRIMARY KEY,
            status TEXT NOT NULL,
            accounts_processed INTEGER NOT NULL DEFAULT 0,
            rewards_gross REAL NOT NULL DEFAULT 0,
            team_gross REAL NOT NULL DEFAULT 0,
            completed_at TEXT,
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS withdrawals(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            amount REAL NOT NULL,
            wallet TEXT NOT NULL,
            txid TEXT,
            status TEXT NOT NULL DEFAULT 'pending',
            created_at TEXT NOT NULL,
            completed_at TEXT
        );
        CREATE TABLE IF NOT EXISTS treatments(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            account_id INTEGER NOT NULL,
            requested_date TEXT NOT NULL,
            desired_date TEXT,
            hospital TEXT,
            status TEXT NOT NULL DEFAULT 'consultation',
            note TEXT,
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS ledger(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            account_id INTEGER,
            entry_type TEXT NOT NULL,
            amount REAL NOT NULL,
            asset TEXT NOT NULL,
            reference TEXT,
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS audit_logs(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            admin_id INTEGER,
            action TEXT NOT NULL,
            target TEXT,
            detail TEXT,
            created_at TEXT NOT NULL
        );
        """)
        # Non-destructive v14 migrations for existing v13 databases.
        deposit_columns = {row["name"] for row in c.execute("PRAGMA table_info(deposits)").fetchall()}
        if "reward_cap" not in deposit_columns:
            c.execute("ALTER TABLE deposits ADD COLUMN reward_cap REAL NOT NULL DEFAULT 0")
        if "reward_earned" not in deposit_columns:
            c.execute("ALTER TABLE deposits ADD COLUMN reward_earned REAL NOT NULL DEFAULT 0")
        if "staking_status" not in deposit_columns:
            c.execute("ALTER TABLE deposits ADD COLUMN staking_status TEXT NOT NULL DEFAULT 'pending'")
        user_columns = {r["name"] for r in c.execute("PRAGMA table_info(users)").fetchall()}
        if "status" not in user_columns:
            c.execute("ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'active'")
        if "admin_note" not in user_columns:
            c.execute("ALTER TABLE users ADD COLUMN admin_note TEXT NOT NULL DEFAULT ''")

        if not c.execute("SELECT 1 FROM admins WHERE email=?", (ADMIN_EMAIL,)).fetchone():
            c.execute(
                "INSERT INTO admins(email,password_hash,role,must_change_password,created_at) VALUES(?,?,?,?,?)",
                (ADMIN_EMAIL, hash_password(ADMIN_PASSWORD), "super_admin", 1, utcnow()),
            )

app = FastAPI(title="MHJ Foundation Medical Hub Japan v14.1", version="14.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "http://localhost:5173").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def startup():
    init_db()

class SignupIn(BaseModel):
    email: EmailStr
    name: str = Field(min_length=1, max_length=80)
    password: str = Field(min_length=8, max_length=128)
    referrer: Optional[str] = None

class LoginIn(BaseModel):
    email: EmailStr
    password: str

class CreateProgramIn(BaseModel):
    program_key: str

class DepositIn(BaseModel):
    account_id: int
    amount: float = Field(gt=0)
    tx_hash: str = Field(min_length=3, max_length=200)

class WithdrawalIn(BaseModel):
    amount: float = Field(ge=MIN_WITHDRAWAL_USDT)
    wallet: str = Field(min_length=6, max_length=200)

class WalletIn(BaseModel):
    wallet: str = Field(min_length=6, max_length=200)

class AdminStatusIn(BaseModel):
    status: str
    note: Optional[str] = None
    txid: Optional[str] = None

class AdminDecisionIn(BaseModel):
    note: Optional[str] = ""

class SettlementIn(BaseModel):
    settlement_date: Optional[str] = None

class AdminMemberStatusIn(BaseModel):
    status: str = Field(min_length=3, max_length=20)
    note: Optional[str] = Field(default=None, max_length=500)


class TreatmentIn(BaseModel):
    account_id: int
    desired_date: Optional[str] = None
    hospital: Optional[str] = None
    note: Optional[str] = None

def user_auth(authorization: str = Header("")) -> sqlite3.Row:
    if not authorization.startswith("Bearer "):
        raise HTTPException(401, "Login required")
    payload = read_token(authorization[7:])
    if payload.get("kind") != "user":
        raise HTTPException(403, "User session required")
    with db() as c:
        row = c.execute("SELECT * FROM users WHERE id=?", (payload["sub"],)).fetchone()
        if not row:
            raise HTTPException(401, "User not found")
        return row

def admin_auth(authorization: str = Header("")) -> sqlite3.Row:
    if not authorization.startswith("Bearer "):
        raise HTTPException(401, "Administrator login required")
    payload = read_token(authorization[7:])
    if payload.get("kind") != "admin":
        raise HTTPException(403, "Administrator session required")
    with db() as c:
        row = c.execute("SELECT * FROM admins WHERE id=?", (payload["sub"],)).fetchone()
        if not row:
            raise HTTPException(401, "Administrator not found")
        return row

def log(c, admin_id, action, target="", detail=""):
    c.execute(
        "INSERT INTO audit_logs(admin_id,action,target,detail,created_at) VALUES(?,?,?,?,?)",
        (admin_id, action, target, detail, utcnow()),
    )

def active_direct_count(c, uid: int) -> int:
    row = c.execute("""
        SELECT COUNT(DISTINCT u.id) n
        FROM users u
        JOIN program_accounts p ON p.user_id=u.id
        WHERE u.ref1=? AND p.cash_funded>0
    """, (uid,)).fetchone()
    return int(row["n"])

def remaining_cap(c, uid: int) -> float:
    total_cap = c.execute("SELECT COALESCE(SUM(reward_cap),0) x FROM program_accounts WHERE user_id=?", (uid,)).fetchone()["x"]
    paid = c.execute("SELECT COALESCE(SUM(gross_equiv),0) x FROM rewards WHERE beneficiary_user_id=?", (uid,)).fetchone()["x"]
    return max(0.0, float(total_cap) - float(paid))

def add_reward(c, *, beneficiary, account_id, source_user, source_account, date, kind, level, gross):
    gross = min(float(gross), remaining_cap(c, beneficiary))
    if gross <= 0:
        return 0.0
    usdt = round(gross * USDT_SHARE, 8)
    medical = round(gross * MEDICAL_SHARE, 8)
    # Medical share is issued as MHJ Coin accounting units, then auto-converted 1:1 to Medical Credit.
    mhj = medical
    try:
        c.execute("""
            INSERT INTO rewards(
                beneficiary_user_id,account_id,source_user_id,source_account_id,reward_date,
                reward_type,level,gross_equiv,usdt_amount,mhj_coin_amount,medical_credit_amount,created_at
            ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
        """, (beneficiary, account_id, source_user, source_account, date, kind, level,
              gross, usdt, mhj, medical, utcnow()))
    except sqlite3.IntegrityError:
        return 0.0
    if account_id:
        c.execute("""
            UPDATE program_accounts
            SET reward_equiv_total=reward_equiv_total+?,
                usdt_reward=usdt_reward+?,
                mhj_coin_reward=mhj_coin_reward+?,
                medical_credit=medical_credit+?,
                updated_at=?
            WHERE id=?
        """, (gross, usdt, mhj, medical, utcnow(), account_id))
    c.execute("INSERT INTO ledger(user_id,account_id,entry_type,amount,asset,reference,created_at) VALUES(?,?,?,?,?,?,?)",
              (beneficiary, account_id, kind, usdt, "USDT", f"{date}:{source_account}", utcnow()))
    c.execute("INSERT INTO ledger(user_id,account_id,entry_type,amount,asset,reference,created_at) VALUES(?,?,?,?,?,?,?)",
              (beneficiary, account_id, "medical_credit_auto_charge", medical, "MEDICAL_CREDIT", f"{date}:{source_account}", utcnow()))
    return gross

@app.get("/api/health")
def health():
    return {"ok": True, "kst": kst_now().isoformat(), "treatment_start": TREATMENT_START}

@app.get("/api/programs")
def programs():
    return [{"key": k, **v} for k, v in PROGRAMS.items()]

@app.post("/api/auth/signup")
def signup(data: SignupIn):
    clean_name = data.name.strip()
    clean_referrer = (data.referrer or "").strip()
    if not clean_name:
        raise HTTPException(400, "Name is required")

    with db() as c:
        if c.execute("SELECT 1 FROM users WHERE email=?", (data.email.lower(),)).fetchone():
            raise HTTPException(409, "Email already registered")
        ref = None
        if clean_referrer:
            ref = c.execute("SELECT * FROM users WHERE referral_code=? OR email=?",
                            (clean_referrer.upper(), clean_referrer.lower())).fetchone()
            if not ref:
                raise HTTPException(400, "Referral code or referrer email was not found")
        ref1 = ref["id"] if ref else None
        ref2 = ref["ref1"] if ref else None
        ref3 = ref["ref2"] if ref else None
        cur = c.execute("""
            INSERT INTO users(email,name,password_hash,ref1,ref2,ref3,created_at)
            VALUES(?,?,?,?,?,?,?)
        """, (data.email.lower(), clean_name, hash_password(data.password), ref1, ref2, ref3, utcnow()))
        uid = cur.lastrowid
        code = f"MHJ-{uid:06d}"
        c.execute("UPDATE users SET referral_code=? WHERE id=?", (code, uid))
    return {"ok": True, "referral_code": code}

@app.post("/api/auth/login")
def user_login(data: LoginIn):
    with db() as c:
        u = c.execute("SELECT * FROM users WHERE email=?", (data.email.lower(),)).fetchone()
        if not u or not verify_password(data.password, u["password_hash"]):
            raise HTTPException(401, "Email or password is incorrect")
        return {"token": sign_token({"kind": "user", "sub": u["id"]}), "user": {"name": u["name"], "email": u["email"]}}

@app.post("/api/admin/auth/login")
def admin_login(data: LoginIn):
    with db() as c:
        a = c.execute("SELECT * FROM admins WHERE email=?", (data.email.lower(),)).fetchone()
        if not a or not verify_password(data.password, a["password_hash"]):
            raise HTTPException(401, "Administrator credentials are incorrect")
        return {"token": sign_token({"kind": "admin", "sub": a["id"]}), "role": a["role"], "must_change_password": bool(a["must_change_password"])}

@app.post("/api/program-accounts")
def create_account(data: CreateProgramIn, user=Depends(user_auth)):
    key = data.program_key.lower()
    if key not in PROGRAMS:
        raise HTTPException(400, "Unknown medical program")
    with db() as c:
        existing = c.execute(
            "SELECT id FROM program_accounts WHERE user_id=? AND program_key=? AND status NOT IN ('cancelled','completed')",
            (user["id"], key),
        ).fetchone()
        if existing:
            raise HTTPException(409, "This program is already open")
        program = PROGRAMS[key]
        # Reward capacity grows only when an actual staking deposit is approved.
        cap = 0.0
        status = "consultation" if program.get("consultation_only") else "funding"
        cur = c.execute("""
            INSERT INTO program_accounts(user_id,program_key,reward_cap,status,created_at,updated_at)
            VALUES(?,?,?,?,?,?)
        """, (user["id"], key, cap, status, utcnow(), utcnow()))
        return {"ok": True, "account_id": cur.lastrowid, "status": status}

@app.post("/api/deposits")
def request_deposit(data: DepositIn, user=Depends(user_auth)):
    with db() as c:
        acc = c.execute("SELECT * FROM program_accounts WHERE id=? AND user_id=?", (data.account_id, user["id"])).fetchone()
        if not acc:
            raise HTTPException(404, "Program account not found")
        try:
            c.execute("""
                INSERT INTO deposits(user_id,account_id,amount,tx_hash,created_at)
                VALUES(?,?,?,?,?)
            """, (user["id"], data.account_id, data.amount, data.tx_hash.strip(), utcnow()))
        except sqlite3.IntegrityError:
            raise HTTPException(409, "Transaction hash already submitted")
    return {"ok": True, "status": "pending", "wallet": PLATFORM_WALLET}

@app.get("/api/me")
def me(user=Depends(user_auth)):
    with db() as c:
        accounts = []
        for row in c.execute("SELECT * FROM program_accounts WHERE user_id=? ORDER BY id DESC", (user["id"],)).fetchall():
            item = dict(row)
            p = PROGRAMS[item["program_key"]]
            funded = float(item["cash_funded"]) + float(item["medical_credit"])
            target = float(p["price"])
            consultation_only = bool(p.get("consultation_only"))
            progress = 0 if target <= 0 else round(min(100, funded / target * 100), 2)
            item.update(
                program_name=p["name"], target=target, cost=p["cost"],
                consultation_only=consultation_only,
                total_funded=round(funded, 8), progress=progress,
                treatment_available=(
                    not consultation_only
                    and kst_now().date().isoformat() >= TREATMENT_START
                    and funded >= target
                ),
            )
            accounts.append(item)
        sums = c.execute("""
            SELECT COALESCE(SUM(usdt_amount),0) usdt,
                   COALESCE(SUM(mhj_coin_amount),0) mhj,
                   COALESCE(SUM(medical_credit_amount),0) medical,
                   COALESCE(SUM(gross_equiv),0) gross
            FROM rewards WHERE beneficiary_user_id=?
        """, (user["id"],)).fetchone()
        reserved = c.execute("""
            SELECT COALESCE(SUM(amount),0) amount FROM withdrawals
            WHERE user_id=? AND status IN ('pending','approved','completed')
        """, (user["id"],)).fetchone()["amount"]
        balances = dict(sums)
        balances["withdraw_reserved"] = float(reserved)
        balances["withdrawable"] = max(0.0, float(balances["usdt"]) - float(reserved))
        return {
            "id": user["id"], "name": user["name"], "email": user["email"],
            "wallet": user["wallet"] or "",
            "platform_deposit_wallet": PLATFORM_WALLET,
            "referral_code": user["referral_code"],
            "active_directs": active_direct_count(c, user["id"]),
            "referral_eligible": active_direct_count(c, user["id"]) >= DIRECT_REQUIRED,
            "balances": balances,
            "accounts": accounts,
            "treatment_start": TREATMENT_START,
        }


@app.get("/api/rewards")
def member_rewards(user=Depends(user_auth)):
    with db() as c:
        rows = c.execute("""
            SELECT id,account_id,reward_date,reward_type,level,gross_equiv,usdt_amount,
                   mhj_coin_amount,medical_credit_amount,created_at
            FROM rewards
            WHERE beneficiary_user_id=?
            ORDER BY id DESC LIMIT 300
        """, (user["id"],)).fetchall()
        totals = c.execute("""
            SELECT
              COALESCE(SUM(CASE WHEN reward_type='daily_reward' THEN gross_equiv ELSE 0 END),0) daily,
              COALESCE(SUM(CASE WHEN reward_type='one_time_referral' THEN gross_equiv ELSE 0 END),0) referral,
              COALESCE(SUM(CASE WHEN reward_type='daily_team_bonus' THEN gross_equiv ELSE 0 END),0) team,
              COALESCE(SUM(usdt_amount),0) usdt,
              COALESCE(SUM(mhj_coin_amount),0) mhj,
              COALESCE(SUM(medical_credit_amount),0) medical,
              COALESCE(SUM(gross_equiv),0) gross
            FROM rewards WHERE beneficiary_user_id=?
        """, (user["id"],)).fetchone()
        by_level = {}
        for level in (1,2,3):
            row = c.execute("""
                SELECT
                  COALESCE(SUM(CASE WHEN reward_type='one_time_referral' THEN gross_equiv ELSE 0 END),0) referral,
                  COALESCE(SUM(CASE WHEN reward_type='daily_team_bonus' THEN gross_equiv ELSE 0 END),0) team,
                  COALESCE(SUM(usdt_amount),0) usdt,
                  COALESCE(SUM(mhj_coin_amount),0) mhj
                FROM rewards
                WHERE beneficiary_user_id=? AND level=?
            """, (user["id"], level)).fetchone()
            by_level[str(level)] = dict(row)
        return {
            "totals": dict(totals),
            "by_level": by_level,
            "remaining_cap": remaining_cap(c, user["id"]),
            "items": [dict(r) for r in rows],
        }

@app.get("/api/referrals")
def member_referrals(user=Depends(user_auth)):
    with db() as c:
        levels = {}
        for level in (1, 2, 3):
            rows = c.execute(f"""
                SELECT id,name,email,referral_code,created_at
                FROM users WHERE ref{level}=?
                ORDER BY id DESC
            """, (user["id"],)).fetchall()
            levels[str(level)] = [dict(r) for r in rows]
        return {
            "referral_code": user["referral_code"],
            "active_directs": active_direct_count(c, user["id"]),
            "required_directs": DIRECT_REQUIRED,
            "eligible": active_direct_count(c, user["id"]) >= DIRECT_REQUIRED,
            "rates": {"1": REF_RATES[1], "2": REF_RATES[2], "3": REF_RATES[3]},
            "levels": levels,
        }

@app.post("/api/treatments")
def request_treatment(data: TreatmentIn, user=Depends(user_auth)):
    today = kst_now().date().isoformat()
    if today < TREATMENT_START:
        raise HTTPException(400, f"Treatment requests open on {TREATMENT_START}")
    with db() as c:
        acc = c.execute("SELECT * FROM program_accounts WHERE id=? AND user_id=?", (data.account_id, user["id"])).fetchone()
        if not acc:
            raise HTTPException(404, "Program account not found")
        target = PROGRAMS[acc["program_key"]]["price"]
        if float(acc["cash_funded"]) + float(acc["medical_credit"]) < target:
            raise HTTPException(400, "Program target has not been reached")
        if acc["treatment_status"] not in ("not_requested", "cancelled"):
            raise HTTPException(409, "Treatment already requested")
        c.execute("""INSERT INTO treatments(user_id,account_id,requested_date,desired_date,hospital,status,note,created_at)
                     VALUES(?,?,?,?,?,?,?,?)""",
                  (user["id"], data.account_id, today, data.desired_date, data.hospital, "consultation", data.note, utcnow()))
        c.execute("UPDATE program_accounts SET treatment_status='consultation',status='treatment_locked',updated_at=? WHERE id=?",
                  (utcnow(), data.account_id))
    return {"ok": True, "status": "consultation"}


@app.get("/api/wallet")
def get_wallet(user=Depends(user_auth)):
    with db() as c:
        earned = float(c.execute(
            "SELECT COALESCE(SUM(usdt_amount),0) amount FROM rewards WHERE beneficiary_user_id=?",
            (user["id"],)
        ).fetchone()["amount"])
        reserved = float(c.execute("""
            SELECT COALESCE(SUM(amount),0) amount FROM withdrawals
            WHERE user_id=? AND status IN ('pending','approved','completed')
        """, (user["id"],)).fetchone()["amount"])
        history = [dict(r) for r in c.execute("""
            SELECT id,amount,wallet,txid,status,created_at,completed_at
            FROM withdrawals WHERE user_id=? ORDER BY id DESC LIMIT 100
        """, (user["id"],)).fetchall()]
        return {
            "wallet": user["wallet"] or "",
            "deposit_wallet": PLATFORM_WALLET,
            "earned_usdt": earned,
            "reserved_usdt": reserved,
            "withdrawable_usdt": max(0.0, earned-reserved),
            "minimum_withdrawal_usdt": MIN_WITHDRAWAL_USDT,
            "history": history,
        }

@app.put("/api/wallet")
def save_wallet(data: WalletIn, user=Depends(user_auth)):
    wallet = data.wallet.strip()
    with db() as c:
        c.execute("UPDATE users SET wallet=? WHERE id=?", (wallet, user["id"]))
        c.execute("""
            INSERT INTO ledger(user_id,entry_type,amount,asset,reference,created_at)
            VALUES(?,?,?,?,?,?)
        """, (user["id"], "wallet_updated", 0, "USDT", wallet, utcnow()))
    return {"ok": True, "wallet": wallet}

@app.post("/api/withdrawals")
def request_withdrawal(data: WithdrawalIn, user=Depends(user_auth)):
    if float(data.amount) < MIN_WITHDRAWAL_USDT:
        raise HTTPException(400, f"Minimum withdrawal is {MIN_WITHDRAWAL_USDT:.0f} USDT")
    with db() as c:
        available = c.execute("""
            SELECT COALESCE(SUM(usdt_amount),0) amount
            FROM rewards WHERE beneficiary_user_id=?
        """, (user["id"],)).fetchone()["amount"]
        already = c.execute("""
            SELECT COALESCE(SUM(amount),0) amount
            FROM withdrawals WHERE user_id=? AND status IN ('pending','approved','completed')
        """, (user["id"],)).fetchone()["amount"]
        remaining = float(available) - float(already)
        if data.amount > remaining:
            raise HTTPException(400, f"Insufficient withdrawable balance. Available: {remaining:.8f} USDT")
        clean_wallet = data.wallet.strip()
        c.execute("UPDATE users SET wallet=? WHERE id=?", (clean_wallet, user["id"]))
        cur = c.execute("""
            INSERT INTO withdrawals(user_id,amount,wallet,status,created_at)
            VALUES(?,?,?,?,?)
        """, (user["id"], data.amount, clean_wallet, "pending", utcnow()))
        c.execute("""
            INSERT INTO ledger(user_id,entry_type,amount,asset,reference,created_at)
            VALUES(?,?,?,?,?,?)
        """, (user["id"], "withdrawal_requested", -data.amount, "USDT", f"withdrawal:{cur.lastrowid}", utcnow()))
    return {"ok": True, "status": "pending"}

@app.get("/api/admin/withdrawals")
def admin_withdrawals(admin=Depends(admin_auth)):
    with db() as c:
        return [dict(r) for r in c.execute("""
            SELECT w.*,u.email,u.name
            FROM withdrawals w JOIN users u ON u.id=w.user_id
            ORDER BY w.id DESC
        """).fetchall()]

@app.post("/api/admin/withdrawals/{withdrawal_id}/status")
def admin_withdrawal_status(withdrawal_id: int, data: AdminStatusIn, admin=Depends(admin_auth)):
    allowed = {"pending","approved","rejected","completed"}
    status = data.status.lower()
    if status not in allowed:
        raise HTTPException(400, "Invalid withdrawal status")
    with db() as c:
        row = c.execute("SELECT * FROM withdrawals WHERE id=?", (withdrawal_id,)).fetchone()
        if not row:
            raise HTTPException(404, "Withdrawal not found")
        completed_at = utcnow() if status in ("rejected","completed") else None
        c.execute("UPDATE withdrawals SET status=?,txid=?,completed_at=? WHERE id=?",
                  (status, data.txid, completed_at, withdrawal_id))
        log(c, admin["id"], "withdrawal_status", f"withdrawal:{withdrawal_id}", data.note or status)
    return {"ok": True, "status": status}

@app.get("/api/admin/treatments")
def admin_treatments(admin=Depends(admin_auth)):
    with db() as c:
        return [dict(r) for r in c.execute("""
            SELECT t.*,u.email,u.name,p.program_key
            FROM treatments t
            JOIN users u ON u.id=t.user_id
            JOIN program_accounts p ON p.id=t.account_id
            ORDER BY t.id DESC
        """).fetchall()]

@app.post("/api/admin/treatments/{treatment_id}/status")
def admin_treatment_status(treatment_id: int, data: AdminStatusIn, admin=Depends(admin_auth)):
    allowed = {"consultation","scheduled","completed","cancelled"}
    status = data.status.lower()
    if status not in allowed:
        raise HTTPException(400, "Invalid treatment status")
    with db() as c:
        row = c.execute("SELECT * FROM treatments WHERE id=?", (treatment_id,)).fetchone()
        if not row:
            raise HTTPException(404, "Treatment not found")
        c.execute("UPDATE treatments SET status=?,note=COALESCE(?,note) WHERE id=?",
                  (status, data.note, treatment_id))
        c.execute("UPDATE program_accounts SET treatment_status=?,updated_at=? WHERE id=?",
                  (status, utcnow(), row["account_id"]))
        log(c, admin["id"], "treatment_status", f"treatment:{treatment_id}", data.note or status)
    return {"ok": True, "status": status}

@app.get("/api/admin/ledger")
def admin_ledger(admin=Depends(admin_auth)):
    with db() as c:
        return [dict(r) for r in c.execute("""
            SELECT l.*,u.email,u.name
            FROM ledger l LEFT JOIN users u ON u.id=l.user_id
            ORDER BY l.id DESC LIMIT 500
        """).fetchall()]

@app.get("/api/admin/settlements")
def admin_settlements(admin=Depends(admin_auth)):
    with db() as c:
        return [dict(r) for r in c.execute("""
            SELECT * FROM settlements ORDER BY settlement_date DESC LIMIT 365
        """).fetchall()]


@app.get("/api/admin/dashboard")
def admin_dashboard(admin=Depends(admin_auth)):
    today = kst_now().date().isoformat()
    with db() as c:
        return {
            "date": today,
            "pending_deposits": c.execute("SELECT COUNT(*) n FROM deposits WHERE status='pending'").fetchone()["n"],
            "today_approved": c.execute("SELECT COALESCE(SUM(amount),0) x FROM deposits WHERE status='approved' AND substr(approved_at,1,10)=?", (today,)).fetchone()["x"],
            "pending_withdrawals": c.execute("SELECT COUNT(*) n FROM withdrawals WHERE status='pending'").fetchone()["n"],
            "treatments": c.execute("SELECT COUNT(*) n FROM treatments").fetchone()["n"],
            "members": c.execute("SELECT COUNT(*) n FROM users").fetchone()["n"],
            "programs": [{
                "key": key, **value,
                "sold": c.execute("SELECT COUNT(*) n FROM program_accounts WHERE program_key=?", (key,)).fetchone()["n"],
                "cash": c.execute("SELECT COALESCE(SUM(cash_funded),0) x FROM program_accounts WHERE program_key=?", (key,)).fetchone()["x"],
            } for key, value in PROGRAMS.items()]
        }

@app.get("/api/admin/deposits")
def admin_deposits(admin=Depends(admin_auth)):
    with db() as c:
        return [dict(r) for r in c.execute("""
            SELECT d.*,u.email,u.name,p.program_key
            FROM deposits d JOIN users u ON u.id=d.user_id
            JOIN program_accounts p ON p.id=d.account_id
            ORDER BY d.id DESC
        """).fetchall()]

@app.post("/api/admin/deposits/{deposit_id}/approve")
def approve_deposit(deposit_id: int, data: AdminDecisionIn, admin=Depends(admin_auth)):
    with db() as c:
        dep = c.execute("SELECT * FROM deposits WHERE id=?", (deposit_id,)).fetchone()
        if not dep:
            raise HTTPException(404, "Deposit not found")
        if dep["status"] != "pending":
            raise HTTPException(409, "Deposit already processed")
        approved_at = utcnow()
        deposit_cap = round(float(dep["amount"]) * DEPOSIT_REWARD_MULTIPLIER, 8)
        c.execute("""UPDATE deposits
                     SET status='approved', approved_at=?, reward_cap=?, reward_earned=0, staking_status='active'
                     WHERE id=?""", (approved_at, deposit_cap, deposit_id))
        c.execute("""UPDATE program_accounts
                     SET cash_funded=cash_funded+?, reward_cap=reward_cap+?, status='active', updated_at=?
                     WHERE id=?""", (dep["amount"], deposit_cap, approved_at, dep["account_id"]))
        c.execute("INSERT INTO ledger(user_id,account_id,entry_type,amount,asset,reference,created_at) VALUES(?,?,?,?,?,?,?)",
                  (dep["user_id"], dep["account_id"], "deposit_approved", dep["amount"], "USDT", f"deposit:{deposit_id}", utcnow()))
        # One-time referral bonus for this deposit event. Unique constraint prevents duplicates.
        source_user = c.execute("SELECT * FROM users WHERE id=?", (dep["user_id"],)).fetchone()
        for level in (1, 2, 3):
            beneficiary = source_user[f"ref{level}"]
            if not beneficiary or active_direct_count(c, beneficiary) < DIRECT_REQUIRED:
                continue
            target_acc = c.execute("SELECT id FROM program_accounts WHERE user_id=? ORDER BY id LIMIT 1", (beneficiary,)).fetchone()
            if target_acc:
                add_reward(c, beneficiary=beneficiary, account_id=target_acc["id"], source_user=dep["user_id"],
                           source_account=dep["account_id"], date=f"deposit-{deposit_id}", kind="one_time_referral",
                           level=level, gross=float(dep["amount"]) * REF_RATES[level])
        log(c, admin["id"], "deposit_approved", f"deposit:{deposit_id}", data.note or "")
    return {"ok": True}

def run_settlement(c, settlement_date: str):
    if c.execute("SELECT 1 FROM settlements WHERE settlement_date=? AND status='completed'", (settlement_date,)).fetchone():
        raise HTTPException(409, "This KST date has already been settled")
    c.execute("INSERT OR REPLACE INTO settlements(settlement_date,status,created_at) VALUES(?,?,?)",
              (settlement_date, "running", utcnow()))
    processed = 0
    base_total = 0.0
    team_total = 0.0

    # Each approved deposit is an independent staking cycle. Approval day earns nothing;
    # rewards begin the next KST day and stop when that deposit has earned 50% of principal.
    deposits = c.execute("""
        SELECT d.*, p.user_id account_user_id
        FROM deposits d
        JOIN program_accounts p ON p.id=d.account_id
        WHERE d.status='approved' AND d.staking_status='active'
        ORDER BY d.id
    """).fetchall()
    for dep in deposits:
        approved_kst_date = datetime.fromisoformat(dep["approved_at"]).astimezone(KST).date().isoformat()
        if settlement_date <= approved_kst_date:
            continue
        remaining = max(0.0, float(dep["reward_cap"]) - float(dep["reward_earned"]))
        if remaining <= 0:
            c.execute("UPDATE deposits SET staking_status='completed' WHERE id=?", (dep["id"],))
            continue
        gross = min(float(dep["amount"]) * DAILY_RATE, remaining)
        credited = add_reward(
            c, beneficiary=dep["user_id"], account_id=dep["account_id"],
            source_user=dep["user_id"], source_account=dep["id"],
            date=settlement_date, kind="daily_reward", level=0, gross=gross
        )
        if credited <= 0:
            continue
        new_earned = round(float(dep["reward_earned"]) + credited, 8)
        staking_status = "completed" if new_earned + 1e-8 >= float(dep["reward_cap"]) else "active"
        c.execute("UPDATE deposits SET reward_earned=?, staking_status=? WHERE id=?",
                  (new_earned, staking_status, dep["id"]))
        processed += 1
        base_total += credited

        source = c.execute("SELECT * FROM users WHERE id=?", (dep["user_id"],)).fetchone()
        for level in (1, 2, 3):
            beneficiary = source[f"ref{level}"]
            if not beneficiary or active_direct_count(c, beneficiary) < DIRECT_REQUIRED:
                continue
            target_acc = c.execute("SELECT id FROM program_accounts WHERE user_id=? ORDER BY id LIMIT 1", (beneficiary,)).fetchone()
            if not target_acc:
                continue
            paid = add_reward(
                c, beneficiary=beneficiary, account_id=target_acc["id"],
                source_user=dep["user_id"], source_account=dep["id"],
                date=settlement_date, kind="daily_team_bonus", level=level,
                gross=credited * REF_RATES[level]
            )
            team_total += paid

    # Keep the account active while at least one deposit cycle is active.
    account_ids = {d["account_id"] for d in deposits}
    for account_id in account_ids:
        active_count = c.execute("SELECT COUNT(*) n FROM deposits WHERE account_id=? AND status='approved' AND staking_status='active'", (account_id,)).fetchone()["n"]
        if not active_count:
            c.execute("UPDATE program_accounts SET status='cycle_completed',updated_at=? WHERE id=? AND status='active'", (utcnow(), account_id))

    c.execute("""UPDATE settlements SET status='completed',accounts_processed=?,rewards_gross=?,team_gross=?,completed_at=?
                 WHERE settlement_date=?""", (processed, base_total, team_total, utcnow(), settlement_date))
    return {"date": settlement_date, "accounts_processed": processed, "daily_gross": round(base_total, 8), "team_gross": round(team_total, 8)}

@app.post("/api/admin/settlements/run")
def settle(data: SettlementIn, admin=Depends(admin_auth)):
    date = data.settlement_date or (kst_now().date() - timedelta(days=1)).isoformat()
    with db() as c:
        result = run_settlement(c, date)
        log(c, admin["id"], "daily_settlement", date, json.dumps(result))
        return result

@app.get("/api/admin/calendar/{year}/{month}")
def calendar(year: int, month: int, admin=Depends(admin_auth)):
    prefix = f"{year:04d}-{month:02d}"
    with db() as c:
        rows = c.execute("""
            SELECT settlement_date date,rewards_gross,team_gross,status,accounts_processed
            FROM settlements WHERE settlement_date LIKE ? ORDER BY settlement_date
        """, (prefix + "%",)).fetchall()
        deposits = c.execute("""
            SELECT substr(approved_at,1,10) date,SUM(amount) sales
            FROM deposits WHERE status='approved' AND approved_at LIKE ?
            GROUP BY substr(approved_at,1,10)
        """, (prefix + "%",)).fetchall()
        dep_map = {r["date"]: r["sales"] for r in deposits}
        return [{**dict(r), "sales": dep_map.get(r["date"], 0)} for r in rows]


@app.get("/api/admin/members")
def admin_members(admin=Depends(admin_auth)):
    with db() as c:
        rows = c.execute("""
            SELECT u.id,u.name,u.email,u.referral_code,u.wallet,u.status,u.admin_note,u.created_at,
              (SELECT COUNT(*) FROM users d WHERE d.ref1=u.id) direct_count,
              (SELECT COUNT(*) FROM program_accounts p WHERE p.user_id=u.id) program_count,
              (SELECT COALESCE(SUM(p.cash_funded),0) FROM program_accounts p WHERE p.user_id=u.id) funded,
              (SELECT COALESCE(SUM(r.gross_equiv),0) FROM rewards r WHERE r.beneficiary_user_id=u.id) bonus_total,
              (SELECT COALESCE(SUM(r.usdt_amount),0) FROM rewards r WHERE r.beneficiary_user_id=u.id) usdt_total,
              (SELECT COALESCE(SUM(r.mhj_coin_amount),0) FROM rewards r WHERE r.beneficiary_user_id=u.id) mhj_total,
              (SELECT COALESCE(SUM(r.medical_credit_amount),0) FROM rewards r WHERE r.beneficiary_user_id=u.id) medical_total
            FROM users u ORDER BY u.id DESC
        """).fetchall()
        return [dict(r) for r in rows]

@app.get("/api/admin/members/{user_id}")
def admin_member_detail(user_id: int, admin=Depends(admin_auth)):
    with db() as c:
        u = c.execute("SELECT id,name,email,referral_code,wallet,status,admin_note,created_at,ref1,ref2,ref3 FROM users WHERE id=?", (user_id,)).fetchone()
        if not u: raise HTTPException(404, "Member not found")
        accounts=[]
        for row in c.execute("SELECT * FROM program_accounts WHERE user_id=? ORDER BY id DESC", (user_id,)).fetchall():
            item=dict(row); p=PROGRAMS.get(item['program_key'],{})
            item['program_name']=p.get('name',item['program_key']); item['price']=p.get('price',0); item['cost']=p.get('cost',0)
            accounts.append(item)
        rewards=[dict(r) for r in c.execute("SELECT * FROM rewards WHERE beneficiary_user_id=? ORDER BY id DESC LIMIT 200",(user_id,)).fetchall()]
        referrals={}
        for level in (1,2,3):
            referrals[str(level)]=[dict(r) for r in c.execute(f"SELECT id,name,email,status,created_at FROM users WHERE ref{level}=? ORDER BY id DESC",(user_id,)).fetchall()]
        withdrawals=[dict(r) for r in c.execute("SELECT * FROM withdrawals WHERE user_id=? ORDER BY id DESC",(user_id,)).fetchall()]
        deposits=[dict(r) for r in c.execute("SELECT * FROM deposits WHERE user_id=? ORDER BY id DESC",(user_id,)).fetchall()]
        totals=c.execute("""SELECT COALESCE(SUM(gross_equiv),0) gross,COALESCE(SUM(usdt_amount),0) usdt,COALESCE(SUM(mhj_coin_amount),0) mhj,COALESCE(SUM(medical_credit_amount),0) medical FROM rewards WHERE beneficiary_user_id=?""",(user_id,)).fetchone()
        return {'member':dict(u),'totals':dict(totals),'accounts':accounts,'rewards':rewards,'referrals':referrals,'withdrawals':withdrawals,'deposits':deposits}

@app.post("/api/admin/members/{user_id}/status")
def admin_member_status(user_id: int, data: AdminMemberStatusIn, admin=Depends(admin_auth)):
    status=data.status.lower().strip()
    if status not in {'active','suspended'}: raise HTTPException(400,"Invalid member status")
    with db() as c:
        if not c.execute("SELECT 1 FROM users WHERE id=?",(user_id,)).fetchone(): raise HTTPException(404,"Member not found")
        c.execute("UPDATE users SET status=?,admin_note=COALESCE(?,admin_note) WHERE id=?",(status,data.note,user_id))
        log(c,admin['id'],'member_status',f'user:{user_id}',data.note or status)
    return {'ok':True,'status':status}

@app.get("/api/admin/program-accounts")
def admin_program_accounts(admin=Depends(admin_auth)):
    with db() as c:
        rows=c.execute("""SELECT p.*,u.name,u.email,u.status member_status FROM program_accounts p JOIN users u ON u.id=p.user_id ORDER BY p.id DESC""").fetchall()
        result=[]
        for r in rows:
            x=dict(r); meta=PROGRAMS.get(x['program_key'],{}); x['program_name']=meta.get('name',x['program_key']); x['price']=meta.get('price',0); x['cost']=meta.get('cost',0); result.append(x)
        return result

@app.get("/api/admin/rewards")
def admin_rewards(admin=Depends(admin_auth)):
    with db() as c:
        return [dict(r) for r in c.execute("""SELECT r.*,u.name,u.email,s.name source_name,s.email source_email FROM rewards r JOIN users u ON u.id=r.beneficiary_user_id LEFT JOIN users s ON s.id=r.source_user_id ORDER BY r.id DESC LIMIT 1000""").fetchall()]

@app.get("/api/admin/referrals")
def admin_referrals(admin=Depends(admin_auth)):
    with db() as c:
        return [dict(r) for r in c.execute("""
          SELECT u.id,u.name,u.email,u.referral_code,u.status,
            (SELECT COUNT(*) FROM users d WHERE d.ref1=u.id) l1,
            (SELECT COUNT(*) FROM users d WHERE d.ref2=u.id) l2,
            (SELECT COUNT(*) FROM users d WHERE d.ref3=u.id) l3,
            (SELECT COALESCE(SUM(gross_equiv),0) FROM rewards x WHERE x.beneficiary_user_id=u.id AND x.reward_type='one_time_referral') referral_bonus,
            (SELECT COALESCE(SUM(gross_equiv),0) FROM rewards x WHERE x.beneficiary_user_id=u.id AND x.reward_type='daily_team_bonus') team_bonus
          FROM users u ORDER BY u.id DESC
        """).fetchall()]

@app.get("/api/admin/wallets")
def admin_wallets(admin=Depends(admin_auth)):
    with db() as c:
        return [dict(r) for r in c.execute("""
          SELECT u.id,u.name,u.email,u.wallet,u.status,
            (SELECT COALESCE(SUM(usdt_amount),0) FROM rewards r WHERE r.beneficiary_user_id=u.id) earned_usdt,
            (SELECT COALESCE(SUM(mhj_coin_amount),0) FROM rewards r WHERE r.beneficiary_user_id=u.id) mhj_coin,
            (SELECT COALESCE(SUM(medical_credit_amount),0) FROM rewards r WHERE r.beneficiary_user_id=u.id) medical_credit,
            (SELECT COALESCE(SUM(amount),0) FROM withdrawals w WHERE w.user_id=u.id AND w.status IN ('pending','approved','completed')) reserved_usdt
          FROM users u ORDER BY u.id DESC
        """).fetchall()]

@app.get("/api/admin/export.xlsx")
def export_excel(admin=Depends(admin_auth)):
    with db() as c:
        wb = Workbook()
        ws = wb.active
        ws.title = "Daily Settlements"
        ws.append(["Date", "Status", "Accounts", "Daily Gross", "Team Gross", "Completed"])
        for r in c.execute("SELECT * FROM settlements ORDER BY settlement_date DESC"):
            ws.append([r["settlement_date"], r["status"], r["accounts_processed"], r["rewards_gross"], r["team_gross"], r["completed_at"]])
        for title, query in [
            ("Members", "SELECT id,name,email,referral_code,wallet,status,created_at FROM users ORDER BY id DESC"),
            ("Deposits", "SELECT d.*,u.email FROM deposits d JOIN users u ON u.id=d.user_id ORDER BY d.id DESC"),
            ("Rewards", "SELECT * FROM rewards ORDER BY id DESC"),
            ("Treatments", "SELECT t.*,u.email FROM treatments t JOIN users u ON u.id=t.user_id ORDER BY t.id DESC"),
            ("Ledger", "SELECT * FROM ledger ORDER BY id DESC"),
        ]:
            sheet = wb.create_sheet(title)
            rows = c.execute(query).fetchall()
            if rows:
                sheet.append(rows[0].keys())
                for r in rows:
                    sheet.append(list(r))
        import io
        stream = io.BytesIO()
        wb.save(stream)
        stream.seek(0)
        return StreamingResponse(
            stream,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": 'attachment; filename="MHJ_ERP_Export.xlsx"'},
        )

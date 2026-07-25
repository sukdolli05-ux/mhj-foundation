import tokenMark from "./assets/mhj-token-mark.svg";

import { useEffect, useMemo, useState } from "react";
import "./styles.css";

const API = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

function Logo({ compact=false }) {
  return <div className={`brand ${compact ? "compact":""}`}>
    <img className="brand-mark-image" src={tokenMark} alt="MHJ token mark"/>
    <div><strong>MHJ FOUNDATION</strong><small>MEDICAL HUB JAPAN</small></div>
  </div>
}

function getErrorMessage(body, status) {
  if (Array.isArray(body?.detail)) {
    return body.detail.map(item => {
      const field = Array.isArray(item.loc) ? item.loc[item.loc.length - 1] : "field";
      return `${field}: ${item.msg}`;
    }).join(" · ");
  }
  return body?.detail || body?.message || `Request failed (${status})`;
}

async function call(path, options={}) {
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: {"Content-Type":"application/json", ...(options.headers||{})}
  });

  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(getErrorMessage(body, response.status));
    error.status = response.status;
    error.body = body;
    throw error;
  }

  return body;
}

function Auth({admin=false, onDone}) {
  const [form,setForm]=useState({email:admin?"admin@mhjfoundation.com":"",password:""});
  const [mode,setMode]=useState("login");
  const [name,setName]=useState("");
  const [referrer,setReferrer]=useState(()=>{
    const params=new URLSearchParams(window.location.search);
    return params.get("ref")||params.get("referrer")||"";
  });
  const [message,setMessage]=useState("");
  const [busy,setBusy]=useState(false);

  const submit=async e=>{
    e.preventDefault();
    if (busy) return;
    setMessage("");

    try {
      setBusy(true);

      if (!admin && mode==="signup") {
        const payload = {
          email: form.email.trim().toLowerCase(),
          name: name.trim(),
          password: form.password,
          referrer: referrer.trim() || null
        };

        if (!payload.name) throw new Error("이름을 입력해 주세요.");
        if (payload.password.length < 8) throw new Error("비밀번호는 8자 이상이어야 합니다.");

        await call("/api/auth/signup",{
          method:"POST",
          body:JSON.stringify(payload)
        });

        setMode("login");
        setForm({...form,password:""});
        setMessage("회원가입 완료! 방금 만든 계정으로 로그인해 주세요.");
        return;
      }

      const data=await call(
        admin?"/api/admin/auth/login":"/api/auth/login",
        {
          method:"POST",
          body:JSON.stringify({
            email:form.email.trim().toLowerCase(),
            password:form.password
          })
        }
      );

      localStorage.setItem(admin?"mhj_admin_token":"mhj_user_token",data.token);
      onDone();
    } catch(err) {
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  };

  return <div className="auth-shell">
    <section className="auth-visual">
      <Logo/>
      <div>
        <p className="eyebrow">HEALTHCARE • WEB3 • ERP</p>
        <h1>Powering the Future of <em>Global Healthcare.</em></h1>
        <p>Medical program funding, automated daily settlement, Medical Credit and treatment operations in one platform.</p>
      </div>
      <small>© 2026 MHJ Foundation · v13.5</small>
    </section>

    <section className="auth-card">
      <div className="mobile-logo"><Logo/></div>
      <p className="eyebrow">{admin?"SECURE ADMINISTRATOR":"MEMBER PORTAL"}</p>
      <h2>{admin?"Administrator login":mode==="login"?"Welcome back":"Create member account"}</h2>

      {!admin && <div className="tabs">
        <button type="button" className={mode==="login"?"active":""} onClick={()=>{setMode("login");setMessage("")}}>Sign in</button>
        <button type="button" className={mode==="signup"?"active":""} onClick={()=>{setMode("signup");setMessage("")}}>Sign up</button>
      </div>}

      <form onSubmit={submit}>
        {!admin && mode==="signup" && <>
          <label>Full name
            <input
              value={name}
              onChange={e=>setName(e.target.value)}
              minLength={1}
              maxLength={80}
              autoComplete="name"
              required
            />
          </label>
          <label>Referral code
            <input
              value={referrer}
              onChange={e=>setReferrer(e.target.value)}
              placeholder="Optional — e.g. MHJ-000001"
            />
          </label>
        </>}

        <label>Email
          <input
            type="email"
            value={form.email}
            onChange={e=>setForm({...form,email:e.target.value})}
            autoComplete="email"
            required
          />
        </label>

        <label>Password
          <input
            type="password"
            value={form.password}
            onChange={e=>setForm({...form,password:e.target.value})}
            minLength={8}
            maxLength={128}
            autoComplete={mode==="signup"?"new-password":"current-password"}
            placeholder={mode==="signup"?"Minimum 8 characters":""}
            required
          />
        </label>

        {!admin && mode==="signup" && <small className="form-help">비밀번호는 반드시 8자 이상 입력해 주세요.</small>}
        {message && <div className="message">{message}</div>}

        <button className="primary" type="submit" disabled={busy}>
          {busy?"Please wait...":admin?"Enter ERP":mode==="login"?"Sign in":"Create account"}
        </button>
      </form>
    </section>
  </div>
}


const COPY = {
  ko: {
    lang:"한국어", overview:"대시보드", programs:"프로그램", medical:"메디컬 크레딧",
    treatments:"치료", rewards:"보상", referral:"추천", wallet:"지갑", signout:"로그아웃",
    member:"회원 대시보드", intro:"프로그램 소개", details:"자세히 보기",
    open:"프로그램 신청", consult:"상담 신청", deposit:"USDT 입금 신청",
    daily:"일일 보상", referralBonus:"추천 보너스", teamBonus:"팀 보너스",
    usdt:"출금 가능 USDT", mhj:"MHJ Coin", credit:"Medical Credit",
    stakingTitle:"프로그램 스테이킹", stakingNotice:"프로그램 결제 승인 후 스테이킹이 활성화되며 적립 내역은 매일 업데이트됩니다.",
    price:"참여 금액", accumulated:"누적 적립", todayAccrued:"오늘 적립", dailyHistory:"일별 적립 현황", activeStaking:"스테이킹 활성", pendingStaking:"입금 승인 대기",
    referralPolicy:"직추천 활성 회원 2명 달성 후 L1 5% · L2 3% · L3 2%", referralLink:"추천 주소", copy:"복사", copied:"복사 완료", myWallet:"내 출금 지갑", depositWallet:"입금 지갑", requestWithdrawal:"출금 신청", saveWallet:"지갑 저장", walletHistory:"출금 내역",
    noData:"표시할 내역이 없습니다.", funding:"프로그램 진행 현황",
    disclaimer:"본 정보는 일반적인 프로그램 안내이며 의학적 진단이나 치료 효과를 보장하지 않습니다. 실제 적용 여부는 의료진 상담과 현지 규정에 따라 결정됩니다.",
  },
  en: {
    lang:"English", overview:"Dashboard", programs:"Programs", medical:"Medical Credit",
    treatments:"Treatments", rewards:"Rewards", referral:"Referral", wallet:"Wallet", signout:"Sign out",
    member:"Member Dashboard", intro:"Program Introduction", details:"Learn more",
    open:"Apply for Program", consult:"Request Consultation", deposit:"Add USDT Deposit",
    daily:"Daily Rewards", referralBonus:"Referral Bonus", teamBonus:"Team Bonus",
    usdt:"Withdrawable USDT", mhj:"MHJ Coin", credit:"Medical Credit",
    stakingTitle:"Program Staking", stakingNotice:"Staking is activated after the program payment is approved, and accrual records are updated daily.",
    price:"Participation Amount", accumulated:"Accumulated", todayAccrued:"Accrued Today", dailyHistory:"Daily Accrual", activeStaking:"Staking Active", pendingStaking:"Awaiting Deposit Approval",
    referralPolicy:"Unlocked after 2 active direct referrals · L1 5% · L2 3% · L3 2%", referralLink:"Referral link", copy:"Copy", copied:"Copied", myWallet:"My withdrawal wallet", depositWallet:"Deposit wallet", requestWithdrawal:"Request withdrawal", saveWallet:"Save wallet", walletHistory:"Withdrawal history",
    noData:"No records to display.", funding:"Program Progress",
    disclaimer:"This information is for general program guidance only and does not guarantee diagnosis or treatment outcomes. Eligibility is determined through professional consultation and applicable local regulations.",
  },
  ja: {
    lang:"日本語", overview:"ダッシュボード", programs:"プログラム", medical:"メディカルクレジット",
    treatments:"治療", rewards:"報酬", referral:"紹介", wallet:"ウォレット", signout:"ログアウト",
    member:"会員ダッシュボード", intro:"プログラム紹介", details:"詳しく見る",
    open:"プログラム申請", consult:"相談を申し込む", deposit:"USDT入金申請",
    daily:"デイリー報酬", referralBonus:"紹介ボーナス", teamBonus:"チームボーナス",
    usdt:"出金可能USDT", mhj:"MHJ Coin", credit:"Medical Credit",
    stakingTitle:"プログラムステーキング", stakingNotice:"プログラム決済の承認後にステーキングが有効化され、積立履歴は毎日更新されます。",
    price:"参加金額", accumulated:"累積積立", todayAccrued:"本日の積立", dailyHistory:"日別積立状況", activeStaking:"ステーキング有効", pendingStaking:"入金承認待ち",
    referralPolicy:"有効な直接紹介2名で解除・L1 5%・L2 3%・L3 2%", referralLink:"紹介リンク", copy:"コピー", copied:"コピー完了", myWallet:"出金ウォレット", depositWallet:"入金ウォレット", requestWithdrawal:"出金申請", saveWallet:"ウォレット保存", walletHistory:"出金履歴",
    noData:"表示する履歴がありません。", funding:"プログラム進捗",
    disclaimer:"本情報は一般的なプログラム案内であり、診断や治療効果を保証するものではありません。適用可否は医療専門家との相談および各地域の規制に基づいて判断されます。",
  },
  zh: {
    lang:"简体中文", overview:"仪表板", programs:"项目", medical:"医疗积分",
    treatments:"治疗", rewards:"奖励", referral:"推荐", wallet:"钱包", signout:"退出登录",
    member:"会员仪表板", intro:"项目介绍", details:"了解更多",
    open:"申请项目", consult:"申请咨询", deposit:"提交USDT入金",
    daily:"每日奖励", referralBonus:"推荐奖励", teamBonus:"团队奖励",
    usdt:"可提现USDT", mhj:"MHJ Coin", credit:"Medical Credit",
    stakingTitle:"项目质押", stakingNotice:"项目付款获批后质押将被激活，累积记录每日更新。",
    price:"参与金额", accumulated:"累计收益", todayAccrued:"今日累计", dailyHistory:"每日累计记录", activeStaking:"质押已激活", pendingStaking:"等待入金审核",
    referralPolicy:"2名有效直推后解锁 · L1 5% · L2 3% · L3 2%", referralLink:"推荐链接", copy:"复制", copied:"已复制", myWallet:"提现钱包", depositWallet:"入金钱包", requestWithdrawal:"申请提现", saveWallet:"保存钱包", walletHistory:"提现记录",
    noData:"暂无记录。", funding:"项目进度",
    disclaimer:"本信息仅用于一般项目介绍，不构成医疗诊断或疗效保证。是否适用需经专业医疗咨询并遵守当地法规。",
  }
};

const PROGRAM_COPY = {
  exvar:{
    title:{ko:"ExVAR 세포 체외 활성화 재융합 셀테라피",en:"ExVAR Ex Vivo Activation & Reinfusion Cell Therapy",ja:"ExVAR 体外細胞活性化・再注入療法",zh:"ExVAR 细胞体外激活回输疗法"},
    tag:{ko:"내 몸속 혈액 세포의 기능을 재부팅하다",en:"Rebooting the functional state of your blood cells",ja:"体内の血液細胞機能を再起動",zh:"重启体内血液细胞的功能状态"},
    summary:{ko:"소량 채혈 후 최소 조작으로 NK세포 등을 단기간 활성화하는 정밀 셀테라피 프로그램입니다.",en:"A precision cell-therapy program designed to activate immune cells, including NK cells, after a small blood draw and minimal manipulation.",ja:"少量採血と最小限の操作により、NK細胞などの免疫細胞を短期間で活性化する精密細胞療法です。",zh:"通过少量采血和最低限度处理，在短期内激活包括NK细胞在内的免疫细胞。"},
    points:{ko:["NK세포 활성","줄기세포 호밍","사이토카인 신호"],en:["NK-cell activation","Stem-cell homing","Cytokine signaling"],ja:["NK細胞活性","幹細胞ホーミング","サイトカインシグナル"],zh:["NK细胞激活","干细胞归巢","细胞因子信号"]}
  },
  nkcell:{
    title:{ko:"NK Cell Therapy",en:"NK Cell Therapy",ja:"NK細胞療法",zh:"NK细胞疗法"},
    tag:{ko:"내 몸의 최전방 수비대",en:"The frontline defense of innate immunity",ja:"自然免疫の最前線",zh:"先天免疫的前线防御"},
    summary:{ko:"비정상 세포를 스스로 인지하고 공격하는 NK세포의 활성도를 높이는 면역 프로그램입니다.",en:"An immune program focused on enhancing NK-cell activity to recognize and respond to abnormal cells.",ja:"異常細胞を認識し対応するNK細胞の活性向上を目的とした免疫プログラムです。",zh:"旨在增强NK细胞活性，使其识别并应对异常细胞的免疫项目。"},
    points:{ko:["비정상 세포 대응","면역 항상성","전신 활력"],en:["Abnormal-cell response","Immune homeostasis","Systemic vitality"],ja:["異常細胞への対応","免疫恒常性","全身活力"],zh:["异常细胞应对","免疫稳态","全身活力"]}
  },
  stcell:{
    title:{ko:"양막유래 중간엽 줄기세포",en:"Amniotic Membrane-Derived Mesenchymal Stem Cells",ja:"羊膜由来間葉系幹細胞",zh:"羊膜来源间充质干细胞"},
    tag:{ko:"재생의학의 차세대 하이브리드 세포",en:"A next-generation regenerative medicine platform",ja:"次世代の再生医療プラットフォーム",zh:"新一代再生医学平台"},
    summary:{ko:"분만 후 양막에서 분리한 세포를 활용하며, 파라크린 신호와 재생 가능성에 초점을 둔 프로그램입니다.",en:"A program using cells isolated from post-delivery amniotic membrane, with emphasis on paracrine signaling and regenerative potential.",ja:"出産後の羊膜由来細胞を活用し、パラクラインシグナルと再生可能性に重点を置きます。",zh:"采用分娩后羊膜来源细胞，重点关注旁分泌信号和再生潜力。"},
    points:{ko:["윤리적 조직 활용","낮은 면역원성","파라크린 효과"],en:["Ethical tissue source","Low immunogenicity","Paracrine effect"],ja:["倫理的な組織利用","低免疫原性","パラクライン効果"],zh:["伦理组织来源","低免疫原性","旁分泌效应"]}
  },
  rknk100:{
    title:{ko:"RKNK-100 항노화 솔루션",en:"RKNK-100 Anti-Aging Solution",ja:"RKNK-100 アンチエイジングソリューション",zh:"RKNK-100 抗衰老解决方案"},
    tag:{ko:"사이토카인 사이언스와 3단계 레이어링",en:"Cytokine science with three-layer delivery",ja:"サイトカイン科学と3段階レイヤリング",zh:"细胞因子科学与三层导入"},
    summary:{ko:"NK세포 배양액 유래 사이토카인 복합체와 마이크로 도트 초음파 디바이스를 결합한 피부 관리 프로그램입니다.",en:"A skin-care program combining an NK-cell-culture-derived cytokine complex with a micro-dot ultrasound delivery device.",ja:"NK細胞培養液由来サイトカイン複合体とマイクロドット超音波デバイスを組み合わせたスキンケアプログラムです。",zh:"结合NK细胞培养液来源细胞因子复合物与微点超声导入设备的皮肤管理项目。"},
    points:{ko:["4.5T SMAS","3.0T 진피 하부","1.5T 진피 상부"],en:["4.5T SMAS layer","3.0T lower dermis","1.5T upper dermis"],ja:["4.5T SMAS層","3.0T 真皮下層","1.5T 真皮上層"],zh:["4.5T SMAS层","3.0T 真皮下层","1.5T 真皮上层"]}
  }
};

function Member({onLogout}) {
  const [tab,setTab]=useState("overview");
  const [lang,setLang]=useState(localStorage.getItem("mhj_lang")||"ko");
  const [detail,setDetail]=useState(null);
  const [me,setMe]=useState(null);
  const [programs,setPrograms]=useState([]);
  const [rewardData,setRewardData]=useState({totals:{},items:[]});
  const [refData,setRefData]=useState({levels:{"1":[],"2":[],"3":[]}});
  const [walletData,setWalletData]=useState({history:[]});
  const [notice,setNotice]=useState("");
  const [loading,setLoading]=useState(true);
  const [selectedMember,setSelectedMember]=useState(null);
  const [search,setSearch]=useState("");
  const [accrualRange,setAccrualRange]=useState("7");
  const token=localStorage.getItem("mhj_user_token");
  const t=COPY[lang];

  const headers={Authorization:`Bearer ${token}`};
  const refresh=async()=>{
    try{
      setLoading(true);
      const [m,p,r,f,w]=await Promise.all([
        call("/api/me",{headers}),call("/api/programs"),
        call("/api/rewards",{headers}),call("/api/referrals",{headers}),
        call("/api/wallet",{headers})
      ]);
      setMe(m);setPrograms(p);setRewardData(r);setRefData(f);setWalletData(w);
    }catch(e){
      if(e.status===401||e.status===403){localStorage.removeItem("mhj_user_token");onLogout();return;}
      setNotice(e.message);
    }finally{setLoading(false);}
  };
  useEffect(()=>{refresh()},[]);

  const changeLang=v=>{setLang(v);localStorage.setItem("mhj_lang",v)};
  const referralUrl=`${window.location.origin}${window.location.pathname}?ref=${encodeURIComponent(me?.referral_code||"")}`;
  const copyText=async(text,label=t.copied)=>{
    try{
      if(navigator.clipboard&&window.isSecureContext){await navigator.clipboard.writeText(text);}
      else{
        const area=document.createElement("textarea");area.value=text;area.style.position="fixed";area.style.opacity="0";document.body.appendChild(area);area.focus();area.select();document.execCommand("copy");area.remove();
      }
      setNotice(`${label} ✓`);
    }catch(e){setNotice("Copy failed: "+e.message);}
  };
  const create=async key=>{
    try{
      const result=await call("/api/program-accounts",{method:"POST",headers,body:JSON.stringify({program_key:key})});
      setNotice(result.status==="consultation" ? t.consult+" ✓" : t.open+" ✓");
      setDetail(null);await refresh();
    }catch(e){setNotice(e.message);}
  };
  const deposit=async id=>{
    const amount=prompt("USDT amount"); if(!amount)return;
    const tx=prompt("Transaction hash"); if(!tx)return;
    try{await call("/api/deposits",{method:"POST",headers,body:JSON.stringify({account_id:id,amount:Number(amount),tx_hash:tx.trim()})});setNotice("Submitted ✓");await refresh();}
    catch(e){setNotice(e.message);}
  };

  const saveWallet=async()=>{
    const wallet=prompt("USDT wallet address",walletData.wallet||"");
    if(!wallet)return;
    try{await call("/api/wallet",{method:"PUT",headers,body:JSON.stringify({wallet:wallet.trim()})});setNotice("Wallet saved ✓");await refresh();}
    catch(e){setNotice(e.message);}
  };
  const withdraw=async()=>{
    const minimum=Number(walletData.minimum_withdrawal_usdt||100);
    const available=Number(walletData.withdrawable_usdt||0);
    if(available<minimum){setNotice(`Minimum withdrawal is ${minimum.toFixed(0)} USDT`);return;}
    const amount=prompt(`Withdrawable: ${available.toFixed(2)} USDT\nMinimum: ${minimum.toFixed(0)} USDT`);
    if(!amount)return;
    if(Number(amount)<minimum){setNotice(`Minimum withdrawal is ${minimum.toFixed(0)} USDT`);return;}
    const wallet=walletData.wallet||prompt("USDT wallet address");
    if(!wallet)return;
    try{await call("/api/withdrawals",{method:"POST",headers,body:JSON.stringify({amount:Number(amount),wallet})});setNotice("Withdrawal requested ✓");await refresh();}
    catch(e){setNotice(e.message);}
  };

  const requestTreatment=async(account)=>{
    if(!account?.treatment_available){setNotice("Treatment goal has not been reached yet.");return;}
    const desiredDate=prompt("Preferred treatment date (YYYY-MM-DD, optional)","");
    if(desiredDate===null)return;
    const hospital=prompt("Preferred hospital (optional)","");
    if(hospital===null)return;
    try{
      await call("/api/treatments",{method:"POST",headers,body:JSON.stringify({account_id:Number(account.id),desired_date:desiredDate.trim()||null,hospital:hospital.trim()||null,note:"Member treatment request"})});
      setNotice("Treatment reservation requested ✓");
      await refresh();
    }catch(e){setNotice(e.message);}
  };

  if(loading)return <div className="loading">Loading MHJ...</div>;
  if(!me)return <div className="loading">Unable to load.</div>;

  const nav=[["overview",t.overview],["programs",t.programs],["wallet",t.wallet],["medical",t.medical],["treatments",t.treatments],["rewards",t.rewards],["referral",t.referral]];
  const fmt=n=>Number(n||0).toFixed(2);
  const money=n=>`${Number(n||0).toLocaleString(undefined,{maximumFractionDigits:2})} USDT`;
  const dailyItems=rewardData.items.filter(r=>r.reward_type==="daily_reward");
  const todayKey=new Date().toLocaleDateString("en-CA",{timeZone:"Asia/Seoul"});
  const todayAccrued=dailyItems.filter(r=>r.reward_date===todayKey).reduce((s,r)=>s+Number(r.gross_equiv||0),0);
  const buildDailySeries=(days)=>Array.from({length:days},(_,offset)=>{
    const d=new Date(); d.setDate(d.getDate()-(days-1-offset));
    const key=d.toLocaleDateString("en-CA",{timeZone:"Asia/Seoul"});
    return {key,date:key.slice(5),value:dailyItems.filter(r=>r.reward_date===key).reduce((s,r)=>s+Number(r.gross_equiv||0),0)};
  });
  const rangeDays=accrualRange==="all"?Math.max(7,Math.min(90,dailyItems.length?Math.ceil((Date.now()-new Date(dailyItems[dailyItems.length-1].reward_date).getTime())/86400000)+1:7)):Number(accrualRange);
  const allDailySeries=buildDailySeries(rangeDays);
  const chartSeries=allDailySeries;
  const dailyMax=Math.max(1,...chartSeries.map(x=>x.value));
  const rangeTotal=allDailySeries.reduce((s,x)=>s+x.value,0);
  const activeAccounts=me.accounts.filter(a=>a.status==="active"||Number(a.total_funded)>=Number(a.target));
  const stakingActive=activeAccounts.length>0;

  const ProgramGrid=()=> <section className="panel program-intro">
    <div className="panel-head"><div><p className="eyebrow">{t.intro}</p><h2>Advanced Regenerative Medicine</h2></div><code>{me.referral_code}</code></div>
    <div className="intro-grid">
      {programs.map((p,i)=>{
        const pc=PROGRAM_COPY[p.key]; const opened=me.accounts.find(a=>a.program_key===p.key);
        return <article className={`intro-card program-${i+1}`} key={p.key}>
          <div className="program-card-top"><div className="program-number">0{i+1}</div><strong className="price-badge">{money(p.price)}</strong></div>
          <small>{p.name}</small><h3>{pc.title[lang]}</h3><em>{pc.tag[lang]}</em>
          <p>{pc.summary[lang]}</p>
          <div className="staking-label"><b>{t.stakingTitle}</b><span>{t.price}: {money(p.price)}</span></div>
          <div className="chips">{pc.points[lang].map(x=><span key={x}>{x}</span>)}</div>
          <div className="card-actions">
            <button className="secondary" onClick={()=>setDetail(p.key)}>{t.details}</button>
            {!opened && <button className="primary" onClick={()=>create(p.key)}>{p.consultation_only?t.consult:t.open}</button>}
          </div>
        </article>
      })}
    </div>
    <p className="medical-disclaimer">{t.disclaimer}</p>
  </section>;

  const Detail=()=>{
    const p=programs.find(x=>x.key===detail), pc=PROGRAM_COPY[detail];
    if(!p||!pc)return null;
    return <section className="panel detail-page">
      <button className="back-link" onClick={()=>setDetail(null)}>← {t.programs}</button>
      <div className="detail-price-row"><p className="eyebrow">{p.name}</p><strong className="detail-price">{money(p.price)}</strong></div><h2>{pc.title[lang]}</h2><h3>{pc.tag[lang]}</h3>
      <p className="lead">{pc.summary[lang]}</p>
      <div className="mechanism-grid">{pc.points[lang].map((x,i)=><article key={x}><b>0{i+1}</b><h4>{x}</h4></article>)}</div>
      <div className="staking-info"><div><b>{t.stakingTitle}</b><p>{t.stakingNotice}</p></div><strong>{t.price}<br/>{money(p.price)}</strong></div>
      {!me.accounts.some(a=>a.program_key===p.key)&&<button className="primary" onClick={()=>create(p.key)}>{p.consultation_only?t.consult:t.open}</button>}
      <p className="medical-disclaimer">{t.disclaimer}</p>
    </section>
  };

  const Progress=()=> <section className="panel"><p className="eyebrow">{t.stakingTitle}</p><h2>{t.funding}</h2>
    <div className="account-grid">{me.accounts.length?me.accounts.map(acc=>{
      const accountDaily=dailyItems.filter(r=>Number(r.account_id)===Number(acc.id));
      const accountToday=accountDaily.filter(r=>r.reward_date===todayKey).reduce((s,r)=>s+Number(r.gross_equiv||0),0);
      const earned=Number(acc.reward_equiv_total||0);
      const visual=Math.max(0,Math.min(100,Number(acc.progress||0)));
      const active=acc.status==="active";
      return <article className="program-card staking-card" key={acc.id}>
        <div className="staking-card-head"><div><small>{acc.program_name}</small><h3>{money(acc.target)}</h3></div><span className={active?"status-pill active":"status-pill"}>{active?t.activeStaking:t.pendingStaking}</span></div>
        <div className="staking-numbers"><div><span>{t.accumulated}</span><strong>{money(earned)}</strong></div><div><span>{t.todayAccrued}</span><strong>{money(accountToday)}</strong></div></div>
        <div className="bar staking-progress"><i style={{width:`${visual}%`}}/></div>
        <div className="funding-line"><span>{fmt(acc.total_funded)} / {fmt(acc.target)} USDT</span><b>{acc.progress}%</b></div>
        <button className="secondary" onClick={()=>deposit(acc.id)}>{t.deposit}</button>
      </article>
    }):<p>{t.noData}</p>}</div>
  </section>;

  const Content=()=>{
    if(tab==="programs")return detail?<Detail/>:<><ProgramGrid/><Progress/></>;
    if(tab==="medical")return <section className="panel"><p className="eyebrow">{t.medical}</p><h2>{t.credit}</h2><div className="stats"><article><span>{t.credit}</span><strong>{fmt(me.balances.medical)}</strong></article><article><span>{t.mhj}</span><strong>{fmt(me.balances.mhj)}</strong></article></div><p className="muted-copy">{t.stakingNotice}</p></section>;
    if(tab==="treatments")return <section className="panel treatment-dashboard"><div className="panel-head"><div><p className="eyebrow">{t.treatments}</p><h2>Treatment Progress</h2><p className="wallet-lead">Staking principal and MHJ Medical Credit build toward each treatment goal.</p></div></div><div className="account-grid">{me.accounts.map(a=>{const funded=Number(a.total_funded||0);const target=Number(a.target||0);const remaining=Math.max(0,target-funded);const available=Boolean(a.treatment_available);return <article className={`program-card treatment-progress-card ${available?"available":""}`} key={a.id}><div className="program-card-top"><div><small>{a.program_name}</small><h3>{available?"Treatment Available":a.treatment_status}</h3></div><span className={`status-pill ${available?"active":""}`}>{available?"READY":`${Number(a.progress||0).toFixed(0)}%`}</span></div><div className="treatment-amount"><strong>{fmt(funded)}</strong><span>/ {fmt(target)} USDT</span></div><div className="bar treatment-bar"><i style={{width:`${Math.min(100,Number(a.progress||0))}%`}}/></div><div className="treatment-split"><span>Staking <b>{fmt(a.cash_funded)} USDT</b></span><span>MHJ Credit <b>{fmt(a.medical_credit)} USDT</b></span></div><p>{available?"Goal reached. Treatment reservation is available.":`${fmt(remaining)} USDT remaining · Open ${me.treatment_start}`}</p>{available&&["not_requested","cancelled"].includes(a.treatment_status)&&<button className="primary treatment-reserve-button" onClick={()=>requestTreatment(a)}>Reserve Treatment</button>}</article>})}</div></section>;
    if(tab==="wallet")return <section className="panel uniform-section wallet-dashboard">
      <div className="panel-head"><div><p className="eyebrow">MHJ DIGITAL ASSET</p><h2>USDT Wallet</h2><p className="wallet-lead">Manage deposits, withdrawals and your registered payout address.</p></div><button className="secondary" onClick={saveWallet}>{t.saveWallet}</button></div>
      <div className="wallet-balance-grid">
        <article className="wallet-balance-card available"><div className="wallet-round-icon">₮</div><span>{t.usdt}</span><strong>{fmt(walletData.withdrawable_usdt)} <small>USDT</small></strong><p>{Number(walletData.withdrawable_usdt||0)>=Number(walletData.minimum_withdrawal_usdt||100)?"Available to request":`Minimum ${Number(walletData.minimum_withdrawal_usdt||100).toFixed(0)} USDT`}</p></article>
        <article className="wallet-balance-card reserved"><div className="wallet-round-icon">◷</div><span>Reserved</span><strong>{fmt(walletData.reserved_usdt)} <small>USDT</small></strong><p>Pending or processed</p></article>
        <article className="wallet-balance-card earned"><div className="wallet-round-icon">◆</div><span>Total Earned</span><strong>{fmt(walletData.earned_usdt)} <small>USDT</small></strong><p>Lifetime reward earnings</p></article>
      </div>
      <div className="wallet-main-grid">
        <article className="wallet-address-panel dark"><div className="wallet-panel-title"><div><span>{t.myWallet}</span><h3>{walletData.wallet?"Wallet Connected":"Wallet Not Registered"}</h3></div><b>TRC20 / Supported Network</b></div><div className="address-line"><code>{walletData.wallet||"Register your USDT wallet address"}</code>{walletData.wallet&&<button onClick={()=>copyText(walletData.wallet)}>{t.copy}</button>}</div><div className="wallet-action-row"><button className="light-action" onClick={saveWallet}>{t.saveWallet}</button><button className="primary" onClick={withdraw} disabled={Number(walletData.withdrawable_usdt||0)<Number(walletData.minimum_withdrawal_usdt||100)}>{t.requestWithdrawal}</button></div></article>
        <article className="wallet-address-panel deposit"><div className="wallet-panel-title"><div><span>{t.depositWallet}</span><h3>MHJ Platform Deposit</h3></div><b>USDT</b></div><div className="address-line"><code>{walletData.deposit_wallet||"Not configured"}</code>{walletData.deposit_wallet&&<button onClick={()=>copyText(walletData.deposit_wallet)}>{t.copy}</button>}</div><p>Send only the supported USDT network. Enter the TX hash from the Programs page after transfer.</p></article>
      </div>
      <section className="wallet-history-panel"><div className="subpanel-head"><h3>{t.walletHistory}</h3><span>{walletData.history?.length||0} records</span></div><div className="wallet-history-table"><div className="wallet-history-row head"><span>Date</span><span>Amount</span><span>Status</span><span>TXID</span></div>{walletData.history?.length?walletData.history.map(w=><div className="wallet-history-row" key={w.id}><span>{w.created_at?.slice(0,10)}</span><b>{fmt(w.amount)} USDT</b><span><i className={`status-dot ${w.status}`}/>{w.status}</span><code>{w.txid||"-"}</code></div>):<p className="empty-accrual">{t.noData}</p>}</div></section>
    </section>;
    if(tab==="rewards")return <section className="panel uniform-section rewards-dashboard">
      <div className="rewards-title-row"><div><p className="eyebrow">{t.stakingTitle}</p><h2>{t.dailyHistory}</h2></div><div className="range-total"><span>Total Accrued ({accrualRange==="all"?"All":`${accrualRange} Days`})</span><strong>{money(rangeTotal)}</strong></div></div>
      <div className="accrual-visual premium-accrual">
        <div className="accrual-summary"><span>{t.todayAccrued}</span><strong>{money(todayAccrued)}</strong><small>{stakingActive?t.stakingNotice:t.pendingStaking}</small><div className={stakingActive?"staking-live active":"staking-live"}><i/> {stakingActive?t.activeStaking:t.pendingStaking}</div></div>
        <div className="chart-panel"><div className="chart-toolbar"><div className="range-tabs"><button className={accrualRange==="7"?"active":""} onClick={()=>setAccrualRange("7")}>7 Days</button><button className={accrualRange==="all"?"active":""} onClick={()=>setAccrualRange("all")}>All</button></div><span>USDT</span></div><div className="daily-bars line-grid">{chartSeries.map((d,i)=><div key={d.key} className={`daily-bar ${i===chartSeries.length-1?"latest":""}`}><div><i style={{height:`${Math.max(3,d.value/dailyMax*100)}%`}}><em>{d.value>0?fmt(d.value):""}</em></i></div><b>{fmt(d.value)}</b><span>{d.date}</span></div>)}</div></div>
      </div>
      <div className="reward-color-grid">
        <article className="reward-color-card bonus"><div className="reward-icon">◆</div><div><span>Total Bonus</span><strong>{fmt(rewardData.totals.gross)} <small>USDT</small></strong></div></article>
        <article className="reward-color-card withdraw"><div className="reward-icon">▣</div><div><span>{t.usdt}</span><strong>{fmt(walletData.withdrawable_usdt)} <small>USDT</small></strong></div></article>
        <article className="reward-color-card coin"><div className="reward-icon">◉</div><div><span>{t.mhj}</span><strong>{fmt(rewardData.totals.mhj)} <small>MHJ</small></strong></div></article>
        <article className="reward-color-card accrual"><div className="reward-icon">%</div><div><span>Available Accrual Balance</span><strong>{fmt(rewardData.remaining_cap)} <small>USDT</small></strong></div></article>
      </div>
      <div className="reward-lower-grid">
        <section className="reward-subpanel program-status-panel"><div className="subpanel-head"><h3>My Programs</h3><button onClick={()=>setTab("programs")}>View All</button></div><div className="mini-program-grid">{programs.map((p,i)=>{const acc=me.accounts.find(a=>a.program_key===p.key);const active=acc&&acc.status==="active";const funded=Number(acc?.total_funded||0);const target=Number(acc?.target||p.price||0);const pct=Math.max(0,Math.min(100,target?funded/target*100:0));return <article className={`mini-program-card visual-${i+1}`} key={p.key}><div className="program-visual"><span>0{i+1}</span><b className={active?"active":""}>{active?t.activeStaking:"Not Activated"}</b></div><div className="mini-program-body"><h4>{p.name}</h4><strong>{money(p.price)}</strong><p>Program Staking · {fmt(funded)} / {fmt(target)} USDT</p><div className="bar"><i style={{width:`${pct}%`}}/></div><small>{pct.toFixed(2)}%</small><button onClick={()=>{setTab("programs");setDetail(p.key)}}>{t.details} →</button></div></article>})}</div></section>
        <section className="reward-subpanel history-panel"><div className="subpanel-head"><h3>Recent Accrual History</h3><button>View All</button></div><div className="accrual-table"><div className="accrual-row head"><span>Date</span><span>Program</span><span>Accrued</span><span>Total</span></div>{dailyItems.slice(0,7).map((r,i)=>{const running=dailyItems.slice(i).reduce((s,x)=>s+Number(x.gross_equiv||0),0);const acc=me.accounts.find(a=>Number(a.id)===Number(r.account_id));return <div className="accrual-row" key={r.id}><span><i className={`dot dot-${i%4}`}/>{r.reward_date}</span><span>{acc?.program_name||"Program Staking"}</span><b>{fmt(r.gross_equiv)}</b><b>{fmt(running)}</b></div>})}{!dailyItems.length&&<p className="empty-accrual">{t.noData}</p>}</div></section>
      </div>
      <button className="floating-add" onClick={()=>setTab("programs")}><b>＋</b><span>Add</span></button>
    </section>;
    if(tab==="referral")return <section className="panel referral-dashboard"><p className="eyebrow">{t.referral}</p><h2>Referral Network</h2><div className="referral-link-card"><div><span>{t.referralLink}</span><code>{referralUrl}</code></div><button className="primary" onClick={()=>copyText(referralUrl)}>{t.copy}</button></div><div className="referral-code-row"><span>Referral Code</span><strong>{me.referral_code}</strong><button className="secondary" onClick={()=>copyText(me.referral_code)}>{t.copy}</button></div><div className="reward-banner"><span>{t.referralPolicy}</span><strong>{refData.active_directs||0} / {refData.required_directs||2}</strong></div><div className="ref-grid">{["1","2","3"].map(l=><article key={l}><h3>L{l} · {Math.round((refData.rates?.[l]||0)*100)}%</h3><strong>{refData.levels?.[l]?.length||0}</strong><p>{refData.levels?.[l]?.map(x=>x.name).join(", ")||t.noData}</p></article>)}</div></section>;
    return <><section className="hero-panel"><div><p className="eyebrow">MHJ FOUNDATION</p><h1>Beyond Treatment.<br/><em>Toward Healthy Longevity.</em></h1><p>{t.stakingNotice}</p></div><div className="hero-orb">MHJ</div></section><section className="stats"><article><span>{t.usdt}</span><strong>{fmt(me.balances.withdrawable)}</strong></article><article><span>{t.mhj}</span><strong>{fmt(me.balances.mhj)}</strong></article><article><span>{t.credit}</span><strong>{fmt(me.balances.medical)}</strong></article><article><span>Total Bonus</span><strong>{fmt(rewardData.totals.gross)}</strong></article></section><ProgramGrid/></>;
  };

  return <div className="app">
    <aside><Logo compact/><nav>{nav.map(([k,l])=><button key={k} className={tab===k?"nav-active":""} onClick={()=>{setTab(k);setDetail(null)}}>{l}</button>)}</nav><button onClick={()=>{localStorage.removeItem("mhj_user_token");onLogout()}}>{t.signout}</button></aside>
    <main><header><div><p className="eyebrow">{t.member}</p><h1>{nav.find(x=>x[0]===tab)?.[1]} · {me.name}</h1></div><select className="language-select" value={lang} onChange={e=>changeLang(e.target.value)}><option value="ko">한국어</option><option value="en">English</option><option value="ja">日本語</option><option value="zh">简体中文</option></select></header>{notice&&<div className="notice">{notice}</div>}<Content/></main>
  </div>
}

function Admin({onLogout}) {
  const [tab,setTab]=useState("dashboard");
  const [dash,setDash]=useState(null);
  const [rows,setRows]=useState([]);
  const [message,setMessage]=useState("");
  const [loading,setLoading]=useState(true);
  const [selectedMember,setSelectedMember]=useState(null);
  const [search,setSearch]=useState("");
  const token=localStorage.getItem("mhj_admin_token");
  const headers={Authorization:`Bearer ${token}`};

  const authFail=()=>{localStorage.removeItem("mhj_admin_token");onLogout();};

  const load=async(nextTab=tab)=>{
    try{
      setLoading(true);
      setMessage("");
      const d=await call("/api/admin/dashboard",{headers});
      setDash(d);
      let data=[];
      if(nextTab==="members") data=await call("/api/admin/members",{headers});
      if(nextTab==="programs") data=await call("/api/admin/program-accounts",{headers});
      if(nextTab==="rewards") data=await call("/api/admin/rewards",{headers});
      if(nextTab==="referral") data=await call("/api/admin/referrals",{headers});
      if(nextTab==="wallets") data=await call("/api/admin/wallets",{headers});
      if(nextTab==="deposits") data=await call("/api/admin/deposits",{headers});
      if(nextTab==="withdrawals") data=await call("/api/admin/withdrawals",{headers});
      if(nextTab==="settlements") data=await call("/api/admin/settlements",{headers});
      if(nextTab==="treatments") data=await call("/api/admin/treatments",{headers});
      if(nextTab==="ledger") data=await call("/api/admin/ledger",{headers});
      if(nextTab==="calendar"){
        const now=new Date();
        data=await call(`/api/admin/calendar/${now.getFullYear()}/${String(now.getMonth()+1).padStart(2,"0")}`,{headers});
      }
      setRows(data);
    }catch(e){
      if(e.status===401||e.status===403)return authFail();
      setMessage(e.message);
    }finally{setLoading(false);}
  };

  useEffect(()=>{load("dashboard")},[]);
  useEffect(()=>{if(dash)load(tab)},[tab]);

  const openMember=async id=>{
    try{setSelectedMember(await call(`/api/admin/members/${id}`,{headers}));}
    catch(e){setMessage(e.message);}
  };
  const changeMemberStatus=async(id,status)=>{
    const note=prompt("관리자 메모 (선택)")||null;
    try{await call(`/api/admin/members/${id}/status`,{method:"POST",headers,body:JSON.stringify({status,note})});setSelectedMember(null);await load("members");}
    catch(e){setMessage(e.message);}
  };

  const approveDeposit=async id=>{
    try{
      await call(`/api/admin/deposits/${id}/approve`,{method:"POST",headers,body:JSON.stringify({note:"ERP approval"})});
      setMessage("입금 승인이 완료되었습니다.");
      await load("deposits");
    }catch(e){setMessage(e.message);}
  };

  const changeWithdrawal=async(id,status)=>{
    const txid=status==="completed"?prompt("출금 TXID를 입력하세요")||"":null;
    try{
      await call(`/api/admin/withdrawals/${id}/status`,{method:"POST",headers,body:JSON.stringify({status,txid,note:"ERP update"})});
      await load("withdrawals");
    }catch(e){setMessage(e.message);}
  };

  const changeTreatment=async(id,status)=>{
    try{
      await call(`/api/admin/treatments/${id}/status`,{method:"POST",headers,body:JSON.stringify({status,note:"ERP update"})});
      await load("treatments");
    }catch(e){setMessage(e.message);}
  };

  const settle=async()=>{
    const date=prompt("Settlement date (YYYY-MM-DD), blank = yesterday KST")||null;
    try{
      const r=await call("/api/admin/settlements/run",{method:"POST",headers,body:JSON.stringify({settlement_date:date})});
      setMessage(`정산 완료: ${r.date}`);
      await load("settlements");
    }catch(e){
      if(e.status===409)setMessage("해당 날짜는 이미 정산이 완료되었습니다.");
      else setMessage(e.message);
    }
  };

  const exportExcel=async()=>{
    try{
      const response=await fetch(`${API}/api/admin/export.xlsx`,{headers});
      if(!response.ok)throw new Error(`Export failed (${response.status})`);
      const blob=await response.blob();
      const a=document.createElement("a");
      a.href=URL.createObjectURL(blob);a.download="MHJ_ERP_Export.xlsx";a.click();
      URL.revokeObjectURL(a.href);
    }catch(e){setMessage(e.message);}
  };

  const nav=[
    ["dashboard","ERP Dashboard"],["members","Members"],["programs","Programs"],["calendar","Calendar"],["deposits","Deposits"],
    ["settlements","Settlements"],["withdrawals","Withdrawals"],["rewards","Rewards"],["referral","Referral"],["wallets","Wallet / Credit"],["treatments","Treatments"],["ledger","Ledger"]
  ];

  const renderRows=()=>{
    if(tab==="dashboard")return <>
      <section className="stats">
        <article><span>Pending deposits</span><strong>{dash?.pending_deposits||0}</strong></article>
        <article><span>Pending withdrawals</span><strong>{dash?.pending_withdrawals||0}</strong></article>
        <article><span>Members</span><strong>{dash?.members||0}</strong></article>
        <article><span>Treatments</span><strong>{dash?.treatments||0}</strong></article>
      </section>
      <section className="panel"><div className="panel-head"><div><p className="eyebrow">PROGRAM P&L</p><h2>Revenue and cost basis</h2></div></div>
      <div className="account-grid">{(dash?.programs||[]).map(p=><article className="program-card" key={p.key}><h3>{p.name}</h3><p>Cash funded</p><strong>{Number(p.cash).toLocaleString()} USDT</strong><div className="numbers"><span>Price {p.price.toLocaleString()}</span><span>Cost {p.cost.toLocaleString()}</span></div></article>)}</div></section>
    </>;

    if(tab==="members"){
      if(selectedMember){const m=selectedMember.member;return <section className="panel member-detail"><button className="back-link" onClick={()=>setSelectedMember(null)}>← Members</button><div className="panel-head"><div><p className="eyebrow">MEMBER #{m.id}</p><h2>{m.name}</h2><p>{m.email} · {m.referral_code}</p></div><div className="row-actions"><button onClick={()=>changeMemberStatus(m.id,"active")}>Activate</button><button onClick={()=>changeMemberStatus(m.id,"suspended")}>Suspend</button></div></div><div className="stats"><article><span>Total bonus</span><strong>{Number(selectedMember.totals.gross||0).toFixed(2)}</strong></article><article><span>USDT</span><strong>{Number(selectedMember.totals.usdt||0).toFixed(2)}</strong></article><article><span>MHJ Coin</span><strong>{Number(selectedMember.totals.mhj||0).toFixed(2)}</strong></article><article><span>Medical Credit</span><strong>{Number(selectedMember.totals.medical||0).toFixed(2)}</strong></article></div><div className="member-info-grid"><article><b>Status</b><span>{m.status}</span></article><article><b>Wallet</b><code>{m.wallet||"-"}</code></article><article><b>Joined</b><span>{m.created_at?.slice(0,10)}</span></article><article><b>Admin note</b><span>{m.admin_note||"-"}</span></article></div><h3>Programs</h3><div className="admin-table">{selectedMember.accounts.length?selectedMember.accounts.map(x=><div className="admin-table-row" key={x.id}><span>{x.program_name}<small>{x.status}</small></span><b>{Number(x.cash_funded).toLocaleString()} / {Number(x.price).toLocaleString()} USDT</b><span>Reward {Number(x.reward_equiv_total).toFixed(2)} / {Number(x.reward_cap).toFixed(2)}</span></div>):<p>프로그램이 없습니다.</p>}</div><h3>Referral organization</h3><div className="ref-grid">{["1","2","3"].map(l=><article key={l}><h3>L{l}</h3><strong>{selectedMember.referrals[l]?.length||0}</strong><p>{selectedMember.referrals[l]?.map(x=>x.name).join(", ")||"-"}</p></article>)}</div></section>}
      const filtered=rows.filter(r=>`${r.name} ${r.email} ${r.referral_code}`.toLowerCase().includes(search.toLowerCase()));
      return <section className="panel"><div className="panel-head"><div><p className="eyebrow">MEMBER MANAGEMENT</p><h2>All Members</h2></div><input className="erp-search" placeholder="이름·이메일·추천코드 검색" value={search} onChange={e=>setSearch(e.target.value)}/></div><div className="admin-table"><div className="admin-table-head"><span>Member</span><span>Status</span><span>Programs / Funded</span><span>Total Bonus</span><span>Referral</span></div>{filtered.map(r=><button className="admin-table-row member-row" key={r.id} onClick={()=>openMember(r.id)}><span><b>{r.name}</b><small>{r.email}</small></span><span><i className={`status-dot ${r.status}`}/>{r.status}</span><span>{r.program_count} / {Number(r.funded).toLocaleString()} USDT</span><span>{Number(r.bonus_total).toFixed(2)}</span><span>{r.direct_count} direct</span></button>)}</div></section>;
    }
    if(tab==="programs")return <section className="panel"><h2>Member Programs</h2><div className="admin-table">{rows.map(r=><div className="admin-table-row five" key={r.id}><span><b>{r.name}</b><small>{r.email}</small></span><span>{r.program_name}</span><span>{Number(r.cash_funded).toLocaleString()} / {Number(r.price).toLocaleString()}</span><span>{r.status}</span><span>{r.treatment_status}</span></div>)}</div></section>;
    if(tab==="rewards")return <section className="panel"><h2>Reward Ledger</h2><div className="admin-table">{rows.map(r=><div className="admin-table-row five" key={r.id}><span><b>{r.name}</b><small>{r.email}</small></span><span>{r.reward_type} · L{r.level||0}</span><span>{Number(r.gross_equiv).toFixed(2)} Gross</span><span>{Number(r.usdt_amount).toFixed(2)} USDT</span><span>{Number(r.mhj_coin_amount).toFixed(2)} MHJ</span></div>)}</div></section>;
    if(tab==="referral")return <section className="panel"><h2>Referral Organization</h2><div className="admin-table">{rows.map(r=><div className="admin-table-row five" key={r.id}><span><b>{r.name}</b><small>{r.email}</small></span><span>L1 {r.l1} · L2 {r.l2} · L3 {r.l3}</span><span>{r.l1>=2?"Unlocked":"Locked"}</span><span>Referral {Number(r.referral_bonus).toFixed(2)}</span><span>Team {Number(r.team_bonus).toFixed(2)}</span></div>)}</div></section>;
    if(tab==="wallets")return <section className="panel"><h2>Wallet & Medical Credit</h2><div className="admin-table">{rows.map(r=><div className="admin-table-row five" key={r.id}><span><b>{r.name}</b><small>{r.email}</small></span><code>{r.wallet||"Not registered"}</code><span>{Math.max(0,Number(r.earned_usdt)-Number(r.reserved_usdt)).toFixed(2)} USDT</span><span>{Number(r.mhj_coin).toFixed(2)} MHJ</span><span>{Number(r.medical_credit).toFixed(2)} Credit</span></div>)}</div></section>;

    if(!rows.length)return <section className="panel"><p>표시할 데이터가 없습니다.</p></section>;

    if(tab==="deposits")return <section className="panel"><h2>Deposit requests</h2>{rows.map(r=><div className="erp-row" key={r.id}><span>{r.name}<small>{r.email}</small></span><span>{r.program_key}</span><span>{r.amount} USDT</span><span>{r.status}</span>{r.status==="pending"?<button className="primary small" onClick={()=>approveDeposit(r.id)}>Approve</button>:<span/>}</div>)}</section>;

    if(tab==="withdrawals")return <section className="panel"><h2>Withdrawal requests</h2>{rows.map(r=><div className="erp-row" key={r.id}><span>{r.name}<small>{r.email}</small></span><span>{r.amount} USDT</span><span>{r.wallet}</span><span>{r.status}</span><span className="row-actions"><button onClick={()=>changeWithdrawal(r.id,"approved")}>Approve</button><button onClick={()=>changeWithdrawal(r.id,"completed")}>Complete</button><button onClick={()=>changeWithdrawal(r.id,"rejected")}>Reject</button></span></div>)}</section>;

    if(tab==="treatments")return <section className="panel"><h2>Treatment requests</h2>{rows.map(r=><div className="erp-row" key={r.id}><span>{r.name}<small>{r.email}</small></span><span>{r.program_key}</span><span>{r.desired_date||"-"}</span><span>{r.status}</span><span className="row-actions"><button onClick={()=>changeTreatment(r.id,"scheduled")}>Schedule</button><button onClick={()=>changeTreatment(r.id,"completed")}>Complete</button><button onClick={()=>changeTreatment(r.id,"cancelled")}>Cancel</button></span></div>)}</section>;

    return <section className="panel"><h2>{tab[0].toUpperCase()+tab.slice(1)}</h2><pre className="json-view">{JSON.stringify(rows,null,2)}</pre></section>;
  };

  return <div className="app admin">
    <aside><Logo compact/><nav>{nav.map(([key,label])=><button key={key} className={tab===key?"nav-active":""} onClick={()=>setTab(key)}>{label}</button>)}</nav><button onClick={()=>{localStorage.removeItem("mhj_admin_token");onLogout()}}>Sign out</button></aside>
    <main>
      <header><div><p className="eyebrow">ADMINISTRATOR ERP</p><h1>{nav.find(x=>x[0]===tab)?.[1]}</h1></div><div className="actions"><button className="secondary" onClick={settle}>Run KST close</button><button className="primary" onClick={exportExcel}>Export Excel</button></div></header>
      {message&&<div className="notice">{message}</div>}
      {loading?<div className="loading">Loading...</div>:renderRows()}
    </main>
  </div>
}

export default function App(){
  const admin=location.pathname.startsWith("/admin");
  const storageKey=admin?"mhj_admin_token":"mhj_user_token";
  const [logged,setLogged]=useState(Boolean(localStorage.getItem(storageKey)));

  const logout=()=>{
    localStorage.removeItem(storageKey);
    setLogged(false);
  };

  if(!logged)return <Auth admin={admin} onDone={()=>setLogged(true)}/>;
  return admin?<Admin onLogout={logout}/>:<Member onLogout={logout}/>;
}

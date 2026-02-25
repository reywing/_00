import { useEffect, useMemo, useRef, useState } from "react";

/** =====[ 설정 ]===== */
/** 개발(StackBlitz) 중에는 false → 배포(Vercel)에서 true로 변경 */
const USE_CLOUD = true;

/** 노션 워크스페이스 기본값 (URL ?w=값 없으면 이 이름 사용) */
const DEFAULT_WORKSPACE = "AX 실증 예산 페이지";

/** URL에 ?w=워크스페이스 추가 시, 여러 그룹을 분리해서 사용 가능 */
const getWorkspaceId = () => {
  if (typeof window === "undefined") return DEFAULT_WORKSPACE;
  const w = new URLSearchParams(window.location.search).get("w");
  return (w && w.trim()) || DEFAULT_WORKSPACE;
};
const WORKSPACE = getWorkspaceId();

/** ===== 타입 정의 ===== */
type Budget = { id: number; category: string; name: string; amount: number; };

type Expense = {
  id: number; date: string; content: string; category: string;
  qty: number; unitPrice: number; payDate?: string; payAmount?: number; memo?: string;
};

type ExpenseForm = {
  date: string; content: string; category: string;
  qty: string; unitPrice: string; payDate: string; payAmount: string; memo: string;
};

type StorageLike = {
  get: (key: string) => Promise<{ value: string | null }>;
  set: (key: string, value: string) => Promise<void>;
};

/** ===== Storage 어댑터 =====
 * - USE_CLOUD=true → /api/storage (Vercel에서 동작)
 * - USE_CLOUD=false → localStorage (StackBlitz/로컬 브라우저 저장)
 */
const getStorage = (): StorageLike | null => {
  if (typeof window === "undefined") return null;

  if (USE_CLOUD) {
    const base = "/api/storage";
    return {
      get: async (k: string) => {
        const url = `${base}?key=${encodeURIComponent(k)}`;
        try {
          const r = await fetch(url, { method: "GET", cache: "no-store" });
          if (!r.ok) throw new Error(`GET ${url} ${r.status}`);
          const json = await r.json();
          return { value: json?.value ?? null };
        } catch (e) {
          console.warn("클라우드 get 실패:", e);
          return { value: null };
        }
      },
      set: async (k: string, v: string) => {
        const url = `${base}?key=${encodeURIComponent(k)}`;
        try {
          const r = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            // (선택) 수정 보호 토큰 쓰려면 여기 헤더에 X-Admin-Token 추가
            body: JSON.stringify({ value: v }),
          });
          if (!r.ok) throw new Error(`POST ${url} ${r.status}`);
        } catch (e) {
          console.warn("클라우드 set 실패:", e);
        }
      },
    };
  }

  // 로컬 저장 (개발/테스트)
  return {
    get: async (k: string) => {
      try {
        const value = window.localStorage.getItem(k);
        return { value };
      } catch (e) {
        console.warn("localStorage get 실패:", e);
        return { value: null };
      }
    },
    set: async (k: string, v: string) => {
      try {
        window.localStorage.setItem(k, v);
      } catch (e) {
        console.warn("localStorage set 실패:", e);
      }
    },
  };
};

/** ===== 상수/유틸 ===== */
const CATEGORIES = ["인건비", "일반수용비", "재료비", "일반용역비", "연구용역비", "국내여비", "사업추진비", "유형자산구입비"] as const;

const CATEGORY_COLORS: Record<string, string> = {
  인건비: "#3B82F6", 일반수용비: "#6B7280", 재료비: "#10B981", 일반용역비: "#F97316",
  연구용역비: "#8B5CF6", 국내여비: "#F59E0B", 사업추진비: "#EF4444", 유형자산구입비: "#92400E",
};

const STORAGE_KEY = `budget-tracker-data:${encodeURIComponent(WORKSPACE)}`;

const defaultBudgets: Budget[] = [
  { id: 1, category: "인건비", name: "인건비 예산", amount: 0 },
  { id: 2, category: "일반수용비", name: "일반수용비 예산", amount: 0 },
  { id: 3, category: "재료비", name: "재료비 예산", amount: 0 },
  { id: 4, category: "일반용역비", name: "일반용역비 예산", amount: 0 },
  { id: 5, category: "연구용역비", name: "연구용역비 예산", amount: 0 },
  { id: 6, category: "국내여비", name: "국내여비 예산", amount: 0 },
  { id: 7, category: "사업추진비", name: "사업추진비 예산", amount: 0 },
  { id: 8, category: "유형자산구입비", name: "유형자산구입비 예산", amount: 0 },
];

const defaultExpenses: Expense[] = [
  { id: 1, date: "2025-01-10", content: "연구원 인건비", category: "인건비", qty: 1, unitPrice: 2000000, payDate: "2025-01-25", payAmount: 2000000, memo: "" },
  { id: 2, category: "재료비", date: "2025-01-20", content: "실험 재료 구입", qty: 5, unitPrice: 80000, payDate: "2025-01-20", payAmount: 400000, memo: "" },
  { id: 3, date: "2025-02-05", content: "학술대회 출장", category: "국내여비", qty: 1, unitPrice: 250000, payDate: "2025-02-10", payAmount: 250000, memo: "2월 학술대회" },
];

const fmt = (n?: number) => ((n || 0).toLocaleString("ko-KR") + "원");
const fmtNum = (n?: number) => ((n || 0).toLocaleString("ko-KR"));
const fmtDate = (d?: string) => (d ? d.replace(/-/g, "/") : "-");

/** ===== 메인 컴포넌트 ===== */
export default function App() {
  const [budgets, setBudgets] = useState<Budget[]>(defaultBudgets);
  const [expenses, setExpenses] = useState<Expense[]>(defaultExpenses);
  const [tab, setTab] = useState<"overview" | "expenses" | "budget">("overview");
  const [showForm, setShowForm] = useState(false);
  const [editingExpense, setEditingExpense] = useState<number | null>(null);
  const [filterCategory, setFilterCategory] = useState<string>("전체");
  const [form, setForm] = useState<ExpenseForm>({ date: "", content: "", category: "인건비", qty: "", unitPrice: "", payDate: "", payAmount: "", memo: "" });
  const [budgetForm, setBudgetForm] = useState<Record<string, string | number>>({});
  const [editingBudget, setEditingBudget] = useState(false);

  /** loaded 값 미사용 경고 제거: 값 버리고 setter만 사용 */
  const [, setLoaded] = useState(false);

  /** 언마운트 안전성 */
  const mountedRef = useRef(true);
  useEffect(() => {
    return () => { mountedRef.current = false; };
  }, []);

  /** 데이터 로드 */
  useEffect(() => {
    const storage = getStorage();
    const tryLoad = async () => {
      try {
        const res = await storage?.get(STORAGE_KEY);
        if (res?.value) {
          try {
            const d = JSON.parse(res.value);
            if (d?.budgets) setBudgets(d.budgets);
            if (d?.expenses) setExpenses(d.expenses);
          } catch (e) {
            console.warn("저장 데이터 JSON 파싱 실패:", e);
          }
        }
      } catch (e) {
        console.warn("데이터 로드 실패:", e);
      } finally {
        if (mountedRef.current) setLoaded(true);
      }
    };
    void tryLoad();
  }, []);

  /** 저장 */
  const save = async (newBudgets: Budget[], newExpenses: Expense[]) => {
    const storage = getStorage();
    try {
      const payload = JSON.stringify({ budgets: newBudgets, expenses: newExpenses });
      await storage?.set(STORAGE_KEY, payload);
    } catch (e) {
      console.warn("데이터 저장 실패:", e);
    }
  };

  /** 계산 */
  const totalBudget = useMemo(() => budgets.reduce((s, b) => s + (Number(b.amount) || 0), 0), [budgets]);
  const totalSpent  = useMemo(() => expenses.reduce((s, e) => s + (Number(e.qty) * Number(e.unitPrice)), 0), [expenses]);
  const totalPaid   = useMemo(() => expenses.reduce((s, e) => s + (Number(e.payAmount) || 0), 0), [expenses]);

  const getCategorySpent  = (cat: string) => expenses.filter(e => e.category === cat).reduce((s, e) => s + Number(e.qty) * Number(e.unitPrice), 0);
  const getCategoryBudget = (cat: string) => budgets.find(b => b.category === cat)?.amount || 0;

  const filteredExpenses = filterCategory === "전체" ? expenses : expenses.filter(e => e.category === filterCategory);

  /** 폼 */
  const openForm = (expense: Expense | null = null) => {
    if (expense) {
      setForm({
        date: expense.date ?? "",
        content: expense.content ?? "",
        category: expense.category ?? "인건비",
        qty: String(expense.qty ?? ""),
        unitPrice: String(expense.unitPrice ?? ""),
        payDate: expense.payDate ?? "",
        payAmount: expense.payAmount != null ? String(expense.payAmount) : "",
        memo: expense.memo ?? "",
      });
      setEditingExpense(expense.id);
    } else {
      setForm({ date: "", content: "", category: "인건비", qty: "", unitPrice: "", payDate: "", payAmount: "", memo: "" });
      setEditingExpense(null);
    }
    setShowForm(true);
  };

  const submitForm = () => {
    if (!form.date || !form.content || !form.qty || !form.unitPrice) return;
    const qty = Number(form.qty);
    const unitPrice = Number(form.unitPrice);
    const total = qty * unitPrice;
    const payAmount = form.payAmount ? Number(form.payAmount) : total;

    let newExpenses: Expense[];
    if (editingExpense) {
      newExpenses = expenses.map(e =>
        e.id === editingExpense
          ? { id: editingExpense, date: form.date, content: form.content, category: form.category, qty, unitPrice, payDate: form.payDate, payAmount, memo: form.memo }
          : e
      );
    } else {
      const newE: Expense = {
        id: Date.now(), date: form.date, content: form.content, category: form.category,
        qty, unitPrice, payDate: form.payDate, payAmount, memo: form.memo,
      };
      newExpenses = [...expenses, newE];
    }
    setExpenses(newExpenses);
    void save(budgets, newExpenses);
    setShowForm(false);
  };

  const deleteExpense = (id: number) => {
    const newExpenses = expenses.filter(e => e.id !== id);
    setExpenses(newExpenses);
    void save(budgets, newExpenses);
  };

  const saveBudgets = () => {
    const newBudgets = budgets.map(b => ({ ...b, amount: Number(budgetForm[b.category] ?? b.amount) }));
    setBudgets(newBudgets);
    void save(newBudgets, expenses);
    setEditingBudget(false);
  };

  const execRate = totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 100) : 0;

  return (
    <div style={{ fontFamily: "'Noto Sans KR', 'Apple SD Gothic Neo', sans-serif", background: "#F0F4F8", minHeight: "100vh", padding: "24px 16px" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;500;700&display=swap');
        * { box-sizing: border-box; }
        .card { background: #fff; border-radius: 16px; padding: 20px; box-shadow: 0 2px 12px rgba(0,0,0,0.06); }
        .tab-btn { padding: 8px 20px; border-radius: 20px; border: none; cursor: pointer; font-size: 14px; font-weight: 500; transition: all 0.2s; }
        .tab-btn.active { background: #1E3A5F; color: #fff; }
        .tab-btn:not(.active) { background: transparent; color: #64748B; }
        .tab-btn:not(.active):hover { background: #E2E8F0; }
        .btn { border-radius: 10px; border: none; cursor: pointer; font-weight: 500; transition: all 0.15s; }
        .btn:hover { opacity: 0.88; transform: translateY(-1px); }
        .btn-primary { background: #1E3A5F; color: #fff; padding: 10px 20px; font-size: 14px; }
        .btn-sm { background: #F1F5F9; color: #475569; padding: 5px 12px; font-size: 12px; }
        .btn-danger { background: #FEE2E2; color: #DC2626; padding: 5px 12px; font-size: 12px; }
        .input { width: 100%; border: 1.5px solid #E2E8F0; border-radius: 10px; padding: 9px 12px; font-size: 14px; outline: none; transition: border 0.2s; font-family: inherit; }
        .input:focus { border-color: #1E3A5F; }
        .badge { display: inline-block; padding: 2px 10px; border-radius: 20px; font-size: 12px; font-weight: 500; }
        .progress-bar { height: 8px; border-radius: 8px; background: #E2E8F0; overflow: hidden; }
        .progress-fill { height: 100%; border-radius: 8px; transition: width 0.6s ease; }
        .row { display: flex; gap: 12px; } /* 쉼표(,) 금지! */
        .overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.4); z-index: 100; display: flex; align-items: center; justify-content: center; padding: 16px; }
        .modal { background: #fff; border-radius: 20px; padding: 28px; width: 100%; max-width: 520px; max-height: 90vh; overflow-y: auto; box-shadow: 0 20px 60px rgba(0,0,0,0.2); }
        .table-wrap { overflow-x: auto; }
        table { width: 100%; border-collapse: collapse; font-size: 13px; }
        th { background: #F8FAFC; color: #64748B; font-weight: 600; padding: 10px 12px; text-align: left; border-bottom: 1.5px solid #E2E8F0; white-space: nowrap; }
        td { padding: 10px 12px; border-bottom: 1px solid #F1F5F9; vertical-align: middle; }
        tr:hover td { background: #FAFBFC; }
        .stat-card { background: #fff; border-radius: 16px; padding: 20px; box-shadow: 0 2px 12px rgba(0,0,0,0.06); flex: 1; min-width: 140px; }
      `}</style>

      {/* 헤더 */}
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
            <div>
              <p style={{ margin: 0, fontSize: 12, color: "#94A3B8", fontWeight: 500, letterSpacing: 1, textTransform: "uppercase" }}>Research Budget</p>
              <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700, color: "#1E3A5F" }}>예산 사용 관리</h1>
            </div>
            <div style={{ display: "flex", gap: 8, background: "#fff", padding: "6px 8px", borderRadius: 24, boxShadow: "0 2px 8px rgba(0,0,0,0.07)" }}>
              {(["overview", "expenses", "budget"] as const).map(t => (
                <button key={t} className={`tab-btn ${tab === t ? "active" : ""}`} onClick={() => setTab(t)}>
                  {t === "overview" ? "📊 개요" : t === "expenses" ? "📋 지출내역" : "💰 예산설정"}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 상단 요약 카드 */}
        <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
          {[
            { label: "총 예산", value: fmt(totalBudget), color: "#1E3A5F", sub: "전체 배정 예산" },
            { label: "지출 총액", value: fmt(totalSpent), color: "#F59E0B", sub: `집행률 ${execRate}%` },
            { label: "지급 총액", value: fmt(totalPaid), color: "#10B981", sub: "실제 지급 완료" },
            { label: "잔액", value: fmt(totalBudget - totalSpent), color: totalBudget - totalSpent >= 0 ? "#3B82F6" : "#EF4444", sub: "남은 예산" },
          ].map((s, i) => (
            <div key={i} className="stat-card" style={{ flex: "1 1 160px" }}>
              <p style={{ margin: 0, fontSize: 11, color: "#94A3B8", fontWeight: 600, letterSpacing: 0.5 }}>{s.label}</p>
              <p style={{ margin: "6px 0 2px", fontSize: 20, fontWeight: 700, color: s.color }}>{s.value}</p>
              <p style={{ margin: 0, fontSize: 12, color: "#94A3B8" }}>{s.sub}</p>
            </div>
          ))}
        </div>

        {/* 개요 탭 */}
        {tab === "overview" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div className="card">
              <h3 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 700, color: "#1E293B" }}>비목별 예산 현황</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {CATEGORIES.map(cat => {
                  const budget = getCategoryBudget(cat);
                  const spent = getCategorySpent(cat);
                  const rate = budget > 0 ? Math.min(Math.round((spent / budget) * 100), 100) : 0;
                  const color = CATEGORY_COLORS[cat];
                  return (
                    <div key={cat}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", background: color }} />
                          <span style={{ fontSize: 14, fontWeight: 500, color: "#334155" }}>{cat}</span>
                        </div>
                        <div style={{ display: "flex", gap: 16, fontSize: 13 }}>
                          <span style={{ color: "#64748B" }}>예산 <b style={{ color: "#334155" }}>{fmtNum(budget)}</b></span>
                          <span style={{ color: "#64748B" }}>지출 <b style={{ color }}>{fmtNum(spent)}</b></span>
                          <span style={{ color: "#64748B" }}>잔액 <b style={{ color: budget - spent < 0 ? "#EF4444" : "#10B981" }}>{fmtNum(budget - spent)}</b></span>
                          <span className="badge" style={{ background: rate > 80 ? "#FEE2E2" : "#EFF6FF", color: rate > 80 ? "#DC2626" : "#3B82F6" }}>{rate}%</span>
                        </div>
                      </div>
                      <div className="progress-bar">
                        <div className="progress-fill" style={{ width: `${rate}%`, background: color }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="card">
              <h3 style={{ margin: "0 0 14px", fontSize: 15, fontWeight: 700, color: "#1E293B" }}>최근 지출 내역</h3>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>품의 날짜</th>
                      <th>지출 내용</th>
                      <th>비목</th>
                      <th style={{ textAlign: "right" }}>총액</th>
                      <th>지급 날짜</th>
                      <th style={{ textAlign: "right" }}>지급 금액</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...expenses].reverse().slice(0, 5).map(e => (
                      <tr key={e.id}>
                        <td style={{ color: "#64748B" }}>{fmtDate(e.date)}</td>
                        <td style={{ fontWeight: 500, color: "#1E293B" }}>{e.content}</td>
                        <td><span className="badge" style={{ background: CATEGORY_COLORS[e.category] + "22", color: CATEGORY_COLORS[e.category] }}>{e.category}</span></td>
                        <td style={{ textAlign: "right", fontWeight: 600 }}>{fmtNum(e.qty * e.unitPrice)}</td>
                        <td style={{ color: "#64748B" }}>{fmtDate(e.payDate)}</td>
                        <td style={{ textAlign: "right", color: "#10B981", fontWeight: 600 }}>{fmtNum(e.payAmount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* 지출내역 탭 */}
        {tab === "expenses" && (
          <div className="card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "#1E293B" }}>지출 내역</h3>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <select className="input" style={{ width: "auto", padding: "7px 12px" }} value={filterCategory} onChange={e => setFilterCategory(e.target.value)}>
                  <option>전체</option>
                  {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                </select>
                <button className="btn btn-primary" onClick={() => openForm()}>+ 지출 추가</button>
              </div>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>품의 날짜</th>
                    <th>지출 내용</th>
                    <th>비목</th>
                    <th style={{ textAlign: "right" }}>수량</th>
                    <th style={{ textAlign: "right" }}>단가</th>
                    <th style={{ textAlign: "right" }}>총액</th>
                    <th>지급 날짜</th>
                    <th style={{ textAlign: "right" }}>지급 금액</th>
                    <th>비고</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredExpenses.length === 0 && (
                    <tr><td colSpan={10} style={{ textAlign: "center", color: "#94A3B8", padding: "30px 0" }}>지출 내역이 없습니다</td></tr>
                  )}
                  {filteredExpenses.map(e => (
                    <tr key={e.id}>
                      <td style={{ color: "#64748B", whiteSpace: "nowrap" }}>{fmtDate(e.date)}</td>
                      <td style={{ fontWeight: 500, color: "#1E293B", minWidth: 120 }}>{e.content}</td>
                      <td><span className="badge" style={{ background: CATEGORY_COLORS[e.category] + "22", color: CATEGORY_COLORS[e.category] }}>{e.category}</span></td>
                      <td style={{ textAlign: "right" }}>{fmtNum(e.qty)}</td>
                      <td style={{ textAlign: "right" }}>{fmtNum(e.unitPrice)}</td>
                      <td style={{ textAlign: "right", fontWeight: 600 }}>{fmtNum(e.qty * e.unitPrice)}</td>
                      <td style={{ color: "#64748B", whiteSpace: "nowrap" }}>{fmtDate(e.payDate)}</td>
                      <td style={{ textAlign: "right", color: "#10B981", fontWeight: 600 }}>{fmtNum(e.payAmount)}</td>
                      <td style={{ color: "#94A3B8", fontSize: 12 }}>{e.memo}</td>
                      <td>
                        <div style={{ display: "flex", gap: 4 }}>
                          <button className="btn btn-sm" onClick={() => openForm(e)}>수정</button>
                          <button className="btn btn-danger" onClick={() => deleteExpense(e.id)}>삭제</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
                {filteredExpenses.length > 0 && (
                  <tfoot>
                    <tr style={{ background: "#F8FAFC" }}>
                      <td colSpan={5} style={{ fontWeight: 700, padding: "10px 12px", color: "#334155" }}>합계</td>
                      <td style={{ textAlign: "right", fontWeight: 700, color: "#1E3A5F" }}>{fmtNum(filteredExpenses.reduce((s, e) => s + e.qty * e.unitPrice, 0))}</td>
                      <td></td>
                      <td style={{ textAlign: "right", fontWeight: 700, color: "#10B981" }}>{fmtNum(filteredExpenses.reduce((s, e) => s + (e.payAmount || 0), 0))}</td>
                      <td colSpan={2}></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        )}

        {/* 예산설정 탭 */}
        {tab === "budget" && (
          <div className="card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "#1E293B" }}>예산 설정</h3>
              {!editingBudget ? (
                <button className="btn btn-primary" onClick={() => { setBudgetForm(Object.fromEntries(budgets.map(b => [b.category, b.amount]))); setEditingBudget(true); }}>
                  수정
                </button>
              ) : (
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="btn btn-sm" onClick={() => setEditingBudget(false)}>취소</button>
                  <button className="btn btn-primary" onClick={saveBudgets}>저장</button>
                </div>
              )}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {CATEGORIES.map(cat => {
                const budget = getCategoryBudget(cat);
                const spent = getCategorySpent(cat);
                const color = CATEGORY_COLORS[cat];
                return (
                  <div key={cat} style={{ display: "flex", alignItems: "center", gap: 16, padding: "14px 16px", borderRadius: 12, border: "1.5px solid #E2E8F0" }}>
                    <span style={{ display: "inline-block", width: 12, height: 12, borderRadius: "50%", background: color, flexShrink: 0 }} />
                    <span style={{ fontSize: 14, fontWeight: 600, color: "#334155", width: 100, flexShrink: 0 }}>{cat}</span>
                    <div style={{ flex: 1 }}>
                      {editingBudget ? (
                        <input className="input" type="number" value={budgetForm[cat] ?? budget} onChange={e => setBudgetForm({ ...budgetForm, [cat]: e.target.value })} style={{ maxWidth: 180 }} />
                      ) : (
                        <span style={{ fontWeight: 700, fontSize: 15, color: "#1E293B" }}>{fmt(budget)}</span>
                      )}
                    </div>
                    <div style={{ fontSize: 13, color: "#64748B", textAlign: "right" }}>
                      <span>지출 <b style={{ color }}>{fmt(spent)}</b></span>
                      <span style={{ marginLeft: 12 }}>잔액 <b style={{ color: budget - spent >= 0 ? "#10B981" : "#EF4444" }}>{fmt(budget - spent)}</b></span>
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{ marginTop: 16, padding: "14px 16px", borderRadius: 12, background: "#F8FAFC", display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontWeight: 700, color: "#1E293B" }}>총 예산</span>
              <span style={{ fontWeight: 700, fontSize: 16, color: "#1E3A5F" }}>{fmt(totalBudget)}</span>
            </div>
          </div>
        )}
      </div>

      {/* 지출 입력 모달 */}
      {showForm && (
        <div className="overlay" onClick={e => e.target === e.currentTarget && setShowForm(false)}>
          <div className="modal">
            <h3 style={{ margin: "0 0 20px", fontSize: 17, fontWeight: 700, color: "#1E293B" }}>
              {editingExpense ? "지출 내역 수정" : "지출 내역 추가"}
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div className="row">
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 12, color: "#64748B", fontWeight: 600, display: "block", marginBottom: 4 }}>품의 날짜 *</label>
                  <input className="input" type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 12, color: "#64748B", fontWeight: 600, display: "block", marginBottom: 4 }}>비목 *</label>
                  <select className="input" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
                    {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label style={{ fontSize: 12, color: "#64748B", fontWeight: 600, display: "block", marginBottom: 4 }}>지출 내용 *</label>
                <input className="input" placeholder="예: 외부 강사 강의료" value={form.content} onChange={e => setForm({ ...form, content: e.target.value })} />
              </div>
              <div className="row">
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 12, color: "#64748B", fontWeight: 600, display: "block", marginBottom: 4 }}>수량 *</label>
                  <input className="input" type="number" placeholder="1" value={form.qty} onChange={e => setForm({ ...form, qty: e.target.value })} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 12, color: "#64748B", fontWeight: 600, display: "block", marginBottom: 4 }}>단가 *</label>
                  <input className="input" type="number" placeholder="0" value={form.unitPrice} onChange={e => setForm({ ...form, unitPrice: e.target.value })} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 12, color: "#64748B", fontWeight: 600, display: "block", marginBottom: 4 }}>총액</label>
                  <input className="input" readOnly value={form.qty && form.unitPrice ? fmtNum(Number(form.qty) * Number(form.unitPrice)) : ""} style={{ background: "#F8FAFC", color: "#1E3A5F", fontWeight: 700 }} />
                </div>
              </div>
              <div className="row">
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 12, color: "#64748B", fontWeight: 600, display: "block", marginBottom: 4 }}>지급 날짜</label>
                  <input className="input" type="date" value={form.payDate} onChange={e => setForm({ ...form, payDate: e.target.value })} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 12, color: "#64748B", fontWeight: 600, display: "block", marginBottom: 4 }}>지급 금액</label>
                  <input className="input" type="number" placeholder="비워두면 총액과 동일" value={form.payAmount} onChange={e => setForm({ ...form, payAmount: e.target.value })} />
                </div>
              </div>
              <div>
                <label style={{ fontSize: 12, color: "#64748B", fontWeight: 600, display: "block", marginBottom: 4 }}>비고</label>
                <input className="input" placeholder="메모" value={form.memo} onChange={e => setForm({ ...form, memo: e.target.value })} />
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 20, justifyContent: "flex-end" }}>
              <button className="btn btn-sm" style={{ padding: "10px 20px" }} onClick={() => setShowForm(false)}>취소</button>
              <button className="btn btn-primary" onClick={submitForm}>{editingExpense ? "수정 완료" : "추가"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

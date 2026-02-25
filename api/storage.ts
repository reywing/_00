// api/storage.ts
// Upstash Redis REST API를 사용하는 Vercel API Route
// 환경변수: KV_REST_API_URL, KV_REST_API_TOKEN (Upstash 대시보드에서 복사)

export const config = { runtime: "nodejs" };

const getEnv = () => {
  const base = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  return { base, token, ok: Boolean(base && token) };
};

// Upstash REST API 헬퍼
async function upstash(base: string, token: string, command: unknown[]) {
  const res = await fetch(base, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Upstash error ${res.status}: ${text}`);
  }

  return res.json() as Promise<{ result: unknown }>;
}

export default async function handler(req: any, res: any) {
  // ── 환경변수 체크 ──────────────────────────────────────────
  const { base, token, ok } = getEnv();
  if (!ok) {
    return res.status(500).json({
      error: "kv_not_configured",
      hint: "Vercel 프로젝트 설정 → Environment Variables에 KV_REST_API_URL, KV_REST_API_TOKEN을 추가하세요.",
      has_KV_REST_API_URL: Boolean(process.env.KV_REST_API_URL),
      has_KV_REST_API_TOKEN: Boolean(process.env.KV_REST_API_TOKEN),
    });
  }

  // ── 키 체크 ────────────────────────────────────────────────
  const key = (req.query?.key as string) ?? "";
  if (!key) {
    return res.status(400).json({ error: "key is required" });
  }

  try {
    // ── GET: 값 조회 ────────────────────────────────────────
    if (req.method === "GET") {
      const data = await upstash(base!, token!, ["GET", key]);
      // result가 null이면 저장된 값 없음
      return res.status(200).json({ value: data.result ?? null });
    }

    // ── POST: 값 저장 ───────────────────────────────────────
    if (req.method === "POST") {
      const { value } = (req.body ?? {}) as { value?: string };

      if (typeof value !== "string") {
        return res.status(400).json({ error: "body에 value(string)이 필요합니다." });
      }

      await upstash(base!, token!, ["SET", key, value]);
      return res.status(204).end();
    }

    // ── DELETE: 값 삭제 (선택 기능) ─────────────────────────
    if (req.method === "DELETE") {
      await upstash(base!, token!, ["DEL", key]);
      return res.status(204).end();
    }

    // ── 허용되지 않은 메서드 ─────────────────────────────────
    res.setHeader("Allow", "GET, POST, DELETE");
    return res.status(405).end("Method Not Allowed");

  } catch (e: any) {
    console.error("[storage] KV 오류:", e);
    return res.status(500).json({
      error: "internal_error",
      detail: String(e?.message ?? e),
    });
  }
}

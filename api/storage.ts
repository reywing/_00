// api/storage.ts
export const config = { runtime: "nodejs" };

export default async function handler(req: any, res: any) {
  const key = (req.query?.key as string) || "";
  const debug = req.query?.debug === "1";

  const base = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;

  if (!base || !token) {
    // ✅ 디버그 모드면 어떤 게 비었는지 보여줌
    return res.status(500).json({
      error: "kv_not_configured",
      ...(debug
        ? {
            has_KV_REST_API_URL: Boolean(process.env.KV_REST_API_URL),
            has_KV_REST_API_TOKEN: Boolean(process.env.KV_REST_API_TOKEN),
            // 참고로 다른 이름도 존재하는지 같이 체크(있어도 상관없음)
            has_UPSTASH_REDIS_REST_URL: Boolean(process.env.UPSTASH_REDIS_REST_URL),
            has_UPSTASH_REDIS_REST_TOKEN: Boolean(process.env.UPSTASH_REDIS_REST_TOKEN),
          }
        : {}),
    });
  }

  if (!key) return res.status(400).json({ error: "key is required" });

  try {
    if (req.method === "GET") {
      const r = await fetch(`${base}/get/${encodeURIComponent(key)}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json();
      return res.status(200).json({ value: data?.result ?? null });
    }

    if (req.method === "POST") {
      const { value } = (req.body ?? {}) as { value?: string };
      if (typeof value !== "string") {
        return res.status(400).json({ error: "value(string) is required" });
      }

      const r = await fetch(`${base}/set/${encodeURIComponent(key)}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ value }),
      });
      if (!r.ok) throw new Error(await r.text());
      return res.status(204).end();
    }

    res.setHeader("Allow", "GET, POST");
    return res.status(405).end("Method Not Allowed");
  } catch (e: any) {
    console.error("KV handler error:", e);
    return res.status(500).json({ error: "internal_error", detail: String(e?.message || e) });
  }
}

// api/storage.ts
export default async function handler(req: any, res: any) {
  const key = (req.query?.key as string) || "";
  if (!key) return res.status(400).json({ error: "key is required" });

  const base = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!base || !token) {
    return res.status(500).json({ error: "kv_not_configured" });
  }

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
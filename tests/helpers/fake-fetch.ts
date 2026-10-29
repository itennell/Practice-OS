// A fetch stand-in for adapter tests: routes are matched in order on
// "METHOD url-substring"; every call is recorded for assertions.
export type Route = { match: string; status?: number; json?: unknown; body?: Buffer | string; headers?: Record<string, string> };
export type Call = { method: string; url: string; headers: Record<string, string>; body: string | null };

export function fakeFetch(routes: Route[]) {
  const calls: Call[] = [];
  const impl = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input);
    const method = (init.method ?? "GET").toUpperCase();
    const headers = Object.fromEntries(Object.entries((init.headers ?? {}) as Record<string, string>).map(([k, v]) => [k.toLowerCase(), v]));
    calls.push({ method, url, headers, body: typeof init.body === "string" ? init.body : init.body ? String(init.body) : null });
    const route = routes.find((r) => {
      const [m, ...rest] = r.match.split(" ");
      return m === method && url.includes(rest.join(" "));
    });
    if (!route) return new Response(JSON.stringify({ message: `no fake route for ${method} ${url}` }), { status: 404 });
    const payload = route.json !== undefined ? JSON.stringify(route.json) : (route.body ?? "");
    return new Response(payload as BodyInit, { status: route.status ?? 200, headers: route.headers ?? { "content-type": "application/json" } });
  }) as typeof fetch;
  return { impl, calls };
}

import { NextResponse, type NextRequest } from "next/server";
import { hiddenOnThisCopy, refusal } from "@/lib/request-guard";

// Runs before every page and API route. On the clinician's computer it refuses
// anything not addressed to this computer, and any change not sent by the
// app's own pages (lib/request-guard.ts). On the Vercel copy it only hides the
// local-only pages (the website chat) behind a plain 404.
export function proxy(request: NextRequest) {
  const api = request.nextUrl.pathname.startsWith("/api/");
  if (hiddenOnThisCopy(request.nextUrl.pathname)) {
    return api
      ? NextResponse.json({ error: "Not found." }, { status: 404 })
      : new NextResponse("Not found.", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
  }
  const reason = refusal(request);
  if (!reason) return NextResponse.next();
  return api
    ? NextResponse.json({ error: reason }, { status: 403 })
    : new NextResponse(reason, { status: 403, headers: { "content-type": "text/plain; charset=utf-8" } });
}

export const config = {
  // Everything except Next's own static files.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

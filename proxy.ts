import { NextResponse, type NextRequest } from "next/server";
import { refusal } from "@/lib/request-guard";

// Runs before every page and API route. On the clinician's computer it refuses
// anything not addressed to this computer, and any change not sent by the
// app's own pages (lib/request-guard.ts). It does nothing on the Vercel copy.
export function proxy(request: NextRequest) {
  const reason = refusal(request);
  if (!reason) return NextResponse.next();
  return request.nextUrl.pathname.startsWith("/api/")
    ? NextResponse.json({ error: reason }, { status: 403 })
    : new NextResponse(reason, { status: 403, headers: { "content-type": "text/plain; charset=utf-8" } });
}

export const config = {
  // Everything except Next's own static files.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

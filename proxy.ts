import { NextResponse, type NextRequest } from "next/server";
import { hiddenApiInDemo, hiddenInDemo } from "@/lib/features";
import { refusal } from "@/lib/request-guard";

// Runs before every page and API route. On the clinician's computer it refuses
// anything not addressed to this computer, and any change not sent by the
// app's own pages (lib/request-guard.ts). In the referrals-only demo, Admin's
// pages redirect to Home and its API routes answer 404.
export function proxy(request: NextRequest) {
  const api = request.nextUrl.pathname.startsWith("/api/");
  // The referrals-only demo's hidden helper (lib/features.ts) answers 404 on its API routes too.
  if (hiddenApiInDemo(request.nextUrl.pathname)) {
    return api
      ? NextResponse.json({ error: "Not found." }, { status: 404 })
      : new NextResponse("Not found.", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
  }
  const reason = refusal(request);
  if (!reason) {
    // The referrals-only demo (lib/features.ts) hides Admin: its pages open Home instead.
    if (!api && hiddenInDemo(request.nextUrl.pathname)) return NextResponse.redirect(new URL("/", request.url));
    return NextResponse.next();
  }
  return api
    ? NextResponse.json({ error: reason }, { status: 403 })
    : new NextResponse(reason, { status: 403, headers: { "content-type": "text/plain; charset=utf-8" } });
}

export const config = {
  // Everything except Next's own static files.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.png).*)"],
};

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const publicPaths = ["/login", "/submit", "/meeting", "/api/", "/_next/", "/favicon.ico"];
  if (publicPaths.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const auth = request.cookies.get("outreach_auth")?.value;
  if (auth !== "authenticated") {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  // public/ 정적 파일(확장자가 있는 경로)은 인증 검사에서 제외한다.
  // 제외하지 않으면 /contact-widget.js 등이 /login HTML로 리다이렉트되어
  // 브라우저에서 "Unexpected token '<'" 구문 오류가 발생한다.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.[\\w]+$).*)"],
};

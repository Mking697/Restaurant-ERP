import { NextResponse, type NextRequest } from "next/server";

// Overwrite the routing hint; never trust a browser-supplied path header.
// Authentication is resolved against the database in the server root layout
// and in every API handler, not in this edge middleware.
export function middleware(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.set("x-restaurant-path", request.nextUrl.pathname);
  return NextResponse.next({ request: { headers } });
}
export const config = { matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"] };

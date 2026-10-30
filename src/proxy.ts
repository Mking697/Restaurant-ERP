import { NextResponse, type NextRequest } from "next/server";

// Overwrite the routing hint; never trust a browser-supplied path header.
// Authentication is resolved against the database in the server root layout
// and in every API handler, not in this edge middleware.
// Renamed from middleware()/middleware.ts to proxy()/proxy.ts for Next.js 16
// (the `middleware` filename/export is deprecated in favor of `proxy` to
// clarify this runs at the network/routing boundary, not business logic).
export function proxy(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.set("x-restaurant-path", request.nextUrl.pathname);
  return NextResponse.next({ request: { headers } });
}
export const config = { matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"] };

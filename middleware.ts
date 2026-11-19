import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/constants";

export function middleware(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const { pathname, search } = request.nextUrl;

  // Page publique de demandes client : accessible sans session, sans exposer les données de la salle.
  const isPublicRequestPage = pathname.startsWith("/demande/");

  if (!token && pathname !== "/connexion" && !isPublicRequestPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/connexion";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (token && pathname === "/connexion") {
    const url = request.nextUrl.clone();
    url.pathname = "/tableau-de-bord";
    url.search = "";
    return NextResponse.redirect(url);
  }

  const response = NextResponse.next();
  if (pathname.startsWith("/imprimer")) {
    response.headers.set("X-Robots-Tag", "noindex");
  }
  void search;
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt).*)"],
};

// Optional Basic auth for the dashboard and agent controls (spend, budget). Set DASHBOARD_PASSWORD whenever others can reach the app.
// /api/ask stays open: it is the public paid API, and the on-chain payment is its auth.
import { NextResponse, type NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const pw = process.env.DASHBOARD_PASSWORD;
  if (!pw) return NextResponse.next();
  const [scheme, b64] = (req.headers.get("authorization") ?? "").split(" ");
  let given = "";
  try {
    given = scheme === "Basic" && b64 ? atob(b64).split(":").slice(1).join(":") : "";
  } catch {}
  if (given === pw) return NextResponse.next();
  return new NextResponse("Authentication required", { status: 401, headers: { "WWW-Authenticate": 'Basic realm="PayPerPrompt"' } });
}

export const config = { matcher: ["/((?!api/ask|_next/static|_next/image|favicon.ico).*)"] };

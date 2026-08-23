import NextAuth from "next-auth";
import { authOptions, missingSpotifyEnv } from "@/lib/authOptions";

const handler = NextAuth(authOptions);

// Without this guard a placeholder client id surfaces as Spotify's opaque
// "INVALID_CLIENT: Invalid client" page, which gives no hint about the cause.
function guard(req: Request, ctx: any) {
  const missing = missingSpotifyEnv();
  if (missing.length > 0) {
    return Response.json(
      {
        error: "Spotify credentials are not configured",
        missing,
        fix: "Set these in .env.local for local dev (then restart `next dev`) and in the Vercel project's Environment Variables for the deployed site. Values come from https://developer.spotify.com/dashboard",
      },
      { status: 500 }
    );
  }
  return handler(req, ctx);
}

export { guard as GET, guard as POST };

import type { NextAuthOptions } from "next-auth";
import SpotifyProvider from "next-auth/providers/spotify";

// Spotify expects a SPACE separated scope list on /authorize.
// (A comma separated list is rejected as an invalid scope.)
const SCOPES = [
  "user-read-email",
  "user-read-private",
  "user-read-playback-state",
  "user-modify-playback-state",
  "user-read-currently-playing",
  "streaming",
  "playlist-read-private",
  "playlist-read-collaborative",
].join(" ");

// A value is "unset" if it is missing or still the placeholder text that
// ships in .env.example. Checked at request time, not import time, so the
// build never fails on a machine that has no secrets.
function isUnset(value: string | undefined) {
  return !value || value.startsWith("your_") || value.includes("_here");
}

/** Returns the names of Spotify env vars that are missing or still placeholders. */
export function missingSpotifyEnv() {
  return (["SPOTIFY_CLIENT_ID", "SPOTIFY_CLIENT_SECRET", "NEXTAUTH_SECRET"] as const).filter(
    (name) => isUnset(process.env[name])
  );
}

export const authOptions: NextAuthOptions = {
  providers: [
    SpotifyProvider({
      clientId: process.env.SPOTIFY_CLIENT_ID ?? "",
      clientSecret: process.env.SPOTIFY_CLIENT_SECRET ?? "",
      authorization: { params: { scope: SCOPES } },
    }),
  ],
  secret: process.env.NEXTAUTH_SECRET,
  callbacks: {
    async jwt({ token, account, user }) {
      if (account && user) {
        return {
          ...token,
          accessToken: account.access_token,
          refreshToken: account.refresh_token,
          username: account.providerAccountId,
          accessTokenExpires: account.expires_at ? account.expires_at * 1000 : 0,
        };
      }

      if (Date.now() < (token.accessTokenExpires as number)) {
        return token;
      }

      return await refreshAccessToken(token);
    },
    async session({ session, token }) {
      // Kept on the session so the existing client-side helpers in
      // src/lib/spotify.ts continue to work. Note this exposes the access
      // token to the browser; /api/now-playing reads it server-side instead.
      // @ts-ignore
      session.user.accessToken = token.accessToken;
      // @ts-ignore
      session.user.username = token.username;
      // @ts-ignore
      session.error = token.error;
      return session;
    },
  },
};

async function refreshAccessToken(token: any) {
  try {
    const authHeader = Buffer.from(
      `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
    ).toString("base64");

    const response = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${authHeader}`,
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: token.refreshToken,
      }),
    });

    const refreshedTokens = await response.json();
    if (!response.ok) throw refreshedTokens;

    return {
      ...token,
      accessToken: refreshedTokens.access_token,
      accessTokenExpires: Date.now() + refreshedTokens.expires_in * 1000,
      refreshToken: refreshedTokens.refresh_token ?? token.refreshToken,
      error: undefined,
    };
  } catch (error) {
    console.error("Error refreshing access token", error);
    return { ...token, error: "RefreshAccessTokenError" };
  }
}

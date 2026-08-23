import { getToken } from "next-auth/jwt";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  const accessToken = token?.accessToken as string | undefined;

  if (!accessToken) {
    return Response.json({ authenticated: false }, { status: 401 });
  }

  if (token?.error === "RefreshAccessTokenError") {
    return Response.json({ authenticated: false, error: "session_expired" }, { status: 401 });
  }

  const res = await fetch(
    "https://api.spotify.com/v1/me/player/currently-playing?additional_types=track,episode",
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    }
  );

  // 204 = nothing is playing right now.
  if (res.status === 204) {
    return Response.json({ authenticated: true, isPlaying: false, track: null });
  }

  if (!res.ok) {
    return Response.json(
      { authenticated: true, error: `spotify_${res.status}` },
      { status: res.status === 401 ? 401 : 502 }
    );
  }

  const data = await res.json();
  const item = data?.item;

  if (!item) {
    return Response.json({ authenticated: true, isPlaying: false, track: null });
  }

  const images = item.album?.images ?? item.images ?? [];

  return Response.json({
    authenticated: true,
    isPlaying: Boolean(data.is_playing),
    progressMs: data.progress_ms ?? 0,
    track: {
      id: item.id,
      title: item.name,
      artist: (item.artists ?? []).map((a: any) => a.name).join(", ") || item.show?.name || "",
      album: item.album?.name ?? item.show?.name ?? "",
      year: (item.album?.release_date ?? item.release_date ?? "").substring(0, 4),
      durationMs: item.duration_ms ?? 0,
      image: images[0]?.url ?? "",
      url: item.external_urls?.spotify ?? "",
    },
  });
}

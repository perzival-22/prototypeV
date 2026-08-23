"use client";

import React, { useState, useEffect, useRef } from "react";
import { useSession, signIn, signOut } from "next-auth/react";
import { getUserPlaylists, getPlaylistTracks, getDevices, playTrack, pausePlayback, resumePlayback } from "@/lib/spotify";

const MOCK_TRACKS = [
  {title:"Long Way Around", artist:"Nala Fontaine", album:"Slow Static", year:1978, dur:243, cover:"linear-gradient(140deg,#ff9d3c 0%,#ff3d6e 45%,#7b1a5c 100%)"},
  {title:"Blue Hour Drive", artist:"The Meridian Set", album:"Nightpost", year:1982, dur:198, cover:"linear-gradient(150deg,#4ea8ff 0%,#4b3ce0 52%,#1a1060 100%)"},
  {title:"Paper Moon Radio", artist:"Odile Marsh", album:"Paper Moon Radio", year:1974, dur:276, cover:"linear-gradient(160deg,#ffe14d 0%,#ff8a3c 48%,#b02a5c 100%)"},
  {title:"Kept in Amber", artist:"Sunroom Quartet", album:"Kept in Amber", year:1991, dur:221, cover:"linear-gradient(135deg,#7dffc4 0%,#12c9a6 46%,#0a5f74 100%)"},
  {title:"Velvet Ledger", artist:"Cass Orme", album:"Second House", year:1986, dur:255, cover:"linear-gradient(145deg,#ff6ee7 0%,#7b5bff 52%,#2a1170 100%)"},
  {title:"After the Encore", artist:"Nala Fontaine", album:"Slow Static", year:1978, dur:189, cover:"linear-gradient(150deg,#fff2d6 0%,#ffb03c 45%,#c2385a 100%)"}
];

const FALLBACK_DEVICES = [
  {name:"Living Room", kind:"Speaker"},
  {name:"Studio Monitors", kind:"Desktop"},
  {name:"iPhone", kind:"Phone"}
];

export default function VinylPlayer({ accent = "#ff3d6e" }) {
  const { data: session } = useSession();
  
  // @ts-ignore
  const token = session?.user?.accessToken;

  const [tracks, setTracks] = useState<any[]>(MOCK_TRACKS);
  const [devices, setDevices] = useState<any[]>(FALLBACK_DEVICES);
  const [playlistName, setPlaylistName] = useState("Sunday Crate");

  const [i, setI] = useState(0);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [vol, setVol] = useState(72);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState(0);
  const [liked, setLiked] = useState<Record<number, boolean>>({});
  const [tab, setTab] = useState("crate");
  const [devicesOpen, setDevicesOpen] = useState(false);
  const [device, setDevice] = useState(0);
  
  const [loading, setLoading] = useState(true);

  // Live mirror of whatever is playing on the Spotify account.
  const [nowPlaying, setNowPlaying] = useState<any>(null);
  const [nowPlayingError, setNowPlayingError] = useState<string | null>(null);

  // Load Spotify Data
  useEffect(() => {
    async function loadSpotifyData() {
      if (token) {
        // Devices and playlists are loaded independently so a failure in one
        // (e.g. no active device) doesn't prevent the other from loading.
        try {
          const devs = await getDevices(token);
          if (devs && devs.devices && devs.devices.length > 0) {
            setDevices(devs.devices.map((d: any) => ({
              id: d.id,
              name: d.name,
              kind: d.type
            })));
          }
        } catch (e) {
          console.error("Error loading devices", e);
        }

        try {
          const pl = await getUserPlaylists(token);
          const items = (pl?.items ?? []).filter((p: any) => p && p.id);
          // Spotify-owned / algorithmic playlists (Discover Weekly, Daily Mix,
          // editorial lists) now 403 on the tracks endpoint for dev-mode apps,
          // so prefer the user's own playlists and fall through on failure
          // instead of blindly trusting items[0].
          const ordered = [
            ...items.filter((p: any) => p.owner?.id && p.owner.id !== "spotify"),
            ...items.filter((p: any) => p.owner?.id === "spotify"),
          ];

          for (const p of ordered) {
            try {
              const trksData = await getPlaylistTracks(p.id, token);
              const mappedTracks = (trksData?.items ?? [])
                .filter((item: any) => item.track)
                .map((item: any) => ({
                  id: item.track.id,
                  uri: item.track.uri,
                  title: item.track.name,
                  artist: item.track.artists.map((a: any) => a.name).join(", "),
                  album: item.track.album.name,
                  year: (item.track.album.release_date ?? "").substring(0, 4),
                  dur: Math.floor(item.track.duration_ms / 1000),
                  cover: item.track.album.images[0] ? `url(${item.track.album.images[0].url})` : "linear-gradient(140deg,#ff9d3c 0%,#ff3d6e 45%,#7b1a5c 100%)",
                  rawCover: item.track.album.images[0] ? item.track.album.images[0].url : ""
                }));
              if (mappedTracks.length > 0) {
                setPlaylistName(p.name);
                setTracks(mappedTracks);
                break; // Loaded a readable playlist - stop looking.
              }
            } catch (e) {
              console.warn(`Skipping unreadable playlist "${p.name}"`, e);
            }
          }
        } catch (e) {
          console.error("Error loading playlists", e);
        }
      }
      setLoading(false);
    }
    loadSpotifyData();
  }, [token]);

  // Poll Spotify for the currently playing track and mirror it.
  useEffect(() => {
    if (!session) return;
    let cancelled = false;

    async function pull() {
      try {
        const res = await fetch("/api/now-playing", { cache: "no-store" });
        if (cancelled) return;

        if (!res.ok) {
          setNowPlayingError(res.status === 401 ? "Session expired - sign in again" : "Could not reach Spotify");
          return;
        }

        const data = await res.json();
        if (cancelled) return;

        setNowPlayingError(null);
        if (data.track) {
          setNowPlaying(data);
          setPlaying(Boolean(data.isPlaying));
          setT(Math.floor((data.progressMs ?? 0) / 1000));
        } else {
          setNowPlaying(null);
          setPlaying(false);
        }
      } catch {
        if (!cancelled) setNowPlayingError("Could not reach Spotify");
      }
    }

    pull();
    const id = setInterval(pull, 5000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [session]);

  // Sync Timer
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (playing) {
      timer = setInterval(() => {
        setT((prevT) => {
          // When mirroring a live track, just tick smoothly between polls -
          // the 5s poll is the source of truth for track changes.
          const liveDur = nowPlaying?.track
            ? Math.floor(nowPlaying.track.durationMs / 1000)
            : null;
          if (liveDur) return Math.min(prevT + 1, liveDur);

          if (!tracks || tracks.length === 0) return 0;
          const d = tracks[i].dur;
          if (prevT + 1 >= d) {
            if (repeat === 2) return 0;
            setI((prevI) => (prevI + 1) % tracks.length);
            return 0;
          }
          return prevT + 1;
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [playing, i, repeat, tracks, nowPlaying]);
  
  // Sync Spotify Playback
  const handlePlayToggle = async () => {
    const isNowPlaying = !playing;
    setPlaying(isNowPlaying);
    
    if (token) {
      const mirroringLive = Boolean(nowPlaying?.track);
      try {
        if (isNowPlaying) {
          if (mirroringLive) {
            // A live track is on screen - resume it, don't start a crate track.
            await resumePlayback(token, devices[device]?.id);
          } else if (tracks[i]?.uri) {
            await playTrack([tracks[i].uri], token, devices[device]?.id);
          }
        } else {
          await pausePlayback(token, devices[device]?.id);
        }
      } catch (e) {
        console.error("Playback error", e);
        setNowPlayingError("Playback failed - is Spotify Premium active on a device?");
      }
    }
  };
  
  const playSpecificTrack = async (idx: number) => {
    setI(idx);
    setT(0);
    setPlaying(true);
    if (token && tracks[idx]?.uri) {
      try {
        await playTrack([tracks[idx].uri], token, devices[device]?.id);
      } catch(e) {}
    }
  };

  const fmt = (s: number) => {
    if (isNaN(s)) return "0:00";
    s = Math.max(0, Math.round(s));
    return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
  };

  const frac = (e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
  };

  if (loading) {
    return <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#170a24", color: "#fff" }}>Loading...</div>;
  }

  // A live track from Spotify wins over the local crate selection.
  const liveTrack = nowPlaying?.track
    ? {
        title: nowPlaying.track.title,
        artist: nowPlaying.track.artist,
        album: nowPlaying.track.album,
        year: nowPlaying.track.year,
        dur: Math.max(1, Math.floor(nowPlaying.track.durationMs / 1000)),
        cover: nowPlaying.track.image
          ? `url(${nowPlaying.track.image})`
          : "linear-gradient(140deg,#ff9d3c 0%,#ff3d6e 45%,#7b1a5c 100%)",
      }
    : null;

  const tr = liveTrack || tracks[i] || MOCK_TRACKS[0];
  const isLiked = !!liked[i];
  const pct = tr.dur > 0 ? Math.min(100, (t / tr.dur) * 100) : 0;
  const upcoming = [];
  for (let k = 1; k <= tracks.length - 1; k++) {
    upcoming.push({ idx: (i + k) % tracks.length, n: k });
  }

  const armAngle = playing ? 26 + pct * 0.13 : -8;
  const armAccent = playing ? "#3de0c8" : "rgba(255,244,236,.35)";

  const next = () => {
    playSpecificTrack(shuffle ? Math.floor(Math.random() * tracks.length) : (i + 1) % tracks.length);
  };

  const prev = () => {
    playSpecificTrack(t > 3 ? i : (i - 1 + tracks.length) % tracks.length);
  };

  const statusLabel = !session
    ? "Not connected"
    : nowPlayingError
    ? nowPlayingError
    : liveTrack
    ? nowPlaying?.isPlaying
      ? "Now spinning"
      : "Paused on Spotify"
    : "Nothing playing";

  const statusColor = !session || nowPlayingError
    ? "#ff3d6e"
    : liveTrack && nowPlaying?.isPlaying
    ? "#3de0c8"
    : "#ffc53d";

  return (
    <div
      style={{
        height: "100vh",
        width: "100vw",
        display: "flex",
        fontFamily: "var(--font-space-grotesk), system-ui, sans-serif",
        color: "#fff4ec",
        background: `radial-gradient(900px 700px at 18% 12%, rgba(255,61,110,.30), transparent 60%),
                     radial-gradient(900px 700px at 82% 20%, rgba(123,91,255,.32), transparent 62%),
                     radial-gradient(1000px 800px at 55% 108%, rgba(61,224,200,.22), transparent 60%),
                     linear-gradient(165deg,#241040 0%,#170a24 55%,#0e0616 100%)`,
      }}
    >
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", padding: "26px 40px 34px" }}>
        
        {/* Top Header */}
        <div style={{ flex: "none", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div
              style={{
                width: "9px",
                height: "9px",
                borderRadius: "50%",
                background: statusColor,
                boxShadow: `0 0 14px ${statusColor}`,
                animation: "glowpulse 2s ease-in-out infinite",
              }}
            ></div>
            <span style={{ fontSize: "11px", letterSpacing: ".24em", textTransform: "uppercase", color: "rgba(255,244,236,.62)" }}>
              {statusLabel}
            </span>
          </div>
          <div style={{ position: "relative" }}>
            {!session ? (
              <button
                onClick={() => signIn("spotify")}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  background: "rgba(255,255,255,.09)",
                  border: "1px solid rgba(255,244,236,.18)",
                  color: "#fff4ec",
                  fontFamily: "inherit",
                  fontSize: "13px",
                  padding: "10px 16px",
                  borderRadius: "999px",
                  cursor: "pointer",
                }}
              >
                Login with Spotify
              </button>
            ) : (
              <button
                onClick={() => setDevicesOpen(!devicesOpen)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  background: "rgba(255,255,255,.09)",
                  border: "1px solid rgba(255,244,236,.18)",
                  color: "#fff4ec",
                  fontFamily: "inherit",
                  fontSize: "13px",
                  padding: "10px 16px",
                  borderRadius: "999px",
                  cursor: "pointer",
                }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                  <path d="M4 8a13 13 0 0 1 16 0"></path>
                  <path d="M7.5 12a8 8 0 0 1 9 0"></path>
                  <path d="M11 15.6a3 3 0 0 1 2 0"></path>
                </svg>
                <span>{devices[device]?.name || "Device"}</span>
              </button>
            )}

            {devicesOpen && session && (
              <div
                style={{
                  position: "absolute",
                  right: 0,
                  top: "calc(100% + 10px)",
                  width: "250px",
                  background: "rgba(36,16,64,.98)",
                  border: "1px solid rgba(255,244,236,.16)",
                  borderRadius: "14px",
                  padding: "6px",
                  zIndex: 40,
                  boxShadow: "0 24px 50px rgba(0,0,0,.6)",
                  animation: "fadeup .18s ease",
                }}
              >
                {devices.map((d, k) => (
                  <button
                    key={k}
                    onClick={() => {
                      setDevice(k);
                      setDevicesOpen(false);
                    }}
                    style={{
                      width: "100%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "10px",
                      background: "transparent",
                      border: 0,
                      color: k === device ? accent : "#fff4ec",
                      fontFamily: "inherit",
                      fontSize: "13px",
                      textAlign: "left",
                      padding: "11px 12px",
                      borderRadius: "10px",
                      cursor: "pointer",
                    }}
                  >
                    <span>{d.name}</span>
                    <span style={{ fontSize: "10px", letterSpacing: ".12em", textTransform: "uppercase", opacity: 0.55 }}>{d.kind}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Vinyl Disc Area */}
        <div style={{ flex: 1, minHeight: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: "14px 0" }}>
          <div style={{ position: "relative", height: "100%", aspectRatio: "1.18", maxWidth: "100%", display: "flex", alignItems: "center", justifyContent: "flex-start" }}>
            <div style={{ position: "relative", height: "100%", aspectRatio: "1" }}>
              <div
                style={{
                  position: "absolute",
                  inset: "-9%",
                  borderRadius: "50%",
                  background: tr.cover,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                  filter: "blur(46px)",
                  opacity: 0.75,
                  animation: "glowpulse 5s ease-in-out infinite",
                }}
              ></div>
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  borderRadius: "50%",
                  overflow: "hidden",
                  boxShadow: "0 40px 90px rgba(0,0,0,.65), inset 0 0 70px rgba(0,0,0,.85)",
                  animation: `spin 4.5s linear infinite`,
                  animationPlayState: playing ? "running" : "paused",
                  background: `repeating-radial-gradient(circle at 50% 50%, rgba(255,255,255,.07) 0 1px, rgba(0,0,0,0) 1px 5px),
                               radial-gradient(circle at 34% 26%, #3d2f4a 0%, #170f1e 46%, #08050b 100%)`,
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    borderRadius: "50%",
                    background: `conic-gradient(from 0deg, rgba(255,61,110,.30), rgba(255,197,61,.12) 18%, rgba(255,255,255,0) 34%, rgba(61,224,200,.26) 52%, rgba(255,255,255,0) 70%, rgba(123,91,255,.32) 88%, rgba(255,61,110,.30))`,
                    mixBlendMode: "screen",
                  }}
                ></div>
                <div
                  style={{
                    position: "absolute",
                    left: "50%",
                    top: "50%",
                    width: "40%",
                    height: "40%",
                    transform: "translate(-50%,-50%)",
                    borderRadius: "50%",
                    overflow: "hidden",
                    boxShadow: "0 0 0 2px rgba(0,0,0,.55), 0 8px 26px rgba(0,0,0,.6)",
                    background: tr.cover,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                  }}
                >
                  <div style={{ position: "absolute", inset: 0, background: "radial-gradient(circle at 28% 22%, rgba(255,255,255,.3), transparent 55%)" }}></div>
                  <div style={{ position: "absolute", left: "50%", top: "50%", width: "10%", height: "10%", transform: "translate(-50%,-50%)", borderRadius: "50%", background: "#0d0812", boxShadow: "inset 0 0 8px rgba(0,0,0,.95),0 0 0 3px rgba(255,255,255,.08)" }}></div>
                </div>
              </div>
            </div>

            {/* Tonearm */}
            <div style={{ position: "absolute", right: 0, top: "6%", width: "14%", aspectRatio: "1", pointerEvents: "none" }}>
              <div style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "radial-gradient(circle at 35% 30%,#efe6f5,#8e83a0 55%,#4b4256)", boxShadow: "0 10px 26px rgba(0,0,0,.55), inset 0 -4px 10px rgba(0,0,0,.35)" }}></div>
              <div style={{ position: "absolute", left: "50%", top: "50%", width: "26%", height: "26%", transform: "translate(-50%,-50%)", borderRadius: "50%", background: armAccent, boxShadow: `0 0 14px ${armAccent}` }}></div>
              <div style={{ position: "absolute", left: "50%", top: "50%", width: "11%", height: "520%", transformOrigin: "50% 0", transform: `translateX(-50%) rotate(${armAngle}deg)`, transition: "transform 1s cubic-bezier(.4,.05,.2,1)" }}>
                <div style={{ position: "absolute", inset: 0, borderRadius: "99px", background: "linear-gradient(90deg,#6e6478,#f2ecf7 42%,#9a90a8)", boxShadow: "0 6px 16px rgba(0,0,0,.5)" }}></div>
                <div style={{ position: "absolute", left: "50%", bottom: "-6%", width: "340%", height: "11%", transform: "translateX(-50%) rotate(18deg)", borderRadius: "3px", background: "linear-gradient(180deg,#fff4ec,#b9aec6)", boxShadow: "0 6px 16px rgba(0,0,0,.55)" }}></div>
                <div style={{ position: "absolute", left: "50%", bottom: "-9%", width: "60%", height: "4%", transform: "translateX(-50%)", borderRadius: "2px", background: armAccent, boxShadow: `0 0 10px ${armAccent}` }}></div>
              </div>
            </div>
          </div>
        </div>

        {/* Controls */}
        <div style={{ flex: "none", display: "flex", flexDirection: "column", alignItems: "center", gap: "14px", width: "100%", maxWidth: "620px", margin: "0 auto" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "4px", textAlign: "center", maxWidth: "100%" }}>
            <span style={{ fontSize: "11.5px", fontWeight: 600, letterSpacing: ".24em", textTransform: "uppercase", color: "#ffc53d" }}>
              {tr.album} · {tr.year}
            </span>
            <h1 style={{ margin: 0, fontFamily: "var(--font-instrument-serif), Georgia, serif", fontWeight: 400, fontSize: "clamp(28px,4.4vh,52px)", lineHeight: 1.04, letterSpacing: "-.01em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" }}>
              {tr.title}
            </h1>
            <p style={{ margin: 0, fontSize: "15px", color: "rgba(255,244,236,.66)" }}>{tr.artist}</p>
          </div>

          {/* Progress Bar */}
          <div style={{ width: "100%", display: "flex", alignItems: "center", gap: "12px" }}>
            <span style={{ fontSize: "11px", fontVariantNumeric: "tabular-nums", color: "rgba(255,244,236,.5)", width: "36px" }}>{fmt(t)}</span>
            <div onClick={e => setT(frac(e) * tr.dur)} style={{ position: "relative", flex: 1, height: "20px", display: "flex", alignItems: "center", cursor: "pointer" }}>
              <div style={{ position: "absolute", left: 0, right: 0, height: "4px", borderRadius: "99px", background: "rgba(255,244,236,.16)" }}></div>
              <div style={{ position: "absolute", left: 0, height: "4px", borderRadius: "99px", background: "linear-gradient(90deg,#7b5bff,#ff3d6e 55%,#ffc53d)", width: `${pct}%` }}></div>
              <div style={{ position: "absolute", width: "13px", height: "13px", borderRadius: "50%", background: "#fff4ec", boxShadow: "0 0 12px rgba(255,61,110,.9)", left: `${pct}%`, marginLeft: "-6px" }}></div>
            </div>
            <span style={{ fontSize: "11px", fontVariantNumeric: "tabular-nums", color: "rgba(255,244,236,.5)", width: "36px", textAlign: "right" }}>{fmt(tr.dur)}</span>
          </div>

          {/* Player Buttons */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "14px" }}>
            <button onClick={() => setShuffle(!shuffle)} title="Shuffle" style={{ flex: "none", background: "transparent", border: 0, padding: "8px", cursor: "pointer", color: shuffle ? accent : "rgba(255,244,236,.6)" }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M16 3h5v5"></path><path d="M4 20 21 3"></path><path d="M21 16v5h-5"></path><path d="m15 15 6 6"></path><path d="M4 4l5 5"></path></svg>
            </button>
            <button onClick={prev} title="Previous" style={{ flex: "none", background: "transparent", border: 0, padding: "8px", cursor: "pointer", color: "#fff4ec" }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h2v14H6zM20 5v14L9.5 12z"></path></svg>
            </button>
            <button onClick={handlePlayToggle} title="Play / pause" style={{ flex: "none", width: "68px", height: "68px", borderRadius: "50%", border: 0, cursor: "pointer", background: "linear-gradient(145deg,#ffc53d,#ff3d6e 65%,#7b5bff)", color: "#1c0b16", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 12px 36px rgba(255,61,110,.5)" }}>
              {playing ? (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4.2" height="16" rx="1"></rect><rect x="13.8" y="4" width="4.2" height="16" rx="1"></rect></svg>
              ) : (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" style={{ marginLeft: "4px" }}><path d="M7 4.5v15L20 12z"></path></svg>
              )}
            </button>
            <button onClick={next} title="Next" style={{ flex: "none", background: "transparent", border: 0, padding: "8px", cursor: "pointer", color: "#fff4ec" }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M16 5h2v14h-2zM4 5v14l10.5-7z"></path></svg>
            </button>
            <button onClick={() => setRepeat((repeat + 1) % 3)} title="Repeat" style={{ flex: "none", background: "transparent", border: 0, padding: "8px", cursor: "pointer", position: "relative", color: repeat ? accent : "rgba(255,244,236,.6)" }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17 2l4 4-4 4"></path><path d="M3 11v-1a4 4 0 0 1 4-4h14"></path><path d="M7 22l-4-4 4-4"></path><path d="M21 13v1a4 4 0 0 1-4 4H3"></path></svg>
              <span style={{ position: "absolute", right: "2px", bottom: "2px", fontSize: "9px", fontWeight: 700, lineHeight: 1 }}>{repeat === 2 ? "1" : ""}</span>
            </button>
            <div style={{ flex: "none", width: "1px", height: "24px", background: "rgba(255,244,236,.18)" }}></div>
            <button onClick={() => setLiked({ ...liked, [i]: !liked[i] })} title="Save" style={{ flex: "none", background: "transparent", border: 0, padding: "8px", cursor: "pointer", color: isLiked ? accent : "rgba(255,244,236,.6)" }}>
              <svg width="21" height="21" viewBox="0 0 24 24" fill={isLiked ? accent : "none"} stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"><path d="M12 20.3 4.6 13a4.6 4.6 0 0 1 6.5-6.5l.9.9.9-.9A4.6 4.6 0 1 1 19.4 13z"></path></svg>
            </button>
            
            {/* Volume */}
            <div style={{ flex: "none", display: "flex", alignItems: "center", gap: "10px", width: "132px" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,244,236,.6)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M4 9v6h3.5L13 20V4L7.5 9z"></path><path d="M17 9.5a3.5 3.5 0 0 1 0 5"></path></svg>
              <div onClick={e => setVol(Math.round(frac(e) * 100))} style={{ position: "relative", flex: 1, height: "18px", display: "flex", alignItems: "center", cursor: "pointer" }}>
                <div style={{ position: "absolute", left: 0, right: 0, height: "3px", borderRadius: "99px", background: "rgba(255,244,236,.16)" }}></div>
                <div style={{ position: "absolute", left: 0, height: "3px", borderRadius: "99px", background: "#3de0c8", width: `${vol}%` }}></div>
                <div style={{ position: "absolute", width: "10px", height: "10px", borderRadius: "50%", background: "#fff4ec", left: `${vol}%`, marginLeft: "-5px" }}></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Side Panel */}
      <div style={{ width: "min(380px,32%)", minWidth: "288px", flex: "none", borderLeft: "1px solid rgba(255,244,236,.12)", background: "rgba(14,6,22,.5)", display: "flex", flexDirection: "column", padding: "26px 24px 24px", backdropFilter: "blur(8px)" }}>
        <div style={{ flex: "none", display: "flex", gap: "6px", padding: "4px", background: "rgba(255,255,255,.07)", borderRadius: "999px", marginBottom: "20px" }}>
          <button onClick={() => setTab("crate")} style={{ flex: 1, border: 0, cursor: "pointer", fontFamily: "inherit", fontSize: "11.5px", letterSpacing: ".12em", textTransform: "uppercase", padding: "10px", borderRadius: "999px", background: tab === "crate" ? "#fff4ec" : "transparent", color: tab === "crate" ? "#1c0b16" : "rgba(255,244,236,.65)" }}>Crate</button>
          <button onClick={() => setTab("queue")} style={{ flex: 1, border: 0, cursor: "pointer", fontFamily: "inherit", fontSize: "11.5px", letterSpacing: ".12em", textTransform: "uppercase", padding: "10px", borderRadius: "999px", background: tab === "queue" ? "#fff4ec" : "transparent", color: tab === "queue" ? "#1c0b16" : "rgba(255,244,236,.65)" }}>Up next</button>
        </div>

        {tab === "crate" && (
          <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
            <div style={{ flex: "none", display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: "12px" }}>
              <span style={{ fontFamily: "var(--font-instrument-serif), Georgia, serif", fontSize: "23px" }}>{playlistName}</span>
              <span style={{ fontSize: "11px", color: "rgba(255,244,236,.5)" }}>{tracks.length} records</span>
            </div>
            <div style={{ flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden", padding: "10px 4px 40px" }}>
              {tracks.map((s, k) => {
                const isActive = k === i;
                const shift = isActive ? 0 : -14 + (k % 2) * 5;
                const rot = isActive ? 0 : (k % 2 ? -1.2 : 1.2);
                return (
                  <div key={k} onClick={() => playSpecificTrack(k)} style={{ position: "relative", cursor: "pointer", marginTop: k === 0 ? "0px" : "-16px", transform: `translateX(${shift}px) rotate(${rot}deg)`, transition: "transform .28s cubic-bezier(.2,.8,.3,1)" }}>
                    <div style={{ display: "flex", gap: "14px", alignItems: "center", padding: "11px 12px 28px", borderRadius: "6px", background: "linear-gradient(155deg,rgba(255,255,255,.11),rgba(255,255,255,.03))", border: `1px solid ${isActive ? accent : "rgba(255,244,236,.12)"}`, boxShadow: "0 14px 30px rgba(0,0,0,.5)", opacity: isActive ? 1 : 0.82 }}>
                      <div style={{ position: "relative", flex: "none", width: "64px", height: "64px", borderRadius: "3px", background: s.cover, backgroundSize: "cover", backgroundPosition: "center", boxShadow: "0 4px 14px rgba(0,0,0,.4)" }}>
                        <div style={{ position: "absolute", right: "-12px", top: "50%", width: "54px", height: "54px", transform: "translateY(-50%)", borderRadius: "50%", background: "radial-gradient(circle,#3a3145 0 20%,#120c18 21%)", boxShadow: "0 4px 10px rgba(0,0,0,.5)", opacity: isActive ? 1 : 0.45 }}></div>
                        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(105deg,rgba(255,255,255,.22),transparent 46%)" }}></div>
                      </div>
                      <div style={{ minWidth: 0, flex: 1, display: "flex", flexDirection: "column", gap: "2px" }}>
                        <span style={{ fontSize: "14.5px", fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: isActive ? accent : "#fff4ec" }}>{s.title}</span>
                        <span style={{ fontSize: "12.5px", color: "rgba(255,244,236,.58)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.artist}</span>
                        <span style={{ fontSize: "10.5px", letterSpacing: ".1em", textTransform: "uppercase", color: "rgba(255,244,236,.38)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.album} · {fmt(s.dur)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {tab === "queue" && (
          <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
            {upcoming.map((u, idx) => {
              const q = tracks[u.idx];
              return (
                <div key={idx} onClick={() => playSpecificTrack(u.idx)} style={{ display: "flex", alignItems: "center", gap: "13px", padding: "10px", borderRadius: "10px", cursor: "pointer" }}>
                  <span style={{ width: "20px", fontSize: "12px", fontVariantNumeric: "tabular-nums", color: "rgba(255,244,236,.4)" }}>{u.n}</span>
                  <div style={{ width: "40px", height: "40px", flex: "none", borderRadius: "4px", background: q.cover, backgroundSize: "cover", backgroundPosition: "center" }}></div>
                  <div style={{ minWidth: 0, flex: 1, display: "flex", flexDirection: "column" }}>
                    <span style={{ fontSize: "13.5px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{q.title}</span>
                    <span style={{ fontSize: "12px", color: "rgba(255,244,236,.55)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{q.artist}</span>
                  </div>
                  <span style={{ fontSize: "11.5px", fontVariantNumeric: "tabular-nums", color: "rgba(255,244,236,.45)" }}>{fmt(q.dur)}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

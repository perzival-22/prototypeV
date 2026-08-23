export async function fetchWebApi(endpoint: string, method: string, body?: any, token?: string) {
  if (!token) return null;
  const res = await fetch(`https://api.spotify.com/v1/${endpoint}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    method,
    body: body ? JSON.stringify(body) : undefined,
  });
  
  if (res.status === 204) return null; // No Content
  if (res.status === 401) {
    throw new Error("Token expired or invalid");
  }
  
  return await res.json();
}

export async function getUserPlaylists(token: string) {
  return fetchWebApi("me/playlists?limit=10", "GET", undefined, token);
}

export async function getPlaylistTracks(playlistId: string, token: string) {
  return fetchWebApi(`playlists/${playlistId}/tracks?limit=20`, "GET", undefined, token);
}

export async function playTrack(uris: string[], token: string, deviceId?: string) {
  const endpoint = deviceId ? `me/player/play?device_id=${deviceId}` : "me/player/play";
  return fetchWebApi(endpoint, "PUT", { uris }, token);
}

export async function pausePlayback(token: string, deviceId?: string) {
  const endpoint = deviceId ? `me/player/pause?device_id=${deviceId}` : "me/player/pause";
  return fetchWebApi(endpoint, "PUT", undefined, token);
}

export async function getDevices(token: string) {
  return fetchWebApi("me/player/devices", "GET", undefined, token);
}

import { CONFIG } from "./config.js";
import { ensureValidToken } from "./auth.js";

let player = null;
let deviceId = null;
let sdkReady = false;

function formatApiError(status, text) {
  if (status === 401) return "Sessione scaduta. Rifai login.";
  if (status === 403) return "Account non Premium o scope mancanti.";
  if (status === 404) return "Nessun device pronto. Attendi il player e riprova.";
  return `Errore Spotify (${status}): ${text}`;
}

async function api(path, { method = "GET", query = null, body = null } = {}) {
  const token = await ensureValidToken();
  if (!token) throw new Error("Non autenticato. Effettua il login.");

  const url = new URL(CONFIG.API_BASE + path);
  if (query) Object.entries(query).forEach(([k, v]) => url.searchParams.set(k, v));

  const res = await fetch(url.toString(), {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(formatApiError(res.status, text));
  }

  if (res.status === 204) return null;
  return res.json();
}

export function getDeviceId() {
  return deviceId;
}

export function isSdkReady() {
  return sdkReady && Boolean(deviceId);
}

export async function initSpotifyPlayer({ onStatus } = {}) {
  if (isSdkReady()) return player;

  await ensureValidToken();

  await new Promise((resolve, reject) => {
    const start = Date.now();
    const iv = setInterval(() => {
      if (window.Spotify?.Player) {
        clearInterval(iv);
        resolve();
      }
      if (Date.now() - start > 10_000) {
        clearInterval(iv);
        reject(new Error("Spotify Web Playback SDK non caricata."));
      }
    }, 50);
  });

  player = new window.Spotify.Player({
    name: "Hitster Web Player",
    getOAuthToken: async (cb) => cb(await ensureValidToken()),
    volume: 0.9,
  });

  player.addListener("ready", ({ device_id }) => {
    deviceId = device_id;
    sdkReady = true;
    onStatus?.({ type: "ready", deviceId });
  });

  player.addListener("not_ready", ({ device_id }) => {
    onStatus?.({ type: "not_ready", deviceId: device_id });
  });

  player.addListener("initialization_error", ({ message }) => onStatus?.({ type: "error", message }));
  player.addListener("authentication_error", ({ message }) => onStatus?.({ type: "error", message: `Auth: ${message}` }));
  player.addListener("account_error", ({ message }) => onStatus?.({ type: "error", message: `Account: ${message}` }));
  player.addListener("playback_error", ({ message }) => onStatus?.({ type: "error", message: `Playback: ${message}` }));

  const ok = await player.connect();
  if (!ok) throw new Error("Connessione al player Spotify fallita.");

  return player;
}

export async function transferPlaybackToBrowser({ autoplay = false } = {}) {
  if (!deviceId) throw new Error("Device browser non disponibile.");

  let lastError = null;
  for (let i = 0; i <= CONFIG.TRANSFER_RETRY; i += 1) {
    try {
      await api("/me/player", {
        method: "PUT",
        body: { device_ids: [deviceId], play: autoplay },
      });
      return;
    } catch (error) {
      lastError = error;
      await new Promise((r) => setTimeout(r, 250 * (i + 1)));
    }
  }

  throw lastError || new Error("Transfer playback fallito.");
}

export async function ensureBrowserIsActiveDevice() {
  await transferPlaybackToBrowser({ autoplay: false });
}

export async function getTrackInfo(trackId) {
  const track = await api(`/tracks/${trackId}`);
  return {
    uri: track?.uri || `spotify:track:${trackId}`,
    durationMs: track?.duration_ms || 0,
    title: track?.name || "Sconosciuto",
    artist: (track?.artists || []).map((a) => a.name).join(", ") || "Sconosciuto",
  };
}

export async function playTrackAtPosition({ trackUri, positionMs }) {
  if (!deviceId) throw new Error("Device browser non pronto.");

  await api("/me/player/play", {
    method: "PUT",
    query: { device_id: deviceId },
    body: {
      uris: [trackUri],
      position_ms: Math.max(0, Math.floor(positionMs || 0)),
    },
  });
}

export async function pausePlayback() {
  if (player) {
    try {
      await player.pause();
      return;
    } catch {
      // fallback web api
    }
  }

  await api("/me/player/pause", { method: "PUT" });
}
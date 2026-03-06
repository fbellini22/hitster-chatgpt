import { CONFIG } from "./config.js";

let qrInstance = null;
let scanning = false;
let lastPayload = "";
let lastScanAt = 0;

export function parseSpotifyTrackId(payload) {
    if (!payload || typeof payload !== "string") return null;

    const uriMatch = payload.match(/spotify:track:([A-Za-z0-9]{22})/);
    if (uriMatch) return uriMatch[1];

    const webMatch = payload.match(/open\.spotify\.com\/track\/([A-Za-z0-9]{22})/);
    if (webMatch) return webMatch[1];

    const webWithQuery = payload.match(/\/track\/([A-Za-z0-9]{22})\?/);
    if (webWithQuery) return webWithQuery[1];

    if (payload.includes("spotify.link/")) return "SHORT_LINK_UNSUPPORTED";
    return null;
}

export async function startQrScan({ regionId = "qrRegion", onTrackId, onError, onStatus } = {}) {
    if (scanning) return;

    const region = document.getElementById(regionId);
    if (!region) throw new Error(`Elemento #${regionId} non trovato.`);

    region.innerHTML = "";
    scanning = true;
    lastPayload = "";
    onStatus?.("Avvio fotocamera...");

    qrInstance = new Html5Qrcode(regionId);

    const onSuccess = (decodedText) => {
        const now = Date.now();
        if (now - lastScanAt < CONFIG.QR_DEBOUNCE_MS) return;
        if (decodedText === lastPayload) return;

        lastPayload = decodedText;
        lastScanAt = now;

        const trackId = parseSpotifyTrackId(decodedText);
        if (!trackId) {
            onError?.("QR non valido. Usa link Spotify track o URI spotify:track:...");
            return;
        }
        if (trackId === "SHORT_LINK_UNSUPPORTED") {
            onError?.("Link spotify.link non supportato lato statico. Usa open.spotify.com/track/<id>.");
            return;
        }

        onTrackId?.(trackId);
    };

    try {
        await qrInstance.start(
            { facingMode: "environment" },
            { fps: 12, qrbox: { width: 260, height: 260 }, aspectRatio: 1.0 },
            onSuccess,
            () => { }
        );
        onStatus?.("Inquadra il QR della carta...");
    } catch {
        scanning = false;
        onError?.("Camera non accessibile. Verifica permessi browser e HTTPS.");
    }
}

export async function stopQrScan() {
    if (!qrInstance) {
        scanning = false;
        return;
    }

    try {
        if (scanning) await qrInstance.stop();
    } catch {
        // no-op
    }

    try {
        await qrInstance.clear();
    } catch {
        // no-op
    }

    qrInstance = null;
    scanning = false;
}
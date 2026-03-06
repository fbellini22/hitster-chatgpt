import { CONFIG } from "./config.js";
import { login, clearAuth, isLoggedIn, handleAuthCallbackIfPresent } from "./auth.js";
import {
    initSpotifyPlayer,
    isSdkReady,
    getDeviceId,
    ensureBrowserIsActiveDevice,
    getTrackInfo,
    playTrackAtPosition,
    pausePlayback,
} from "./spotify.js";
import { startQrScan, stopQrScan } from "./qr.js";
import { STATES, setState, getState } from "./state.js";

const modal = {
    root: () => document.getElementById("errorModal"),
    text: () => document.getElementById("errorText"),
    close: () => document.getElementById("closeErrorBtn"),
    retry: () => document.getElementById("retryBtn"),
};

let scanLock = false;
let playbackLock = false;
let roundToken = 0;
let countdownInterval = null;
let stopTimeout = null;
let currentTrack = null;

function bindModalClose() {
    modal.close()?.addEventListener("click", () => modal.root()?.classList.add("hidden"));
}

function showError(message, retry = null) {
    modal.text().textContent = message;
    modal.root().classList.remove("hidden");
    modal.retry().onclick = async () => {
        modal.root().classList.add("hidden");
        if (retry) await retry();
    };
}

function pickOffset(durationMs) {
    if (!durationMs || durationMs <= 0) return { offsetMs: 0, playMs: CONFIG.PLAY_WINDOW_MS };
    if (durationMs <= CONFIG.PLAY_WINDOW_MS) return { offsetMs: 0, playMs: durationMs };

    const maxOffset = durationMs - CONFIG.PLAY_WINDOW_MS;
    const offsetMs = Math.floor(Math.random() * (maxOffset + 1));
    return { offsetMs, playMs: CONFIG.PLAY_WINDOW_MS };
}

function clearRoundTimers() {
    if (countdownInterval) {
        clearInterval(countdownInterval);
        countdownInterval = null;
    }
    if (stopTimeout) {
        clearTimeout(stopTimeout);
        stopTimeout = null;
    }
}

async function stopEverything() {
    scanLock = false;
    clearRoundTimers();
    try { await stopQrScan(); } catch { }
    try { await pausePlayback(); } catch { }
    playbackLock = false;
}

function startCountdown(playMs) {
    const t0 = performance.now();
    const timerNum = document.getElementById("timerNum");
    const timerBar = document.getElementById("timerBar");

    const tick = () => {
        const elapsed = performance.now() - t0;
        const remaining = Math.max(0, playMs - elapsed);
        if (timerNum) timerNum.textContent = String(Math.ceil(remaining / 1000));
        if (timerBar) timerBar.style.width = `${Math.min(100, (elapsed / playMs) * 100)}%`;
        if (remaining <= 0) {
            clearInterval(countdownInterval);
            countdownInterval = null;
        }
    };

    tick();
    countdownInterval = setInterval(tick, 80);
}

async function startRound(trackId) {
    if (playbackLock) return;
    playbackLock = true;
    roundToken += 1;
    const thisRound = roundToken;

    await ensureBrowserIsActiveDevice();
    const info = await getTrackInfo(trackId);
    const { offsetMs, playMs } = pickOffset(info.durationMs);

    currentTrack = { ...info, trackId, offsetMs, playMs };

    setState(STATES.playing, { deviceId: getDeviceId() });
    bindUiHandlers();

    await playTrackAtPosition({ trackUri: info.uri, positionMs: offsetMs });

    startCountdown(playMs);

    stopTimeout = setTimeout(async () => {
        if (thisRound !== roundToken) return;
        if (getState() !== STATES.playing) return;

        try {
            await pausePlayback();
        } finally {
            playbackLock = false;
            setState(STATES.reveal, { title: info.title, artist: info.artist });
            bindUiHandlers();
        }
    }, playMs);
}

async function goScanning() {
    if (scanLock) return;
    scanLock = true;

    await stopEverything();
    scanLock = true;

    setState(STATES.scanning, { deviceId: getDeviceId() });
    bindUiHandlers();

    await startQrScan({
        regionId: "qrRegion",
        onStatus: (msg) => {
            const hint = document.getElementById("scanHint");
            if (hint) hint.textContent = msg;
        },
        onError: (msg) => showError(msg),
        onTrackId: async (trackId) => {
            if (!scanLock || playbackLock) return;
            scanLock = false;

            try {
                await stopQrScan();
                await startRound(trackId);
            } catch (error) {
                await stopEverything();
                setState(STATES.ready, { deviceId: getDeviceId() });
                bindUiHandlers();
                showError(error.message);
            }
        },
    });
}

async function ensureReadyState() {
    setState(STATES.logging_in, { deviceId: getDeviceId() || "--" });

    if (!isSdkReady()) {
        await initSpotifyPlayer({
            onStatus: (ev) => {
                if (ev.type === "ready") setState(STATES.logging_in, { deviceId: ev.deviceId });
                if (ev.type === "error") showError(ev.message);
            },
        });
    }

    await ensureBrowserIsActiveDevice();

    setState(STATES.ready, { deviceId: getDeviceId() });
    bindUiHandlers();
}

function bindUiHandlers() {
    const state = getState();

    if (state === STATES.logged_out) {
        document.getElementById("loginBtn")?.addEventListener("click", async () => {
            setState(STATES.logging_in, { deviceId: "--" });
            await login();
        });
        return;
    }

    if (state === STATES.ready) {
        document.getElementById("scanBtn")?.addEventListener("click", goScanning);
        document.getElementById("logoutBtn")?.addEventListener("click", async () => {
            await stopEverything();
            clearAuth();
            currentTrack = null;
            setState(STATES.logged_out);
            bindUiHandlers();
        });
        return;
    }

    if (state === STATES.scanning) {
        document.getElementById("stopScanBtn")?.addEventListener("click", async () => {
            scanLock = false;
            await stopQrScan();
            setState(STATES.ready, { deviceId: getDeviceId() });
            bindUiHandlers();
        });
        return;
    }

    if (state === STATES.playing) {
        document.getElementById("stopBtn")?.addEventListener("click", async () => {
            roundToken += 1;
            await stopEverything();
            setState(STATES.ready, { deviceId: getDeviceId() });
            bindUiHandlers();
        });
        return;
    }

    if (state === STATES.reveal) {
        document.getElementById("nextBtn")?.addEventListener("click", () => {
            currentTrack = null;
            setState(STATES.ready, { deviceId: getDeviceId() });
            bindUiHandlers();
        });
        return;
    }

    if (state === STATES.error) {
        document.getElementById("toReadyBtn")?.addEventListener("click", () => {
            setState(isLoggedIn() ? STATES.ready : STATES.logged_out, { deviceId: getDeviceId() });
            bindUiHandlers();
        });
    }
}

async function boot() {
    bindModalClose();

    const callbackResult = await handleAuthCallbackIfPresent();
    if (!callbackResult.ok) {
        setState(STATES.logged_out);
        bindUiHandlers();
        showError(callbackResult.error);
        return;
    }

    if (!isLoggedIn()) {
        setState(STATES.logged_out);
        bindUiHandlers();
        return;
    }

    try {
        await ensureReadyState();
    } catch (error) {
        setState(STATES.logged_out);
        bindUiHandlers();
        showError(error.message, boot);
    }
}

boot();

document.addEventListener("visibilitychange", async () => {
    if (document.hidden && getState() === STATES.playing) {
        roundToken += 1;
        await stopEverything();
        setState(STATES.ready, { deviceId: getDeviceId() });
        bindUiHandlers();
    }
});

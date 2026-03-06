import { CONFIG } from "./config.js";

const LS = {
    accessToken: "hitster_access_token",
    refreshToken: "hitster_refresh_token",
    expiresAt: "hitster_expires_at",
    verifier: "hitster_pkce_verifier",
};

function b64Url(bytes) {
    const raw = btoa(String.fromCharCode(...new Uint8Array(bytes)));
    return raw.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function randomVerifier(length = 64) {
    const arr = new Uint8Array(length);
    crypto.getRandomValues(arr);
    return b64Url(arr);
}

async function createChallenge(verifier) {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
    return b64Url(digest);
}

export function clearAuth() {
    Object.values(LS).forEach((k) => localStorage.removeItem(k));
}

export function getAccessToken() {
    return localStorage.getItem(LS.accessToken);
}

export function isLoggedIn() {
    const token = getAccessToken();
    const expiresAt = Number(localStorage.getItem(LS.expiresAt) || 0);
    return Boolean(token) && Date.now() < expiresAt - 10_000;
}

export async function ensureValidToken() {
    if (isLoggedIn()) return getAccessToken();

    const refresh = localStorage.getItem(LS.refreshToken);
    if (!refresh) return null;

    const body = new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refresh,
        client_id: CONFIG.CLIENT_ID,
    });

    const res = await fetch(CONFIG.TOKEN_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
    });

    if (!res.ok) {
        clearAuth();
        return null;
    }

    const data = await res.json();
    localStorage.setItem(LS.accessToken, data.access_token);
    localStorage.setItem(LS.expiresAt, String(Date.now() + data.expires_in * 1000));
    if (data.refresh_token) localStorage.setItem(LS.refreshToken, data.refresh_token);
    return data.access_token;
}

export async function login() {
    const verifier = randomVerifier();
    const challenge = await createChallenge(verifier);
    localStorage.setItem(LS.verifier, verifier);

    const params = new URLSearchParams({
        client_id: CONFIG.CLIENT_ID,
        response_type: "code",
        redirect_uri: CONFIG.REDIRECT_URI,
        scope: CONFIG.SCOPES.join(" "),
        code_challenge_method: "S256",
        code_challenge: challenge,
    });

    window.location.assign(`${CONFIG.AUTH_ENDPOINT}?${params.toString()}`);
}

export async function handleAuthCallbackIfPresent() {
    const url = new URL(window.location.href);
    const code = url.searchParams.get("code");
    const error = url.searchParams.get("error");

    if (error) return { ok: false, handled: true, error: `Autorizzazione Spotify fallita: ${error}` };
    if (!code) return { ok: true, handled: false };

    const verifier = localStorage.getItem(LS.verifier);
    if (!verifier) return { ok: false, handled: true, error: "PKCE verifier mancante. Riprova login." };

    const body = new URLSearchParams({
        client_id: CONFIG.CLIENT_ID,
        grant_type: "authorization_code",
        code,
        redirect_uri: CONFIG.REDIRECT_URI,
        code_verifier: verifier,
    });

    const res = await fetch(CONFIG.TOKEN_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
    });

    if (!res.ok) {
        return { ok: false, handled: true, error: `Token exchange fallito (${res.status}).` };
    }

    const data = await res.json();
    localStorage.setItem(LS.accessToken, data.access_token);
    localStorage.setItem(LS.expiresAt, String(Date.now() + data.expires_in * 1000));
    if (data.refresh_token) localStorage.setItem(LS.refreshToken, data.refresh_token);

    url.searchParams.delete("code");
    url.searchParams.delete("state");
    window.history.replaceState({}, document.title, url.toString());

    return { ok: true, handled: true };
}
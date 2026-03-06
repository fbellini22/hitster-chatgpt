export const CONFIG = {
    // Inserisci qui il tuo Spotify App Client ID (NON usare mai il client secret in frontend)
    CLIENT_ID: "1031669a52cf4742b6e908a536a247e5",

    // Deve combaciare esattamente con Redirect URI registrato in Spotify Developer Dashboard
    // Esempio locale: "http://127.0.0.1:5500/index.html"
    // Esempio deploy: "https://tuo-sito.netlify.app/index.html"
    REDIRECT_URI: "http://127.0.0.1:5500/index.html",

    AUTH_ENDPOINT: "https://accounts.spotify.com/authorize",
    TOKEN_ENDPOINT: "https://accounts.spotify.com/api/token",
    API_BASE: "https://api.spotify.com/v1",

    SCOPES: [
        "streaming",
        "user-read-email",
        "user-read-private",
        "user-read-playback-state",
        "user-modify-playback-state",
        "user-read-currently-playing"
    ],

    PLAY_WINDOW_MS: 30_000,
    QR_DEBOUNCE_MS: 1_500,
    TRANSFER_RETRY: 2
};
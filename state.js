export const STATES = {
    logged_out: "logged_out",
    logging_in: "logging_in",
    ready: "ready",
    scanning: "scanning",
    playing: "playing",
    reveal: "reveal",
    error: "error",
};

let currentState = STATES.logged_out;

const ui = {
    badge: () => document.getElementById("stateBadge"),
    panel: () => document.getElementById("panel"),
};

function labelForState(state) {
    return String(state || "unknown").replaceAll("_", " ").toUpperCase();
}

export function getState() {
    return currentState;
}

export function setState(nextState, payload = {}) {
    currentState = nextState;
    render(payload);
}

export function render(payload = {}) {
    ui.badge().textContent = labelForState(currentState);

    const panel = ui.panel();
    if (!panel) return;

    if (currentState === STATES.logged_out) {
        panel.innerHTML = `
      <h2 class="h1">Login Spotify</h2>
      <p class="p">Premi Login per collegare il tuo account Premium e trasformare questo browser nel player.</p>
      <div class="hr"></div>
      <button id="loginBtn" class="btn primary">LOGIN</button>
      <p class="small">Spotify Premium richiesto per Web Playback SDK.</p>
    `;
        return;
    }

    if (currentState === STATES.logging_in) {
        panel.innerHTML = `
      <h2 class="h1">Connetto il device...</h2>
      <p class="p">Inizializzo Spotify SDK e trasferisco il playback sul browser.</p>
      <div class="hr"></div>
      <button class="btn" disabled>ATTENDI</button>
      <div class="kv"><div class="k">Device</div><div class="v">${payload.deviceId || "--"}</div></div>
    `;
        return;
    }

    if (currentState === STATES.ready) {
        panel.innerHTML = `
      <h2 class="h1">Pronto a giocare</h2>
      <p class="p">Premi SCAN e inquadra una carta con QR Spotify track.</p>
      <div class="hr"></div>
      <button id="scanBtn" class="btn primary">SCAN</button>
      <div class="row"><button id="logoutBtn" class="btn danger">LOGOUT</button></div>
      <div class="kv"><div class="k">Device</div><div class="v">${payload.deviceId ? "Browser Player attivo" : "non attivo"}</div></div>
    `;
        return;
    }

    if (currentState === STATES.scanning) {
        panel.innerHTML = `
      <h2 class="h1">Scansione...</h2>
      <p class="p" id="scanHint">Inquadra il QR code.</p>
      <div id="qrRegion"></div>
      <div class="row"><button id="stopScanBtn" class="btn">ANNULLA</button></div>
      <p class="small">Supportati: open.spotify.com/track/<id> e spotify:track:<id>.</p>
    `;
        return;
    }

    if (currentState === STATES.playing) {
        panel.innerHTML = `
      <h2 class="h1">In riproduzione...</h2>
      <p class="p">Ascolta il frammento e prova a indovinare.</p>
      <div class="timerWrap">
        <div id="timerNum" class="timerNum">30</div>
        <div class="progress"><div id="timerBar"></div></div>
      </div>
      <div class="row"><button id="stopBtn" class="btn danger">STOP</button></div>
    `;
        return;
    }

    if (currentState === STATES.reveal) {
        panel.innerHTML = `
      <h2 class="h1">Reveal</h2>
      <p class="p">Ecco la canzone della carta.</p>
      <div id="revealCard" class="revealCard">
        <div class="trackTitle">${payload.title || "--"}</div>
        <div class="trackArtist">${payload.artist || "--"}</div>
      </div>
      <div class="hr"></div>
      <button id="nextBtn" class="btn primary">NEXT</button>
    `;

        requestAnimationFrame(() => document.getElementById("revealCard")?.classList.add("show"));
        return;
    }

    panel.innerHTML = `
    <h2 class="h1">Errore</h2>
    <p class="p">${payload.message || "Qualcosa è andato storto."}</p>
    <div class="hr"></div>
    <button id="toReadyBtn" class="btn primary">TORNA</button>
  `;
}
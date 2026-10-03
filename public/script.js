const socket = io();

/* =========================
   STATE
========================= */

let me = null;
let players = new Map();

let duel = null;
let duelActive = false;

let selectedSkin = 0;
let selectedMap = 0;

let aim = { x: 0, y: 0 };
let keys = {};

let joystickActive = false;
let joystickTouchId = null;
let joystickCenter = { x: 0, y: 0 };

let lastMove = 0;
let lastShot = 0;

/* =========================
   HELPERS
========================= */

const $ = id => document.getElementById(id);

function show(id) {
  const el = $(id);
  if (el) el.style.display = "";
}

function hide(id) {
  const el = $(id);
  if (el) el.style.display = "none";
}

function text(id, value) {
  const el = $(id);
  if (el) el.textContent = value;
}

/* =========================
   SCREENS
========================= */

function openScreen(id) {
  document.querySelectorAll(".screen").forEach(el => {
    el.classList.remove("active");
  });

  const el = $(id);
  if (el) el.classList.add("active");
}

/* =========================
   SOUND
========================= */

let audioCtx = null;

function audioStart() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }

  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }
}

function sound(type) {
  audioStart();

  if (!audioCtx) return;

  const now = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();

  osc.connect(gain);
  gain.connect(audioCtx.destination);

  if (type === "click") {
    osc.frequency.setValueAtTime(500, now);
    osc.frequency.exponentialRampToValueAtTime(800, now + 0.08);
    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
  }

  if (type === "shoot") {
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(180, now);
    osc.frequency.exponentialRampToValueAtTime(55, now + 0.12);
    gain.gain.setValueAtTime(0.16, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
  }

  if (type === "hit") {
    osc.type = "square";
    osc.frequency.setValueAtTime(850, now);
    osc.frequency.exponentialRampToValueAtTime(180, now + 0.1);
    gain.gain.setValueAtTime(0.13, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
  }

  if (type === "kill") {
    osc.type = "square";
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.exponentialRampToValueAtTime(900, now + 0.25);
    gain.gain.setValueAtTime(0.16, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
  }

  if (type === "win") {
    osc.frequency.setValueAtTime(300, now);
    osc.frequency.setValueAtTime(500, now + 0.12);
    osc.frequency.setValueAtTime(750, now + 0.24);
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
  }

  osc.start(now);
  osc.stop(now + 0.6);
}

/* =========================
   LOGIN
========================= */

const joinButton = $("joinBtn");
const nameInput = $("nameInput");

if (joinButton) {
  joinButton.addEventListener("click", () => {
    audioStart();

    const name = nameInput?.value.trim();

    if (!name) {
      if (nameInput) nameInput.focus();
      return;
    }

    me = {
      name
    };

    socket.emit("player:join", {
      name
    });

    sound("click");
    openScreen("skinScreen");
  });
}

/* =========================
   SKINS
========================= */

function renderSkins(skins = []) {
  const grid = $("skinGrid");
  if (!grid) return;

  grid.innerHTML = "";

  skins.forEach((skin, index) => {
    const card = document.createElement("button");

    card.className = "skinCard";
    if (index === selectedSkin) {
      card.classList.add("selected");
    }

    card.innerHTML = `
      <div class="skinPreview"
           style="background:${skin.color || "#7c5cff"}"></div>
      <strong>${skin.name || "Skin " + (index + 1)}</strong>
    `;

    card.addEventListener("click", () => {
      selectedSkin = index;

      document
        .querySelectorAll(".skinCard")
        .forEach(x => x.classList.remove("selected"));

      card.classList.add("selected");

      sound("click");
    });

    grid.appendChild(card);
  });
}

socket.on("skins", skins => {
  renderSkins(skins);
});

const enterLobby = $("enterLobbyBtn");

if (enterLobby) {
  enterLobby.addEventListener("click", () => {
    audioStart();

    socket.emit("player:profile", {
      skin: selectedSkin
    });

    sound("click");
    openScreen("lobbyScreen");
  });
}

/* =========================
   PLAYER LIST
========================= */

function renderPlayers(list) {
  players.clear();

  list.forEach(player => {
    players.set(player.id, player);
  });

  const container = $("onlinePlayers");
  if (!container) return;

  container.innerHTML = "";

  list.forEach(player => {
    if (me && player.id === me.id) return;

    const row = document.createElement("div");
    row.className = "onlinePlayer";

    row.innerHTML = `
      <div class="playerInfo">
        <span class="playerDot"></span>
        <span>${escapeHtml(player.name)}</span>
      </div>
      <button class="challengeBtn">1v1</button>
    `;

    row.querySelector("button").addEventListener("click", () => {
      audioStart();
      sound("click");

      socket.emit("duel:challenge", {
        targetId: player.id
      });
    });

    container.appendChild(row);
  });

  text("onlineCount", `${list.length} ONLINE`);
}

socket.on("players:update", list => {
  renderPlayers(list);
});

socket.on("player:list", list => {
  renderPlayers(list);
});

/* =========================
   PLAYER PROFILE
========================= */

socket.on("player:profile", player => {
  me = player;
});

socket.on("player:updated", player => {
  if (!player) return;

  if (me && player.id === me.id) {
    me = player;
  }
});

/* =========================
   CHAT
========================= */

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function addChat(message) {
  const chat = $("chatMessages");
  if (!chat) return;

  const div = document.createElement("div");
  div.className = "chatMessage";

  div.innerHTML = `
    <strong>${escapeHtml(message.name || "SYSTEM")}</strong>
    <span>${escapeHtml(message.text || "")}</span>
  `;

  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
}

socket.on("chat:message", message => {
  addChat(message);
});

const chatInput = $("chatInput");
const chatSend = $("chatSend");

function sendChat() {
  if (!chatInput) return;

  const message = chatInput.value.trim();

  if (!message) return;

  socket.emit("chat:send", {
    text: message
  });

  chatInput.value = "";
  sound("click");
}

if (chatSend) {
  chatSend.addEventListener("click", sendChat);
}

if (chatInput) {
  chatInput.addEventListener("keydown", e => {
    if (e.key === "Enter") {
      e.preventDefault();
      sendChat();
    }
  });
}

/* =========================
   CHALLENGE
========================= */

socket.on("duel:invite", data => {
  const modal = $("challengeModal");

  if (modal) {
    modal.style.display = "flex";
  }

  text(
    "challengeText",
    `${data.fromName || "Ein Spieler"} fordert dich zu einem 1v1 heraus!`
  );

  window.currentChallenge = data;

  sound("click");
});

const acceptChallenge = $("acceptChallenge");
const declineChallenge = $("declineChallenge");

if (acceptChallenge) {
  acceptChallenge.addEventListener("click", () => {
    const data = window.currentChallenge;

    if (data) {
      socket.emit("duel:accept", {
        challengerId: data.fromId
      });
    }

    hide("challengeModal");
    sound("click");
  });
}

if (declineChallenge) {
  declineChallenge.addEventListener("click", () => {
    const data = window.currentChallenge;

    if (data) {
      socket.emit("duel:decline", {
        challengerId: data.fromId
      });
    }

    hide("challengeModal");
    sound("click");
  });
});

/* =========================
   DUEL STATE
========================= */

socket.on("duel:state", state => {
  duel = state;
  duelActive = true;

  hide("lobbyScreen");
  openScreen("duelScreen");

  renderMaps(state.maps || []);
  updateDuelHud();

  sound("click");
});

socket.on("duel:playerMoved", player => {
  if (!duel || !duel.players) return;

  const index = duel.players.findIndex(
    p => p.id === player.id
  );

  if (index !== -1) {
    duel.players[index] = {
      ...duel.players[index],
      ...player
    };
  }
});

/* =========================
   MAP SELECTION
========================= */

function renderMaps(maps) {
  const grid = $("mapGrid");
  if (!grid) return;

  grid.innerHTML = "";

  maps.forEach((map, index) => {
    const card = document.createElement("button");

    card.className = "mapCard";

    if (selectedMap === index) {
      card.classList.add("selected");
    }

    card.innerHTML = `
      <strong>${map.name || "MAP " + (index + 1)}</strong>
      <span>${map.description || "Arena"}</span>
    `;

    card.addEventListener("click", () => {
      selectedMap = index;

      document
        .querySelectorAll(".mapCard")
        .forEach(x => x.classList.remove("selected"));

      card.classList.add("selected");

      socket.emit("duel:mapChoice", {
        map: index
      });

      sound("click");
    });

    grid.appendChild(card);
  });
}

/* =========================
   READY
========================= */

const readyButton = $("readyBtn");

if (readyButton) {
  readyButton.addEventListener("click", () => {
    socket.emit("duel:ready");
    sound("click");
  });
}

/* =========================
   DUEL MOVEMENT
========================= */

function moveVector(dx, dy) {
  const length = Math.sqrt(dx * dx + dy * dy);

  if (length > 1) {
    dx /= length;
    dy /= length;
  }

  if (duelActive) {
    socket.emit("duel:move", {
      dx,
      dy
    });
  } else {
    socket.emit("player:move", {
      dx,
      dy
    });
  }
}

/* KEYBOARD */

window.addEventListener("keydown", e => {
  keys[e.key.toLowerCase()] = true;
});

window.addEventListener("keyup", e => {
  keys[e.key.toLowerCase()] = false;
});

function keyboardLoop() {
  let dx = 0;
  let dy = 0;

  if (keys["w"] || keys["arrowup"]) dy -= 1;
  if (keys["s"] || keys["arrowdown"]) dy += 1;
  if (keys["a"] || keys["arrowleft"]) dx -= 1;
  if (keys["d"] || keys["arrowright"]) dx += 1;

  if (dx !== 0 || dy !== 0) {
    moveVector(dx, dy);
  }

  requestAnimationFrame(keyboardLoop);
}

keyboardLoop();

/* =========================
   JOYSTICK
========================= */

const joystick = $("joystick");
const joystickKnob = $("joystickKnob");

function resetJoystick() {
  joystickActive = false;
  joystickTouchId = null;

  if (joystickKnob) {
    joystickKnob.style.transform =
      "translate(-50%, -50%)";
  }
}

function joystickMove(clientX, clientY) {
  if (!joystick || !joystickKnob) return;

  const rect = joystick.getBoundingClientRect();

  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;

  let dx = clientX - centerX;
  let dy = clientY - centerY;

  const maxDistance = Math.min(rect.width, rect.height) * 0.34;

  const distance = Math.sqrt(dx * dx + dy * dy);

  if (distance > maxDistance) {
    dx = dx / distance * maxDistance;
    dy = dy / distance * maxDistance;
  }

  joystickKnob.style.transform =
    `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;

  const normalizedX = dx / maxDistance;
  const normalizedY = dy / maxDistance;

  moveVector(normalizedX, normalizedY);
}

/*
   IMPORTANT:
   We use pointer events instead of separate
   touch + mouse handlers.
   This works much better on iPad/iPhone.
*/

if (joystick) {
  joystick.style.touchAction = "none";

  joystick.addEventListener("pointerdown", e => {
    e.preventDefault();

    audioStart();

    joystickActive = true;
    joystickTouchId = e.pointerId;

    joystick.setPointerCapture(e.pointerId);

    joystickMove(e.clientX, e.clientY);
  });

  joystick.addEventListener("pointermove", e => {
    if (!joystickActive) return;
    if (e.pointerId !== joystickTouchId) return;

    e.preventDefault();

    joystickMove(e.clientX, e.clientY);
  });

  joystick.addEventListener("pointerup", e => {
    if (e.pointerId !== joystickTouchId) return;

    e.preventDefault();
    resetJoystick();
  });

  joystick.addEventListener("pointercancel", e => {
    if (e.pointerId !== joystickTouchId) return;

    resetJoystick();
  });
}

/* =========================
   AIM
========================= */

const arenaCanvas = $("arenaCanvas");
const lobbyCanvas = $("lobbyCanvas");

function updateAim(clientX, clientY) {
  const canvas = arenaCanvas || lobbyCanvas;

  if (!canvas) return;

  const rect = canvas.getBoundingClientRect();

  aim.x = clientX - rect.left;
  aim.y = clientY - rect.top;
}

if (arenaCanvas) {
  arenaCanvas.style.touchAction = "none";

  arenaCanvas.addEventListener("pointermove", e => {
    updateAim(e.clientX, e.clientY);
  });

  arenaCanvas.addEventListener("pointerdown", e => {
    updateAim(e.clientX, e.clientY);
  });
}

/* =========================
   SHOOTING
========================= */

function shoot() {
  if (!duelActive) return;

  const now = Date.now();

  if (now - lastShot < 180) return;

  lastShot = now;

  const canvas = arenaCanvas;

  if (!canvas) return;

  const rect = canvas.getBoundingClientRect();

  const player = duel?.players?.find(
    p => me && p.id === me.id
  );

  if (!player) return;

  const playerScreenX = player.x;
  const playerScreenY = player.y;

  const dx = aim.x - playerScreenX;
  const dy = aim.y - playerScreenY;

  socket.emit("duel:shoot", {
    x: dx,
    y: dy
  });

  sound("shoot");
}

/* FIRE BUTTON */

const fireButton = $("fireButton");

if (fireButton) {
  fireButton.style.touchAction = "none";

  fireButton.addEventListener("pointerdown", e => {
    e.preventDefault();
    e.stopPropagation();

    audioStart();
    shoot();
  });
}

/* =========================
   DUEL EVENTS
========================= */

socket.on("duel:hit", data => {
  sound("hit");

  if (navigator.vibrate) {
    navigator.vibrate(35);
  }
});

socket.on("duel:roundEnd", data => {
  sound("kill");

  if (navigator.vibrate) {
    navigator.vibrate([50, 40, 80]);
  }

  duelActive = false;

  updateDuelHud();
});

socket.on("duel:matchEnd", data => {
  duelActive = false;

  sound("win");

  if (navigator.vibrate) {
    navigator.vibrate([80, 60, 120]);
  }

  const modal = $("matchModal");

  if (modal) {
    modal.style.display = "flex";
  }

  if (data && data.winnerName) {
    text(
      "matchResult",
      `${data.winnerName} gewinnt!`
    );
  }
});

/* =========================
   CONTINUE
========================= */

const continueButton = $("continueBtn");
const lobbyButton = $("returnLobbyBtn");

if (continueButton) {
  continueButton.addEventListener("click", () => {
    socket.emit("duel:continue");
    sound("click");
  });
}

if (lobbyButton) {
  lobbyButton.addEventListener("click", () => {
    socket.emit("duel:returnLobby");

    hide("matchModal");
    duelActive = false;

    openScreen("lobbyScreen");

    sound("click");
  });
}

/* =========================
   DUEL HUD
========================= */

function updateDuelHud() {
  if (!duel) return;

  const myPlayer = duel.players?.find(
    p => me && p.id === me.id
  );

  const enemy = duel.players?.find(
    p => me && p.id !== me.id
  );

  if (myPlayer) {
    text("myHp", `${myPlayer.hp ?? 100} HP`);
  }

  if (enemy) {
    text("enemyHp", `${enemy.hp ?? 100} HP`);
  }

  if (duel.scores) {
    const myScore =
      me && duel.scores[me.id] != null
        ? duel.scores[me.id]
        : 0;

    const enemyId =
      enemy?.id;

    const enemyScore =
      enemyId && duel.scores[enemyId] != null
        ? duel.scores[enemyId]
        : 0;

    text("myScore", myScore);
    text("enemyScore", enemyScore);
  }
}

/* =========================
   LOBBY CANVAS
========================= */

function drawLobby() {
  const canvas = lobbyCanvas;

  if (!canvas) {
    requestAnimationFrame(drawLobby);
    return;
  }

  const ctx = canvas.getContext("2d");

  const rect = canvas.getBoundingClientRect();

  const dpr = window.devicePixelRatio || 1;

  if (
    canvas.width !== Math.floor(rect.width * dpr) ||
    canvas.height !== Math.floor(rect.height * dpr)
  ) {
    canvas.width = Math.floor(rect.width * dpr);
    canvas.height = Math.floor(rect.height * dpr);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  ctx.clearRect(0, 0, rect.width, rect.height);

  /* GRID */

  const grid = 42;

  ctx.strokeStyle = "rgba(80,130,255,.12)";
  ctx.lineWidth = 1;

  for (let x = 0; x < rect.width; x += grid) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, rect.height);
    ctx.stroke();
  }

  for (let y = 0; y < rect.height; y += grid) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(rect.width, y);
    ctx.stroke();
  }

  /* PLAYERS */

  players.forEach(player => {
    if (player.state !== "lobby") return;

    const x = player.x ?? rect.width / 2;
    const y = player.y ?? rect.height / 2;

    ctx.beginPath();
    ctx.arc(x, y, 12, 0, Math.PI * 2);

    ctx.fillStyle = player.color || "#8b5cff";
    ctx.shadowBlur = 20;
    ctx.shadowColor = player.color || "#8b5cff";

    ctx.fill();

    ctx.shadowBlur = 0;

    ctx.font = "12px sans-serif";
    ctx.textAlign = "center";
    ctx.fillStyle = "#fff";

    ctx.fillText(
      player.name || "Player",
      x,
      y - 20
    );
  });

  requestAnimationFrame(drawLobby);
}

drawLobby();

/* =========================
   ARENA CANVAS
========================= */

function drawArena() {
  const canvas = arenaCanvas;

  if (!canvas) {
    requestAnimationFrame(drawArena);
    return;
  }

  const ctx = canvas.getContext("2d");

  const rect = canvas.getBoundingClientRect();

  const dpr = window.devicePixelRatio || 1;

  if (
    canvas.width !== Math.floor(rect.width * dpr) ||
    canvas.height !== Math.floor(rect.height * dpr)
  ) {
    canvas.width = Math.floor(rect.width * dpr);
    canvas.height = Math.floor(rect.height * dpr);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  ctx.clearRect(0, 0, rect.width, rect.height);

  /* ARENA BACKGROUND */

  ctx.fillStyle = "#050817";
  ctx.fillRect(0, 0, rect.width, rect.height);

  const grid = 45;

  ctx.strokeStyle = "rgba(100,130,255,.1)";
  ctx.lineWidth = 1;

  for (let x = 0; x < rect.width; x += grid) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, rect.height);
    ctx.stroke();
  }

  for (let y = 0; y < rect.height; y += grid) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(rect.width, y);
    ctx.stroke();
  }

  /* PLAYERS */

  if (duel?.players) {
    duel.players.forEach(player => {
      const x = player.x ?? rect.width / 2;
      const y = player.y ?? rect.height / 2;

      const color =
        player.id === me?.id
          ? "#5c7cff"
          : "#ff4f70";

      ctx.beginPath();
      ctx.arc(x, y, 16, 0, Math.PI * 2);

      ctx.fillStyle = color;
      ctx.shadowBlur = 25;
      ctx.shadowColor = color;

      ctx.fill();

      ctx.shadowBlur = 0;

      /* HP BAR */

      const hp = Math.max(
        0,
        Math.min(100, player.hp ?? 100)
      );

      ctx.fillStyle = "rgba(0,0,0,.5)";
      ctx.fillRect(
        x - 25,
        y - 32,
        50,
        6
      );

      ctx.fillStyle = "#4dff88";
      ctx.fillRect(
        x - 25,
        y - 32,
        50 * (hp / 100),
        6
      );

      ctx.font = "12px sans-serif";
      ctx.textAlign = "center";
      ctx.fillStyle = "#fff";

      ctx.fillText(
        player.name || "Player",
        x,
        y + 34
      );
    });
  }

  requestAnimationFrame(drawArena);
}

drawArena();

/* =========================
   RESIZE
========================= */

window.addEventListener("resize", () => {
  resetJoystick();
});

/* =========================
   CONNECTION
========================= */

socket.on("connect", () => {
  console.log("Connected:", socket.id);

  if (me) {
    me.id = socket.id;
  }
});

socket.on("disconnect", () => {
  console.log("Disconnected");
});

/* =========================
   ERROR HANDLING
========================= */

socket.on("error", message => {
  console.error(message);
});

/* =========================
   START
========================= */

console.log("LHX Neon Arena controls loaded.");
const skinButton = document.getElementById("skinBtn");

if (skinButton) {
  skinButton.addEventListener("click", () => {
    sound("click");
    openScreen("skinScreen");
  });
}

const socket = io();

const $ = id => document.getElementById(id);

const login = $("login");
const skinScreen = $("skinScreen");
const lobbyScreen = $("lobbyScreen");
const duelScreen = $("duelScreen");

const nameInput = $("nameInput");
const startButton = $("startButton");
const enterLobby = $("enterLobby");
const skinGrid = $("skinGrid");

const world = $("world");
const ctx = world.getContext("2d");

const arena = $("arena");
const actx = arena.getContext("2d");

const joystick = $("joystick");
const stick = $("stick");

const skins = [
  { id:"neon", name:"Neon", color:"#65f5ff", accent:"#6670ff" },
  { id:"cyber", name:"Cyber", color:"#ff4fd8", accent:"#704dff" },
  { id:"ice", name:"Ice", color:"#baf8ff", accent:"#429cff" },
  { id:"fire", name:"Fire", color:"#ff784f", accent:"#ff315f" },
  { id:"shadow", name:"Shadow", color:"#a17cff", accent:"#25233c" },
  { id:"toxic", name:"Toxic", color:"#a5ff4f", accent:"#35c878" },
  { id:"gold", name:"Gold", color:"#ffe36e", accent:"#ff9d36" },
  { id:"purple", name:"Purple", color:"#d66cff", accent:"#713cff" },
  { id:"robot", name:"Robot", color:"#d9e1ef", accent:"#69758f" },
  { id:"angel", name:"Angel", color:"#ffffff", accent:"#78e8ff" }
];

const maps = [
  { id:"Neon City", name:"Neon City" },
  { id:"Cyber Yard", name:"Cyber Yard" },
  { id:"Desert Base", name:"Desert Base" },
  { id:"Ice Station", name:"Ice Station" },
  { id:"Space Lab", name:"Space Lab" }
];

let selfId = null;
let myName = "";
let selectedSkin = "neon";

let players = new Map();

let duel = null;
let arenaActive = false;

let keys = {
  up:false,
  down:false,
  left:false,
  right:false
};

let joy = {
  x:0,
  y:0
};

let lastMove = 0;

let aim = {
  x:700,
  y:350
};

let audio = null;

function show(screen) {
  [login, skinScreen, lobbyScreen, duelScreen]
    .forEach(x => x.classList.add("hidden"));

  screen.classList.remove("hidden");
}

function sound(freq = 500) {
  try {
    audio ??= new (window.AudioContext || window.webkitAudioContext)();

    const oscillator = audio.createOscillator();
    const gain = audio.createGain();

    oscillator.connect(gain);
    gain.connect(audio.destination);

    oscillator.frequency.value = freq;
    gain.gain.value = 0.035;

    oscillator.start();
    oscillator.stop(audio.currentTime + 0.08);
  } catch {}
}

function skin(id) {
  return skins.find(s => s.id === id) || skins[0];
}

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    "&":"&amp;",
    "<":"&lt;",
    ">":"&gt;",
    '"':"&quot;",
    "'":"&#039;"
  }[char]));
}

function toast(text) {
  const element = $("toast");

  element.textContent = text;
  element.classList.remove("hidden");

  clearTimeout(element.timer);

  element.timer = setTimeout(() => {
    element.classList.add("hidden");
  }, 2500);
}

/* =========================
   SKINS
========================= */

function renderSkins() {
  skinGrid.innerHTML = "";

  skins.forEach(s => {
    const button = document.createElement("button");

    button.className =
      "skin" + (selectedSkin === s.id ? " selected" : "");

    button.innerHTML = `
      <div
        class="skinAvatar"
        style="
          background:linear-gradient(145deg,${s.color},${s.accent});
          color:${s.color};
        ">
      </div>

      <div class="skinName">
        ${s.name}
      </div>
    `;

    button.onclick = () => {
      selectedSkin = s.id;
      renderSkins();
      sound(700);
    };

    skinGrid.appendChild(button);
  });
}

startButton.onclick = () => {
  myName = nameInput.value.trim().slice(0,18);

  if (!myName) {
    $("loginError").textContent = "Bitte gib einen Namen ein.";
    return;
  }

  $("loginError").textContent = "";

  renderSkins();
  show(skinScreen);

  sound(700);
};

nameInput.onkeydown = event => {
  if (event.key === "Enter") {
    startButton.click();
  }
};

enterLobby.onclick = () => {
  socket.emit("player:join", {
    name:myName,
    skin:selectedSkin
  });

  show(lobbyScreen);
  sound(850);
};

$("changeSkin").onclick = () => {
  renderSkins();
  show(skinScreen);
};

/* =========================
   LOBBY
========================= */

socket.on("player:joined", player => {
  selfId = player.id;

  players.set(player.id, player);

  show(lobbyScreen);

  addMessage(
    "SYSTEM",
    "Willkommen in Neon City!"
  );

  addMessage(
    "SYSTEM",
    "Fordere andere Spieler über 1v1 heraus."
  );

  updateOnline();
});

socket.on("lobby:state", list => {
  players = new Map();

  list.forEach(player => {
    players.set(player.id, player);
  });

  updateOnline();
});

socket.on("player:updated", player => {
  players.set(player.id, player);
  updateOnline();
});

socket.on("player:moved", player => {
  players.set(player.id, player);
});

function updateOnline() {
  const online = [...players.values()]
    .filter(player => player.state === "lobby");

  $("playerCount").textContent = online.length;

  const list = $("onlineList");

  list.innerHTML = `
    <div class="onlineTitle">
      ONLINE SPIELER
    </div>
  `;

  online.forEach(player => {
    const s = skin(player.skin);

    const row = document.createElement("div");
    row.className = "onlineRow";

    row.innerHTML = `
      <div
        class="dotSkin"
        style="
          background:linear-gradient(145deg,${s.color},${s.accent});
          color:${s.color};
        ">
      </div>

      <div class="onlineName">
        ${escapeHTML(player.name)}
        ${player.id === selfId ? "(du)" : ""}
      </div>
    `;

    if (player.id !== selfId) {
      const button = document.createElement("button");

      button.className = "duelBtn";
      button.textContent = "1v1";

      button.onclick = () => {
        socket.emit("duel:challenge", player.id);
        toast("1v1-Anfrage gesendet");
      };

      row.appendChild(button);
    }

    list.appendChild(row);
  });
}

/* =========================
   CHAT
========================= */

function addMessage(name, message) {
  const box = $("messages");

  const element = document.createElement("div");

  element.className = "message";

  element.innerHTML = `
    <strong>${escapeHTML(name)}</strong>
    <div>${escapeHTML(message)}</div>
  `;

  box.appendChild(element);

  box.scrollTop = box.scrollHeight;
}

$("chatForm").onsubmit = event => {
  event.preventDefault();

  const input = $("chatInput");
  const message = input.value.trim();

  if (!message) return;

  socket.emit("chat:send", message);

  input.value = "";

  sound(500);
};

socket.on("chat:message", data => {
  addMessage(data.name, data.text);
});

/* =========================
   CHALLENGE
========================= */

let currentInvite = null;

socket.on("duel:invite", data => {
  currentInvite = data;

  $("inviteText").textContent =
    `${data.from.name} fordert dich zu einem 1v1 heraus.`;

  $("duelInvite").classList.remove("hidden");

  sound(900);
});

$("acceptInvite").onclick = () => {
  if (!currentInvite) return;

  $("duelInvite").classList.add("hidden");

  socket.emit(
    "duel:accept",
    currentInvite.from.id
  );

  sound(1000);
};

$("declineInvite").onclick = () => {
  if (!currentInvite) return;

  $("duelInvite").classList.add("hidden");

  socket.emit(
    "duel:decline",
    currentInvite.from.id
  );

  currentInvite = null;
};

/* =========================
   DUEL
========================= */

socket.on("duel:state", data => {
  duel = data;

  show(duelScreen);

  renderDuel();

  if (data.phase === "fight") {
    startArena();
  } else {
    arenaActive = false;

    $("mapSelect").classList.remove("hidden");
    $("fightArea").classList.add("hidden");
  }
});

function renderDuel() {
  if (!duel) return;

  const me = duel.players.find(
    player => player.id === selfId
  );

  const enemy = duel.players.find(
    player => player.id !== selfId
  );

  renderFighter(
    $("playerCardA"),
    me
  );

  renderFighter(
    $("playerCardB"),
    enemy
  );

  renderMaps();

  $("roundText").textContent =
    `ROUND ${duel.round || 1}`;

  $("duelRoundLabel").textContent =
    duel.phase === "fight"
      ? "FIGHT"
      : "MAP SELECT";

  updateHP();
}

function renderFighter(element, player) {
  if (!player) {
    element.innerHTML = "";
    return;
  }

  const s = skin(player.skin);

  element.innerHTML = `
    <div
      class="fighterAvatar"
      style="
        background:linear-gradient(145deg,${s.color},${s.accent});
      ">
    </div>

    <div class="fighterText">
      <b>${escapeHTML(player.name)}</b>
      <small>${s.name}</small>
    </div>

    <div class="fighterScore">
      ${duel.scores[player.id] || 0}
    </div>
  `;
}

function renderMaps() {
  const grid = $("mapGrid");

  grid.innerHTML = "";

  const myChoice = duel?.choices?.[selfId];

  maps.forEach(map => {
    const button = document.createElement("button");

    button.className =
      "mapCard" +
      (myChoice === map.id ? " selected" : "");

    button.innerHTML = `
      <b>${map.name}</b>
      <small>
        ${map.id.toUpperCase()} // ARENA
      </small>
    `;

    button.onclick = () => {
      socket.emit("duel:mapChoice", map.id);
      sound(700);
    };

    grid.appendChild(button);
  });

  const enemy = duel?.players?.find(
    player => player.id !== selfId
  );

  const myReady =
    duel?.ready?.[selfId] === true;

  const enemyReady =
    enemy && duel?.ready?.[enemy.id] === true;

  $("readyStatus").textContent =
    `${myReady ? "✓ DU BIST READY" : "MAP WÄHLEN"} · ` +
    `${enemyReady ? "✓ GEGNER READY" : "GEGNER WÄHLT..."}`;
}

$("readyButton").onclick = () => {
  if (!duel?.map) {
    toast("Wähle zuerst eine Map!");
    return;
  }

  socket.emit("duel:ready");

  sound(800);
};

function startArena() {
  arenaActive = true;

  $("mapSelect").classList.add("hidden");
  $("fightArea").classList.remove("hidden");

  $("mapName").textContent =
    String(duel.map || "ARENA").toUpperCase();

  $("roundText").textContent =
    `ROUND ${duel.round || 1}`;

  updateHP();

  sound(1000);
}

/* =========================
   HP
========================= */

function updateHP() {
  if (!duel) return;

  const enemy = duel.players.find(
    player => player.id !== selfId
  );

  const myHP =
    duel.hp?.[selfId] ?? 100;

  const enemyHP =
    enemy
      ? duel.hp?.[enemy.id] ?? 100
      : 100;

  $("hpMe").style.width =
    `${Math.max(0,myHP)}%`;

  $("hpEnemy").style.width =
    `${Math.max(0,enemyHP)}%`;

  $("hpMeText").textContent = myHP;
  $("hpEnemyText").textContent = enemyHP;

  $("hpEnemyLabel").textContent =
    enemy?.name || "ENEMY";
}

socket.on("duel:hit", data => {
  if (!duel) return;

  duel.hp[data.targetId] = data.hp;

  updateHP();

  sound(
    data.targetId === selfId
      ? 150
      : 650
  );
});

socket.on("duel:roundEnd", data => {
  arenaActive = false;

  $("mapSelect").classList.remove("hidden");
  $("fightArea").classList.add("hidden");

  if (duel) {
    duel.scores = data.scores;
  }

  const winner =
    players.get(data.winnerId);

  toast(
    `${winner?.name || "Spieler"} gewinnt die Runde!`
  );

  sound(1100);
});

socket.on("duel:matchEnd", data => {
  arenaActive = false;

  const winnerName =
    players.get(data.winnerId)?.name ||
    "Spieler";

  $("matchTitle").textContent =
    data.winnerId === selfId
      ? "SIEG 🏆"
      : "NIEDERLAGE";

  $("matchText").textContent =
    `${winnerName} gewinnt das Match mit 3 Runden.`;

  $("matchModal").classList.remove("hidden");

  sound(1200);
});

$("continueMatch").onclick = () => {
  $("matchModal").classList.add("hidden");

  socket.emit("duel:continue");
};

$("backLobby").onclick = () => {
  $("matchModal").classList.add("hidden");

  socket.emit("duel:returnLobby");
};

$("leaveDuel").onclick = () => {
  socket.emit("duel:returnLobby");
};

socket.on("duel:leave", () => {
  duel = null;
  arenaActive = false;

  $("matchModal").classList.add("hidden");

  show(lobbyScreen);

  toast("Zurück in der Lobby");
});

socket.on("duel:opponentLeft", () => {
  duel = null;
  arenaActive = false;

  show(lobbyScreen);

  toast("Der andere Spieler hat die Arena verlassen.");
});

/* =========================
   MOVEMENT
========================= */

function getSelf() {
  return players.get(selfId);
}

function movePlayer(time) {
  const player = getSelf();

  if (!player) return;

  let x =
    (keys.right ? 1 : 0) -
    (keys.left ? 1 : 0) +
    joy.x;

  let y =
    (keys.down ? 1 : 0) -
    (keys.up ? 1 : 0) +
    joy.y;

  const length =
    Math.hypot(x,y);

  if (!length) return;

  x /= Math.max(1,length);
  y /= Math.max(1,length);

  const speed =
    arenaActive ? 4.2 : 5;

  player.x += x * speed;
  player.y += y * speed;

  if (arenaActive) {
    player.x =
      Math.max(40,Math.min(1360,player.x));

    player.y =
      Math.max(40,Math.min(660,player.y));
  } else {
    player.x =
      Math.max(40,Math.min(1460,player.x));

    player.y =
      Math.max(40,Math.min(860,player.y));
  }

  if (time - lastMove > 35) {
    lastMove = time;

    if (arenaActive) {
      socket.emit("duel:move", {
        dx:x * speed,
        dy:y * speed
      });
    } else {
      socket.emit("lobby:move", {
        dx:x * speed,
        dy:y * speed
      });
    }
  }
}

window.onkeydown = event => {
  if (
    ["INPUT","TEXTAREA"].includes(
      event.target.tagName
    )
  ) return;

  if (
    event.key === "w" ||
    event.key === "W" ||
    event.key === "ArrowUp"
  ) keys.up = true;

  if (
    event.key === "s" ||
    event.key === "S" ||
    event.key === "ArrowDown"
  ) keys.down = true;

  if (
    event.key === "a" ||
    event.key === "A" ||
    event.key === "ArrowLeft"
  ) keys.left = true;

  if (
    event.key === "d" ||
    event.key === "D" ||
    event.key === "ArrowRight"
  ) keys.right = true;

  if (
    event.code === "Space" &&
    arenaActive
  ) {
    event.preventDefault();
    shoot();
  }
};

window.onkeyup = event => {
  if (
    event.key === "w" ||
    event.key === "W" ||
    event.key === "ArrowUp"
  ) keys.up = false;

  if (
    event.key === "s" ||
    event.key === "S" ||
    event.key === "ArrowDown"
  ) keys.down = false;

  if (
    event.key === "a" ||
    event.key === "A" ||
    event.key === "ArrowLeft"
  ) keys.left = false;

  if (
    event.key === "d" ||
    event.key === "D" ||
    event.key === "ArrowRight"
  ) keys.right = false;
};

/* =========================
   MOBILE JOYSTICK
========================= */

function setJoystick(clientX,clientY) {
  const rect =
    joystick.getBoundingClientRect();

  let dx =
    clientX -
    (rect.left + rect.width / 2);

  let dy =
    clientY -
    (rect.top + rect.height / 2);

  const max = 40;

  const distance =
    Math.hypot(dx,dy);

  if (distance > max) {
    dx = dx / distance * max;
    dy = dy / distance * max;
  }

  joy.x = dx / max;
  joy.y = dy / max;

  stick.style.transform =
    `translate(${dx}px,${dy}px)`;
}

joystick.addEventListener(
  "pointerdown",
  event => {
    joystick.setPointerCapture(
      event.pointerId
    );

    setJoystick(
      event.clientX,
      event.clientY
    );
  }
);

joystick.addEventListener(
  "pointermove",
  event => {
    if (
      event.pressure ||
      event.buttons
    ) {
      setJoystick(
        event.clientX,
        event.clientY
      );
    }
  }
);

function resetJoystick() {
  joy.x = 0;
  joy.y = 0;

  stick.style.transform =
    "translate(0,0)";
}

joystick.addEventListener(
  "pointerup",
  resetJoystick
);

joystick.addEventListener(
  "pointercancel",
  resetJoystick
);

/* =========================
   SHOOTING
========================= */

function updateAim(event) {
  const rect =
    arena.getBoundingClientRect();

  aim.x =
    (event.clientX - rect.left) *
    arena.width /
    rect.width;

  aim.y =
    (event.clientY - rect.top) *
    arena.height /
    rect.height;
}

arena.addEventListener(
  "pointermove",
  updateAim
);

arena.addEventListener(
  "pointerdown",
  event => {
    updateAim(event);

    if (event.pointerType !== "touch") {
      shoot();
    }
  }
);

$("fireButton").onclick = () => {
  shoot();
};

function shoot() {
  if (!arenaActive) return;

  const player = getSelf();

  if (!player) return;

  socket.emit("duel:shoot", {
    x:aim.x - player.x,
    y:aim.y - player.y
  });

  sound(180);
}

/* =========================
   LOBBY DRAW
========================= */

function drawLobby() {
  ctx.clearRect(
    0,
    0,
    world.width,
    world.height
  );

  const gradient =
    ctx.createLinearGradient(
      0,0,
      world.width,
      world.height
    );

  gradient.addColorStop(
    0,
    "#07152a"
  );

  gradient.addColorStop(
    1,
    "#090712"
  );

  ctx.fillStyle = gradient;

  ctx.fillRect(
    0,
    0,
    world.width,
    world.height
  );

  ctx.strokeStyle = "#6ff6ff12";

  for (
    let x=0;
    x<world.width;
    x+=50
  ) {
    ctx.beginPath();
    ctx.moveTo(x,0);
    ctx.lineTo(x,world.height);
    ctx.stroke();
  }

  for (
    let y=0;
    y<world.height;
    y+=50
  ) {
    ctx.beginPath();
    ctx.moveTo(0,y);
    ctx.lineTo(world.width,y);
    ctx.stroke();
  }

  players.forEach(player => {
    if (player.state !== "lobby") return;

    const s = skin(player.skin);

    ctx.beginPath();

    ctx.arc(
      player.x,
      player.y,
      player.id === selfId ? 19 : 16,
      0,
      Math.PI * 2
    );

    ctx.fillStyle = s.color;

    ctx.shadowBlur = 25;
    ctx.shadowColor = s.color;

    ctx.fill();

    ctx.shadowBlur = 0;

    ctx.fillStyle = "#fff";

    ctx.font = "bold 14px Arial";

    ctx.textAlign = "center";

    ctx.fillText(
      player.name,
      player.x,
      player.y - 28
    );
  });

  requestAnimationFrame(drawLobby);
}

/* =========================
   ARENA DRAW
========================= */

function drawArena() {
  actx.clearRect(
    0,
    0,
    arena.width,
    arena.height
  );

  let background = "#0b1230";

  if (duel?.map === "Ice Station") {
    background = "#0b2331";
  }

  if (duel?.map === "Desert Base") {
    background = "#302014";
  }

  if (duel?.map === "Cyber Yard") {
    background = "#14152d";
  }

  if (duel?.map === "Space Lab") {
    background = "#111326";
  }

  if (duel?.map === "Neon City") {
    background = "#160f2b";
  }

  actx.fillStyle = background;

  actx.fillRect(
    0,
    0,
    arena.width,
    arena.height
  );

  actx.strokeStyle = "#ffffff10";

  for (
    let x=0;
    x<arena.width;
    x+=50
  ) {
    actx.beginPath();
    actx.moveTo(x,0);
    actx.lineTo(x,arena.height);
    actx.stroke();
  }

  for (
    let y=0;
    y<arena.height;
    y+=50
  ) {
    actx.beginPath();
    actx.moveTo(0,y);
    actx.lineTo(arena.width,y);
    actx.stroke();
  }

  if (duel) {
    duel.players.forEach(player => {
      const s = skin(player.skin);

      actx.beginPath();

      actx.arc(
        player.x,
        player.y,
        18,
        0,
        Math.PI * 2
      );

      actx.fillStyle = s.color;

      actx.shadowBlur = 25;
      actx.shadowColor = s.color;

      actx.fill();

      actx.shadowBlur = 0;

      actx.fillStyle = "#fff";

      actx.font = "bold 13px Arial";

      actx.textAlign = "center";

      actx.fillText(
        player.name,
        player.x,
        player.y - 27
      );
    });
  }

  requestAnimationFrame(drawArena);
}

/* =========================
   GAME LOOP
========================= */

function gameLoop(time) {
  if (
    !lobbyScreen.classList.contains("hidden") ||
    arenaActive
  ) {
    movePlayer(time);
  }

  requestAnimationFrame(gameLoop);
}

requestAnimationFrame(gameLoop);
requestAnimationFrame(drawLobby);
requestAnimationFrame(drawArena);

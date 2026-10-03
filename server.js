const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

const PORT = process.env.PORT || 3000;

const skins = [
  "neon", "cyber", "ice", "fire", "shadow",
  "toxic", "gold", "purple", "robot", "angel"
];

const maps = [
  "Neon City",
  "Cyber Yard",
  "Desert Base",
  "Ice Station",
  "Space Lab"
];

const players = new Map();
const duels = new Map();

function randomPosition() {
  return {
    x: 100 + Math.random() * 800,
    y: 100 + Math.random() * 500
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function safeName(name) {
  return String(name || "Player")
    .replace(/[<>]/g, "")
    .trim()
    .slice(0, 18) || "Player";
}

function publicPlayer(p) {
  return {
    id: p.id,
    name: p.name,
    skin: p.skin,
    x: p.x,
    y: p.y,
    state: p.state
  };
}

function lobbyState() {
  return [...players.values()]
    .filter(p => p.state === "lobby")
    .map(publicPlayer);
}

function sendLobby() {
  io.emit("lobby:state", lobbyState());
}

function getDuel(id) {
  const player = players.get(id);
  if (!player || !player.duelId) return null;
  return duels.get(player.duelId) || null;
}

function duelPlayers(duel) {
  return duel.players
    .map(id => players.get(id))
    .filter(Boolean);
}

function sendDuelState(duel) {
  const data = {
    players: duelPlayers(duel).map(publicPlayer),
    choices: duel.choices,
    ready: duel.ready,
    map: duel.map,
    phase: duel.phase,
    scores: duel.scores,
    round: duel.round,
    hp: duel.hp
  };

  duel.players.forEach(id => {
    io.to(id).emit("duel:state", data);
  });
}

function backToLobby(duel) {
  if (!duel) return;

  duel.players.forEach(id => {
    const p = players.get(id);
    if (!p) return;

    p.state = "lobby";
    p.duelId = null;
    p.hp = 100;
    p.x = 450 + Math.random() * 100;
    p.y = 250 + Math.random() * 100;

    io.to(id).emit("duel:leave");
  });

  duels.delete(duel.id);
  sendLobby();
}

function createDuel(a, b) {
  const duel = {
    id: `${a.id}-${b.id}-${Date.now()}`,
    players: [a.id, b.id],
    choices: {},
    ready: {},
    map: null,
    phase: "select",
    scores: {
      [a.id]: 0,
      [b.id]: 0
    },
    round: 1,
    hp: {
      [a.id]: 100,
      [b.id]: 100
    }
  };

  a.state = "duel";
  b.state = "duel";

  a.duelId = duel.id;
  b.duelId = duel.id;

  duels.set(duel.id, duel);

  sendDuelState(duel);
  sendLobby();
}

io.on("connection", socket => {
  socket.on("player:join", data => {
    const name = safeName(data?.name);

    const player = {
      id: socket.id,
      name,
      skin: skins.includes(data?.skin) ? data.skin : skins[0],
      x: randomPosition().x,
      y: randomPosition().y,
      state: "lobby",
      duelId: null,
      hp: 100
    };

    players.set(socket.id, player);

    socket.emit("player:joined", publicPlayer(player));
    sendLobby();
  });

  socket.on("player:profile", data => {
    const p = players.get(socket.id);
    if (!p) return;

    if (data?.name) p.name = safeName(data.name);
    if (skins.includes(data?.skin)) p.skin = data.skin;

    io.emit("player:updated", publicPlayer(p));
    sendLobby();
  });

  socket.on("lobby:move", data => {
    const p = players.get(socket.id);
    if (!p || p.state !== "lobby") return;

    const dx = Number(data?.dx) || 0;
    const dy = Number(data?.dy) || 0;

    p.x = clamp(p.x + dx, 25, 975);
    p.y = clamp(p.y + dy, 25, 575);

    io.emit("player:moved", publicPlayer(p));
  });

  socket.on("chat:send", text => {
    const p = players.get(socket.id);
    if (!p) return;

    const message = String(text || "")
      .replace(/[<>]/g, "")
      .trim()
      .slice(0, 160);

    if (!message) return;

    io.emit("chat:message", {
      id: p.id,
      name: p.name,
      text: message,
      time: Date.now()
    });
  });

  socket.on("duel:challenge", targetId => {
    const from = players.get(socket.id);
    const target = players.get(targetId);

    if (!from || !target) return;
    if (from.state !== "lobby" || target.state !== "lobby") return;
    if (from.id === target.id) return;

    io.to(target.id).emit("duel:invite", {
      from: {
        id: from.id,
        name: from.name,
        skin: from.skin
      }
    });
  });

  socket.on("duel:accept", challengerId => {
    const a = players.get(challengerId);
    const b = players.get(socket.id);

    if (!a || !b) return;
    if (a.state !== "lobby" || b.state !== "lobby") return;

    createDuel(a, b);
  });

  socket.on("duel:decline", challengerId => {
    if (challengerId) {
      io.to(challengerId).emit("duel:declined");
    }
  });

  socket.on("duel:mapChoice", map => {
    const duel = getDuel(socket.id);
    if (!duel) return;
    if (!maps.includes(map)) return;

    duel.choices[socket.id] = map;

    if (duel.players.every(id => duel.choices[id])) {
      const a = duel.choices[duel.players[0]];
      const b = duel.choices[duel.players[1]];

      duel.map = a === b
        ? a
        : maps[Math.floor(Math.random() * maps.length)];

      duel.phase = "ready";
      duel.ready = {};

      sendDuelState(duel);
    } else {
      sendDuelState(duel);
    }
  });

  socket.on("duel:ready", () => {
    const duel = getDuel(socket.id);
    if (!duel) return;

    duel.ready[socket.id] = true;

    if (duel.players.every(id => duel.ready[id])) {
      duel.phase = "fight";

      duel.players.forEach((id, index) => {
        const p = players.get(id);
        if (!p) return;

        p.hp = 100;
        p.x = index === 0 ? 180 : 820;
        p.y = 300;
      });

      duel.hp[duel.players[0]] = 100;
      duel.hp[duel.players[1]] = 100;

      sendDuelState(duel);
    } else {
      sendDuelState(duel);
    }
  });

  socket.on("duel:move", data => {
    const p = players.get(socket.id);
    const duel = getDuel(socket.id);

    if (!p || !duel || duel.phase !== "fight") return;

    const dx = Number(data?.dx) || 0;
    const dy = Number(data?.dy) || 0;

    p.x = clamp(p.x + dx, 40, 960);
    p.y = clamp(p.y + dy, 40, 560);

    io.to(duel.players[0]).emit("duel:playerMoved", publicPlayer(p));
    io.to(duel.players[1]).emit("duel:playerMoved", publicPlayer(p));
  });

  socket.on("duel:shoot", data => {
    const shooter = players.get(socket.id);
    const duel = getDuel(socket.id);

    if (!shooter || !duel || duel.phase !== "fight") return;

    const targetId = duel.players.find(id => id !== socket.id);
    const target = players.get(targetId);

    if (!target) return;

    const dx = target.x - shooter.x;
    const dy = target.y - shooter.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance > 500) return;

    const aimX = Number(data?.x);
    const aimY = Number(data?.y);

    if (!Number.isFinite(aimX) || !Number.isFinite(aimY)) return;

    const angleToTarget = Math.atan2(dy, dx);
    const shotAngle = Math.atan2(aimY, aimX);

    let difference = Math.abs(angleToTarget - shotAngle);

    if (difference > Math.PI) {
      difference = Math.PI * 2 - difference;
    }

    if (difference > 0.22) return;

    target.hp = Math.max(0, target.hp - 20);
    duel.hp[target.id] = target.hp;

    duel.players.forEach(id => {
      io.to(id).emit("duel:hit", {
        targetId: target.id,
        hp: target.hp,
        damage: 20
      });
    });

    if (target.hp <= 0) {
      duel.scores[shooter.id]++;

      duel.players.forEach(id => {
        io.to(id).emit("duel:roundEnd", {
          winnerId: shooter.id,
          scores: duel.scores
        });
      });

      if (duel.scores[shooter.id] >= 3) {
        duel.phase = "finished";

        duel.players.forEach(id => {
          io.to(id).emit("duel:matchEnd", {
            winnerId: shooter.id,
            scores: duel.scores
          });
        });
      } else {
        duel.phase = "between";
        duel.round++;
        duel.ready = {};
        duel.choices = {};
        duel.map = null;

        setTimeout(() => {
          if (duels.has(duel.id)) {
            sendDuelState(duel);
          }
        }, 1000);
      }
    }
  });

  socket.on("duel:continue", () => {
    const duel = getDuel(socket.id);
    if (!duel || duel.phase !== "finished") return;

    duel.ready[socket.id] = true;

    if (duel.players.every(id => duel.ready[id])) {
      duel.scores[duel.players[0]] = 0;
      duel.scores[duel.players[1]] = 0;

      duel.round = 1;
      duel.choices = {};
      duel.ready = {};
      duel.map = null;
      duel.phase = "select";

      duel.players.forEach(id => {
        const p = players.get(id);
        if (p) p.hp = 100;
      });

      sendDuelState(duel);
    }
  });

  socket.on("duel:returnLobby", () => {
    const duel = getDuel(socket.id);
    if (!duel) return;

    backToLobby(duel);
  });

  socket.on("disconnect", () => {
    const p = players.get(socket.id);

    if (!p) return;

    if (p.duelId) {
      const duel = duels.get(p.duelId);

      if (duel) {
        const otherId = duel.players.find(id => id !== socket.id);

        if (otherId) {
          io.to(otherId).emit("duel:opponentLeft");
        }

        backToLobby(duel);
      }
    }

    players.delete(socket.id);
    sendLobby();
  });
});

server.listen(PORT, () => {
  console.log(`LHX Neon Arena V2 läuft auf Port ${PORT}`);
});

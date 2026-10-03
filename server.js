const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const players = new Map();

app.use(express.static(path.join(__dirname, "public")));

function randomSpawn() {
    return {
        x: 200 + Math.random() * 800,
        y: 150 + Math.random() * 400
    };
}

io.on("connection", (socket) => {
    const spawn = randomSpawn();

    players.set(socket.id, {
        id: socket.id,
        name: "Spieler",
        x: spawn.x,
        y: spawn.y
    });

    socket.emit("world:init", {
        selfId: socket.id,
        players: [...players.values()]
    });

    socket.broadcast.emit("player:joined", players.get(socket.id));

    socket.on("player:name", (name) => {
        const player = players.get(socket.id);
        if (!player) return;

        player.name = String(name || "Spieler")
            .replace(/[<>]/g, "")
            .trim()
            .slice(0, 18) || "Spieler";

        io.emit("player:updated", player);
    });

    socket.on("player:move", (data) => {
        const player = players.get(socket.id);
        if (!player || !data) return;

        const x = Number(data.x);
        const y = Number(data.y);

        if (!Number.isFinite(x) || !Number.isFinite(y)) return;

        player.x = Math.max(20, Math.min(1180, x));
        player.y = Math.max(20, Math.min(680, y));

        socket.broadcast.emit("player:moved", {
            id: player.id,
            x: player.x,
            y: player.y
        });
    });

    socket.on("chat:send", (message) => {
        const player = players.get(socket.id);
        if (!player) return;

        const text = String(message || "")
            .replace(/[<>]/g, "")
            .trim()
            .slice(0, 180);

        if (!text) return;

        io.emit("chat:message", {
            name: player.name,
            message: text
        });
    });

    socket.on("disconnect", () => {
        players.delete(socket.id);
        io.emit("player:left", socket.id);
    });
});

server.listen(PORT, () => {
    console.log(`LHX Multiplayer läuft auf Port ${PORT}`);
});

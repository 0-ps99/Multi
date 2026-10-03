const socket = io();

const login = document.getElementById("login");
const game = document.getElementById("game");
const nameInput = document.getElementById("nameInput");
const joinButton = document.getElementById("joinButton");
const loginError = document.getElementById("loginError");
const playerCount = document.getElementById("playerCount");

const canvas = document.getElementById("world");
const ctx = canvas.getContext("2d");

const chatForm = document.getElementById("chatForm");
const chatInput = document.getElementById("chatInput");
const messages = document.getElementById("messages");

const players = new Map();

let selfId = null;
let joined = false;

const keys = {
    up: false,
    down: false,
    left: false,
    right: false
};

const joystickVector = {
    x: 0,
    y: 0
};

function addMessage(name, message) {
    const div = document.createElement("div");
    div.className = "message";

    const strong = document.createElement("strong");
    strong.textContent = name;

    const text = document.createElement("div");
    text.textContent = message;

    div.appendChild(strong);
    div.appendChild(text);

    messages.appendChild(div);

    while (messages.children.length > 80) {
        messages.removeChild(messages.firstChild);
    }

    messages.scrollTop = messages.scrollHeight;
}

function updateCount() {
    playerCount.textContent = players.size;
}

function join() {
    const name = nameInput.value.trim().slice(0, 18);

    if (!name) {
        loginError.textContent = "Bitte gib einen Namen ein.";
        return;
    }

    socket.emit("player:name", name);

    joined = true;

    login.classList.add("hidden");
    game.classList.remove("hidden");
}

joinButton.addEventListener("click", join);

nameInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
        join();
    }
});

socket.on("world:init", (data) => {
    selfId = data.selfId;

    players.clear();

    for (const player of data.players) {
        players.set(player.id, player);
    }

    updateCount();
});

socket.on("player:joined", (player) => {
    players.set(player.id, player);

    updateCount();

    if (joined) {
        addMessage(
            "System",
            `${player.name} ist beigetreten.`
        );
    }
});

socket.on("player:updated", (player) => {
    players.set(player.id, player);
});

socket.on("player:moved", (data) => {
    const player = players.get(data.id);

    if (!player) return;

    player.x = data.x;
    player.y = data.y;
});

socket.on("player:left", (id) => {
    const player = players.get(id);

    if (player && joined) {
        addMessage(
            "System",
            `${player.name} hat die Lobby verlassen.`
        );
    }

    players.delete(id);

    updateCount();
});

socket.on("chat:message", (data) => {
    addMessage(data.name, data.message);
});

chatForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const text = chatInput.value.trim();

    if (!text) return;

    socket.emit("chat:send", text);

    chatInput.value = "";
    chatInput.focus();
});

/* Tastatur */

window.addEventListener("keydown", (event) => {
    if (event.key === "w" || event.key === "ArrowUp") {
        keys.up = true;
    }

    if (event.key === "s" || event.key === "ArrowDown") {
        keys.down = true;
    }

    if (event.key === "a" || event.key === "ArrowLeft") {
        keys.left = true;
    }

    if (event.key === "d" || event.key === "ArrowRight") {
        keys.right = true;
    }

    if (
        [
            "ArrowUp",
            "ArrowDown",
            "ArrowLeft",
            "ArrowRight",
            " "
        ].includes(event.key)
    ) {
        event.preventDefault();
    }
});

window.addEventListener("keyup", (event) => {
    if (event.key === "w" || event.key === "ArrowUp") {
        keys.up = false;
    }

    if (event.key === "s" || event.key === "ArrowDown") {
        keys.down = false;
    }

    if (event.key === "a" || event.key === "ArrowLeft") {
        keys.left = false;
    }

    if (event.key === "d" || event.key === "ArrowRight") {
        keys.right = false;
    }
});

/* Mobile Joystick */

const joystick = document.getElementById("joystick");
const stick = document.getElementById("stick");

let joystickPointer = null;

function updateJoystick(clientX, clientY) {
    const rect = joystick.getBoundingClientRect();

    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    let dx = clientX - centerX;
    let dy = clientY - centerY;

    const max = 40;
    const distance = Math.hypot(dx, dy);

    if (distance > max) {
        dx = (dx / distance) * max;
        dy = (dy / distance) * max;
    }

    joystickVector.x = dx / max;
    joystickVector.y = dy / max;

    stick.style.transform =
        `translate(${dx}px, ${dy}px)`;
}

function resetJoystick() {
    joystickPointer = null;

    joystickVector.x = 0;
    joystickVector.y = 0;

    stick.style.transform = "translate(0, 0)";
}

joystick.addEventListener("pointerdown", (event) => {
    joystickPointer = event.pointerId;

    joystick.setPointerCapture(event.pointerId);

    updateJoystick(
        event.clientX,
        event.clientY
    );
});

joystick.addEventListener("pointermove", (event) => {
    if (event.pointerId !== joystickPointer) return;

    updateJoystick(
        event.clientX,
        event.clientY
    );
});

joystick.addEventListener("pointerup", resetJoystick);
joystick.addEventListener("pointercancel", resetJoystick);

/* Bewegung */

let lastMoveSent = 0;

function movementLoop(time) {
    const me = players.get(selfId);

    if (me) {
        let x = 0;
        let y = 0;

        if (keys.left) x -= 1;
        if (keys.right) x += 1;
        if (keys.up) y -= 1;
        if (keys.down) y += 1;

        x += joystickVector.x;
        y += joystickVector.y;

        const length = Math.hypot(x, y);

        if (length > 0) {
            x /= Math.max(1, length);
            y /= Math.max(1, length);

            const speed = 4.2;

            me.x = Math.max(
                30,
                Math.min(1170, me.x + x * speed)
            );

            me.y = Math.max(
                30,
                Math.min(670, me.y + y * speed)
            );

            if (time - lastMoveSent > 35) {
                socket.emit("player:move", {
                    x: me.x,
                    y: me.y
                });

                lastMoveSent = time;
            }
        }
    }

    requestAnimationFrame(movementLoop);
}

/* Welt zeichnen */

function drawWorld() {
    ctx.clearRect(
        0,
        0,
        canvas.width,
        canvas.height
    );

    ctx.fillStyle = "#0d1723";

    ctx.fillRect(
        0,
        0,
        canvas.width,
        canvas.height
    );

    ctx.strokeStyle =
        "rgba(255,255,255,.055)";

    ctx.lineWidth = 1;

    for (let x = 0; x <= canvas.width; x += 50) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
    }

    for (let y = 0; y <= canvas.height; y += 50) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
    }

    ctx.strokeStyle =
        "rgba(100,120,255,.22)";

    ctx.lineWidth = 3;

    ctx.strokeRect(
        40,
        40,
        1120,
        620
    );

    for (const player of players.values()) {
        const isMe = player.id === selfId;

        ctx.beginPath();

        ctx.arc(
            player.x,
            player.y,
            isMe ? 18 : 16,
            0,
            Math.PI * 2
        );

        ctx.fillStyle =
            isMe ? "#6675ff" : "#62e6a0";

        ctx.fill();

        ctx.beginPath();

        ctx.arc(
            player.x,
            player.y,
            isMe ? 21 : 19,
            0,
            Math.PI * 2
        );

        ctx.strokeStyle =
            "rgba(255,255,255,.25)";

        ctx.stroke();

        ctx.font = "bold 14px Arial";
        ctx.textAlign = "center";
        ctx.fillStyle = "#fff";

        ctx.fillText(
            player.name,
            player.x,
            player.y - 28
        );
    }

    requestAnimationFrame(drawWorld);
}

requestAnimationFrame(movementLoop);
requestAnimationFrame(drawWorld);

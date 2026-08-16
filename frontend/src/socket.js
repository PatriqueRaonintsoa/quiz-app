import { io } from "socket.io-client";
import { API_URL } from "./api.js";
import { playSound } from "./sounds.js";


let socket = null;

// Un seul socket réutilisé (créé/recréé lors des changements de page)
export function getSocket() {
  if (!socket) {
    socket = io(API_URL, { autoConnect: false });
    socket.on("sound:play", ({ sound }) => playSound(sound));
  }
  return socket;
}

export function connectAndJoin({ sessionId, role, code, deviceId }) {
  const s = getSocket();
  if (!s.connected) s.connect();
  const doJoin = () => s.emit("join", { sessionId, role, code, deviceId });
  if (s.connected) doJoin();
  else s.once("connect", doJoin);
  return s;
}

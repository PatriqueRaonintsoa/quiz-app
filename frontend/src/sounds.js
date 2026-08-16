const sounds = {
  buzzer: new Audio("/sounds/buzzer.mp3"),
  correct: new Audio("/sounds/correct.mp3"),
  wrong: new Audio("/sounds/wrong.mp3"),
};

export function playSound(name) {
  const sound = sounds[name];
  if (!sound) return;
  sound.currentTime = 0; // permet de rejouer rapidement même si déjà en cours
  sound.play().catch(() => {}); // évite les erreurs si bloqué par le navigateur
}

import { useEffect, useRef } from "react";

// Crée une vidéo muette, invisible et générée localement (via un canvas
// converti en flux vidéo), pour empêcher l'écran de s'éteindre sur les
// navigateurs qui ne supportent pas l'API Wake Lock (ex: anciennes versions
// d'iOS Safari). Aucun fichier externe requis.
function createFallbackVideo() {
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext("2d");
  if (ctx) ctx.fillRect(0, 0, 1, 1);

  const video = document.createElement("video");
  video.setAttribute("playsinline", "");
  video.setAttribute("aria-hidden", "true");
  video.muted = true;
  video.loop = true;
  video.style.position = "fixed";
  video.style.width = "1px";
  video.style.height = "1px";
  video.style.top = "-10px";
  video.style.left = "-10px";
  video.style.opacity = "0";
  video.style.pointerEvents = "none";

  if (typeof canvas.captureStream === "function") {
    video.srcObject = canvas.captureStream(1);
  }
  return video;
}

// Empêche l'écran (mobile ou desktop) de s'éteindre/se verrouiller tant que
// `active` est vrai. Utilise l'API Wake Lock quand elle est disponible, avec
// un repli vidéo silencieux sinon. Se réactive automatiquement quand l'onglet
// redevient visible (le Wake Lock est relâché par le navigateur quand
// l'onglet passe en arrière-plan).
export function useKeepAwake(active) {
  const wakeLockRef = useRef(null);
  const videoRef = useRef(null);

  useEffect(() => {
    if (!active) return;

    let cancelled = false;
    const supportsWakeLock = typeof navigator !== "undefined" && "wakeLock" in navigator;

    async function requestWakeLock() {
      if (!supportsWakeLock || cancelled) return;
      try {
        wakeLockRef.current = await navigator.wakeLock.request("screen");
      } catch {
        // Refusé (onglet masqué, permission...) : on retentera à la
        // prochaine reprise de visibilité.
      }
    }

    function startFallback() {
      if (supportsWakeLock || cancelled) return;
      if (!videoRef.current) {
        videoRef.current = createFallbackVideo();
        document.body.appendChild(videoRef.current);
      }
      videoRef.current.play().catch(() => {});
    }

    function handleVisibilityChange() {
      if (document.visibilityState !== "visible") return;
      if (supportsWakeLock) requestWakeLock();
      else startFallback();
    }

    requestWakeLock();
    startFallback();
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (wakeLockRef.current) {
        wakeLockRef.current.release().catch(() => {});
        wakeLockRef.current = null;
      }
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.remove();
        videoRef.current = null;
      }
    };
  }, [active]);
}

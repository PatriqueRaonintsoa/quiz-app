export const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";

async function request(path, options = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Erreur serveur");
  return data;
}

export const api = {
  listSessions: () => request("/api/sessions"),
  getSession: (id) => request(`/api/sessions/${id}`),
  createSession: (name, code) =>
    request("/api/sessions", { method: "POST", body: JSON.stringify({ name, code }) }),
  verifyCode: (id, code) =>
    request(`/api/sessions/${id}/verify-code`, {
      method: "POST",
      body: JSON.stringify({ code }),
    }),
  getMyPlayer: (sessionId, deviceId) =>
    request(`/api/sessions/${sessionId}/players/${deviceId}`),
  joinAsPlayer: (sessionId, name, deviceId) =>
    request(`/api/sessions/${sessionId}/players`, {
      method: "POST",
      body: JSON.stringify({ name, deviceId }),
    }),
  listQuestions: (sessionId, code) =>
    request(`/api/sessions/${sessionId}/questions?code=${encodeURIComponent(code)}`),
  createQuestion: (sessionId, code, payload) =>
    request(`/api/sessions/${sessionId}/questions`, {
      method: "POST",
      body: JSON.stringify({ code, ...payload }),
    }),
  deleteQuestion: (sessionId, code, questionId) =>
    request(`/api/sessions/${sessionId}/questions/${questionId}?code=${encodeURIComponent(code)}`, {
      method: "DELETE",
    }),
};

// Génère / récupère un identifiant persistant de device (localStorage)
export function getDeviceId() {
  let id = localStorage.getItem("quiz_device_id");
  if (!id) {
    id = "dev_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem("quiz_device_id", id);
  }
  return id;
}

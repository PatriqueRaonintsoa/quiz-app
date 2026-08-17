import { useState } from "react";
import { X, Plus } from "lucide-react";

export default function AddQuestionModal({ onClose, onSubmit }) {
  const [tab, setTab] = useState("buzzer"); // "buzzer" (question ouverte) | "qcm"
  const [submitting, setSubmitting] = useState(false);

  // Question ouverte (buzzer)
  const [openText, setOpenText] = useState("");
  const [openAnswer, setOpenAnswer] = useState("");
  const [openPoints, setOpenPoints] = useState(100);

  // Question QCM
  const [qcmText, setQcmText] = useState("");
  const [qcmOptions, setQcmOptions] = useState(["", ""]);
  const [qcmCorrect, setQcmCorrect] = useState([]);
  const [qcmMultiple, setQcmMultiple] = useState(false);
  const [qcmPoints, setQcmPoints] = useState(100);

  function toggleCorrect(idx) {
    setQcmCorrect((prev) =>
      qcmMultiple ? (prev.includes(idx) ? prev.filter((i) => i !== idx) : [...prev, idx]) : [idx]
    );
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (tab === "buzzer") {
        await onSubmit({
          type: "buzzer",
          text: openText,
          answerText: openAnswer,
          points: Number(openPoints),
        });
      } else {
        const options = qcmOptions.filter((o) => o.trim() !== "");
        await onSubmit({
          type: "qcm",
          text: qcmText,
          options,
          correctOptions: qcmCorrect,
          multiple: qcmMultiple,
          points: Number(qcmPoints),
        });
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-backdrop">
      <div className="modal-card">
        <button type="button" className="modal-close" onClick={onClose} aria-label="Fermer">
          <X size={20} />
        </button>

        <div className="segmented">
          <button
            type="button"
            className={`segmented-btn ${tab === "buzzer" ? "active" : ""}`}
            onClick={() => setTab("buzzer")}
          >
            Question ouverte
          </button>
          <button
            type="button"
            className={`segmented-btn ${tab === "qcm" ? "active" : ""}`}
            onClick={() => setTab("qcm")}
          >
            Question QCM
          </button>
        </div>

        <form className="form modal-form" onSubmit={handleSubmit}>
          {tab === "buzzer" ? (
            <>
              <label>Question</label>
              <input
                value={openText}
                onChange={(e) => setOpenText(e.target.value)}
                placeholder="Ex: Quelle est la capitale du Japon ?"
                required
              />
              <label>Bonne réponse</label>
              <input
                value={openAnswer}
                onChange={(e) => setOpenAnswer(e.target.value)}
                placeholder="Ex: Tokyo"
                required
              />
              <p className="muted modal-hint">Visible uniquement du jury, pour vous aider à juger la réponse orale.</p>
              <label>Point(s)</label>
              <input
                type="number"
                value={openPoints}
                onChange={(e) => setOpenPoints(e.target.value)}
                required
              />
            </>
          ) : (
            <>
              <div className="row between">
                <label>Question</label>
                <label className="row gap modal-checkbox-label">
                  <input
                    type="checkbox"
                    checked={qcmMultiple}
                    onChange={(e) => setQcmMultiple(e.target.checked)}
                  />
                  Choix multiple
                </label>
              </div>
              <input
                value={qcmText}
                onChange={(e) => setQcmText(e.target.value)}
                placeholder="Intitulé de la question"
                required
              />
              {qcmOptions.map((opt, i) => (
                <div key={i} className="row gap">
                  <input
                    type={qcmMultiple ? "checkbox" : "radio"}
                    name="modal-correct"
                    checked={qcmCorrect.includes(i)}
                    onChange={() => toggleCorrect(i)}
                  />
                  <input
                    placeholder={`Choix ${i + 1}`}
                    value={opt}
                    onChange={(e) => {
                      const copy = [...qcmOptions];
                      copy[i] = e.target.value;
                      setQcmOptions(copy);
                    }}
                  />
                </div>
              ))}
              <button
                type="button"
                className="btn btn-ghost btn-icon"
                onClick={() => setQcmOptions([...qcmOptions, ""])}
              >
                <Plus size={16} />
                Ajouter un choix
              </button>
              <label>Point(s)</label>
              <input
                type="number"
                value={qcmPoints}
                onChange={(e) => setQcmPoints(e.target.value)}
                required
              />
            </>
          )}

          <button type="submit" className="btn btn-primary modal-submit" disabled={submitting}>
            Ajouter à la banque
          </button>
        </form>
      </div>
    </div>
  );
}

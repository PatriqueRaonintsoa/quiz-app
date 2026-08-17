import { X, AlertTriangle } from "lucide-react";

// Modal de confirmation générique (remplace window.confirm, qui casse le
// style de l'appli). Se ferme uniquement via le bouton X ou l'un des deux
// boutons d'action, jamais en cliquant sur le fond.
export default function ConfirmModal({
  title = "Confirmer",
  message,
  confirmLabel = "Confirmer",
  cancelLabel = "Annuler",
  danger = true,
  onConfirm,
  onCancel,
}) {
  return (
    <div className="modal-backdrop">
      <div className="modal-card confirm-modal-card">
        <button type="button" className="modal-close" onClick={onCancel} aria-label="Fermer">
          <X size={20} />
        </button>

        <div className="confirm-modal-icon">
          <AlertTriangle size={26} />
        </div>
        <h3 className="confirm-modal-title">{title}</h3>
        {message && <p className="confirm-modal-message">{message}</p>}

        <div className="row gap confirm-modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`btn ${danger ? "btn-danger" : "btn-primary"}`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

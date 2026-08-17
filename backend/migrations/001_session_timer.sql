-- Migration : ajoute le minuteur de session (démarrer / pauser / terminer)
-- À exécuter une seule fois sur une base "quiz_app" déjà créée avec l'ancien schema.sql.
-- (Les nouvelles bases créées via schema.sql ont déjà ces colonnes.)

USE quiz_app;

ALTER TABLE sessions
  MODIFY status ENUM('waiting','started','paused','ended') NOT NULL DEFAULT 'waiting',
  ADD COLUMN started_at TIMESTAMP NULL AFTER current_question_id,
  ADD COLUMN ended_at TIMESTAMP NULL AFTER started_at,
  ADD COLUMN paused_at TIMESTAMP NULL AFTER ended_at,
  ADD COLUMN paused_duration_ms BIGINT NOT NULL DEFAULT 0 AFTER paused_at;

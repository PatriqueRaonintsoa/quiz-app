-- Migration : ajoute la réponse de référence pour les questions ouvertes (buzzer)
-- À exécuter une seule fois sur une base "quiz_app" déjà créée.
-- (Les nouvelles bases créées via schema.sql ont déjà cette colonne.)

USE quiz_app;

ALTER TABLE questions
  ADD COLUMN answer_text TEXT NULL AFTER text;

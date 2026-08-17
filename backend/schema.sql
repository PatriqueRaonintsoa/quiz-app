-- Schéma MySQL pour "Questions pour un champion"
CREATE DATABASE IF NOT EXISTS quiz_app CHARACTER SET utf8mb4;
USE quiz_app;

CREATE TABLE IF NOT EXISTS sessions (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(150) NOT NULL,
  code          VARCHAR(50)  NOT NULL UNIQUE, -- code secret pour accéder à la page Jury
  status        ENUM('waiting','started','paused','ended') NOT NULL DEFAULT 'waiting',
  current_question_id INT NULL,
  started_at    TIMESTAMP NULL,      -- instant du clic sur "Démarrer la session"
  ended_at      TIMESTAMP NULL,      -- instant du clic sur "Terminer la session"
  paused_at     TIMESTAMP NULL,      -- instant de la mise en pause en cours (NULL si non en pause)
  paused_duration_ms BIGINT NOT NULL DEFAULT 0, -- cumul du temps passé en pause, exclu du minuteur
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS players (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  session_id  INT NOT NULL,
  device_id   VARCHAR(100) NOT NULL, -- identifiant persistant du device (localStorage)
  name        VARCHAR(100) NOT NULL,
  score       INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_session_device (session_id, device_id),
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS questions (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  session_id      INT NOT NULL,
  type            ENUM('buzzer','qcm') NOT NULL,
  text            TEXT NOT NULL,
  answer_text     TEXT NULL,           -- pour les questions ouvertes (buzzer) : réponse de référence, visible du jury pendant la session puis dans le détail des résultats une fois la session terminée
  options         JSON NULL,           -- pour QCM : ["Paris","Lyon","Marseille"]
  correct_options JSON NULL,           -- pour QCM : [0] ou [0,2] (indices corrects)
  multiple        BOOLEAN DEFAULT FALSE, -- QCM à choix multiple ou unique
  points          INT NOT NULL DEFAULT 100,
  status          ENUM('draft','active','closed') NOT NULL DEFAULT 'draft',
  used            BOOLEAN DEFAULT FALSE, -- pour la sélection aléatoire
  activated_at    TIMESTAMP NULL,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS answers (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  question_id   INT NOT NULL,
  player_id     INT NOT NULL,
  selected      JSON NULL,      -- indices choisis (QCM) ou NULL (buzzer)
  is_correct    BOOLEAN NULL,
  points_earned INT NOT NULL DEFAULT 0,
  answered_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE,
  FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
);

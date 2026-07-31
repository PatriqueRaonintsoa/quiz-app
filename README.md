# 🏆 Questions pour un champion — App web temps réel

Application React + Node/Express + Socket.io + MySQL pour organiser un jeu
de type "Questions pour un champion" : buzzer, QCM, mode mixte, classement
en direct, écran public.

## Structure

```
quiz-app/
  backend/     API REST + Socket.io + connexion MySQL
  frontend/    Application React (Vite)
```

## 1. Base de données

```bash
mysql -u root -p < backend/schema.sql
```

Cela crée la base `quiz_app` avec les tables `sessions`, `players`,
`questions`, `answers`.

## 2. Backend

```bash
cd backend
cp .env.example .env      # adapter les identifiants MySQL
npm install
npm run dev                # démarre sur http://localhost:4000
```

## 3. Frontend

```bash
cd frontend
npm install
npm run dev                 # démarre sur http://localhost:5173
```

Par défaut le frontend appelle `http://localhost:4000`. Pour changer
l'URL de l'API, créez un fichier `frontend/.env` :

```
VITE_API_URL=http://localhost:4000
```

## Parcours fonctionnel

- **`/`** — Accueil public : liste des sessions (nom + statut), bouton
  "Créer une session" (le jury saisit un nom + un code secret).
- **`/session/:id`** — Page d'une session avec deux blocs :
  - **Jury** : saisie du code secret → accès à `/session/:id/jury`.
  - **Jouer** : saisie du nom → création du joueur (lié à un `deviceId`
    persistant en `localStorage`). Si ce device a déjà un joueur pour
    cette session, redirection automatique vers `/session/:id/play`.
- **`/session/:id/jury`** — Pilotage :
  - Démarrer / terminer la session.
  - **Mode buzzer** : lance un round sans question préalable ; le
    premier joueur qui buzz est désigné ; le jury valide "Bonne
    réponse / Mauvaise réponse / Passer" ; bouton "Question suivante".
  - **Mode QCM** : banque de questions (création avec choix unique ou
    multiple + points), activation aléatoire ou manuelle ; passage à la
    suite automatique quand tous les joueurs connectés ont répondu, ou
    manuellement via "Question suivante" / "Clôturer maintenant".
  - **Mode mixte** : les deux types de questions coexistent librement
    dans la même session (le jury choisit à chaque round).
  - Classement en direct.
- **`/session/:id/public`** — Écran public (vidéoprojecteur) : nom de
  session, timer, question active, joueur en train de répondre,
  classement en temps réel.
- **`/session/:id/play`** — Page joueur : bouton buzzer géant ou grille
  de réponses QCM, score personnel, mini classement.

## Notes techniques

- Le **temps réel** est géré via Socket.io : chaque session est une
  "room" (`session:<id>`), et l'état diffusé est adapté selon le rôle
  (jury / joueur / public) pour ne jamais révéler les bonnes réponses
  avant la clôture d'une question.
- L'état "live" (file d'attente du buzzer, question active, minuteur)
  est conservé en mémoire côté serveur (`gameState.js`) pour la
  fluidité ; les données durables (joueurs, scores, banque de
  questions, historique des réponses) sont persistées en MySQL.
- L'identification du joueur sur son appareil se fait via un
  `deviceId` généré et stocké dans `localStorage` (pas de compte /
  mot de passe nécessaire pour jouer).
- Le code de session protège uniquement l'accès à la page **Jury**
  (vérifié côté serveur à chaque connexion Socket.io et sur chaque
  route REST de gestion des questions).

## Pistes d'amélioration possibles

- Authentification plus robuste du jury (JWT au lieu du code brut
  renvoyé à chaque requête).
- Historique/replay des sessions terminées.
- Minuteur configurable avec clôture automatique des QCM au-delà d'un
  délai.
- Reconnexion joueur plus fine (garder sa place dans la file du
  buzzer après une coupure réseau).

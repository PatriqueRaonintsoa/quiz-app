# Guide de déploiement — Questions pour un champion (quiz-app)

Ce guide part de l'état actuel du projet sur ton PC (`C:\Users\ps\Desktop\SEKOLY ALAHADY\App\quiz-app`) et t'accompagne pour :

1. Pousser le code vers ton dépôt GitHub existant.
2. Récupérer et faire tourner l'application sur ton VPS (Ubuntu/Debian, avec Node.js et MySQL déjà installés).

Je n'ai pas d'accès direct à ton VPS ni à ton compte GitHub : toutes les commandes ci-dessous sont à exécuter toi-même (sur ton PC pour la partie 1, en SSH sur le VPS pour la partie 2).

Ce que j'ai vérifié avant d'écrire ce guide :
- `.git` existe déjà dans le dossier du projet, avec un `.gitignore` qui exclut `node_modules/`, `.env`, `dist/`, `build/` et les logs — bon réflexe, aucun secret ne sera poussé.
- `frontend/.env.production` contient déjà `VITE_API_URL=https://meeabo.com`. Le guide part de cette hypothèse (le frontend et l'API sont servis sur le **même nom de domaine**, ce qui évite tout souci de CORS). Remplace `meeabo.com` partout dans ce guide si ton domaine réel est différent (ex: un sous-domaine `quiz.meeabo.com`).
- `backend/package.json` a un script `start` (`node src/server.js`) tout prêt pour la prod.

---

## Partie 1 — Pousser vers GitHub (sur ton PC)

Ouvre un terminal (Git Bash, PowerShell, ou le terminal intégré de VS Code) dans le dossier `quiz-app`.

### 1.1 Vérifier l'état du dépôt

```bash
git status
git remote -v
```

- Si `git remote -v` affiche déjà une ligne `origin  https://github.com/...` (ou en SSH `git@github.com:...`), ton dépôt distant est déjà relié : passe directement à l'étape 1.3.
- S'il n'affiche rien, passe à l'étape 1.2.

### 1.2 Relier le dépôt local à ton dépôt GitHub existant (si pas encore fait)

Remplace `TON-COMPTE/TON-DEPOT` par le chemin de ton dépôt GitHub :

```bash
git remote add origin https://github.com/TON-COMPTE/TON-DEPOT.git
```

### 1.3 Committer et pousser

```bash
git add -A
git status              # relis la liste avant de committer, pour être sûr de rien pousser d'indésirable
git commit -m "Mise à jour de l'application quiz"
git branch -M main
git push -u origin main
```

Si GitHub te demande de t'authentifier et refuse ton mot de passe, c'est normal : GitHub n'accepte plus les mots de passe classiques pour `git push` en HTTPS, il faut un **Personal Access Token** (Settings → Developer settings → Personal access tokens sur github.com) à coller à la place du mot de passe, ou configurer une clé SSH.

---

## Partie 2 — Déployer sur le VPS

Connecte-toi en SSH à ton VPS :

```bash
ssh ton_utilisateur@IP_DU_VPS
```

### 2.1 Vérifier les prérequis

```bash
node -v      # attendu : v18 ou plus récent
npm -v
mysql --version
```

Si `node -v` affiche une version trop ancienne (< 18), dis-le moi et je t'indique comment la mettre à jour (via `nvm` par exemple).

### 2.2 Installer PM2 et Nginx (si pas déjà présents)

PM2 garde le backend Node en vie en arrière-plan et le relance automatiquement s'il plante ou si le VPS redémarre. Nginx sert le frontend et fait office de reverse proxy vers le backend.

```bash
sudo npm install -g pm2
sudo apt update
sudo apt install -y nginx
```

Si Nginx est déjà installé (fréquent si `meeabo.com` sert déjà un site), passe l'installation et va directement à la configuration du site (étape 2.6).

### 2.3 Cloner le projet

```bash
cd ~
git clone https://github.com/TON-COMPTE/TON-DEPOT.git quiz-app
cd quiz-app
```

*(Si le dossier existe déjà d'un déploiement précédent, va directement à la section [Mises à jour futures](#mises-à-jour-futures) plus bas au lieu de recloner.)*

### 2.4 Base de données MySQL

Crée la base et les tables à partir du schéma (déjà à jour avec toutes les fonctionnalités : minuteur de session, réponses de référence, etc. — pas besoin des fichiers `backend/migrations/*.sql`, ceux-ci ne servent qu'à mettre à jour une base déjà existante) :

```bash
mysql -u root -p < backend/schema.sql
```

Si tu préfères un utilisateur MySQL dédié plutôt que `root` (recommandé en production) :

```sql
CREATE USER 'quizapp'@'localhost' IDENTIFIED BY 'UN_MOT_DE_PASSE_SOLIDE';
GRANT ALL PRIVILEGES ON quiz_app.* TO 'quizapp'@'localhost';
FLUSH PRIVILEGES;
```

### 2.5 Configurer et démarrer le backend

```bash
cd ~/quiz-app/backend
cp .env.example .env
nano .env
```

Renseigne dans `.env` :

```
PORT=4000
DB_HOST=localhost
DB_PORT=3306
DB_USER=quizapp
DB_PASSWORD=UN_MOT_DE_PASSE_SOLIDE
DB_NAME=quiz_app
CORS_ORIGIN=https://meeabo.com
```

Installe les dépendances et démarre avec PM2 :

```bash
npm install --omit=dev
pm2 start src/server.js --name quiz-backend
pm2 save
pm2 startup      # affiche une commande à copier-coller pour que PM2 redémarre automatiquement au reboot du VPS
```

Vérifie que ça tourne :

```bash
pm2 status
pm2 logs quiz-backend --lines 50
```

### 2.6 Builder et servir le frontend

```bash
cd ~/quiz-app/frontend
npm install
npm run build
```

Ça génère `frontend/dist/` — un ensemble de fichiers statiques (HTML/JS/CSS) à servir directement par Nginx.

Crée la config Nginx :

```bash
sudo nano /etc/nginx/sites-available/meeabo.com
```

```nginx
server {
    listen 80;
    server_name meeabo.com www.meeabo.com;

    root /home/ton_utilisateur/quiz-app/frontend/dist;
    index index.html;

    # Frontend React (SPA) : toute route inconnue retombe sur index.html
    location / {
        try_files $uri /index.html;
    }

    # API REST du backend
    location /api/ {
        proxy_pass http://127.0.0.1:4000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # Socket.io (temps réel) — nécessite le support WebSocket
    location /socket.io/ {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

Remplace `ton_utilisateur` par ton nom d'utilisateur réel sur le VPS (celui utilisé pour le `git clone`), et `meeabo.com` par ton vrai domaine si différent.

Active le site :

```bash
sudo ln -s /etc/nginx/sites-available/meeabo.com /etc/nginx/sites-enabled/
sudo nginx -t          # vérifie que la config est valide
sudo systemctl reload nginx
```

### 2.7 Pointer le domaine vers le VPS

Chez ton registrar (ou gestionnaire DNS), crée un enregistrement DNS de type **A** pour `meeabo.com` (et `www.meeabo.com` si besoin) pointant vers l'IP publique de ton VPS. La propagation peut prendre de quelques minutes à quelques heures.

### 2.8 Activer HTTPS (Let's Encrypt, gratuit)

Une fois le DNS propagé (teste avec `ping meeabo.com` pour voir si ça répond bien à l'IP du VPS) :

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d meeabo.com -d www.meeabo.com
```

Certbot modifie automatiquement la config Nginx pour rediriger le HTTP vers HTTPS et renouvelle le certificat tout seul.

---

## Mises à jour futures

Une fois ce premier déploiement fait, à chaque fois que je t'envoie de nouveaux fichiers et que tu les pousses sur GitHub, voici la routine pour mettre à jour le VPS :

```bash
cd ~/quiz-app
git pull

# Si le schéma de base de données a changé (je te le préciserai) :
mysql -u root -p quiz_app < backend/migrations/XXX_nom_de_la_migration.sql

# Backend
cd backend
npm install --omit=dev
pm2 restart quiz-backend

# Frontend
cd ../frontend
npm install
npm run build     # Nginx sert directement le nouveau contenu de dist/, pas besoin de le redémarrer
```

Si tu veux, je peux te préparer un petit script `deploy.sh` qui enchaîne toutes ces étapes en une seule commande — dis-le-moi.

---

## En cas de souci

- **Le site ne répond pas du tout** : vérifie `sudo systemctl status nginx` et `sudo nginx -t`.
- **Erreur 502 Bad Gateway** : le backend n'est probablement pas démarré — vérifie `pm2 status` et `pm2 logs quiz-backend`.
- **Le frontend se charge mais rien ne fonctionne (buzzer, questions...)** : ouvre la console du navigateur (F12) sur le site en ligne — une erreur de connexion Socket.io indique généralement un souci de `CORS_ORIGIN` (backend) ou de `VITE_API_URL` (frontend, doit être rebuild après modification).
- **Erreur MySQL "Access denied"** : vérifie les identifiants dans `backend/.env`.

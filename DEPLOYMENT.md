# DEPLOYMENT.md

## Blocage actuel

Ce cloud agent a été lancé **sans dépôt GitHub** (`repoUrl = null`) et sans credentials `gh` / Vercel.

Conséquences :

- impossible de pousser sur le dépôt existant ;
- impossible de déployer via le projet Vercel existant ;
- **URL publique : NON DISPONIBLE**.

## Pour déployer (action utilisateur)

1. Relancer un agent Cursor en sélectionnant le dépôt GitHub du BRVM Investment Engine
   **ou** coller l’URL du dépôt + accès clone.
2. Si Vercel est déjà lié au dépôt : `vercel --prod` / push sur la branche de production.
3. Sinon : connecter le projet `brvm-investment-engine` à Vercel (Root Directory = ce dossier).

## Build local vérifié

```bash
npm install
npm test
npm run lint
npm run build
npm run preview
```

Build PASS localement (voir `TEST-REPORT.md`).

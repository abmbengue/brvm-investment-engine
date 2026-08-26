# DEPLOYMENT.md

## URL publique (active)

https://abmbengue.github.io/brvm-investment-engine/

- Hébergeur : **GitHub Pages** (branche `gh-pages`)
- Code source : https://github.com/abmbengue/brvm-investment-engine
- Branche source : `main`

## Vercel

Non connecté dans cet environnement (`VERCEL_TOKEN` absent).  
`vercel.json` est prêt si un projet Vercel est lié plus tard.

## Build local

```bash
npm install
npm test
npm run lint
npm run build
npm run preview
```

## Redeploy Pages

```bash
VITE_BASE=/brvm-investment-engine/ npm run build
# publier le contenu de dist/ sur la branche gh-pages
```

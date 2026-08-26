# DEPLOYMENT.md

## Production

https://abmbengue.github.io/brvm-investment-engine/

- Repo : https://github.com/abmbengue/brvm-investment-engine
- Tag stable : `v7.0.1-stable`
- Branche Pages : `gh-pages`
- Version courante : **V7.1.0-PREPARED**

## Vercel

Non connecté (`VERCEL_TOKEN` absent). `vercel.json` prêt.

## Build

```bash
npm install
npm test
npm run lint
npm run build
```

Pages :

```bash
VITE_BASE=/brvm-investment-engine/ npm run build
# publier dist/ → branche gh-pages
```

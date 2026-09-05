# BULB-MAX

Fork de [SlamaFR/BULB](https://github.com/SlamaFR/BULB) (*Beautiful Urban Line Builder*), un éditeur de plans de ligne de transports en commun.

BULB-MAX ajoute un **sélecteur de style graphique**, de nouveaux modes de transport et de nouvelles fonction expliquées dans la section « Fonctionnement » sur le site Github Pages :

- **RATP** (style d'origine)
- **Île-de-France Mobilités** : plan de ligne embarqué, police IDF Voyageur, anthracite Mobilités, logo IDFM et mention « Opéré par »
- **SNCF Voyageurs** : plan de ligne embarqué, police Achemine et logo SNCF Voyageurs

Application en ligne : <https://maretdelmazorafaelvictor-star.github.io/BULB-MAX/>

## Développement

Prérequis : Node.js 22 et [pnpm](https://pnpm.io/).

```bash
pnpm install       # dépendances
pnpm dev           # serveur de développement (http://localhost:3000/BULB-MAX/)
pnpm lint          # ESLint
pnpm generate      # build statique dans .output/public
```

Si le serveur de développement se plaint de `defineNuxtConfig is not defined` ou d'un comportement étrange après un changement de branche, supprimer le dossier `.nuxt` et relancer `pnpm dev`.

## Structure

- `data/brands.ts` : liste des styles graphiques
- `assets/style/custom.css` : polices et variables `--brand-*` de chaque style
- `assets/svg/brands/` : logos (Île-de-France Mobilités, opérateurs)
- `components/editor/` : éditeur et rendu du plan
- `data/lines/`, `data/presets/` : lignes et plans prédéfinis

## Licence et marques

Les polices Parisine (RATP) et IDF Voyageur (Île-de-France Mobilités) restent la propriété de leurs éditeurs et ne sont présentes ici que pour le fonctionnement de l'application. Les logos et chartes appartiennent à leurs propriétaires respectifs. BULB-MAX n'est affilié ni à la RATP, ni à Île-de-France Mobilités, ni à aucune autre société.

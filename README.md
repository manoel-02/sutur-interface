# Sutur — Frontend

Restructuration de l'ancien `index.html` monolithique (5813 lignes, tout
inline) en HTML propre + CSS séparé + JS modulaire. Aucune ligne de logique
n'a été réécrite — uniquement déplacée et réorganisée.

## Structure

```
index.html          # Structure HTML uniquement — plus de <style>/<script> géants
css/
├── variables.css      # Palette de couleurs, thème terminal
├── layout.css          # Connexion, disposition principale, navigation, sous-pages
├── chat.css              # Bulles de conversation, brief
├── components.css         # Médias, outils, mémoire, agents, profil, config
├── tab-ambiances.css       # Animations d'ambiance par onglet
└── remote-desktop.css       # Panneau de contrôle PC à distance
js/
├── state.js           # Variables d'état global — CHARGÉ EN PREMIER
├── api.js               # Client API unique (apiCall)
├── globe.js               # Visage 3D (Three.js) + repli 2D
├── voice.js                  # Micro, TTS, boucle vocale
├── auth.js                     # Connexion, biométrie, CGU
├── remote-desktop.js             # Contrôle PC à distance
├── chat.js                         # Envoi/affichage des messages
├── photos.js                        # Photos & permissions
├── delegate-knowledge.js              # Délégation de tâches, connaissances
├── contacts.js                          # Contacts, traduction, WhatsApp
├── focus-reminders.js                     # Minuteur focus, rappels
├── meetings.js                              # Réunions, génération de documents
├── finance.js                                 # Suivi financier
├── email.js                                     # Gmail intelligent
├── brief-memories-maps.js                         # Brief, mémoires, cartes, agents
├── push-admin.js                                     # Notifications push, admin
├── profile-integrations.js                             # Profil, connexions externes
├── app.js                                                 # Navigation, utilitaires
└── init.js               # Appels d'amorçage — CHARGÉ EN DERNIER
```

## ⚠️ Ordre de chargement — ne pas modifier

Sutur n'utilise pas de bundler (pas de Webpack/Vite). Les scripts sont chargés
comme des balises `<script>` classiques, dans l'ordre exact où `index.html`
les référence. **`state.js` doit rester premier** (toutes les variables
globales y sont déclarées) et **`init.js` doit rester dernier** (il appelle
des fonctions définies dans tous les modules précédents).

## Ce qui a été vérifié avant livraison

- CSS : 258 règles comparées entre l'original et les fichiers découpés — 0 perdue
- JS : analysé avec un vrai parseur (acorn), pas des regex — 229 fonctions,
  58 déclarations de variables et 11 instructions d'amorçage, **toutes**
  retrouvées verbatim dans les nouveaux fichiers
- Tous les fichiers JS passent `node --check` individuellement
- Testé dans un vrai navigateur (Playwright) : zéro 404, zéro erreur JS au
  chargement, toutes les fonctions/variables globales accessibles dans le bon
  ordre, le visage 3D s'initialise et réagit exactement comme avant

## Déploiement (Vercel)

Aucun changement de configuration nécessaire — Vercel sert des fichiers
statiques. Remplacer simplement le contenu du dépôt par cette structure.

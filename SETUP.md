# Mise en service du parcours « levée de fonds »

Le parcours **financement public** est déjà en place (EmailJS, scénario Make,
tag et parcours Mailchimp) : **rien de ce qui suit ne doit le modifier.**
Ce document ne couvre que ce qui manque pour le parcours **financement privé**.

Ordre à respecter : chaque étape dépend de la précédente. Une étape 3 faite
avant l'étape 2 produit des erreurs Make difficiles à lire.

---

## Étape 0 — Réparer l'envoi d'emails (bloquant, concerne les deux parcours)

Depuis le 4 août, EmailJS n'arrive plus à se connecter à la boîte d'envoi :
`535 Authentication credentials invalid`. **Aucun email ne part, public compris.**

1. EmailJS → **Email Services** → ouvrir `service_6dapp1n`
2. Reconnecter le compte, ou ressaisir le mot de passe
   - boîte Gmail : régénérer un **mot de passe d'application**
   - SMTP classique : le mot de passe a probablement été changé début août
3. Cliquer sur **Test it** — attendre le vert avant de continuer

Vérification : EmailJS → **Events**, la ligne du test doit être en `200 OK`.

---

## Étape 1 — Créer les champs Mailchimp

À faire **avant** de brancher Make : un champ absent fait échouer le module.

Mailchimp → **Audience** → **Settings** → *Audience fields and \*|MERGE|\* tags*
→ **Add A Field** pour chaque ligne ci-dessous.

Le nom de la balise doit être **exactement** celui de la colonne « Balise »
(majuscules, 10 caractères maximum, c'est une contrainte Mailchimp).

| Balise      | Type   | Contenu                                        |
|-------------|--------|------------------------------------------------|
| `PARCOURS`  | Texte  | « Levee de fonds » ou « Financement public »    |
| `COMPANY`   | Texte  | Nom de l'entreprise ou du projet                |
| `MONTANT`   | Texte  | Montant recherché (« 500 000 — 1,5 M€ »)        |
| `STADE`     | Texte  | Maturité du projet                              |
| `SECTEUR`   | Texte  | Secteur, libellé du questionnaire               |
| `SECTEURDB` | Texte  | Secteur, nom exact dans la base Notion          |
| `TRACTION`  | Texte  | Chiffre d'affaires annuel                       |
| `HORIZON`   | Texte  | Délai de levée visé                             |
| `SCORE`     | Nombre | Score de préparation à la levée, sur 100        |
| `NIVEAU`    | Texte  | Libellé du score (« Prêt à approcher… »)        |
| `NBINVEST`  | Nombre | Nombre d'investisseurs identifiés               |
| `TOPINVEST` | Texte  | Les 5 meilleurs, séparés par des virgules       |
| `TYPEINV`   | Texte  | Types d'investisseurs recherchés                |
| `THESE`     | Texte  | Thèse d'investissement souhaitée                |
| `PREPA`     | Texte  | Ce qui est déjà préparé (deck, BP…)             |
| `NOTIONURL` | Texte  | Lien vers la base Notion                        |

`FNAME`, `LNAME` et `PHONE` existent déjà, ne pas les recréer.

Tu peux sauter les champs que tu ne comptes pas utiliser dans tes newsletters :
ils seront simplement ignorés. `SCORE`, `NBINVEST`, `SECTEURDB` et `MONTANT`
sont les plus utiles pour segmenter.

### Créer le tag

Mailchimp → **Audience** → **Tags** → **Create Tag** : `FinPriv LF dataroom`

Make le créerait automatiquement, mais un parcours ne peut pas se déclencher
sur un tag qui n'existe pas encore au moment où on le configure.

---

## Étape 2 — Router le scénario Make

**Le problème à régler :** les deux parcours envoient sur le même webhook.
Depuis la mise en ligne, tes leads « levée de fonds » entrent dans le scénario
public et en ressortent avec le mauvais tag.

Chaque envoi contient un champ `parcours`, qui vaut `public` ou `levee-de-fonds`.
C'est sur lui qu'on aiguille.

1. Ouvrir le scénario existant
2. **Run once**, puis faire un parcours privé complet depuis le site :
   Make capture la structure des données, tout devient mappable ensuite
3. Insérer un **routeur** juste après le module Webhook
4. **Route A — l'existante.** Filtre : `parcours` **égal à** `public`.
   Y rebrancher les modules actuels, sans y toucher.
5. **Route B — la nouvelle.** Filtre : `parcours` **égal à** `levee-de-fonds`.
   Ajouter un module **Mailchimp → Add/Update a Subscriber** :

   | Champ du module   | Valeur à mapper              |
   |-------------------|------------------------------|
   | Email Address     | `mailchimp.email`            |
   | Status            | `subscribed`                 |
   | Update existing   | Yes                          |
   | Tags              | `mailchimp.tags`             |
   | FNAME, LNAME…     | `mailchimp.merge_fields.*`   |

   Tout est déjà prémâché dans `mailchimp.*` : aucune formule à écrire.

6. Activer le scénario (**Scheduling → Immediately as data arrives**)

> Si ta version du module Mailchimp ne propose pas de champ *Tags*, ajoute
> derrière un module de gestion des tags et passe-lui `mailchimp.tags`.

### Les deux tags de qualification

En plus de `FinPriv LF dataroom`, chaque lead privé porte :

- un tag d'horizon — `FinPriv LF urgent (moins de 3 mois)`, `… 3 a 6 mois`,
  `… 6 a 12 mois` ou `… exploration` → **tes rappels à passer en priorité**
- un tag de maturité — `FinPriv LF dossier pret` ou `… dossier a structurer`
  → utile pour brancher deux versions du parcours Dataroom

Pour ne recevoir que le tag principal : `tagsQualification: false` dans le
fichier `btd-simulator.js`.

### Cas de la personne qui fait les deux parcours

Le simulateur propose une passerelle d'un parcours à l'autre. Quelqu'un qui
enchaîne les deux reçoit le tag `Simulateur double parcours` et un champ
`mailchimp.double_parcours` à `true`. Sans filtre, cette personne entrera dans
**les deux séries de newsletters en même temps**. Ajoute une condition si tu
veux en décaler une.

---

## Étape 3 — Créer le modèle d'email privé

Aujourd'hui le parcours privé utilise le modèle du parcours public : quelqu'un
qui cherche des investisseurs reçoit un email qui parle de subventions.

1. EmailJS → **Email Templates** → dupliquer le modèle public
2. Le nommer « Simulateur — Levée de fonds »
3. **To Email** : `{{email}}`
4. **Subject** : par exemple
   `{{firstname}}, {{investors_count}} investisseurs correspondent à ton projet`
5. Adapter le corps du message avec les variables ci-dessous
6. **Copier l'identifiant du modèle** (`template_xxxxxxx`) et le placer dans
   `CONFIG.emailjs.templateIdPrive` du fichier `btd-simulator.js`

Tant que ce champ reste vide, le modèle public est utilisé en repli.

### Variables disponibles

| Variable              | Contenu                                              |
|-----------------------|------------------------------------------------------|
| `{{firstname}}`       | Prénom                                               |
| `{{investors_count}}` | Nombre d'investisseurs identifiés                    |
| `{{aids_html}}`       | Les 3 meilleurs, en cartes HTML prêtes à insérer     |
| `{{message}}`         | Les mêmes, en texte brut                             |
| `{{readiness_score}}` | Score de préparation, sur 100                        |
| `{{readiness_label}}` | Libellé du score                                     |
| `{{secteur_notion}}`  | Secteur du lead dans la base Notion                  |
| `{{notion_url}}`      | Lien vers la base Notion                             |
| `{{notion_titre}}`    | Titre de la base                                     |
| `{{calendly_url}}`    | Lien de prise de rendez-vous                         |

### Bloc d'accès à la base Notion

À coller dans le modèle pour que le lead reçoive la base par email :

```html
<p>En bonus, voici notre base complète — plus de 100 dispositifs publics
et 50 solutions de levée de fonds, classés par secteur.
Le tien s'y trouve sous « {{secteur_notion}} ».</p>

<p><a href="{{notion_url}}" style="background:#FFD700;color:#003366;padding:12px 24px;
   border-radius:50px;font-weight:bold;text-decoration:none;display:inline-block;">
   Ouvrir la base</a></p>
```

---

## Étape 4 — Créer le parcours Dataroom dans Mailchimp

1. Mailchimp → **Automations** → **Customer Journey** → **Start from scratch**
2. Point de départ : **Tag added** → `FinPriv LF dataroom`
3. Écrire les emails de la série
4. **Publier le parcours** — un parcours en brouillon ne rattrape pas les tags
   posés avant sa mise en ligne

Personnalisation possible avec les champs de l'étape 1 :

```
Bonjour *|FNAME|*,

Sur les *|NBINVEST|* investisseurs qui correspondent à *|COMPANY|*,
voici les cinq plus proches de ton projet : *|TOPINVEST|*.

Ton score de préparation est de *|SCORE|*/100.
```

Pour brancher deux versions selon la maturité du dossier, ajoute une condition
sur le tag `FinPriv LF dossier pret`.

---

## Étape 5 — Recette de bout en bout

Faire un parcours privé complet depuis le site, avec une vraie adresse, puis
vérifier dans l'ordre :

- [ ] La short-list s'affiche à l'écran
- [ ] Console du navigateur (F12) : `BTD_LAST_SEND` renvoie
      `emailOK: true` **et** `makeOK: true`
- [ ] EmailJS → **Events** : ligne en `200 OK`
- [ ] L'email arrive, avec les bons investisseurs et le lien Notion
- [ ] Make → **History** : exécution réussie, passée par la route B
- [ ] Mailchimp → **Audience** : le contact existe, porte
      `FinPriv LF dataroom` et ses champs sont remplis
- [ ] Mailchimp → **Automations** : le contact est entré dans le parcours

Refaire un parcours **public** derrière, pour vérifier que le routeur ne l'a
pas cassé.

---

## Ce qui peut attendre

- **`tagPublic`** est vide dans la configuration. Ton scénario public pose déjà
  son tag lui-même, rien n'est cassé. Renseigne-le si tu veux que le simulateur
  le transmette aussi.
- **`calendlyPrive`** est vide : le parcours privé utilise ton lien Calendly
  habituel. Mets-en un dédié si tu veux distinguer les rendez-vous levée de fonds.
- **Trous dans la base Notion** — aucun investisseur en outre-mer, pas de
  crowdequity ni de venture debt, pas de secteur e-commerce, huit business
  angels sans stade ni région. Ces profils obtiennent zéro résultat : l'outil
  l'annonce honnêtement et pousse vers le rendez-vous.
- **Deux erreurs de saisie** : « OC French Tech Seed » est classé Série D alors
  que c'est un dispositif d'amorçage, « Alter Equity » n'est classé que Série B
  alors qu'il investit dès l'amorçage.

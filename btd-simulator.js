/* =============================================================================
   BTD SIMULATOR — Outil d'éligibilité au financement
   -----------------------------------------------------------------------------
   Deux parcours dans un seul composant :
     • PUBLIC : subventions, concours, prêts à taux zéro, crédits d'impôt
     • PRIVÉ  : mise en relation avec des investisseurs (levée de fonds)

   UTILISATION
   -----------
   <script src="btd-simulator.js" defer></script>

   <!-- Les deux parcours (écran de choix) — comportement par défaut -->
   <btd-simulator></btd-simulator>

   <!-- Page dédiée "aides publiques" -->
   <btd-simulator mode="public"></btd-simulator>

   <!-- Page dédiée "levée de fonds" (SEO / campagnes Ads) -->
   <btd-simulator mode="prive"></btd-simulator>

   <!-- Brancher ta base d'investisseurs (JSON distant) -->
   <btd-simulator mode="prive" data-investors="https://.../investisseurs.json"></btd-simulator>

   <!-- Matching côté serveur (ta base ne transite jamais vers le navigateur) -->
   <btd-simulator mode="prive" data-match-endpoint="https://hook.eu2.make.com/xxx"></btd-simulator>

   On peut aussi forcer le parcours par URL : ?parcours=prive  ou  ?parcours=public
   ============================================================================= */
(function () {
  'use strict';

  var TAG = 'btd-simulator';

  /* Marqueur de version — sert à vérifier quelle version est réellement servie.
     Dans la console du navigateur, sur la page qui héberge l'outil :
         BTD_SIMULATOR_VERSION
     "2.0 …" = version deux parcours.  undefined = ancien fichier encore en cache. */
  var VERSION = '2.0 — deux parcours (public + levée de fonds)';
  try { window.BTD_SIMULATOR_VERSION = VERSION; } catch (e) {}

  if (customElements.get(TAG)) return;

  /* ---------- CONFIG ---------- */
  var CONFIG = {
    emailjs: {
      publicKey:  '9wQDV2yQMMiwHxrlp',
      serviceId:  'service_6dapp1n',
      templateId: 'template_04p4rbb',   // parcours PUBLIC
      templateIdPrive: ''               // parcours PRIVÉ (vide => réutilise templateId)
    },
    // Un webhook par parcours, donc un scénario Make et une connexion Mailchimp
    // indépendants de chaque côté : une panne d'un parcours n'affecte pas l'autre.
    makeWebhook:      'https://hook.eu2.make.com/84dc625synn7g78l7vwvgdwfq9z4fehv', // Outil éligibilité → Mailchimp
    makeWebhookPrive: 'https://hook.eu2.make.com/mxfebavcmy9ijlcep7rpsx131c8nsdek', // Dataroom investisseurs → Mailchimp
    calendly:      'https://calendly.com/btd-consulting/financement?month=2026-05',
    calendlyPrive: '',                  // vide => réutilise calendly
    fontsHref:   'https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800&display=swap',
    emailjsSrc:  'https://cdn.jsdelivr.net/npm/@emailjs/browser@3/dist/email.min.js',
    calendlyCss: 'https://assets.calendly.com/assets/external/widget.css',
    calendlyJs:  'https://assets.calendly.com/assets/external/widget.js',
    maxVisible:      4,                 // dispositifs publics affichés en clair
    maxVisiblePrive: 3,                 // investisseurs affichés en clair

    // Le score de préparation reste calculé et transmis (email, merge fields
    // SCORE et NIVEAU, tags de qualification) : seul son affichage est coupé,
    // le bloc mangeait un tiers de la hauteur du bilan sur mobile.
    afficherScorePreparation: false,
    cooldownMs:  5000,

    /* -------------------------------------------------------------------------
       BASE NOTION offerte en fin de parcours privé
       « Du public au privé : toutes les options de financement (2025-2026) »

       La page est publiée sur le web : accès vérifié depuis un navigateur sans
       session Notion. (Une requête automatisée sur cette URL reçoit un 403 :
       Notion bloque les robots, ce n'est pas un défaut de partage.)

       Si tu changes d'URL un jour, teste-la en navigation privée avant de la
       mettre ici — un lien non publié enverrait les leads sur un écran de
       connexion sans que rien ne le signale côté outil.
       ------------------------------------------------------------------------- */
    notionDb: {
      url:     'https://app.notion.com/p/Du-public-au-priv-toutes-les-options-de-financement-2025-2026-26acda9001ba80bfb163ee1555ca5c2d',
      titre:   'Du public au privé : toutes les options de financement 2025-2026',

      // L'accès à la base n'est PAS affiché à l'écran : il part uniquement dans
      // l'email. Sans cela, une adresse bidon suffirait à repartir avec la base,
      // ce qui viderait le formulaire de son intérêt.
      // Repasser à true pour ré-afficher la carte sur la page de résultats.
      surSite: false,
      surPublic: false                  // true pour l'offrir aussi au parcours public
    },

    /* -------------------------------------------------------------------------
       MAILCHIMP — piloté depuis Make, pas d'appel direct depuis le navigateur.
       Le widget se contente d'envoyer dans le webhook un bloc "mailchimp" prêt
       à mapper : tags, parcours (customer journey) et merge fields.

       ⚠️ REMPLACE les libellés ci-dessous par les valeurs EXACTES de ton compte
       Mailchimp (un tag qui n'existe pas est créé à la volée, un tag mal
       orthographié ne déclenchera aucun parcours).
       ------------------------------------------------------------------------- */
    mailchimp: {
      // Tag principal de chaque parcours — c'est lui qui déclenche la série de NL.
      // ⚠️ tagPublic : renseigne ici le tag que ton scénario Make pose déjà pour le
      //    parcours aides publiques. Laissé vide, aucun tag public n'est envoyé
      //    (ton montage actuel continue de fonctionner, il n'est pas touché).
      tagPublic: '',
      tagPrive:  'FinPriv LF dataroom',

      // Préfixe des tags de qualification du parcours privé, aligné sur tagPrive
      // pour qu'ils se regroupent dans la liste Mailchimp.
      prefixePrive: 'FinPriv LF',

      // Tag posé quand la même personne fait AUSSI l'autre parcours dans la session.
      // Sert à éviter qu'elle reçoive deux séries de newsletters en parallèle.
      tagMixte:  'Simulateur double parcours',

      // Tags secondaires de qualification (mets false pour n'envoyer que le tag principal)
      tagsQualification: true,

      // Customer Journey déclenché par API plutôt que par tag : renseigne les ID
      // relevés dans Mailchimp (Parcours > ... > Utiliser l'API). Laisse vide si
      // ton parcours démarre sur "Tag ajouté" — c'est le montage recommandé.
      journeyPublic: { id: '', stepId: '' },
      journeyPrive:  { id: '', stepId: '' }   // parcours "Dataroom"
    }
  };

  /* =============================================================================
     PARCOURS 1 — FINANCEMENT PUBLIC
     ============================================================================= */
  var QUESTIONS_PUBLIC = [
    { id:1, q:"Ton entreprise est-elle déjà immatriculée ?",
      o:[['oui','Oui'],['non','Non, projet en création']] },
    { id:2, q:"Stade de maturité de ton projet :",
      o:[['creation','Création'],['croissance','Croissance'],['diversification','Diversification'],['export','Développement international']] },
    { id:3, q:"As-tu déjà levé des fonds ou obtenu un financement public ?",
      o:[['oui','Oui'],['non','Non, jamais']] },
    { id:4, q:"Combien de personnes composent ton équipe ?",
      o:[['0','Seul·e'],['1-5','1 à 5 personnes'],['6+','6 personnes ou plus']] },
    { id:5, q:"Ton projet intègre-t-il une innovation ?",
      o:[['oui','Oui'],['non','Non']],
      sub:{
        trigger:'oui',
        key:'innovation-type',
        multi:true,
        q:"Type(s) d'innovation (plusieurs choix possibles) :",
        o:[
          ['technologique','Technologique'],
          ['sociale','Sociale'],
          ['ergonomique','Ergonomique'],
          ['technique','Technique'],
          ['business',"Modèle d'affaires"],
          ['autre','Autre']
        ]
      }
    },
    { id:6, q:"Bénéficies-tu d'un accompagnement (incubateur, réseau…) ?",
      o:[['oui','Oui'],['non','Non']] },
    { id:7, q:"Ton entreprise est-elle localisée en France ?",
      o:[['oui','Oui'],['non','Non']] },
    { id:8, q:"Quel est ton besoin de financement ?",
      o:[['0-50k',"Jusqu'à 50 000 €"],['50k-150k','50 000 — 150 000 €'],['150k-300k','150 000 — 300 000 €'],['300k+','Plus de 300 000 €']] },
    { id:9, q:"Que souhaites-tu financer ? (plusieurs choix possibles)",
      multi:true,
      o:[
        ['randd','Recherche & développement'],
        ['materiel','Investissement matériel / industriel'],
        ['tresorerie','Trésorerie'],
        ['recrutement','Recrutement et communication'],
        ['autres','Autres']
      ] },
    { id:10, q:"De quels fonds propres disposes-tu ?",
      o:[['0-10k',"Jusqu'à 10 000 €"],['10k-25k','10 000 — 25 000 €'],['25k-100k','25 000 — 100 000 €'],['100k+','Plus de 100 000 €']] }
  ];

  var DESC = {
    'Bourse French Tech (BFT)': "Subvention jusqu'à 30 000 € pour les startups innovantes en phase d'amorçage.",
    'Bourse French Tech Émergence (BFTE)': "Financement pour les entreprises technologiques en phase d'émergence.",
    'i-Lab': "Concours d'innovation pour la création d'entreprises de technologies innovantes.",
    'i-Nov': "Concours d'innovation pour les PME avec des projets à fort potentiel.",
    'Phase Initiative': "Accompagnement et financement pour les projets en phase d'idéation.",
    "Prêt d'honneur Réseau Entreprendre": "Prêt d'honneur à taux zéro et mentorat par le Réseau Entreprendre, pour les créateurs et repreneurs accompagnés.",
    'Aides régionales': "Dispositifs de soutien spécifiques à ta région.",
    'Avance remboursable BPI': "Financement sans garantie pour les projets innovants.",
    "Prêt d'amorçage BPI": "Prêt destiné aux entreprises innovantes en phase de levée de fonds.",
    'Prêt innovation BPI': "Prêt pour financer le développement et la commercialisation d'innovations.",
    "Crédit d'impôt innovation (CII)": "Crédit d'impôt de 30 % sur les dépenses d'innovation des PME.",
    "Crédit d'impôt recherche (CIR)": "Crédit d'impôt jusqu'à 30 % des dépenses de R&D.",
    "Aide à l'export (Chèque Relance Export)": "Soutien financier pour le développement à l'international.",
    'Prêt Croissance Internationale BPI': "Financement pour accélérer le développement à l'international.",
    'Garantie BPI': "Garantie de prêt bancaire pour faciliter l'accès au financement.",
    'FEDER': "Fonds européen de développement régional (innovation & compétitivité).",
    'Horizon Europe (EIC Accelerator)': "Programme européen pour la recherche et l'innovation deeptech.",
    "Aide à l'embauche": "Soutien financier pour la création d'emplois (zones & profils éligibles).",
    'Aide à la formation (OPCO/FNE)': "Financement de la formation des salariés.",
    "Prêt d'honneur": "Prêt personnel à taux zéro pour renforcer les fonds propres (Initiative France, etc.)."
  };

  /* ---------- LOGIQUE D'ÉLIGIBILITÉ PUBLIQUE (multi-types + multi-usages) ---------- */
  function analyzePublic(a) {
    var types = a['innovation-type'];
    if (!Array.isArray(types)) types = types ? [types] : [];
    var hasType   = function (x) { return types.indexOf(x) > -1; };
    var hasAnyTech = hasType('technologique') || hasType('technique');

    var uses = a[9];
    if (!Array.isArray(uses)) uses = uses ? [uses] : [];
    var hasUse = function (x) { return uses.indexOf(x) > -1; };

    var fr=a[7]==='oui', imm=a[1]==='oui', inno=a[5]==='oui',
        st=a[2], team=a[4], need=a[8], eq=a[10],
        acc=a[6]==='oui', funded=a[3]==='oui';

    var rules = [
      ['Bourse French Tech (BFT)', function(){ if(!fr||!inno||!imm)return 0; if(st!=='creation')return 0; if(team==='6+')return 0; if(need!=='0-50k')return 0; var s=80; if(hasAnyTech)s+=15; return s; }],
      ['Bourse French Tech Émergence (BFTE)', function(){ if(!fr||!inno||!imm)return 0; if(st!=='creation')return 0; if(!hasAnyTech)return 0; if(team==='6+')return 0; return 85; }],
      ['i-Lab', function(){ if(!fr||!inno)return 0; if(!hasType('technologique'))return 0; if(imm&&st!=='creation')return 0; return 75; }],
      ['i-Nov', function(){ if(!fr||!inno||!imm)return 0; if(st!=='croissance'&&st!=='diversification')return 0; if(team==='0')return 0; if(need==='0-50k')return 0; return 80; }],
      ['Phase Initiative', function(){ if(!fr||st!=='creation'||!acc)return 0; if(eq==='100k+')return 0; return 70; }],
      ["Prêt d'honneur Réseau Entreprendre", function(){ if(!fr||!acc)return 0; if(st!=='creation'&&st!=='croissance')return 0; if(team==='0')return 0; return 70; }],
      ['Aides régionales', function(){ if(!fr)return 0; var s=50; if(hasUse('recrutement')||hasUse('materiel'))s+=20; if(inno)s+=10; return s; }],
      ['Avance remboursable BPI', function(){ if(!fr||!inno||!imm)return 0; if(need==='0-50k')return 0; if(!hasUse('randd')&&!hasUse('materiel'))return 0; return 75; }],
      ["Prêt d'amorçage BPI", function(){ if(!fr||!imm||!funded)return 0; if(st!=='creation'&&st!=='croissance')return 0; if(!inno)return 0; return 80; }],
      ['Prêt innovation BPI', function(){ if(!fr||!inno||!imm)return 0; if(st!=='croissance'&&st!=='diversification')return 0; if(need==='0-50k')return 0; return 75; }],
      ["Crédit d'impôt innovation (CII)", function(){
        if(!fr||!inno||!imm)return 0;
        var techRelated = hasType('technologique')||hasType('technique')||hasType('ergonomique');
        if(!techRelated)return 0;
        if(team==='0')return 0;
        return 70;
      }],
      ["Crédit d'impôt recherche (CIR)", function(){ if(!fr||!inno||!imm)return 0; if(!hasType('technologique'))return 0; if(!hasUse('randd'))return 0; return 90; }],
      ["Aide à l'export (Chèque Relance Export)", function(){ if(!fr||!imm)return 0; if(st!=='export')return 0; return 80; }],
      ['Prêt Croissance Internationale BPI', function(){ if(!fr||!imm)return 0; if(st!=='export')return 0; if(team==='0')return 0; if(need==='0-50k')return 0; return 75; }],
      ['Garantie BPI', function(){ if(!fr||!imm)return 0; if(eq!=='0-10k'&&eq!=='10k-25k')return 0; if(need==='0-50k')return 0; return 60; }],
      ['FEDER', function(){ if(!fr||!inno)return 0; if(need!=='150k-300k'&&need!=='300k+')return 0; return 65; }],
      ['Horizon Europe (EIC Accelerator)', function(){ if(!inno)return 0; if(!hasType('technologique'))return 0; if(need!=='300k+')return 0; return 70; }],
      ["Aide à l'embauche", function(){ if(!fr||!imm)return 0; if(st!=='croissance'&&st!=='diversification')return 0; if(team==='0')return 0; var s=55; if(hasUse('recrutement'))s+=15; return s; }],
      ['Aide à la formation (OPCO/FNE)', function(){ if(!fr||!imm)return 0; if(team==='0')return 0; return 50; }],
      ["Prêt d'honneur", function(){ if(!fr||st!=='creation')return 0; if(eq!=='0-10k'&&eq!=='10k-25k')return 0; return 65; }]
    ];
    var res = rules.map(function(r){ return { name:r[0], score:r[1]() }; })
                   .filter(function(r){ return r.score>0; })
                   .sort(function(x,y){ return y.score-x.score; });
    if (res.length===0 && fr) res.push({ name:'Aides régionales', score:40 });
    return res.map(function(r){ return r.name; });
  }

  /* =============================================================================
     PARCOURS 2 — FINANCEMENT PRIVÉ (LEVÉE DE FONDS)
     ============================================================================= */
  var QUESTIONS_PRIVE = [
    { id:1, q:"Où en est ton projet aujourd'hui ?",
      o:[
        ['idee',"Idée validée / étude de marché"],
        ['proto',"Prototype ou MVP en cours"],
        ['lance',"Produit lancé, premiers utilisateurs"],
        ['revenus',"Revenus récurrents (moins de 500 k€ de CA)"],
        ['scale',"Croissance forte (plus de 500 k€ de CA)"]
      ] },
    { id:2, q:"Quel montant souhaites-tu lever ?",
      o:[
        ['<150k',"Moins de 150 000 €"],
        ['150-500k',"150 000 — 500 000 €"],
        ['500k-1.5m',"500 000 — 1,5 M€"],
        ['1.5-5m',"1,5 — 5 M€"],
        ['5m+',"Plus de 5 M€"]
      ] },
    { id:3, q:"Dans quel secteur évolues-tu ?", grid:true,
      o:[
        ['saas',"Logiciel / SaaS"],
        ['ia',"IA"],
        ['deeptech',"Deeptech"],
        ['marketplace',"Marketplace"],
        ['ecommerce',"E-commerce / DTC"],
        ['fintech',"Fintech"],
        ['medtech',"Santé / MedTech"],
        ['biotech',"Biotech"],
        ['greentech',"Environnement"],
        ['agritech',"AgriTech"],
        ['foodtech',"FoodTech"],
        ['mobilite',"Mobilité"],
        ['edtech',"EdTech"],
        ['industrie',"Industriel"],
        ['btp',"BTP"],
        ['creative',"Industrie créative"],
        ['ess',"ESS / Impact"],
        ['service',"Services B2B"],
        ['autre',"Autre secteur"]
      ] },
    { id:4, q:"Quelle est ta traction commerciale ?",
      o:[
        ['pre-revenu',"Pas encore de revenus"],
        ['<10k',"Moins de 10 k€ de CA annuel"],
        ['10-100k',"10 — 100 k€ de CA annuel"],
        ['100-500k',"100 — 500 k€ de CA annuel"],
        ['500k+',"Plus de 500 k€ de CA annuel"]
      ] },
    { id:5, q:"Comment est composée ton équipe fondatrice ?",
      o:[
        ['solo',"Je suis seul·e"],
        ['2',"2 cofondateurs"],
        ['3+',"3 cofondateurs ou plus"],
        ['equipe',"Équipe constituée (fondateurs + salariés)"]
      ] },
    { id:6, q:"As-tu déjà levé des fonds ?",
      o:[
        ['non',"Non, jamais"],
        ['love',"Love money / proches (moins de 50 k€)"],
        ['amorcage',"Amorçage, business angels (50 — 300 k€)"],
        ['seed',"Seed avec un fonds (300 k€ — 1 M€)"],
        ['serieA',"Série A ou plus (plus de 1 M€)"]
      ] },
    { id:7, q:"Où est basée ton entreprise ?",
      o:[
        ['idf',"Île-de-France"],
        ['region',"Autre région française"],
        ['dom',"Outre-mer"],
        ['europe',"Europe (hors France)"],
        ['hors-europe',"Hors Europe"]
      ] },
    { id:8, q:"Quel type d'investisseurs recherches-tu ?", multi:true, grid:true,
      o:[
        ['ba',"Business angels"],
        ['vc',"Fonds VC"],
        ['cvc',"Corporate venture"],
        ['fo',"Family office"],
        ['crowd',"Crowdequity"],
        ['debt',"Non dilutif"],
        ['nsp',"Je ne sais pas"]
      ] },
    { id:9, q:"Une thèse d'investissement particulière t'intéresse ?", multi:true, grid:true,
      o:[
        ['impact',"Impact / ESG"],
        ['deeptech',"Deeptech"],
        ['diversite',"Diversité"],
        ['regional',"Ancrage régional"],
        ['industriel',"Industriel"],
        ['international',"International"],
        ['aucune',"Pas de préférence"]
      ] },
    { id:10, q:"Qu'as-tu déjà préparé pour ta levée ?", multi:true, grid:true,
      o:[
        ['deck',"Un deck investisseur"],
        ['bp',"Un prévisionnel"],
        ['captable',"Une cap table"],
        ['dataroom',"Une data room"],
        ['rien',"Rien pour l'instant"]
      ] },
    { id:11, q:"Dans quel délai veux-tu lever ?",
      o:[
        ['now',"Immédiatement (moins de 3 mois)"],
        ['3-6',"Dans 3 à 6 mois"],
        ['6-12',"Dans 6 à 12 mois"],
        ['explo',"Je me renseigne pour l'instant"]
      ] }
  ];

  /* -----------------------------------------------------------------------------
     CORRESPONDANCE SECTEUR SIMULATEUR -> SECTEURS DE LA BASE NOTION
     -----------------------------------------------------------------------------
     La question du simulateur reste courte et lisible ; la base Notion, elle,
     découpe plus finement (24 secteurs). Cette table fait le pont : le payload
     envoie les noms EXACTS des secteurs Notion, ce qui permet de filtrer la base
     ou de personnaliser une newsletter sans retraitement.

     Un choix peut viser plusieurs secteurs Notion (ex. « Environnement / Énergie »
     couvre Environnement, Transition écologique et Énergies renouvelables).
     Si tu renommes un secteur dans Notion, mets à jour la valeur ici.
     ----------------------------------------------------------------------------- */
  var SECTEUR_NOTION = {
    saas:        ['Digital / SaaS'],
    ia:          ['IA', 'Deeptech'],
    deeptech:    ['Deeptech'],
    marketplace: ['Digital / SaaS'],
    ecommerce:   ['Généraliste'],
    fintech:     ['FinTech'],
    medtech:     ['MedTech'],
    biotech:     ['BioTech'],
    greentech:   ['Environnement', 'Transition écologique', 'Energies renouvelables'],
    agritech:    ['AgriTech'],
    foodtech:    ['FoodTech'],
    mobilite:    ['Transport & mobilités'],
    edtech:      ['EdTech'],
    industrie:   ['Industriel'],
    btp:         ['BTP'],
    creative:    ['Industrie créative', 'Jeux vidéos', 'Cinéma', 'Culture'],
    ess:         ['ESS'],
    service:     ['Service', 'LegalTech'],
    autre:       ['Généraliste']
  };

  /* -----------------------------------------------------------------------------
     BASE INVESTISSEURS — base Notion « Investisseurs privés » (dataroom 2026-2027)
     -----------------------------------------------------------------------------
     159 entrées : 82 fonds de capital-risque, 56 réseaux et business angels,
     12 corporate ventures, 6 financeurs non dilutifs, 2 family offices,
     1 plateforme de crowdequity.

     Cette base remplace celle de la dataroom 2025-2026. Elle apporte les
     MONTANTS RÉELS de tickets, jusque-là déduits du stade, et couvre enfin
     l'outre-mer (21 entrées), le financement solidaire et le crowdequity.

     TRANSPOSITIONS APPLIQUÉES
     1. Stades — « Pré-amorçage » couvre love money et pre-seed, « Growth » est
        rattaché à la série B+, seuil au-delà duquel le moteur ne distingue plus.
     2. Zone — la colonne Notion donne le SIÈGE, pas le périmètre d'investissement.
        Un fonds parisien investit partout en France : il reçoit idf + région +
        Europe. Un réseau de business angels, lui, reste sur son territoire, car
        c'est le propre de ces réseaux. Les entrées « National » couvrent tout,
        outre-mer compris.
     3. Secteurs — champ libre chez toi, converti par mots-clés vers les secteurs
        du questionnaire. « Tous secteurs » et « Généraliste » deviennent all.
     4. Thèses — champ inexistant, déduites du texte. Donnée la moins fiable :
        c'est ce qu'il faut revoir en premier si un ciblage te paraît à côté.
     ----------------------------------------------------------------------------- */
  var INVESTORS = [
    { name:"Ace Angels", type:"ba", stages:["love-money","pre-seed"], ticketMin:10000, ticketMax:500000,
      sectors:["saas","marketplace"], geos:["idf"], theses:[],
      desc:"Alumni ingénieurs, tech — Paris.", url:"" },
    { name:"Alexandre Mars", type:"ba", stages:["pre-seed","seed"], ticketMin:10000, ticketMax:300000,
      sectors:["ess","saas","marketplace"], geos:["idf"], theses:["impact"],
      desc:"Impact, tech — Paris.", url:"" },
    { name:"Alsace Business Angels", type:"ba", stages:["love-money","pre-seed"], ticketMin:10000, ticketMax:500000,
      sectors:["all"], geos:["region"], theses:["regional"],
      desc:"Tous secteurs, Alsace — Strasbourg.", url:"https://alsace-business-angels.fr" },
    { name:"Angels Corner", type:"ba", stages:["love-money","pre-seed"], ticketMin:10000, ticketMax:500000,
      sectors:["saas","marketplace"], geos:["idf"], theses:[],
      desc:"Tech, digital — Paris.", url:"https://angelscorner.fr" },
    { name:"Angels Santé", type:"ba", stages:["love-money","pre-seed"], ticketMin:10000, ticketMax:500000,
      sectors:["biotech","medtech"], geos:["idf"], theses:["deeptech"],
      desc:"Santé, medtech, biotech — Paris.", url:"https://angelssante.fr" },
    { name:"Antilles-Guyane Business Angels", type:"ba", stages:["love-money","pre-seed"], ticketMin:10000, ticketMax:300000,
      sectors:["all"], geos:["dom"], theses:[],
      desc:"Tous secteurs, tissu économique local — Antilles-Guyane.", url:"" },
    { name:"Auvergne Business Angels", type:"ba", stages:["love-money","pre-seed"], ticketMin:10000, ticketMax:500000,
      sectors:["all"], geos:["region"], theses:["regional"],
      desc:"Tous secteurs — Clermont-Ferrand.", url:"https://auvergne-business-angels.fr" },
    { name:"Bourgogne Franche-Comté Angels", type:"ba", stages:["love-money","pre-seed"], ticketMin:10000, ticketMax:500000,
      sectors:["all"], geos:["region"], theses:["regional"],
      desc:"Tous secteurs — Dijon.", url:"" },
    { name:"Bretagne Business Angels", type:"ba", stages:["love-money","pre-seed"], ticketMin:10000, ticketMax:500000,
      sectors:["all"], geos:["region"], theses:["regional"],
      desc:"Tous secteurs, Bretagne — Rennes.", url:"https://bretagne-business-angels.fr" },
    { name:"Business Angels Toulouse Tech", type:"ba", stages:["love-money","pre-seed"], ticketMin:10000, ticketMax:500000,
      sectors:["deeptech","ia","saas","marketplace"], geos:["region"], theses:["deeptech","regional"],
      desc:"Tech, deeptech, aéronautique — Toulouse.", url:"" },
    { name:"Business Angels des Grandes Écoles (BADGE)", type:"ba", stages:["love-money","pre-seed"], ticketMin:10000, ticketMax:500000,
      sectors:["all"], geos:["idf"], theses:[],
      desc:"Alumni grandes écoles, tous secteurs — Paris.", url:"https://badge-network.com" },
    { name:"Business Angels des Territoires (BAT)", type:"ba", stages:["love-money","pre-seed"], ticketMin:10000, ticketMax:500000,
      sectors:["all"], geos:["idf","region","dom"], theses:[],
      desc:"Tous secteurs, ruralité/territoires — Divers.", url:"https://businessangelsdesterritoires.fr" },
    { name:"Business Angels Île-de-France", type:"ba", stages:["love-money","pre-seed"], ticketMin:10000, ticketMax:500000,
      sectors:["all"], geos:["idf"], theses:[],
      desc:"Tous secteurs, IDF — Paris.", url:"" },
    { name:"Cap Décisif Management", type:"ba", stages:["love-money","pre-seed"], ticketMin:10000, ticketMax:500000,
      sectors:["deeptech","ia","saas","marketplace"], geos:["idf"], theses:["deeptech"],
      desc:"Tech, deeptech — Paris.", url:"https://capdecisif.com" },
    { name:"Centre Val de Loire Angels", type:"ba", stages:["love-money","pre-seed"], ticketMin:10000, ticketMax:500000,
      sectors:["all"], geos:["region"], theses:["regional"],
      desc:"Tous secteurs — Orléans.", url:"https://cvla.fr" },
    { name:"Cleantech Business Angels", type:"ba", stages:["love-money","pre-seed"], ticketMin:10000, ticketMax:500000,
      sectors:["greentech"], geos:["idf"], theses:["impact"],
      desc:"Cleantech, énergie, environnement — Paris.", url:"" },
    { name:"Céline Lazorthes", type:"ba", stages:["pre-seed","seed"], ticketMin:10000, ticketMax:300000,
      sectors:["fintech","saas","marketplace"], geos:["idf"], theses:[],
      desc:"Fintech, tech — Paris.", url:"" },
    { name:"Digital Business Angels", type:"ba", stages:["love-money","pre-seed"], ticketMin:10000, ticketMax:500000,
      sectors:["saas","marketplace"], geos:["idf"], theses:[],
      desc:"Tech, digital, SaaS — Paris.", url:"" },
    { name:"ESCP Business Angels", type:"ba", stages:["love-money","pre-seed"], ticketMin:10000, ticketMax:500000,
      sectors:["all"], geos:["idf"], theses:[],
      desc:"Alumni ESCP, tous secteurs — Paris.", url:"" },
    { name:"ESSEC Business Angels", type:"ba", stages:["love-money","pre-seed"], ticketMin:10000, ticketMax:500000,
      sectors:["all"], geos:["idf"], theses:["impact"],
      desc:"Alumni ESSEC, tous secteurs — Cergy.", url:"" },
    { name:"Eric Carreel", type:"ba", stages:["pre-seed","seed"], ticketMin:10000, ticketMax:300000,
      sectors:["deeptech","ia"], geos:["idf"], theses:["deeptech"],
      desc:"Deeptech, hardware — Paris.", url:"" },
    { name:"Femmes Business Angels", type:"ba", stages:["love-money","pre-seed"], ticketMin:10000, ticketMax:500000,
      sectors:["all"], geos:["idf"], theses:["diversite"],
      desc:"Mixité, tous secteurs — Paris.", url:"https://femmesbusinessangels.org" },
    { name:"France Angels", type:"ba", stages:["love-money","pre-seed"], ticketMin:10000, ticketMax:500000,
      sectors:["all"], geos:["idf"], theses:[],
      desc:"Fédération nationale des réseaux de BA — Paris.", url:"https://franceangels.org" },
    { name:"French Tech Outre-mer", type:"ba", stages:["pre-seed","seed","serie-a","serie-b"], ticketMin:10000, ticketMax:500000,
      sectors:["saas","marketplace"], geos:["dom"], theses:[],
      desc:"Tech, innovation ultramarine — Outre-mer.", url:"https://lafrenchtech.com" },
    { name:"Frédéric Mazzella", type:"ba", stages:["pre-seed","seed"], ticketMin:10000, ticketMax:300000,
      sectors:["mobilite","saas","marketplace"], geos:["idf"], theses:[],
      desc:"Mobilité, tech — Paris.", url:"" },
    { name:"Galion Project", type:"ba", stages:["pre-seed","seed","serie-a"], ticketMin:500000, ticketMax:5000000,
      sectors:["saas","marketplace"], geos:["idf"], theses:[],
      desc:"Tech, scale-up — Paris.", url:"https://galion.co" },
    { name:"Grand Est Business Angels", type:"ba", stages:["love-money","pre-seed"], ticketMin:10000, ticketMax:500000,
      sectors:["all"], geos:["region"], theses:["regional"],
      desc:"Tous secteurs, Grand Est — Strasbourg.", url:"" },
    { name:"Grand Sud Ouest Angels", type:"ba", stages:["love-money","pre-seed"], ticketMin:10000, ticketMax:500000,
      sectors:["all"], geos:["region"], theses:["regional"],
      desc:"Tous secteurs, Sud-Ouest — Toulouse.", url:"https://gsoa.fr" },
    { name:"Guadeloupe Business Angels", type:"ba", stages:["love-money","pre-seed"], ticketMin:10000, ticketMax:300000,
      sectors:["all"], geos:["dom"], theses:[],
      desc:"Tous secteurs, amorçage local — Guadeloupe.", url:"" },
    { name:"HEC Business Angels", type:"ba", stages:["love-money","pre-seed"], ticketMin:10000, ticketMax:500000,
      sectors:["all"], geos:["idf"], theses:[],
      desc:"Alumni HEC, tous secteurs — Paris.", url:"https://hec.edu" },
    { name:"Investessor", type:"ba", stages:["love-money","pre-seed"], ticketMin:10000, ticketMax:500000,
      sectors:["all"], geos:["idf"], theses:[],
      desc:"Amorçage, tous secteurs — Paris.", url:"https://investessor.fr" },
    { name:"Jacques-Antoine Granjon", type:"ba", stages:["pre-seed","seed"], ticketMin:10000, ticketMax:300000,
      sectors:["ecommerce","saas","marketplace"], geos:["idf"], theses:[],
      desc:"E-commerce, retail tech — Paris.", url:"" },
    { name:"Jean-Baptiste Rudelle", type:"ba", stages:["pre-seed","seed"], ticketMin:10000, ticketMax:300000,
      sectors:["saas","marketplace"], geos:["idf"], theses:[],
      desc:"Adtech, tech — Paris.", url:"" },
    { name:"Loire Angels", type:"ba", stages:["love-money","pre-seed"], ticketMin:10000, ticketMax:500000,
      sectors:["all"], geos:["region"], theses:["regional"],
      desc:"Tous secteurs, Pays de la Loire — Nantes.", url:"https://loireangels.fr" },
    { name:"Love Money pour l'Emploi", type:"ba", stages:["love-money","pre-seed"], ticketMin:10000, ticketMax:500000,
      sectors:["all"], geos:["idf"], theses:[],
      desc:"Tous secteurs, amorçage — Paris.", url:"https://lovemoneypourlemploi.com" },
    { name:"Marc Simoncini", type:"ba", stages:["pre-seed","seed"], ticketMin:10000, ticketMax:300000,
      sectors:["ecommerce","saas","marketplace"], geos:["idf"], theses:[],
      desc:"Tech, consumer — Paris.", url:"" },
    { name:"Martinique Business Angels", type:"ba", stages:["love-money","pre-seed"], ticketMin:10000, ticketMax:300000,
      sectors:["all"], geos:["dom"], theses:[],
      desc:"Tous secteurs, amorçage local — Martinique.", url:"" },
    { name:"Mayotte Business Angels", type:"ba", stages:["love-money","pre-seed"], ticketMin:5000, ticketMax:150000,
      sectors:["all"], geos:["dom"], theses:[],
      desc:"Tous secteurs, très petites entreprises — Mayotte.", url:"" },
    { name:"NC Angels", type:"ba", stages:["love-money","pre-seed"], ticketMin:10000, ticketMax:200000,
      sectors:["all"], geos:["dom"], theses:[],
      desc:"Tous secteurs, amorçage local — Nouvelle-Calédonie.", url:"" },
    { name:"Nicolas Brusson", type:"ba", stages:["pre-seed","seed"], ticketMin:10000, ticketMax:300000,
      sectors:["mobilite","saas","marketplace"], geos:["idf"], theses:[],
      desc:"Mobilité, tech — Paris.", url:"" },
    { name:"Nord Business Angels", type:"ba", stages:["love-money","pre-seed"], ticketMin:10000, ticketMax:500000,
      sectors:["all"], geos:["region"], theses:["regional"],
      desc:"Tous secteurs, Hauts-de-France — Lille.", url:"https://nordbusinessangels.org" },
    { name:"Normandie Angels", type:"ba", stages:["love-money","pre-seed"], ticketMin:10000, ticketMax:500000,
      sectors:["all"], geos:["region"], theses:["regional"],
      desc:"Tous secteurs, Normandie — Rouen.", url:"https://normandie-angels.com" },
    { name:"Paris Business Angels", type:"ba", stages:["love-money","pre-seed"], ticketMin:10000, ticketMax:500000,
      sectors:["all"], geos:["idf"], theses:[],
      desc:"Tous secteurs, amorçage — Paris.", url:"https://parisbusinessangels.fr" },
    { name:"Pierre Kosciusko-Morizet", type:"ba", stages:["pre-seed","seed"], ticketMin:10000, ticketMax:300000,
      sectors:["ecommerce","saas","marketplace"], geos:["idf"], theses:[],
      desc:"Tech, e-commerce — Paris.", url:"" },
    { name:"Polytechnique Business Angels", type:"ba", stages:["love-money","pre-seed"], ticketMin:10000, ticketMax:500000,
      sectors:["deeptech","ia","saas","marketplace"], geos:["idf"], theses:["deeptech"],
      desc:"Alumni Polytechnique, deeptech — Paris.", url:"" },
    { name:"Provence Business Angels", type:"ba", stages:["love-money","pre-seed"], ticketMin:10000, ticketMax:500000,
      sectors:["all"], geos:["region"], theses:["regional"],
      desc:"Tous secteurs, PACA — Marseille.", url:"https://provencebusinessangels.org" },
    { name:"Renaud Visage", type:"ba", stages:["pre-seed","seed"], ticketMin:10000, ticketMax:300000,
      sectors:["saas","marketplace"], geos:["idf"], theses:[],
      desc:"Tech, SaaS — Paris.", url:"" },
    { name:"Rhône-Alpes Business Angels", type:"ba", stages:["love-money","pre-seed"], ticketMin:10000, ticketMax:500000,
      sectors:["all"], geos:["region"], theses:["regional"],
      desc:"Tous secteurs, région AURA — Lyon.", url:"https://rabusinessangels.com" },
    { name:"Réseau Entreprendre", type:"ba", stages:["love-money","pre-seed"], ticketMin:10000, ticketMax:500000,
      sectors:["ess"], geos:["region"], theses:["regional"],
      desc:"Accompagnement + financement entrepreneurs — Roubaix.", url:"https://reseau-entreprendre.org" },
    { name:"Réseau M", type:"ba", stages:["love-money","pre-seed"], ticketMin:10000, ticketMax:500000,
      sectors:["ess"], geos:["idf","region","dom"], theses:[],
      desc:"Accompagnement + financement seniors entrepreneurs — National.", url:"https://reseau-m.org" },
    { name:"Réseau des Investisseurs de la French Tech", type:"ba", stages:["love-money","pre-seed"], ticketMin:10000, ticketMax:500000,
      sectors:["saas","marketplace"], geos:["idf"], theses:[],
      desc:"Tech, French Tech — Paris.", url:"https://lafrenchtech.com" },
    { name:"Réunion Business Angels", type:"ba", stages:["love-money","pre-seed"], ticketMin:10000, ticketMax:300000,
      sectors:["all"], geos:["dom"], theses:[],
      desc:"Tous secteurs, amorçage local — La Réunion.", url:"" },
    { name:"Sciences Po Business Angels", type:"ba", stages:["love-money","pre-seed"], ticketMin:10000, ticketMax:500000,
      sectors:["all"], geos:["idf"], theses:["deeptech"],
      desc:"Alumni Sciences Po, tous secteurs — Paris.", url:"" },
    { name:"Sextant Expansion", type:"ba", stages:["love-money","pre-seed"], ticketMin:10000, ticketMax:500000,
      sectors:["all"], geos:["idf"], theses:[],
      desc:"Tous secteurs, growth — Paris.", url:"https://sextant-expansion.com" },
    { name:"Women Business Angels", type:"ba", stages:["love-money","pre-seed"], ticketMin:10000, ticketMax:500000,
      sectors:["all"], geos:["idf"], theses:["diversite"],
      desc:"Entrepreneures, mixité — Paris.", url:"" },
    { name:"Xavier Niel", type:"ba", stages:["pre-seed","seed"], ticketMin:10000, ticketMax:300000,
      sectors:["all"], geos:["idf"], theses:[],
      desc:"Tech, télécom, multi-secteurs — Paris.", url:"" },
    { name:"Anaxago Capital", type:"crowd", stages:["pre-seed","seed","serie-a"], ticketMin:100000, ticketMax:5000000,
      sectors:["btp","saas","marketplace"], geos:["idf","region","europe"], theses:[],
      desc:"Immobilier, tech, PME — Paris.", url:"https://anaxago.com" },
    { name:"AXA Venture Partners", type:"cvc", stages:["serie-a","serie-b"], ticketMin:3000000, ticketMax:20000000,
      sectors:["fintech","saas","marketplace"], geos:["idf","region","europe"], theses:["industriel"],
      desc:"Insurtech, fintech, SaaS — Paris.", url:"https://axavp.com" },
    { name:"Aster Capital", type:"cvc", stages:["serie-a","serie-b"], ticketMin:1000000, ticketMax:10000000,
      sectors:["greentech","deeptech","ia","industrie"], geos:["idf","region","europe"], theses:["deeptech","industriel"],
      desc:"Deeptech, énergie, industrie — Paris.", url:"https://aster.com" },
    { name:"BNP Paribas Développement", type:"cvc", stages:["serie-a","serie-b"], ticketMin:1000000, ticketMax:15000000,
      sectors:["all"], geos:["idf","region","europe"], theses:["industriel"],
      desc:"PME régionales, tous secteurs — Paris.", url:"https://bnpparibasdeveloppement.com" },
    { name:"Crédit Agricole Création", type:"cvc", stages:["serie-a","serie-b"], ticketMin:1000000, ticketMax:15000000,
      sectors:["all"], geos:["idf","region","europe"], theses:["industriel"],
      desc:"PME régionales, tous secteurs — Paris.", url:"https://credit-agricole.com" },
    { name:"Crédit Mutuel Innovation", type:"cvc", stages:["pre-seed","seed","serie-a","serie-b"], ticketMin:500000, ticketMax:10000000,
      sectors:["deeptech","ia","saas","marketplace"], geos:["idf","region","europe"], theses:["deeptech","industriel"],
      desc:"Tech, deeptech — Paris.", url:"https://cm-innovation.com" },
    { name:"Decathlon Innovation Fund", type:"cvc", stages:["serie-a","serie-b"], ticketMin:1000000, ticketMax:15000000,
      sectors:["ecommerce","saas","marketplace"], geos:["region"], theses:["industriel"],
      desc:"Sport, retail tech — Lille.", url:"https://decathlon.com" },
    { name:"EDF Pulse Ventures", type:"cvc", stages:["serie-a","serie-b"], ticketMin:1000000, ticketMax:15000000,
      sectors:["greentech"], geos:["idf","region","europe"], theses:["impact","industriel"],
      desc:"Energie, cleantech — Paris.", url:"https://edf.fr" },
    { name:"L'Oréal BOLD", type:"cvc", stages:["serie-a","serie-b"], ticketMin:1000000, ticketMax:15000000,
      sectors:["ecommerce","saas","marketplace"], geos:["idf","region","europe"], theses:["industriel"],
      desc:"Beauté, cosmétique tech — Paris.", url:"https://loreal.com" },
    { name:"Motier Ventures", type:"cvc", stages:["serie-a","serie-b"], ticketMin:1000000, ticketMax:10000000,
      sectors:["fintech"], geos:["idf","region","europe"], theses:["industriel"],
      desc:"Fintech, insurtech — Paris.", url:"https://motierventures.com" },
    { name:"Orange Ventures", type:"cvc", stages:["serie-a","serie-b"], ticketMin:2000000, ticketMax:20000000,
      sectors:["saas","marketplace"], geos:["idf","region","europe","hors-europe"], theses:["international","industriel"],
      desc:"Telecom, tech, Afrique — Paris.", url:"https://orange.com" },
    { name:"Renault Ventures", type:"cvc", stages:["serie-a","serie-b"], ticketMin:1000000, ticketMax:15000000,
      sectors:["mobilite"], geos:["idf","region","europe"], theses:["industriel"],
      desc:"Mobilité, automobile — Paris.", url:"https://renaultgroup.com" },
    { name:"Société Générale Ventures", type:"cvc", stages:["serie-a","serie-b"], ticketMin:2000000, ticketMax:10000000,
      sectors:["fintech"], geos:["idf","region","europe"], theses:["industriel"],
      desc:"Fintech, insurtech — Paris.", url:"https://societegenerale.com" },
    { name:"ADIE Outre-mer", type:"debt", stages:["love-money","pre-seed","seed"], ticketMin:1000, ticketMax:17000,
      sectors:["ess"], geos:["dom"], theses:[],
      desc:"Micro-entrepreneurs, TPE — Outre-mer.", url:"https://adie.org" },
    { name:"Adie", type:"debt", stages:["love-money","pre-seed","seed"], ticketMin:1000, ticketMax:40000,
      sectors:["ess"], geos:["idf","region","dom"], theses:[],
      desc:"Micro-entrepreneurs, TPE — National.", url:"https://adie.org" },
    { name:"Cigales", type:"debt", stages:["love-money","pre-seed"], ticketMin:10000, ticketMax:500000,
      sectors:["ess"], geos:["idf","region","dom"], theses:["impact"],
      desc:"ESS, économie solidaire — National.", url:"https://cigales.asso.fr" },
    { name:"France Active", type:"debt", stages:["love-money","pre-seed","seed"], ticketMin:1000, ticketMax:40000,
      sectors:["ess"], geos:["idf","region","dom"], theses:["impact"],
      desc:"ESS, entrepreneuriat social — National.", url:"https://franceactive.org" },
    { name:"Initiative France", type:"debt", stages:["love-money","pre-seed","seed"], ticketMin:1000, ticketMax:40000,
      sectors:["ess"], geos:["idf","region","dom"], theses:[],
      desc:"Prêts d'honneur, amorçage local — National.", url:"https://initiative-france.fr" },
    { name:"Sogefom", type:"debt", stages:["love-money","pre-seed","seed","serie-a","serie-b"], ticketMin:1500000, ticketMax:1500000,
      sectors:["all"], geos:["dom"], theses:[],
      desc:"Garantie de prêts bancaires, tous secteurs — Outre-mer.", url:"https://sogefom.fr" },
    { name:"Aglaé Ventures", type:"fo", stages:["serie-a","serie-b"], ticketMin:2000000, ticketMax:20000000,
      sectors:["creative","saas","marketplace"], geos:["idf","region","europe"], theses:[],
      desc:"Tech, luxe, media (Groupe Arnault) — Paris.", url:"https://aglaeventures.com" },
    { name:"Otium Capital", type:"fo", stages:["love-money","pre-seed","seed","serie-a","serie-b"], ticketMin:1000000, ticketMax:50000000,
      sectors:["all"], geos:["idf","region","europe"], theses:[],
      desc:"Multi-secteurs (fonds famille Mulliez) — Paris.", url:"https://otiumcapital.com" },
    { name:"123 Investment Managers", type:"vc", stages:["serie-a","serie-b"], ticketMin:1000000, ticketMax:10000000,
      sectors:["saas","marketplace"], geos:["idf","region","europe"], theses:[],
      desc:"PME, growth — Paris.", url:"https://123-im.com" },
    { name:"A Plus Finance", type:"vc", stages:["pre-seed","seed","serie-a","serie-b"], ticketMin:500000, ticketMax:10000000,
      sectors:["saas","marketplace"], geos:["idf","region","europe"], theses:[],
      desc:"Tech, innovation, growth — Paris.", url:"https://aplusfinance.com" },
    { name:"Alliance Entreprendre", type:"vc", stages:["pre-seed","seed","serie-a"], ticketMin:500000, ticketMax:5000000,
      sectors:["all"], geos:["region"], theses:[],
      desc:"PME régionales, tous secteurs — Lyon.", url:"https://alliance-entreprendre.fr" },
    { name:"Alter Equity", type:"vc", stages:["pre-seed","seed","serie-a"], ticketMin:500000, ticketMax:5000000,
      sectors:["greentech","ess"], geos:["idf","region","europe"], theses:["impact"],
      desc:"Impact, transition — Paris.", url:"https://alterequity.fr" },
    { name:"Alven", type:"vc", stages:["seed","serie-a"], ticketMin:500000, ticketMax:8000000,
      sectors:["saas","marketplace"], geos:["idf","region","europe"], theses:[],
      desc:"Tech, seed/Series A — Paris.", url:"https://alven.co" },
    { name:"Amundi Private Equity Funds", type:"vc", stages:["serie-b"], ticketMin:3000000, ticketMax:30000000,
      sectors:["all"], geos:["idf","region","europe"], theses:[],
      desc:"Growth, tous secteurs — Paris.", url:"https://amundi.com" },
    { name:"Andera Partners", type:"vc", stages:["serie-a","serie-b"], ticketMin:5000000, ticketMax:30000000,
      sectors:["medtech","saas","marketplace"], geos:["idf","region","europe"], theses:[],
      desc:"Santé, innovation — Paris.", url:"https://andera-partners.com" },
    { name:"Astanor Ventures", type:"vc", stages:["serie-a","serie-b"], ticketMin:5000000, ticketMax:30000000,
      sectors:["agritech","foodtech","ess"], geos:["idf","region","europe"], theses:["impact"],
      desc:"Agtech, foodtech, impact — Paris.", url:"https://astanor.com" },
    { name:"Axeleo Capital", type:"vc", stages:["seed","serie-a"], ticketMin:500000, ticketMax:3000000,
      sectors:["saas","marketplace"], geos:["region"], theses:[],
      desc:"SaaS B2B, tech early stage — Lyon.", url:"https://axeleo.com" },
    { name:"BPI Large Venture", type:"vc", stages:["serie-b"], ticketMin:10000000, ticketMax:50000000,
      sectors:["saas","marketplace"], geos:["idf","region","europe"], theses:[],
      desc:"Growth tech — Paris.", url:"https://bpifrance.fr" },
    { name:"Blisce", type:"vc", stages:["serie-a","serie-b"], ticketMin:2000000, ticketMax:20000000,
      sectors:["ecommerce","ess","saas","marketplace"], geos:["idf","region","europe"], theses:["impact"],
      desc:"Tech, consumer, impact — Paris.", url:"https://blisce.co" },
    { name:"Bpifrance", type:"vc", stages:["love-money","pre-seed","seed","serie-a","serie-b"], ticketMin:10000, ticketMax:50000000,
      sectors:["all"], geos:["idf","region","europe"], theses:[],
      desc:"Généraliste, tous secteurs, amorçage à croissance — Paris.", url:"https://bpifrance.fr" },
    { name:"Bpifrance - Direction Outre-mer", type:"vc", stages:["love-money","pre-seed","seed","serie-a","serie-b"], ticketMin:10000, ticketMax:50000000,
      sectors:["all"], geos:["dom"], theses:[],
      desc:"Généraliste, amorçage à croissance — La Réunion.", url:"https://bpifrance.fr" },
    { name:"Bpifrance Digital Venture", type:"vc", stages:["pre-seed","seed","serie-a"], ticketMin:500000, ticketMax:5000000,
      sectors:["deeptech","ia","saas","marketplace"], geos:["idf","region","europe"], theses:["deeptech"],
      desc:"Deeptech, digital — Paris.", url:"https://bpifrance.fr" },
    { name:"Bpifrance Entreprises 1", type:"vc", stages:["pre-seed","seed","serie-a"], ticketMin:500000, ticketMax:5000000,
      sectors:["all"], geos:["idf","region","europe"], theses:[],
      desc:"Tech, PME, généraliste — Paris.", url:"https://bpifrance.fr" },
    { name:"Breega", type:"vc", stages:["love-money","pre-seed","seed","serie-a"], ticketMin:100000, ticketMax:5000000,
      sectors:["saas","marketplace"], geos:["idf","region","europe"], theses:[],
      desc:"Tech, seed/growth — Paris.", url:"https://breega.com" },
    { name:"Bretagne Développement Innovation", type:"vc", stages:["pre-seed","seed"], ticketMin:100000, ticketMax:2000000,
      sectors:["saas","marketplace"], geos:["region"], theses:[],
      desc:"Innovation régionale Bretagne — Rennes.", url:"https://bdi.fr" },
    { name:"Cap Horn Invest", type:"vc", stages:["pre-seed","seed","serie-a"], ticketMin:500000, ticketMax:5000000,
      sectors:["deeptech","ia","saas","marketplace"], geos:["idf","region","europe"], theses:["deeptech"],
      desc:"Deeptech, tech B2B — Paris.", url:"https://caphorninvest.com" },
    { name:"Cathay Innovation", type:"vc", stages:["serie-a","serie-b"], ticketMin:5000000, ticketMax:30000000,
      sectors:["saas","marketplace"], geos:["idf","region","europe","hors-europe"], theses:["international"],
      desc:"Tech, growth, international — Paris.", url:"https://cathayinnovation.com" },
    { name:"Chausson Finance", type:"vc", stages:["pre-seed","seed","serie-a"], ticketMin:500000, ticketMax:5000000,
      sectors:["medtech","deeptech","ia"], geos:["idf","region","europe"], theses:["deeptech"],
      desc:"Deeptech, medtech — Paris.", url:"https://chaussonfinance.com" },
    { name:"Citizen Capital", type:"vc", stages:["pre-seed","seed","serie-a","serie-b"], ticketMin:500000, ticketMax:8000000,
      sectors:["ess"], geos:["idf","region","europe"], theses:["impact"],
      desc:"Impact social, ESS — Paris.", url:"https://citizencapital.fr" },
    { name:"Colam Impact", type:"vc", stages:["pre-seed","seed","serie-a"], ticketMin:500000, ticketMax:5000000,
      sectors:["ess","saas","marketplace"], geos:["idf","region","europe"], theses:["impact"],
      desc:"Impact, tech à mission — Paris.", url:"https://colamimpact.com" },
    { name:"Daphni", type:"vc", stages:["seed","serie-a"], ticketMin:500000, ticketMax:5000000,
      sectors:["marketplace","saas"], geos:["idf","region","europe"], theses:[],
      desc:"Tech, plateforme collaborative — Paris.", url:"https://daphni.com" },
    { name:"Demeter", type:"vc", stages:["pre-seed","seed","serie-a","serie-b"], ticketMin:500000, ticketMax:10000000,
      sectors:["greentech"], geos:["idf","region","europe"], theses:["impact"],
      desc:"Transition écologique, cleantech — Paris.", url:"https://demeter-im.com" },
    { name:"Educapital", type:"vc", stages:["seed","serie-a","serie-b"], ticketMin:500000, ticketMax:8000000,
      sectors:["edtech"], geos:["idf","region","europe"], theses:[],
      desc:"Edtech — Paris.", url:"https://educapital.co" },
    { name:"Elaia Deeptech Fund", type:"vc", stages:["pre-seed","seed","serie-a"], ticketMin:500000, ticketMax:5000000,
      sectors:["ia","deeptech"], geos:["idf","region","europe"], theses:["deeptech"],
      desc:"Deeptech, IA — Paris.", url:"https://elaia.com" },
    { name:"Elaia Partners", type:"vc", stages:["seed","serie-a","serie-b"], ticketMin:500000, ticketMax:10000000,
      sectors:["deeptech","ia","saas","marketplace"], geos:["idf","region","europe"], theses:["deeptech"],
      desc:"Deeptech, tech B2B — Paris.", url:"https://elaia.com" },
    { name:"Eutopia", type:"vc", stages:["pre-seed","seed","serie-a"], ticketMin:500000, ticketMax:5000000,
      sectors:["agritech","foodtech","medtech","ess"], geos:["idf","region","europe"], theses:["impact"],
      desc:"Impact, food/agri, santé — Paris.", url:"https://eutopia.vc" },
    { name:"Eutopia Ventures", type:"vc", stages:["pre-seed","seed","serie-a"], ticketMin:500000, ticketMax:5000000,
      sectors:["agritech","foodtech","medtech","ess"], geos:["idf","region","europe"], theses:["impact"],
      desc:"Impact, agri/food, santé — Paris.", url:"https://eutopia.vc" },
    { name:"Faber", type:"vc", stages:["pre-seed","seed","serie-a"], ticketMin:500000, ticketMax:5000000,
      sectors:["foodtech","ess","saas","marketplace"], geos:["idf","region","europe"], theses:["impact"],
      desc:"Foodtech, tech impact — Paris.", url:"https://fabervc.com" },
    { name:"Five Seasons Ventures", type:"vc", stages:["seed","serie-a","serie-b"], ticketMin:1000000, ticketMax:10000000,
      sectors:["agritech","foodtech"], geos:["idf","region","europe"], theses:[],
      desc:"Foodtech, agri — Paris.", url:"https://fiveseasonsventures.com" },
    { name:"Frst", type:"vc", stages:["love-money","pre-seed","seed"], ticketMin:100000, ticketMax:1000000,
      sectors:["saas","marketplace"], geos:["idf","region","europe"], theses:[],
      desc:"Pre-seed tech — Paris.", url:"https://frst.com" },
    { name:"Global Founders Capital France", type:"vc", stages:["pre-seed","seed","serie-a"], ticketMin:500000, ticketMax:5000000,
      sectors:["saas","marketplace"], geos:["idf","region","europe"], theses:[],
      desc:"Tech growth — Paris.", url:"https://globalfounderscapital.com" },
    { name:"Go Capital", type:"vc", stages:["pre-seed","seed"], ticketMin:300000, ticketMax:3000000,
      sectors:["deeptech","ia","saas","marketplace"], geos:["region"], theses:["deeptech"],
      desc:"Deeptech, tech Grand Ouest — Rennes.", url:"https://gocapital.fr" },
    { name:"Guyane Développement Innovation", type:"vc", stages:["pre-seed","seed"], ticketMin:50000, ticketMax:1000000,
      sectors:["saas","marketplace"], geos:["dom"], theses:[],
      desc:"Innovation, PME guyanaises — Guyane.", url:"" },
    { name:"Hi Inov", type:"vc", stages:["serie-a","serie-b"], ticketMin:3000000, ticketMax:20000000,
      sectors:["saas","marketplace"], geos:["idf","region","europe"], theses:[],
      desc:"Tech, digital growth — Paris.", url:"https://hi-inov.com" },
    { name:"ICAP (Institut Calédonien de Participation)", type:"vc", stages:["pre-seed","seed","serie-a","serie-b"], ticketMin:100000, ticketMax:3000000,
      sectors:["all"], geos:["dom"], theses:[],
      desc:"PME calédoniennes, tous secteurs — Nouvelle-Calédonie.", url:"https://icap.nc" },
    { name:"IDIA Capital Investissement", type:"vc", stages:["pre-seed","seed","serie-a"], ticketMin:500000, ticketMax:5000000,
      sectors:["agritech","foodtech"], geos:["idf","region","europe"], theses:[],
      desc:"Agroalimentaire, agri — Paris.", url:"https://idia-ci.fr" },
    { name:"IRDInov", type:"vc", stages:["pre-seed","seed","serie-a"], ticketMin:500000, ticketMax:5000000,
      sectors:["saas","marketplace"], geos:["region"], theses:[],
      desc:"Innovation, PME Hauts-de-France — Lille.", url:"https://irdinov.fr" },
    { name:"Idea Ventures", type:"vc", stages:["pre-seed","seed","serie-a"], ticketMin:500000, ticketMax:5000000,
      sectors:["saas","marketplace"], geos:["idf","region","europe"], theses:[],
      desc:"Tech early stage — Paris.", url:"https://idea-ventures.com" },
    { name:"Idinvest Growth", type:"vc", stages:["pre-seed","seed","serie-a"], ticketMin:500000, ticketMax:5000000,
      sectors:["saas","marketplace"], geos:["idf","region","europe"], theses:[],
      desc:"Growth equity — Paris.", url:"https://eurazeo.com" },
    { name:"Idinvest Partners (Eurazeo)", type:"vc", stages:["serie-a","serie-b"], ticketMin:1000000, ticketMax:30000000,
      sectors:["saas","marketplace"], geos:["idf","region","europe"], theses:[],
      desc:"Tech, growth — Paris.", url:"https://eurazeo.com" },
    { name:"Innovacom", type:"vc", stages:["pre-seed","seed","serie-a","serie-b"], ticketMin:500000, ticketMax:10000000,
      sectors:["medtech","deeptech","ia","saas","marketplace"], geos:["idf","region","europe"], theses:["deeptech"],
      desc:"Tech, deeptech, santé — Paris.", url:"https://innovacom.com" },
    { name:"Innovation Capital", type:"vc", stages:["serie-a","serie-b"], ticketMin:3000000, ticketMax:15000000,
      sectors:["medtech","deeptech","ia"], geos:["idf","region","europe"], theses:["deeptech"],
      desc:"Santé, sciences de la vie — Paris.", url:"https://innovation-capital.com" },
    { name:"Investir&+", type:"vc", stages:["pre-seed","seed","serie-a"], ticketMin:500000, ticketMax:5000000,
      sectors:["all"], geos:["region"], theses:[],
      desc:"PME régionales, tous secteurs — Nantes.", url:"https://investiretplus.com" },
    { name:"Investisseurs & Partenaires (I&P)", type:"vc", stages:["serie-a","serie-b"], ticketMin:300000, ticketMax:3000000,
      sectors:["ess","saas","marketplace"], geos:["idf","region","europe","hors-europe"], theses:["impact","international"],
      desc:"Afrique, PME impact — Paris.", url:"https://ietp.com" },
    { name:"Iris Capital", type:"vc", stages:["serie-a","serie-b"], ticketMin:2000000, ticketMax:15000000,
      sectors:["deeptech","ia","saas","marketplace"], geos:["idf","region","europe"], theses:["deeptech"],
      desc:"Tech, digital, deeptech — Paris.", url:"https://iriscapital.com" },
    { name:"Isai", type:"vc", stages:["seed","serie-a","serie-b"], ticketMin:500000, ticketMax:10000000,
      sectors:["saas","marketplace"], geos:["idf","region","europe"], theses:[],
      desc:"Tech, seed à growth — Paris.", url:"https://isai.fr" },
    { name:"Jeito Capital", type:"vc", stages:["serie-b"], ticketMin:10000000, ticketMax:50000000,
      sectors:["biotech","medtech","saas","marketplace"], geos:["idf","region","europe"], theses:["deeptech"],
      desc:"Biotech, santé, growth — Paris.", url:"https://jeito.life" },
    { name:"Karista", type:"vc", stages:["pre-seed","seed"], ticketMin:500000, ticketMax:5000000,
      sectors:["medtech","deeptech","ia"], geos:["idf","region","europe"], theses:["deeptech"],
      desc:"Deeptech, sciences de la vie — Paris.", url:"https://karista.fr" },
    { name:"Kerala Ventures", type:"vc", stages:["pre-seed","seed","serie-a"], ticketMin:500000, ticketMax:5000000,
      sectors:["medtech","deeptech","ia"], geos:["idf","region","europe"], theses:["deeptech"],
      desc:"Deeptech, santé — Paris.", url:"https://keralaventures.com" },
    { name:"Kima Ventures", type:"vc", stages:["pre-seed","seed"], ticketMin:150000, ticketMax:150000,
      sectors:["all"], geos:["idf","region","europe"], theses:[],
      desc:"Seed, tous secteurs tech — Paris.", url:"https://kimaventures.com" },
    { name:"Kurma Partners", type:"vc", stages:["pre-seed","seed","serie-a","serie-b"], ticketMin:1000000, ticketMax:15000000,
      sectors:["biotech","medtech"], geos:["idf","region","europe"], theses:["deeptech"],
      desc:"Biotech, medtech, santé — Paris.", url:"https://kurmapartners.com" },
    { name:"M Capital", type:"vc", stages:["serie-b"], ticketMin:3000000, ticketMax:30000000,
      sectors:["saas","marketplace"], geos:["region"], theses:[],
      desc:"PME régionales, tech — Toulouse.", url:"https://mcapital.fr" },
    { name:"NCI (Nord Capital Investissement)", type:"vc", stages:["serie-b"], ticketMin:3000000, ticketMax:30000000,
      sectors:["saas","marketplace"], geos:["region"], theses:[],
      desc:"PME régionales Hauts-de-France — Lille.", url:"https://nci-finance.com" },
    { name:"Newfund", type:"vc", stages:["pre-seed","seed"], ticketMin:500000, ticketMax:3000000,
      sectors:["saas","marketplace"], geos:["idf","region","europe"], theses:[],
      desc:"Tech, early stage — Paris.", url:"https://newfund.com" },
    { name:"Nord France Amorçage", type:"vc", stages:["pre-seed","seed"], ticketMin:100000, ticketMax:2000000,
      sectors:["saas","marketplace"], geos:["region"], theses:[],
      desc:"Amorçage, PME Hauts-de-France — Lille.", url:"https://nordfranceamorcage.fr" },
    { name:"Nouvelle-Aquitaine Co-Investissement (NACO)", type:"vc", stages:["pre-seed","seed"], ticketMin:100000, ticketMax:2000000,
      sectors:["saas","marketplace"], geos:["region"], theses:[],
      desc:"PME régionales Nouvelle-Aquitaine — Bordeaux.", url:"https://naco-fonds.fr" },
    { name:"Odyssée Venture", type:"vc", stages:["pre-seed","seed","serie-a"], ticketMin:500000, ticketMax:5000000,
      sectors:["deeptech","ia","saas","marketplace"], geos:["idf","region","europe"], theses:["deeptech"],
      desc:"Deeptech, tech B2B — Paris.", url:"https://odyssee-venture.com" },
    { name:"Omnes Capital", type:"vc", stages:["serie-a","serie-b"], ticketMin:2000000, ticketMax:20000000,
      sectors:["greentech","saas","marketplace"], geos:["idf","region","europe"], theses:[],
      desc:"Tech, énergie, growth — Paris.", url:"https://omnescapital.com" },
    { name:"Ora Capital Partners", type:"vc", stages:["pre-seed","seed","serie-a"], ticketMin:500000, ticketMax:5000000,
      sectors:["saas","marketplace"], geos:["idf","region","europe"], theses:[],
      desc:"Tech, growth — Paris.", url:"https://oracapitalpartners.com" },
    { name:"Partech", type:"vc", stages:["seed","serie-a","serie-b"], ticketMin:500000, ticketMax:20000000,
      sectors:["saas","marketplace"], geos:["idf","region","europe"], theses:[],
      desc:"Tech, digital, seed à growth — Paris.", url:"https://partechpartners.com" },
    { name:"Pays de la Loire Développement", type:"vc", stages:["pre-seed","seed"], ticketMin:100000, ticketMax:2000000,
      sectors:["saas","marketplace"], geos:["region"], theses:[],
      desc:"PME régionales — Nantes.", url:"https://pays-de-la-loire-developpement.com" },
    { name:"Point Nine", type:"vc", stages:["pre-seed","seed","serie-a"], ticketMin:500000, ticketMax:5000000,
      sectors:["marketplace","saas"], geos:["idf","region","europe"], theses:[],
      desc:"SaaS B2B, marketplaces — Paris.", url:"https://pointnine.com" },
    { name:"Quadrivium Capital", type:"vc", stages:["pre-seed","seed"], ticketMin:500000, ticketMax:5000000,
      sectors:["deeptech","ia","industrie"], geos:["idf","region","europe"], theses:["deeptech"],
      desc:"Deeptech, industrie — Paris.", url:"https://quadriviumcapital.io" },
    { name:"Rhône Dauphiné Développement", type:"vc", stages:["pre-seed","seed"], ticketMin:100000, ticketMax:2000000,
      sectors:["saas","marketplace"], geos:["region"], theses:[],
      desc:"PME régionales Auvergne-Rhône-Alpes — Grenoble.", url:"https://rdd-rra.fr" },
    { name:"Ring Capital", type:"vc", stages:["serie-a","serie-b"], ticketMin:3000000, ticketMax:15000000,
      sectors:["ess","saas","marketplace"], geos:["idf","region","europe"], theses:["impact"],
      desc:"Tech, impact, growth — Paris.", url:"https://ringcapital.fr" },
    { name:"SOCREDO Capital Investissement", type:"vc", stages:["serie-a","serie-b"], ticketMin:200000, ticketMax:3000000,
      sectors:["ecommerce","saas","marketplace"], geos:["dom"], theses:[],
      desc:"PME polynésiennes, tourisme, perliculture — Polynésie française.", url:"https://socredo.pf" },
    { name:"Serena Capital", type:"vc", stages:["serie-a","serie-b"], ticketMin:3000000, ticketMax:15000000,
      sectors:["saas","marketplace"], geos:["idf","region","europe"], theses:[],
      desc:"Tech B2B, SaaS — Paris.", url:"https://serena.vc" },
    { name:"Seventure Partners", type:"vc", stages:["pre-seed","seed","serie-a","serie-b"], ticketMin:500000, ticketMax:15000000,
      sectors:["biotech","medtech","deeptech","ia","saas","marketplace"], geos:["idf","region","europe"], theses:["deeptech"],
      desc:"Deeptech, digital, biotech — Paris.", url:"https://seventure.fr" },
    { name:"Sofider", type:"vc", stages:["serie-a","serie-b"], ticketMin:200000, ticketMax:3000000,
      sectors:["agritech","foodtech","ecommerce","saas","marketplace"], geos:["dom"], theses:[],
      desc:"PME, agroalimentaire, tourisme — La Réunion.", url:"" },
    { name:"Sofimac Investment Managers", type:"vc", stages:["serie-b"], ticketMin:3000000, ticketMax:30000000,
      sectors:["saas","marketplace"], geos:["region"], theses:[],
      desc:"PME régionales, innovation — Clermont-Ferrand.", url:"https://sofimac-im.com" },
    { name:"Sofinnova Partners", type:"vc", stages:["pre-seed","seed","serie-a","serie-b"], ticketMin:1000000, ticketMax:30000000,
      sectors:["biotech","medtech","industrie"], geos:["idf","region","europe"], theses:["impact","deeptech"],
      desc:"Santé, biotech, industrie durable — Paris.", url:"https://sofinnovapartners.com" },
    { name:"Speedinvest France", type:"vc", stages:["pre-seed","seed","serie-a"], ticketMin:500000, ticketMax:5000000,
      sectors:["fintech","deeptech","ia","saas","marketplace"], geos:["idf","region","europe"], theses:["deeptech"],
      desc:"Tech early stage, fintech, deeptech — Paris.", url:"https://speedinvest.com" },
    { name:"Supernova Invest", type:"vc", stages:["pre-seed","seed"], ticketMin:500000, ticketMax:5000000,
      sectors:["deeptech","ia"], geos:["idf","region","europe"], theses:["deeptech"],
      desc:"Deeptech, sciences — Paris.", url:"https://supernova-invest.com" },
    { name:"Techfund Capital Europe", type:"vc", stages:["pre-seed","seed","serie-a"], ticketMin:500000, ticketMax:5000000,
      sectors:["ia","deeptech"], geos:["idf","region","europe"], theses:["deeptech"],
      desc:"Deeptech, IA — Paris.", url:"https://techfund.vc" },
    { name:"Territoria Capital", type:"vc", stages:["serie-a","serie-b"], ticketMin:500000, ticketMax:5000000,
      sectors:["all"], geos:["dom"], theses:[],
      desc:"PME régionales, tous secteurs océan Indien — La Réunion.", url:"https://territoria-capital.re" },
    { name:"Truffle Capital", type:"vc", stages:["pre-seed","seed","serie-a","serie-b"], ticketMin:1000000, ticketMax:15000000,
      sectors:["medtech","fintech","deeptech","ia"], geos:["idf","region","europe"], theses:["deeptech"],
      desc:"Deeptech, medtech, fintech — Paris.", url:"https://truffle.capital" },
    { name:"Turenne Capital", type:"vc", stages:["serie-a","serie-b"], ticketMin:1000000, ticketMax:15000000,
      sectors:["medtech","saas","marketplace"], geos:["idf","region","europe"], theses:[],
      desc:"PME, tech, santé — Paris.", url:"https://turennecapital.com" },
    { name:"UI Investissement", type:"vc", stages:["serie-b"], ticketMin:3000000, ticketMax:30000000,
      sectors:["medtech","saas","marketplace"], geos:["idf","region","europe"], theses:[],
      desc:"PME, tech, santé — Paris.", url:"https://ui-investissement.com" },
    { name:"Ventech", type:"vc", stages:["seed","serie-a","serie-b"], ticketMin:500000, ticketMax:10000000,
      sectors:["saas","marketplace"], geos:["idf","region","europe"], theses:[],
      desc:"Tech, digital — Paris.", url:"https://ventechvc.com" },
    { name:"XAnge", type:"vc", stages:["pre-seed","seed","serie-a","serie-b"], ticketMin:500000, ticketMax:10000000,
      sectors:["fintech","deeptech","ia","ess","saas","marketplace"], geos:["idf","region","europe"], theses:["impact","deeptech"],
      desc:"Tech, deeptech, fintech, impact — Paris.", url:"https://xange.com" }
  ];

  /* ---------- Référentiels de matching ---------- */
  var TRACTION_ORDER = { 'pre-revenu':0, '<10k':1, '10-100k':2, '100-500k':3, '500k+':4 };

  // Montant demandé -> fourchette € + stades plausibles
  var AMOUNT_MAP = {
    '<150k':     { min:20000,   max:150000,   stages:['love-money','pre-seed'] },
    '150-500k':  { min:150000,  max:500000,   stages:['pre-seed','seed'] },
    '500k-1.5m': { min:500000,  max:1500000,  stages:['seed'] },
    '1.5-5m':    { min:1500000, max:5000000,  stages:['seed','serie-a'] },
    '5m+':       { min:5000000, max:30000000, stages:['serie-a','serie-b'] }
  };

  // Le stade projet affine les stades plausibles issus du montant
  var STAGE_MAP = {
    'idee':    ['love-money','pre-seed'],
    'proto':   ['love-money','pre-seed','seed'],
    'lance':   ['pre-seed','seed'],
    'revenus': ['seed','serie-a'],
    'scale':   ['seed','serie-a','serie-b']
  };

  var TYPE_LABEL = {
    vc:'Fonds VC', ba:'Business angels', cvc:'Corporate venture', fo:'Family office',
    crowd:'Crowdequity', debt:'Non dilutif', accelerateur:'Accélérateur'
  };
  var STAGE_LABEL = {
    'love-money':'Love money', 'pre-seed':'Pre-seed', 'seed':'Seed',
    'serie-a':'Série A', 'serie-b':'Série B+'
  };

  function arr(v){ return Array.isArray(v) ? v : (v ? [v] : []); }
  function fmtEur(n){
    if (n >= 1000000) { var m = n/1000000; return (m % 1 === 0 ? m : m.toFixed(1).replace('.',',')) + ' M€'; }
    if (n >= 1000) return Math.round(n/1000) + ' k€';
    return n + ' €';
  }

  /* -----------------------------------------------------------------------------
     MOTEUR DE MATCHING INVESTISSEURS
     -----------------------------------------------------------------------------
     Deux temps, pour produire une short-list crédible et non une liste fourre-tout :

     1) FILTRES ÉLIMINATOIRES — un investisseur qui échoue à l'un d'eux est écarté.
        Ce sont les critères sur lesquels un fonds ne transige jamais : stade,
        fourchette de ticket, secteur couvert, zone géographique, traction minimum.

     2) SCORE D'AFFINITÉ — sur les survivants, on mesure la finesse de la
        correspondance (secteur explicite vs généraliste, précision du ticket,
        type souhaité, thèse). Le score est normalisé par le maximum réellement
        atteignable compte tenu des réponses, pour que l'affinité s'étale au lieu
        de saturer à 98 % pour tout le monde.

     Résultat attendu : ~5 à 15 investisseurs pertinents, classés.
     ----------------------------------------------------------------------------- */
  var MATCH = { maxResults: 15, minAffinite: 62 };

  function matchInvestors(a, db) {
    var amount   = AMOUNT_MAP[a[2]] || AMOUNT_MAP['150-500k'];
    var stageSet = STAGE_MAP[a[1]] || amount.stages;
    // Stades retenus : intersection montant × maturité, avec repli sur le montant
    var stages = amount.stages.filter(function(s){ return stageSet.indexOf(s)>-1; });
    if (!stages.length) stages = amount.stages;

    var sector   = a[3];
    var traction = TRACTION_ORDER[a[4]] !== undefined ? TRACTION_ORDER[a[4]] : 0;
    var geo      = a[7];
    var wanted   = arr(a[8]).filter(function(x){ return x!=='nsp'; });
    var theses   = arr(a[9]).filter(function(x){ return x!=='aucune'; });
    var width    = Math.max(1, amount.max - amount.min);

    // Maximum atteignable : les points de "type" et de "thèse" n'existent que si
    // le porteur de projet a exprimé une préférence.
    var MAXI = 30 /*secteur*/ + 20 /*stade*/ + 20 /*ticket*/ + 10 /*géo*/
             + (wanted.length ? 15 : 0) + (theses.length ? 20 : 0);

    var out = [];
    db.forEach(function (inv) {
      var invStages = inv.stages || [];
      var secs      = inv.sectors || [];
      var geos      = inv.geos || [];
      var invTh     = inv.theses || [];
      var tMin = inv.ticketMin || 0, tMax = inv.ticketMax || 1e9;

      /* ---- 1. Filtres éliminatoires ---- */
      var stageHit = invStages.filter(function(s){ return stages.indexOf(s)>-1; });
      if (!stageHit.length) return;                                   // mauvais stade

      var overlap = Math.min(tMax, amount.max) - Math.max(tMin, amount.min);
      if (overlap <= 0) return;                                       // ticket hors fourchette

      var sectorExact = secs.indexOf(sector) > -1;
      var sectorAll   = secs.indexOf('all') > -1;
      if (!sectorExact && !sectorAll) return;                         // secteur non couvert

      var geoExact = geos.indexOf('all') > -1 || geos.indexOf(geo) > -1;
      var geoSoft  = !geoExact && (geo==='idf'||geo==='region'||geo==='dom') && geos.indexOf('europe') > -1;
      if (!geoExact && !geoSoft) return;                              // hors zone d'investissement

      if (inv.minTraction && TRACTION_ORDER[inv.minTraction] > traction) return; // trop tôt pour eux

      /* ---- 2. Score d'affinité ---- */
      var score = 0;
      score += sectorExact ? 30 : 12;                                  // spécialiste > généraliste
      score += Math.max(8, Math.round(20 * (stageHit.length / stages.length)));
      score += Math.max(8, Math.round(20 * Math.min(1, overlap / width)));
      score += geoExact ? 10 : 5;
      if (wanted.length) score += (wanted.indexOf(inv.type) > -1) ? 15 : 0;
      if (theses.length) {
        var hit = theses.filter(function(t){ return invTh.indexOf(t)>-1; });
        score += Math.min(20, hit.length * 12);
      }

      var affinite = Math.round(58 + 40 * (score / MAXI));
      out.push({
        name: inv.name,
        type: inv.type,
        typeLabel: TYPE_LABEL[inv.type] || 'Investisseur',
        stages: invStages.map(function(s){ return STAGE_LABEL[s]||s; }),
        ticket: fmtEur(tMin) + ' — ' + fmtEur(tMax),
        desc: inv.desc || '',
        url: inv.url || '',
        _centre: (tMin + tMax) / 2,
        affinite: Math.max(58, Math.min(98, affinite))
      });
    });

    // Sur une base large, beaucoup d'investisseurs cochent toutes les cases et
    // se retrouvent à égalité. On départage par la justesse du calibre : celui
    // dont la fourchette de ticket est la plus centrée sur le montant demandé
    // passe devant, plutôt que de laisser l'ordre alphabétique décider.
    var cible = (amount.min + amount.max) / 2;
    return out
      .filter(function(r){ return r.affinite >= MATCH.minAffinite; })
      .sort(function(x, y){
        if (y.affinite !== x.affinite) return y.affinite - x.affinite;
        return Math.abs(x._centre - cible) / cible - Math.abs(y._centre - cible) / cible;
      })
      .slice(0, MATCH.maxResults)
      .map(function(r){ delete r._centre; return r; });
  }

  /* ---------- SCORE DE PRÉPARATION À LA LEVÉE ---------- */
  function readiness(a) {
    var prep = arr(a[10]);
    var has = function(x){ return prep.indexOf(x)>-1; };
    var s = 0;

    if (has('deck'))     s += 15;
    if (has('bp'))       s += 15;
    if (has('captable')) s += 10;
    if (has('dataroom')) s += 10;

    s += ({ 'pre-revenu':0, '<10k':8, '10-100k':15, '100-500k':20, '500k+':25 })[a[4]] || 0;
    s += ({ solo:0, '2':10, '3+':12, equipe:15 })[a[5]] || 0;
    s += ({ non:0, love:3, amorcage:6, seed:8, serieA:10 })[a[6]] || 0;

    // Cohérence montant / traction
    var big = (a[2]==='1.5-5m' || a[2]==='5m+');
    if (big && (a[4]==='pre-revenu' || a[4]==='<10k')) s -= 10;

    s = Math.max(0, Math.min(100, s));

    var label, tone;
    if (s < 35)      { label = "Levée prématurée"; tone = 'low'; }
    else if (s < 60) { label = "Dossier à structurer"; tone = 'mid'; }
    else if (s < 80) { label = "Prêt à approcher des investisseurs"; tone = 'good'; }
    else             { label = "Dossier solide pour lever"; tone = 'top'; }

    // Recommandations personnalisées (3 max)
    var tips = [];
    if (!has('deck'))     tips.push("Construis un deck de 12 à 15 slides : c'est le premier filtre de tous les fonds.");
    if (!has('bp'))       tips.push("Prépare un prévisionnel financier à 3 ans avec tes hypothèses de croissance et ton besoin de trésorerie.");
    if (big && (a[4]==='pre-revenu' || a[4]==='<10k'))
      tips.push("Le montant visé est ambitieux au regard de ta traction actuelle : vise un premier tour plus court pour atteindre les jalons attendus.");
    if (a[5]==='solo')    tips.push("Un fondateur seul est un point de vigilance récurrent : associe-toi ou structure un board pour rassurer.");
    if (!has('captable')) tips.push("Mets ta cap table à jour : une répartition déséquilibrée bloque un tour plus souvent qu'on ne le croit.");
    if (a[4]==='pre-revenu')
      tips.push("Sans revenus, privilégie business angels, crowdequity et amorçage plutôt que les fonds de série A.");
    if (!has('dataroom')) tips.push("Prépare une data room (juridique, financier, produit) : tu gagneras des semaines en due diligence.");

    return { score:s, label:label, tone:tone, tips:tips.slice(0,3) };
  }

  /* ---------- Libellé lisible d'une réponse (pour le CRM / Mailchimp) ---------- */
  function labelOf(questions, qid, value) {
    var q = null;
    for (var i=0;i<questions.length;i++){ if (questions[i].id === qid) { q = questions[i]; break; } }
    if (!q) return value;
    var vals = arr(value);
    var out = vals.map(function (v) {
      for (var j=0;j<q.o.length;j++){ if (q.o[j][0] === v) return q.o[j][1]; }
      return v;
    });
    return out.join(', ');
  }

  /* =============================================================================
     DÉFINITION DES PARCOURS
     ============================================================================= */
  var TRACKS = {
    public: {
      id: 'public',
      questions: QUESTIONS_PUBLIC,
      title: "Découvre les aides adaptées à ton projet innovant",
      pitch: "En moins de 2 minutes, identifie les subventions, concours, appels à projets et prêts à taux zéro auxquels ton projet peut prétendre.",
      cta: "Voir mon éligibilité",
      badges: [['clock','2 minutes'], ['check','20 dispositifs'], ['shield','Confidentiel']]
    },
    prive: {
      id: 'prive',
      questions: QUESTIONS_PRIVE,
      title: "Trouve les investisseurs qui peuvent financer ta levée de fonds",
      pitch: "Réponds à 11 questions et découvre les fonds, business angels et plateformes dont la thèse d'investissement correspond à ton projet.",
      cta: "Trouver mes investisseurs",
      badges: [['clock','3 minutes'], ['check','Base d\'investisseurs qualifiée'], ['shield','Confidentiel']]
    }
  };

  /* ---------- HELPERS ---------- */
  function esc(s){ return typeof s==='string' ? s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;') : ''; }
  function validEmail(e){ return !!e && e.length<=254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e); }
  function validPhone(p){ if(!p)return false; var c=p.replace(/[\s.\-()]/g,''); return c.length<=20 && /^(\+33|0033|0)[1-9]\d{8}$|^\+?\d{9,15}$/.test(c); }
  function validName(n){ return !!n && n.length>=1 && n.length<=50 && /^[a-zA-ZÀ-ÿ\s'\-]+$/.test(n); }

  /* -----------------------------------------------------------------------------
     Query string de la page hôte.
     Dans une iframe, window.location.search est celui de l'iframe et non celui de
     la page : les UTM et ?parcours=prive sont perdus. On retombe alors sur
     document.referrer, qui porte l'URL de la page hôte.

     ⚠️ Vérifié au navigateur : ce repli ne fonctionne QUE si l'iframe est servie
     depuis la même origine que la page. En cross-origin — c'est le cas du bloc
     HTML de Wix, servi depuis un autre domaine — la politique de référent par
     défaut (strict-origin-when-cross-origin) réduit le référent à l'origine et la
     query string est perdue. Pour Wix, utiliser l'élément personnalisé, qui
     s'exécute directement dans la page, ou fixer le parcours par l'attribut mode.
     ----------------------------------------------------------------------------- */
  function hostSearch(){
    var qs = '';
    try { qs = window.location.search || ''; } catch(e){}
    if (/[?&](utm_[a-z]+|parcours)=/.test(qs)) return qs;
    try {
      if (window.self !== window.top && document.referrer) {
        var i = document.referrer.indexOf('?');
        if (i > -1) return document.referrer.slice(i);
      }
    } catch(e){}
    return qs;
  }

  function ensureFont(){
    try {
      if (document.querySelector('link[data-btd-font]')) return;
      var l = document.createElement('link');
      l.rel = 'stylesheet'; l.href = CONFIG.fontsHref; l.setAttribute('data-btd-font','1');
      document.head.appendChild(l);
    } catch(e){}
  }
  function loadEmailJS(){
    return new Promise(function(res){
      if (window.emailjs) { try{ window.emailjs.init(CONFIG.emailjs.publicKey); }catch(e){} return res(true); }
      var s = document.createElement('script');
      s.src = CONFIG.emailjsSrc; s.async = true;
      s.onload = function(){ try{ window.emailjs.init(CONFIG.emailjs.publicKey); }catch(e){} res(true); };
      s.onerror = function(){ res(false); };
      document.head.appendChild(s);
    });
  }
  function loadCalendly(){
    return new Promise(function(res){
      if (window.Calendly) return res(true);
      if (!document.querySelector('link[data-btd-calendly-css]')) {
        var l = document.createElement('link');
        l.rel = 'stylesheet';
        l.href = CONFIG.calendlyCss;
        l.setAttribute('data-btd-calendly-css','1');
        document.head.appendChild(l);
      }
      var existing = document.querySelector('script[data-btd-calendly-js]');
      if (existing) {
        var t = 0;
        var iv = setInterval(function(){
          t += 100;
          if (window.Calendly) { clearInterval(iv); res(true); }
          else if (t >= 6000) { clearInterval(iv); res(false); }
        }, 100);
        return;
      }
      var s = document.createElement('script');
      s.src = CONFIG.calendlyJs;
      s.async = true;
      s.setAttribute('data-btd-calendly-js','1');
      s.onload  = function(){ res(true); };
      s.onerror = function(){ res(false); };
      document.head.appendChild(s);
    });
  }
  function track(name, params){
    try { if (typeof window.gtag==='function') window.gtag('event', name, params||{}); } catch(e){}
    try {
      if (typeof window.fbq==='function') {
        if (name==='simulator_complete') window.fbq('track','Lead');
        if (name==='lead_submit') window.fbq('track','CompleteRegistration');
      }
    } catch(e){}
  }

  /* ---------- STYLES (Shadow DOM) ---------- */
  var CSS = "\
  :host{ all:initial; display:block; font-family:'Montserrat',system-ui,sans-serif; color:#2a3340; }\
  *{ margin:0; padding:0; box-sizing:border-box; }\
  .wrap{ max-width:720px; margin:0 auto; }\
  .card{ background:#fff; border-radius:14px; box-shadow:0 12px 40px rgba(0,51,102,.16); overflow:hidden; }\
  .intro{ background:linear-gradient(150deg,#003366 0%,#1a4d80 100%); color:#fff; padding:2.6rem 2rem 2.8rem; text-align:center; position:relative; overflow:hidden; }\
  .intro::after{ content:''; position:absolute; top:-60px; right:-60px; width:220px; height:220px; background:radial-gradient(circle,rgba(255,215,0,.18),transparent 70%); pointer-events:none; }\
  .intro h1{ font-weight:800; font-size:clamp(1.35rem,3.6vw,1.85rem); line-height:1.25; margin-bottom:.5rem; position:relative; }\
  .line{ width:64px; height:4px; background:#FFD700; border-radius:3px; margin:1.1rem auto 1.3rem; }\
  .intro p{ font-weight:500; font-size:.98rem; opacity:.92; max-width:480px; margin:0 auto 1.6rem; position:relative; }\
  .badges{ display:flex; justify-content:center; gap:1.6rem; flex-wrap:wrap; margin-bottom:1.8rem; position:relative; }\
  .badge{ font-size:.78rem; font-weight:600; opacity:.9; display:flex; align-items:center; gap:.4rem; }\
  .badge svg{ width:15px; height:15px; flex-shrink:0; }\
  .start{ background:#FFD700; color:#003366; font-family:inherit; font-weight:800; font-size:1rem; padding:.95rem 2rem; border:none; border-radius:50px; cursor:pointer; transition:.25s; box-shadow:0 6px 20px rgba(255,215,0,.4); position:relative; display:inline-flex; align-items:center; gap:.55rem; }\
  .start:hover{ background:#e6c200; transform:translateY(-2px); box-shadow:0 8px 26px rgba(255,215,0,.5); }\
  .choices{ display:grid; grid-template-columns:1fr 1fr; gap:1.1rem; text-align:left; position:relative; margin-top:1.7rem; }\
  .choice{ background:#fff; border:2px solid #fff; border-radius:14px; padding:1.5rem 1.35rem 1.35rem; display:flex; flex-direction:column; gap:.42rem; font-family:inherit; color:#2a3340; text-align:left; cursor:pointer; transition:.25s; box-shadow:0 6px 18px rgba(0,0,0,.14); }\
  .choice:hover{ border-color:#FFD700; transform:translateY(-3px); box-shadow:0 14px 30px rgba(0,0,0,.22); }\
  .choice:focus-visible{ outline:3px solid #FFD700; outline-offset:3px; }\
  .choice-t{ font-size:1.1rem; font-weight:800; line-height:1.25; color:#003366; }\
  .choice-s{ font-size:.85rem; font-weight:500; line-height:1.5; color:#5a6472; }\
  .choice-go{ margin-top:auto; padding-top:.9rem; display:inline-flex; align-items:center; gap:.4rem; font-size:.87rem; font-weight:800; color:#003366; transition:.25s; }\
  .choice:hover .choice-go{ gap:.7rem; color:#8a6d00; }\
  .intro p.reassure{ margin:1.7rem auto 0; font-size:.8rem; font-weight:600; opacity:.8; position:relative; }\
  .step{ padding:2.2rem 2rem 2.4rem; display:none; }\
  .step.active{ display:block; animation:fade .35s ease; }\
  .prog{ height:6px; background:#e7ebf1; border-radius:4px; overflow:hidden; margin-bottom:.6rem; }\
  .prog-fill{ height:100%; background:linear-gradient(90deg,#FFD700,#e6c200); width:0; border-radius:4px; transition:.25s; }\
  .meta{ display:flex; justify-content:space-between; font-size:.74rem; font-weight:700; letter-spacing:.04em; color:#1a4d80; text-transform:uppercase; margin-bottom:1.5rem; }\
  .question{ font-weight:700; font-size:clamp(1.15rem,2.6vw,1.4rem); line-height:1.3; color:#003366; margin-bottom:1rem; }\
  .hint{ font-size:.82rem; color:#66707f; font-weight:500; margin:-.6rem 0 1rem; font-style:italic; }\
  .opts{ display:flex; flex-direction:column; gap:.7rem; }\
  .opts.grid{ display:grid; grid-template-columns:1fr 1fr; }\
  .opt{ background:#f4f6f9; border:2px solid transparent; border-radius:10px; padding:.95rem 1.2rem; font-family:inherit; font-weight:600; font-size:.98rem; color:#2a3340; text-align:left; cursor:pointer; transition:.25s; display:flex; align-items:center; justify-content:space-between; gap:.6rem; }\
  .opts.grid .opt{ font-size:.9rem; padding:.85rem 1rem; }\
  .opt:hover{ background:#e7ebf1; transform:translateX(3px); }\
  .opt.sel{ background:rgba(0,51,102,.05); border-color:#003366; color:#003366; }\
  .ck{ width:20px; height:20px; border-radius:50%; border:2px solid #dde3ec; flex-shrink:0; transition:.25s; position:relative; }\
  .opt.multi .ck{ border-radius:5px; }\
  .opt.sel .ck{ border-color:#003366; background:#003366; }\
  .opt.sel .ck::after{ content:''; position:absolute; left:5px; top:2px; width:5px; height:9px; border:solid #fff; border-width:0 2px 2px 0; transform:rotate(45deg); }\
  .sub{ margin-top:1rem; padding:1.1rem; background:rgba(0,51,102,.035); border-radius:10px; display:none; }\
  .sub.active{ display:block; animation:fade .3s ease; }\
  .sub .question{ font-size:.98rem; margin-bottom:.9rem; }\
  .field{ margin-bottom:1.2rem; }\
  .label{ display:block; font-weight:600; font-size:.85rem; color:#003366; margin-bottom:.4rem; }\
  .input{ width:100%; padding:.85rem 1rem; border:2px solid #dde3ec; border-radius:10px; font-family:inherit; font-size:.97rem; color:#2a3340; background:#fff; transition:.25s; }\
  .input:focus{ outline:none; border-color:#003366; box-shadow:0 0 0 3px rgba(0,51,102,.1); }\
  .row{ display:flex; gap:1rem; }\
  .row .field{ flex:1; }\
  .hp{ position:absolute !important; left:-9999px !important; width:1px; height:1px; overflow:hidden; opacity:0; }\
  .consent{ font-size:.76rem; color:#66707f; margin-top:.8rem; line-height:1.5; }\
  .err{ color:#d32f2f; font-size:.8rem; margin-top:.35rem; display:none; }\
  .err.show{ display:block; }\
  .net{ background:#fdecec; color:#d32f2f; border-left:3px solid #d32f2f; padding:.9rem 1.1rem; border-radius:6px; font-size:.88rem; margin:1rem 0; display:none; }\
  .net.show{ display:block; }\
  .nav{ display:flex; justify-content:space-between; gap:.8rem; margin-top:1.8rem; }\
  .btn{ padding:.85rem 1.5rem; border-radius:50px; font-family:inherit; font-weight:700; font-size:.95rem; cursor:pointer; border:none; transition:.25s; display:inline-flex; align-items:center; gap:.4rem; }\
  .prev{ background:#f4f6f9; color:#66707f; }\
  .prev:hover:not(:disabled){ background:#e7ebf1; }\
  .prev:disabled{ opacity:.4; cursor:not-allowed; }\
  .next{ background:#003366; color:#fff; box-shadow:0 4px 14px rgba(0,51,102,.25); }\
  .next:hover:not(:disabled){ background:#00254d; transform:translateY(-1px); }\
  .next:disabled{ background:#c3cad4; cursor:not-allowed; box-shadow:none; }\
  .loading{ display:none; text-align:center; padding:3rem 2rem; }\
  .spinner{ width:44px; height:44px; border:4px solid rgba(0,51,102,.12); border-top-color:#003366; border-radius:50%; margin:0 auto 1.2rem; animation:spin .9s linear infinite; }\
  .loading p{ font-weight:600; color:#66707f; }\
  .results{ display:none; padding:2.4rem 2rem; text-align:center; }\
  .pill{ display:inline-block; background:#FFD700; color:#003366; font-weight:700; font-size:.82rem; padding:.4rem 1rem; border-radius:50px; margin-bottom:.9rem; }\
  .r-title{ font-weight:800; font-size:clamp(1.4rem,3.4vw,1.75rem); color:#003366; margin-bottom:.7rem; }\
  .r-sub{ font-weight:500; color:#66707f; margin-bottom:1.6rem; font-size:.95rem; }\
  .aids{ text-align:left; margin:1.4rem 0; }\
  .aid{ background:#f4f6f9; border-left:4px solid #FFD700; border-radius:10px; padding:1rem 1.1rem; margin-bottom:.7rem; transition:.25s; }\
  .aid:hover{ transform:translateX(3px); }\
  .aid-name{ font-weight:700; color:#003366; font-size:1rem; }\
  .aid-desc{ font-size:.86rem; color:#66707f; margin-top:.25rem; }\
  .blurred{ margin-top:1.2rem; padding:1rem; background:#f4f6f9; border-radius:10px; position:relative; overflow:hidden; }\
  .blur-ov{ position:absolute; inset:0; backdrop-filter:blur(5px); -webkit-backdrop-filter:blur(5px); background:rgba(255,255,255,.55); display:flex; align-items:center; justify-content:center; }\
  .blur-msg{ background:#003366; color:#fff; padding:.85rem 1.2rem; border-radius:8px; font-weight:600; font-size:.85rem; max-width:85%; text-align:center; line-height:1.4; }\
  .gauge{ text-align:left; background:#f4f6f9; border-radius:12px; padding:1.15rem 1.2rem; margin-bottom:1.4rem; }\
  .gauge-top{ display:flex; align-items:baseline; justify-content:space-between; gap:.8rem; margin-bottom:.6rem; }\
  .gauge-lbl{ font-weight:700; font-size:.88rem; color:#003366; }\
  .gauge-val{ font-weight:800; font-size:1.25rem; color:#003366; }\
  .gauge-bar{ height:9px; background:#e0e5ec; border-radius:5px; overflow:hidden; }\
  .gauge-fill{ height:100%; width:0; border-radius:5px; transition:width .8s ease; }\
  .gauge-fill.low{ background:linear-gradient(90deg,#e57373,#d32f2f); }\
  .gauge-fill.mid{ background:linear-gradient(90deg,#ffb74d,#f57c00); }\
  .gauge-fill.good{ background:linear-gradient(90deg,#FFD700,#e6c200); }\
  .gauge-fill.top{ background:linear-gradient(90deg,#66bb6a,#2e7d32); }\
  .gauge-tips{ list-style:none; margin-top:.9rem; }\
  .gauge-tips li{ font-size:.83rem; color:#4a5666; line-height:1.5; display:flex; gap:.5rem; margin-top:.5rem; }\
  .gauge-tips li::before{ content:''; width:6px; height:6px; border-radius:50%; background:#003366; flex-shrink:0; margin-top:.45rem; }\
  .inv{ background:#fff; border:1.5px solid #e2e7ee; border-left:4px solid #003366; border-radius:10px; padding:1rem 1.1rem; margin-bottom:.7rem; transition:.25s; }\
  .inv:hover{ transform:translateX(3px); box-shadow:0 6px 18px rgba(0,51,102,.08); }\
  .inv-top{ display:flex; align-items:center; justify-content:space-between; gap:.8rem; }\
  .inv-name{ font-weight:700; color:#003366; font-size:1rem; }\
  .inv-score{ background:rgba(0,51,102,.07); color:#003366; font-weight:800; font-size:.78rem; padding:.25rem .6rem; border-radius:50px; white-space:nowrap; }\
  .inv-tags{ display:flex; flex-wrap:wrap; gap:.35rem; margin:.55rem 0 .45rem; }\
  .tag{ background:#f4f6f9; color:#4a5666; font-size:.72rem; font-weight:700; padding:.22rem .6rem; border-radius:50px; }\
  .tag.gold{ background:rgba(255,215,0,.22); color:#8a6d00; }\
  .inv-desc{ font-size:.85rem; color:#66707f; line-height:1.5; }\
  .lock{ background:#f4f6f9; border-left:4px solid #c3cad4; border-radius:10px; padding:1rem 1.1rem; margin-bottom:.7rem; }\
  .lock-name{ display:flex; align-items:center; gap:.5rem; font-weight:700; color:#8b95a4; font-size:1rem; }\
  .lock-name svg{ width:15px; height:15px; flex-shrink:0; }\
  .lock-bars span{ display:block; height:9px; background:#e0e5ec; border-radius:5px; margin-top:.55rem; }\
  .lock-bars span:nth-child(1){ width:72%; }\
  .lock-bars span:nth-child(2){ width:48%; }\
  .unlock{ margin-top:1rem; background:linear-gradient(135deg,#003366,#1a4d80); color:#fff; border-radius:12px; padding:1.2rem 1.3rem; text-align:left; }\
  .unlock h3{ font-size:.95rem; font-weight:800; margin-bottom:.4rem; }\
  .unlock p{ font-size:.86rem; line-height:1.5; opacity:.95; }\
  .unlock strong{ color:#FFD700; }\
  .gift{ margin-top:1.4rem; padding:1.3rem 1.35rem; background:#fffdf2; border:2px solid #FFD700; border-radius:12px; text-align:left; }\
  .gift-head{ display:flex; align-items:center; gap:.55rem; font-weight:800; font-size:.98rem; color:#003366; margin-bottom:.5rem; }\
  .gift-head svg{ width:19px; height:19px; flex-shrink:0; color:#c9a400; }\
  .gift p{ font-size:.87rem; color:#5a6472; line-height:1.55; margin-bottom:.5rem; }\
  .gift-secteur{ font-size:.82rem; color:#003366; font-weight:700; margin-bottom:1rem; }\
  .gift-btn{ display:inline-flex; align-items:center; gap:.5rem; background:#FFD700; color:#003366; padding:.8rem 1.5rem; border-radius:50px; font-weight:800; font-size:.92rem; text-decoration:none; transition:.25s; }\
  .gift-btn:hover{ background:#e6c200; transform:translateY(-2px); }\
  .post{ margin-top:1.8rem; padding:1.2rem 1.3rem; background:linear-gradient(135deg,#003366,#1a4d80); color:#fff; border-radius:12px; text-align:left; box-shadow:0 8px 24px rgba(0,51,102,.18); }\
  .post-head{ display:flex; align-items:center; gap:.6rem; font-weight:800; font-size:.95rem; margin-bottom:.5rem; }\
  .post-head svg{ width:18px; height:18px; flex-shrink:0; color:#FFD700; }\
  .post p{ font-size:.88rem; line-height:1.5; opacity:.95; }\
  .post p + p{ margin-top:.6rem; }\
  .post strong{ color:#FFD700; font-weight:700; }\
  .cta-text{ font-size:.95rem; color:#66707f; margin:1.6rem 0 1rem; }\
  .calendly{ display:inline-flex; align-items:center; gap:.5rem; background:#003366; color:#fff; padding:.95rem 2rem; border-radius:50px; font-weight:700; font-size:.97rem; transition:.25s; box-shadow:0 6px 18px rgba(0,51,102,.25); cursor:pointer; border:none; font-family:inherit; }\
  .calendly:hover{ background:#00254d; transform:translateY(-2px); }\
  .calendly:disabled{ opacity:.7; cursor:wait; }\
  .cross{ margin-top:1.8rem; padding-top:1.5rem; border-top:1px solid #e7ebf1; }\
  .cross p{ font-size:.88rem; color:#66707f; margin-bottom:.8rem; line-height:1.5; }\
  .cross-btn{ background:#f4f6f9; color:#003366; border:2px solid #003366; font-family:inherit; font-weight:700; font-size:.9rem; padding:.75rem 1.5rem; border-radius:50px; cursor:pointer; transition:.25s; display:inline-flex; align-items:center; gap:.45rem; }\
  .cross-btn:hover{ background:#003366; color:#fff; }\
  .sr{ position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0,0,0,0); }\
  @keyframes spin{ to{ transform:rotate(360deg); } }\
  @keyframes fade{ from{ opacity:0; transform:translateY(8px); } to{ opacity:1; transform:translateY(0); } }\
  @media (max-width:560px){\
    .intro,.step,.results{ padding-left:1.1rem; padding-right:1.1rem; }\
    .step{ padding-top:1.5rem; padding-bottom:1.6rem; }\
    .results{ padding-top:1.7rem; padding-bottom:1.8rem; }\
    .row{ flex-direction:column; gap:0; }\
    .nav{ flex-direction:column-reverse; margin-top:1.2rem; }\
    .nav .btn{ width:100%; justify-content:center; }\
    .badges{ gap:1rem; }\
    .choices{ grid-template-columns:1fr; }\
    .question{ font-size:1.05rem; margin-bottom:.8rem; }\
    .meta{ margin-bottom:1rem; }\
    /* La grille reste à deux colonnes sur mobile : la passer à une colonne\
       doublait la hauteur des questions à 19 options et imposait un défilement\
       interminable pour choisir un secteur. */\
    .opts{ gap:.5rem; }\
    .opt{ padding:.8rem .9rem; font-size:.92rem; }\
    .opts.grid .opt{ padding:.7rem .75rem; font-size:.82rem; line-height:1.25; align-items:flex-start; }\
    .opts.grid .ck{ width:17px; height:17px; margin-top:.1rem; }\
    .opt:hover{ transform:none; }\
    .aid,.inv,.lock{ padding:.85rem .9rem; }\
    .post,.unlock{ padding:1rem 1.05rem; }\
  }\
  ";

  var ARROW = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
  var ICONS = {
    clock:  '<svg viewBox="0 0 24 24" fill="none" stroke="#FFD700" stroke-width="2.5"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    check:  '<svg viewBox="0 0 24 24" fill="none" stroke="#FFD700" stroke-width="2.5"><path d="M20 6L9 17l-5-5"/></svg>',
    shield: '<svg viewBox="0 0 24 24" fill="none" stroke="#FFD700" stroke-width="2.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
    gov:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 21h18M4 21V10l8-6 8 6v11M9 21v-6h6v6"/></svg>',
    rocket: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 15l-2 6 6-2M14.5 3.5c3 0 6 3 6 6 0 4-5.5 9-8 10.5L8 16 4 12C5.5 9.5 10.5 3.5 14.5 3.5z"/><circle cx="14.5" cy="9.5" r="1.6"/></svg>',
    padlock:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="4" y="10" width="16" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>',
    gift:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="3" y="8" width="18" height="13" rx="2"/><path d="M3 12h18M12 8v13"/><path d="M12 8S9.5 3.5 7 5s1 3 5 3zM12 8s2.5-4.5 5-3-1 3-5 3z"/></svg>',
    mail:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M4 6h16v12H4z"/><path d="M4 6l8 7 8-7"/></svg>'
  };
  function badgeHtml(b){ return '<span class="badge">' + (ICONS[b[0]]||'') + esc(b[1]) + '</span>'; }

  /* ============================================================
     CUSTOM ELEMENT
     ============================================================ */
  function initState(self) {
    self.state = {
      track: null, current: 1, answers: {}, contact: {}, completed: [],
      submitted: false, lastSubmit: 0,
      sessionId: 'btd_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 9),
      utm: { source:'direct', medium:'none', campaign:'none', referrer:'' }
    };
    self.investors = INVESTORS;
  }

  var BTDSimulator = function () {
    var self = Reflect.construct(HTMLElement, [], BTDSimulator);
    initState(self);
    return self;
  };
  BTDSimulator.prototype = Object.create(HTMLElement.prototype);
  BTDSimulator.prototype.constructor = BTDSimulator;

  BTDSimulator.prototype.connectedCallback = function () {
    if (this._mounted) return;
    this._mounted = true;
    ensureFont();
    loadEmailJS();
    loadCalendly();
    this.root = this.attachShadow({ mode: 'open' });
    this.state.utm = this._getUTM();
    this.mode = this._getMode();
    this._loadInvestors();
    this._render();
    this._bind();
    this._load();

    // Mode mono-parcours : on entre directement dans le bon tunnel
    if (this.mode !== 'both') this._setTrack(this.mode, false);
  };

  /* ----- Mode : attribut > paramètre d'URL > défaut ----- */
  BTDSimulator.prototype._getMode = function () {
    if (this._forcedMode) return this._forcedMode;   // balise dédiée (voir plus bas)
    var m = (this.getAttribute('mode') || '').toLowerCase();
    if (m !== 'public' && m !== 'prive') {
      try {
        var p = new URLSearchParams(hostSearch()).get('parcours');
        if (p === 'prive' || p === 'public') m = p;
      } catch (e) {}
    }
    return (m === 'public' || m === 'prive') ? m : 'both';
  };

  /* ----- Base investisseurs distante (optionnelle) ----- */
  BTDSimulator.prototype._loadInvestors = function () {
    var self = this;
    var url = this.getAttribute('data-investors');
    if (!url) return;
    fetch(url, { credentials:'omit' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (json) {
        var list = Array.isArray(json) ? json : (json && Array.isArray(json.investors) ? json.investors : null);
        if (list && list.length) self.investors = list;
      })
      .catch(function () { /* on garde la base embarquée */ });
  };

  BTDSimulator.prototype._getUTM = function () {
    try {
      var p = new URLSearchParams(hostSearch());
      return { source:p.get('utm_source')||'direct', medium:p.get('utm_medium')||'none', campaign:p.get('utm_campaign')||'none', referrer:document.referrer||'direct' };
    } catch(e){ return { source:'direct', medium:'none', campaign:'none', referrer:'' }; }
  };

  BTDSimulator.prototype.$ = function (id) { return this.root.getElementById(id); };
  BTDSimulator.prototype._qs = function () {
    return this.state.track ? TRACKS[this.state.track].questions : [];
  };

  /* ---------- RENDU ---------- */
  BTDSimulator.prototype._render = function () {
    var style = document.createElement('style');
    style.textContent = CSS;
    this.root.appendChild(style);

    var wrap = document.createElement('div');
    wrap.className = 'wrap';
    wrap.innerHTML =
      '<div class="card">' +
        '<div class="sr" id="live" aria-live="polite"></div>' +
        '<section class="intro" id="intro">' + this._introHtml() + '</section>' +
        '<div id="steps"></div>' +
        '<div class="loading" id="loading" aria-live="polite"><div class="spinner"></div><p id="loading-txt">Analyse de ton éligibilité en cours…</p></div>' +

        /* ----- Résultats parcours PUBLIC ----- */
        '<section class="results" id="results" aria-live="polite">' +
          '<span class="pill" id="pill"></span>' +
          '<div class="r-title">Ton analyse d\'éligibilité</div>' +
          '<div class="r-sub">Selon tes réponses, ton projet pourrait être éligible aux dispositifs suivants :</div>' +
          '<div class="aids" id="aids"></div>' +
          '<div class="blurred" id="blurred" style="display:none"><div id="blurred-content"></div><div class="blur-ov"><div class="blur-msg">D\'autres aides semblent éligibles pour ton projet&nbsp;! Prends RDV pour une analyse complète.</div></div></div>' +
          '<div class="post">' +
            '<div class="post-head" id="post-head">' + ICONS.mail + 'Vérifie tes spams</div>' +
            '<p id="post-mail">Ton analyse vient d\'être envoyée par email. Si tu ne la reçois pas dans quelques minutes, pense à consulter ton dossier <strong>« courriers indésirables »</strong> ou <strong>« promotions »</strong>.</p>' +
            '<p>Pour la <strong>liste complète</strong> et un plan d\'action, prends rendez-vous avec un expert&nbsp;:</p>' +
          '</div>' +
          '<p class="cta-text">Réserve un créneau gratuit avec un expert :</p>' +
          '<button class="calendly" id="calendly" type="button">Prendre rendez-vous ' + ARROW + '</button>' +
          '<div class="cross" id="cross-public">' +
            '<p>Une levée de fonds est aussi dans tes projets&nbsp;? Découvre quels investisseurs peuvent financer ton entreprise.</p>' +
            '<button class="cross-btn" type="button" data-goto="prive">Trouver mes investisseurs ' + ARROW + '</button>' +
          '</div>' +
        '</section>' +

        /* ----- Résultats parcours PRIVÉ ----- */
        '<section class="results" id="results-prive" aria-live="polite">' +
          '<span class="pill" id="pill-prive"></span>' +
          '<div class="r-title">Ton profil de levée de fonds</div>' +
          '<div class="r-sub">Voici les investisseurs dont la thèse correspond le mieux à ton projet :</div>' +
          '<div class="gauge" id="gauge">' +
            '<div class="gauge-top"><span class="gauge-lbl" id="gauge-lbl"></span><span class="gauge-val" id="gauge-val"></span></div>' +
            '<div class="gauge-bar"><div class="gauge-fill" id="gauge-fill"></div></div>' +
            '<ul class="gauge-tips" id="gauge-tips"></ul>' +
          '</div>' +
          '<div class="aids" id="investors"></div>' +
          '<div class="unlock" id="unlock" style="display:none">' +
            '<h3 id="unlock-title"></h3>' +
            '<p>Le détail de ces investisseurs (nom, contact, thèse, tickets et process d\'entrée) te sera présenté lors de ton <strong>rendez-vous gratuit</strong> avec un expert BTD Consulting.</p>' +
          '</div>' +
          '<div class="gift" id="gift" style="display:none">' +
            '<div class="gift-head">' + ICONS.gift + 'Ta base de données financement est offerte</div>' +
            '<p>Plus de 100 dispositifs publics et 50 solutions de levée de fonds — subventions, concours, prêts d\'honneur, fonds d\'investissement et business angels — centralisés et classés par secteur.</p>' +
            '<div class="gift-secteur" id="gift-secteur"></div>' +
            '<a class="gift-btn" id="gift-link" target="_blank" rel="noopener noreferrer">Ouvrir la base ' + ARROW + '</a>' +
          '</div>' +
          '<div class="post">' +
            '<div class="post-head" id="post-head-prive">' + ICONS.mail + 'Vérifie tes spams</div>' +
            '<p id="post-mail-prive">Ta short-list vient d\'être envoyée par email. Si tu ne la reçois pas dans quelques minutes, pense à consulter ton dossier <strong>« courriers indésirables »</strong> ou <strong>« promotions »</strong>.</p>' +
            '<p>Pour affiner ce ciblage et t\'ouvrir les <strong>bonnes portes</strong>, prends rendez-vous avec un expert&nbsp;:</p>' +
          '</div>' +
          '<p class="cta-text">Réserve un créneau gratuit avec un expert :</p>' +
          '<button class="calendly" id="calendly-prive" type="button">Prendre rendez-vous ' + ARROW + '</button>' +
          '<div class="cross" id="cross-prive">' +
            '<p>Avant de diluer ton capital, vérifie ce que tu peux obtenir en financement public&nbsp;: subventions, avances remboursables et crédits d\'impôt réduisent le montant à lever.</p>' +
            '<button class="cross-btn" type="button" data-goto="public">Voir mes aides publiques ' + ARROW + '</button>' +
          '</div>' +
        '</section>' +
      '</div>';
    this.root.appendChild(wrap);
  };

  /* ----- Intro : écran de choix ou hero mono-parcours ----- */
  BTDSimulator.prototype._introHtml = function () {
    if (this.mode === 'both') {
      return '' +
        '<h1>Découvre les aides et les financeurs privés adaptés à ton projet</h1>' +
        '<div class="line"></div>' +
        '<p>Choisis ton parcours, réponds à quelques questions&nbsp;: tu reçois ton résultat par email.</p>' +
        '<div class="choices">' +
          '<button class="choice" type="button" data-track="public">' +
            '<span class="choice-t">Financement public</span>' +
            '<span class="choice-s">Subventions, aides, concours, prêts à taux zéro et crédits d\'impôt.</span>' +
            '<span class="choice-go">Commencer ' + ARROW + '</span>' +
          '</button>' +
          '<button class="choice" type="button" data-track="prive">' +
            '<span class="choice-t">Financement privé</span>' +
            '<span class="choice-s">Levée de fonds&nbsp;: fonds d\'investissement, business angels, plateformes.</span>' +
            '<span class="choice-go">Commencer ' + ARROW + '</span>' +
          '</button>' +
        '</div>' +
        '<p class="reassure">2 minutes&nbsp;· Gratuit&nbsp;· Résultat envoyé par email</p>';
    }
    var t = TRACKS[this.mode];
    return '' +
      '<h1>' + esc(t.title) + '</h1>' +
      '<div class="line"></div>' +
      '<p>' + esc(t.pitch) + '</p>' +
      '<div class="badges">' + t.badges.map(badgeHtml).join('') + '</div>' +
      '<button class="start" id="start" type="button" data-track="' + t.id + '">' + esc(t.cta) + ' ' + ARROW + '</button>';
  };

  /* ----- Construction des étapes du parcours actif ----- */
  BTDSimulator.prototype._build = function () {
    var box = this.$('steps');
    box.innerHTML = '';
    var QS = this._qs();
    var total = QS.length + 1;

    QS.forEach(function (q, idx) {
      var n = idx + 1;
      var pct = Math.round((n / total) * 100);
      var card = document.createElement('div');
      card.className = 'step';
      card.setAttribute('data-step', n);

      var mainHint = q.multi ? '<div class="hint">Coche toutes les options qui correspondent à ton projet.</div>' : '';
      var mainCls  = 'opt' + (q.multi ? ' multi' : '');
      var optsCls  = 'opts' + (q.grid ? ' grid' : '');

      var sub = '';
      if (q.sub) {
        var subCls  = 'opt' + (q.sub.multi ? ' multi' : '');
        var subHint = q.sub.multi ? '<div class="hint">Coche toutes les options qui correspondent.</div>' : '';
        sub = '<div class="sub" id="sub-' + n + '">' +
              '<div class="question">' + esc(q.sub.q) + '</div>' +
              subHint +
              '<div class="opts">' +
              q.sub.o.map(function (o) {
                return '<button type="button" class="' + subCls + '" data-sub="' + esc(q.sub.key) + '" data-val="' + esc(o[0]) + '"><span>' + esc(o[1]) + '</span><span class="ck"></span></button>';
              }).join('') +
              '</div></div>';
      }

      card.innerHTML =
        '<div class="prog"><div class="prog-fill" style="width:' + pct + '%"></div></div>' +
        '<div class="meta"><span>Question ' + n + ' / ' + total + '</span><span>' + pct + '%</span></div>' +
        '<div class="question">' + esc(q.q) + '</div>' +
        mainHint +
        '<div class="' + optsCls + '">' +
          q.o.map(function (o) { return '<button type="button" class="' + mainCls + '" data-q="' + n + '" data-val="' + esc(o[0]) + '"><span>' + esc(o[1]) + '</span><span class="ck"></span></button>'; }).join('') +
        '</div>' + sub +
        '<div class="nav"><button type="button" class="btn prev"' + (n === 1 ? ' disabled' : '') + '>Précédent</button>' +
        '<button type="button" class="btn next" disabled>Suivant ' + ARROW + '</button></div>';
      box.appendChild(card);
    });

    var isPrive = this.state.track === 'prive';
    var c = document.createElement('div');
    c.className = 'step';
    c.setAttribute('data-step', total);
    c.innerHTML =
      '<div class="prog"><div class="prog-fill" style="width:100%"></div></div>' +
      '<div class="meta"><span>Dernière étape</span><span>100%</span></div>' +
      '<div class="question">' + (isPrive ? 'Tes coordonnées pour recevoir ta short-list' : 'Tes coordonnées pour recevoir ton analyse') + '</div>' +
      '<div class="row">' +
        '<div class="field"><label class="label" for="fn">Prénom</label><input class="input" id="fn" type="text" maxlength="50" autocomplete="given-name" placeholder="Ton prénom"></div>' +
        '<div class="field"><label class="label" for="ln">Nom</label><input class="input" id="ln" type="text" maxlength="50" autocomplete="family-name" placeholder="Ton nom"></div>' +
      '</div>' +
      (isPrive ? '<div class="field"><label class="label" for="co">Nom de ton entreprise ou de ton projet</label><input class="input" id="co" type="text" maxlength="80" autocomplete="organization" placeholder="Ex : Ma Startup SAS"></div>' : '') +
      '<div class="field"><label class="label" for="ph">Téléphone</label><input class="input" id="ph" type="tel" maxlength="20" autocomplete="tel" placeholder="06 12 34 56 78"><div class="err" id="ph-err">Numéro de téléphone invalide</div></div>' +
      '<div class="field"><label class="label" for="em">Email</label><input class="input" id="em" type="email" maxlength="254" autocomplete="email" placeholder="ton@email.com"><div class="err" id="em-err">Adresse email invalide</div></div>' +
      '<div class="hp" aria-hidden="true"><label for="hp">Ne pas remplir</label><input type="text" id="hp" tabindex="-1" autocomplete="off"></div>' +
      '<div class="net" id="net">Une erreur est survenue. Merci de réessayer dans un instant.</div>' +
      '<p class="consent">En soumettant ce formulaire, tu acceptes que BTD Consulting te recontacte au sujet de ton projet et conserve tes données conformément à notre politique de confidentialité.</p>' +
      '<div class="nav"><button type="button" class="btn prev">Précédent</button>' +
      '<button type="button" class="btn next" id="submit" disabled>' + (isPrive ? 'Voir mes investisseurs ' : 'Obtenir mes résultats ') + ARROW + '</button></div>';
    box.appendChild(c);

    this._prefillContact();
  };

  BTDSimulator.prototype._prefillContact = function () {
    var c = this.state.contact || {};
    var set = function (el, v) { if (el && v) el.value = v; };
    set(this.$('fn'), c.firstname);
    set(this.$('ln'), c.lastname);
    set(this.$('ph'), c.phone);
    set(this.$('em'), c.email);
    set(this.$('co'), c.company);
    if (c.email) this._validateForm();
  };

  /* ---------- ÉVÉNEMENTS ---------- */
  BTDSimulator.prototype._bind = function () {
    var self = this;

    // Choix du parcours (écran de choix ou bouton unique)
    this.$('intro').addEventListener('click', function (e) {
      var b = e.target.closest('[data-track]');
      if (b) self._setTrack(b.dataset.track, true);
    });

    this.$('steps').addEventListener('click', function (e) {
      var opt = e.target.closest('.opt');
      if (opt) return self._pick(opt);
      var prev = e.target.closest('.prev');
      if (prev && !prev.disabled) return self._go(-1);
      var next = e.target.closest('.next');
      if (next && !next.disabled) { return next.id === 'submit' ? self._submit() : self._go(1); }
    });

    this.$('steps').addEventListener('input', function (e) {
      if (e.target.matches('#fn,#ln,#ph,#em,#co')) self._validateForm();
    });

    // Calendly : ouverture en popup sur le site (pas de redirection)
    var openCalendly = function (e) {
      e.preventDefault();
      var btn = e.currentTarget;
      var url = (self.state.track === 'prive' && CONFIG.calendlyPrive) ? CONFIG.calendlyPrive : CONFIG.calendly;
      track('calendly_click', { parcours: self.state.track });
      btn.disabled = true;
      loadCalendly().then(function (ok) {
        btn.disabled = false;
        if (ok && window.Calendly && window.Calendly.initPopupWidget) {
          window.Calendly.initPopupWidget({ url: url });
        } else {
          try {
            var w = window.open(url, '_blank', 'noopener,noreferrer');
            if (!w) window.location.href = url;
          } catch (err) { window.location.href = url; }
        }
      });
    };
    this.$('calendly').addEventListener('click', openCalendly);
    this.$('calendly-prive').addEventListener('click', openCalendly);

    // Passerelle entre les deux parcours
    var cross = function (e) {
      var b = e.target.closest('[data-goto]');
      if (!b) return;
      track('cross_sell_click', { from: self.state.track, to: b.dataset.goto });
      self._setTrack(b.dataset.goto, true);
    };
    this.$('cross-public').addEventListener('click', cross);
    this.$('cross-prive').addEventListener('click', cross);
  };

  /* ----- Bascule de parcours ----- */
  BTDSimulator.prototype._setTrack = function (id, start) {
    if (!TRACKS[id]) return;
    var switching = this.state.track && this.state.track !== id;
    this.state.track = id;
    if (switching) { this.state.answers = {}; this.state.submitted = false; this.state.lastSubmit = 0; }

    this.$('results').style.display = 'none';
    this.$('results-prive').style.display = 'none';
    this.$('loading').style.display = 'none';
    this.$('steps').style.display = 'block';
    this.$('loading-txt').textContent = id === 'prive'
      ? 'Analyse de ton projet et matching investisseurs en cours…'
      : 'Analyse de ton éligibilité en cours…';

    this._build();
    if (start) {
      this.$('intro').style.display = 'none';
      this._show(1);
      track('simulator_start', { parcours:id, utm_source:this.state.utm.source, utm_medium:this.state.utm.medium, utm_campaign:this.state.utm.campaign });
    }
    this._save();
  };

  /* ----- SÉLECTION D'UNE OPTION (single + multi, main + sub) ----- */
  BTDSimulator.prototype._pick = function (btn) {
    var card = btn.closest('.step');
    var key  = btn.dataset.sub;
    var val  = btn.dataset.val;
    var isMulti = btn.classList.contains('multi');

    // -------- MULTI-SELECT (main OU sub) : toggle individuel --------
    if (isMulti) {
      var storeKey = key || parseInt(btn.dataset.q, 10);
      var current = this.state.answers[storeKey];
      if (!Array.isArray(current)) current = current ? [current] : [];
      var idx = current.indexOf(val);
      if (idx > -1) { current.splice(idx, 1); btn.classList.remove('sel'); }
      else { current.push(val); btn.classList.add('sel'); }
      this.state.answers[storeKey] = current;

      // Options exclusives ("Pas de préférence", "Rien de tout ça"…)
      var solo = ['aucune','rien','nsp'];
      if (solo.indexOf(val) > -1 && idx === -1) {
        this.state.answers[storeKey] = [val];
        card.querySelectorAll('.opt[data-q],.opt[data-sub]').forEach(function (b) {
          if (b !== btn && b.dataset.val !== undefined && solo.indexOf(b.dataset.val) === -1) b.classList.remove('sel');
        });
      } else if (idx === -1) {
        var self0 = this;
        solo.forEach(function (s) {
          var p = self0.state.answers[storeKey].indexOf(s);
          if (p > -1) {
            self0.state.answers[storeKey].splice(p, 1);
            var el = card.querySelector('.opt[data-val="' + s + '"]');
            if (el) el.classList.remove('sel');
          }
        });
      }

      this._refreshNext(card);
      if (!key) track('question_answered', { parcours:this.state.track, question: storeKey, answers: arr(this.state.answers[storeKey]).join(',') });
      this._save();
      return;
    }

    // -------- SINGLE-SELECT : sous-option --------
    if (key) {
      var box = btn.parentElement;
      box.querySelectorAll('.opt').forEach(function (b) { b.classList.remove('sel'); });
      btn.classList.add('sel');
      this.state.answers[key] = val;
      this._refreshNext(card);
      this._save();
      return;
    }

    // -------- SINGLE-SELECT : question principale --------
    var parent = btn.parentElement;
    parent.querySelectorAll('.opt').forEach(function (b) { b.classList.remove('sel'); });
    btn.classList.add('sel');

    var n = parseInt(btn.dataset.q, 10);
    this.state.answers[n] = val;

    var q = this._qs()[n - 1];
    if (q && q.sub) {
      var sub = this.$('sub-' + n);
      if (val === q.sub.trigger) {
        sub.classList.add('active');
      } else {
        sub.classList.remove('active');
        delete this.state.answers[q.sub.key];
        sub.querySelectorAll('.opt').forEach(function (b) { b.classList.remove('sel'); });
      }
    }
    this._refreshNext(card);
    track('question_answered', { parcours:this.state.track, question: n, answer: val });
    this._save();
  };

  /* ----- Active/désactive "Suivant" selon l'état de la carte ----- */
  BTDSimulator.prototype._refreshNext = function (card) {
    var n = parseInt(card.getAttribute('data-step'), 10);
    var nextBtn = card.querySelector('.next');
    if (!nextBtn) return;

    var q = this._qs()[n - 1];
    var mainAns = this.state.answers[n];

    if (q && q.multi) {
      var hasMain = Array.isArray(mainAns) ? mainAns.length > 0 : !!mainAns;
      nextBtn.disabled = !hasMain;
      return;
    }

    if (!mainAns) { nextBtn.disabled = true; return; }

    if (q && q.sub && mainAns === q.sub.trigger) {
      var subAns = this.state.answers[q.sub.key];
      var hasSub = Array.isArray(subAns) ? subAns.length > 0 : !!subAns;
      nextBtn.disabled = !hasSub;
    } else {
      nextBtn.disabled = false;
    }
  };

  BTDSimulator.prototype._show = function (n) {
    var cards = this.root.querySelectorAll('.step');
    cards.forEach(function (c) { c.classList.remove('active'); });
    var card = this.root.querySelector('.step[data-step="' + n + '"]');
    if (!card) return;
    card.classList.add('active');
    this.state.current = n;

    var ans = this.state.answers[n];
    var q = this._qs()[n - 1];

    if (ans !== undefined) {
      var arrv = Array.isArray(ans) ? ans : [ans];
      arrv.forEach(function (v) {
        var b = card.querySelector('.opt[data-val="' + v + '"][data-q]');
        if (b) b.classList.add('sel');
      });

      if (q && q.sub && !Array.isArray(ans) && ans === q.sub.trigger) {
        this.$('sub-' + n).classList.add('active');
        var subAns = this.state.answers[q.sub.key];
        var subArr = Array.isArray(subAns) ? subAns : (subAns ? [subAns] : []);
        subArr.forEach(function (v) {
          var sb = card.querySelector('.opt[data-sub][data-val="' + v + '"]');
          if (sb) sb.classList.add('sel');
        });
      }
    }
    this._refreshNext(card);
    this._scrollTop();
    this._say('Question ' + n + ' sur ' + (this._qs().length + 1));
  };

  BTDSimulator.prototype._go = function (dir) {
    var n = this.state.current + dir;
    if (n >= 1 && n <= this._qs().length + 1) { this._show(n); this._save(); }
  };

  BTDSimulator.prototype._validateForm = function () {
    var fn = this.$('fn').value.trim(), ln = this.$('ln').value.trim(),
        ph = this.$('ph').value.trim(), em = this.$('em').value.trim();
    var okPh = validPhone(ph), okEm = validEmail(em);
    this.$('ph-err').classList.toggle('show', ph !== '' && !okPh);
    this.$('em-err').classList.toggle('show', em !== '' && !okEm);
    this.$('submit').disabled = !(validName(fn) && validName(ln) && okPh && okEm);
  };

  /* ---------- SOUMISSION ---------- */
  BTDSimulator.prototype._submit = function () {
    var self = this;
    var now = Date.now();
    if (this.state.submitted || (now - this.state.lastSubmit) < CONFIG.cooldownMs) return;
    if (this.$('hp') && this.$('hp').value !== '') return;
    this.state.lastSubmit = now;

    var a = this.state.answers;
    a.firstname = this.$('fn').value.trim().slice(0, 50);
    a.lastname  = this.$('ln').value.trim().slice(0, 50);
    a.phone     = this.$('ph').value.trim().slice(0, 20);
    a.email     = this.$('em').value.trim().toLowerCase().slice(0, 254);
    a.company   = this.$('co') ? this.$('co').value.trim().slice(0, 80) : '';

    if (!validName(a.firstname) || !validName(a.lastname) || !validPhone(a.phone) || !validEmail(a.email)) return;

    // Mémorisé pour préremplir l'autre parcours
    this.state.contact = { firstname:a.firstname, lastname:a.lastname, phone:a.phone, email:a.email, company:a.company };

    this.$('steps').style.display = 'none';
    this.$('loading').style.display = 'block';
    this._scrollTop();
    this._say('Analyse en cours');

    if (this.state.track === 'prive') this._submitPrive(a);
    else this._submitPublic(a);
  };

  BTDSimulator.prototype._submitPublic = function (a) {
    var self = this;
    var aids = analyzePublic(a);
    track('simulator_complete', { parcours:'public', aids_count: aids.length });

    var payload = this._payloadPublic(a, aids);
    var tasks = [
      this._sendEmail({
        templateId: CONFIG.emailjs.templateId,
        params: {
          email: a.email, firstname: a.firstname, parcours: 'public',
          message: aids.map(function (x) { return '• ' + x + ': ' + (DESC[x] || ''); }).join('\n\n'),
          aids_count: aids.length,
          aids_html: aids.map(function (x) { return emailCard(x, DESC[x] || ''); }).join(''),
          calendly_url: CONFIG.calendly
        }
      }),
      this._sendMake(CONFIG.makeWebhook, payload)
    ];
    this._finish(tasks, function () { self._resultsPublic(aids); }, { aids_count: aids.length });
  };

  BTDSimulator.prototype._submitPrive = function (a) {
    var self = this;
    this._resolveInvestors(a).then(function (matches) {
      var rd = readiness(a);
      track('simulator_complete', { parcours:'prive', investors_count: matches.length, readiness: rd.score });

      var visible = matches.slice(0, CONFIG.maxVisiblePrive);
      var cartesHtml = visible.map(function (x) {
        return emailCard(x.name + ' — ' + x.typeLabel + ' (' + x.ticket + ')', x.desc);
      }).join('');
      var payload = self._payloadPrive(a, matches, rd);

      var tasks = [
        self._sendEmail({
          templateId: CONFIG.emailjs.templateIdPrive || CONFIG.emailjs.templateId,
          params: {
            email: a.email, firstname: a.firstname, parcours: 'levee-de-fonds',
            message: visible.map(function (x) { return '• ' + x.name + ' (' + x.typeLabel + ', ticket ' + x.ticket + ') : ' + x.desc; }).join('\n\n'),
            // Les deux nomenclatures sont envoyées : selon le template privé
            // utilisé, les cartes s'appellent aids_* ou funds_*. EmailJS ignore
            // les variables non référencées, il n'y a donc rien à arbitrer ici.
            aids_count: matches.length,
            funds_count: matches.length,
            investors_count: matches.length,
            readiness_score: rd.score,
            readiness_label: rd.label,
            aids_html: cartesHtml,
            funds_html: cartesHtml,
            calendly_url: CONFIG.calendlyPrive || CONFIG.calendly,
            notion_url: CONFIG.notionDb.url || '',
            notion_titre: CONFIG.notionDb.titre || '',
            secteur_notion: (SECTEUR_NOTION[a[3]] || []).join(', ')
          }
        }),
        self._sendMake(CONFIG.makeWebhookPrive || CONFIG.makeWebhook, payload)
      ];
      self._finish(tasks, function () { self._resultsPrive(matches, rd); }, { investors_count: matches.length });
    });
  };

  /* ----- Matching : endpoint serveur si configuré, sinon local ----- */
  BTDSimulator.prototype._resolveInvestors = function (a) {
    var self = this;
    var ep = this.getAttribute('data-match-endpoint');
    if (!ep) return Promise.resolve(matchInvestors(a, this.investors));

    return fetch(ep, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode:'match', reponses: this._readablePrive(a), raw: a, session_id: this.state.sessionId })
    })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (json) {
        var list = json && (Array.isArray(json) ? json : json.investors);
        if (!list || !list.length) return matchInvestors(a, self.investors);
        return list.map(function (i) {
          return {
            name: i.name || 'Investisseur',
            type: i.type || 'vc',
            typeLabel: TYPE_LABEL[i.type] || 'Investisseur',
            stages: (i.stages || []).map(function (s) { return STAGE_LABEL[s] || s; }),
            ticket: i.ticket || (fmtEur(i.ticketMin || 0) + ' — ' + fmtEur(i.ticketMax || 0)),
            desc: i.desc || '',
            url: i.url || '',
            affinite: Math.max(55, Math.min(98, Math.round(i.affinite || i.score || 75)))
          };
        });
      })
      .catch(function () { return matchInvestors(a, self.investors); });
  };

  /* ----- Envoi + gestion d'échec commun aux deux parcours ----- */
  BTDSimulator.prototype._finish = function (tasks, onOk, extra) {
    var self = this;
    var diag = { parcours: this.state.track, emailError: null, makeError: null };
    var noms = ['EmailJS', 'webhook Make'];
    Promise.all(tasks.map(function (p, i) {
      return p.then(function () { return true; }).catch(function (err) {
        // Un envoi qui échoue en silence est indébogable : on trace la cause.
        diag[i === 0 ? 'emailError' : 'makeError'] = (err && (err.text || err.message)) || String(err);
        try { console.warn('[BTD simulateur] ' + noms[i] + ' a échoué :', err); } catch (e) {}
        return false;
      });
    }))
      .then(function (r) {
        var emailOK = r[0], makeOK = r[1];
        diag.emailOK = emailOK; diag.makeOK = makeOK;
        self.state.emailOK = emailOK;
        // Consultable dans la console : BTD_LAST_SEND
        try { window.BTD_LAST_SEND = diag; } catch (e) {}
        if (!emailOK && !makeOK) {
          self.$('loading').style.display = 'none';
          self.$('steps').style.display = 'block';
          self.$('net').classList.add('show');
          self.state.lastSubmit = 0;
          return;
        }
        var ev = { parcours:self.state.track, email_sent: emailOK, mailchimp_sent: makeOK };
        for (var k in extra) { if (Object.prototype.hasOwnProperty.call(extra, k)) ev[k] = extra[k]; }
        track('lead_submit', ev);
        self.state.submitted = true;
        if (self.state.completed.indexOf(self.state.track) === -1) self.state.completed.push(self.state.track);
        self._saveDone();
        self._clearSave();
        onOk();
      });
  };

  function emailCard(title, desc) {
    return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f6f9;border-left:4px solid #FFD700;border-radius:8px;margin-bottom:10px;"><tr><td style="padding:14px 18px;">' +
      '<p style="margin:0 0 4px 0;color:#003366;font-weight:700;font-size:15px;font-family:Montserrat,Arial,sans-serif;">' + esc(title) + '</p>' +
      '<p style="margin:0;color:#66707f;font-size:13px;line-height:1.5;font-family:Montserrat,Arial,sans-serif;">' + esc(desc) + '</p>' +
      '</td></tr></table>';
  }

  // EmailJS — {email, message} conservés pour compatibilité du template existant
  BTDSimulator.prototype._sendEmail = function (opt) {
    if (!window.emailjs) return Promise.reject(new Error('EmailJS absent'));
    return window.emailjs.send(CONFIG.emailjs.serviceId, opt.templateId, opt.params);
  };

  BTDSimulator.prototype._sendMake = function (url, payload) {
    return fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
    }).then(function (res) { if (!res.ok) throw new Error('Make ' + res.status); return res; });
  };

  /* -----------------------------------------------------------------------------
     BLOC MAILCHIMP
     -----------------------------------------------------------------------------
     Construit un objet directement mappable dans le module Make
     « Mailchimp > Add/Update a Subscriber » :
       payload.mailchimp.email          -> Email Address
       payload.mailchimp.status         -> Status (subscribed)
       payload.mailchimp.tags           -> Tags (collection)
       payload.mailchimp.merge_fields.* -> Merge Fields (FNAME, LNAME, …)

     Le tag principal est ce qui déclenche le Customer Journey côté Mailchimp.
     ----------------------------------------------------------------------------- */
  BTDSimulator.prototype._mailchimp = function (a, tag, journey, merge, qualif) {
    var mc = CONFIG.mailchimp, self = this;
    // Un tag non renseigné n'est pas envoyé : Mailchimp crée à la volée tout tag
    // reçu, un libellé vide ou provisoire polluerait l'audience.
    var tags = tag ? [tag] : [];
    if (mc.tagsQualification && qualif && qualif.length) tags = tags.concat(qualif);

    // La personne a-t-elle déjà complété l'autre parcours dans cette session ?
    var dejaFait = this.state.completed.filter(function (t) { return t !== self.state.track; });
    if (dejaFait.length && mc.tagMixte) tags.push(mc.tagMixte);

    var fields = { FNAME: a.firstname, LNAME: a.lastname, PHONE: a.phone };
    for (var k in merge) { if (Object.prototype.hasOwnProperty.call(merge, k)) fields[k] = merge[k]; }

    return {
      email: a.email,
      status: 'subscribed',
      tags: tags,
      tag_principal: tag,
      journey_id: (journey && journey.id) || '',
      journey_step_id: (journey && journey.stepId) || '',
      parcours_deja_faits: dejaFait,          // ['public'] si double parcours
      double_parcours: dejaFait.length > 0,
      merge_fields: fields
    };
  };

  /* ----- Payload PUBLIC (champs d'origine conservés) ----- */
  BTDSimulator.prototype._payloadPublic = function (a, aids) {
    var u = this.state.utm;
    var Q = QUESTIONS_PUBLIC;
    var innovTypes = arr(a['innovation-type']);
    var usages = arr(a[9]);

    return {
      parcours: 'public',
      firstname: a.firstname, lastname: a.lastname, email: a.email, phone: a.phone,
      eligible_aids: aids, aids_count: aids.length,
      mailchimp: this._mailchimp(a, CONFIG.mailchimp.tagPublic, CONFIG.mailchimp.journeyPublic, {
        PARCOURS:  'Financement public',
        NBAIDES:   aids.length,
        AIDES:     aids.slice(0, 5).join(', '),
        STADE:     labelOf(Q, 2, a[2]),
        BESOIN:    labelOf(Q, 8, a[8]),
        EQUIPE:    labelOf(Q, 4, a[4]),
        INNOV:     labelOf(Q, 5, a[5]),
        USAGE:     labelOf(Q, 9, a[9]),
        FDSPROPRE: labelOf(Q, 10, a[10])
      }),
      utm_source: u.source, utm_medium: u.medium, utm_campaign: u.campaign,
      session_id: this.state.sessionId,
      reponses: {
        immatriculee: a[1], stade: a[2], deja_finance: a[3], equipe: a[4],
        innovation: a[5],
        innovation_type: innovTypes,
        innovation_type_str: innovTypes.join(', '),
        accompagnement: a[6], france: a[7], besoin: a[8],
        usage: usages,
        usage_str: usages.join(', '),
        fonds_propres: a[10]
      },
      timestamp: new Date().toISOString()
    };
  };

  /* ----- Payload PRIVÉ ----- */
  BTDSimulator.prototype._payloadPrive = function (a, matches, rd) {
    var u = this.state.utm;
    var Q = QUESTIONS_PRIVE;

    // Tags de qualification : priorisation commerciale + branches du parcours Dataroom
    var pfx = (CONFIG.mailchimp.prefixePrive || 'FinPriv LF') + ' ';
    var qualif = [];
    qualif.push(pfx + ({ now:'urgent (moins de 3 mois)', '3-6':'3 a 6 mois',
                         '6-12':'6 a 12 mois', explo:'exploration' }[a[11]] || 'horizon non precise'));
    qualif.push(pfx + (rd.score >= 60 ? 'dossier pret' : 'dossier a structurer'));

    return {
      parcours: 'levee-de-fonds',
      firstname: a.firstname, lastname: a.lastname, email: a.email, phone: a.phone,
      entreprise: a.company || '',
      mailchimp: this._mailchimp(a, CONFIG.mailchimp.tagPrive, CONFIG.mailchimp.journeyPrive, {
        PARCOURS:  'Levee de fonds',
        COMPANY:   a.company || '',
        MONTANT:   labelOf(Q, 2, a[2]),
        STADE:     labelOf(Q, 1, a[1]),
        SECTEUR:   labelOf(Q, 3, a[3]),
        TRACTION:  labelOf(Q, 4, a[4]),
        HORIZON:   labelOf(Q, 11, a[11]),
        SCORE:     rd.score,
        NIVEAU:    rd.label,
        NBINVEST:  matches.length,
        TOPINVEST: matches.slice(0, 5).map(function (m) { return m.name; }).join(', '),
        SECTEURDB: (SECTEUR_NOTION[a[3]] || []).join(', '),   // secteur(s) dans la base Notion
        NOTIONURL: CONFIG.notionDb.url || '',
        TYPEINV:   labelOf(Q, 8, a[8]),
        THESE:     labelOf(Q, 9, a[9]),
        PREPA:     labelOf(Q, 10, a[10])
      }, qualif),
      notion_url: CONFIG.notionDb.url || '',
      secteur_notion: SECTEUR_NOTION[a[3]] || [],
      investisseurs: matches.map(function (m) { return { nom:m.name, type:m.type, affinite:m.affinite }; }),
      investisseurs_count: matches.length,
      investisseurs_top_str: matches.slice(0, 5).map(function (m) { return m.name; }).join(', '),
      readiness_score: rd.score,
      readiness_label: rd.label,
      recommandations: rd.tips,
      utm_source: u.source, utm_medium: u.medium, utm_campaign: u.campaign,
      session_id: this.state.sessionId,
      reponses: this._readablePrive(a),
      timestamp: new Date().toISOString()
    };
  };

  // Réponses du parcours privé, en brut + en libellés lisibles (pratique pour Mailchimp)
  BTDSimulator.prototype._readablePrive = function (a) {
    var Q = QUESTIONS_PRIVE;
    return {
      stade: a[1],                    stade_label: labelOf(Q, 1, a[1]),
      montant: a[2],                  montant_label: labelOf(Q, 2, a[2]),
      secteur: a[3],                  secteur_label: labelOf(Q, 3, a[3]),
      traction: a[4],                 traction_label: labelOf(Q, 4, a[4]),
      equipe: a[5],                   equipe_label: labelOf(Q, 5, a[5]),
      deja_leve: a[6],                deja_leve_label: labelOf(Q, 6, a[6]),
      localisation: a[7],             localisation_label: labelOf(Q, 7, a[7]),
      types_investisseurs: arr(a[8]), types_investisseurs_str: labelOf(Q, 8, a[8]),
      theses: arr(a[9]),              theses_str: labelOf(Q, 9, a[9]),
      preparation: arr(a[10]),        preparation_str: labelOf(Q, 10, a[10]),
      horizon: a[11],                 horizon_label: labelOf(Q, 11, a[11])
    };
  };

  /* ---------- RÉSULTATS PUBLIC ---------- */
  BTDSimulator.prototype._resultsPublic = function (aids) {
    var self = this;
    var visible = aids.slice(0, CONFIG.maxVisible);
    var blurred = aids.slice(CONFIG.maxVisible);

    var list = this.$('aids'); list.innerHTML = '';
    visible.forEach(function (x) { list.appendChild(self._aidEl(x)); });

    var wrap = this.$('blurred'), content = this.$('blurred-content'); content.innerHTML = '';
    if (blurred.length === 0) { wrap.style.display = 'none'; }
    else { blurred.forEach(function (x) { content.appendChild(self._aidEl(x)); }); wrap.style.display = 'block'; }

    this._noticeEmail('post-head', 'post-mail', 'Ton analyse');

    this.$('pill').textContent = aids.length + ' dispositif' + (aids.length > 1 ? 's' : '') + ' identifié' + (aids.length > 1 ? 's' : '');

    if (CONFIG.notionDb && CONFIG.notionDb.surPublic) this._showGift(this.root.querySelector('#results .post'));
    else { var g = this.$('gift'); if (g) g.style.display = 'none'; }

    setTimeout(function () {
      self.$('loading').style.display = 'none';
      self.$('results').style.display = 'block';
      self._say('Analyse terminée : ' + aids.length + ' dispositifs');
      self._scrollTop();
    }, 1300);
  };

  /* ----- Carte "base Notion offerte" : positionnée juste avant le bloc email ----- */
  BTDSimulator.prototype._showGift = function (before) {
    var cfg = CONFIG.notionDb, gift = this.$('gift');
    if (!gift) return;
    // surSite:false => l'accès à la base ne passe que par l'email reçu, jamais
    // par l'écran : c'est ce qui rend l'adresse saisie réellement nécessaire.
    if (!cfg || !cfg.url || !cfg.surSite || !before) { gift.style.display = 'none'; return; }

    // Le noeud est unique : on le déplace dans la section de résultats courante
    if (gift.parentNode !== before.parentNode || gift.nextSibling !== before) {
      before.parentNode.insertBefore(gift, before);
    }

    var link = this.$('gift-link');
    link.href = cfg.url;
    if (!link._btdBound) {
      link._btdBound = true;
      var self = this;
      link.addEventListener('click', function () {
        track('notion_db_click', { parcours: self.state.track });
      });
    }

    var sect = SECTEUR_NOTION[this.state.answers[3]];
    this.$('gift-secteur').textContent = sect && sect.length
      ? 'Ton secteur dans la base : ' + sect.join(' · ')
      : '';
    gift.style.display = 'block';
  };

  /* ----- N'annonce l'envoi du mail que s'il a réellement abouti ----- */
  BTDSimulator.prototype._noticeEmail = function (headId, pId, quoi) {
    var head = this.$(headId), p = this.$(pId);
    if (!head || !p) return;
    if (this.state.emailOK) {
      head.innerHTML = ICONS.mail + 'Vérifie tes spams';
      p.innerHTML = quoi + ' est partie par email. Si tu ne la vois pas, regarde dans tes ' +
        '<strong>spams</strong> ou tes <strong>promotions</strong>.';
    } else {
      // Promettre un mail qui n'est jamais parti envoie les gens fouiller leurs spams pour rien.
      head.innerHTML = ICONS.mail + 'Garde cette page sous la main';
      p.innerHTML = 'L\'envoi par email n\'a pas abouti. Garde cet onglet ouvert&nbsp;: ' +
        'on te renverra tout par écrit lors de l\'échange.';
    }
  };

  BTDSimulator.prototype._aidEl = function (name) {
    var el = document.createElement('div'); el.className = 'aid';
    var nm = document.createElement('div'); nm.className = 'aid-name'; nm.textContent = name;
    var ds = document.createElement('div'); ds.className = 'aid-desc'; ds.textContent = DESC[name] || '';
    el.appendChild(nm); el.appendChild(ds);
    return el;
  };

  /* ---------- RÉSULTATS PRIVÉ ---------- */
  BTDSimulator.prototype._resultsPrive = function (matches, rd) {
    var self = this;
    var visible = matches.slice(0, CONFIG.maxVisiblePrive);
    var locked  = matches.length - visible.length;

    var list = this.$('investors'); list.innerHTML = '';
    visible.forEach(function (m) { list.appendChild(self._invEl(m)); });

    // Les investisseurs verrouillés ne sont JAMAIS injectés dans le DOM :
    // on n'affiche que des cartes fantômes, la base reste protégée.
    for (var i = 0; i < Math.min(locked, 3); i++) list.appendChild(self._lockEl());

    var unlock = this.$('unlock');
    if (locked > 0) {
      this.$('unlock-title').textContent = locked + ' autre' + (locked > 1 ? 's' : '') + ' investisseur' + (locked > 1 ? 's correspondent' : ' correspond') + ' à ton profil';
      unlock.style.display = 'block';
    } else {
      unlock.style.display = 'none';
    }

    this.$('pill-prive').textContent = matches.length
      ? matches.length + ' investisseur' + (matches.length > 1 ? 's' : '') + ' correspond' + (matches.length > 1 ? 'ent' : '') + ' à ton profil'
      : 'Profil analysé';

    if (!matches.length) {
      this.root.querySelector('#results-prive .r-sub').textContent =
        "Aucun investisseur de notre base ne correspond exactement à ces critères. Un échange avec un expert permettra d'élargir le ciblage ou de préparer ta levée en amont.";
    }

    this._noticeEmail('post-head-prive', 'post-mail-prive', 'Ta short-list');
    this._showGift(this.root.querySelector('#results-prive .post'));

    var jauge = this.$('gauge'), fill = this.$('gauge-fill');
    if (!CONFIG.afficherScorePreparation) {
      jauge.style.display = 'none';
    } else {
      jauge.style.display = 'block';
      this.$('gauge-lbl').textContent = 'Préparation à la levée : ' + rd.label;
      this.$('gauge-val').textContent = rd.score + '/100';
      fill.className = 'gauge-fill ' + rd.tone;
      var tips = this.$('gauge-tips'); tips.innerHTML = '';
      rd.tips.forEach(function (t) { var li = document.createElement('li'); li.textContent = t; tips.appendChild(li); });
    }

    setTimeout(function () {
      self.$('loading').style.display = 'none';
      self.$('results-prive').style.display = 'block';
      if (CONFIG.afficherScorePreparation) setTimeout(function () { fill.style.width = rd.score + '%'; }, 80);
      self._say('Analyse terminée : ' + matches.length + ' investisseurs identifiés');
      self._scrollTop();
    }, 1500);
  };

  BTDSimulator.prototype._invEl = function (m) {
    var el = document.createElement('div'); el.className = 'inv';

    var top = document.createElement('div'); top.className = 'inv-top';
    var nm = document.createElement('div'); nm.className = 'inv-name'; nm.textContent = m.name;
    var sc = document.createElement('div'); sc.className = 'inv-score'; sc.textContent = 'Affinité ' + m.affinite + '%';
    top.appendChild(nm); top.appendChild(sc);

    var tags = document.createElement('div'); tags.className = 'inv-tags';
    var addTag = function (txt, gold) {
      if (!txt) return;
      var t = document.createElement('span'); t.className = 'tag' + (gold ? ' gold' : ''); t.textContent = txt; tags.appendChild(t);
    };
    addTag(m.typeLabel, true);
    (m.stages || []).slice(0, 3).forEach(function (s) { addTag(s); });
    addTag('Ticket ' + m.ticket);

    var ds = document.createElement('div'); ds.className = 'inv-desc'; ds.textContent = m.desc;

    el.appendChild(top); el.appendChild(tags); el.appendChild(ds);
    return el;
  };

  BTDSimulator.prototype._lockEl = function () {
    var el = document.createElement('div'); el.className = 'lock';
    var nm = document.createElement('div'); nm.className = 'lock-name';
    nm.innerHTML = ICONS.padlock + '<span>Investisseur ••••••••••</span>';
    var bars = document.createElement('div'); bars.className = 'lock-bars';
    bars.innerHTML = '<span></span><span></span>';
    el.appendChild(nm); el.appendChild(bars);
    return el;
  };

  /* ---------- DIVERS ---------- */
  BTDSimulator.prototype._scrollTop = function () {
    try {
      var top = this.getBoundingClientRect().top;
      if (top < 0) window.scrollTo({ top: window.scrollY + top - 16, behavior: 'smooth' });
    } catch (e) {}
  };
  BTDSimulator.prototype._say = function (m) { var r = this.$('live'); if (r) r.textContent = m; };
  BTDSimulator.prototype._save = function () {
    try {
      sessionStorage.setItem('btd_state', JSON.stringify({
        track: this.state.track, answers: this.state.answers,
        contact: this.state.contact, sessionId: this.state.sessionId
      }));
    } catch (e) {}
  };
  // Parcours déjà complétés : conservé hors de "btd_state", qui est effacé après envoi
  BTDSimulator.prototype._saveDone = function () {
    try { sessionStorage.setItem('btd_done', JSON.stringify(this.state.completed)); } catch (e) {}
  };
  BTDSimulator.prototype._load = function () {
    try {
      var done = JSON.parse(sessionStorage.getItem('btd_done'));
      if (Array.isArray(done)) this.state.completed = done;
    } catch (e) {}
    try {
      var d = JSON.parse(sessionStorage.getItem('btd_state'));
      if (!d) return;
      this.state.sessionId = d.sessionId || this.state.sessionId;
      this.state.contact = d.contact || {};
      // On ne restaure les réponses que si le parcours repris est cohérent
      if (d.answers && d.track && (this.mode === 'both' || this.mode === d.track)) {
        this.state.answers = d.answers;
        this.state.track = d.track;
      }
    } catch (e) {}
  };
  BTDSimulator.prototype._clearSave = function () { try { sessionStorage.removeItem('btd_state'); } catch (e) {} };

  customElements.define(TAG, BTDSimulator);

  /* -----------------------------------------------------------------------------
     BALISES DÉDIÉES À UN SEUL PARCOURS
     -----------------------------------------------------------------------------
     Certaines intégrations ne permettent pas de poser d'attribut sur la balise.
     C'est le cas de l'élément personnalisé de Wix, où l'on ne renseigne qu'une
     URL de script et un nom de balise (passer mode="prive" y imposerait du code
     Velo). Ces deux balises supplémentaires évitent ce détour : même fichier,
     même URL, il suffit de changer le nom de la balise dans Wix.

       <btd-simulator>          -> écran de choix des deux parcours
       <btd-simulator-public>   -> directement le parcours aides publiques
       <btd-simulator-prive>    -> directement le parcours levée de fonds
     ----------------------------------------------------------------------------- */
  function defineVariant(tag, mode) {
    if (customElements.get(tag)) return;
    var Variant = function () {
      var self = Reflect.construct(HTMLElement, [], Variant);
      initState(self);
      self._forcedMode = mode;
      return self;
    };
    Variant.prototype = Object.create(BTDSimulator.prototype);
    Variant.prototype.constructor = Variant;
    customElements.define(tag, Variant);
  }
  defineVariant(TAG + '-public', 'public');
  defineVariant(TAG + '-prive',  'prive');
})();

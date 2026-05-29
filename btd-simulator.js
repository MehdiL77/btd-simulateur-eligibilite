/* ============================================================
   BTD CONSULTING — Simulateur d'éligibilité (v2)
   Élément personnalisé Wix (Custom Element / Web Component)
   ------------------------------------------------------------
   Mise à jour v2 :
   - Q9 : "Investissement matériel / industriel"
   - Q9 : "Foncier et travaux" -> "Recrutement et communication"
   - Q5 sous-question : MULTI-SELECT (plusieurs types d'innovation)
   - Résultats : bloc d'info "vérifier spams + RDV expert"
   - Bouton Calendly : URL mise à jour + window.open() forcé
   - Aide "Phase REON" -> "Prêt d'honneur Réseau Entreprendre"
   - Description "Prêt d'amorçage BPI" corrigée

   Automatisations conservées à l'identique :
   - EmailJS  : service_6dapp1n / template_04p4rbb  {email, message}
   - Make     : webhook -> Mailchimp  {firstname,lastname,email,phone}
   - Calendly : btd-consulting/financement
   ============================================================ */
(function () {
  'use strict';

  var TAG = 'btd-simulator';
  if (customElements.get(TAG)) return;

  /* ---------- CONFIG ---------- */
  var CONFIG = {
    emailjs:     { publicKey: '9wQDV2yQMMiwHxrlp', serviceId: 'service_6dapp1n', templateId: 'template_04p4rbb' },
    makeWebhook: 'https://hook.eu2.make.com/n1h141qajnp8ijygmsqzjr5i6py7ry5o',
    calendly:    'https://calendly.com/btd-consulting/financement?month=2026-05',
    fontsHref:   'https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800&display=swap',
    emailjsSrc:  'https://cdn.jsdelivr.net/npm/@emailjs/browser@3/dist/email.min.js',
    maxVisible:  4,
    cooldownMs:  5000
  };

  /* ---------- DONNÉES ---------- */
  var QUESTIONS = [
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
        multi:true, // <-- NOUVEAU : sélection multiple
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
    { id:9, q:"Que souhaites-tu financer ?",
      o:[
        ['randd','Recherche & développement'],
        ['materiel','Investissement matériel / industriel'],   // <-- LIBELLÉ MIS À JOUR
        ['tresorerie','Trésorerie'],
        ['recrutement','Recrutement et communication'],         // <-- REMPLACE "Foncier et travaux"
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
    "Prêt d'honneur Réseau Entreprendre": "Prêt d'honneur à taux zéro et mentorat par le Réseau Entreprendre, pour les créateurs et repreneurs accompagnés.", // <-- RENOMMÉ
    'Aides régionales': "Dispositifs de soutien spécifiques à ta région.",
    'Avance remboursable BPI': "Financement sans garantie pour les projets innovants.",
    "Prêt d'amorçage BPI": "Prêt destiné aux entreprises innovantes en phase de levée de fonds.", // <-- DESCRIPTION CORRIGÉE
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

  /* ---------- LOGIQUE D'ÉLIGIBILITÉ (scoring strict, multi-types) ---------- */
  function analyze(a) {
    // Normalisation type d'innovation : toujours en tableau
    var types = a['innovation-type'];
    if (!Array.isArray(types)) types = types ? [types] : [];
    var hasType = function (x) { return types.indexOf(x) > -1; };
    var hasAnyTech = hasType('technologique') || hasType('technique');

    var fr=a[7]==='oui', imm=a[1]==='oui', inno=a[5]==='oui',
        st=a[2], team=a[4], need=a[8], use=a[9], eq=a[10],
        acc=a[6]==='oui', funded=a[3]==='oui';

    var rules = [
      ['Bourse French Tech (BFT)', function(){ if(!fr||!inno||!imm)return 0; if(st!=='creation')return 0; if(team==='6+')return 0; if(need!=='0-50k')return 0; var s=80; if(hasAnyTech)s+=15; return s; }],
      ['Bourse French Tech Émergence (BFTE)', function(){ if(!fr||!inno||!imm)return 0; if(st!=='creation')return 0; if(!hasAnyTech)return 0; if(team==='6+')return 0; return 85; }],
      ['i-Lab', function(){ if(!fr||!inno)return 0; if(!hasType('technologique'))return 0; if(imm&&st!=='creation')return 0; return 75; }],
      ['i-Nov', function(){ if(!fr||!inno||!imm)return 0; if(st!=='croissance'&&st!=='diversification')return 0; if(team==='0')return 0; if(need==='0-50k')return 0; return 80; }],
      ['Phase Initiative', function(){ if(!fr||st!=='creation'||!acc)return 0; if(eq==='100k+')return 0; return 70; }],
      ["Prêt d'honneur Réseau Entreprendre", function(){ if(!fr||!acc)return 0; if(st!=='creation'&&st!=='croissance')return 0; if(team==='0')return 0; return 70; }],
      ['Aides régionales', function(){ if(!fr)return 0; var s=50; if(use==='recrutement'||use==='materiel')s+=20; if(inno)s+=10; return s; }],
      ['Avance remboursable BPI', function(){ if(!fr||!inno||!imm)return 0; if(need==='0-50k')return 0; if(use!=='randd'&&use!=='materiel')return 0; return 75; }],
      ["Prêt d'amorçage BPI", function(){ if(!fr||!imm||!funded)return 0; if(st!=='creation'&&st!=='croissance')return 0; if(!inno)return 0; return 80; }],
      ['Prêt innovation BPI', function(){ if(!fr||!inno||!imm)return 0; if(st!=='croissance'&&st!=='diversification')return 0; if(need==='0-50k')return 0; return 75; }],
      ["Crédit d'impôt innovation (CII)", function(){
        if(!fr||!inno||!imm)return 0;
        // Le CII vise l'innovation produit/process : exclu si l'utilisateur n'a coché QUE sociale et/ou business
        var techRelated = hasType('technologique')||hasType('technique')||hasType('ergonomique');
        if(!techRelated)return 0;
        if(team==='0')return 0;
        return 70;
      }],
      ["Crédit d'impôt recherche (CIR)", function(){ if(!fr||!inno||!imm)return 0; if(!hasType('technologique'))return 0; if(use!=='randd')return 0; return 90; }],
      ["Aide à l'export (Chèque Relance Export)", function(){ if(!fr||!imm)return 0; if(st!=='export')return 0; return 80; }],
      ['Prêt Croissance Internationale BPI', function(){ if(!fr||!imm)return 0; if(st!=='export')return 0; if(team==='0')return 0; if(need==='0-50k')return 0; return 75; }],
      ['Garantie BPI', function(){ if(!fr||!imm)return 0; if(eq!=='0-10k'&&eq!=='10k-25k')return 0; if(need==='0-50k')return 0; return 60; }],
      ['FEDER', function(){ if(!fr||!inno)return 0; if(need!=='150k-300k'&&need!=='300k+')return 0; return 65; }],
      ['Horizon Europe (EIC Accelerator)', function(){ if(!inno)return 0; if(!hasType('technologique'))return 0; if(need!=='300k+')return 0; return 70; }],
      ["Aide à l'embauche", function(){ if(!fr||!imm)return 0; if(st!=='croissance'&&st!=='diversification')return 0; if(team==='0')return 0; var s=55; if(use==='recrutement')s+=15; return s; }],
      ['Aide à la formation (OPCO/FNE)', function(){ if(!fr||!imm)return 0; if(team==='0')return 0; return 50; }],
      ["Prêt d'honneur", function(){ if(!fr||st!=='creation')return 0; if(eq!=='0-10k'&&eq!=='10k-25k')return 0; return 65; }]
    ];
    var res = rules.map(function(r){ return { name:r[0], score:r[1]() }; })
                   .filter(function(r){ return r.score>0; })
                   .sort(function(x,y){ return y.score-x.score; });
    if (res.length===0 && fr) res.push({ name:'Aides régionales', score:40 });
    return res.map(function(r){ return r.name; });
  }

  /* ---------- HELPERS ---------- */
  function esc(s){ return typeof s==='string' ? s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;') : ''; }
  function validEmail(e){ return !!e && e.length<=254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e); }
  function validPhone(p){ if(!p)return false; var c=p.replace(/[\s.\-()]/g,''); return c.length<=20 && /^(\+33|0033|0)[1-9]\d{8}$|^\+?\d{9,15}$/.test(c); }
  function validName(n){ return !!n && n.length>=1 && n.length<=50 && /^[a-zA-ZÀ-ÿ\s'\-]+$/.test(n); }

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
  function track(name, params){
    try { if (typeof window.gtag==='function') window.gtag('event', name, params||{}); } catch(e){}
    try {
      if (typeof window.fbq==='function') {
        if (name==='simulator_complete') window.fbq('track','Lead');
        if (name==='lead_submit') window.fbq('track','CompleteRegistration');
      }
    } catch(e){}
  }

  /* ---------- STYLES (Shadow DOM, isolés de Wix) ---------- */
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
  .step{ padding:2.2rem 2rem 2.4rem; display:none; }\
  .step.active{ display:block; animation:fade .35s ease; }\
  .prog{ height:6px; background:#e7ebf1; border-radius:4px; overflow:hidden; margin-bottom:.6rem; }\
  .prog-fill{ height:100%; background:linear-gradient(90deg,#FFD700,#e6c200); width:0; border-radius:4px; transition:.25s; }\
  .meta{ display:flex; justify-content:space-between; font-size:.74rem; font-weight:700; letter-spacing:.04em; color:#1a4d80; text-transform:uppercase; margin-bottom:1.5rem; }\
  .question{ font-weight:700; font-size:clamp(1.15rem,2.6vw,1.4rem); line-height:1.3; color:#003366; margin-bottom:1.5rem; }\
  .opts{ display:flex; flex-direction:column; gap:.7rem; }\
  .opt{ background:#f4f6f9; border:2px solid transparent; border-radius:10px; padding:.95rem 1.2rem; font-family:inherit; font-weight:600; font-size:.98rem; color:#2a3340; text-align:left; cursor:pointer; transition:.25s; display:flex; align-items:center; justify-content:space-between; }\
  .opt:hover{ background:#e7ebf1; transform:translateX(3px); }\
  .opt.sel{ background:rgba(0,51,102,.05); border-color:#003366; color:#003366; }\
  .ck{ width:20px; height:20px; border-radius:50%; border:2px solid #dde3ec; flex-shrink:0; transition:.25s; position:relative; }\
  .opt.multi .ck{ border-radius:5px; }\
  .opt.sel .ck{ border-color:#003366; background:#003366; }\
  .opt.sel .ck::after{ content:''; position:absolute; left:5px; top:2px; width:5px; height:9px; border:solid #fff; border-width:0 2px 2px 0; transform:rotate(45deg); }\
  .sub{ margin-top:1rem; padding:1.1rem; background:rgba(0,51,102,.035); border-radius:10px; display:none; }\
  .sub.active{ display:block; animation:fade .3s ease; }\
  .sub .question{ font-size:.98rem; margin-bottom:.9rem; }\
  .sub-hint{ font-size:.78rem; color:#66707f; font-weight:500; margin-bottom:.8rem; }\
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
  .post{ margin-top:1.8rem; padding:1.2rem 1.3rem; background:linear-gradient(135deg,#003366,#1a4d80); color:#fff; border-radius:12px; text-align:left; box-shadow:0 8px 24px rgba(0,51,102,.18); }\
  .post-head{ display:flex; align-items:center; gap:.6rem; font-weight:800; font-size:.95rem; margin-bottom:.5rem; }\
  .post-head svg{ width:18px; height:18px; flex-shrink:0; color:#FFD700; }\
  .post p{ font-size:.88rem; line-height:1.5; opacity:.95; }\
  .post p + p{ margin-top:.6rem; }\
  .post strong{ color:#FFD700; font-weight:700; }\
  .cta-text{ font-size:.95rem; color:#66707f; margin:1.6rem 0 1rem; }\
  .calendly{ display:inline-flex; align-items:center; gap:.5rem; background:#003366; color:#fff; text-decoration:none; padding:.95rem 2rem; border-radius:50px; font-weight:700; font-size:.97rem; transition:.25s; box-shadow:0 6px 18px rgba(0,51,102,.25); cursor:pointer; border:none; font-family:inherit; }\
  .calendly:hover{ background:#00254d; transform:translateY(-2px); }\
  .sr{ position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0,0,0,0); }\
  @keyframes spin{ to{ transform:rotate(360deg); } }\
  @keyframes fade{ from{ opacity:0; transform:translateY(8px); } to{ opacity:1; transform:translateY(0); } }\
  @media (max-width:560px){ .intro,.step,.results{ padding-left:1.3rem; padding-right:1.3rem; } .row{ flex-direction:column; gap:0; } .nav{ flex-direction:column-reverse; } .nav .btn{ width:100%; justify-content:center; } .badges{ gap:1rem; } }\
  ";

  var ARROW = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';

  /* ============================================================
     CUSTOM ELEMENT
     ============================================================ */
  var BTDSimulator = function () {
    var self = Reflect.construct(HTMLElement, [], BTDSimulator);
    self.state = {
      current: 1, answers: {}, submitted: false, lastSubmit: 0,
      sessionId: 'btd_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 9),
      utm: { source:'direct', medium:'none', campaign:'none', referrer:'' }
    };
    return self;
  };
  BTDSimulator.prototype = Object.create(HTMLElement.prototype);
  BTDSimulator.prototype.constructor = BTDSimulator;

  BTDSimulator.prototype.connectedCallback = function () {
    if (this._mounted) return;
    this._mounted = true;
    ensureFont();
    loadEmailJS();
    this.root = this.attachShadow({ mode: 'open' });
    this.state.utm = this._getUTM();
    this._render();
    this._build();
    this._bind();
    this._load();
  };

  BTDSimulator.prototype._getUTM = function () {
    try {
      var p = new URLSearchParams(window.location.search || '');
      return { source:p.get('utm_source')||'direct', medium:p.get('utm_medium')||'none', campaign:p.get('utm_campaign')||'none', referrer:document.referrer||'direct' };
    } catch(e){ return { source:'direct', medium:'none', campaign:'none', referrer:'' }; }
  };

  BTDSimulator.prototype.$ = function (id) { return this.root.getElementById(id); };

  BTDSimulator.prototype._render = function () {
    var style = document.createElement('style');
    style.textContent = CSS;
    this.root.appendChild(style);

    var wrap = document.createElement('div');
    wrap.className = 'wrap';
    wrap.innerHTML =
      '<div class="card">' +
        '<div class="sr" id="live" aria-live="polite"></div>' +
        '<section class="intro" id="intro">' +
          '<h1>Découvre les aides adaptées à ton projet innovant</h1>' +
          '<div class="line"></div>' +
          '<p>En moins de 2 minutes, identifie les subventions, concours, appels à projets et prêts à taux zéro auxquels ton projet peut prétendre.</p>' +
          '<div class="badges">' +
            '<span class="badge"><svg viewBox="0 0 24 24" fill="none" stroke="#FFD700" stroke-width="2.5"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>2 minutes</span>' +
            '<span class="badge"><svg viewBox="0 0 24 24" fill="none" stroke="#FFD700" stroke-width="2.5"><path d="M20 6L9 17l-5-5"/></svg>20 dispositifs</span>' +
            '<span class="badge"><svg viewBox="0 0 24 24" fill="none" stroke="#FFD700" stroke-width="2.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>Confidentiel</span>' +
          '</div>' +
          '<button class="start" id="start" type="button">Voir mon éligibilité ' + ARROW + '</button>' +
        '</section>' +
        '<div id="steps"></div>' +
        '<div class="loading" id="loading" aria-live="polite"><div class="spinner"></div><p>Analyse de ton éligibilité en cours…</p></div>' +
        '<section class="results" id="results" aria-live="polite">' +
          '<span class="pill" id="pill"></span>' +
          '<div class="r-title">Ton analyse d\'éligibilité</div>' +
          '<div class="r-sub">Selon tes réponses, ton projet pourrait être éligible aux dispositifs suivants :</div>' +
          '<div class="aids" id="aids"></div>' +
          '<div class="blurred" id="blurred" style="display:none"><div id="blurred-content"></div><div class="blur-ov"><div class="blur-msg">D\'autres aides semblent éligibles pour ton projet&nbsp;! Prends RDV pour une analyse complète.</div></div></div>' +
          // BLOC POST-RÉSULTATS (NOUVEAU)
          '<div class="post">' +
            '<div class="post-head"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M4 6h16v12H4z"/><path d="M4 6l8 7 8-7"/></svg>Vérifie tes spams</div>' +
            '<p>Ton analyse vient d\'être envoyée par email. Si tu ne la reçois pas dans quelques minutes, pense à consulter ton dossier <strong>« courriers indésirables »</strong> ou <strong>« promotions »</strong>.</p>' +
            '<p>Pour qu\'on vérifie cette analyse ensemble et qu\'on te partage la <strong>liste complète des aides et des investisseurs</strong> adaptés à ton projet, prends rendez-vous avec un expert BTD Consulting&nbsp;:</p>' +
          '</div>' +
          '<p class="cta-text">Réserve un créneau gratuit avec un expert :</p>' +
          '<button class="calendly" id="calendly" type="button">Prendre rendez-vous ' + ARROW + '</button>' +
        '</section>' +
      '</div>';
    this.root.appendChild(wrap);
  };

  BTDSimulator.prototype._build = function () {
    var box = this.$('steps');
    var total = QUESTIONS.length + 1;

    QUESTIONS.forEach(function (q, idx) {
      var n = idx + 1;
      var pct = Math.round((n / total) * 100);
      var card = document.createElement('div');
      card.className = 'step';
      card.setAttribute('data-step', n);

      var sub = '';
      if (q.sub) {
        var multiCls = q.sub.multi ? ' multi' : '';
        var hint = q.sub.multi ? '<div class="sub-hint">Coche toutes les options qui correspondent à ton projet.</div>' : '';
        sub = '<div class="sub" id="sub-' + n + '">' +
              '<div class="question">' + esc(q.sub.q) + '</div>' +
              hint +
              '<div class="opts">' +
              q.sub.o.map(function (o) {
                return '<button type="button" class="opt' + multiCls + '" data-sub="' + esc(q.sub.key) + '" data-val="' + esc(o[0]) + '"><span>' + esc(o[1]) + '</span><span class="ck"></span></button>';
              }).join('') +
              '</div></div>';
      }

      card.innerHTML =
        '<div class="prog"><div class="prog-fill" style="width:' + pct + '%"></div></div>' +
        '<div class="meta"><span>Question ' + n + ' / ' + total + '</span><span>' + pct + '%</span></div>' +
        '<div class="question">' + esc(q.q) + '</div>' +
        '<div class="opts">' +
          q.o.map(function (o) { return '<button type="button" class="opt" data-q="' + n + '" data-val="' + esc(o[0]) + '"><span>' + esc(o[1]) + '</span><span class="ck"></span></button>'; }).join('') +
        '</div>' + sub +
        '<div class="nav"><button type="button" class="btn prev"' + (n === 1 ? ' disabled' : '') + '>Précédent</button>' +
        '<button type="button" class="btn next" disabled>Suivant ' + ARROW + '</button></div>';
      box.appendChild(card);
    });

    var c = document.createElement('div');
    c.className = 'step';
    c.setAttribute('data-step', total);
    c.innerHTML =
      '<div class="prog"><div class="prog-fill" style="width:100%"></div></div>' +
      '<div class="meta"><span>Dernière étape</span><span>100%</span></div>' +
      '<div class="question">Tes coordonnées pour recevoir ton analyse</div>' +
      '<div class="row">' +
        '<div class="field"><label class="label" for="fn">Prénom</label><input class="input" id="fn" type="text" maxlength="50" autocomplete="given-name" placeholder="Ton prénom"></div>' +
        '<div class="field"><label class="label" for="ln">Nom</label><input class="input" id="ln" type="text" maxlength="50" autocomplete="family-name" placeholder="Ton nom"></div>' +
      '</div>' +
      '<div class="field"><label class="label" for="ph">Téléphone</label><input class="input" id="ph" type="tel" maxlength="20" autocomplete="tel" placeholder="06 12 34 56 78"><div class="err" id="ph-err">Numéro de téléphone invalide</div></div>' +
      '<div class="field"><label class="label" for="em">Email</label><input class="input" id="em" type="email" maxlength="254" autocomplete="email" placeholder="ton@email.com"><div class="err" id="em-err">Adresse email invalide</div></div>' +
      '<div class="hp" aria-hidden="true"><label for="hp">Ne pas remplir</label><input type="text" id="hp" tabindex="-1" autocomplete="off"></div>' +
      '<div class="net" id="net">Une erreur est survenue. Merci de réessayer dans un instant.</div>' +
      '<p class="consent">En soumettant ce formulaire, tu acceptes que BTD Consulting te recontacte au sujet de ton projet et conserve tes données conformément à notre politique de confidentialité.</p>' +
      '<div class="nav"><button type="button" class="btn prev">Précédent</button>' +
      '<button type="button" class="btn next" id="submit" disabled>Obtenir mes résultats ' + ARROW + '</button></div>';
    box.appendChild(c);
  };

  BTDSimulator.prototype._bind = function () {
    var self = this;
    this.$('start').addEventListener('click', function () { self._start(); });

    this.$('steps').addEventListener('click', function (e) {
      var opt = e.target.closest('.opt');
      if (opt) return self._pick(opt);
      var prev = e.target.closest('.prev');
      if (prev && !prev.disabled) return self._go(-1);
      var next = e.target.closest('.next');
      if (next && !next.disabled) { return next.id === 'submit' ? self._submit() : self._go(1); }
    });

    this.$('steps').addEventListener('input', function (e) {
      if (e.target.matches('#fn,#ln,#ph,#em')) self._validateForm();
    });

    // Calendly : window.open() FORCÉ pour contourner les blocages d'ancres dans certains contextes Shadow DOM/iframe
    this.$('calendly').addEventListener('click', function (e) {
      e.preventDefault();
      track('calendly_click', {});
      try {
        var win = window.open(CONFIG.calendly, '_blank', 'noopener,noreferrer');
        // Fallback si popup bloquée : navigation directe
        if (!win) window.location.href = CONFIG.calendly;
      } catch (err) {
        window.location.href = CONFIG.calendly;
      }
    });
  };

  /* ----- SÉLECTION D'UNE OPTION (gère single + multi) ----- */
  BTDSimulator.prototype._pick = function (btn) {
    var card = btn.closest('.step');
    var key  = btn.dataset.sub;
    var val  = btn.dataset.val;
    var isMulti = btn.classList.contains('multi');

    // -------- Cas 1 : sous-option MULTI-select --------
    if (key && isMulti) {
      var current = this.state.answers[key];
      if (!Array.isArray(current)) current = current ? [current] : [];
      var idx = current.indexOf(val);
      if (idx > -1) { current.splice(idx, 1); btn.classList.remove('sel'); }
      else { current.push(val); btn.classList.add('sel'); }
      this.state.answers[key] = current;

      // On ré-évalue l'état du bouton "Suivant"
      this._refreshNext(card);
      this._save();
      return;
    }

    // -------- Cas 2 : sous-option SINGLE-select (legacy) --------
    if (key) {
      var box = btn.parentElement;
      box.querySelectorAll('.opt').forEach(function (b) { b.classList.remove('sel'); });
      btn.classList.add('sel');
      this.state.answers[key] = val;
      this._refreshNext(card);
      this._save();
      return;
    }

    // -------- Cas 3 : question principale (single) --------
    var parent = btn.parentElement;
    parent.querySelectorAll('.opt').forEach(function (b) { b.classList.remove('sel'); });
    btn.classList.add('sel');

    var n = parseInt(btn.dataset.q, 10);
    this.state.answers[n] = val;

    var q = QUESTIONS[n - 1];
    if (q && q.sub) {
      var sub = this.$('sub-' + n);
      if (val === q.sub.trigger) {
        sub.classList.add('active');
      } else {
        sub.classList.remove('active');
        delete this.state.answers[q.sub.key];
        // Désélectionner les sous-options visuellement
        sub.querySelectorAll('.opt').forEach(function (b) { b.classList.remove('sel'); });
      }
    }
    this._refreshNext(card);
    track('question_answered', { question: n, answer: val });
    this._save();
  };

  /* ----- Active/désactive le bouton "Suivant" selon l'état complet de la carte ----- */
  BTDSimulator.prototype._refreshNext = function (card) {
    var n = parseInt(card.getAttribute('data-step'), 10);
    var nextBtn = card.querySelector('.next');
    if (!nextBtn) return;

    var q = QUESTIONS[n - 1];
    var mainAns = this.state.answers[n];

    if (!mainAns) { nextBtn.disabled = true; return; }

    if (q && q.sub && mainAns === q.sub.trigger) {
      var subAns = this.state.answers[q.sub.key];
      var hasSub = Array.isArray(subAns) ? subAns.length > 0 : !!subAns;
      nextBtn.disabled = !hasSub;
    } else {
      nextBtn.disabled = false;
    }
  };

  BTDSimulator.prototype._start = function () {
    this.$('intro').style.display = 'none';
    this._show(1);
    track('simulator_start', this.state.utm);
  };

  BTDSimulator.prototype._show = function (n) {
    var cards = this.root.querySelectorAll('.step');
    cards.forEach(function (c) { c.classList.remove('active'); });
    var card = this.root.querySelector('.step[data-step="' + n + '"]');
    if (!card) return;
    card.classList.add('active');
    this.state.current = n;

    // Restaurer sélections
    var ans = this.state.answers[n];
    if (ans) {
      var b = card.querySelector('.opt[data-val="' + ans + '"][data-q]');
      if (b) b.classList.add('sel');
      var q = QUESTIONS[n - 1];
      if (q && q.sub && ans === q.sub.trigger) {
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
    this._say('Question ' + n + ' sur ' + (QUESTIONS.length + 1));
  };

  BTDSimulator.prototype._go = function (dir) {
    var n = this.state.current + dir;
    if (n >= 1 && n <= QUESTIONS.length + 1) { this._show(n); this._save(); }
  };

  BTDSimulator.prototype._validateForm = function () {
    var fn = this.$('fn').value.trim(), ln = this.$('ln').value.trim(),
        ph = this.$('ph').value.trim(), em = this.$('em').value.trim();
    var okPh = validPhone(ph), okEm = validEmail(em);
    this.$('ph-err').classList.toggle('show', ph !== '' && !okPh);
    this.$('em-err').classList.toggle('show', em !== '' && !okEm);
    this.$('submit').disabled = !(validName(fn) && validName(ln) && okPh && okEm);
  };

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

    if (!validName(a.firstname) || !validName(a.lastname) || !validPhone(a.phone) || !validEmail(a.email)) return;

    this.$('steps').style.display = 'none';
    this.$('loading').style.display = 'block';
    this._scrollTop();
    this._say('Analyse en cours');

    var aids = analyze(a);
    track('simulator_complete', { aids_count: aids.length });

    var tasks = [ this._sendEmail(aids), this._sendMake(aids) ];
    Promise.all(tasks.map(function (p) { return p.then(function () { return true; }).catch(function () { return false; }); }))
      .then(function (r) {
        var emailOK = r[0], makeOK = r[1];
        if (!emailOK && !makeOK) {
          self.$('loading').style.display = 'none';
          self.$('steps').style.display = 'block';
          self.$('net').classList.add('show');
          self.state.lastSubmit = 0;
          return;
        }
        track('lead_submit', { email_sent: emailOK, mailchimp_sent: makeOK });
        self.state.submitted = true;
        self._clearSave();
        self._results(aids);
      });
  };

  // EmailJS — params {email, message} conservés
  BTDSimulator.prototype._sendEmail = function (aids) {
    var a = this.state.answers;
    if (!window.emailjs) return Promise.reject(new Error('EmailJS absent'));
    var message = aids.map(function (x) { return '• ' + x + ': ' + (DESC[x] || ''); }).join('\n\n');
    return window.emailjs.send(CONFIG.emailjs.serviceId, CONFIG.emailjs.templateId, {
      email: a.email, message: message, firstname: a.firstname, aids_count: aids.length
    });
  };

  // Make webhook — champs d'origine conservés + payload enrichi
  BTDSimulator.prototype._sendMake = function (aids) {
    var a = this.state.answers, u = this.state.utm;
    var innovTypes = a['innovation-type'];
    if (!Array.isArray(innovTypes)) innovTypes = innovTypes ? [innovTypes] : [];

    var payload = {
      firstname: a.firstname, lastname: a.lastname, email: a.email, phone: a.phone,
      eligible_aids: aids, aids_count: aids.length,
      utm_source: u.source, utm_medium: u.medium, utm_campaign: u.campaign,
      reponses: {
        immatriculee: a[1], stade: a[2], deja_finance: a[3], equipe: a[4],
        innovation: a[5],
        innovation_type: innovTypes,                // tableau désormais
        innovation_type_str: innovTypes.join(', '), // version texte pour Mailchimp
        accompagnement: a[6], france: a[7], besoin: a[8], usage: a[9], fonds_propres: a[10]
      },
      timestamp: new Date().toISOString()
    };
    return fetch(CONFIG.makeWebhook, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
    }).then(function (res) { if (!res.ok) throw new Error('Make ' + res.status); return res; });
  };

  BTDSimulator.prototype._results = function (aids) {
    var self = this;
    var visible = aids.slice(0, CONFIG.maxVisible);
    var blurred = aids.slice(CONFIG.maxVisible);

    var list = this.$('aids'); list.innerHTML = '';
    visible.forEach(function (x) { list.appendChild(self._aidEl(x)); });

    var wrap = this.$('blurred'), content = this.$('blurred-content'); content.innerHTML = '';
    if (blurred.length === 0) { wrap.style.display = 'none'; }
    else { blurred.forEach(function (x) { content.appendChild(self._aidEl(x)); }); wrap.style.display = 'block'; }

    this.$('pill').textContent = aids.length + ' dispositif' + (aids.length > 1 ? 's' : '') + ' identifié' + (aids.length > 1 ? 's' : '');

    setTimeout(function () {
      self.$('loading').style.display = 'none';
      self.$('results').style.display = 'block';
      self._say('Analyse terminée : ' + aids.length + ' dispositifs');
      self._scrollTop();
    }, 1300);
  };

  BTDSimulator.prototype._aidEl = function (name) {
    var el = document.createElement('div'); el.className = 'aid';
    var nm = document.createElement('div'); nm.className = 'aid-name'; nm.textContent = name;
    var ds = document.createElement('div'); ds.className = 'aid-desc'; ds.textContent = DESC[name] || '';
    el.appendChild(nm); el.appendChild(ds);
    return el;
  };

  BTDSimulator.prototype._scrollTop = function () {
    try {
      var top = this.getBoundingClientRect().top;
      if (top < 0) window.scrollTo({ top: window.scrollY + top - 16, behavior: 'smooth' });
    } catch (e) {}
  };
  BTDSimulator.prototype._say = function (m) { var r = this.$('live'); if (r) r.textContent = m; };
  BTDSimulator.prototype._save = function () {
    try { sessionStorage.setItem('btd_state', JSON.stringify({ answers: this.state.answers, sessionId: this.state.sessionId })); } catch (e) {}
  };
  BTDSimulator.prototype._load = function () {
    try { var d = JSON.parse(sessionStorage.getItem('btd_state')); if (d && d.answers) { this.state.answers = d.answers; this.state.sessionId = d.sessionId || this.state.sessionId; } } catch (e) {}
  };
  BTDSimulator.prototype._clearSave = function () { try { sessionStorage.removeItem('btd_state'); } catch (e) {} };

  customElements.define(TAG, BTDSimulator);
})();

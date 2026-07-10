---
name: audit-card-bodies
description: Audit honnêteté du body des cartes — 2 fact-checkers parallèles + spot-check + corrections appliquées automatiquement. Reprend là où on s'est arrêté via data/_audit/_progress.json.
---

# Audit Card Bodies

Tu auscultes le `display.locales.fr.body` des cartes HistoryDex pour détecter les
erreurs factuelles, anachronismes, fausses certitudes et approximations. Tu reproduis
exactement le pipeline d'audit éprouvé sur les 5 premiers batches (cartes 005-100) :
2 fact-checkers indépendants, spot-check humain via WebFetch sur les claims litigieuses,
synthèse en rapport Markdown, **application automatique des corrections** (avec garde-fou
spot-check pour éviter les faux positifs).

## Quand invoquer ce skill

- ✓ **Étape 6 (obligatoire) du pipeline `generate-cards-batch`** : appelé en fin de chaque batch sur `range:<min>-<max>` des cartes produites (cf. ce skill + `generate-cards-batch/SKILL.md`).
- ✓ Étape **3bis** du « Workflow d'ajout d'une carte » de `CLAUDE.md` (avant la review humaine).
- ✓ « audite les 10 prochaines cartes »
- ✓ « refais une vérification des bodies »
- ✓ « passe la batterie d'audit sur ce qui reste à voir »

## Quand NE PAS invoquer

- ✗ Tu veux auditer **les sources** (`editorial.sources[]`) : c'est le rôle du `source-verifier`
- ✗ Tu veux vérifier les invariants schéma / lat-lon / prompts : utilise `npm run validate` ou `npm run verify-geo`
- ✗ Tu veux générer une nouvelle carte : utilise `/generate-cards-batch` ou `/research-card-candidate` + `/normalize-card-data`

## Progression actuelle

> Snapshot mis à jour manuellement à la fin de chaque run. Source de vérité réelle : `data/_audit/_progress.json`.

- **Dernière mise à jour** : 2026-07-10T17-30-00Z
- **Cartes auditées** : **1330** (catalogue en croissance via la session parallèle). Campagne initiale 001-524 (batches 1-23) ; batches 24-26 ont audité 740-814 ; batch 27 a audité 860-884 ; batch 28 a audité les peintures 885-914 ; batch 29 a audité les sculptures 915-944 ; batch 30 a audité les guerres 945-974 ; batch 31 a audité les monuments 845-859 + 975-989 ; batch 32 a audité les personnages 990-1019 ; batch 33 a audité les inventions 1020-1049 ; batch 34 a audité les œuvres littéraires 1050-1079 ; batch 35 a audité la musique 1080-1109 ; batch 36 a audité les sciences 1110-1139 ; batch 37 a audité les catastrophes 1140-1169 ; batch 38 a audité les empires/civilisations 1170-1199 ; batch 39 a audité les traités/diplomatie 1200-1229 ; batch 40 a audité le sport 1230-1259 ; batch 41 a audité les explorations 1260-1289 ; batch 42 a audité la monnaie/finance 1290-1319 ; **batch 43** a audité la **religion 1320-1349 (relig)** ; **batch 44** a audité le nouveau batch **1350-1359** (generate-cards-batch, grands manquants cercle 1-2 : Gandhi, Tesla, Bolívar, Hippocrate, Sun Tzu, hindouisme, judaïsme, Palmyre, Ibn Khaldoun, Kubilai Khan) ; **batches 45-47** ont audité **553-630** (rattrapage post-push COMPLET : les 78 cartes 553-630 approuvées et poussées le 2026-07-06 sans audit préalable sont désormais toutes auditées).
- **Restant à auditer** : **525-552** uniquement (28 cartes déjà `approved`, poussées avant l'existence de la gate ; elles ne bloquent aucune promotion). **Plus aucune carte `reviewed` non auditée** (note : le slot dex 667, ancien « Édit de Milan » treaty, a été re-typé relig et déplacé en 1321 ; 667 est désormais vide).
- **Plus petit dexNum non audité** : **525**. Un `/audit-card-bodies` sans argument sélectionnera donc les 25 plus petits dexNum non audités à partir de 525 (cartes approuvées, ré-audit optionnel) ; pour cibler une plage, utiliser `range:A-B`.
- **Campagne du 2026-07-10 CLÔTURÉE** : rattrapage des 138 cartes `reviewed` non auditées (631-666, 668-739, 815-844) en 5 batches (48-52) — **terminé, 0 carte reviewed non auditée restante**. 13 corrections / 138 cartes (~9 %), dont 2 erreurs factuelles (665 Tapisserie de Bayeux, 818 Dürer), taux d'erreur factuelle réel ~1,4 %.
- **Batches exécutés** : 52 (001-524 + 740-814 + 845-859 + 860-884 + 885-914 + 915-944 + 945-974 + 975-989 + 990-1019 + 1020-1049 + 1050-1079 + 1080-1109 + 1110-1139 + 1140-1169 + 1170-1199 + 1200-1229 + 1230-1259 + 1260-1289 + 1290-1319 + 1320-1349 + 1350-1359 + 553-582 + 583-612 + 613-630 + 631-658 + 659-687 + 688-715 + 716-739 + 815-844)
- **Corrections appliquées sur l'historique** : 15 erreurs factuelles (needs_revision) + 133 imprécisions mineures. **Batch 52 (815-844, 3 sous-lots de 10, dernier batch du rattrapage reviewed)** : 1 correction, 1 needs_revision, 29/30 solid. 818 Autoportrait à la fourrure de Dürer « À droite figurent le monogramme A.D. et la date ; à gauche, une inscription latine » → « À gauche figurent le monogramme A.D. et la date ; à droite, une inscription latine » : côtés inversés (perspective du spectateur), la date 1500 + monogramme sont en haut à GAUCHE, l'inscription latine à DROITE / flag DIVERGENT (agent A refuted, B avait laissé passer — la divergence a forcé le spot-check), sammlung.pinakothek.de + Smarthistory, P5. Lot très propre (30 cartes, œuvres + histoire coloniale) : anti-« découverte » systématique (Cabral/Cartier/La Salle/Béring « pas les premiers », peuples déjà présents), anti-P7 (Hooke « n'invente pas le microscope », Milton « pas le vers blanc », Shakespeare « pas l'intrigue », Gobelins « la tapisserie n'y est pas inventée »), distinctions tenues (Wisselbank « banque municipale » précédée à Barcelone 1401, Nouvelle-Espagne ≠ Mexique moderne, Confédération iroquoise datation « très débattue ~1142 à XVᵉ »). Nuances laissées : 830 Uraniborg « premier bâtiment conçu spécialement » confirmé par les deux agents (qualificatif « moderne » optionnel), 834 clavecin « sans inventeur identifiable » (Hermann Poll revendiqué mais non reconnu). **Batch 51 (716-739, 2 sous-lots de 12, 4ᵉ batch du rattrapage reviewed)** : 3 corrections, 0 needs_revision, 21/24 solid. 716 Suzani « fond de coton ou de lin » → « coton ou de soie » car le lin n'est pas un support attesté du suzani (coton, parfois soie) / flag agent A, spot-check confirmé, P4 ; 735 Batik « cours royales de Yogyakarta et Surakarta aux XVIIᵉ-XIXᵉ siècles » → « cours royales de Java centrale — Mataram, puis Yogyakarta et Surakarta — entre le XVIIᵉ et le XIXᵉ siècle » car Yogyakarta/Surakarta n'existent qu'après le traité de Giyanti (1755), le XVIIᵉ étant l'ère du Mataram / flag agent B, spot-check confirmé, P1 ; 733 Synode de Whitby « ne s'achève qu'au début du VIIIᵉ siècle » → « qu'au cours du VIIIᵉ siècle » car Iona se rallie en 716 mais les Britons en 768 — la carte le documentait déjà dans ses propres warnings / flag convergent A+B, P6. ENJEU P2 (âges mythifiés) et P7 (« inventeur unique ») très maîtrisés : didgeridoo « l'idée d'un instrument vieux de 40 000 ans n'est pas étayée », danse du ventre « origines pharaoniques spéculatives et contestées », guqin « invention par Fuxi/Shennong = légende », taoïsme « date relève de l'hagiographie », cloisonné « la Chine ne crée pas cette technique », dinar fatimide « pas le premier dinar islamique », polonaise/cumbia/haka/gospel « sans fondateur ni date unique ». **Batch 50 (688-715, 3 sous-lots ≤10, 3ᵉ batch du rattrapage reviewed)** : 2 corrections, 0 needs_revision, 26/28 solid (aucun verdict refuted/disputed sur ~150 claims). 700 Caravanes transsahariennes « apogée entre le XIIᵉ et le XVIᵉ siècle, au temps du Mali et du Songhaï » → « entre le XIIIᵉ et le XVIᵉ siècle » car le XIIᵉ relève encore du Ghana (Mali fondé ~1235) / flag convergent A+B, Encyclopedia.com, P6 — la fenêtre de jeu 700-1600 n'est pas touchée, seule la mention d'apogée du body ; 713 Conférence de Berlin « Son Acte général entérine la possession par Léopold II du futur État indépendant du Congo » → « En marge de la conférence, les puissances reconnaissent à Léopold II… » car l'Acte général n'établit que le libre-échange/libre navigation du bassin du Congo, la reconnaissance de l'EIC passant par des accords bilatéraux (« side agreements ») / flag convergent A+B, archive du ministère allemand des Affaires étrangères, P7. ENJEU P7 (« inventeur/premier ») très maîtrisé sur un lot dense en arts décoratifs et traditions vivantes : émaux de Limoges/verre de Murano/orfèvrerie quimbaya/jade de Liangzhu « portés au sommet sans être inventés », cuju « plus ancienne forme *attestée* sans filiation avec le football moderne », claquettes/hula/kathakali/bharatanatyam « sans inventeur ni date unique » (filiations anciennes revendiquées et *partielles*). Nuances laissées (déjà modalisées) : 698 Quimbaya datation « discutée », 707 Igbo-Ukwu redatation minoritaire, 714 Béring scorbut « cause contestée », 705 lion « pas natif de Chine ». **Batch 49 (659-687, 667 vide, 3 sous-lots ≤10, 2ᵉ batch du rattrapage reviewed)** : 4 corrections dont 1 needs_revision (665 Tapisserie de Bayeux « jusqu'à la bataille de Hastings et au couronnement de Guillaume » → « la broderie conservée s'achève sur la déroute anglaise à Hastings, sa fin — montrant probablement le couronnement — étant aujourd'hui perdue » : la tapisserie SURVIVANTE ne montre pas le couronnement, la section finale est perdue / flag convergent A refuted + B nuanced, Britannica + Reading Museum + Smithsonian, P5) ; 3 minor_issues (662 Séisme d'Antioche suppression de « Procope de Césarée en compte plutôt 50 000 » → « au regard de la population de la cité » car attribution du chiffre à Procope contestée — FR-wiki 50 000 vs EN-wiki ~300 000 + confusion Procope de Césarée/Procope de Gaza / flag convergent, P5 ; 670 Trésor de l'Oxus « quelque 200 monnaies » → « environ 1 500 monnaies d'or, aujourd'hui écartées du lot » car « 200 » non sourcé, la littérature parle de ~1 500 rattachées puis écartées / flag convergent A+B, worldhistory.org, P5 — note interne « ne jamais écrire 1 500 » corrigée : les 1 500 sont à présenter comme EXCLUES ; 684 Projection de Mercator « de la fin du XVIIᵉ au XVIIIᵉ siècle » → « au cours du XVIIIᵉ siècle » car adoption pleine au XVIIIᵉ post-chronomètre / flag convergent A+B, P6), 24/28 solid. **Faux positif écarté** : 659 Maloya (mention « couplets maloya » en 1832 selon un blog WordPress non institutionnel — non corrigé, l'attestation publique documentée reste 1930/Fourcade). Nuances laissées : 682 Bologne « Irnerius à tort fondateur » (défendable, unibo.it le crédite mais pas de fondateur unique), 679 Chalcédoine « 500-600 évêques » (fourchette encadre ~520). ENJEU P2/P7 (domestications, émergences, « premiers ») très maîtrisé : mouton/olivier/cuivre/soie origine unique/multiple modalisée, Jikji « plus ancien *subsistant* », VOC « souvent considérée comme la première » (EIC 1600 créditée), Bologne « plus ancienne *du monde occidental en activité continue* » (al-Qarawiyyin/al-Azhar plus anciennes), Antioche Justin Iᵉʳ (pas Justinien). **Batch 48 (631-658, 3 sous-lots ≤13, premier batch du rattrapage des 138 cartes `reviewed` non auditées)** : 3 corrections (634 Kumbh Mela « Des rassemblements de bain à Prayag sont attestés dès le VIIᵉ siècle (récit de Xuanzang, v. 644) » → « Xuanzang décrit vers 644 un grand rassemblement à la confluence de Prayag, mais y voir un précurseur du festival reste débattu : le cycle qu'il rapporte est quinquennal, et la célébration peut-être bouddhique » car Britannica écrit « possibly contains a reference » et Maclean objecte le cycle de 5 ans + le caractère bouddhique de la fête de Harsha / flag convergent A+B, P2, FR+EN ; 636 Shaanxi retrait du « selon Wikipedia » du texte joueur — attribution déplacée en `editorial.notes`, le fait yaodong restant mono-source, aucune source institutionnelle du corpus ne le nommant / défaut éditorial, FR+EN ; 646 Villena « — onze bols, trois bouteilles et vingt-huit bracelets — » → « — dont onze bols… » car 11+3+28=42 ≠ 59, l'apposition se lisait comme exhaustive / P5), 0 needs_revision, **28/28 solid par les DEUX auditeurs, aucun verdict `refuted`/`disputed`/`not_found` sur ~160 claims** — le batch le plus propre depuis le 32. **4 faux positifs écartés au spot-check**, dont 2 parce que la carte documentait déjà son choix dans `editorial.warnings` (invisible aux agents, qui n'ont pas le droit de lire `data/cards/`) : 647 Phaistos « 241 signes » = chiffre du musée d'Héraklion qui conserve l'objet (ambiguïté 241/242 déjà notée) ; 648 Ératosthène « compensation d'approximations » sourcé sur Paturle, Revue d'histoire des sciences 2024 ; 651 capitulations « concession unilatérale » confirmé par encyclopedia.com (privilèges expirant à la mort du sultan) ; 653 Jantar Mantar « 1720-1738 / 19 instruments / >20 m / ~2 s » intégralement confirmé par le portail UNESCO Astronomical Heritage. 655 Wari (« déclin dès 800 ») laissé sans correction : WHE écrit « The city seems to have been abandoned c. 800 CE ». ENJEU P5/P6 déjà maîtrisé en amont : 636 les 830 000 présentés comme réduction du recensement hukou (morts directes + décès différés + migrations), 645 Sulawesi redatations 2024 exactes (Karampuang ≥ 51 200, Bulu' Sipong 4 ≥ 50 200 vs 43 900 en 2019), 637 Deccan « estimations, faute de comptabilité fiable ». ENJEU P7 tenu : 638 chao « premier papier-monnaie *dominant* » (jiaozi song antérieur), 658 highlife « sans inventeur ni date de naissance unique », 657 marimba « origine débattue », 654 Yixing « l'innovation ne tient ni au thé ni à la théière, mais au matériau », 652 Behzad « sans en être l'inventeur », 653 Jai Singh II « monumentalise » des instruments connus. **Batch 47 (613-630, dernier tiers du rattrapage post-push, corrections FR+EN)** : 2 corrections (625 Vénus de Lespugue « vers 25 000 av. J.-C. (entre 26 000 et 24 000 AP) » → « vers 26 000-24 000 av. J.-C. » car incohérence d'unités AP/av. J.-C. / A, P6 ; 629 Tabla « première moitié du XVIIIᵉ siècle » → « au cours du XVIIIᵉ siècle » car des sources situent l'assemblage au milieu/fin du siècle / B, P6), 0 needs_revision, 16/18 solid. **Clôture du rattrapage post-push : les 78 cartes 553-630 (poussées le 2026-07-06 sans audit) sont intégralement auditées via les batches 45-47 — 0 erreur grave, 9 imprécisions corrigées FR+EN (561, 563, 581, 594, 596, 598, 606, 625, 629).** **Batch 46 (583-612, rattrapage post-push, corrections FR+EN)** : 4 corrections (594 Teotihuacan « incendié vers 550 » → « entre le milieu du VIᵉ et le milieu du VIIᵉ siècle (~550 à ~650) » car EBSCO date la conflagration à 650 / convergent A+B, P6 ; 596 Valse « en fixent vers 1820 le style » → « dans les années 1820 » car Strauss père n'a d'orchestre qu'en 1825 / convergent A+B, P6 ; 598 Fado « émergence des années 1830 attribuée à Maria Severa » → « popularisation dans les années 1830-1840 associée à Maria Severa (1820-1846) » car elle chante dans les 1840s / A, P6 ; 606 Montgolfière « s'élève à environ 1 000 m » → « entre 1 600 et 2 000 m » d'après Britannica / A, P5), 0 needs_revision, 26/30 solid. Batch bien hedgé (émergences de genres musicaux/danses, effondrements civilisationnels, préhistoire — modalisateurs systématiques). **Batch 45 (553-582, rattrapage post-push des 78 cartes approuvées le 2026-07-06)** : 3 corrections (561 Concile de Constance « dressait depuis 1378 trois prétendants » → « deux obédiences rivales (Rome et Avignon), puis trois après le concile de Pise (1409) » — le 3ᵉ prétendant naît de Pise, pas de 1378 / flag convergent A+B, P6 ; 563 Kerma « de la 1ʳᵉ à la 5ᵉ cataracte » → « de la 2ᵉ jusqu'au-delà de la 4ᵉ — estimations maximales 1ʳᵉ-5ᵉ » + fin « vers 1450 » → « vers 1500-1450 » d'après l'ISAC Chicago / P5-P6 ; 581 Astrolabe « plus ancien traité conservé = Théon » → traité de Théon PERDU, plus ancien conservé = Jean Philopon VIᵉ s. + attribution « selon les traditions à Ptolémée ou à Hipparque » + « plus ancien astrolabe daté conservé » (abbassides antérieurs non datés) / flag convergent A+B needs_revision, P4-P7), 0 needs_revision final, 27/30 solid par les DEUX auditeurs. 2 défendables laissés sans correction : 565 Gilgamesh « XIVᵉ-XIᵉ s. » (englobe le cadrage usuel XIIIᵉ-XIᵉ), 582 Oyo apogée « 1650-1750 » (cadrage Britannica). Bodies de ce lot déjà très hedgés (musiques de tradition, religions, polities antiques) — datations débattues systématiquement modalisées. **Batch 44 (1350-1359, generate-cards-batch — Gandhi, Tesla, Bolívar, Hippocrate, Sun Tzu, hindouisme, judaïsme, Palmyre, Ibn Khaldoun, Kubilai Khan)** : 1 correction (Hippocrate 1353 « son existence attestée **de son vivant** par Platon **et Aristote** » → « son contemporain Platon le mentionne, et Aristote le cite après lui » — Aristote né ~384 av. J.-C. n'avait ~14 ans à la mort d'Hippocrate ~370 et le cite dans des œuvres postérieures ; seul Platon ~428-348 est contemporain / flag agent A, P5-P6), 0 needs_revision, 10/10 solid par les DEUX auditeurs. ENJEU P2/P7 (émergences religieuses & attributions) très maîtrisé : hindouisme & judaïsme « ni fondateur ni date de fondation » + modalisateurs (« selon les sources », fourchettes), migration indo-aryenne « hypothèse dominante mais débattue » (invasion aryenne rejetée), Moïse/Exode « historicité débattue » et « selon la tradition », judaïsme « l'une des plus anciennes » (jamais « première » monothéiste), Sun Tzu « existence même débattue » + « Considéré comme le plus ancien traité connu », Tesla « n'invente pas le courant alternatif » (Ferraris + Westinghouse crédités / P7), Kubilai « achève » (n'entame pas) la conquête Song & hérite l'Empire mongol de Gengis (P7), Bolívar indépendance collective (« l'un des principaux chefs »), Palmyre « Empire de Palmyre » = étiquette moderne + Zénobie héritière d'Odénat. Faux positif écarté au spot-check : Palmyre C1 « plaque tournante dès le Iᵉʳ s. av. J.-C. » (B nuancé) — body déjà correct (essor Iᵉʳ s. av. J.-C. → apogée sous Rome), aucune correction. **Batch 43 (1320-1349, religion, relig)** : 1 correction (Pénitence de Canossa « l'empereur Henri IV » → « le roi Henri IV » dans blurb + body car en 1077 Henri IV est roi des Romains, sacré empereur seulement en 1084 — flag convergent A+B/P1), 0 needs_revision, 30/30 solid par les DEUX auditeurs. ENJEU NEUTRALITÉ confessionnelle exemplaire (validé A ET B) : révélation du Coran « selon la tradition islamique », apparitions de Lourdes/Guadalupe/Fátima « rapporte »/« selon la tradition »/« se serait imprimée » (aucune affirmation de surnaturel), mormonisme « affirme avoir traduit », confucianisme en réserve descriptive — islam/judaïsme/christianisme/confucianisme à égalité. ENJEU P2 (historicité débattue) : Exode hors d'Égypte « selon le récit biblique »/« mythe fondateur », catharisme « Église cathare » débattue (Pegg/Moore), éveil & 1er sermon du Bouddha datation ~528 vs ~400 av. J.-C., conversion de Paul 31-36. ENJEU P7 (fondation≠invention) : Benoît « codifie » le monachisme, cisterciens « loin d'inventer », Ashoka « propage ne fonde pas » le bouddhisme, hajj « réorganise un pèlerinage préislamique ». ENJEU P1 : édit de Milan (313 tolérance) ≠ Thessalonique (380 religion d'État), Vatican I ≠ Vatican II, Avignon « pas encore terre française ». DOUBLONS cross-type résolus AVANT audit (le scan initial relig-only les avait ratés) : 3 remplacements (Thèses de Luther→Concile de Latran IV, Schisme d'Orient→Cisterciens, Diète de Worms→Grand Réveil) ; Édit de Milan relig (1321) a écrasé l'ancien treaty 667 (non restaurable, gap assumé). 1344 Armée du Salut « Christian Mission » laissé (mono-agent A, défendable). **Batch 42 (1290-1319, monnaie/finance, money)** : 2 corrections (Riksbank « rebaptisée Sveriges Riksbank en 1867 » → « en 1866-1867 » car les sources divergent — Wikipedia 1866 vs page officielle 1867, date-réponse 1668 inchangée/P6 ; panique de 1907 « Knickerbocker Trust Company, deuxième trust du pays » → « l'un des plus grands trusts du pays » car discordance de périmètre — NY Fed « 2e du pays » vs Wikipedia/EH.net « 3e de New York »/P5), 0 needs_revision, 30/30 solid par les DEUX auditeurs. ENJEU P5/P6 (chiffres financiers précis) maîtrisé : Lundi noir (−508 pts/−22,6 %), Lehman (639 Md$), South Sea (128→~1000→~100 £), Fugger (543 000/~850 000 florins 1519), dot-com (Nasdaq 5048,62), Barings (~827 M£/~1,4 Md$, rachat 1 £), pengő (billet 10²⁰ « émis »). ENJEU P7 (« premier/inventeur/le plus ancien ») désamorcé partout : Bitcoin « première crypto *décentralisée* », Diners Club « première carte *multi-enseignes* » (BankAmericard 1958), DAB paternité disputée, Médicis « perfectionnent sans inventer » la partie double, Riksbank « plus ancienne *encore en activité* » (BoE 1694), Royal Exchange « première bourse *d'Angleterre* », penny d'Offa « réformé sans inventer », lettre de change « diffusée » (origine italienne). NEUTRALITÉ crises récentes (Lehman, Lundi noir, dot-com, Zimbabwe) validée A ET B (chiffres modalisés, pas de jugement). Bitcoin = lieu abstrait WHEN-only (geoKind abstract, eligibleForWhere false). 1 correction géo pré-audit (pengő hongrois R1→R2, Budapest, mismatch bloquant à l'approbation évité). 4 warnings placeKind-verb-coherence non bloquants (fondée/émis/inauguré sur creation_place, par design). **Batch 41 (1260-1289, explorations, explor)** : 5 corrections (Everest « à la veille du couronnement » → « le matin même » /P6 ; Scott séquence des décès précisée Evans-Oates-puis trois derniers /P5-P6 ; Slocum récit 1899 → 1900 /P6 ; Byrd « radio » Harold June → « copilote-radio » /P5 ; Bellingshausen Palmer « jours ou semaines » → « plus tard dans l'année 1820 » /P6), 0 needs_revision, 30/30 solid par les DEUX auditeurs. ENJEU P7 (claims « premier ») maîtrisé : Lindbergh « premier en solitaire » (Alcock & Brown 1919 premier sans escale), Viking 1 « premier atterrissage pleinement réussi » (vs Mars 3 1971), passage du Nord-Ouest, Annapurna « premier 8000 ». ENJEU P2 (revendications débattues) : pôle Nord de Peary « jamais prouvé » + Cook 1908 + Norge 1926, Kon-Tiki thèse rejetée, Speke/Burton, Bellingshausen antériorité débattue. Neutralité non-eurocentrique validée A ET B : Burke & Wills (Yandruwandha), Machu Picchu (site non « perdu » localement, Lizárraga 1902), source du Nil (« 1re identification européenne »). 10 cartes polaires/spatiales en tap orphelin (R10/R8, snap null, documenté). **Batch 40 (1230-1259, sport)** : 2 corrections (Coupe de l'America « Coupe des Cent Guinées » → « la « £100 Cup », souvent surnommée « Coupe des Cent Guinées » » car le trophée officiel était la £100 Cup, 100 guinées = 105 £/P4 ; water-polo « premier match international à Londres en 1890 » → « entre l'Angleterre et l'Écosse en 1890 » (lieu londonien non confirmé) + « premier sport collectif olympique » → « l'un des premiers » (statut 1900 discuté)/P5-P2), 0 needs_revision, 30/30 solid par les DEUX auditeurs. ENJEU P7 (codification ≠ invention, claims « premier ») remarquablement maîtrisé : football « pas inventé ce jour-là », rugby « ne naît pas en 1871 » + mythe William Webb Ellis signalé (récit tardif de 1876), Wingfield adapte le jeu de paume, golf interdit dès 1457, hockey « codification plutôt qu'invention », Jahn « fonde plutôt qu'invente », BAA(1946)→NBA(1949), « Super Bowl I » nommé a posteriori, échecs titre officiel 1886 vs maîtrise informelle. Neutralité snooker (Inde britannique) validée. 1 faux positif laissé (badminton « Bath ~1877 » : mono-agent, body hedge « vers », date couramment citée). 7 warnings placeKind-verb-coherence non bloquants (verbe « né »/« codifié » sur creation_place, par design). **Batch 39 (1200-1229, traités/diplomatie, treaty)** : 2 corrections (Congrès de Vienne « confédération d'une trentaine d'États » → « de trente-neuf États » car le Deutscher Bund comptait 39 membres, la source Herodote de la carte le confirmait/P5 ; Accord de Paris climat « près de 196 parties (195 États + UE) » → « 195 parties » car la CCNUCC indique « adopted by 195 Parties », l'UE étant l'une des 195/P5), 0 needs_revision, 30/30 solid par les DEUX auditeurs. ENJEU NEUTRALITÉ (traités de mémoire vive) validé par A ET B : Munich (apaisement factuel, anti-P3), pacte germano-soviétique (protocole secret attesté, reconnu 1989), Trianon (pertes hongroises sans pathos), Dayton (Bosnie, aucune attribution unilatérale), Camp David (israélo-arabe, sans prise de parti), Nankin/Shimonoseki (« siècle des humiliations » attribué à l'historiographie chinoise), Sèvres (partage ottoman neutre). Distinctions tenues : armistice de Rethondes ≠ traité de paix, Potsdam≠Téhéran≠Yalta, Congrès de Berlin 1878≠Conférence de Berlin 1884-85, Sèvres→remplacé par Lausanne 1923. **Batch 38 (1170-1199, empires/civilisations, polity)** : 1 correction (Empire britannique « possessions lancées par le Royaume-Uni » au XVIᵉ s. → « par l'Angleterre » car le Royaume-Uni de Grande-Bretagne n'existe qu'à partir de l'Union de 1707, Terre-Neuve 1583 = couronne d'Angleterre/P1), 0 needs_revision, 29/30 solid (les 30 cartes `solid` par les DEUX auditeurs). ENJEU P1 (anachronisme sur entités multi-séculaires) maîtrisé : carolingien « préfigure le Saint-Empire sans en être l'acte de naissance », Byzantins « se disaient Romains, *byzantin* usage moderne », maya « réseau de cités-États non empire unifié », démocratie athénienne « directe et restreinte ». ENJEU NEUTRALITÉ (empires coloniaux) validé par A ET B : traite atlantique sobre, conquête des Amériques en co-action (armes + alliés indigènes + variole), bilans mongol/Taiping « débattus » en fourchette. 1 faux positif évité (Mansa Moussa « r. 1312-1337 » : B citait Britannica « 1307 or 1312 » mais le spot-check WHE — source de la carte — confirme 1312, body conforme à sa source). Distinctions tenues (Rome 476 ≠ Byzance 1453, Code Hammurabi ≠ néo-babylonien, Angkor Vat monument ≠ empire khmer, Mali ≠ Ghana ≠ Songhaï). **Batch 37 (1140-1169, catastrophes)** : 3 corrections (Nevado del Ruiz « 23 000 morts sur 29 000 habitants » → bilan total ~23 000 distingué de la population d'Armero/P5, Messine borne haute « plus de 100 000 » → « 120 000 »/P5, incendie de Chicago « plus de 100 000 sans-abri » → « près de 100 000 »/P5), 0 needs_revision, 27/30 solid. ENJEU NEUTRALITÉ sur sujets sensibles RÉUSSI : grande famine chinoise (fourchette de démographes ~15-55 M attribuée, distincte du Holodomor) et COVID-19 (origine « premiers cas signalés à Wuhan », bilan OMS ~7 M/~14,9 M surmortalité attribué, sans prise de position) validés solid par les DEUX auditeurs. Bilans disputés modalisés partout (Haïti, Tangshan, Mexico, smog Londres) ; cause Hindenburg laissée débattue ; Tōhoku≠Fukushima, Three Mile Island≠Tchernobyl, peste de Marseille≠peste noire. **Batch 36 (1110-1139, sciences)** : 3 corrections (théorie de l'information blurb « invente le bit » → « popularise le bit » car le terme est de Tukey/P7, Big Bang fond diffus « Gamow et Alpher » → « Alpher et Herman 1948 »/P7, effet de serre « environ 5 °C » → « 5 à 6 °C » pour l'estimation d'Arrhenius 1896/P5), 0 needs_revision, 27/30 solid. Risque P7 (sur-attribution à un découvreur unique) remarquablement maîtrisé : Meitner créditée (fission), Jocelyn Bell créditée (pulsars), Newton+Leibniz (calcul), découverte multiple (conservation énergie) ; distinctions explicites (germes≠Leeuwenhoek, radioactivité≠radium/Curie, Jenner≠vaccin rage, Dalton « n'invente pas l'atome », Dolly « 1er clone d'une cellule adulte »). 3 warnings placeKind-verb-coherence non bloquants arbitrés (1116 « détectées », 1121 « démontrée », 1133 « mesurée »). **Batch 35 (1080-1109, musique)** : 1 correction (Symphonie n°40 de Mozart « Aucune création publique attestée du vivant de Mozart » → modalisé car la recherche récente — Jonášová/Zaslaw — rend une exécution probable/P2), 29/30 solid. Les 10 cartes de genre 20/20 solid (risque P7 « inventeur unique » bien maîtrisé : hip-hop date symbolique 1973, punk origine transatlantique débattue, salsa racines son cubain). Œuvres : lieu de création ≠ cadre de l'intrigue (Carmen créé à Paris pas Séville, Nouveau Monde à New York), Rhapsody in Blue orchestrée par Grofé, Toccata BWV 565 & Canon de Pachelbel datation/attribution débattues bien modalisées. **Batch 34 (1050-1079, œuvres littéraires)** : 1 correction (Candide « une quinzaine d'éditions » → « au moins dix-sept éditions » en 1759 d'après la BnF/P5), 0 needs_revision, 29/30 solid. Risque dominant des cartes `text` (confondre lieu d'intrigue et lieu de publication) bien maîtrisé : Ulysse publié à Paris (pas Dublin), Cent ans de solitude à Buenos Aires (pas Colombie/Mexique), Divine Comédie achevée à Ravenne (exil), Roméo écrite à Londres, Candide à Genève, Frankenstein à Londres, Métamorphose à Leipzig. Titre « 1984 » non-spoiler (pub 1949). **Batch 33 (1020-1049, inventions)** : 3 corrections (pilule contraceptive « noréthistérone de Djerassi » → « noréthynodrel de Colton » car Enovid utilisait ce composé/P7, télescope « inaugurant l'astronomie » → « popularisant » car Harriot observa aussi en 1609/P7, phonographe « surprend par sa fidélité » → « stupéfie par le seul fait de rejouer une voix » car la feuille d'étain rendait un son grossier/P5), 0 needs_revision. Risque P7 (sur-attribution à un inventeur unique) bien maîtrisé partout ailleurs (lunettes : mythe Salvino signalé ; radio : paternité disputée Marconi/Tesla ; etc.). 2 notes hors périmètre (quote source 1022, placeCanonicalName « Menlo Park » sans État sur 1029/1038 → géocodage advisoire trompé par l'homonyme californien). **Batch 32 (990-1019, personnages)** : 0 correction de body, 30/30 solid — batch le plus propre à ce jour (pièges P1-P7 tous évités : Marc Aurèle né à Rome pas en Espagne, Einstein Nobel 1921 = effet photoélectrique, Galilée perfectionne la lunette, Darwin/Wallace, Picasso/Braque, MLK collectif, Marie Curie = Varsovie/R2, datations Julien/Grégorien Newton & Washington). 2 notes hors périmètre non corrigées (factNotes da Vinci julien/grégorien erroné, quote Picasso « 1909 » pour Les Demoiselles — toutes deux invisibles côté joueur). **Batch 31 (845-859 + 975-989, monuments)** : 5 corrections (Tour de Londres « pierre de Caen » → moellons de calcaire de Kent/P4-P5, Tour de Pise « troisième étage » → « premiers étages »/P5-P6, Temple d'Or 750 kg découplé de 1830/P5, Opéra de Sydney « lauréat 1956 » → « 1957 »/P5-P6, Burj Khalifa « depuis lors » → « à ce jour »/P2), 0 needs_revision, 2 faux positifs évités (Chichén Itzá arithmétique des 365 marches correcte, Panthéon attribution hadrianique conventionnelle). **Batch 30 (945-974, guerres)** : 4 corrections (Pavie citation « que l'honneur et la vie qui est sauve »/P5, Marne taxis « quelques milliers »/P5, Bataille d'Angleterre pertes en fourchette ~800-1700/~1300-2000/P5, Saïgon « complexe du DAO puis ambassade »/P5-P3), 0 needs_revision, 1 faux positif évité (Teutobourg numéros de légions jamais réattribués confirmé). **Batch 29 (915-944, sculptures)** : 1 correction (Enlèvement des Sabines « pour Francesco I » → « sans commande ni sujet imposé »/P7), 0 needs_revision. **Batch 28 (885-914, peintures)** : 6 corrections (Radeau « treize jours »/P5, Dalí Einstein nuancé/P2, American Gothic « longtemps évasif »/P2, Grande Jatte « pionnier, Signac théorisera »/P7, Laitière « vers 1660 »/P6, Grande Odalisque signature généralisée/P5), 0 needs_revision.

## Arguments

Convention identique à `generate-cards-batch` — un seul argument optionnel passé en string :

| Invocation | Effet |
|---|---|
| `/audit-card-bodies` | Audit les **25 prochaines** cartes (N par défaut = 25), sélectionnées comme les plus petits `dexNum` du catalogue absents de `_progress.json#/auditedDexNums`. |
| `/audit-card-bodies 30` | Override de N : audit les **30 prochaines** cartes. Plafond dur à 30 ; au-delà de 13 cartes, le dispatch des fact-checkers est **chunké** en sous-lots de ≤ 13 cartes par paire d'agents (cf. cas particuliers). |
| `/audit-card-bodies range:101-110` | Audit explicite d'une plage de dexNum (override de l'état). Utile pour re-auditer après modification ou pour cibler un cercle précis. |
| `/audit-card-bodies range:055` | Audit explicite d'une seule carte (range avec une seule valeur). |

## Étapes

### 1. Lire l'état d'audit

```typescript
// Pseudocode
const progress = JSON.parse(Read("data/_audit/_progress.json"))
const auditedSet = new Set(progress.auditedDexNums)
```

- Si argument vide ou numérique : sélectionner les **N plus petits dexNums** du catalogue (`data/cards/*.json`) **absents** de `auditedSet`. N défaut = 25, override par l'argument.
- Si argument `range:<A>-<B>` : sélectionner toutes les cartes dont `dexNum` est dans la plage `[A..B]` qui existent dans `data/cards/`. Ne pas filtrer par `auditedSet` (l'argument range autorise la ré-audit).
- Si argument `range:<X>` : sélectionner uniquement la carte de dexNum `X`.
- Si aucune carte sélectionnable : message « catalogue intégralement audité au-delà de `<plus_grand_dexNum>`. Utilise `range:A-B` pour re-auditer une plage. » et STOP.

### 2. Extraire bodies + claims (Explore agent)

Invoque un sub-agent `Explore` pour produire un récap structuré de chaque carte sélectionnée :

```
## [dexNum] Title — status
- pivotYear: X (range si periodique : S–E)
- lieu: NAME (lat, lon)
- body: "..." (VERBATIM, non tronqué)
```

Le prompt de l'agent doit lister explicitement les dexNums à extraire (pas une plage — donne la liste exacte que tu viens de calculer en étape 1) et insister sur « body verbatim, ne pas tronquer ».

### 3. Construire la liste de claims (toi, pas un agent)

Pour chaque body, identifie **5-10 affirmations factuelles testables** : dates, nombres,
noms propres, attributions, lieux, séquences causales. Numérote-les C1, C2, …

Exemple sur un body type « bataille » :
- C1: Date exacte (`14 octobre 1066`)
- C2: Lieu précis (`à 11 km au nord-ouest de Hastings`)
- C3: Acteurs nommés (`Guillaume le Conquérant` vs `Harold Godwinson`)
- C4: Conséquence directe nommée (`couronnement à Westminster, Noël 1066`)
- …

Cette extraction est **manuelle** parce qu'elle exige une lecture sémantique — un agent fait moins bien sur la sélection des claims réellement testables.

### 4. Dispatch parallèle de fact-checkers (background)

Invoque **2 sub-agents `general-purpose` en parallèle, en mode `run_in_background: true`**, avec le **même prompt** et des fichiers de sortie différents :

- Agent A → `data/_audit/agent-a-<min>-<max>.md` (où `<min>` et `<max>` sont les dexNums extrêmes du batch courant)
- Agent B → `data/_audit/agent-b-<min>-<max>.md`

> **Chunking au-delà de 13 cartes** : un fact-checker perd en qualité YAML quand il doit vérifier
> beaucoup de cartes d'affilée (faux flags ~40 % vus sur les batches 1 et 4 à 20 cartes). Quand le
> batch courant dépasse **13 cartes**, découpe-le en sous-lots de ≤ 13 cartes et dispatch **une paire
> A/B par sous-lot** (donc 4 agents pour 14-26 cartes, 6 pour 27-39…), avec des fichiers de sortie
> suffixés par la plage du sous-lot (`agent-a-101-113.md`, `agent-a-114-125.md`…). La synthèse (étape 5)
> agrège tous les sous-lots dans un seul rapport `<min>-<max>` global.

#### Template de prompt pour chaque agent

```
You are **Fact-Check Agent <A|B>** for a French history-card catalog audit.
<Pour B :> Work independently — Agent A is doing the same in parallel. Do NOT try to read A's output.

# Mission

For each of the N cards below, verify the factual claims in `body` against independent web sources.
Verdict per claim from this fixed vocabulary: `confirmed` | `nuanced` | `disputed` | `refuted` | `not_found`.
Cite ONE source URL with a quote ≤ 200 chars. Add a 1-sentence note.
Then `overall_verdict` per card: `solid` | `minor_issues` | `needs_revision` | `unreliable`.

# Source policy (HARD RULES)

- **Wikipedia is NOT acceptable as the sole source for a `confirmed` verdict.** Drop to `nuanced` or `not_found` if Wikipedia-only.
- Prefer institutional: museums, university presses, UNESCO, UN, Britannica, Larousse, national libraries, archives, journals.
- URL must be a real page you fetched. Quote verbatim (translate from English with `[translated]` prefix).
- Do NOT read any local file under `data/cards/` — work strictly from the body text I give you.

# Output

Write report to **`data/_audit/agent-<A|B>-<min>-<max>.md`** as a single Markdown file containing N YAML blocks separated by `---`:

```yaml
dexNum: "<dexNum>"
title: "<title>"
claims:
  - id: C1
    text: "<claim>"
    verdict: confirmed
    source: "https://..."
    quote: "..."
    note: "..."
overall_verdict: solid
```

After writing the file, return a SHORT (≤ 100 words) summary of cards flagged as `needs_revision` or `unreliable` with one-line reasons. Don't paste back the YAML.

# The N cards to verify

<Liste : pour chaque carte, dexNum + title + body verbatim + claims C1-Cn>
```

Le harness re-invoquera le skill dès que chaque agent finit. Attends les **deux** notifications avant de passer à l'étape 5 (un seul fichier YAML ne suffit pas).

### 5. Synthèse A vs B

Lis les 2 fichiers YAML produits. Construis mentalement une table par carte :

| dexNum | verdict A | verdict B | claims divergents | action |
|---|---|---|---|---|
| 101 | solid | solid | aucun | OK |
| 102 | minor_issues | minor_issues | C3 (nuanced/nuanced) | spot-check C3 |
| 103 | needs_revision | minor_issues | C1 (refuted/nuanced) | spot-check C1 |
| 104 | solid | minor_issues | C5 (confirmed/nuanced) | spot-check C5 |

**Règles de flag pour étape 6 (spot-check) :**
- Convergence sur `refuted` ou `disputed` → spot-check obligatoire (très probable correction)
- Divergence A/B sur un claim (intensité différente) → spot-check obligatoire
- Au moins un agent donne `needs_revision` ou `unreliable` à la carte entière → spot-check obligatoire
- Convergence sur `confirmed` ou `nuanced` mineur sur des claims peu structurants → pas de spot-check (OK direct)

### 6. Spot-check humain (WebFetch)

Pour chaque claim flaggé, fais un **WebFetch direct** sur la source la plus institutionnelle citée par les agents (préférer Britannica > UNESCO > université > Wikipedia). Pose une question ciblée :

```
WebFetch(
  url: "<URL>",
  prompt: "<Question factuelle précise sur le claim — ex. 'When was X founded? Quote the date.'>"
)
```

Conclusion possible :
- **Spot-check CONFIRME** que les agents ont raison → correction à appliquer à l'étape 7
- **Spot-check INFIRME** (faux positif d'agent — cas Cueva de las Manos batch 1) → **ne PAS appliquer la correction**, mentionner le faux positif dans le rapport

⚠️ Ce filet est non négociable : c'est ce qui a évité l'erreur Cueva de las Manos (829 mains gauches lu comme total alors que >2000 est le bon chiffre).

### 7. Application automatique des corrections

Pour chaque carte dont au moins une correction est validée par le spot-check :

1. `Read` le fichier `data/cards/<slug>.json` (trouver le slug via le `dexNum`)
2. `Edit` `display.locales.fr.body` : remplacer le fragment erroné par la version corrigée
   - Préférer un phrasage **prudent** (modalisateurs « selon », « probablement », fourchettes) plutôt qu'un remplacement sec
   - Si le body devient `> 800 chars` (cf. cas Songhaï batch 4), raccourcir en supprimant les redondances avant ré-essai
3. `Edit` `editorial.notes` : ajouter en **première position** une entrée datée et patternée :
   ```
   "Body révisé YYYY-MM-DD (honesty-audit cards <min>-<max>) : « <ancien fragment> » → « <nouveau fragment> ». Source : <URL spot-check>. Pattern : <P1-P7 cf. .claude/rules/common-historical-errors.md>."
   ```
4. `Edit` `editorial.contentVersion` : `++` (incrément de 1)

Après toutes les éditions, lance **`npm run validate`** via Bash :
- ✓ Si vert (0 erreurs, warnings tolérés) : continuer vers l'étape 8
- ✗ Si erreur de longueur body sur une carte → reformuler plus court, ré-Edit, ré-validate
- ✗ Si erreur d'invariant non-corrigeable par reformulation → arrêter, sauvegarder l'état partiel, demander arbitrage humain

### 8. Mise à jour de l'état + livraison

#### 8a. Mettre à jour `data/_audit/_progress.json`

- Étendre `auditedDexNums` avec les nouveaux dexNums (dédupliquer)
- Ajouter une entrée dans `batches[]` :
  ```json
  {
    "label": "batch N — <description>",
    "dexNums": [<liste>],
    "reportPath": "reports/honesty-audit-cards-<min>-<max>-<ts>.md",
    "auditedAt": "<ISO timestamp>",
    "needsRevision": <int>,
    "minorIssues": <int>,
    "solid": <int>
  }
  ```
- Mettre à jour `lastAuditedAt`, `totalCardsAudited`, `totalBatches`, et accumuler `cumulativeCorrections`

#### 8b. Mettre à jour la section « Progression actuelle » du présent SKILL.md

Auto-éditer ce fichier (`.claude/skills/audit-card-bodies/SKILL.md`) via `Edit` pour rafraîchir le cursor inscrit en dur :

- `Dernière mise à jour` : nouveau timestamp
- `Cartes auditées` : nouveau total
- `Plus petit dexNum non audité` : recalculer
- `Batches exécutés` : `+1`
- `Corrections appliquées sur l'historique` : accumulation

Faire **un seul Edit avec `replace_all: false`** sur le bloc de la section « Progression actuelle » pour minimiser le risque de toucher au reste du fichier.

#### 8c. Écrire le rapport Markdown

Crée `reports/honesty-audit-cards-<min>-<max>-<ISO-ts>.md` selon le format **identique** aux rapports manuels (cf. exemples dans `reports/honesty-audit-cards-*.md`) :

1. **Header** : date, périmètre (dexNums + status approved/reviewed), méthode (2 agents indépendants, spot-check), pointeurs vers `data/_audit/agent-a-*.md` et `agent-b-*.md`
2. **TL;DR** : table récap (catégorie / nb / cartes)
3. **Évolution des batches** : ajouter la nouvelle ligne au tableau historique (`batch N : taux X %`)
4. **Cartes corrigées (needs_revision)** : pour chacune, body avant/après + justification + source + pattern
5. **Cartes corrigées (minor_issues)** : table compacte (dexNum / problème / reformulation appliquée)
6. **Cartes solides** : liste compacte
7. **Tableau A vs B** : verdicts par carte + spot-check fait/non fait + verdict final
8. **Recommandations** : généralement « aucune action restante » puisque corrections appliquées

#### 8d. Résumé chat

Présente à l'utilisateur :
- Le verdict global (X/N cartes corrigées)
- La liste des corrections appliquées (avec dexNum + résumé en une ligne par carte)
- Tout faux positif détecté par le spot-check (cartes que les agents flaguaient mais le body était juste)
- Le nouveau cursor : « prochain `/audit-card-bodies` commencera à dexNum X »
- Le lien Markdown vers le rapport généré

## Garanties à respecter

- [ ] Spot-check fait via WebFetch sur **tout** claim flaggé `refuted`/`disputed` ou divergent entre A et B
- [ ] `npm run validate` vert avant clôture (exit 0, ou warnings examinés)
- [ ] `data/_audit/_progress.json` mis à jour : `auditedDexNums` étendu, nouvelle entrée `batches[]`, compteurs accumulés
- [ ] Section « Progression actuelle » du présent SKILL.md mise à jour (cursor visible à l'utilisateur)
- [ ] Pour chaque carte modifiée : `editorial.contentVersion` incrémenté ET nouvelle entrée datée dans `editorial.notes`
- [ ] Rapport écrit dans `reports/honesty-audit-cards-<min>-<max>-<ts>.md` avec toutes les sections standard
- [ ] Aucune correction appliquée sans validation par spot-check (filet anti-faux-positif)
- [ ] Aucune carte modifiée hors du body, contentVersion et editorial.notes (ne touche pas aux sources, gameplay, canonical, status)

## Tu ne fais PAS

- Tu ne flippes pas `editorial.status` (l'audit ne change pas le statut — `reviewed` reste `reviewed`, `approved` reste `approved`)
- Tu n'ajoutes pas/ne supprimes pas d'entrées dans `editorial.sources[]` (c'est le rôle de `source-verifier`)
- Tu ne touches pas à `canonical.*` (lat/lon, pivotYear, placeKind, type) — ces faits structurants sont du domaine de `historical-researcher`
- Tu ne touches pas à `gameplay.*` (whenDelta, whereRadiusKm, difficulty) — c'est du domaine de `gameplay-balancer`
- Tu ne re-audites pas des cartes déjà couvertes (sauf si `range:` explicite dans l'argument)
- Tu ne pousses pas en DB (`npm run push:db` reste un acte manuel sur demande utilisateur)

## Cas particuliers

- **N > 30 demandé** : refuse poliment, propose 2 invocations successives. Justification : au-delà, le rendement humain de review du rapport ne suit pas, et le coût par run devient élevé. Pour 14-30 cartes, ne pas refuser : appliquer le **chunking** de l'étape 4 (sous-lots de ≤ 13 cartes par paire d'agents) qui neutralise la fatigue YAML observée historiquement sur les gros lots mono-paire.
- **Aucune carte non auditée disponible** : message clair « catalogue intégralement audité au-delà de `<plus_grand_dexNum_audité>`. Utilise `range:A-B` pour re-auditer une plage. » et STOP sans rien faire.
- **Spot-check révèle un faux positif d'agent** : ne PAS appliquer la correction. Documenter le faux positif dans le rapport (section dédiée « Faux positifs détectés ») avec la mention « le body est juste, l'agent s'est trompé en lisant la source ». Cas historique : Cueva de las Manos (1ᵉʳ audit), « 829 left hands » lu comme total alors que >2000 est le chiffre correct.
- **`npm run validate` reste rouge après reformulation** : arrêter immédiatement, sauvegarder l'état partiel des fichiers modifiés, présenter à l'utilisateur la liste des erreurs et demander arbitrage. Ne pas continuer aveuglément vers l'étape 8 (mise à jour du progress).
- **Carte avec body très court ou très technique** (peu de claims testables) : produire un YAML avec `claims: []` côté agents possible ; `overall_verdict: solid` par défaut ; pas de correction nécessaire.
- **Agent en background qui timeout** (>30 min) : reprendre uniquement le rapport disponible, noter l'incident dans le rapport, et continuer avec l'agent qui a fini. Si les deux ont timeout, arrêter et reporter.

## Estimation de coût par invocation

| Phase | Wall-clock | Tokens output | Coût indicatif |
|---|---|---|---|
| Étapes 1-3 (extraction + claims) | ~3 min | ~30k | $0.10 |
| Étape 4 (2 agents A+B en parallèle) | ~10-15 min | ~250-280k | $1.50-2.00 |
| Étape 6 (spot-check : 3-8 WebFetch) | ~3-5 min | ~15k | $0.10 |
| Étapes 7-8 (corrections + rapport) | ~5-10 min | ~30k | $0.15 |
| **Total par batch de 10 cartes** | **~25-35 min** | **~330k** | **~$2.00** |

Pour 20 cartes : doubler approximativement.

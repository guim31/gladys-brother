# CLAUDE.md

Project rules for coding assistants (Claude Code reads this file) and for human
contributors.

## What this is

A Gladys Assistant **external integration**: a Node.js service (Node 22+, ESM,
no build step) that runs in its own sandboxed Docker container and talks to
Gladys through
[`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js),
its only runtime dependency. It started from the official JavaScript template.

## Commands

```bash
npm install
npm test                                  # node --test, the built-in runner
node --test test/decode.test.js           # one file
node --test --test-name-pattern "toner"   # tests whose name matches
npm run lint                              # ESLint
npm run format:check                      # Prettier, as the CI runs it
npm run format                            # Prettier, fix in place
npx github:GladysAssistant/integration-store .   # store admission checks
```

The CI (`.github/workflows/ci.yml`) runs `format:check`, `lint` and `test` on
Node 22 and 24, and builds the Docker image: run the three commands before
pushing.

## Architecture

```
index.js                          SDK wiring only: src/app.js registers the handlers before connect()
src/app.js                        every SDK handler -> the monitor (also used by the tests)
src/monitor.js                    discovery, reading loop, states, transport badge, scene events,
                                  last reading per printer (widget, scene action)
src/brother/constants.js          OIDs, Brother block codes -> feature keys, alerts, charsets
src/brother/decode.js             raw varbinds -> reading (blocks, family, display text, alerts)
src/brother/reader.js             one GetRequest per printer, noSuchName pruning, OID cache
src/brother/roman8.js             HP Roman-8 decoder (no TextDecoder for it)
src/snmp/ber.js, client.js        BER (from gladys-ipp) + multi-OID GetRequest over UDP
src/features.js                   reading -> Gladys device, features, states; feature names
src/discovery.js                  mDNS results (scanNetwork) + manual addresses, probed in SNMP
src/triggers.js                   supply_low steps (with re-arming), new alerts
src/widgets.js                    `supplies` dashboard widget
src/scenes.js                     `read_printer` scene action
src/actions.js                    `test_printer` manifest action
src/texts.js                      every text of the container, four languages
src/config.js                     DEFAULT_CONFIG (mirrors the manifest defaults) + normalization
src/store.js                      /data/brother-state.json (fired steps, last alerts)
gladys-assistant-integration.json manifest: name, config_schema, actions, image...
docs/{en,fr,de,es}.md             user documentation, re-hosted by Gladys (en/fr mandatory)
test/                             node --test, against the SDK's fake Gladys (integration-sdk/testing)
test/helpers/fakePrinter.js       simulated Brother SNMP agents answering real BER bytes
test/fixtures/printers/           14 real printer answers (brother library), wire format
.github/scripts/release.mjs       release helpers (manifest bump, changelog), tested in test/
```

## Rules

- **External ids are forever.** Build them with
  `gladys.externalIds(type, platformId)`, `platformId` being the unique id the
  platform gives the device (serial, cloud id, MAC), never a label. Gladys keys
  devices, their history, scenes and dashboards on them: changing one creates a
  new device and orphans the old one. The same goes for every key users store:
  manifest `config_schema`, `actions`, widget and scene keys, feature keys.
- **The container rootfs is read-only.** Write only under `/data`, the one
  writable volume. Never log tokens, passwords or API keys.
- **Versions belong to the Release workflow** (Actions → Release). Never edit
  `version` in `package.json` or in the manifest, nor the `docker_image` tag,
  by hand — except on the README's hand-pushed tag path, which bumps all three
  together before tagging. `test/manifest.test.js` checks they agree.
- **Changelog.** Every user-visible change adds a line under `## [Unreleased]`
  in `CHANGELOG.md` (`### Added`, `Changed`, `Fixed`, `Removed`, `Security`).
  Never write a version heading: the Release workflow moves the section, and it
  becomes the notes of the GitHub Release.
- **Manifest.** Texts are multi-language objects `{ "en": ..., "fr": ... }`:
  `label`, `description` and `placeholder` alike, never a plain string. The
  catalog `description` holds 10 to 100 characters per language. A field the
  older cores do not know needs a higher `gladys_version` minimum
  (`categories`: 4.86.0; `widgets`, `scene_triggers`, `scene_actions`,
  `type: "provider"`: 5.1.0). `test/manifest.test.js` ties the manifest to the
  code (defaults, action, scene and widget handlers): change both sides
  together.
- **User-facing text** exists in four languages (English, French, German,
  Spanish): action messages, widget texts, feature names, manifest texts, and
  `docs/en.md`, `docs/fr.md`, `docs/de.md`, `docs/es.md`, kept in sync.
  `test/i18n.test.js` checks it.
- **Style.** Prettier formats, ESLint catches mistakes. Comments explain why,
  in English. Tests never touch the network.

---

# Notes du mainteneur (guim31)

Ce qui suit complète les règles du template ci-dessus. Ce sont des faits vérifiés dans le code du
cœur Gladys ou payés sur les intégrations déjà publiées par guim31. Ils ne se lisent pas dans le
code de ce dépôt. Compléter ce fichier quand un nouveau piège est découvert.

## Travailler sur ce dépôt

- Mêmes étapes que la CI, dans le même ordre : `npm ci`, `npm run format:check`, `npm run lint`,
  `npm test`. Prettier contrôle **aussi le Markdown** : lancer `npm run format` après avoir
  modifié ce fichier, le README ou la documentation, sinon la CI tombe.
- Une session de code n'a **ni instance Gladys ni appareil réel**. La suite de tests, le lint et
  le validateur du store sont les seules vérifications possibles : le test réel se fait ailleurs.
  Le dire, plutôt que de conclure que « ça marche ».
- **Tout le code de démonstration du template disparaît** : station météo, prise, lampe, caméra,
  capteur de mouvement, `src/weather.js`, leurs tests, leurs entrées du manifeste et de la
  documentation. Il ne reste que ce que l'intégration fait vraiment.
- **Publier n'est jamais le travail d'une session de code** : ni Release, ni tag, ni topic, ni
  version modifiée à la main. L'orchestrateur s'en charge une fois la PR fusionnée. Les workflows
  sont ceux du template : ne pas les modifier.
- Le dépôt est **public** : aucun secret, aucune adresse ni détail d'infrastructure privée, ni
  ici, ni dans les tests, ni dans les captures.

## Pièges du cœur Gladys

**Appareils et fonctionnalités**

- **Polling** : le planificateur n'interroge un appareil que si `should_poll: true` **et**
  `poll_frequency` vaut une valeur de la liste fixe, **en millisecondes** (1000, 2000, 10000,
  15000, 30000, 60000). Le template publie `poll_frequency: 300` sans `should_poll` : c'est faux,
  le cœur répond 400 à la découverte. Pour une cadence hors liste, publier `should_poll: false` et
  pousser les états depuis le conteneur, en gardant un `onPoll` de repli.
- **`min` et `max` sont NOT NULL** dans `t_device_feature`, y compris pour `text/text` : sans eux,
  « Ajouter à Gladys » échoue en HTTP 422. Mettre 0/0, comme Zigbee2MQTT.
- Un état publié sur une fonctionnalité **pas encore ajoutée** dans Gladys reçoit un 200 puis est
  jeté (simple ligne de log) : republier les états dans `onDeviceCreated`.
- `level-sensor/decimal` n'existe pas côté serveur. `light-sensor/binary` n'a pas de libellé dans
  le front (pastille vide) : préférer `input/binary`. Un `text/text` reçoit `{ text }`, jamais
  vide, sinon l'état est ignoré.
- **Détecteur d'ouverture (`opening-sensor`) : 0 = ouvert, 1 = fermé** (`OPENING_SENSOR_STATE`), à
  l'inverse de l'intuition et des autres détecteurs (mouvement, fuite, fumée : 1 = détecté). Une
  porte ouverte publiée à 1 s'affiche « Fermé » et fausse scènes et historique. Le figer par un test.
- **Un `external_id` de fonctionnalité ne change jamais d'appareil** d'une version à l'autre. UniFi
  1.5.2 avait sorti les ports PoE dans un appareil dédié, la 1.6.0 les a remis dans la passerelle avec
  les mêmes identifiants : ceux qui avaient ajouté l'appareil dédié ne peuvent plus « Mettre à jour » la
  passerelle (409 `external_id must be unique`). Pour regrouper, garder l'appareil existant
  (`gladys.getDevices()`) ou changer d'identifiant.
- Les **noms de fonctionnalités sont figés à la création**. Et quand une fonctionnalité est seule
  de son type sur l'appareil, le tableau de bord affiche le libellé générique du type à la place
  du nom publié.
- **Aucune commande d'appareil ne permet un choix multiple** : un `text/select` n'a qu'un choix
  actif.
- Un changement de structure fait proposer « Mettre à jour » dans l'onglet Découverte
  (`structure_changed`). Un changement des seules `supported_options` ne le déclenche pas.
- **Jauge** : l'aiguille se place par `(value - min) / (max - min)` des bornes de la
  fonctionnalité. `gauge_min`/`gauge_max` ne pilotent que les couleurs, et le cœur n'applique
  jamais `min`/`max` en écriture : ce sont des bornes d'affichage. Une valeur signée exige des
  bornes symétriques.
- Le cœur plafonne à **300 états par minute** et réévalue les scènes à chaque état : ne publier
  que les changements.
- Une intégration `device` ne reçoit pas la langue de l'utilisateur, une action de scène non
  plus (un widget, si) : prévoir un champ de config `language` si des textes partent du
  conteneur. Le superviseur injecte `TZ`, le fuseau de Gladys. La sandbox est limitée à 256 Mo.

**Formulaires de configuration et actions**

- Les champs `number` sont rendus **sans `step`** : le navigateur n'accepte alors que `min + k`.
  Min et défaut **entiers** seulement ; une valeur décimale passe par un `select` ou par un
  `string` parsé (virgule acceptée).
- Un champ `secret` dans les `fields` d'une **action** est impossible à remplir, et une action
  n'applique **aucun `default`** tout en exigeant les champs `required` (422). Issues
  GladysAssistant/Gladys#3154 et #3155.

**Widgets, déclencheurs, actions de scène (SDK ≥ 0.14, Gladys ≥ 5.1)**

- **Cibler la dernière version publiée du cœur, pas `master`** (5.2.0 au 12/10/2026) : la spec
  de `master` décrit des fonctions non publiées. Les boutons de widget qui ouvrent un formulaire
  (#3168, commit 3feb2cf8) étaient absents de la 5.1.4 : le bouton s'affiche et n'envoie rien.
  Vérifier par `git tag --contains`. Cette intégration n'utilise que des fonctions présentes dès
  la 5.1.0 (widgets, déclencheurs, actions de scène, `POST /device/transport`).

- Un réglage de widget ne propose en liste que les **appareils** de l'intégration
  (`source: "devices"`, seule source dynamique).
- Budget du cœur : **8 composants par widget, dont 2 textes au plus**, appliqué **avant** la
  résolution des références ; un contenu amputé reste en cache jusqu'au TTL. Appeler
  `requestWidgetRefresh` à la création d'un appareil. `validateWidgetContent` est exporté pour les
  tests, mais ne vérifie pas que les `external_id` liés existent : les croiser avec `buildDevice`.
- Une ligne de `status` exige un `value` (nombre ou texte ≤ 40).
- Le cœur **jette un bouton dont la clé d'action est déjà prise** : clés numérotées.
- Le vocabulaire des widgets n'a ni liste ni curseur, **par choix** du cœur. Seul un bouton
  `device_feature` numérique a un état actif natif.
- **En mode sombre, le style `primary` d'un bouton de widget ne se voit pas** (#3153) : signaler
  un choix courant par l'icône (`check-circle`), jamais par le style.
- Dans une grille `card-list`, la `date` s'affiche **à la place** du sous-titre.
- `onWidgetAction` fait recharger le widget dès la résolution, alors que `requestWidgetRefresh`
  est plafonné à un appel toutes les 10 s. Un toast d'action est tronqué à 200 caractères.
- Le cœur met le contenu d'un widget en cache par (réglages, langue, unités) : pré-localiser
  d'après `language` est correct.
- Les filtres de scène ne font qu'égalité et appartenance : un seuil reste le travail d'un capteur.
- **Les clés de widgets, de déclencheurs et d'actions sont figées une fois publiées.**
- `gladys_version` `>=5.1.0` dès qu'il y a widgets, déclencheurs ou actions de scène.

## Store

- Validateur officiel, depuis la racine : `npx -y github:GladysAssistant/integration-store .`
  (schéma, `description` **100 caractères au plus par langue**, documentation de 300 caractères
  au moins, image Docker, cover de **150 Ko au plus**). Il demande Node ≥ 24 mais tourne sous
  Node 22 avec un avertissement.
- L'indexeur lit le manifeste de la **dernière release**, pas celui de `main` : une correction du
  manifeste (catégorie, description…) n'atteint le store qu'avec une release.
- L'indexeur rejette **en silence** : la raison n'apparaît que dans `rejected.json`, à côté de
  `https://integration-store-storage.gladysassistant.com/index.json`.
- **Image de base** : `FROM public.ecr.aws/docker/library/node:…` (miroir officiel ECR Public, même
  empreinte) et non `node:…` de Docker Hub, qui refuse en 429 les pulls anonymes des runners GitHub
  dès qu'il y a plusieurs builds à la fois. Un échec 429 dans le job « Docker build » n'est pas un bug
  du code. Même parade dans `.github/workflows/build.yml` (posée par l'orchestrateur, ne pas la
  retirer) : QEMU et BuildKit tirés de `mirror.gcr.io`.
- La règle `data/` du `.gitignore` du template (pour le volume `/data`) exclut aussi `src/data/` :
  l'ancrer en `/data/`, dans `.prettierignore` aussi.

### Langues (depuis le 11/10/2026)

Tout texte montré à l'utilisateur existe en **`en`, `fr`, `de` et `es`** : manifeste, contenu des widgets, messages,
noms de fonctionnalités, documentation. L'allemand **tutoie** (« du »), l'espagnol **vouvoie** (« usted ») : décision
de Guilhem, appliquée à ses 21 intégrations. `test/i18n.test.js` doit échouer sur une langue manquante, un texte vide
ou trop long, et sur un « Sie »/« Ihr… » de politesse en allemand (y compris un « Sie » qui voudrait dire « elle » en
début de phrase : tourner la phrase autrement). L'indexeur du store publie `docs/en.md` et `docs/fr.md`
(obligatoires) et aussi `docs/de.md` et `docs/es.md` quand ils existent (`DOCS_OPTIONAL_LANGUAGES` dans
`integration-store/src/constants.js`) : les quatre sont écrites, avec les mêmes sections (vérifié par le test).

---

# Intégration Brother (SNMP)

## Ce qu'elle lit

Une seule requête SNMP GetRequest (v1 par défaut, v2c en option) de 14 OID par imprimante et par
lecture, comme la bibliothèque Python `brother` (bieniu/brother, Apache-2.0) qu'utilise Home
Assistant, dont le décodage est porté ici :

- MIB Brother `1.3.6.1.4.1.2435.2.3.9…` : identifiant IEEE 1284 (`MDL:` = modèle, `CID:` =
  famille), numéro de série (identifiant de l'appareil, en minuscules), firmware, texte de l'écran,
  et trois blocs binaires : maintenance (`…5.5.8.0`), compteurs (`…5.5.10.0`), « next care »
  (`…5.5.11.0`, lasers seulement).
- MIB standard : `sysUpTime`, `prtLocalizationCharacterSet` (jeu de caractères de l'écran),
  `prtMarkerLifeCount` (compteur des vieux modèles), `ifPhysAddress`, `hrDeviceStatus`,
  `hrPrinterStatus`, `hrPrinterDetectedErrorState` (alertes, bit 0 = bit de poids fort du premier
  octet).
- En v1, un OID absent du modèle donne `noSuchName` + son index et **rien d'autre** : on retire
  l'OID et on renvoie la requête (jusqu'à 6 échanges la première fois, MFC-J680DW) ; la liste
  élaguée est gardée par hôte (`oidCache`), une seule requête ensuite. Modèle ou série absent :
  `UnsupportedPrinterError`. En v2c, une valeur `noSuchObject` par OID absent.

## Décodage (pièges trouvés en le portant)

- Les blocs Brother sont des entrées `code, 0x01, longueur, valeur` terminées par un octet `0xff`
  (somme de contrôle). La bibliothèque les découpe en morceaux fixes de 7 octets : faux dès qu'une
  entrée n'a pas 4 octets (HL-5350DN : entrées d'un octet, d'où son `black_toner_status=21037313`).
  Ici, lecture par longueur : 4 octets = entier ; 2 octets = paire valeur/maximum des vieux modèles
  (MFC-5490CN, codes `a1`–`a4`) ; 1 octet = sens inconnu, ignoré.
- Pourcentages en centièmes (`6f`–`72`, tambours, courroie, fusion…) arrondis **au pair le plus
  proche** (le `round` de Python), pour afficher les mêmes valeurs que Home Assistant. Le
  réservoir d'encre usagée (`85`) est en pourcentage simple (75 = 75 %), pas en centièmes.
- Codes `81`–`84` (autre mesure des cartouches) et `31`–`34`, `63` (drapeaux d'état) : non
  publiés, comme dans Home Assistant.
- Famille laser / jet d'encre : un choix de l'utilisateur dans Home Assistant, détectée ici (`CID`
  « Laser » ou « Jpeg/Ink », puis modèle `-J`/`-T` = encre, `-L` = laser, puis codes propres à une
  famille). Elle change les noms (toner / encre) et les codes lus (pièces laser ignorées sur une jet
  d'encre, `85` ignoré sur une laser, bloc « next care » ignoré sur une jet d'encre). Indétectable
  (MFC-5490CN) : « Cartouche noire ». Les **clés** des cartouches sont neutres (`black_cartridge`)
  pour qu'une détection corrigée plus tard ne change aucun `external_id`.
- Texte de l'écran : UTF-8 d'abord (DCP-T735DW firmware 1.5 envoie de l'UTF-8 en se déclarant
  Roman-8), puis le jeu déclaré (`TextDecoder` iso-8859-2/-5/-9 ; HP Roman-8 par table maison).
  Les lignes d'un écran à deux lignes (séparées par CR) sont jointes par « · ». La casse est
  gardée (la bibliothèque met tout en minuscules).
- Les 14 fixtures (`test/fixtures/printers`) sont reconstruites au format filaire depuis celles de
  la bibliothèque (blocs = morceaux concaténés + `ff`, texte réencodé dans le jeu déclaré), série
  et MAC inventés ; `library_expected` porte les valeurs de ses snapshots, comparées dans
  `test/decode.test.js`. Script de reconstruction hors dépôt (une session : le refaire depuis
  `bieniu/brother/tests/fixtures` et `tests/snapshots/test_init.ambr`).

## Choix de conception

- **Cadence** : minuteur du conteneur (`poll_interval`, 60 s par défaut, 30 à 3600),
  `should_poll: false`. Imprimantes lues l'une après l'autre ; une lecture en cours est partagée
  (`inFlight`) entre la boucle, le bouton du widget et l'action de scène. Délai SNMP 2,5 s, 2
  reprises.
- **Hors ligne** : déclaré après `UNREACHABLE_AFTER` (2) lectures sans réponse — une imprimante en
  veille profonde rate parfois une requête — ou tout de suite quand quelqu'un attend la réponse
  (bouton, action de scène). Badge `unreachable` (`publishTransports`), état « Ne répond pas »
  dans la langue de la config ; les niveaux gardent leur dernière valeur. Une adresse qui répond
  avec **un autre numéro de série** (bail DHCP réattribué) compte comme un échec. Après un passage
  hors ligne, une redécouverte mDNS au plus toutes les 30 min retrouve une imprimante qui a changé
  d'adresse (les `params` HOST de l'appareil créé sont mis à jour par `publishDiscoveredDevices`).
- **Déclencheurs** : les filtres de scène ne font qu'égalité. `supply_low` part donc une fois par
  **palier** franchi (50, 25, 20, 15, 10, 5, 0 %) avec `threshold` en donnée ; la scène choisit son
  palier dans un `select` obligatoire (défaut 10). Un palier se réarme à palier + 5 points (nouvelle
  cartouche), pour qu'une estimation qui oscille ne répète pas l'événement. `printer_error` part à
  l'apparition d'un bit d'alerte. Rien au premier relevé d'une imprimante ; l'état (paliers tirés,
  dernières alertes) est dans `/data/brother-state.json`, pour qu'un redémarrage ne répète ni ne
  perde rien.
- **Widget** : en-tête + 5 jauges + liste + bouton = 8 composants. Jauges : cartouches puis
  pièces les plus basses, liées à la fonctionnalité de l'appareil créé quand elle existe ; le reste
  en lignes de la liste (10 au plus, « Dernier relevé » toujours en dernier).
- Fonctionnalités : cartouches en `level-sensor/liquid-level-percent` (comme gladys-ipp), pièces
  en `maintenance/life-remaining`, pages et compteurs en `counter-sensor/integer`, temps de
  fonctionnement en `duration/integer` **en heures** (en secondes, il changerait à chaque lecture).
- `community` est un champ `secret` de la config (vide = `public`).

## Non vérifié (pas d'imprimante)

- Tout ce qui touche à une vraie imprimante : comportement en veille profonde, délais, firmwares
  récents, modèles hors fixtures (couleur jet d'encre récents, MFC-L8xxx…).
- La découverte mDNS par le cœur sur `_printer._tcp` / `_ipp._tcp` (nom d'instance « Brother … »
  ou TXT `usb_MFG`/`ty`).
- Le rendu réel du widget et des cartes de scène dans Gladys 5.1/5.2.

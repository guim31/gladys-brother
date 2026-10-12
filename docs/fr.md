# Imprimantes Brother

Cette intégration lit vos imprimantes et multifonctions **Brother** en
**SNMP**, sur votre réseau local : niveaux de toner ou d'encre, tambour,
courroie, unité de fusion et autres pièces d'usure, compteurs de pages, et le
message affiché sur l'écran de l'imprimante. Pas de compte, pas de cloud. Elle
demande Gladys 5.1 ou plus récent.

Elle complète l'intégration **IPP Printers**, qui donne l'état et les niveaux
d'encre des imprimantes de toutes marques : les Brother disent en SNMP ce que
l'IPP ne dit pas (vie du tambour, pages restantes avant l'échéance d'une pièce,
compteurs de pages).

> **Développée sans le matériel : vos retours sont les bienvenus.** Le décodage
> a été testé sur les vraies réponses de 14 modèles Brother (les données de
> test de la bibliothèque `brother` qu'utilise Home Assistant), pas sur une
> imprimante. Dites sur le forum de Gladys ce que votre modèle affiche, surtout
> si une valeur vous semble fausse.

## Ce que vous obtenez

Un appareil Gladys par imprimante, au nom de son modèle (`Brother
HL-L2350DW`). Seul ce que votre modèle remonte est créé :

| Capteur                                                         | Unité  | Remarques                                                    |
| --------------------------------------------------------------- | ------ | ------------------------------------------------------------ |
| État                                                            | texte  | Le message de l'écran (`Prêt`, `Veille`, `Bourrage papier`…) |
| Toner (laser) ou encre (jet d'encre) noir, cyan, magenta, jaune | %      | Restant                                                      |
| Tambour, ou un tambour par couleur                              | %      | Durée de vie restante                                        |
| Courroie, unité de fusion, unité laser, kits d'alimentation     | %      | Durée de vie restante (lasers qui les remontent)             |
| Réservoir d'encre usagée                                        | %      | Capacité restante (jets d'encre qui la remontent)            |
| Tambour, courroie, fusion… : pages restantes                    | pages  | Pages avant l'échéance de la pièce                           |
| Pages imprimées, noir et blanc, couleur, recto verso            | pages  | Compteurs                                                    |
| Tambour : pages imprimées                                       | pages  | Pages imprimées avec le tambour actuel                       |
| Temps de fonctionnement                                         | heures | Depuis l'allumage de l'imprimante                            |

Modèle, numéro de série, firmware et adresse MAC sont gardés dans les
paramètres de l'appareil. Le badge de l'appareil indique **local** tant que
l'imprimante répond et **injoignable** quand elle ne répond plus ; son état
indique alors `Ne répond pas`. Les niveaux gardent leur dernière valeur
connue.

## Compatibilité

- Imprimantes laser et jet d'encre Brother en réseau (Wi-Fi ou Ethernet) :
  gammes HL, DCP et MFC, y compris les modèles à réservoirs (DCP-T, MFC-T).
  Quelques très anciens modèles (MFC-8660DN, MFC-8860DN) ne répondent pas.
- **Le SNMP doit être activé** sur l'imprimante. Il l'est par défaut ; cela se
  vérifie dans la page web de l'imprimante (Réseau → Protocole → SNMP).
  Version 1 ou 2c, avec la communauté de lecture `public` par défaut.
- L'imprimante doit être joignable depuis Gladys en UDP unicast, port 161 (même
  réseau, ou une route entre les deux).

## Configuration

1. Installez l'intégration. Les imprimantes qui s'annoncent en mDNS (Bonjour)
   sont trouvées automatiquement : ouvrez l'onglet **Découverte** de
   l'intégration et ajoutez la vôtre.
2. Si une imprimante n'est pas trouvée (mDNS bloqué, autre sous-réseau),
   saisissez son **adresse IP** dans **Imprimantes (adresses IP)**, plusieurs
   séparées par des virgules. Un nom `.local` ne fonctionne pas ici. Donnez à
   l'imprimante une adresse fixe (réservation DHCP sur votre box) si vous le
   pouvez.
3. **Communauté SNMP** : laissez vide pour `public`, le réglage d'usine. Si
   vous l'avez changée sur l'imprimante, saisissez la même ici.
4. **Version SNMP** : la v1 convient à toutes les Brother ; choisissez la v2c
   seulement si la v1 est désactivée sur l'imprimante.
5. **Intervalle de lecture** : 60 secondes par défaut (30 à 3600). Chaque
   lecture est une seule petite requête SNMP par imprimante.
6. **Langue des noms** : la langue des noms des capteurs des imprimantes que
   vous ajouterez désormais, et des textes envoyés aux scènes. Les noms sont
   figés à l'ajout de l'appareil.

Le bouton **Tester une imprimante** lit une adresse IP tout de suite et vous dit
ce qui y répond, sans rien ajouter.

## Widget du tableau de bord

**Consommables Brother** affiche une imprimante (la première ajoutée si vous
n'en choisissez pas) :

- jusqu'à 5 jauges : les cartouches d'abord, puis les pièces les plus usées,
  en vert, orange (25 % ou moins) ou rouge (10 % ou moins) ;
- une liste avec le message de l'écran, les alertes en cours (bourrage, capot
  ouvert…), les pages imprimées, les autres consommables et l'heure du dernier
  relevé ;
- un bouton **Relire**, qui lit l'imprimante tout de suite.

## Déclencheurs de scène

**Consommable d'imprimante bas** : un toner, une encre ou une pièce d'usure
descend au niveau choisi (50, 25, 20, 15, 10, 5 % ou vide). Il part une fois,
au franchissement du niveau, et de nouveau seulement après que le consommable
est remonté (une cartouche neuve). Filtres : l'imprimante, les consommables,
le niveau. Informations transmises à la scène : l'imprimante, le consommable,
le pourcentage restant, le niveau atteint.

**Alerte d'imprimante** : l'imprimante lève une alerte, au moment où elle
apparaît : bourrage, plus de papier, papier bas, capot ouvert, toner ou encre
bas ou vide, cartouche absente, bac absent, bac de sortie plein, intervention
demandée, entretien en retard… Filtres : l'imprimante, les alertes.
Informations transmises à la scène : l'imprimante, l'alerte, le message de
l'écran.

Rien ne part au premier relevé d'une imprimante : un toner déjà à 5 % quand vous
installez l'intégration est un état, pas un changement. Redémarrer Gladys ou
l'intégration ne répète ni ne perd aucun événement.

## Action de scène

**Relire une imprimante** lit l'imprimante tout de suite et transmet aux
actions suivantes de la scène : si elle a répondu, le message de l'écran, les
pages imprimées, le consommable le plus bas et son pourcentage, les alertes en
cours. Utile dans un message : « {imprimante} a imprimé {pages} pages,
consommable le plus bas : {nom} {pourcentage} % ».

## Exemples de scènes

- _Commander à temps_ : **Consommable d'imprimante bas**, consommables = toner
  noir, niveau = 20 % → envoyer un message « Toner noir à 20 % sur
  l'imprimante du bureau, pensez à en commander un ».
- _Bourrage_ : **Alerte d'imprimante**, alertes = bourrage papier, plus de
  papier → envoyer un message avec le message de l'écran.
- _Relevé mensuel_ : chaque 1er du mois à 9 h → **Relire une imprimante** →
  envoyer un message avec les pages imprimées et le consommable le plus bas.
- _Tambour à changer_ : **Consommable d'imprimante bas**, consommables =
  tambour, niveau = 10 % → envoyer un message avec le consommable et le
  pourcentage restant.

## Dépannage

- **Aucune imprimante dans l'onglet Découverte** : saisissez son adresse IP
  dans la configuration et enregistrez ; **Tester une imprimante** montre ce
  qui répond.
- **« Pas de réponse SNMP »** : vérifiez l'adresse, que le SNMP est activé sur
  l'imprimante, et la communauté. Une imprimante en veille profonde peut
  manquer une requête ; l'intégration réessaie avant de la déclarer
  injoignable.
- **« N'est pas une imprimante Brother que cette intégration sait lire »** :
  quelque chose répond en SNMP à cette adresse, mais sans l'identification
  Brother (une autre imprimante, une box…).
- **Un capteur manque** : l'imprimante ne le remonte pas. Si une pièce apparaît
  plus tard, l'onglet **Découverte** propose de mettre à jour l'appareil.
- **Une valeur semble fausse** : signalez-la sur le forum de Gladys avec votre
  modèle ; les logs de l'intégration (niveau `debug`) montrent chaque lecture.

## Limites

- Développée sans le matériel : le décodage vient des vraies réponses de 14
  modèles, pas d'essais sur une imprimante.
- Laser ou jet d'encre est détecté d'après ce que dit l'imprimante ; sur
  quelques anciens modèles, c'est impossible, et les cartouches s'appellent
  alors « Cartouche noire »…
- Les alertes viennent du registre d'alertes standard des imprimantes : une
  imprimante qui ne le remonte pas ne déclenche jamais **Alerte
  d'imprimante** (le message de l'écran change quand même).
- Les pourcentages sont les estimations de l'imprimante, arrondis comme le
  fait Home Assistant.
- Lecture seule : l'intégration ne change jamais un réglage de l'imprimante.

## Réseau et vie privée

Uniquement des requêtes SNMP vers les adresses des imprimantes (UDP 161), une à
la fois, et un scan mDNS par Gladys. Rien ne sort de votre réseau. Stocké dans
le volume `/data` de l'intégration : les niveaux et alertes du dernier relevé
de chaque imprimante, pour ne déclencher chaque événement de scène qu'une fois.

## Crédits

Le décodage des données SNMP Brother est un portage en JavaScript de la
bibliothèque Python [`brother`](https://github.com/bieniu/brother) de Maciej
Bieniek (Apache 2.0), utilisée par Home Assistant. Brother est une marque de
Brother Industries ; cette intégration n'est pas affiliée à Brother.

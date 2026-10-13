# Brother-Drucker

Diese Integration liest deine **Brother**-Drucker und Multifunktionsgeräte per
**SNMP** in deinem lokalen Netzwerk: Toner- oder Tintenstände, Trommel,
Transfereinheit, Fixiereinheit und weitere Verschleißteile, Seitenzähler und
die Meldung im Display des Druckers. Kein Konto, keine Cloud. Benötigt wird
Gladys 5.1 oder neuer.

Brother Printers ergänzt die Integration **IPP Printers**, die Status und Tintenstände von
Druckern aller Marken liefert: Brother-Drucker melden per SNMP, was IPP nicht
sagt (Lebensdauer der Trommel, verbleibende Seiten bis zum Austausch eines
Teils, Seitenzähler).

> **Ohne die Hardware entwickelt: Rückmeldungen willkommen.** Die Dekodierung
> wurde mit echten Antworten von 14 Brother-Modellen getestet (den Testdaten
> der Bibliothek `brother`, die Home Assistant verwendet), nicht an einem
> Drucker. Teile im Gladys-Forum mit, was dein Modell anzeigt, besonders wenn
> dir ein Wert falsch vorkommt.

## Was du bekommst

Ein Gladys-Gerät pro Drucker, nach seinem Modell benannt (`Brother
HL-L2350DW`). Es wird nur angelegt, was dein Modell meldet:

| Sensor                                                               | Einheit | Hinweise                                                        |
| -------------------------------------------------------------------- | ------- | --------------------------------------------------------------- |
| Status                                                               | Text    | Die Meldung im Display (`Bereit`, `Ruhezustand`, `Papierstau`…) |
| Toner (Laser) oder Tinte (Tintenstrahl) Schwarz, Cyan, Magenta, Gelb | %       | Verbleibend                                                     |
| Trommel oder eine Trommel pro Farbe                                  | %       | Verbleibende Lebensdauer                                        |
| Transfereinheit, Fixiereinheit, Lasereinheit, Papiereinzugskits      | %       | Verbleibende Lebensdauer (Laser, die sie melden)                |
| Tintenauffangbehälter                                                | %       | Verbleibende Kapazität (Tintenstrahler, die sie melden)         |
| Trommel, Transfereinheit, Fixiereinheit… : verbleibende Seiten       | Seiten  | Seiten bis zum Austausch des Teils                              |
| Gedruckte Seiten, Schwarzweiß, Farbe, Duplex                         | Seiten  | Zähler                                                          |
| Trommel: gedruckte Seiten                                            | Seiten  | Mit der aktuellen Trommel gedruckte Seiten                      |
| Betriebszeit                                                         | Stunden | Seit dem Einschalten des Druckers                               |

Modell, Seriennummer, Firmware und MAC-Adresse stehen in den Geräteparametern.
Das Abzeichen des Geräts zeigt **lokal**, solange der Drucker antwortet, und
**nicht erreichbar**, wenn er nicht mehr antwortet; sein Status lautet dann
`Antwortet nicht`. Die Füllstände behalten ihren letzten bekannten Wert.

## Kompatibilität

- Brother-Laser- und Tintenstrahldrucker mit Netzwerkanschluss (WLAN oder
  Ethernet): Serien HL, DCP und MFC, auch die Tintentank-Modelle (DCP-T,
  MFC-T). Einige sehr alte Modelle (MFC-8660DN, MFC-8860DN) antworten nicht.
- **SNMP muss am Drucker aktiviert sein.** Ab Werk ist es das; prüfen kannst
  du es auf der Webseite des Druckers (Netzwerk → Protokoll → SNMP). Version 1
  oder 2c, standardmäßig mit der Lese-Community `public`.
- Der Drucker muss von Gladys aus per Unicast-UDP auf Port 161 erreichbar sein
  (dasselbe Netzwerk oder eine Route zwischen beiden).

## Konfiguration

1. Installiere die Integration. Drucker, die sich per mDNS (Bonjour) melden,
   werden automatisch gefunden: Öffne den Tab **Entdecken** der Integration
   und füge deinen hinzu.
2. Wird ein Drucker nicht gefunden (mDNS blockiert, anderes Subnetz), trage
   seine **IP-Adresse** unter **Drucker (IP-Adressen)** ein, mehrere durch
   Kommas getrennt. Ein `.local`-Name funktioniert hier nicht. Gib dem Drucker
   nach Möglichkeit eine feste Adresse (DHCP-Reservierung im Router).
3. **SNMP-Community**: leer lassen für `public`, die Werkseinstellung. Wenn du
   sie am Drucker geändert hast, trage hier dieselbe ein.
4. **SNMP-Version**: v1 passt zu jedem Brother-Drucker; wähle v2c nur, wenn v1
   am Drucker deaktiviert ist.
5. **Abfrageintervall**: standardmäßig 60 Sekunden (30 bis 3600). Jede
   Abfrage ist eine einzige kleine SNMP-Anfrage pro Drucker.
6. **Sprache der Namen** (standardmäßig Französisch): die Sprache der Sensornamen der Drucker, die du ab
   jetzt hinzufügst, und der Texte, die an Szenen gehen. Die Namen werden beim
   Hinzufügen des Geräts festgelegt.

Die Schaltfläche **Drucker testen** fragt eine IP-Adresse sofort ab und zeigt
dir, was dort antwortet, ohne etwas hinzuzufügen.

## Dashboard-Widget

**Brother-Verbrauchsmaterial** zeigt einen Drucker (den zuerst hinzugefügten,
wenn du keinen wählst):

- bis zu 5 Anzeigen: zuerst die Patronen, dann die am stärksten abgenutzten
  Teile, in Grün, Orange (25 % oder weniger) oder Rot (10 % oder weniger);
- eine Liste mit der Meldung im Display, den aktuellen Meldungen (Papierstau,
  Abdeckung offen…), den gedruckten Seiten, den übrigen Verbrauchsmaterialien
  und der Uhrzeit der letzten Abfrage;
- eine Schaltfläche **Jetzt abfragen**, die den Drucker sofort liest.

## Szenen-Auslöser

**Druckerverbrauchsmaterial niedrig**: Ein Toner, eine Tinte oder ein
Verschleißteil sinkt auf die gewählte Stufe (50, 25, 20, 15, 10, 5 % oder
leer). Er löst einmal aus, beim Erreichen der Stufe, und erst wieder, nachdem
das Material wieder gestiegen ist (eine neue Patrone). Filter: der Drucker, die
Verbrauchsmaterialien, die Stufe. An die Szene übergebene Informationen: der
Drucker, das Verbrauchsmaterial, der verbleibende Prozentsatz, die erreichte
Stufe.

**Druckermeldung**: Der Drucker meldet etwas, sobald es auftritt: Papierstau,
kein Papier, wenig Papier, Abdeckung offen, Toner oder Tinte fast leer oder
leer, Patrone fehlt, Fach fehlt, Ausgabefach voll, Wartung angefordert,
Wartung überfällig… Filter: der Drucker, die Meldungen. An die Szene übergebene
Informationen: der Drucker, die Meldung, die Meldung im Display.

Bei der ersten Abfrage eines Druckers wird nichts ausgelöst: Ein Toner, der
beim Installieren der Integration schon bei 5 % steht, ist ein Zustand, keine
Änderung. Ein Neustart von Gladys oder der Integration wiederholt kein Ereignis
und verliert keines.

## Szenen-Aktion

**Drucker abfragen** fragt den Drucker sofort ab und gibt an die nächsten
Aktionen der Szene weiter: ob er geantwortet hat, die Meldung im Display, die
gedruckten Seiten, das niedrigste Verbrauchsmaterial und seinen Prozentsatz,
die aktuellen Meldungen. Nützlich in einer Nachricht: „{Drucker} hat {Seiten}
Seiten gedruckt, niedrigster Füllstand: {Name} {Prozent} %“.

## Beispielszenen

- _Rechtzeitig bestellen_: **Druckerverbrauchsmaterial niedrig**,
  Verbrauchsmaterial = Toner Schwarz, Stufe = 20 % → eine Nachricht senden
  „Toner Schwarz bei 20 % am Bürodrucker, Zeit zum Nachbestellen“.
- _Papierstau_: **Druckermeldung**, Meldungen = Papierstau, kein Papier → eine
  Nachricht mit der Meldung im Display senden.
- _Monatsbericht_: jeden 1. des Monats um 9:00 → **Drucker abfragen** → eine
  Nachricht mit den gedruckten Seiten und dem niedrigsten Füllstand senden.
- _Trommel tauschen_: **Druckerverbrauchsmaterial niedrig**,
  Verbrauchsmaterial = Trommel, Stufe = 10 % → eine Nachricht mit dem
  Verbrauchsmaterial und dem verbleibenden Prozentsatz senden.

## Fehlerbehebung

- **Kein Drucker im Tab Entdecken**: Trage seine IP-Adresse in der
  Konfiguration ein und speichere; **Drucker testen** zeigt, was antwortet.
- **„Keine SNMP-Antwort“**: Prüfe die Adresse, ob SNMP am Drucker aktiviert
  ist, und die Community. Ein Drucker im Tiefschlaf kann eine Anfrage
  verpassen; die Integration versucht es erneut, bevor sie ihn als nicht
  erreichbar meldet.
- **„Kein Brother-Drucker, den diese Integration lesen kann“**: Unter dieser
  Adresse antwortet etwas per SNMP, aber ohne die Brother-Kennung (ein anderer
  Drucker, ein Router…).
- **Ein Sensor fehlt**: Der Drucker meldet ihn nicht. Taucht ein Teil später
  auf, bietet der Tab **Entdecken** an, das Gerät zu aktualisieren.
- **Ein Wert scheint falsch**: Melde ihn bitte im Gladys-Forum mit deinem
  Modell; die Protokolle der Integration (Stufe `debug`) zeigen jede Abfrage.
- **Protokolle**: Standardmäßig schreibt die Integration nur ihren Start, die
  gefundenen Drucker, einen Drucker, der nicht mehr antwortet oder
  zurückkommt, und Fehler (ein wiederholter Fehler nur einmal, dann eine Zeile,
  wenn er behoben ist). Für jede Abfrage und jede Suche startest du den
  Container mit der Umgebungsvariable `LOG_LEVEL=debug` (Standard `info`; auch
  `warn`, `error`, `silent`). Die SNMP-Community erscheint nie in den
  Protokollen.

## Einschränkungen

- Ohne die Hardware entwickelt: Die Dekodierung stammt aus echten Antworten
  von 14 Modellen, nicht aus Tests an einem Drucker.
- Laser oder Tintenstrahl wird aus den Angaben des Druckers erkannt; bei
  einigen alten Modellen geht das nicht, die Patronen heißen dann „Patrone
  Schwarz“…
- Die Meldungen stammen aus dem Standard-Meldungsregister der Drucker: Ein
  Drucker, der es nicht meldet, löst **Druckermeldung** nie aus (die Meldung
  im Display ändert sich trotzdem).
- Die Prozentwerte sind Schätzungen des Druckers, gerundet wie bei Home
  Assistant.
- Nur lesend: Die Integration ändert nie eine Einstellung des Druckers.

## Netzwerk und Datenschutz

Nur SNMP-Anfragen an die Adressen der Drucker (UDP 161), eine nach der anderen,
und ein mDNS-Scan über Gladys. Nichts verlässt dein Netzwerk. Gespeichert im
Volume `/data` der Integration: die Füllstände und Meldungen der letzten
Abfrage jedes Druckers, damit jedes Szenen-Ereignis nur einmal ausgelöst wird.

## Danksagung

Die Dekodierung der Brother-SNMP-Daten ist eine JavaScript-Portierung der
Python-Bibliothek [`brother`](https://github.com/bieniu/brother) von Maciej
Bieniek (Apache 2.0), die Home Assistant verwendet. Brother ist eine Marke von
Brother Industries; diese Integration steht in keiner Verbindung zu Brother.

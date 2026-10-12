// -----------------------------------------------------------------------------
// Every text the container produces, in the four languages of the Gladys
// interface. German says "du", Spanish "usted" (test/i18n.test.js checks the
// German side). Brands are never translated.
// -----------------------------------------------------------------------------

export const LANGUAGES = ['en', 'fr', 'de', 'es'];

/** Pick a language of a multi-language object, English by default. */
export function pick(texts, language) {
  return texts[language] ?? texts.en;
}

/** Same text in every language, from a function of the language. */
export function everyLanguage(build) {
  return Object.fromEntries(LANGUAGES.map((language) => [language, build(language)]));
}

/** Short supply names, for gauges and status rows (24 characters at most). */
export const SHORT_NAMES = {
  en: {
    black_cartridge: 'Black',
    cyan_cartridge: 'Cyan',
    magenta_cartridge: 'Magenta',
    yellow_cartridge: 'Yellow',
    drum: 'Drum',
    black_drum: 'Black drum',
    cyan_drum: 'Cyan drum',
    magenta_drum: 'Magenta drum',
    yellow_drum: 'Yellow drum',
    belt: 'Belt',
    fuser: 'Fuser',
    laser_unit: 'Laser unit',
    pf_kit_1: 'PF kit tray 1',
    pf_kit_mp: 'PF kit MP tray',
    waste_ink_box: 'Waste ink box',
  },
  fr: {
    black_cartridge: 'Noir',
    cyan_cartridge: 'Cyan',
    magenta_cartridge: 'Magenta',
    yellow_cartridge: 'Jaune',
    drum: 'Tambour',
    black_drum: 'Tambour noir',
    cyan_drum: 'Tambour cyan',
    magenta_drum: 'Tambour magenta',
    yellow_drum: 'Tambour jaune',
    belt: 'Courroie',
    fuser: 'Fusion',
    laser_unit: 'Unité laser',
    pf_kit_1: 'Kit bac 1',
    pf_kit_mp: 'Kit bac MU',
    waste_ink_box: 'Encre usagée',
  },
  de: {
    black_cartridge: 'Schwarz',
    cyan_cartridge: 'Cyan',
    magenta_cartridge: 'Magenta',
    yellow_cartridge: 'Gelb',
    drum: 'Trommel',
    black_drum: 'Trommel Schwarz',
    cyan_drum: 'Trommel Cyan',
    magenta_drum: 'Trommel Magenta',
    yellow_drum: 'Trommel Gelb',
    belt: 'Transfereinheit',
    fuser: 'Fixiereinheit',
    laser_unit: 'Lasereinheit',
    pf_kit_1: 'Einzugskit Fach 1',
    pf_kit_mp: 'Einzugskit MF',
    waste_ink_box: 'Tintenauffang',
  },
  es: {
    black_cartridge: 'Negro',
    cyan_cartridge: 'Cian',
    magenta_cartridge: 'Magenta',
    yellow_cartridge: 'Amarillo',
    drum: 'Tambor',
    black_drum: 'Tambor negro',
    cyan_drum: 'Tambor cian',
    magenta_drum: 'Tambor magenta',
    yellow_drum: 'Tambor amarillo',
    belt: 'Correa',
    fuser: 'Fusión',
    laser_unit: 'Unidad láser',
    pf_kit_1: 'Kit bandeja 1',
    pf_kit_mp: 'Kit bandeja MP',
    waste_ink_box: 'Tinta residual',
  },
};

/** The standard printer alerts (hrPrinterDetectedErrorState), 40 characters at most. */
export const ERROR_NAMES = {
  en: {
    low_paper: 'Paper low',
    no_paper: 'Out of paper',
    low_toner: 'Toner or ink low',
    no_toner: 'Toner or ink empty',
    door_open: 'Cover open',
    jammed: 'Paper jam',
    offline: 'Offline',
    service_requested: 'Service requested',
    input_tray_missing: 'Paper tray missing',
    output_tray_missing: 'Output tray missing',
    marker_supply_missing: 'Cartridge missing',
    output_near_full: 'Output tray almost full',
    output_full: 'Output tray full',
    input_tray_empty: 'Paper tray empty',
    overdue_prevent_maint: 'Maintenance overdue',
  },
  fr: {
    low_paper: 'Papier bas',
    no_paper: 'Plus de papier',
    low_toner: 'Toner ou encre bas',
    no_toner: 'Toner ou encre vide',
    door_open: 'Capot ouvert',
    jammed: 'Bourrage papier',
    offline: 'Hors ligne',
    service_requested: 'Intervention demandée',
    input_tray_missing: 'Bac à papier absent',
    output_tray_missing: 'Bac de sortie absent',
    marker_supply_missing: 'Cartouche absente',
    output_near_full: 'Bac de sortie presque plein',
    output_full: 'Bac de sortie plein',
    input_tray_empty: 'Bac à papier vide',
    overdue_prevent_maint: 'Entretien en retard',
  },
  de: {
    low_paper: 'Wenig Papier',
    no_paper: 'Kein Papier',
    low_toner: 'Toner oder Tinte fast leer',
    no_toner: 'Toner oder Tinte leer',
    door_open: 'Abdeckung offen',
    jammed: 'Papierstau',
    offline: 'Offline',
    service_requested: 'Wartung angefordert',
    input_tray_missing: 'Papierfach fehlt',
    output_tray_missing: 'Ausgabefach fehlt',
    marker_supply_missing: 'Patrone fehlt',
    output_near_full: 'Ausgabefach fast voll',
    output_full: 'Ausgabefach voll',
    input_tray_empty: 'Papierfach leer',
    overdue_prevent_maint: 'Wartung überfällig',
  },
  es: {
    low_paper: 'Poco papel',
    no_paper: 'Sin papel',
    low_toner: 'Tóner o tinta bajo',
    no_toner: 'Tóner o tinta agotado',
    door_open: 'Cubierta abierta',
    jammed: 'Atasco de papel',
    offline: 'Fuera de línea',
    service_requested: 'Se solicita servicio técnico',
    input_tray_missing: 'Falta la bandeja de papel',
    output_tray_missing: 'Falta la bandeja de salida',
    marker_supply_missing: 'Falta un cartucho',
    output_near_full: 'Bandeja de salida casi llena',
    output_full: 'Bandeja de salida llena',
    input_tray_empty: 'Bandeja de papel vacía',
    overdue_prevent_maint: 'Mantenimiento atrasado',
  },
};

/** Published as the status of a printer that stopped answering. */
export const NOT_RESPONDING = {
  en: 'Not responding',
  fr: 'Ne répond pas',
  de: 'Antwortet nicht',
  es: 'No responde',
};

/** Connection status messages (Configuration screen). */
export const CONNECTION_TEXT = {
  noPrinter: {
    en: 'No Brother printer found yet: enter its IP address below, then save.',
    fr: 'Aucune imprimante Brother trouvée pour le moment : saisissez son adresse IP ci-dessous, puis enregistrez.',
    de: 'Noch kein Brother-Drucker gefunden: Gib unten seine IP-Adresse ein und speichere.',
    es: 'Aún no se ha encontrado ninguna impresora Brother: introduzca su dirección IP abajo y guarde.',
  },
  initFailed: {
    en: 'Initialization failed, check the integration logs.',
    fr: "L'initialisation a échoué, consultez les logs de l'intégration.",
    de: 'Initialisierung fehlgeschlagen, sieh dir die Protokolle der Integration an.',
    es: 'La inicialización ha fallado, consulte los registros de la integración.',
  },
};

/** Pieces of the widget, the action messages and the scene outputs. */
export const TEXT = {
  en: {
    noPrinter: 'No Brother printer in Gladys yet: add one from the Discover tab.',
    missing: 'This printer is no longer in Gladys: pick another one in the widget settings.',
    waiting: 'Waiting for the first reading of this printer.',
    state: 'Status',
    alerts: 'Alerts',
    pages: 'Pages printed',
    lastReading: 'Last reading',
    readNow: 'Read now',
    printerTypes: { laser: 'laser', ink: 'inkjet', unknown: 'type unknown' },
    found: (printer) =>
      `${printer.name} found (${printer.type}): status "${printer.status}", ${printer.pages}, ${printer.lowest}.`,
    pagesCount: (count) => `${count} pages printed`,
    noPages: 'no page counter',
    lowest: (name, percent) => `lowest supply: ${name} ${percent} %`,
    noLevel: 'no supply level',
    unknownStatus: 'unknown',
    noAnswer: (host) =>
      `No SNMP answer from ${host}: check the address, that SNMP is enabled on the printer and the community.`,
    unsupported: (host) =>
      `${host} answers SNMP but is not a Brother printer this integration can read.`,
    invalidHost: (host) => `"${host}" is not a valid IP address or host name.`,
    toast: (name, summary) => `${name}: ${summary}`,
    unreachableToast: (name) => `${name} is not responding.`,
  },
  fr: {
    noPrinter:
      "Pas encore d'imprimante Brother dans Gladys : ajoutez-en une depuis l'onglet Découverte.",
    missing:
      "Cette imprimante n'est plus dans Gladys : choisissez-en une autre dans les réglages du widget.",
    waiting: 'En attente du premier relevé de cette imprimante.',
    state: 'État',
    alerts: 'Alertes',
    pages: 'Pages imprimées',
    lastReading: 'Dernier relevé',
    readNow: 'Relire',
    printerTypes: { laser: 'laser', ink: 'jet d’encre', unknown: 'type inconnu' },
    found: (printer) =>
      `${printer.name} trouvée (${printer.type}) : état « ${printer.status} », ${printer.pages}, ${printer.lowest}.`,
    pagesCount: (count) => `${count} pages imprimées`,
    noPages: 'pas de compteur de pages',
    lowest: (name, percent) => `consommable le plus bas : ${name} ${percent} %`,
    noLevel: 'aucun niveau de consommable',
    unknownStatus: 'inconnu',
    noAnswer: (host) =>
      `Pas de réponse SNMP de ${host} : vérifiez l'adresse, que le SNMP est activé sur l'imprimante et la communauté.`,
    unsupported: (host) =>
      `${host} répond en SNMP mais n'est pas une imprimante Brother que cette intégration sait lire.`,
    invalidHost: (host) => `« ${host} » n'est pas une adresse IP ou un nom d'hôte valide.`,
    toast: (name, summary) => `${name} : ${summary}`,
    unreachableToast: (name) => `${name} ne répond pas.`,
  },
  de: {
    noPrinter: 'Noch kein Brother-Drucker in Gladys: Füge einen im Tab „Entdecken“ hinzu.',
    missing:
      'Dieser Drucker ist nicht mehr in Gladys: Wähle in den Widget-Einstellungen einen anderen.',
    waiting: 'Warte auf die erste Abfrage dieses Druckers.',
    state: 'Status',
    alerts: 'Meldungen',
    pages: 'Gedruckte Seiten',
    lastReading: 'Letzte Abfrage',
    readNow: 'Jetzt abfragen',
    printerTypes: { laser: 'Laser', ink: 'Tinte', unknown: 'Typ unbekannt' },
    found: (printer) =>
      `${printer.name} gefunden (${printer.type}): Status „${printer.status}“, ${printer.pages}, ${printer.lowest}.`,
    pagesCount: (count) => `${count} gedruckte Seiten`,
    noPages: 'kein Seitenzähler',
    lowest: (name, percent) => `niedrigster Füllstand: ${name} ${percent} %`,
    noLevel: 'kein Füllstand',
    unknownStatus: 'unbekannt',
    noAnswer: (host) =>
      `Keine SNMP-Antwort von ${host}: Prüfe die Adresse, ob SNMP am Drucker aktiviert ist, und die Community.`,
    unsupported: (host) =>
      `${host} antwortet per SNMP, ist aber kein Brother-Drucker, den diese Integration lesen kann.`,
    invalidHost: (host) => `„${host}“ ist keine gültige IP-Adresse und kein gültiger Hostname.`,
    toast: (name, summary) => `${name}: ${summary}`,
    unreachableToast: (name) => `${name} antwortet nicht.`,
  },
  es: {
    noPrinter:
      'Todavía no hay ninguna impresora Brother en Gladys: añada una desde la pestaña «Descubrir».',
    missing: 'Esta impresora ya no está en Gladys: elija otra en los ajustes del widget.',
    waiting: 'Esperando la primera lectura de esta impresora.',
    state: 'Estado',
    alerts: 'Alertas',
    pages: 'Páginas impresas',
    lastReading: 'Última lectura',
    readNow: 'Leer ahora',
    printerTypes: { laser: 'láser', ink: 'inyección de tinta', unknown: 'tipo desconocido' },
    found: (printer) =>
      `${printer.name} encontrada (${printer.type}): estado «${printer.status}», ${printer.pages}, ${printer.lowest}.`,
    pagesCount: (count) => `${count} páginas impresas`,
    noPages: 'sin contador de páginas',
    lowest: (name, percent) => `consumible más bajo: ${name} ${percent} %`,
    noLevel: 'ningún nivel de consumible',
    unknownStatus: 'desconocido',
    noAnswer: (host) =>
      `Ninguna respuesta SNMP de ${host}: compruebe la dirección, que SNMP esté activado en la impresora y la comunidad.`,
    unsupported: (host) =>
      `${host} responde por SNMP pero no es una impresora Brother que esta integración pueda leer.`,
    invalidHost: (host) => `«${host}» no es una dirección IP ni un nombre de host válido.`,
    toast: (name, summary) => `${name}: ${summary}`,
    unreachableToast: (name) => `${name} no responde.`,
  },
};

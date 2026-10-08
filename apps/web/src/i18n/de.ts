// Every user-visible string of the app. German, by product decision.
export const de = {
  app: {
    title: "Wohnungsplaner",
    loading: "Wohnung wird geladen …",
  },
  auth: {
    email: "E-Mail",
    password: "Passwort",
    signIn: "Anmelden",
    signingIn: "Anmeldung läuft …",
    signOut: "Abmelden",
    invalidCredentials: "E-Mail oder Passwort ist falsch.",
    networkError: "Keine Verbindung zum Server. Bitte Netzwerk prüfen und erneut versuchen.",
    unknownError: "Anmeldung fehlgeschlagen. Bitte erneut versuchen.",
    checkingSession: "Anmeldung wird geprüft …",
  },
  data: {
    noAccess: "Kein Zugriff auf Daten",
    noAccessHint: "Dieses Konto darf keine Wohnungsdaten lesen. Bitte mit dem Eigentümer-Konto anmelden.",
    noDocument: "Kein aktives Dokument",
    noDocumentHint: "Es ist noch keine Wohnung zum Anzeigen ausgewählt.",
    loadFailed: "Daten konnten nicht geladen werden.",
    retry: "Erneut versuchen",
  },
} as const;

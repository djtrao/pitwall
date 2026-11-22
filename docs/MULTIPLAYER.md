# Mehrspieler einrichten

Für Mehrspieler braucht Pit Wall einen kleinen Spiel-Server. Er läuft kostenlos bei
**Cloudflare** (Workers + Durable Objects): jedes Spiel bekommt einen eigenen „Raum“,
der das Rennen für alle Handys berechnet. Keine Kreditkarte nötig.

Das musst du **einmal** machen (ca. 10 Minuten). Danach aktualisiert GitHub den Server
automatisch bei jedem Merge.

## 1. Cloudflare-Konto

1. Auf <https://dash.cloudflare.com/sign-up> ein kostenloses Konto anlegen.
2. Links **Workers & Pages** öffnen. Beim ersten Mal fragt Cloudflare nach einer
   Subdomain (z. B. `meinname`) – die gehört später zur Server-Adresse.
3. Die **Account ID** kopieren: Sie steht auf der Seite **Workers & Pages** rechts
   (oder in der Adresszeile: `dash.cloudflare.com/<ACCOUNT-ID>/…`).

## 2. API-Token erstellen

1. Oben rechts auf das Profil-Symbol → **My Profile** → **API Tokens** → **Create Token**.
2. Vorlage **Edit Cloudflare Workers** → **Use template**.
3. Bei *Account Resources* dein Konto auswählen, bei *Zone Resources* „All zones“ lassen.
4. **Continue to summary** → **Create Token** → den Token **kopieren** (wird nur einmal angezeigt).

## 3. Beides bei GitHub eintragen

Im Repository: **Settings** → **Secrets and variables** → **Actions**.

Reiter **Secrets** → **New repository secret**, zweimal:

| Name | Wert |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | der Token aus Schritt 2 |
| `CLOUDFLARE_ACCOUNT_ID` | die Account ID aus Schritt 1 |

## 4. Server zum ersten Mal veröffentlichen

1. Reiter **Actions** → links **Deploy game server (Cloudflare)** → **Run workflow** → **Run workflow**.
2. Nach 1–2 Minuten grüner Haken ✅. Im Protokoll des Schritts *Deploy* steht die Adresse,
   z. B. `https://pitwall-server.meinname.workers.dev`.

## 5. Dem Spiel die Server-Adresse geben

1. Wieder **Settings** → **Secrets and variables** → **Actions**, diesmal Reiter **Variables**
   → **New repository variable**:
   - Name: `VITE_SERVER_URL`
   - Wert: die Adresse aus Schritt 4, aber mit **`wss://`** statt `https://`,
     z. B. `wss://pitwall-server.meinname.workers.dev`
2. **Actions** → **Deploy to GitHub Pages** → **Run workflow** (baut das Spiel mit der Adresse neu).

Fertig! Im Spiel: **Mehrspieler** → **Spiel erstellen** → Code oder QR-Code den anderen zeigen.

> Tipp: Ohne Schritt 5 kann man die Adresse auch im Spiel unter **Mehrspieler → Server-Adresse**
> eintragen (wird auf dem Handy gespeichert).

## Testen, ob der Server läuft

```bash
npx tsx scripts/mp-smoke.ts wss://pitwall-server.meinname.workers.dev
```

## Zuhause ohne Internet (Laptop im WLAN)

```bash
npm run server
```

```bash
npm run dev -- --host
```

Dann auf den Handys die Adresse öffnen, die `npm run dev` anzeigt (z. B. `http://192.168.1.20:5173`).
Das Spiel findet den Server auf dem Laptop von selbst.

## Kosten

Der kostenlose Cloudflare-Plan reicht für viele Stunden Rennen pro Tag. Ein Raum ist nur aktiv,
solange jemand verbunden ist.

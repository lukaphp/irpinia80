# Terremoto dell'Irpinia, 23 novembre 1980 — simulazione

Simulazione interattiva del sisma dell'Irpinia (Mw 6,9, X MCS): le tre rotture di faglia a 0, 20 e 40 s, la propagazione delle onde P e S, l'intensità MCS stimata, i crolli nei paesi del cratere e, nella seconda parte, i giorni dei soccorsi e il bilancio.

**▶ Demo: https://lukaphp.github.io/irpinia80/**
**▶ Vista 3D: https://lukaphp.github.io/irpinia80/3d/**

## Cosa contiene

- `index.html` — pagina e testi
- `style.css` — stile
- `data.js` — geometria della mappa, segmenti di faglia, paesi, eventi e bilancio
- `app.js` — modello di intensità, animazione su canvas, sismogramma sintetico, comandi
- `audio.mp3` — audio originale di Radio Alfa

Nessuna dipendenza né build: basta aprire `index.html` nel browser, oppure servire la cartella con `python3 -m http.server`.

## Vista 3D (`vista3d/`)

Un plastico navigabile costruito con [Reactylon](https://www.reactylon.com) (React + Babylon.js):

- **rilievo reale** dell'area (quote vere, esagerate 3 volte in altezza) e crosta fino a 20 km di profondità
- **sottosuolo**: crosta trasparente, i tre piani di faglia che si rompono, l'ipocentro a circa 12 km, le onde P e S come sfere che salgono in superficie
- **crolli**: le case tremano e crollano con la polvere, in proporzione all'intensità stimata
- **visita guidata**: la telecamera segue il racconto (faglie, poi i paesi del cratere, poi i soccorsi); basta toccare la scena per riprendere il controllo
- **audio originale di Radio Alfa**, sincronizzato come nella mappa 2D
- **VR e AR** (WebXR): se il dispositivo le supporta compaiono i pulsanti per vedere il plastico in un visore o sul tavolo

Usa lo stesso `data.js` della mappa 2D, quindi i dati restano in un solo posto.

```sh
cd vista3d
npm install
npm run dev          # sviluppo
npm run build        # produzione, in vista3d/dist
node scripts/build-dem.mjs <cartella-cache>   # rigenera public/dem.bin dalle Terrain Tiles
```

GitHub Pages viene pubblicato da `.github/workflows/pages.yml`, che compila la vista 3D e la mette in `/3d/`.

## Comandi

- **Pausa / Riprendi / Da capo**, velocità **1× 2× 4×**
- cursore per scorrere la timeline (0–90 s in tempo reale, poi ore e giorni in tempo accelerato)
- **Intensità** mostra o nasconde la mappa MCS
- **Ascolta l'audio** riproduce la registrazione originale di Radio Alfa, allineata alla scossa (che nell'audio inizia al secondo 10)
- **zoom**: rotella, pizzico (trackpad o due dita), doppio clic o pulsanti + − ⤢; trascina per spostarti
- tocca un paese sulla mappa per la sua scheda

## Avvertenze

L'intensità è calcolata con un modello semplificato di distanza dalla faglia, non con le isosiste storiche. Posizione dei segmenti, sismogramma e case sono illustrativi. I numeri del bilancio variano tra le fonti (vedi nota in fondo alla pagina).

**Fonti:** INGV, Protezione Civile, Commissario straordinario per il sisma, Westaway 1993, Bernard e Zollo 1989, Il Post, Sky TG24, AGI, MeteoWeb, Porfido et al. 2020.

**Audio:** registrazione originale di Radio Alfa.

**Dati altimetrici (vista 3D):** [Terrain Tiles](https://registry.opendata.aws/terrain-tiles/) su AWS Open Data, derivate da SRTM e altre fonti pubbliche.

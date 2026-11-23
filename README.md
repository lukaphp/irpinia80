# Terremoto dell'Irpinia, 23 novembre 1980 — simulazione

Simulazione interattiva del sisma dell'Irpinia (Mw 6,9, X MCS): le tre rotture di faglia a 0, 20 e 40 s, la propagazione delle onde P e S, l'intensità MCS stimata, i crolli nei paesi del cratere e, nella seconda parte, i giorni dei soccorsi e il bilancio.

**▶ Demo: https://lukaphp.github.io/irpinia80/**

## Cosa contiene

- `index.html` — pagina e testi
- `style.css` — stile
- `data.js` — geometria della mappa, segmenti di faglia, paesi, eventi e bilancio
- `app.js` — modello di intensità, animazione su canvas, sismogramma sintetico, comandi
- `audio.mp3` — audio originale di Radio Alfa

Nessuna dipendenza né build: basta aprire `index.html` nel browser, oppure servire la cartella con `python3 -m http.server`.

## Comandi

- **Pausa / Riprendi / Da capo**, velocità **1× 2× 4×**
- cursore per scorrere la timeline (0–90 s in tempo reale, poi ore e giorni in tempo accelerato)
- **Intensità** mostra o nasconde la mappa MCS
- **Ascolta l'audio** riproduce la registrazione originale di Radio Alfa, allineata alla scossa (che nell'audio inizia al secondo 10)
- **zoom**: pulsanti + − ⤢, doppio clic, Ctrl + rotella o due dita; trascina per spostarti
- tocca un paese sulla mappa per la sua scheda

## Avvertenze

L'intensità è calcolata con un modello semplificato di distanza dalla faglia, non con le isosiste storiche. Posizione dei segmenti, sismogramma e case sono illustrativi. I numeri del bilancio variano tra le fonti (vedi nota in fondo alla pagina).

**Fonti:** INGV, Protezione Civile, Commissario straordinario per il sisma, Westaway 1993, Bernard e Zollo 1989, Il Post, Sky TG24, AGI, MeteoWeb, Porfido et al. 2020.

**Audio:** registrazione originale di Radio Alfa.

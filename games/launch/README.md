# Módulo LAUNCH (lanzamiento) — versión 2: Phaser e interactivo

Página: `/games/launch/` desde la consola de lanzamiento de Mission Control. El simulador está en español.

Un juego de Phaser 3 en el que eliges el cohete, revisas que tu nave quepa y **pilotas el lanzamiento** hasta la órbita (vista lateral 2D, empuje, giro, separación de etapas, mapa de la órbita y aceleración del tiempo). Funciona con teclado y con pantalla táctil.

| Carpeta / archivo | Qué contiene |
|---|---|
| `index.html`, `styles.css` | Marco del juego: canvas de Phaser + paneles HTML encima. |
| Phaser | Usa la dependencia Phaser 3.90.0 del proyecto (MIT), empaquetada por Vite. |
| `js/main.js`, `js/scenes/` | Escenas: Boot, Briefing (misión), Hangar (catálogo y revisión), Pad (plataforma), Flight (vuelo), Map (órbita), Result. |
| `js/flight.js` | **Física del vuelo** pura (sin Phaser): gravedad, empuje, aire, Max-Q, etapas, órbita, piloto automático, puntaje. |
| `js/outcome.js` | Imprevistos del vuelo y traducción del vuelo al resultado del juego. |
| `js/rules.js` | Motor de reglas (compatibilidad, margen, costo, calendario, probabilidades). |
| `js/state.js` | Contrato de entrada/salida (`localStorage["spaceMission.state.v1"].launch`, `schemaVersion: 2`). |
| `js/screens.js`, `js/hud.js`, `js/ui.js`, `js/plain.js`, `js/store.js`, `js/flow.js` | Pantallas y controles, glosario, comparaciones cotidianas, estado y flujo. |
| `data/*.json` | Cifras y textos ajustables. `flight.json` (diseños de cohete) y `flight-calibration.json` (generado). |
| `tests/` | `node --test games/launch/tests/` y `calibrate.mjs`. |
| `practica-ascenso.html` | Minijuego anterior de empuje/ángulo, conservado como práctica bilingüe. |

Parámetros de URL para probar: `?scenario=cubesat|smallsat|equatorial|oceans|geo|moon|mars&difficulty=facil|normal|dificil`.

Si cambias la física (`js/flight.js`) o los diseños (`data/flight.json`), vuelve a calibrar contra el catálogo:

```bash
node games/launch/tests/calibrate.mjs
```

Para agregar un lanzador: copia un bloque en `data/launchers.json`, completa `sources` y `dataQuality`, agrega su diseño de etapas en `data/flight.json`, su `id` en las dificultades de `data/rules.json` y corre la calibración.

Documentación completa: `LAUNCH_CHANGES.md` en la raíz del repositorio.

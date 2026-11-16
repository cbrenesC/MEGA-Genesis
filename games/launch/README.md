# Módulo LAUNCH (lanzamiento) — versión 2: Phaser e interactivo

Prepara la misión en las cuatro estaciones de la izquierda de Mission Control y confirma el plan en Revisión de vuelo. La consola amarilla de lanzamiento abre `/games/launch/` con el plan y arranca la cuenta regresiva. Las estaciones y el simulador conservan el idioma seleccionado en el centro de control. En la campaña lunar, el resultado y el diseño de la carga habilitan la operación del rover cuando la entrega es exitosa.

Un juego de Phaser 3 en el que eliges el cohete y revisas la carga en el centro de control. Después **pilotas el lanzamiento** hasta la órbita (vista lateral 2D, empuje, giro, separación de etapas, mapa de la órbita y aceleración del tiempo). Funciona con teclado y con pantalla táctil.

| Carpeta / archivo | Qué contiene |
|---|---|
| `index.html`, `styles.css` | Marco del juego: canvas de Phaser + paneles HTML encima. |
| Phaser | Usa la dependencia Phaser 3.90.0 del proyecto (MIT), empaquetada por Vite. |
| `js/main.js`, `js/scenes/` | Escenas: Boot (validación del plan), Pad (plataforma), Flight (vuelo), Map (órbita), Result. |
| `js/flight.js` | **Física del vuelo** pura (sin Phaser): gravedad, empuje, aire, Max-Q, etapas, órbita, piloto automático, puntaje. |
| `js/outcome.js` | Imprevistos del vuelo y traducción del vuelo al resultado del juego. |
| `js/rules.js` | Motor de reglas (compatibilidad, margen, costo, calendario, probabilidades). |
| `js/state.js` | Contrato de entrada/salida (`localStorage["spaceMission.state.v1"].launch`, `schemaVersion: 2`). |
| `js/screens.js`, `js/hud.js`, `js/ui.js`, `js/plain.js`, `js/store.js`, `js/flow.js` | Telemetría, controles, resultados, glosario, comparaciones cotidianas, estado y flujo. |
| `data/*.json` | Cifras y textos ajustables. `flight.json` (diseños de cohete) y `flight-calibration.json` (generado). |
| `tests/` | `node --test games/launch/tests/` y `calibrate.mjs`. |
| `practica-ascenso.html` | Minijuego anterior de empuje/ángulo, conservado como práctica bilingüe. |

Los enlaces de vuelo sin un plan confirmado indican cómo preparar la misión en el centro de control.

Si cambias la física (`js/flight.js`) o los diseños (`data/flight.json`), vuelve a calibrar contra el catálogo:

```bash
node games/launch/tests/calibrate.mjs
```

Para agregar un lanzador: copia un bloque en `data/launchers.json`, completa `sources` y `dataQuality`, agrega su diseño de etapas en `data/flight.json`, su `id` en las dificultades de `data/rules.json` y corre la calibración.

Documentación completa: `LAUNCH_CHANGES.md` en la raíz del repositorio.

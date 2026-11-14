# Módulo LAUNCH (segmento de lanzamiento)

Página: `/games/launch/` (en `npm run dev`: `/games/launch/index.html`).

| Carpeta / archivo | Qué contiene |
|---|---|
| `index.html`, `styles.css` | Interfaz en 5 pasos: Misión → Lanzador → Compatibilidad → Lanzamiento → Resultado. |
| `js/rules.js` | Motor de reglas puro (sin DOM): compatibilidad, margen, costo, calendario, eventos, simulación. |
| `js/state.js` | Contrato de entrada/salida con el estado compartido (`localStorage["spaceMission.state.v1"]`). |
| `js/sequence.js` | Animación en canvas de la secuencia de lanzamiento. |
| `js/main.js` | Controlador de la interfaz. |
| `data/*.json` | Todas las cifras y textos ajustables (lanzadores con fuentes, sitios, órbitas, reglas, misiones NASA, glosario, mocks). |
| `tests/rules.test.mjs` | Pruebas: `node --test public/games/launch/tests/` |
| `practica-ascenso.html` | Minijuego anterior de empuje/ángulo, conservado como práctica. |

Parámetros de URL para probar: `?scenario=mars&difficulty=dificil` (escenarios en `data/mock-missions.json`).

Para agregar un lanzador: copia un bloque en `data/launchers.json`, completa `sources` y `dataQuality`, y agrega su `id` a las dificultades que quieras en `data/rules.json`.

Documentación completa: `LAUNCH_CHANGES.md` en la raíz del repositorio.

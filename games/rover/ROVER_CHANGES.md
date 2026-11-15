# Módulo lunar (rover) — informe de cambios

En `main`, la consola lunar abre `/games/rover/` y enlaza a la práctica bilingüe anterior. El simulador nuevo está en español, usa el Phaser de `package.json` e incluye sus pruebas en `npm test`.

## Hallazgo previo
El módulo descrito en el encargo (briefing + constructor con 145 kg / 850 créditos + Phaser) **no existía en ninguna rama**
del repositorio. `public/games/rover/index.html` era un canvas 2D de ~40 líneas (sin construcción, sin análisis ni transmisión).
Se reconstruyó sobre Phaser conservando lo útil: 4 cráteres (reescalados), 3 objetivos de muestras, WASD/flechas, cruceta táctil,
batería y reinicio. **Si tienes otra copia con el módulo original, estos cambios no se le aplican.**

## Estructura
- `js/rules.js` — reglas deterministas (sin DOM/Phaser/azar): catálogo, límites, energía, muestras, evaluación, guardado.
- `js/art.js` — pixel art por código (rover según configuración, terreno, muestras); lo usan la vista previa y Phaser.
- `js/main.js` — escenas Phaser (fondo, exploración) + pantallas HTML (briefing, construcción, HUD, resultados).
- `tests/index.html` — 19 pruebas de reglas (en `npm test` o en desarrollo, `/games/rover/tests/index.html`).

## Errores corregidos / decisiones
| Área | Causa que se evita | Cambio |
|---|---|---|
| Construcción | Totales sumados incrementalmente al pulsar | `selectComponent` reemplaza; `computeBuild` recalcula siempre desde la configuración |
| Botones | Zonas clicables desacopladas del dibujo | Tarjetas HTML reales (`role=radio`), sin paneles invisibles, delegación de eventos registrada una vez |
| Inicio | Botón sin motivo | `aria-disabled` + motivo exacto (falta categoría, exceso de kg/créditos); se revalida al pulsar |
| Muestras | Dibujo independiente del estado | Cada muestra tiene id y estado (`available→collected→analyzed→transmitted`); el sprite se destruye derivándose del estado; transición única protegida |
| Recoger ≠ analizar | — | Progreso científico = muestras únicas analizadas; objetivo = 3 transmitidas |
| Fallos | — | Moverse, falta de energía o lejanía cancelan sin tocar la muestra ni el contador |
| Pausa | Temporizadores reales | Toda la simulación usa `dt` acumulado; en pausa no avanza nada (también al perder foco/pestaña) |
| Energía | — | Acotada 0..capacidad; recarga solar solo detenido; acciones bloqueadas con explicación |
| Guardado | — | Snapshot validado; restaura estados y no dibuja muestras recogidas; nueva misión lo borra |
| Evaluación | — | `evaluate()` determinista; no hay agente de IA en el módulo, por lo que las sugerencias salen de reglas fijas |

## Pruebas
- 19/19 pruebas de reglas (selección, reemplazo, pulsaciones repetidas, límites, recoger/analizar/transmitir, energía, colisiones, tiempo, guardado).
- En navegador: construcción con clics reales, tecla E mantenida (1 sola recolección, sprite 4→3), pausa congela acción y reloj,
  ciclo completo → resultados (628 pts), reintento limpio, 4 vueltas entre pantallas sin duplicar eventos, guardar/recargar/continuar,
  móvil 375×812 y redimensionado en vivo (cámara entre las franjas del HUD), 20/20 zonas clicables del constructor correctas.

## Alcance de la verificación original de la rama
- Las pruebas de navegador descritas arriba corresponden al prototipo estático anterior a la integración con Vite.
- En el prototipo original no se capturó con las 4 imágenes de referencia
  (no estaban disponibles como archivos), el estilo se infirió de la descripción y del módulo `launch`.
- Sin audio ni pruebas en dispositivo táctil real (solo emulación).

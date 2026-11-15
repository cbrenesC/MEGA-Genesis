# Space Mission · MEGA Genesis

Juego web en pixel art con un centro de control explorable hecho en Phaser 3. Ocho consolas explican el diseño de misiones espaciales y enlazan a recursos de la NASA. Las dos consolas principales abren las misiones de lanzamiento y rover lunar.

## Ejecutar localmente

```sh
npm ci
npm run dev
```

Ejecuta `npm run build` para generar el sitio estático en `dist/`, listo para Netlify. Puedes revisarlo con `npm run preview`.

## Cómo jugar

- **WASD o flechas** para caminar. En móviles, usa el pad táctil.
- **E** cerca de un personaje para hablar o cerca de una consola para abrirla. En móviles, usá **Usar**. Seleccioná **Start Mission** en una consola de misión.
- **Esc** para cerrar un diálogo o pausar y reanudar el recorrido.
- La introducción del comandante se puede saltar y no aparece si desactivas **Animaciones y video**.
- El menú **Juegos** ofrece acceso directo a ambas misiones.

Las misiones de lanzamiento y rover están en `games/launch/` y `games/rover/`, respectivamente.

El botón ⛶ abre el centro de control en pantalla completa. En ventanas anchas se encuadra toda la sala. En pantallas compactas, la cámara sigue al astronauta para conservar la legibilidad.

## Pantalla de anuncios

Acercate al escritorio central debajo de la pantalla y presioná **E** o **Usar**. Podés publicar un texto de hasta 180 caracteres, mostrar una imagen (PNG, JPG, WebP) o cargar y reproducir un video (MP4, WebM) sin sonido. **Restaurar vista orbital** recupera la ilustración Tierra–Luna. Los anuncios y archivos elegidos se muestran solo en el dispositivo durante la visita. Para configurar un archivo inicial para todos los jugadores, configurá `GAME.media.src` en `src/config.js` o asigná una clave bilingüe a `GAME.media.announcementKey` para mostrar un anuncio de texto inicial.

El astronauta y los cuatro tripulantes del centro de control (Durman, Josué, Luis Eduardo y Johana) usan los sprites cenitales de `demogame`. Cada tripulante recorre una ruta corta y se detiene al acercarte. La señal sobre el personaje o la consola más próxima indica que podés interactuar con **E**, **Usar** o tocando la señal. Cada tripulante ofrece tres consejos sobre su área y un recurso de la NASA. La opción **Animaciones y video** desactiva los recorridos, destellos y el movimiento de las señales, sin bloquear la interacción.

## Idiomas

El juego incluye inglés (predeterminado) y español. Podés cambiar el idioma durante la bienvenida, en Configuración o en cualquiera de las dos misiones. Los enlaces conservan el idioma mediante `?lang=en` o `?lang=es`, incluso si decidís jugar sin guardar. Con tu permiso, el navegador también recuerda la selección para próximas visitas.

Los textos de interfaz, del canvas y los subtítulos viven en `src/i18n/en.json` y `src/i18n/es.json`. Cada texto nuevo debe tener la misma clave en ambos catálogos. Usá `data-i18n` para texto estático, `data-i18n-aria` para etiquetas accesibles y `t()` para mensajes dinámicos. El video del comandante conserva su audio original y usa subtítulos sincronizados en ambos idiomas.

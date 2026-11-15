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
- **E** para abrir la consola más cercana. Selecciona **Start Mission** en una consola de misión.
- **Esc** para cerrar la consola o pausar y reanudar el recorrido.
- La introducción del comandante se puede saltar y no aparece si desactivas **Animaciones y video**.
- El menú **Juegos** ofrece acceso directo a ambas misiones.

Las misiones de lanzamiento y rover están en `public/games/launch/` y `public/games/rover/`, respectivamente.

## Idiomas

El juego incluye inglés (predeterminado) y español. Podés cambiar el idioma durante la bienvenida, en Configuración o en cualquiera de las dos misiones. Los enlaces conservan el idioma mediante `?lang=en` o `?lang=es`, incluso si decidís jugar sin guardar. Con tu permiso, el navegador también recuerda la selección para próximas visitas.

Los textos de interfaz, del canvas y los subtítulos viven en `src/i18n/en.json` y `src/i18n/es.json`. Cada texto nuevo debe tener la misma clave en ambos catálogos. Usá `data-i18n` para texto estático, `data-i18n-aria` para etiquetas accesibles y `t()` para mensajes dinámicos. El video del comandante conserva su audio original y usa subtítulos sincronizados en ambos idiomas.

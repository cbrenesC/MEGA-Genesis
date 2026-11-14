// Carga de los archivos de datos. `readJson` se inyecta para poder usar el mismo
// código en el navegador (fetch) y en las pruebas de Node (fs).
export async function loadGameData(readJson) {
  const [launchers, config, references, glossary] = await Promise.all([
    readJson('launchers.json'),
    readJson('config.json'),
    readJson('reference-missions.json'),
    readJson('glossary.json'),
  ]);
  return { meta: launchers.meta, launchers: launchers.launchers, config, references, glossary };
}

export const browserReadJson = async (name) => {
  const res = await fetch(new URL(`../data/${name}`, import.meta.url));
  if (!res.ok) throw new Error(`No se pudo cargar data/${name} (${res.status})`);
  return res.json();
};

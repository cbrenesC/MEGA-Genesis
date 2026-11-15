import { getPreferences, hasStorageConsent, updatePreferences } from '../core/consent.js';

export const LANGUAGES = [
  { code:'en', name:'English' }, { code:'es', name:'Español' },
  { code:'pt', name:'Português' }, { code:'de', name:'Deutsch' },
  { code:'it', name:'Italiano' }, { code:'zh', name:'中文（简体）' },
  { code:'ja', name:'日本語' },
];

/** Built-in guaranteed strings for onboarding and core controls.
 * The rest of the game uses the shared runtime translator below.
 */
const PACKS = {
  en:{
    "Un juego de ingeniería aeroespacial y exploración": "A game about aerospace engineering and exploration",
    "Desde el centro de control, prepara el lanzamiento de un cohete y dirige una misión con un rover lunar.": "From the control center, prepare a rocket launch and lead a lunar rover mission.",
    "TECNOLOGÍA": "TECHNOLOGY",
    "Arte pixel art generado por procedimiento para esta misión.": "Pixel art generated procedurally for this mission.",
    "Gracias por jugar.": "Thanks for playing.",
    'CARGANDO MISIÓN':'LOADING MISSION', 'DESCARGANDO RECURSOS':'DOWNLOADING ASSETS',
    'PREPARANDO AUDIO Y VIDEO':'PREPARING AUDIO AND VIDEO','RENDERIZANDO ENTORNOS':'RENDERING ENVIRONMENTS',
    'SISTEMAS LISTOS':'SYSTEMS READY','IDIOMA Y SONIDO':'LANGUAGE & AUDIO',
    'IDIOMA':'LANGUAGE','MÚSICA':'MUSIC','NOTIFICACIONES Y EFECTOS':'NOTIFICATIONS & EFFECTS',
    'CONTINUAR':'CONTINUE','GUARDADO, PERMISOS Y TÉRMINOS':'SAVES, PERMISSIONS & TERMS',
    'ACEPTAR Y CONTINUAR':'ACCEPT & CONTINUE','CONTINUAR SIN GUARDAR':'CONTINUE WITHOUT SAVING',
    'PERMITIR AUDIO':'ENABLE AUDIO','PERMITIR ANIMACIONES Y VIDEO':'ENABLE ANIMATIONS & VIDEO',
    'UNA MISIÓN ESTÁ POR COMENZAR':'A MISSION IS ABOUT TO BEGIN',
    'COMPUTADORA RECOMENDADA':'DESKTOP RECOMMENDED','AUDÍFONOS RECOMENDADOS':'HEADPHONES RECOMMENDED',
    'GIRA TU TELÉFONO PARA JUGAR EN HORIZONTAL':'ROTATE YOUR PHONE TO LANDSCAPE',
    'NUEVA MISIÓN':'NEW MISSION','CONTINUAR MISIÓN':'RESUME MISSION','SIN PARTIDA GUARDADA':'NO SAVED GAME',
    'CONTROLES':'CONTROLS','CRÉDITOS':'CREDITS','COORDINACIÓN Y DESPEGUE':'LAUNCH COORDINATION',
    'PROGRAMA ESPACIAL · NIVEL 1':'SPACE PROGRAM · LEVEL 1',
    'CONFIGURACIÓN':'SETTINGS','ANIMACIONES / VIDEO':'ANIMATIONS / VIDEO',
    'BORRAR PREFERENCIAS':'RESET PREFERENCES','TÉRMINOS Y CONDICIONES':'TERMS & CONDITIONS',
    'PERMITIR GUARDAR PARTIDAS':'ALLOW GAME SAVES','OMITIR INTRODUCCIÓN':'SKIP INTRO',
    'Partidas y preferencias: almacenamiento autorizado':'Saves and preferences: storage authorized',
    'Sin permiso: las partidas y preferencias no se guardarán':'Without permission, saves and preferences will not be stored',
    'WASD mover':'WASD move','GIRA EL DISPOSITIVO PARA JUGAR EN HORIZONTAL':'ROTATE DEVICE TO LANDSCAPE',
  },
  es:{},
  pt:{
    "Un juego de ingeniería aeroespacial y exploración": "Um jogo de engenharia aeroespacial e exploração",
    "Desde el centro de control, prepara el lanzamiento de un cohete y dirige una misión con un rover lunar.": "No centro de controle, prepare o lançamento de um foguete e lidere uma missão com um rover lunar.",
    "TECNOLOGÍA": "TECNOLOGIA",
    "Arte pixel art generado por procedimiento para esta misión.": "Pixel art gerada proceduralmente para esta missão.",
    "Gracias por jugar.": "Obrigado por jogar.",
    'CARGANDO MISIÓN':'CARREGANDO MISSÃO','IDIOMA Y SONIDO':'IDIOMA E ÁUDIO',
    'IDIOMA':'IDIOMA','MÚSICA':'MÚSICA','NOTIFICACIONES Y EFECTOS':'NOTIFICAÇÕES E EFEITOS',
    'CONTINUAR':'CONTINUAR','GUARDADO, PERMISOS Y TÉRMINOS':'SALVAMENTO, PERMISSÕES E TERMOS',
    'ACEPTAR Y CONTINUAR':'ACEITAR E CONTINUAR','CONTINUAR SIN GUARDAR':'CONTINUAR SEM SALVAR',
    'COMPUTADORA RECOMENDADA':'COMPUTADOR RECOMENDADO','AUDÍFONOS RECOMENDADOS':'FONES RECOMENDADOS',
    'UNA MISIÓN ESTÁ POR COMENZAR':'UMA MISSÃO ESTÁ PRESTES A COMEÇAR',
    'NUEVA MISIÓN':'NOVA MISSÃO','CONTINUAR MISIÓN':'CONTINUAR MISSÃO','CONTROLES':'CONTROLES','CRÉDITOS':'CRÉDITOS',
    'CONFIGURACIÓN':'CONFIGURAÇÕES','TÉRMINOS Y CONDICIONES':'TERMOS E CONDIÇÕES',
  },
  de:{
    "Un juego de ingeniería aeroespacial y exploración": "Ein Spiel über Raumfahrttechnik und Erkundung",
    "Desde el centro de control, prepara el lanzamiento de un cohete y dirige una misión con un rover lunar.": "Bereite im Kontrollzentrum einen Raketenstart vor und leite eine Mission mit einem Mondrover.",
    "TECNOLOGÍA": "TECHNOLOGIE",
    "Arte pixel art generado por procedimiento para esta misión.": "Prozedural erzeugte Pixelgrafik für diese Mission.",
    "Gracias por jugar.": "Danke fürs Spielen.",
    "VOLVER": "ZURÜCK",
    'CARGANDO MISIÓN':'MISSION WIRD GELADEN','IDIOMA Y SONIDO':'SPRACHE & AUDIO',
    'IDIOMA':'SPRACHE','MÚSICA':'MUSIK','NOTIFICACIONES Y EFECTOS':'MELDUNGEN & EFFEKTE',
    'CONTINUAR':'WEITER','GUARDADO, PERMISOS Y TÉRMINOS':'SPEICHERUNG, RECHTE & BEDINGUNGEN',
    'ACEPTAR Y CONTINUAR':'AKZEPTIEREN & WEITER','CONTINUAR SIN GUARDAR':'OHNE SPEICHERN FORTFAHREN',
    'COMPUTADORA RECOMENDADA':'COMPUTER EMPFOHLEN','AUDÍFONOS RECOMENDADOS':'KOPFHÖRER EMPFOHLEN',
    'UNA MISIÓN ESTÁ POR COMENZAR':'EINE MISSION BEGINNT GLEICH',
    'NUEVA MISIÓN':'NEUE MISSION','CONTINUAR MISIÓN':'MISSION FORTSETZEN','CONTROLES':'STEUERUNG','CRÉDITOS':'MITWIRKENDE',
    'CONFIGURACIÓN':'EINSTELLUNGEN','TÉRMINOS Y CONDICIONES':'NUTZUNGSBEDINGUNGEN',
  },
  it:{
    "Un juego de ingeniería aeroespacial y exploración": "Un gioco di ingegneria aerospaziale ed esplorazione",
    "Desde el centro de control, prepara el lanzamiento de un cohete y dirige una misión con un rover lunar.": "Dal centro di controllo, prepara il lancio di un razzo e guida una missione con un rover lunare.",
    "TECNOLOGÍA": "TECNOLOGIA",
    "Arte pixel art generado por procedimiento para esta misión.": "Pixel art generata proceduralmente per questa missione.",
    "Gracias por jugar.": "Grazie per aver giocato.",
    "VOLVER": "INDIETRO",
    'CARGANDO MISIÓN':'CARICAMENTO MISSIONE','IDIOMA Y SONIDO':'LINGUA E AUDIO',
    'IDIOMA':'LINGUA','MÚSICA':'MUSICA','NOTIFICACIONES Y EFECTOS':'NOTIFICHE ED EFFETTI',
    'CONTINUAR':'CONTINUA','GUARDADO, PERMISOS Y TÉRMINOS':'SALVATAGGI, PERMESSI E TERMINI',
    'ACEPTAR Y CONTINUAR':'ACCETTA E CONTINUA','CONTINUAR SIN GUARDAR':'CONTINUA SENZA SALVARE',
    'COMPUTADORA RECOMENDADA':'COMPUTER CONSIGLIATO','AUDÍFONOS RECOMENDADOS':'CUFFIE CONSIGLIATE',
    'UNA MISIÓN ESTÁ POR COMENZAR':'UNA MISSIONE STA PER INIZIARE',
    'NUEVA MISIÓN':'NUOVA MISSIONE','CONTINUAR MISIÓN':'RIPRENDI MISSIONE','CONTROLES':'COMANDI','CRÉDITOS':'CREDITI',
    'CONFIGURACIÓN':'IMPOSTAZIONI','TÉRMINOS Y CONDICIONES':'TERMINI E CONDIZIONI',
  },
  zh:{
    "Un juego de ingeniería aeroespacial y exploración": "一款关于航天工程与探索的游戏",
    "Desde el centro de control, prepara el lanzamiento de un cohete y dirige una misión con un rover lunar.": "在控制中心准备火箭发射，并指挥月球车执行任务。",
    "TECNOLOGÍA": "技术",
    "Arte pixel art generado por procedimiento para esta misión.": "为本次任务以程序生成的像素美术。",
    "Gracias por jugar.": "感谢游玩。",
    "VOLVER": "返回",
    'CARGANDO MISIÓN':'正在加载任务','IDIOMA Y SONIDO':'语言与音频','IDIOMA':'语言','MÚSICA':'音乐',
    'NOTIFICACIONES Y EFECTOS':'通知与音效','CONTINUAR':'继续','GUARDADO, PERMISOS Y TÉRMINOS':'存档、权限与条款',
    'ACEPTAR Y CONTINUAR':'接受并继续','CONTINUAR SIN GUARDAR':'不保存继续',
    'COMPUTADORA RECOMENDADA':'推荐使用电脑','AUDÍFONOS RECOMENDADOS':'推荐使用耳机',
    'UNA MISIÓN ESTÁ POR COMENZAR':'一场任务即将开始',
    'NUEVA MISIÓN':'新任务','CONTINUAR MISIÓN':'继续任务','CONTROLES':'操作说明','CRÉDITOS':'制作人员',
    'CONFIGURACIÓN':'设置','TÉRMINOS Y CONDICIONES':'条款和条件',
  },
  ja:{
    "Un juego de ingeniería aeroespacial y exploración": "宇宙工学と探査をテーマにしたゲーム",
    "Desde el centro de control, prepara el lanzamiento de un cohete y dirige una misión con un rover lunar.": "管制センターでロケットの打ち上げを準備し、月面ローバーのミッションを指揮しよう。",
    "TECNOLOGÍA": "使用技術",
    "Arte pixel art generado por procedimiento para esta misión.": "このミッションのために手続き的に生成したピクセルアート。",
    "Gracias por jugar.": "プレイしてくれてありがとう。",
    "VOLVER": "戻る",
    'CARGANDO MISIÓN':'ミッションを読み込み中','IDIOMA Y SONIDO':'言語と音声',
    'IDIOMA':'言語','MÚSICA':'音楽','NOTIFICACIONES Y EFECTOS':'通知と効果音',
    'CONTINUAR':'続ける','GUARDADO, PERMISOS Y TÉRMINOS':'セーブ・許可・利用規約',
    'ACEPTAR Y CONTINUAR':'同意して続ける','CONTINUAR SIN GUARDAR':'保存せずに続ける',
    'COMPUTADORA RECOMENDADA':'パソコン推奨','AUDÍFONOS RECOMENDADOS':'ヘッドホン推奨',
    'UNA MISIÓN ESTÁ POR COMENZAR':'もうすぐミッションが始まる',
    'NUEVA MISIÓN':'新しいミッション','CONTINUAR MISIÓN':'ミッション再開',
    'CONTROLES':'操作方法','CRÉDITOS':'クレジット','CONFIGURACIÓN':'設定',
    'TÉRMINOS Y CONDICIONES':'利用規約',
  },
};


/* Guaranteed English copy for the complete first-visit consent and title. */
Object.assign(PACKS.en, {
  'Space Mission utiliza almacenamiento local para guardar partidas y preferencias. Una cookie recuerda tu autorización; también puedes jugar sin guardar el progreso.':
    'Space Mission uses local browser storage to save progress and preferences. A cookie remembers your consent; you can also play without saving.',
  'Acepto los términos: Space Mission es una simulación de ingeniería espacial. Guardar es opcional; el audio y las animaciones dependen del navegador. Las traducciones se realizan con recursos incluidos o funciones locales disponibles.':
    'I agree to the terms: Space Mission is a space engineering simulation. Saving is optional; audio and animations depend on browser support. Translations use bundled resources or available on-device tools.',
  'El cohete espera en la plataforma. Explora el centro espacial, diseña la nave, carga el propelente, repara los sistemas averiados, elige una ventana segura y firma la autorización final.':
    'The rocket awaits on the launchpad. Explore the space center, design the spacecraft, load propellant, repair faulty systems, choose a safe launch window and approve launch.',
  'Música y sonido del juego':'Music and game sound',
  'Videos y animaciones del juego':'Game animations and videos',
  'Volumen de música':'Music volume',
  'Notificaciones y efectos':'Notifications and effects',
  'Sin permiso: las partidas y preferencias no se guardarán':'Without permission, saves and preferences will not be stored',
  'PREPARANDO ANIMACIONES':'PREPARING ANIMATIONS',
  'ALMACENANDO RECURSOS':'CACHING ASSETS',
  'DESCARGANDO RECURSOS':'DOWNLOADING ASSETS',
  'RENDERIZANDO ENTORNOS':'RENDERING ENVIRONMENTS',
  'SISTEMAS LISTOS':'SYSTEMS READY',
  'NAVE A LA DERIVA':'STRANDED SPACECRAFT',
  'RELOJ':'CLOCK','PRESUPUESTO':'BUDGET','VENTANA':'LAUNCH WINDOW',
  'PROPELENTE':'PROPELLANT','REPUESTOS':'SPARE PARTS',
  'SISTEMAS':'SYSTEMS','OXÍGENO':'OXYGEN','ENERGÍA':'ENERGY',
  'COMBUSTIBLE':'FUEL','AGUA':'WATER','ALIMENTOS':'FOOD',
  'INTEGRIDAD':'INTEGRITY','SALUD':'HEALTH',
});



// Localized onboarding and operational labels are bundled for immediate display.
// They never depend on a third-party translation request.
const SHARED_LABELS = {
  en: {
    'AUDIO':'AUDIO','ANIMACIONES Y VIDEO':'ANIMATIONS & VIDEO',
    'PREPARANDO TRADUCCIONES':'PREPARING LANGUAGE',
    'OPTIMIZANDO TEXTOS DEL JUEGO':'PREPARING GAME TEXT',
    'IDIOMA LISTO':'LANGUAGE READY',
    'IDIOMA PREPARADO · ALGUNOS TEXTOS NO DISPONIBLES':'LANGUAGE READY · SOME TEXTS UNAVAILABLE',
    'PERMITIR AUDIO':'ENABLE AUDIO','PERMITIR ANIMACIONES Y VIDEO':'ENABLE ANIMATIONS & VIDEO',
    'Volumen de música':'Music volume','Notificaciones y efectos':'Notifications & effects',
    'Idioma':'Language','Configuración':'Settings',
    'Música y sonido del juego':'Music and game audio',
    'Elegir idioma del juego':'Choose the game language',
    'Videos y animaciones del juego':'In-game animations and video',
    'AUDIO Y VIDEO':'AUDIO & VIDEO',
    'Space Mission utiliza almacenamiento local para guardar partidas y preferencias. Una cookie recuerda tu autorización; también puedes jugar sin guardar el progreso.':
      'Space Mission uses local browser storage for saved games and preferences. A cookie remembers your consent. You can also play without saving progress.',
    'Acepto los términos: Space Mission es una simulación de ingeniería espacial. Guardar es opcional; el audio y las animaciones dependen del navegador. Las traducciones se realizan con recursos incluidos o funciones locales disponibles.':
      'I agree to the terms: Space Mission simulates space engineering. Saving is optional; audio and animations depend on browser support. Translations use bundled resources or available on-device tools.',
  },
  pt: {
    'AUDIO':'ÁUDIO','ANIMACIONES Y VIDEO':'ANIMAÇÕES E VÍDEO',
    'PREPARANDO TRADUCCIONES':'PREPARANDO IDIOMA',
    'OPTIMIZANDO TEXTOS DEL JUEGO':'PREPARANDO TEXTOS DO JOGO',
    'IDIOMA LISTO':'IDIOMA PRONTO',
    'IDIOMA PREPARADO · ALGUNOS TEXTOS NO DISPONIBLES':'IDIOMA PRONTO · ALGUNS TEXTOS INDISPONÍVEIS',
    'PERMITIR AUDIO':'ATIVAR ÁUDIO','PERMITIR ANIMACIONES Y VIDEO':'ATIVAR ANIMAÇÕES E VÍDEO',
    'Volumen de música':'Volume da música','Notificaciones y efectos':'Notificações e efeitos',
    'Música y sonido del juego':'Música e sons do jogo',
    'Elegir idioma del juego':'Escolher idioma do jogo',
    'Videos y animaciones del juego':'Animações e vídeos do jogo',
    'Space Mission utiliza almacenamiento local para guardar partidas y preferencias. Una cookie recuerda tu autorización; también puedes jugar sin guardar el progreso.':
      'Space Mission usa o armazenamento local do navegador para salvar partidas e preferências. Um cookie memoriza seu consentimento. Você também pode jogar sem salvar.',
    'Acepto los términos: Space Mission es una simulación de ingeniería espacial. Guardar es opcional; el audio y las animaciones dependen del navegador. Las traducciones se realizan con recursos incluidos o funciones locales disponibles.':
      'Aceito os termos: Space Mission é uma simulação de engenharia espacial. Salvar é opcional; áudio e animações dependem do navegador. As traduções usam recursos incluídos ou ferramentas locais disponíveis.',
  },
  de: {
    'AUDIO':'AUDIO','ANIMACIONES Y VIDEO':'ANIMATIONEN & VIDEO',
    'PREPARANDO TRADUCCIONES':'SPRACHE WIRD VORBEREITET',
    'OPTIMIZANDO TEXTOS DEL JUEGO':'SPIELTEXTE WERDEN VORBEREITET',
    'IDIOMA LISTO':'SPRACHE BEREIT',
    'IDIOMA PREPARADO · ALGUNOS TEXTOS NO DISPONIBLES':'SPRACHE BEREIT · EINIGE TEXTE FEHLEN',
    'PERMITIR AUDIO':'AUDIO AKTIVIEREN','PERMITIR ANIMACIONES Y VIDEO':'ANIMATIONEN & VIDEO AKTIVIEREN',
    'Volumen de música':'Musiklautstärke','Notificaciones y efectos':'Benachrichtigungen und Effekte',
    'Música y sonido del juego':'Musik und Spielsounds',
    'Elegir idioma del juego':'Spielsprache auswählen',
    'Videos y animaciones del juego':'Animationen und Videos im Spiel',
    'Space Mission utiliza almacenamiento local para guardar partidas y preferencias. Una cookie recuerda tu autorización; también puedes jugar sin guardar el progreso.':
      'Space Mission verwendet lokalen Browserspeicher für Spielstände und Einstellungen. Ein Cookie merkt sich deine Zustimmung. Du kannst auch ohne Speichern spielen.',
    'Acepto los términos: Space Mission es una simulación de ingeniería espacial. Guardar es opcional; el audio y las animaciones dependen del navegador. Las traducciones se realizan con recursos incluidos o funciones locales disponibles.':
      'Ich akzeptiere die Bedingungen: Space Mission simuliert Raumfahrttechnik. Speichern ist freiwillig; Audio und Animationen hängen vom Browser ab. Übersetzungen verwenden integrierte Ressourcen oder verfügbare lokale Werkzeuge.',
  },
  it: {
    'AUDIO':'AUDIO','ANIMACIONES Y VIDEO':'ANIMAZIONI E VIDEO',
    'PREPARANDO TRADUCCIONES':'PREPARAZIONE LINGUA',
    'OPTIMIZANDO TEXTOS DEL JUEGO':'PREPARAZIONE TESTI DI GIOCO',
    'IDIOMA LISTO':'LINGUA PRONTA',
    'IDIOMA PREPARADO · ALGUNOS TEXTOS NO DISPONIBLES':'LINGUA PRONTA · ALCUNI TESTI NON DISPONIBILI',
    'PERMITIR AUDIO':'ATTIVA AUDIO','PERMITIR ANIMACIONES Y VIDEO':'ATTIVA ANIMAZIONI E VIDEO',
    'Volumen de música':'Volume musica','Notificaciones y efectos':'Notifiche ed effetti',
    'Música y sonido del juego':'Musica ed effetti di gioco',
    'Elegir idioma del juego':'Scegli la lingua del gioco',
    'Videos y animaciones del juego':'Animazioni e video di gioco',
    'Space Mission utiliza almacenamiento local para guardar partidas y preferencias. Una cookie recuerda tu autorización; también puedes jugar sin guardar el progreso.':
      'Space Mission usa la memoria locale del browser per salvare partite e preferenze. Un cookie ricorda il tuo consenso. Puoi giocare anche senza salvare.',
    'Acepto los términos: Space Mission es una simulación de ingeniería espacial. Guardar es opcional; el audio y las animaciones dependen del navegador. Las traducciones se realizan con recursos incluidos o funciones locales disponibles.':
      'Accetto i termini: Space Mission simula l’ingegneria spaziale. Il salvataggio è facoltativo; audio e animazioni dipendono dal browser. Le traduzioni utilizzano risorse integrate o strumenti locali disponibili.',
  },
  zh: {
    'AUDIO':'音频','ANIMACIONES Y VIDEO':'动画与视频',
    'PREPARANDO TRADUCCIONES':'正在准备语言',
    'OPTIMIZANDO TEXTOS DEL JUEGO':'正在准备游戏文本',
    'IDIOMA LISTO':'语言已就绪',
    'IDIOMA PREPARADO · ALGUNOS TEXTOS NO DISPONIBLES':'语言已就绪 · 部分文本不可用',
    'PERMITIR AUDIO':'开启音频','PERMITIR ANIMACIONES Y VIDEO':'开启动画与视频',
    'Volumen de música':'音乐音量','Notificaciones y efectos':'通知与音效',
    'Música y sonido del juego':'音乐与游戏音效',
    'Elegir idioma del juego':'选择游戏语言',
    'Videos y animaciones del juego':'游戏内动画与视频',
    'Space Mission utiliza almacenamiento local para guardar partidas y preferencias. Una cookie recuerda tu autorización; también puedes jugar sin guardar el progreso.':
      'Space Mission 使用浏览器本地存储保存游戏进度和偏好设置。Cookie 会记录你的同意。你也可以选择不保存进度。',
    'Acepto los términos: Space Mission es una simulación de ingeniería espacial. Guardar es opcional; el audio y las animaciones dependen del navegador. Las traducciones se realizan con recursos incluidos o funciones locales disponibles.':
      '我同意条款：Space Mission 是太空工程模拟游戏。保存进度为可选项；音频和动画取决于浏览器支持。翻译使用内置资源或可用的本地工具。',
  },
  ja: {
    'AUDIO':'音声','ANIMACIONES Y VIDEO':'アニメーションと動画',
    'PREPARANDO TRADUCCIONES':'言語を準備中',
    'OPTIMIZANDO TEXTOS DEL JUEGO':'ゲーム内テキストを準備中',
    'IDIOMA LISTO':'言語の準備完了',
    'IDIOMA PREPARADO · ALGUNOS TEXTOS NO DISPONIBLES':'言語の準備完了・一部のテキストは利用できません',
    'PERMITIR AUDIO':'音声を有効にする','PERMITIR ANIMACIONES Y VIDEO':'アニメーションと動画を有効にする',
    'Volumen de música':'音楽の音量','Notificaciones y efectos':'通知と効果音',
    'Música y sonido del juego':'音楽とゲームの効果音',
    'Elegir idioma del juego':'ゲームの言語を選択',
    'Videos y animaciones del juego':'ゲーム内のアニメーションと動画',
    'Space Mission utiliza almacenamiento local para guardar partidas y preferencias. Una cookie recuerda tu autorización; también puedes jugar sin guardar el progreso.':
      'Space Mission はブラウザーのローカルストレージにセーブデータと設定を保存します。Cookie は同意を記録します。保存せずに遊ぶこともできます。',
    'Acepto los términos: Space Mission es una simulación de ingeniería espacial. Guardar es opcional; el audio y las animaciones dependen del navegador. Las traducciones se realizan con recursos incluidos o funciones locales disponibles.':
      '利用規約に同意します。Space Mission は宇宙工学のシミュレーションゲームです。セーブは任意で、音声やアニメーションはブラウザーに依存します。翻訳には内蔵リソースまたは利用可能なローカル機能を使用します。',
  },
};
for (const [code, strings] of Object.entries(SHARED_LABELS)) Object.assign(PACKS[code], strings);


/* Frequently used launch, engineering and survival labels. They are
   available immediately in English, without remote translation. */
Object.assign(PACKS.en, {
  'VOLVER':'BACK','CERRAR':'CLOSE','CANCELAR':'CANCEL',
  'CONFIRMAR':'CONFIRM','VACIAR':'CLEAR','RECOMENDADA':'RECOMMENDED',
  'REPARAR SISTEMA':'REPAIR SYSTEM','INICIAR REPARACIÓN':'START REPAIR',
  'USAR OBJETO':'USE ITEM','INICIAR':'START','ABORTAR':'ABORT',
  'COMPONENTE':'COMPONENT','COSTE/u':'COST/UNIT','MASA/u':'MASS/UNIT',
  'CANTIDAD':'QUANTITY','MASA SECA':'DRY MASS','AL MÁXIMO':'MAX',
  'CARGAR PROPELENTE':'LOAD PROPELLANT','CARGA DE PROPELENTE (u · 10 t/u)':'PROPELLANT LOADING (u · 10 t/u)',
  'MASA DE DESPEGUE':'LAUNCH MASS','DEPÓSITO':'TANK',
  'ECUACIÓN DE TSIOLKOVSKY':'TSIOLKOVSKY EQUATION',
  'CONFIRMAR PLAN':'CONFIRM PLAN','CONFIRMAR VENTANA':'CONFIRM WINDOW',
  'MEJOR VENTANA':'BEST WINDOW','SIMULAR':'SIMULATE',
  'VALIDAR TRAYECTORIA':'VALIDATE TRAJECTORY',
  'RIESGO DE LANZAMIENTO':'LAUNCH RISK',
  'PARÁMETROS DE ASCENSO':'ASCENT PARAMETERS',
  'ALTITUD (km)':'ALTITUDE (km)','ALTITUD':'ALTITUDE',
  'DISTANCIA':'DISTANCE','ÓRBITA 160 km':'160 km ORBIT',
  'VELOCIDAD':'SPEED','PROPELENTE':'PROPELLANT',
  'AUTORIZACIÓN DE LANZAMIENTO':'LAUNCH AUTHORIZATION',
  'INICIAR CUENTA REGRESIVA':'START COUNTDOWN',
  'VOLVER A LA BASE':'RETURN TO BASE',
  'CUENTA REGRESIVA':'COUNTDOWN',
  'ENCENDIDO DE MOTORES':'ENGINE IGNITION',
  'IGNICIÓN':'IGNITION',
  'LANZAMIENTO EXITOSO':'SUCCESSFUL LAUNCH',
  '— MISIÓN EN CURSO':'— MISSION UNDERWAY',
  'CONTINUAR A ÓRBITA':'CONTINUE TO ORBIT',
  'SISTEMAS DAÑADOS':'DAMAGED SYSTEMS',
  'INICIAR SUPERVIVENCIA':'BEGIN SURVIVAL',
  'SENSORES: OBJETO NO IDENTIFICADO':'SENSORS: UNIDENTIFIED OBJECT',
  'SENSORES DETECTAN OTRA NAVE':'SENSORS DETECT ANOTHER SHIP',
  'CURSO DE COLISIÓN':'COLLISION COURSE',
  'ALERTA CRÍTICA — COLISIÓN DETECTADA':'CRITICAL ALERT — COLLISION DETECTED',
  'CASCO COMPROMETIDO · FALLOS ELÉCTRICOS':'HULL DAMAGED · ELECTRICAL FAILURES',
  'LA NAVE QUEDA A LA DERIVA':'SHIP LEFT ADRIFT',
  'SOPORTE VITAL CRÍTICO':'CRITICAL LIFE SUPPORT',
  'TELEMETRÍA NOMINAL':'TELEMETRY NOMINAL',
  'SISTEMAS DE LA NAVE':'SHIP SYSTEMS',
  'PRIORIZACIÓN DE SISTEMAS':'SYSTEM PRIORITIZATION',
  'SISTEMAS':'SYSTEMS','RECURSOS Y TRIPULACIÓN':'RESOURCES & CREW',
  'PROCEDIMIENTO':'PROCEDURE','MATERIALES Y TIEMPO':'MATERIALS & TIME',
  'USAR BATERÍA DE EMERGENCIA':'USE EMERGENCY BATTERY',
  'PLAN DE SUPERVIVENCIA · ELIGE CÓMO VOLVER':'SURVIVAL PLAN · CHOOSE YOUR RETURN',
  'BALIZA ACTIVA · SOBREVIVE HASTA EL RESCATE':'BEACON ACTIVE · SURVIVE UNTIL RESCUE',
  'REGRESO APROBADO':'RETURN APPROVED',
  'DIAGNÓSTICO':'DIAGNOSTICS',
  'SELECCIONA UN TERMINAL IZQUIERDO':'SELECT A LEFT TERMINAL',
  'PRIMERO SELECCIONA UN TERMINAL IZQUIERDO':'SELECT A LEFT TERMINAL FIRST',
  'DIAGNÓSTICO 1/3':'DIAGNOSTIC 1/3',
  'BANDA X · ENLACE CON TIERRA':'X-BAND · EARTH LINK',
  'BLOQUEAR CANAL':'LOCK CHANNEL',
  'GIRA LOS CODOS PARA LLEVAR EL REFRIGERANTE DE ENTRADA A SALIDA':'ROTATE ELBOWS TO ROUTE COOLANT FROM INLET TO OUTLET',
  'HAZ CLIC EN LAS BRECHAS ANTES DE QUE PIERDAN PRESIÓN':'CLICK ON LEAKS BEFORE PRESSURE IS LOST',
  'REPARACIÓN COMPLETADA':'REPAIR COMPLETED',
  'REPARACIÓN CANCELADA':'REPAIR CANCELLED',
  'FALLO DE REPARACIÓN':'REPAIR FAILED',
  'Sistemas dentro de parámetros.':'Systems within normal parameters.',
  'No se han consumido materiales.':'No materials were consumed.',
  'Puedes volver a intentarlo.':'You can try again.',
  'EFECTOS Y USO':'EFFECTS AND USE',
  'DISPONIBLES':'AVAILABLE','CERRAR MAPA':'CLOSE MAP',
  'MISIÓN COMPLETADA':'MISSION COMPLETED',
  'REANUDAR MISIÓN':'RESUME MISSION',
  'GUARDAR PARTIDA':'SAVE GAME',
  'GUARDAR Y SALIR AL TÍTULO':'SAVE AND RETURN TO TITLE',
  'INFORME FINAL DE MISIÓN':'FINAL MISSION REPORT',
  'SUPERVIVIENTES':'SURVIVORS',
  'ESC PARA VOLVER AL TÍTULO':'ESC TO RETURN TO TITLE',
  'TÍTULO':'TITLE','COPIAR INFORME':'COPY REPORT',
  'DE 100':'OUT OF 100','MEJOR':'BEST',
  'OBJETIVO':'OBJECTIVE','OBJETIVO ACTUAL':'CURRENT OBJECTIVE',
  'TRIPULACIÓN':'CREW','TRIPULACIÓN VIVA':'SURVIVING CREW',
  'PREPARACIÓN':'PREPARATION','ALERTA CRÍTICA':'CRITICAL ALERT',
  'BUSCA EL KIT EN EL ALMACÉN':'FIND THE TOOL KIT IN STORAGE',
  'RUEDA / ↑ ↓ PARA DESPLAZAR · J PARA CERRAR':'SCROLL / ↑ ↓ TO NAVIGATE · J TO CLOSE',
  'Apagar un sistema reduce el consumo, pero desactiva sus funciones. El soporte vital y las comunicaciones son críticos.':
    'Turning off a system saves power but disables its functions. Life support and communications are critical.',
  'Sistema apto. Puedes repararlo para ganar margen de seguridad.':
    'System operational. Repairing it increases the safety margin.',
  'Reparación cancelada. No se consumieron materiales.':
    'Repair cancelled. No materials were used.',
  'La reparación ha fallado. Se perdió un repuesto.':
    'Repair failed. One spare part was lost.',
  'La plataforma no autoriza el despegue. Revisa las verificaciones.':
    'Launch not authorized. Review the checks.',
  'La tripulación está a salvo. Vuelve a la base, corrige el fallo y reintenta.':
    'The crew is safe. Return to base, correct the fault and try again.',
  'La SMS-7 entra en órbita. La tripulación se prepara para la siguiente fase.':
    'SMS-7 reaches orbit. The crew prepares for the next phase.',
  'La reserva de agua está agotada. Usa el reciclador.':
    'Water reserves depleted. Use the recycler.',
  'No quedan baterías de emergencia.':'No emergency batteries remain.',
  'Partida cargada. Continúa la preparación.':'Game loaded. Continue preparation.',
  'Trayectoria validada y guardada.':'Trajectory validated and saved.',
  'Propelente cargado y verificado.':'Propellant loaded and checked.',
  'Plan de misión confirmado. Ve a combustible y trayectoria.':
    'Mission plan confirmed. Proceed to fuel and trajectory.',
});

/* Offline Portuguese vocabulary for the most visited gameplay systems.
   This avoids having to contact a third-party translation API for basic UI. */
Object.assign(PACKS.pt, {
  'PROGRAMA ESPACIAL · NIVEL 1':'PROGRAMA ESPACIAL · NÍVEL 1',
  'COORDINACIÓN Y DESPEGUE':'COORDENAÇÃO E LANÇAMENTO',
  'SISTEMAS LISTOS':'SISTEMAS PRONTOS',
  'DESCARGANDO RECURSOS':'BAIXANDO RECURSOS',
  'PREPARANDO AUDIO Y VIDEO':'PREPARANDO ÁUDIO E VÍDEO',
  'RENDERIZANDO ENTORNOS':'RENDERIZANDO AMBIENTES',
  'VOLVER':'VOLTAR','CERRAR':'FECHAR','CANCELAR':'CANCELAR',
  'GUARDAR':'SALVAR','CONTINUAR':'CONTINUAR','CONFIRMAR':'CONFIRMAR',
  'INICIAR':'INICIAR','ABORTAR':'ABORTAR','VACIAR':'LIMPAR',
  'RECOMENDADA':'RECOMENDADA','CANTIDAD':'QUANTIDADE',
  'COMPONENTE':'COMPONENTE','COSTE/u':'CUSTO/u','MASA/u':'MASSA/u',
  'PRESUPUESTO':'ORÇAMENTO','COSTE':'CUSTO','MASA SECA':'MASSA SECA',
  'MASA DE DESPEGUE':'MASSA DE LANÇAMENTO',
  'DEPÓSITO':'TANQUE','PROPELENTE':'PROPELENTE',
  'CARGAR PROPELENTE':'CARREGAR PROPELENTE',
  'AL MÁXIMO':'AO MÁXIMO','CONFIRMAR PLAN':'CONFIRMAR PLANO',
  'MEJOR VENTANA':'MELHOR JANELA','CONFIRMAR VENTANA':'CONFIRMAR JANELA',
  'SIMULAR':'SIMULAR','VALIDAR TRAYECTORIA':'VALIDAR TRAJETÓRIA',
  'RIESGO DE LANZAMIENTO':'RISCO DE LANÇAMENTO',
  'PARÁMETROS DE ASCENSO':'PARÂMETROS DE SUBIDA',
  'AUTORIZACIÓN DE LANZAMIENTO':'AUTORIZAÇÃO DE LANÇAMENTO',
  'INICIAR CUENTA REGRESIVA':'INICIAR CONTAGEM REGRESSIVA',
  'VOLVER A LA BASE':'VOLTAR À BASE',
  'CUENTA REGRESIVA':'CONTAGEM REGRESSIVA',
  'IGNICIÓN':'IGNIÇÃO','ENCENDIDO DE MOTORES':'ACIONAMENTO DOS MOTORES',
  'VELOCIDAD':'VELOCIDADE','ALTITUD':'ALTITUDE',
  'LANZAMIENTO EXITOSO':'LANÇAMENTO BEM-SUCEDIDO',
  'CONTINUAR A ÓRBITA':'CONTINUAR PARA A ÓRBITA',
  'INICIAR SUPERVIVENCIA':'INICIAR SOBREVIVÊNCIA',
  'SISTEMAS DAÑADOS':'SISTEMAS DANIFICADOS',
  'ALERTA CRÍTICA':'ALERTA CRÍTICO',
  'SISTEMAS DE LA NAVE':'SISTEMAS DA NAVE',
  'PRIORIZACIÓN DE SISTEMAS':'PRIORIZAÇÃO DE SISTEMAS',
  'RECURSOS Y TRIPULACIÓN':'RECURSOS E TRIPULAÇÃO',
  'TRIPULACIÓN':'TRIPULAÇÃO','ENERGÍA':'ENERGIA',
  'OXÍGENO':'OXIGÊNIO','AGUA':'ÁGUA','ALIMENTOS':'ALIMENTOS',
  'SALUD':'SAÚDE','COMBUSTIBLE':'COMBUSTÍVEL',
  'INTEGRIDAD':'INTEGRIDADE','REPARAR SISTEMA':'REPARAR SISTEMA',
  'INICIAR REPARACIÓN':'INICIAR REPARO',
  'REPARACIÓN COMPLETADA':'REPARO CONCLUÍDO',
  'REPARACIÓN CANCELADA':'REPARO CANCELADO',
  'FALLO DE REPARACIÓN':'FALHA NO REPARO',
  'MATERIALES Y TIEMPO':'MATERIAIS E TEMPO',
  'PROCEDIMIENTO':'PROCEDIMENTO',
  'USAR OBJETO':'USAR ITEM',
  'USAR BATERÍA DE EMERGENCIA':'USAR BATERIA DE EMERGÊNCIA',
  'NUEVA MISIÓN':'NOVA MISSÃO','CONTINUAR MISIÓN':'CONTINUAR MISSÃO',
  'REANUDAR MISIÓN':'RETOMAR MISSÃO',
  'GUARDAR PARTIDA':'SALVAR JOGO',
  'MISIÓN COMPLETADA':'MISSÃO CONCLUÍDA',
  'OBJETIVO':'OBJETIVO','PREPARACIÓN':'PREPARAÇÃO',
  'INFORME FINAL DE MISIÓN':'RELATÓRIO FINAL DA MISSÃO',
  'SUPERVIVIENTES':'SOBREVIVENTES',
  'COPIAR INFORME':'COPIAR RELATÓRIO',
  'CERRAR MAPA':'FECHAR MAPA',
  'TÍTULO':'TÍTULO',
});

/**
 * Stable, atomic translation.
 * Rendering NEVER launches HTTP requests: localized text is read synchronously
 * from embedded language packs and prepared translation memory.
 */
const translated = new Map();
const sourceNodes = new WeakMap();
const attrSources = new WeakMap();
let currentPreparation = 0;

function locale() {
  const lang = getPreferences().language;
  return LANGUAGES.some(item => item.code === lang) ? lang : 'en';
}
export function getLanguage() { return locale(); }

function makeKey(source, lang) { return lang + ':' + source; }
function resolved(source, lang) {
  return PACKS[lang]?.[source]
    || PACKS[lang]?.[source.trim()]
    || translated.get(makeKey(source, lang))
    || translated.get(makeKey(source.trim(), lang))
    || null;
}
export function translateSync(input, lang = locale()) {
  const source = String(input ?? '');
  if (!source.trim() || lang === 'es') return source;
  const result = resolved(source, lang);
  if (!result) return source;
  const start = source.match(/^\\s*/)?.[0] || '';
  const end = source.match(/\\s*$/)?.[0] || '';
  return start + result + end;
}

export function restoreTranslationCache() {
  if (!hasStorageConsent()) return;
  try {
    const cache = JSON.parse(localStorage.getItem('sms_translation_cache_v1') || '{}');
    for (const [key, value] of Object.entries(cache)) {
      if (typeof value === 'string' && value.length) translated.set(key, value);
    }
  } catch {}
}
restoreTranslationCache();

function saveTranslationCache() {
  if (!hasStorageConsent()) return;
  try {
    const out = Object.fromEntries([...translated].slice(-1600));
    localStorage.setItem('sms_translation_cache_v1', JSON.stringify(out));
  } catch {}
}

function eligible(text) {
  return text.length > 2 && text.length < 450
    && /[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]{3,}/.test(text)
    && !/^(https?:|\/|data:|#[a-f\d]{3,8}$)/i.test(text)
    && !/^[-=+]*[\d.,%: ]+[-=+]*$/.test(text);
}

function collectDOMStrings(root = document) {
  const candidates = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    const parent = node.parentElement;
    if (!parent || parent.closest('script,style,svg,option,[data-i18n]')) continue;
    const str = sourceNodes.get(node) ?? node.textContent;
    if (eligible(str.trim())) candidates.push(str.trim());
  }
  for (const el of root.querySelectorAll('[data-i18n]')) {
    if (eligible(el.dataset.i18n)) candidates.push(el.dataset.i18n);
  }
  return [...new Set(candidates)];
}

// Literal strings can be found at build time, including labels from Phaser
// scenes not instantiated until later. Vite bundles only these raw files.
const sources = import.meta.glob(
  ['/src/scenes/**/*.js','/src/world/**/*.js','/src/ui/**/*.js','/src/data/**/*.js'],
  { query: '?raw', import: 'default', eager: true }
);
let gameStrings = null;
export function collectGameStrings() {
  if (gameStrings) return gameStrings;
  const found = new Set();
  for (const [path, content] of Object.entries(sources)) {
    if (path.includes('/i18n/')) continue;
    const literalPattern = /'((?:[^'\\]|\\.){4,200})'|"((?:[^"\\]|\\.){4,200})"/g;
    for (const match of content.matchAll(literalPattern)) {
      const str = (match[1] || match[2] || '').replace(/\\n/g,'\n').trim();
      // Only natural-language phrases; exclude identifiers, CSS, paths and URLs.
      if (eligible(str) && (/[áéíóúñÁÉÍÓÚÑ]/.test(str) || /\b(?:DE|LA|EL|LOS|LAS|QUE|PARA|SISTEMA|MISIÓN|REPARACIÓN|GUARDAR|ABRIR|CERRAR|VOLVER|CONTINUAR|HORA|NIVEL|PARTIDA|INICIAR|TIEMPO|VUELTA|LANZAMIENTO)\b/i.test(str))) {
        found.add(str);
      }
    }
  }
  gameStrings = [...found].slice(0,750);
  return gameStrings;
}

/**
 * Translation is strictly local. MyMemory's anonymous endpoint returned HTTP
 * 429 for this game because it was used as a per-string translation service.
 * Do not send ANY automatic browser requests to it.
 *
 * Embedded catalogs work offline. If the browser offers its on-device
 * Translator API with an ALREADY INSTALLED language pack, we can prepare
 * further sentences in memory in a bounded batch. Otherwise we retain the
 * original Spanish text instead of making unsupported promises.
 */
async function availableLocalTranslator(lang) {
  if (typeof window.Translator?.availability !== 'function'
    || typeof window.Translator?.create !== 'function') return null;
  try {
    const options = {sourceLanguage:'es', targetLanguage:lang};
    const availability = await window.Translator.availability(options);
    // Do not download a language model without user authorization.
    if (availability !== 'available') return null;
    return await window.Translator.create(options);
  } catch (error) {
    console.warn('Traducción local no disponible:', error);
    return null;
  }
}

export async function prepareLanguage(lang, {includeGame=false, onProgress=null}={}) {
  if (lang === 'es') {
    onProgress?.(1);
    return {translated:0,missing:0,language:lang,engine:'embedded'};
  }
  const sequence=++currentPreparation;
  const list=[...new Set([
    ...collectDOMStrings(document),
    ...(includeGame ? collectGameStrings() : []),
  ])];
  const missing=list.filter(str=>eligible(str)&&!resolved(str,lang));
  if (!missing.length) {
    onProgress?.(1);
    return {translated:0,missing:0,language:lang,engine:'embedded'};
  }
  const local=await availableLocalTranslator(lang);
  if (!local) {
    // Fast and deterministic. Never make dozens of HTTP calls.
    onProgress?.(1);
    return {translated:0,missing:missing.length,language:lang,engine:'embedded'};
  }
  const prepared=new Map();
  const limit=Date.now()+12000;
  let index=0;
  // A single on-device translator is shared safely and prevents saturation.
  while(index<missing.length && Date.now()<limit && sequence===currentPreparation) {
    const source=missing[index++];
    try {
      const value=await local.translate(source);
      if (value && value!==source) prepared.set(makeKey(source,lang),value);
    } catch { /* Keep original if local model cannot translate this string. */ }
    onProgress?.(index/missing.length);
  }
  if (sequence===currentPreparation) {
    for(const [key,value] of prepared) translated.set(key,value);
    saveTranslationCache();
  }
  onProgress?.(1);
  return {translated:prepared.size,missing:missing.length-prepared.size,language:lang,engine:'local'};
}

/** Changes language only after the new language pack has finished preparing. */
export async function setLanguage(lang, options = {}) {
  if (!LANGUAGES.some(item => item.code === lang)) return;
  if (lang === locale()) {
    localizeDOM(document);
    return;
  }
  // Se cambia instantáneamente con los catálogos locales durante la selección
  // inicial. Tras aceptar los términos se prepara el catálogo completo.
  if (options.includeGame) await prepareLanguage(lang, options);
  updatePreferences({language:lang});
  document.documentElement.lang=lang;
  localizeDOM(document);
  window.dispatchEvent(new CustomEvent('sms-language-changed',{detail:{language:lang}}));
}

export function localizeDOM(root = document) {
  for (const el of root.querySelectorAll('[data-i18n]')) {
    const source = el.dataset.i18n;
    const value = translateSync(source);
    if (el.textContent !== value) el.textContent = value;
  }
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while(walker.nextNode()) {
    const node = walker.currentNode;
    const parent = node.parentElement;
    if(!parent || parent.closest('script,style,svg,option,[data-i18n]')) continue;
    nodes.push(node);
  }
  for(const node of nodes) {
    if(!sourceNodes.has(node)) sourceNodes.set(node,node.textContent);
    const original = sourceNodes.get(node);
    const translatedText = translateSync(original);
    if(node.textContent!==translatedText) node.textContent=translatedText;
  }
  for(const element of root.querySelectorAll('[title],[aria-label],[placeholder]')) {
    if (element.closest('svg')) continue;
    if(!attrSources.has(element)) attrSources.set(element,{});
    const originals=attrSources.get(element);
    for(const name of ['title','aria-label','placeholder']) {
      if(!element.hasAttribute(name)) continue;
      if(!(name in originals)) originals[name]=element.getAttribute(name);
      const tr=translateSync(originals[name]);
      if(element.getAttribute(name)!==tr) element.setAttribute(name,tr);
    }
  }
}

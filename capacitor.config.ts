import type { CapacitorConfig } from '@capacitor/cli';

/**
 * App de Android (ARCHITECTURE.md §4.31): el mismo juego, servido desde el teléfono por Capacitor.
 * `npm run build:android` compila con `--mode native` (rutas relativas, sin service worker) en
 * dist-native y lo copia al proyecto android/. El código del juego no importa nada de Capacitor.
 */
const config: CapacitorConfig = {
  // Identidad permanente de la app: cambiarla es otra app y el teléfono perdería la partida.
  appId: 'io.github.pipeherreral.micelio',
  appName: 'Micelio',
  webDir: 'dist-native',
  // El fondo del juego mientras carga la página: sin destello blanco.
  backgroundColor: '#261C15',
  // Tampoco se cambian el esquema ni el host (https://localhost): son el origen del guardado.
  android: {},
  plugins: {
    // De borde a borde (Android 15+): las zonas seguras llegan al CSS (--sat, --sab…) y los iconos
    // de la barra de estado van claros sobre el fondo oscuro del juego.
    SystemBars: {
      style: 'DARK',
      insetsHandling: 'css',
    },
  },
};

export default config;

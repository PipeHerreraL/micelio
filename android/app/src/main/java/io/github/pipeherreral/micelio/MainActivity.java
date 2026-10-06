package io.github.pipeherreral.micelio;

import android.os.Bundle;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;
import io.github.pipeherreral.micelio.ota.MicelioUpdaterPlugin;
import io.github.pipeherreral.micelio.ota.OtaAndroid;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Las actualizaciones (ARCHITECTURE.md §4.34): antes de super.onCreate(), que crea el Bridge.
        // Siempre se fija la carpeta, también la del .apk: el Bridge arranca con ella y carga una sola
        // vez, y manda sobre una ruta que alguien hubiera guardado con el complemento WebView del núcleo.
        registerPlugin(MicelioUpdaterPlugin.class);
        bridgeBuilder.setServerPath(OtaAndroid.serverPath(this));
        super.onCreate(savedInstanceState);
        // Atrás deja el juego en segundo plano, como hace Android 12+ por su cuenta: en Android 7 a 11
        // cerraba la actividad (y el juego, aunque hubiera una ventana abierta). El juego guarda al
        // ocultarse.
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                moveTaskToBack(true);
            }
        });
    }

    // El reloj de una versión a prueba solo cuenta el primer plano, y la búsqueda de versiones va 15 s
    // después de cada vuelta a él.
    @Override
    public void onResume() {
        super.onResume();
        OtaAndroid.resumed(this);
    }

    @Override
    public void onPause() {
        OtaAndroid.paused(this);
        super.onPause();
    }

    @Override
    public void onDestroy() {
        OtaAndroid.destroyed(this);
        super.onDestroy();
    }
}

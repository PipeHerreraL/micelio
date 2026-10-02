package io.github.pipeherreral.micelio;

import android.os.Bundle;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
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
}

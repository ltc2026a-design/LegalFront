package mx.consulta.legal;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStreamWriter;
import java.io.PrintWriter;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;

/**
 * Actividad de Capacitor. Lo unico propio es el registro de arranque.
 *
 * Por que existe: el telefono del dueño no trae depuracion USB, asi que cuando la app
 * se cierra sola no hay `adb logcat` donde mirar. Este registro se escribe en
 * `Android/data/mx.consulta.legal/files/arranque.log`, una carpeta que el gestor de
 * archivos del propio telefono puede abrir.
 *
 * Como se lee: la linea `arranque` sale antes de levantar el bridge y la `cierre`
 * lleva la pila de la excepcion que tumbo el proceso. Si al abrir la app solo queda
 * `arranque` y la siguiente vez tampoco aparece `cierre`, la caida es posterior a
 * esta actividad (hilo nativo o WebView); si no aparece NINGUN `arranque`, el proceso
 * muere antes de llegar aqui (proveedor del manifest o el propio sistema).
 */
public class MainActivity extends BridgeActivity {

    private static final String NOMBRE_REGISTRO = "arranque.log";
    private static final int MAXIMO_BYTES = 64 * 1024;

    private Thread.UncaughtExceptionHandler manejadorDelSistema;
    private File archivo;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        abrirRegistro();
        super.onCreate(savedInstanceState);
    }

    /** Abre (o crea) el registro y toma el control de las caidas no atendidas. */
    private void abrirRegistro() {
        File carpeta = getExternalFilesDir(null);
        if (carpeta == null) {
            carpeta = getFilesDir(); // almacenamiento externo no disponible (raro, pero pasa)
        }
        archivo = new File(carpeta, NOMBRE_REGISTRO);
        anotar("arranque");
        manejadorDelSistema = Thread.getDefaultUncaughtExceptionHandler();
        Thread.setDefaultUncaughtExceptionHandler((hilo, error) -> {
            anotar("cierre", error);
            if (manejadorDelSistema != null) {
                manejadorDelSistema.uncaughtException(hilo, error);
            }
        });
    }

    private void anotar(String mensaje) {
        anotar(mensaje, null);
    }

    private void anotar(String mensaje, Throwable error) {
        if (archivo == null) {
            return;
        }
        // Es diagnostico, no historial: al llegar a 64 KB se vuelve a empezar.
        if (archivo.length() > MAXIMO_BYTES) {
            archivo.delete();
        }
        SimpleDateFormat hora = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.US);
        hora.setTimeZone(TimeZone.getTimeZone("America/Cancun"));
        try (PrintWriter salida =
                new PrintWriter(
                        new OutputStreamWriter(new FileOutputStream(archivo, true), StandardCharsets.UTF_8))) {
            salida.printf("%s  %s%n", hora.format(new Date()), mensaje);
            if (error != null) {
                error.printStackTrace(salida);
            }
            salida.flush();
        } catch (IOException ignorar) {
            // Sin registro no hay diagnostico, pero tampoco hay que arreglar el arranque por eso.
        }
    }
}

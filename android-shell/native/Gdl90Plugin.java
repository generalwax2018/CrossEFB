package app.crossefb;

import android.content.Context;
import android.net.wifi.WifiManager;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.InetSocketAddress;

/**
 * Listens for GDL 90 datagrams (Stratux, Sentry, Stratus, ...) on UDP port 4000
 * and forwards each one to the web app as a base64 "packet" event:
 *
 *   Capacitor.Plugins.Gdl90.addListener("packet", e => ... e.data ...)
 *   Capacitor.Plugins.Gdl90.start({ port: 4000 })
 *
 * The web side decodes the packets (src/lib/efb/gdl90.ts).
 */
@CapacitorPlugin(name = "Gdl90")
public class Gdl90Plugin extends Plugin {
    private volatile boolean running = false;
    private DatagramSocket socket;
    private Thread worker;
    private WifiManager.MulticastLock lock;

    @PluginMethod
    public void start(PluginCall call) {
        int port = call.getInt("port", 4000);
        if (running) {
            call.resolve();
            return;
        }
        running = true;
        try {
            WifiManager wifi = (WifiManager) getContext().getApplicationContext().getSystemService(Context.WIFI_SERVICE);
            if (wifi != null) {
                // Some receivers broadcast; without this lock many phones drop broadcast UDP.
                lock = wifi.createMulticastLock("crossefb-gdl90");
                lock.setReferenceCounted(false);
                lock.acquire();
            }
        } catch (Exception ignored) {
        }
        worker = new Thread(() -> listen(port), "gdl90-udp");
        worker.setDaemon(true);
        worker.start();
        JSObject ret = new JSObject();
        ret.put("port", port);
        call.resolve(ret);
    }

    @PluginMethod
    public void stop(PluginCall call) {
        shutdown();
        call.resolve();
    }

    private void listen(int port) {
        byte[] buf = new byte[8192];
        while (running) {
            try {
                socket = new DatagramSocket(null);
                socket.setReuseAddress(true);
                socket.setBroadcast(true);
                socket.bind(new InetSocketAddress(port));
                while (running) {
                    DatagramPacket packet = new DatagramPacket(buf, buf.length);
                    socket.receive(packet);
                    JSObject ev = new JSObject();
                    ev.put("data", Base64.encodeToString(packet.getData(), 0, packet.getLength(), Base64.NO_WRAP));
                    notifyListeners("packet", ev);
                }
            } catch (Exception e) {
                if (socket != null) socket.close();
                if (!running) return;
                try {
                    Thread.sleep(2000); // retry after Wi-Fi changes
                } catch (InterruptedException ie) {
                    return;
                }
            }
        }
    }

    private void shutdown() {
        running = false;
        if (socket != null) socket.close();
        if (lock != null && lock.isHeld()) lock.release();
    }

    @Override
    protected void handleOnDestroy() {
        shutdown();
    }
}

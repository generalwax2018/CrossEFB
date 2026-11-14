# CrossEFB for Android (ADS-B shell)

A thin Android app around the CrossEFB web app. It adds the one thing a browser
cannot do: listen for **GDL 90** data on **UDP port 4000** from a portable ADS-B
receiver (Stratux, Sentry, Stratus, and others that speak open GDL 90) and pass
it to the chart. Traffic, the receiver's GPS position, and its altitude then
show up in CrossEFB.

The web app is loaded from the address in `capacitor.config.json`
(`server.url`). Change it if you deploy CrossEFB somewhere else.

## Build it (one time, about 20 minutes)

1. Install **Node.js 22+** and **Android Studio** (it brings the Android SDK and Java).
2. In this folder run:
   ```
   npm install
   npm run setup
   npm run open
   ```
   `setup` creates the `android/` project, copies in the GDL 90 plugin, and adds
   Wi-Fi, location, and wake-lock permissions.
3. In Android Studio, plug in your phone or tablet (USB debugging on) and press **Run**.
   For a shareable file use **Build → Build Bundle(s) / APK(s) → Build APK(s)**.

## Use it in the airplane

1. Power the receiver and join its Wi-Fi network (for example `stratux`).
   Android may warn that the network has no internet: choose to stay connected.
2. Open CrossEFB. A green **ADS-B** pill appears on the chart once packets arrive.
3. Press **Track**. If the phone's own GPS is weak, CrossEFB uses the receiver's GPS.

Charts and weather need internet. Download your route or region for offline use
before you leave the ground (Plan → Offline).

## Notes

- Port 4000 is the GDL 90 default. Stratux sends to every Wi-Fi client
  automatically. Sentry and others may need "GDL 90" turned on in their app.
- The plugin was compile-checked against the Capacitor 8.5.3 API and `npm run setup`
  was tested, but the full Gradle/APK build needs Android Studio. If Gradle asks to
  upgrade a version on first open, accept it.
- Not a certified EFB or traffic system. See and avoid.
- This shell does not file flight plans. CrossEFB only copies a draft. The pilot files it at 1800wxbrief.com. See the flight-plan section in the repository README.

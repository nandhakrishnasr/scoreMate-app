# Cricket Scorer

A mobile-first cricket scoring app for short matches. It runs locally in the browser and is sized for use on an Android phone.

## Run it

```bash
npm install
npm run dev -- --host
```

Open the displayed address on the computer, or use the computer's local IP address from an Android phone on the same Wi-Fi network.

## Android and iOS packaging

The app uses Capacitor. The generated native projects are in `android/` and `ios/`.

```bash
npm run mobile:sync
```

For Android, install Android Studio and a JDK, then set `JAVA_HOME` and ensure the Android SDK is available. Build a debug APK with:

```bash
npm run android:build
```

The APK will be at `android/app/build/outputs/apk/debug/app-debug.apk`. You can also open the native project with `npm run android:open`.

iOS builds require macOS with Xcode and CocoaPods. On a Mac, run:

```bash
npm run ios:open
# or
npm run ios:build
```

The iOS project must then be signed with an Apple Developer team in Xcode before installing on a device or submitting to the App Store.

## Included scoring flow

- Set host and visitor teams, overs, toss, and batting choice.
- Add striker, non-striker, and opening bowler.
- Score 0 through 6, wides, no-balls, byes, leg-byes, and wickets.
- Track score, wickets, overs, current run rate, batter figures, bowler figures, and undo.
- Use the bottom navigation to start another match or view match history.

## Support & Sponsor

If you find ScoreMate useful, you can sponsor development via [GitHub Sponsors](https://github.com/sponsors/nandhakrishnasr) or check [.github/FUNDING.yml](.github/FUNDING.yml) for supported funding platforms.


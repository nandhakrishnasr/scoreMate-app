import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.gullyscorer.app',
  appName: 'ScoreMate',
  webDir: 'dist',
  bundledWebRuntime: false,
  plugins: {
    FirebaseAuthentication: {
      skipNativeAuth: true,
      providers: ['google.com', 'apple.com', 'phone'],
    },
  },
};

export default config;

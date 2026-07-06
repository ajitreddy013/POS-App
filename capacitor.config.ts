import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.ajitreddy.counterflowpos',
  appName: 'CounterFlow POS',
  webDir: 'build',
  plugins: {
    SplashScreen: {
      launchShowDuration: 0,
      launchAutoHide: true,
      launchFadeOutDuration: 0,
      backgroundColor: "#EDE4CA",
      androidScaleType: "CENTER_CROP",
      showSpinner: false
    },
    Keyboard: {
      resize: "none"
    },
    StatusBar: {
      overlaysWebView: true,
      style: "LIGHT"
    }
  }
};

export default config;

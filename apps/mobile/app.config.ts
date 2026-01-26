import { ExpoConfig, ConfigContext } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'Dreamweaver',
  slug: 'dreamweaver',
  version: '0.1.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'dark',
  splash: {
    backgroundColor: '#1a1a2e',
  },
  assetBundlePatterns: ['**/*'],
  ios: {
    supportsTablet: false,
    bundleIdentifier: 'com.dreamweaver.app',
    infoPlist: {
      NSMicrophoneUsageDescription: 'Dreamweaver needs microphone access for voice commands.',
      UIBackgroundModes: ['audio'],
    },
  },
  android: {
    adaptiveIcon: {
      backgroundColor: '#1a1a2e',
    },
    package: 'com.dreamweaver.app',
    permissions: [
      'android.permission.RECORD_AUDIO',
      'android.permission.MODIFY_AUDIO_SETTINGS',
    ],
  },
  plugins: [
    [
      'expo-build-properties',
      {
        ios: {
          useFrameworks: 'static',
        },
        android: {
          minSdkVersion: 24,
        },
      },
    ],
    [
      '@livekit/react-native-webrtc',
      {
        cameraPermission: false,
        microphonePermission: 'Dreamweaver needs microphone access for voice commands.',
      },
    ],
  ],
  extra: {
    serverUrl: process.env.EXPO_PUBLIC_SERVER_URL || 'http://localhost:3000',
    livekitUrl: process.env.EXPO_PUBLIC_LIVEKIT_URL || 'ws://localhost:7880',
  },
});

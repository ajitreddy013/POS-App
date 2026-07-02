#!/bin/bash
set -e

export JAVA_HOME="/Library/Java/JavaVirtualMachines/jdk-21.jdk/Contents/Home"
echo "✅ JAVA_HOME: $JAVA_HOME"

# Check passwords are filled in
if grep -q "YOUR_KEYSTORE_PASSWORD" android/keystore.properties; then
  echo "❌ Fill in your passwords in android/keystore.properties first."
  exit 1
fi

echo "🚀 Building React web app..."
npm run build

echo "🔄 Syncing with Capacitor..."
npx cap sync android

echo "📦 Building signed release APK..."
cd android
./gradlew assembleRelease
cd ..

APK_PATH="android/app/build/outputs/apk/release/app-release.apk"
echo ""
echo "✅ Done! APK is at: $APK_PATH"
cp "$APK_PATH" "MalabarWaffle-release.apk"
echo "📲 Copied to: MalabarWaffle-release.apk"

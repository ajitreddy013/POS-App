#!/bin/bash

# Exit on error
set -e

# 1. Set JAVA_HOME to the compatible JDK 21 on macOS
export JAVA_HOME="/Library/Java/JavaVirtualMachines/jdk-21.jdk/Contents/Home"
echo "✅ JAVA_HOME set to: $JAVA_HOME"

# 2. Build the production React web bundle
echo "🚀 Building React web application..."
npm run build

# 3. Sync assets and plugins with the Android platform
echo "🔄 Syncing assets with Capacitor Android..."
npx cap sync

# 4. Detect the connected ADB WiFi target device
echo "📡 Detecting target device..."
WIFI_TARGET=$(npx cap run android --list | grep "_adb-tls-connect._tcp" | head -n 1 | awk '{print $NF}')

if [ -z "$WIFI_TARGET" ]; then
    # Fallback to the first available adb device if wifi pattern isn't matched
    WIFI_TARGET=$(adb devices | grep -v "List" | grep "device" | head -n 1 | awk '{print $1}')
fi

if [ -z "$WIFI_TARGET" ]; then
    echo "❌ Error: No connected Android device or ADB WiFi target detected. Please check your connection using 'adb devices'."
    exit 1
fi

echo "📲 Deploying and launching on target device: $WIFI_TARGET"

# 5. Run the application on the target device
npx cap run android --target="$WIFI_TARGET"

package com.ajitreddy.counterflowpos;

import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import androidx.core.app.NotificationCompat;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Custom FCM service — gives us a colored large icon in the notification shade.
 * Registered with android:priority="1" so it takes precedence over Capacitor's
 * default service (priority 0). We send data-only FCM messages so onMessageReceived
 * is called in ALL app states (foreground, background, killed).
 */
public class MyFirebaseMessagingService extends FirebaseMessagingService {

    private static final AtomicInteger notifId = new AtomicInteger(2000);

    @Override
    public void onMessageReceived(RemoteMessage remoteMessage) {
        super.onMessageReceived(remoteMessage);

        Map<String, String> data = remoteMessage.getData();

        String title = data.get("title");
        String body  = data.get("body");

        // Fallback to notification payload title/body (shouldn't happen with data-only)
        if (title == null && remoteMessage.getNotification() != null) {
            title = remoteMessage.getNotification().getTitle();
        }
        if (body == null && remoteMessage.getNotification() != null) {
            body = remoteMessage.getNotification().getBody();
        }
        if (title == null) title = "New Order";
        if (body  == null) body  = "";

        // Full-color launcher icon as the large icon (right side of notification row)
        Bitmap largeIcon = BitmapFactory.decodeResource(getResources(), R.mipmap.ic_launcher);

        // Tap notification → open app
        Intent intent = new Intent(this, MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pendingIntent = PendingIntent.getActivity(
                this, 0, intent,
                PendingIntent.FLAG_ONE_SHOT | PendingIntent.FLAG_IMMUTABLE
        );

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, "order_alerts")
                .setSmallIcon(R.drawable.ic_stat_notification)
                .setLargeIcon(largeIcon)
                .setContentTitle(title)
                .setContentText(body)
                .setColor(0xFF1C5C3A)          // green tint on the small status-bar icon
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setContentIntent(pendingIntent)
                .setAutoCancel(true)
                .setDefaults(NotificationCompat.DEFAULT_SOUND)
                .setVibrate(new long[]{0, 200, 100, 200});

        NotificationManager manager =
                (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null) {
            manager.notify(notifId.getAndIncrement(), builder.build());
        }
    }
}

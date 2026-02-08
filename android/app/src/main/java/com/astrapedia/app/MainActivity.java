package com.astrapedia.app;

import android.os.Bundle;
import android.util.Log;
import android.webkit.WebSettings;
import android.webkit.WebView;

import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static final String TAG = "AstrapediaActivity";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Harden WebView security settings
        Bridge bridge = getBridge();
        if (bridge == null) {
            Log.w(TAG, "Bridge is null, cannot configure WebView security settings");
            return;
        }

        WebView webView = bridge.getWebView();
        if (webView == null) {
            Log.w(TAG, "WebView is null, cannot configure security settings");
            return;
        }

        WebSettings settings = webView.getSettings();

        // Disable file access from web content
        settings.setAllowFileAccess(false);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);

        // Disable content URL access
        settings.setAllowContentAccess(false);

        // Prevent mixed content (HTTP resources on HTTPS pages)
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);

        // Enable geolocation (will be requested via JS with user consent)
        settings.setGeolocationEnabled(true);

        // Enable safe browsing (Android O+)
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
            settings.setSafeBrowsingEnabled(true);
        }

        Log.d(TAG, "WebView security settings configured successfully");
    }
}

package com.slimereborn.game;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;
import android.window.OnBackInvokedCallback;
import android.window.OnBackInvokedDispatcher;

/**
 * Slime Reborn — L'Ascesa del Predatore.
 *
 * Thin, fullscreen, landscape WebView shell around the HTML5 game shipped in
 * the APK assets (file:///android_asset/index.html, packaged from ../web).
 *
 * Native bridge exposed to the page:
 *   window.SKNative.vibrate(ms)  — short haptic pulse.
 * Page hooks used by the shell:
 *   window.SKBack()              — back button; returns true when handled.
 *   SK.Audio.suspend()/resume()  — called when the app leaves/returns to foreground.
 */
public class MainActivity extends Activity {

    private static final String START_URL = "file:///android_asset/index.html";
    private static final int BG_COLOR = Color.rgb(0x05, 0x06, 0x0f);

    private static final String JS_BACK =
            "(function(){try{return (window.SKBack && window.SKBack()) ? 'y' : 'n';}catch(e){return 'n';}})()";
    private static final String JS_SUSPEND =
            "(function(){try{if(window.SK&&SK.Audio&&SK.Audio.suspend)SK.Audio.suspend();}catch(e){}})()";
    private static final String JS_RESUME =
            "(function(){try{if(window.SK&&SK.Audio&&SK.Audio.resume)SK.Audio.resume();}catch(e){}})()";

    private FrameLayout root;
    private WebView webView;
    private OnBackInvokedCallback backCallback;
    private boolean backPending;
    private boolean resumed;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        Window window = getWindow();
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
                | WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED
                | WindowManager.LayoutParams.FLAG_FULLSCREEN);
        window.getDecorView().setBackgroundColor(BG_COLOR);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            WindowManager.LayoutParams lp = window.getAttributes();
            lp.layoutInDisplayCutoutMode = Build.VERSION.SDK_INT >= Build.VERSION_CODES.R
                    ? WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_ALWAYS
                    : WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            window.setAttributes(lp);
        }

        if ((getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0) {
            WebView.setWebContentsDebuggingEnabled(true);
        }

        root = new FrameLayout(this);
        root.setBackgroundColor(BG_COLOR);
        setContentView(root, new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        createWebView();
        if (savedInstanceState == null || webView.restoreState(savedInstanceState) == null) {
            webView.loadUrl(START_URL);
        }

        enterImmersive();
        registerBackCallback();
    }

    // ------------------------------------------------------------------ WebView

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    private void createWebView() {
        webView = new WebView(this);
        webView.setBackgroundColor(BG_COLOR);
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
        webView.setVerticalScrollBarEnabled(false);
        webView.setHorizontalScrollBarEnabled(false);
        webView.setHapticFeedbackEnabled(false);
        webView.setLongClickable(false);
        webView.setOnLongClickListener(v -> true);
        webView.setFocusable(true);
        webView.setFocusableInTouchMode(true);
        webView.setLayerType(View.LAYER_TYPE_HARDWARE, null);

        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(false);
        s.setTextZoom(100);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(true);
        s.setSupportMultipleWindows(false);
        s.setJavaScriptCanOpenWindowsAutomatically(false);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setOffscreenPreRaster(true);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            s.setSafeBrowsingEnabled(false);
        }

        webView.setWebChromeClient(new WebChromeClient());
        webView.setWebViewClient(new GameWebViewClient());
        webView.addJavascriptInterface(new NativeBridge(getApplicationContext()), "SKNative");

        root.addView(webView, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        webView.requestFocus();
    }

    /** Rebuilds the WebView after the renderer died (OOM kill / crash) instead of crashing the app. */
    private void recreateWebView() {
        if (webView != null) {
            root.removeView(webView);
            webView.destroy();
            webView = null;
        }
        createWebView();
        webView.loadUrl(START_URL);
        if (!resumed) {
            webView.onPause();
            webView.pauseTimers();
        }
    }

    private final class GameWebViewClient extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            return handleUrl(request.getUrl());
        }

        @Override
        public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
            if (view != webView) {
                return true;
            }
            mainHandler.post(MainActivity.this::recreateWebView);
            return true;
        }
    }

    /** file:// stays in the game; everything else (http, https, mailto, market...) opens externally. */
    private boolean handleUrl(Uri uri) {
        String scheme = uri.getScheme();
        if (scheme == null || "file".equalsIgnoreCase(scheme)
                || "about".equalsIgnoreCase(scheme) || "data".equalsIgnoreCase(scheme)
                || "javascript".equalsIgnoreCase(scheme)) {
            return false;
        }
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, uri);
            intent.addCategory(Intent.CATEGORY_BROWSABLE);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(intent);
        } catch (ActivityNotFoundException e) {
            Toast.makeText(this, R.string.no_browser, Toast.LENGTH_SHORT).show();
        }
        return true;
    }

    // ------------------------------------------------------------ Native bridge

    /** Exposed to JS as window.SKNative. Methods run on a WebView binder thread. */
    static final class NativeBridge {
        private final Vibrator vibrator;

        NativeBridge(Context ctx) {
            Vibrator v;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                VibratorManager vm = (VibratorManager) ctx.getSystemService(Context.VIBRATOR_MANAGER_SERVICE);
                v = vm != null ? vm.getDefaultVibrator() : null;
            } else {
                v = (Vibrator) ctx.getSystemService(Context.VIBRATOR_SERVICE);
            }
            vibrator = v;
        }

        @JavascriptInterface
        @SuppressWarnings("deprecation")
        public void vibrate(int ms) {
            if (vibrator == null || !vibrator.hasVibrator() || ms <= 0) {
                return;
            }
            long dur = Math.min(ms, 1000);
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    vibrator.vibrate(VibrationEffect.createOneShot(dur, VibrationEffect.DEFAULT_AMPLITUDE));
                } else {
                    vibrator.vibrate(dur);
                }
            } catch (RuntimeException ignored) {
                // Some OEM builds throw when haptics are disabled system-wide.
            }
        }

        @JavascriptInterface
        public boolean isNative() {
            return true;
        }
    }

    // --------------------------------------------------------------- Back key

    private void registerBackCallback() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            backCallback = this::handleBack;
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
                    OnBackInvokedDispatcher.PRIORITY_DEFAULT, backCallback);
        }
    }

    /** Asks the game to handle back (close menu / pause); if it does not, go to background. */
    private void handleBack() {
        if (webView == null) {
            moveTaskToBack(true);
            return;
        }
        if (backPending) {
            return;
        }
        backPending = true;
        webView.evaluateJavascript(JS_BACK, result -> {
            backPending = false;
            if (result == null || !result.contains("y")) {
                moveTaskToBack(true);
            }
        });
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        // API < 33 path (API 33+ uses the OnBackInvokedCallback registered above).
        handleBack();
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        // Volume keys keep their default behaviour; menu key acts like back (pause).
        if (event.getKeyCode() == KeyEvent.KEYCODE_MENU) {
            if (event.getAction() == KeyEvent.ACTION_UP) {
                handleBack();
            }
            return true;
        }
        return super.dispatchKeyEvent(event);
    }

    // -------------------------------------------------------------- Immersive

    @SuppressWarnings("deprecation")
    private void enterImmersive() {
        Window window = getWindow();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            window.setDecorFitsSystemWindows(false);
            WindowInsetsController c = window.getInsetsController();
            if (c != null) {
                c.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
                c.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            }
        } else {
            window.getDecorView().setSystemUiVisibility(
                    View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                            | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                            | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                            | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                            | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                            | View.SYSTEM_UI_FLAG_FULLSCREEN);
        }
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            enterImmersive();
        }
    }

    // -------------------------------------------------------------- Lifecycle

    @Override
    protected void onResume() {
        super.onResume();
        resumed = true;
        enterImmersive();
        if (webView != null) {
            webView.onResume();
            webView.resumeTimers();
            webView.evaluateJavascript(JS_RESUME, null);
        }
    }

    @Override
    protected void onPause() {
        resumed = false;
        if (webView != null) {
            webView.evaluateJavascript(JS_SUSPEND, null);
            webView.onPause();
            webView.pauseTimers();
        }
        super.onPause();
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        if (webView != null) {
            webView.saveState(outState);
        }
    }

    @Override
    protected void onDestroy() {
        mainHandler.removeCallbacksAndMessages(null);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && backCallback != null) {
            getOnBackInvokedDispatcher().unregisterOnBackInvokedCallback(backCallback);
            backCallback = null;
        }
        if (webView != null) {
            webView.removeJavascriptInterface("SKNative");
            root.removeView(webView);
            webView.stopLoading();
            webView.setWebChromeClient(null);
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}

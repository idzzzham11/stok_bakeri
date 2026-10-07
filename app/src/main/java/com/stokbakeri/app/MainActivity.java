package com.stokbakeri.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Bundle;
import android.text.TextUtils;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.ProgressBar;
import android.widget.Toast;

public class MainActivity extends Activity {

    private static final int FILE_CHOOSER_REQUEST = 1001;

    private WebView webView;
    private ProgressBar progressBar;
    private ValueCallback<Uri[]> filePathCallback;
    private String startUrl;
    private String startHost;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        startUrl = getString(R.string.start_url);
        startHost = Uri.parse(startUrl).getHost();

        FrameLayout root = new FrameLayout(this);
        webView = new WebView(this);
        root.addView(webView, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        progressBar = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        progressBar.setMax(100);
        FrameLayout.LayoutParams barParams = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, (int) (4 * getResources().getDisplayMetrics().density));
        root.addView(progressBar, barParams);
        setContentView(root);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setAllowFileAccess(false);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);

        CookieManager cookies = CookieManager.getInstance();
        cookies.setAcceptCookie(true);
        cookies.setAcceptThirdPartyCookies(webView, true);

        webView.setWebViewClient(new AppWebViewClient());
        webView.setWebChromeClient(new AppChromeClient());
        webView.setDownloadListener((url, userAgent, contentDisposition, mimeType, contentLength) ->
                openExternally(Uri.parse(url)));

        if (savedInstanceState != null) {
            webView.restoreState(savedInstanceState);
        } else {
            webView.loadUrl(startUrl);
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        webView.saveState(outState);
    }

    @Override
    protected void onPause() {
        super.onPause();
        webView.onPause();
        CookieManager.getInstance().flush();
    }

    @Override
    protected void onResume() {
        super.onResume();
        webView.onResume();
    }

    @Override
    protected void onDestroy() {
        webView.destroy();
        super.onDestroy();
    }

    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == FILE_CHOOSER_REQUEST) {
            if (filePathCallback != null) {
                filePathCallback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data));
                filePathCallback = null;
            }
            return;
        }
        super.onActivityResult(requestCode, resultCode, data);
    }

    private boolean isAppUrl(Uri uri) {
        String scheme = uri.getScheme();
        return ("https".equals(scheme) || "http".equals(scheme))
                && startHost != null && startHost.equalsIgnoreCase(uri.getHost());
    }

    private void openExternally(Uri uri) {
        try {
            Intent intent;
            if ("intent".equals(uri.getScheme())) {
                intent = Intent.parseUri(uri.toString(), Intent.URI_INTENT_SCHEME);
            } else {
                intent = new Intent(Intent.ACTION_VIEW, uri);
            }
            startActivity(intent);
        } catch (ActivityNotFoundException | java.net.URISyntaxException e) {
            Toast.makeText(this, "No app can open this link", Toast.LENGTH_SHORT).show();
        }
    }

    private void showOfflinePage(String failedUrl) {
        String retryUrl = TextUtils.isEmpty(failedUrl) ? startUrl : failedUrl;
        String html = "<!doctype html><html><head><meta name='viewport' content='width=device-width,initial-scale=1'>"
                + "<style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;"
                + "height:100vh;margin:0;background:#fff8f0;color:#4a2a10;text-align:center}"
                + "a{display:inline-block;margin-top:16px;padding:12px 28px;background:#8B4513;color:#fff;"
                + "border-radius:8px;text-decoration:none;font-weight:bold}</style></head><body><div>"
                + "<h2>No internet connection</h2><p>Check your connection and try again.</p>"
                + "<a href='" + TextUtils.htmlEncode(retryUrl) + "'>Try again</a></div></body></html>";
        webView.loadDataWithBaseURL(startUrl, html, "text/html", "UTF-8", null);
    }

    private class AppWebViewClient extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            Uri uri = request.getUrl();
            if (isAppUrl(uri)) {
                return false;
            }
            String scheme = uri.getScheme();
            if (("https".equals(scheme) || "http".equals(scheme)) && !request.hasGesture()) {
                // Redirects and script navigations (e.g. login flows) stay in the app.
                return false;
            }
            openExternally(uri);
            return true;
        }

        @Override
        public void onPageStarted(WebView view, String url, Bitmap favicon) {
            progressBar.setVisibility(View.VISIBLE);
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            progressBar.setVisibility(View.GONE);
        }

        @Override
        public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
            if (request.isForMainFrame()) {
                showOfflinePage(request.getUrl().toString());
            }
        }
    }

    private class AppChromeClient extends WebChromeClient {
        @Override
        public void onProgressChanged(WebView view, int newProgress) {
            progressBar.setProgress(newProgress);
        }

        @Override
        public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback,
                                         FileChooserParams params) {
            if (filePathCallback != null) {
                filePathCallback.onReceiveValue(null);
            }
            filePathCallback = callback;
            try {
                startActivityForResult(params.createIntent(), FILE_CHOOSER_REQUEST);
            } catch (ActivityNotFoundException e) {
                filePathCallback = null;
                Toast.makeText(MainActivity.this, "No app available to pick files", Toast.LENGTH_SHORT).show();
                return false;
            }
            return true;
        }
    }
}

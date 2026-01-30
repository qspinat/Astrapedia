/**
 * Debug script - runs before main.js to catch loading issues
 */
(function() {
  var loadingText = document.querySelector('.loading-text');

  function updateLoading(msg) {
    console.log('[DEBUG] ' + msg);
    if (loadingText) loadingText.textContent = msg;
  }

  // Check if CDN scripts loaded
  updateLoading('Checking libraries...');

  if (typeof THREE === 'undefined') {
    updateLoading('ERROR: THREE.js failed to load');
    return;
  }

  updateLoading('THREE.js OK. Loading app...');

  // Global error handler
  window.onerror = function(msg, url, line, col, error) {
    var loading = document.getElementById('loading');
    if (loading && !loading.classList.contains('hidden')) {
      loading.innerHTML = '<div style="color:#ff6b6b;text-align:center;padding:20px;">' +
        '<div style="font-size:48px;margin-bottom:16px;">⚠️</div>' +
        '<div style="font-size:18px;margin-bottom:8px;">Script Error</div>' +
        '<div style="font-size:12px;color:#999;max-width:300px;word-break:break-all;">' +
        msg + '<br><br>File: ' + (url || 'unknown') + '<br>Line: ' + (line || '?') +
        '</div>' +
        '<button onclick="location.reload()" style="margin-top:20px;padding:10px 20px;background:#3B82F6;color:white;border:none;border-radius:8px;">Retry</button>' +
        '</div>';
    }
    return false;
  };

  // Timeout: if loading screen is still visible after 30s, show error
  setTimeout(function() {
    var loading = document.getElementById('loading');
    if (loading && !loading.classList.contains('hidden')) {
      var text = loading.querySelector('.loading-text');
      var lastStatus = text ? text.textContent : 'Unknown';
      loading.innerHTML = '<div style="color:#ff6b6b;text-align:center;padding:20px;">' +
        '<div style="font-size:48px;margin-bottom:16px;">⏱️</div>' +
        '<div style="font-size:18px;margin-bottom:8px;">Loading timeout</div>' +
        '<div style="font-size:12px;color:#999;max-width:300px;">Last status: ' + lastStatus + '</div>' +
        '<button onclick="location.reload()" style="margin-top:20px;padding:10px 20px;background:#3B82F6;color:white;border:none;border-radius:8px;">Retry</button>' +
        '</div>';
    }
  }, 30000);
})();

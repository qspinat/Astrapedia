/**
 * Debug script - runs before main.js to catch loading issues
 */
(function() {
  var loadingText = document.querySelector('.loading-text');

  function updateLoading(msg) {
    console.log('[DEBUG] ' + msg);
    if (loadingText) loadingText.textContent = msg;
  }

  // Classic-script copy of modules/ui/LoadingError.js, for errors before
  // modules load. DOM calls, not innerHTML: the CSP blocks inline onclick, and
  // the detail is untrusted error text.
  function showLoadingError(title, detail, icon) {
    var loading = document.getElementById('loading');
    if (!loading || loading.classList.contains('hidden')) return;
    var card = document.createElement('div');
    card.className = 'loading-error';
    [['icon', icon], ['title', title], ['detail', detail]].forEach(function(p) {
      var el = document.createElement('div');
      el.className = 'loading-error-' + p[0];
      el.textContent = p[1];
      card.appendChild(el);
    });
    var retry = document.createElement('button');
    retry.textContent = 'Retry';
    retry.addEventListener('click', function() { location.reload(); });
    card.appendChild(retry);
    loading.replaceChildren(card);
  }

  // Check if CDN scripts loaded
  updateLoading('Checking libraries...');

  if (typeof THREE === 'undefined') {
    updateLoading('ERROR: THREE.js failed to load');
    return;
  }

  updateLoading('THREE.js OK. Loading app...');

  // Global error handler
  window.onerror = function(msg, url, line) {
    showLoadingError('Script Error', msg + '\n\nFile: ' + (url || 'unknown') +
        '\nLine: ' + (line || '?'), '⚠️');
    return false;
  };

  // Timeout: if loading screen is still visible after 30s, show error
  setTimeout(function() {
    var text = document.querySelector('#loading .loading-text');
    showLoadingError('Loading timeout',
        'Last status: ' + (text ? text.textContent : 'Unknown'), '⏱️');
  }, 30000);
})();

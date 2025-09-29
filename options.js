// Saves options to chrome.storage
function save_options() {
  const apiKey = document.getElementById('apiKey').value;
  const interval = document.getElementById('interval').value;
  chrome.storage.sync.set({
    apiKey: apiKey,
    quizInterval: interval
  }, function() {
    // Update status to let user know options were saved.
    const status = document.getElementById('status');
    status.textContent = 'Options saved.';
    setTimeout(function() {
      status.textContent = '';
    }, 750);

    // Notify the active tab's content script that settings have changed
    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
        // Find the YouTube tab and send the message
        const youtubeTab = tabs.find(tab => tab.url.includes("youtube.com/watch"));
        if (youtubeTab) {
            chrome.tabs.sendMessage(youtubeTab.id, { type: 'settingsUpdated' });
        }
    });
  });
}

// Restores select box and checkbox state using the preferences
// stored in chrome.storage.
function restore_options() {
  chrome.storage.sync.get({
    apiKey: '',
    quizInterval: 5
  }, function(items) {
    document.getElementById('apiKey').value = items.apiKey;
    document.getElementById('interval').value = items.quizInterval;
  });
}

document.addEventListener('DOMContentLoaded', restore_options);
document.getElementById('save').addEventListener('click', save_options);
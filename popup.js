document.addEventListener('DOMContentLoaded', function () {
  const enabledCheckbox = document.getElementById('enabled');

  // Load the saved state from storage
  chrome.storage.sync.get({ isEnabled: true }, function (data) {
    enabledCheckbox.checked = data.isEnabled;
  });

  // Save the state and notify the content script when the toggle is changed
  enabledCheckbox.addEventListener('change', function () {
    const isEnabled = enabledCheckbox.checked;
    chrome.storage.sync.set({ isEnabled: isEnabled }, function() {
      // Notify the active tab's content script
      chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'settingsUpdated' });
      });
    });
  });
});
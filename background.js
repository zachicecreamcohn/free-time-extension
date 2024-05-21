chrome.runtime.onInstalled.addListener(() => {
    chrome.identity.getAuthToken({interactive: true}, (token) => {
        console.log('User authenticated with token:', token);
    });
});

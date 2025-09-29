let video;
let quizInterval = 5; // Default interval in minutes
let nextQuizTime = 0;
let isEnabled = true;
let quizTimer = null;

// Function to initialize the script
const initialize = () => {
  // First, get the user settings from storage
  chrome.storage.sync.get(['isEnabled', 'quizInterval', 'apiKey'], (settings) => {
    isEnabled = settings.isEnabled !== false; // enabled by default
    if (settings.quizInterval) {
      quizInterval = parseInt(settings.quizInterval, 10);
    }
    // Only proceed if the feature is enabled and we have an API key
    if (isEnabled && settings.apiKey) {
      console.log('YouTube Quiz Extension is enabled.');
      // Wait for the video element to be available
      waitForVideo();
    } else {
        console.log('YouTube Quiz Extension is disabled or API key is missing.');
    }
  });
};

// Function to wait for the video element to appear in the DOM
const waitForVideo = () => {
    const videoElement = document.querySelector('video.html5-main-video');
    if (videoElement) {
        video = videoElement;
        setupVideoListener();
    } else {
        // If the video is not there yet, wait and try again
        setTimeout(waitForVideo, 500);
    }
}

// Function to set up event listeners on the video
const setupVideoListener = () => {
    // Reset quiz time when a new video starts playing
    video.addEventListener('loadeddata', resetQuizTimer);
    // Monitor playback time
    video.addEventListener('timeupdate', checkTime);
    // Initial setup
    resetQuizTimer();
}

// Function to reset the timer
const resetQuizTimer = () => {
    if (video) {
        nextQuizTime = video.currentTime + (quizInterval * 60);
        console.log(`Quiz timer reset. Next quiz at ${nextQuizTime.toFixed(2)}s`);
    }
}

// Function to check the video's current time and trigger the quiz
const checkTime = () => {
    if (!video || video.paused) {
        return;
    }

    if (video.currentTime >= nextQuizTime) {
        triggerQuiz();
    }
}

// Helper functions for async operations
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const clickElement = (element) => {
    if (element) {
        element.click();
        return true;
    }
    return false;
};

// Function to trigger the quiz (now async)
const triggerQuiz = async () => {
    video.pause();
    console.log(`Pausing video at ${video.currentTime.toFixed(2)}s to show quiz.`);

    // 1. Extract transcript (now an async operation)
    const transcript = await getTranscript();

    // 2. If transcript is available, send to background script
    if (transcript) {
        chrome.runtime.sendMessage({
            type: 'generateQuiz',
            transcript: transcript
        }, (response) => {
            if (response && response.quizData) {
                // 3. Show quiz UI
                showQuiz(response.quizData);
            } else {
                console.error("Failed to generate quiz, resuming video.", response ? response.error : 'No response');
                video.play();
                resetQuizTimer();
            }
        });
    } else {
        // This case is now handled by the new plan: skip quiz and reset
        console.warn("No transcript available for this segment. Resuming video.");
        video.play();
        resetQuizTimer();
    }
};

// New, robust transcript extraction logic
const getTranscript = async () => {
    console.log("Attempting to extract transcript...");
    try {
        // --- Step 1: Open the transcript panel if it's not already open ---
        let transcriptPanel = document.querySelector('ytd-transcript-renderer');
        let justOpened = false;

        if (!transcriptPanel) {
            console.log("Transcript panel not found, attempting to open it.");
            // The "More actions" button is inside the metadata section
            const moreActionsButton = document.querySelector('ytd-watch-metadata #actions button[aria-label="More actions"]');
            if (!clickElement(moreActionsButton)) {
                console.warn("More actions button not found.");
                return null;
            }
            await sleep(500); // Wait for menu to appear

            // Find and click "Show transcript" menu item
            const menuItems = document.querySelectorAll('ytd-menu-service-item-renderer');
            let showTranscriptButton;
            menuItems.forEach(item => {
                const buttonText = item.querySelector('yt-formatted-string');
                if (buttonText && buttonText.textContent.trim().toLowerCase() === 'show transcript') {
                    showTranscriptButton = item;
                }
            });

            if (!clickElement(showTranscriptButton)) {
                console.warn("Show transcript button not found in the menu.");
                clickElement(moreActionsButton); // Attempt to close the menu
                return null;
            }

            // Wait for transcript panel to appear
            await sleep(1000);
            transcriptPanel = document.querySelector('ytd-transcript-renderer');
            if (!transcriptPanel) {
                console.warn("Transcript panel did not appear after clicking 'Show transcript'.");
                return null;
            }
            justOpened = true;
        }

        // --- Step 2: Extract the text from the transcript ---
        const transcriptSegments = transcriptPanel.querySelectorAll('ytd-transcript-segment-renderer');
        if (transcriptSegments.length === 0) {
            console.warn("Could not find transcript segments on the page.");
            return null;
        }

        let relevantText = "";
        const startTime = nextQuizTime - (quizInterval * 60);
        const endTime = nextQuizTime;

        transcriptSegments.forEach(segment => {
            const textElement = segment.querySelector('.segment .yt-formatted-string');
            const timeElement = segment.querySelector('.cue-group-start-offset');

            if (timeElement && textElement) {
                const timeStr = timeElement.textContent.trim();
                const timeParts = timeStr.split(':').map(part => parseInt(part, 10));
                let segmentTime = 0;
                if (timeParts.length === 2) {
                    segmentTime = timeParts[0] * 60 + timeParts[1];
                } else if (timeParts.length === 3) {
                    segmentTime = timeParts[0] * 3600 + timeParts[1] * 60 + timeParts[2];
                }

                if (segmentTime >= startTime && segmentTime <= endTime) {
                    relevantText += textElement.textContent.trim() + " ";
                }
            }
        });

        // --- Step 3: Close the transcript panel if we opened it ---
        if (justOpened) {
            const closeButton = transcriptPanel.querySelector('#header #button');
            clickElement(closeButton);
            console.log("Transcript panel closed to clean up UI.");
        }

        if (relevantText.trim() === "") {
            console.warn("Could not extract any relevant transcript text for the given time range.");
            return null;
        }

        console.log("Successfully extracted transcript.");
        return relevantText.trim();

    } catch (error) {
        console.error("An error occurred during transcript extraction:", error);
        // Ensure UI cleanup happens even if there's an error during parsing
        const transcriptPanelCloseButton = document.querySelector('ytd-transcript-renderer #header #button');
        if (transcriptPanelCloseButton) clickElement(transcriptPanelCloseButton);
        return null;
    }
};

// Function to show the quiz UI
const showQuiz = (quizData) => {
    // Prevent duplicate overlays
    if (document.getElementById('yt-quiz-overlay')) {
        return;
    }

    const overlay = document.createElement('div');
    overlay.id = 'yt-quiz-overlay';

    const container = document.createElement('div');
    container.id = 'yt-quiz-container';

    const question = document.createElement('p');
    question.id = 'yt-quiz-question';
    question.textContent = quizData.question;
    container.appendChild(question);

    const answersList = document.createElement('ul');
    answersList.id = 'yt-quiz-answers';

    quizData.answers.forEach(answer => {
        const answerItem = document.createElement('li');
        const answerButton = document.createElement('button');
        answerButton.className = 'yt-quiz-answer-btn';
        answerButton.textContent = answer.text;
        answerButton.dataset.correct = answer.correct;
        answerButton.addEventListener('click', (event) => handleAnswerClick(event, quizData.explanation));
        answerItem.appendChild(answerButton);
        answersList.appendChild(answerItem);
    });

    container.appendChild(answersList);
    overlay.appendChild(container);

    // Inject into the page. The best place is within the video player itself.
    const playerContainer = document.querySelector('.html5-video-player');
    if (playerContainer) {
        playerContainer.appendChild(overlay);
    } else {
        document.body.appendChild(overlay); // Fallback
    }
}

// Function to handle the user's answer selection
const handleAnswerClick = (event, explanation) => {
    const isCorrect = event.target.dataset.correct === 'true';

    if (isCorrect) {
        closeQuiz();
    } else {
        // Show explanation for incorrect answer
        const container = document.getElementById('yt-quiz-container');
        // Clear existing answers
        document.getElementById('yt-quiz-answers').innerHTML = '';

        const explanationText = document.createElement('p');
        explanationText.id = 'yt-quiz-explanation';
        explanationText.textContent = explanation;
        container.appendChild(explanationText);

        const continueButton = document.createElement('button');
        continueButton.id = 'yt-quiz-continue-btn';
        continueButton.textContent = 'Continue';
        continueButton.addEventListener('click', closeQuiz);
        container.appendChild(continueButton);
    }
}

// Function to close the quiz overlay and resume the video
const closeQuiz = () => {
    const overlay = document.getElementById('yt-quiz-overlay');
    if (overlay) {
        overlay.remove();
    }
    video.play();
    resetQuizTimer();
}

// Listen for messages from popup (e.g., to enable/disable)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'settingsUpdated') {
        // Reload settings and re-initialize
        initialize();
    }
});


// Start the script
initialize();
// Listener for messages from the content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'generateQuiz') {
    // Asynchronous function to handle the quiz generation
    const generateQuiz = async () => {
      try {
        // 1. Get the API key from storage
        const { apiKey } = await chrome.storage.sync.get('apiKey');
        if (!apiKey) {
          throw new Error('API key is not set.');
        }

        const transcript = request.transcript;
        const model = "gemini-pro";
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

        // 2. Construct the prompt for the AI
        const prompt = `
          Based on the following video transcript segment, please generate a single multiple-choice question to test a viewer's understanding.

          Transcript: "${transcript}"

          The question should have 3 answer choices. One answer must be correct, and the other two must be plausible but incorrect.
          Provide an explanation for why the correct answer is right.

          Please format your response as a single, minified JSON object with no special characters or markdown. The JSON object should have the following structure:
          {
            "question": "Your question here",
            "answers": [
              {"text": "Answer choice 1", "correct": false},
              {"text": "Answer choice 2", "correct": true},
              {"text": "Answer choice 3", "correct": false}
            ],
            "explanation": "Your explanation for the correct answer here."
          }
          Ensure the 'answers' array is shuffled so the correct answer is not always in the same position.
        `;

        // 3. Make the API call to Gemini
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
          }),
        });

        if (!response.ok) {
          const errorBody = await response.json();
          throw new Error(`API request failed with status ${response.status}: ${errorBody.error.message}`);
        }

        const data = await response.json();

        // 4. Parse the AI's response
        // The response from Gemini is nested. We need to extract the text content.
        const rawJsonText = data.candidates[0].content.parts[0].text;

        // Clean the response to ensure it is valid JSON
        const cleanedJsonText = rawJsonText.replace(/```json/g, '').replace(/```/g, '').trim();

        const quizData = JSON.parse(cleanedJsonText);

        // 5. Send the structured quiz data back to the content script
        sendResponse({ quizData });

      } catch (error) {
        console.error('Error generating quiz:', error);
        sendResponse({ error: error.message });
      }
    };

    // Call the async function
    generateQuiz();

    // Return true to indicate that we will send a response asynchronously
    return true;
  }
});

// Log to confirm the background script is loaded
console.log("YouTube Learning Quiz background script loaded and listening.");
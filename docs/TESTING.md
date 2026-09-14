# Validation

Verified on Windows on September 14, 2026, using Node.js 24.15.0 and Playwright 1.62.1 / Chromium 151.

## Automated checks

- **23 unit tests passed:** URL validation, transcript identity/size/emptiness, source/instruction separation, response parsing, refusals, incomplete outputs, HTTP errors, quota, network failures, timeouts, signed-caption URL restrictions, Unicode, timestamps, language ranking, native fallback, and navigation during extraction.
- **Browser integration checks passed:** a real unpacked extension runs its content script, service worker, injected main-world extractor, settings page, and clipboard action.
- **Manifest and JavaScript checks passed.**
- **Git whitespace check passed.**

The browser suite covers:

1. Missing-key errors without a request.
2. Saving settings, hiding the saved key, and retaining it for model-only changes.
3. Transcript-to-summary flow, reopening without another request, and copying.
4. Denied access to key storage from the content-script execution world.
5. YouTube navigation without a full document reload.
6. Legacy and modern native transcript layouts.
7. Avoiding duplicated timestamp accessibility labels.
8. Rejecting filtered native transcripts before API usage.
9. XML captions and character entities.
10. Rejected-key errors and recovery.
11. Discarding late responses after navigation.
12. Missing captions without a request.
13. Removing the saved key and hiding the UI away from watch pages.
14. No uncaught page-script errors.

Network data in the browser suite is simulated. The request body and complete browser messaging flow are exercised, but this is not a live paid OpenAI test.

## Live YouTube extraction

The extractor was also run against public YouTube pages in a clean Chromium session, without calling OpenAI:

| Video | Result |
| --- | --- |
| Steve Jobs' 2005 Stanford Commencement Address (`UF8uR6Z6KLc`) | 12,935 characters, 110 segments, final timestamp 15:01 in a 15:04 video |
| Me at the zoo (`jNQXAC9IVRw`) | 238 characters, 3 segments, final timestamp 0:16 in a 0:19 video |

Both used YouTube's modern native transcript panel after direct signed-caption URLs returned empty responses. This live check exposed a layout change that was implemented and added to browser regression coverage.

These checks demonstrate extraction on those pages at the time of testing. They do not guarantee every language, account, YouTube experiment, restricted video, or future layout.

## Manual check with your own key

A live OpenAI completion was not performed because no API key was supplied.

1. Load `extension/` in Chrome and save a valid API key.
2. Open a video with captions and click **Summarize video**.
3. Confirm the summary is specific to the transcript.
4. Switch to another video without reloading and summarize again.
5. Check a captionless video and confirm an explanatory error appears.
6. Remove the API key when finished if you do not want it kept in the browser.

The summary panel and settings page were visually inspected from browser screenshots. The README preview is a test fixture with simulated summary text.

## Reading view and custom prompts (v1.1)

Added checks for custom instructions replacing the default, blank-prompt fallback, oversized prompts, settings persistence after reopening, restoring defaults, and regenerating with the latest saved instructions. Desktop and narrow-window geometry checks verify that the video and summary do not overlap, and closing restores the normal player layout. The reading view was also inspected on a live YouTube watch page without an OpenAI request.

The clean live browser profile showed YouTube’s cookie-consent overlay. Player and panel geometry and layout restoration were checked there; playback interaction under that overlay was not validated.

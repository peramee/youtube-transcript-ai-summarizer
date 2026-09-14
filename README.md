# YouTube Brief

A local, unpacked Chrome extension: click **Summarize video** on YouTube to get an OpenAI summary of the video's transcript.

## Implementation plan

- Manifest V3, plain JavaScript, no build step or runtime dependencies.
- A small button and summary panel on desktop YouTube watch pages.
- Transcript extraction from the current player, with YouTube's transcript panel as a fallback.
- OpenAI Responses API calls in the extension service worker; API key stays out of the web page.
- Local settings, explicit errors, navigation handling, and automated tests.

Installation and usage instructions will be included with the implementation.

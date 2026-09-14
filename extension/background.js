import { videoIdFromUrl, validateTranscript, summarize } from "./core.js";
import { extractTranscript } from "./transcript.js";

// Local storage is deliberately unavailable to content scripts, including our own.
const storageReady = chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
const active = new Set();

async function handle(message, sender) {
  if (sender.id !== chrome.runtime.id) throw new Error("Unrecognized extension request.");
  const videoId = videoIdFromUrl(sender.url);
  if (!sender.tab?.id || sender.frameId !== 0 || !videoId) throw new Error("Open a YouTube video to use YouTube Brief.");
  if (message.type === "OPEN_SETTINGS") {
    await chrome.runtime.openOptionsPage();
    return { ok: true };
  }
  if (message.videoId !== videoId) throw new Error("The video changed. Try again.");
  const tabId = sender.tab.id;
  if (active.has(tabId)) throw new Error("A summary is already running in this tab. Please wait.");
  active.add(tabId);
  // Extension API activity keeps the worker alive during transcript extraction.
  const keepAlive = setInterval(() => chrome.runtime.getPlatformInfo().catch(() => {}), 20_000);
  try {
    await storageReady;
    const settings = await chrome.storage.local.get(["apiKey", "model"]);
    if (!settings.apiKey) throw new Error("Add your OpenAI API key in Settings, then try again.");
    const results = await chrome.scripting.executeScript({
      target: { tabId, frameIds: [0] }, world: "MAIN", func: extractTranscript, args: [videoId]
    });
    const transcript = validateTranscript(results[0]?.result, videoId);
    const tab = await chrome.tabs.get(tabId);
    if (videoIdFromUrl(tab.url) !== videoId) throw new Error("The video changed. Try again.");
    await chrome.tabs.sendMessage(tabId, { type: "SUMMARY_PROGRESS", videoId, text: "Writing your summary…" }).catch(() => {});
    const summary = await summarize(transcript, settings);
    return { ok: true, videoId, summary, title: transcript.title, language: transcript.language };
  } finally {
    clearInterval(keepAlive);
    active.delete(tabId);
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!["SUMMARIZE", "OPEN_SETTINGS"].includes(message?.type)) return false;
  handle(message, sender).then(sendResponse, error => sendResponse({ ok: false, error: error.message || "Something went wrong. Reload YouTube and try again." }));
  return true;
});

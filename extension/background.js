import { videoIdFromUrl, validateTranscript, summarize } from "./core.js";
import { extractTranscript } from "./transcript.js";
import { answerQuestion } from "./chat.js";

// Local storage is deliberately unavailable to content scripts, including our own.
const storageReady = Promise.all([
  chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" }),
  chrome.storage.session.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" })
]);
const active = new Set();
const sessionKey = tabId => `chat:${tabId}`;
chrome.tabs.onRemoved.addListener(tabId => { chrome.storage.session.remove(sessionKey(tabId)).catch(() => {}); });

const activeVideos = new Set();
const cacheKey = videoId => `video-chat:${videoId}`;
async function saveCache(session) {
  try { await chrome.storage.local.set({ [cacheKey(session.videoId)]: session }); }
  catch { throw new Error("Could not save this video's chat. Chrome's local storage may be full. Clear chat on older videos to free space, then try again."); }
}
async function bindSession(tabId, documentId, session) {
  await chrome.storage.session.set({ [sessionKey(tabId)]: { id: session.id, videoId: session.videoId, documentId } });
}
function snapshot(session) {
  return { ok: true, videoId: session.videoId, sessionId: session.id, summary: session.summary,
    title: session.transcript.title, language: session.transcript.language, messages: session.messages || [] };
}

async function handle(message, sender) {
  if (sender.id !== chrome.runtime.id) throw new Error("Unrecognized extension request.");
  if (!sender.tab?.id || sender.frameId !== 0 || new URL(sender.url).origin !== "https://www.youtube.com") {
    throw new Error("Open a YouTube video to use YouTube Brief.");
  }
  // sender.url can retain the document's original URL after YouTube SPA navigation.
  const videoId = videoIdFromUrl((await chrome.tabs.get(sender.tab.id)).url);
  if (!videoId) throw new Error("Open a YouTube video to use YouTube Brief.");
  if (message.type === "OPEN_SETTINGS") {
    await chrome.runtime.openOptionsPage();
    return { ok: true };
  }
  if (message.videoId !== videoId) throw new Error("The video changed. Try again.");
  const tabId = sender.tab.id;
  await storageReady;
  if (message.type === "GET_CACHE") {
    const session = (await chrome.storage.local.get(cacheKey(videoId)))[cacheKey(videoId)];
    if (!session) return { ok: true, videoId, cached: false };
    await bindSession(tabId, sender.documentId, session);
    return { ...snapshot(session), cached: true };
  }
  if (activeVideos.has(videoId)) throw new Error("An AI request for this video is already running. Please wait and try again.");
  if (active.has(tabId)) throw new Error("An AI request is already running in this tab. Please wait.");
  active.add(tabId);
  activeVideos.add(videoId);
  // Extension API activity keeps the worker alive during transcript extraction.
  const keepAlive = setInterval(() => chrome.runtime.getPlatformInfo().catch(() => {}), 20_000);
  try {
    await storageReady;
    if (message.type === "CHAT" || message.type === "CLEAR_CHAT") {
      const key = sessionKey(tabId);
      const binding = (await chrome.storage.session.get(key))[key];
      const session = (await chrome.storage.local.get(cacheKey(videoId)))[cacheKey(videoId)];
      if (!session || session.id !== message.sessionId || binding?.id !== session.id || binding.videoId !== videoId || binding.documentId !== sender.documentId) {
        throw new Error("This video's chat changed in another tab. Reload this page to restore the latest conversation.");
      }
      if (message.type === "CLEAR_CHAT") {
        session.history = [];
        session.messages = [];
        session.id = crypto.randomUUID();
        session.updatedAt = Date.now();
        await saveCache(session);
        await bindSession(tabId, sender.documentId, session);
        return snapshot(session);
      }
      const settings = await chrome.storage.local.get(["apiKey", "model", "systemPrompt"]);
      if (!settings.apiKey) throw new Error("Add your OpenAI API key in Settings, then try again.");
      const answer = await answerQuestion(session, message.question, settings, message.searchWeb === true);
      if (videoIdFromUrl((await chrome.tabs.get(tabId)).url) !== videoId) throw new Error("The video changed. Try again.");
      const sources = [...new Set(answer.citations.map(citation => `${citation.title}: ${citation.url}`))];
      const rememberedAnswer = answer.text + (answer.warning ? `\n[${answer.warning}]` : "") + (sources.length ? `\nSources from this answer:\n${sources.join("\n")}` : "");
      session.history.push({ role: "user", content: message.question.trim() }, { role: "assistant", content: rememberedAnswer });
      session.messages ||= [];
      session.messages.push({ role: "user", text: message.question.trim() }, { role: "assistant", ...answer });
      session.updatedAt = Date.now();
      await saveCache(session);
      return { ...snapshot(session), answer };
    }
    const settings = await chrome.storage.local.get(["apiKey", "model", "systemPrompt"]);
    if (!settings.apiKey) throw new Error("Add your OpenAI API key in Settings, then try again.");
    const results = await chrome.scripting.executeScript({
      target: { tabId, frameIds: [0] }, world: "MAIN", func: extractTranscript, args: [videoId]
    });
    const transcript = validateTranscript(results[0]?.result, videoId);
    const tab = await chrome.tabs.get(tabId);
    if (videoIdFromUrl(tab.url) !== videoId) throw new Error("The video changed. Try again.");
    await chrome.tabs.sendMessage(tabId, { type: "SUMMARY_PROGRESS", videoId, text: "Writing your summary…" }).catch(() => {});
    const summary = await summarize(transcript, settings);
    if (videoIdFromUrl((await chrome.tabs.get(tabId)).url) !== videoId) throw new Error("The video changed. Try again.");
    const id = crypto.randomUUID();
    const session = { id, videoId, transcript, summary, history: [], messages: [], updatedAt: Date.now() };
    await saveCache(session);
    await bindSession(tabId, sender.documentId, session);
    return snapshot(session);
  } finally {
    clearInterval(keepAlive);
    active.delete(tabId);
    activeVideos.delete(videoId);
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!["SUMMARIZE", "OPEN_SETTINGS", "CHAT", "CLEAR_CHAT", "GET_CACHE"].includes(message?.type)) return false;
  handle(message, sender).then(sendResponse, error => sendResponse({ ok: false, error: error.message || "Something went wrong. Reload YouTube and try again." }));
  return true;
});

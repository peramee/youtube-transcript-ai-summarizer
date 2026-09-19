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

async function saveSession(tabId, session) {
  const key = sessionKey(tabId);
  const sessions = Object.entries(await chrome.storage.session.get(null))
    .filter(([name]) => name.startsWith("chat:") && name !== key)
    .sort((a, b) => b[1].updatedAt - a[1].updatedAt);
  // Bound memory usage even when many video tabs are left open.
  const expired = sessions.filter(([, value], index) => index >= 11 || Date.now() - value.updatedAt > 7_200_000).map(([name]) => name);
  if (expired.length) await chrome.storage.session.remove(expired);
  await chrome.storage.session.set({ [key]: session });
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
  if (active.has(tabId)) throw new Error("An AI request is already running in this tab. Please wait.");
  active.add(tabId);
  // Extension API activity keeps the worker alive during transcript extraction.
  const keepAlive = setInterval(() => chrome.runtime.getPlatformInfo().catch(() => {}), 20_000);
  try {
    await storageReady;
    if (message.type === "CHAT" || message.type === "CLEAR_CHAT") {
      const key = sessionKey(tabId);
      const session = (await chrome.storage.session.get(key))[key];
      if (!session || session.id !== message.sessionId || session.videoId !== videoId || session.documentId !== sender.documentId || Date.now() - session.updatedAt > 7_200_000) {
        throw new Error("This chat has expired. Regenerate the summary to start a new conversation.");
      }
      if (message.type === "CLEAR_CHAT") {
        session.history = [];
        session.updatedAt = Date.now();
        await saveSession(tabId, session);
        return { ok: true, videoId };
      }
      const settings = await chrome.storage.local.get(["apiKey", "model", "systemPrompt"]);
      if (!settings.apiKey) throw new Error("Add your OpenAI API key in Settings, then try again.");
      const answer = await answerQuestion(session, message.question, settings, message.searchWeb === true);
      if (videoIdFromUrl((await chrome.tabs.get(tabId)).url) !== videoId) throw new Error("The video changed. Try again.");
      const sources = [...new Set(answer.citations.map(citation => `${citation.title}: ${citation.url}`))];
      const rememberedAnswer = answer.text + (sources.length ? `\nSources from this answer:\n${sources.join("\n")}` : "");
      session.history.push({ role: "user", content: message.question.trim() }, { role: "assistant", content: rememberedAnswer });
      session.updatedAt = Date.now();
      await saveSession(tabId, session);
      return { ok: true, videoId, answer };
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
    await saveSession(tabId, {
      id, videoId, documentId: sender.documentId, transcript, summary, history: [], updatedAt: Date.now()
    });
    return { ok: true, videoId, sessionId: id, summary, title: transcript.title, language: transcript.language };
  } finally {
    clearInterval(keepAlive);
    active.delete(tabId);
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!["SUMMARIZE", "OPEN_SETTINGS", "CHAT", "CLEAR_CHAT"].includes(message?.type)) return false;
  handle(message, sender).then(sendResponse, error => sendResponse({ ok: false, error: error.message || "Something went wrong. Reload YouTube and try again." }));
  return true;
});

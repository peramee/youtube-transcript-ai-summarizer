(() => {
  if (document.getElementById("youtube-brief-root")) return;
  const host = document.createElement("div");
  host.id = "youtube-brief-root";
  const shadow = host.attachShadow({ mode: "open" });
  // Only this static template is HTML. Model output is rendered with safe DOM nodes, never HTML.
  shadow.innerHTML = `
    <style>
      :host { all: initial; position: fixed; right: 24px; bottom: 24px; z-index: 2147483000; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color-scheme: light; }
      * { box-sizing: border-box; }
      [hidden] { display: none !important; }
      button { font: inherit; cursor: pointer; border: 0; }
      :focus-visible { outline: 3px solid #86a790; outline-offset: 3px; }
      .launch { display: flex; align-items: center; gap: 10px; background: #264e36; color: #fff; border: 1px solid #608069; border-radius: 30px; padding: 13px 19px; font-size: 13px; font-weight: 650; box-shadow: 0 4px 20px #0003; margin-left: auto; }
      .spark { font-size: 18px; font-weight: 400; }
      .panel { display: flex; flex-direction: column; position: fixed; top: 24px; right: 24px; bottom: 90px; width: calc(100vw / 3); background: #f8f9f5; border: 1px solid #d3dbd0; border-radius: 16px; box-shadow: 0 12px 48px #0003; overflow: hidden; color: #202822; }
      header { flex-shrink: 0; display: flex; justify-content: space-between; align-items: center; padding: 19px 20px 13px; }
      .brand { font-size: 10px; letter-spacing: 1.8px; font-weight: 750; color: #526c58; }
      .close { border-radius: 6px; padding: 2px 7px; background: transparent; color: #626d64; font-size: 22px; line-height: 1; }
      .body { flex: 1; min-height: 0; padding: 12px 32px 32px; overflow-y: auto; overscroll-behavior: contain; }
      h2 { margin: 3px 0 12px; font-size: 27px; line-height: 1.3; letter-spacing: -.5px; overflow-wrap: anywhere; }
      .meta { font-size: 11px; color: #69766b; margin: 0 0 16px; }
      .summary { white-space: pre-wrap; overflow-wrap: anywhere; font-size: 16px; line-height: 1.8; margin: 0; }
      .summary.error { color: #9a3030; }
      footer { flex-shrink: 0; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; border-top: 1px solid #dce2d7; padding: 12px 18px; }
      .subtle { background: transparent; padding: 7px 4px; font-size: 12px; color: #4d6252; }
      .copy { background: #e5ebe0; color: #294b34; font-size: 12px; font-weight: 650; padding: 8px 12px; border-radius: 7px; }
      button:hover { filter: brightness(.93); }
      button:disabled { cursor: wait; opacity: .6; }
      .chat-log { display: grid; gap: 16px; margin-top: 24px; }
      .chat-message { border-top: 1px solid #dce2d7; padding-top: 14px; }
      .chat-message > strong { display: block; font-size: 11px; color: #526c58; margin-bottom: 6px; }
      .chat-message p { margin: 0; font-size: 14px; line-height: 1.7; white-space: pre-wrap; overflow-wrap: anywhere; }
      .chat-answer { font-size: 14px; line-height: 1.7; overflow-wrap: anywhere; }
      .chat-answer p { margin: 0 0 10px; white-space: normal; }
      .chat-answer h1, .chat-answer h2, .chat-answer h3, .chat-answer h4, .chat-answer h5, .chat-answer h6 { margin: 18px 0 8px; font-size: 16px; line-height: 1.35; letter-spacing: normal; }
      .chat-answer h1 { font-size: 21px; }
      .chat-answer h2 { font-size: 19px; }
      .chat-answer > :first-child { margin-top: 0; }
      .chat-answer ul, .chat-answer ol { padding-left: 24px; margin: 8px 0; }
      .chat-answer li > ul, .chat-answer li > ol { margin: 4px 0; }
      .chat-answer li { margin: 4px 0; }
      .chat-answer blockquote { border-left: 3px solid #a7b7a5; margin: 10px 0; padding-left: 12px; color: #526c58; }
      .chat-answer code { background: #e5ebe0; padding: 2px 4px; border-radius: 3px; font-size: .9em; }
      .chat-answer pre { overflow-x: auto; background: #e5ebe0; padding: 12px; border-radius: 6px; white-space: pre; }
      .chat-answer pre code { padding: 0; }
      .chat-answer hr { border: 0; border-top: 1px solid #dce2d7; margin: 16px 0; }
      .chat-message.user { background: #eaf0e5; padding: 12px; border: 0; border-radius: 8px; }
      .chat-message a { color: #245d3a; text-decoration: underline; }
      .chat-form { flex-shrink: 0; border-top: 1px solid #dce2d7; padding: 12px 18px; }
      .chat-entry { display: flex; gap: 8px; align-items: flex-end; }
      .chat-input { flex: 1; width: 0; min-width: 0; resize: vertical; min-height: 44px; max-height: 110px; padding: 10px; border: 1px solid #cbd2c9; border-radius: 8px; background: white; color: #202822; font: inherit; font-size: 13px; line-height: 1.4; }
      .send { border-radius: 8px; padding: 12px; color: white; background: #264e36; font-size: 12px; }
      .chat-tools { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-top: 7px; font-size: 11px; color: #526c58; }
      .chat-tools label { display: flex; align-items: center; gap: 5px; }
      .chat-status { font-size: 11px; line-height: 1.4; margin: 6px 0 0; color: #526c58; }
      .chat-status:empty { display: none; }
      @media (max-width: 800px) {
        :host { right: 16px; bottom: 16px; }
        .panel { left: 16px; right: 16px; width: auto; top: calc(96px + min(56.25vw - 18px, 27vh)); bottom: 76px; }
        .body { padding: 0 20px 24px; }
        h2 { font-size: 21px; }
        .summary { font-size: 14px; }
      }
    </style>
    <section class="panel" role="region" aria-label="Video summary" hidden>
      <header><span class="brand">YOUTUBE BRIEF</span><button class="close" aria-label="Close summary">×</button></header>
      <div class="body"><h2>Your video, distilled.</h2><p class="meta">Based on the transcript · Powered by OpenAI</p><p class="summary" role="status" aria-live="polite"></p><div class="chat-log" role="log" aria-label="Conversation" aria-live="polite"></div></div>
      <form class="chat-form" aria-label="Ask about this video" hidden>
        <div class="chat-entry"><textarea class="chat-input" aria-label="Ask about the transcript" placeholder="Ask a question, or type fc to fact-check…" rows="2" maxlength="4000"></textarea><button class="send" type="submit" disabled>Send</button></div>
        <div class="chat-tools"><label title="Use OpenAI web search for external sources. Additional API charges may apply."><input class="search-web" type="checkbox">Search web</label><button class="subtle clear-chat" type="button" hidden>Clear chat</button></div>
        <p class="chat-status" role="status" aria-live="polite"></p>
      </form>
      <footer><button class="subtle settings">Settings</button><button class="subtle retry" hidden>Try again</button><button class="subtle regenerate" hidden>Regenerate</button><button class="copy" hidden>Copy summary</button></footer>
    </section>
    <button class="launch" aria-expanded="false"><span class="spark" aria-hidden="true">✧</span><span class="label">Summarize video</span></button>`;
  document.documentElement.append(host);
  const $ = selector => shadow.querySelector(selector);
  const panel = $(".panel"), launch = $(".launch"), output = $(".summary"), copy = $(".copy"), retry = $(".retry");
  const regenerate = $(".regenerate");
  const chatForm = $(".chat-form"), chatInput = $(".chat-input"), chatLog = $(".chat-log"), chatStatus = $(".chat-status"), send = $(".send"), clearChat = $(".clear-chat"), searchWeb = $(".search-web");
  let sessionId = null;
  let videoId = null, generation = 0, busy = false, result = null;
  function resetChat() {
    sessionId = null;
    chatForm.hidden = true;
    chatLog.replaceChildren();
    chatInput.value = "";
    chatStatus.textContent = "";
    clearChat.hidden = true;
    searchWeb.checked = false;
    updateChatControls();
  }
  function updateChatControls() {
    send.disabled = busy || !chatInput.value.trim();
    chatInput.readOnly = busy;
    searchWeb.disabled = clearChat.disabled = regenerate.disabled = busy;
  }
  function addMessage(role, text, citations = [], searched = false) {
    const article = document.createElement("article");
    article.className = `chat-message ${role}`;
    const label = document.createElement("strong");
    label.textContent = role === "user" ? "You" : searched ? "AI · Web search" : "AI · No web search";
    const paragraph = document.createElement(role === "assistant" ? "div" : "p");
    if (role === "assistant") {
      paragraph.className = "chat-answer";
      globalThis.renderChatMarkdown(paragraph, text, citations);
    } else paragraph.textContent = text;
    article.append(label, paragraph);
    chatLog.append(article);
    $(".body").scrollTop = $(".body").scrollHeight;
    return article;
  }
  function showMessages(messages = []) {
    chatLog.replaceChildren();
    for (const message of messages) addMessage(message.role, message.text, message.citations, message.searched);
    clearChat.hidden = !messages.length;
    chatStatus.textContent = messages.at(-1)?.warning || "";
  }
  function showSnapshot(response) {
    result = response.summary;
    sessionId = response.sessionId;
    chatForm.hidden = !sessionId;
    $("h2").textContent = response.title;
    $(".meta").textContent = `Transcript: ${response.language} · AI summaries can make mistakes`;
    output.textContent = result;
    output.classList.remove("error");
    copy.hidden = regenerate.hidden = false;
    retry.hidden = true;
    showMessages(response.messages);
  }
  async function restoreCache(requestedId, requestGeneration) {
    busy = true;
    launch.disabled = true;
    try {
      const response = await chrome.runtime.sendMessage({ type: "GET_CACHE", videoId: requestedId });
      if (requestGeneration !== generation || getVideoId() !== requestedId) return;
      if (!response?.ok) throw new Error(response?.error || "Could not restore saved chat.");
      if (response.cached) showSnapshot(response);
    } catch (error) {
      if (requestGeneration !== generation || getVideoId() !== requestedId) return;
      output.textContent = error.message;
      retry.hidden = false;
    } finally {
      if (requestGeneration === generation) {
        busy = false;
        launch.disabled = false;
        $(".label").textContent = result ? "Video summary" : "Summarize video";
        updateChatControls();
      }
    }
  }
  function getVideoId() {
    const url = new URL(location.href), id = url.searchParams.get("v");
    return url.pathname === "/watch" && /^[\w-]{11}$/.test(id ?? "") ? id : null;
  }
  function setOpen(open) {
    panel.hidden = !open;
    document.documentElement.classList.toggle("youtube-brief-reading", open && !document.fullscreenElement);
    window.dispatchEvent(new Event("resize"));
    launch.setAttribute("aria-expanded", String(open));
  }
  function sync() {
    const next = getVideoId();
    host.style.display = next && !document.fullscreenElement ? "block" : "none";
    document.documentElement.classList.toggle("youtube-brief-reading", Boolean(next && !panel.hidden && !document.fullscreenElement));
    if (next === videoId) return;
    videoId = next;
    generation++;
    busy = false;
    result = null;
    resetChat();
    setOpen(false);
    launch.disabled = false;
    $(".label").textContent = "Summarize video";
    $("h2").textContent = "Your video, distilled.";
    $(".meta").textContent = "Based on the transcript · Powered by OpenAI";
    output.textContent = "";
    copy.hidden = retry.hidden = regenerate.hidden = true;
    if (next) restoreCache(next, generation);
  }
  async function run() {
    sync();
    if (busy || !videoId) return;
    const requestGeneration = ++generation;
    const requestedId = videoId;
    busy = true;
    result = null;
    resetChat();
    setOpen(true);
    launch.disabled = true;
    copy.hidden = retry.hidden = regenerate.hidden = true;
    copy.textContent = "Copy summary";
    output.classList.remove("error");
    output.textContent = "Reading the video transcript…";
    $(".label").textContent = "Summarizing…";
    try {
      const response = await chrome.runtime.sendMessage({ type: "SUMMARIZE", videoId: requestedId });
      if (requestGeneration !== generation || getVideoId() !== requestedId) return;
      if (!response?.ok) throw new Error(response?.error || "No response. Reload YouTube and try again.");
      if (response.videoId !== requestedId) throw new Error("The video changed. Try again.");
      showSnapshot(response);
    } catch (error) {
      if (requestGeneration !== generation || getVideoId() !== requestedId) return;
      output.textContent = /Extension context invalidated/i.test(error.message) ? "The extension was reloaded. Refresh this YouTube page to reconnect." : error.message;
      output.classList.add("error");
      retry.hidden = false;
    } finally {
      if (requestGeneration === generation) {
        busy = false;
        updateChatControls();
        launch.disabled = false;
        $(".label").textContent = result ? "Video summary" : "Summarize video";
      }
    }
  }
  launch.addEventListener("click", () => result ? setOpen(panel.hidden) : run());
  retry.addEventListener("click", run);
  regenerate.addEventListener("click", run);
  chatInput.addEventListener("input", updateChatControls);
  chatInput.addEventListener("keydown", event => {
    if (event.key === "Escape") return;
    event.stopPropagation(); // Do not trigger YouTube shortcuts while typing.
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      if (!send.disabled) chatForm.requestSubmit();
    }
  });
  chatInput.addEventListener("keyup", event => event.stopPropagation());
  chatForm.addEventListener("submit", async event => {
    event.preventDefault();
    sync();
    if (busy || !sessionId || !chatInput.value.trim()) return;
    const currentGeneration = generation, requestedId = videoId;
    const question = chatInput.value.trim();
    const useSearch = searchWeb.checked || question.toLowerCase() === "fc";
    busy = true;
    updateChatControls();
    chatStatus.textContent = useSearch ? "Checking sources…" : "Thinking…";
    const pending = addMessage("user", question);
    try {
      const response = await chrome.runtime.sendMessage({ type: "CHAT", videoId, sessionId, question, searchWeb: useSearch });
      if (currentGeneration !== generation || getVideoId() !== requestedId) return;
      if (!response?.ok) throw new Error(response?.error || "No answer received. Try again.");
      showMessages(response.messages);
      chatInput.value = "";
      chatStatus.textContent = response.answer.warning || "";
      clearChat.hidden = false;
    } catch (error) {
      if (currentGeneration !== generation || getVideoId() !== requestedId) return;
      pending.remove();
      chatStatus.textContent = error.message || "Could not send your question. Try again.";
    } finally {
      if (currentGeneration === generation) { busy = false; updateChatControls(); }
    }
  });
  clearChat.addEventListener("click", async () => {
    if (busy || !sessionId) return;
    const currentGeneration = generation;
    busy = true;
    updateChatControls();
    try {
      const response = await chrome.runtime.sendMessage({ type: "CLEAR_CHAT", videoId, sessionId });
      if (currentGeneration !== generation) return;
      if (!response?.ok) throw new Error(response?.error || "Could not clear chat.");
      sessionId = response.sessionId;
      showMessages(response.messages);
    } catch (error) {
      if (currentGeneration === generation) chatStatus.textContent = error.message;
    } finally {
      if (currentGeneration === generation) { busy = false; updateChatControls(); }
    }
  });
  $(".close").addEventListener("click", () => { setOpen(false); launch.focus(); });
  shadow.addEventListener("keydown", event => {
    if (event.key === "Escape") { setOpen(false); launch.focus(); event.stopPropagation(); }
  });
  $(".settings").addEventListener("click", async () => {
    try {
      const response = await chrome.runtime.sendMessage({ type: "OPEN_SETTINGS" });
      if (!response?.ok) throw new Error(response?.error);
    } catch { output.textContent = "Open settings from the YouTube Brief icon in Chrome’s toolbar. Reload YouTube if the extension was updated."; }
  });
  copy.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(result);
      copy.textContent = "Copied";
      setTimeout(() => { copy.textContent = "Copy summary"; }, 1800);
    } catch { copy.textContent = "Select text to copy"; }
  });
  chrome.runtime.onMessage.addListener(message => {
    if (message?.type === "SUMMARY_PROGRESS" && busy && message.videoId === videoId && getVideoId() === videoId) output.textContent = message.text;
  });
  document.addEventListener("yt-navigate-finish", sync);
  document.addEventListener("fullscreenchange", sync);
  window.addEventListener("popstate", sync);
  // Covers history changes that do not emit YouTube's navigation event.
  setInterval(sync, 1000);
  sync();
})();

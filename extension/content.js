(() => {
  if (document.getElementById("youtube-brief-root")) return;
  const host = document.createElement("div");
  host.id = "youtube-brief-root";
  const shadow = host.attachShadow({ mode: "closed" });
  // Only this static template is HTML. Titles, errors, and AI output use textContent.
  shadow.innerHTML = `
    <style>
      :host { all: initial; position: fixed; right: 24px; bottom: 24px; z-index: 2147483000; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color-scheme: light; }
      * { box-sizing: border-box; }
      [hidden] { display: none !important; }
      button { font: inherit; cursor: pointer; border: 0; }
      :focus-visible { outline: 3px solid #86a790; outline-offset: 3px; }
      .launch { display: flex; align-items: center; gap: 10px; background: #264e36; color: #fff; border: 1px solid #608069; border-radius: 30px; padding: 13px 19px; font-size: 13px; font-weight: 650; box-shadow: 0 4px 20px #0003; margin-left: auto; }
      .spark { font-size: 18px; font-weight: 400; }
      .panel { display: flex; flex-direction: column; width: min(390px, calc(100vw - 32px)); max-height: min(650px, calc(100vh - 110px)); margin-bottom: 12px; background: #f8f9f5; border: 1px solid #d3dbd0; border-radius: 16px; box-shadow: 0 12px 48px #0003; overflow: hidden; color: #202822; }
      header { display: flex; justify-content: space-between; align-items: center; padding: 19px 20px 13px; }
      .brand { font-size: 10px; letter-spacing: 1.8px; font-weight: 750; color: #526c58; }
      .close { border-radius: 6px; padding: 2px 7px; background: transparent; color: #626d64; font-size: 22px; line-height: 1; }
      .body { padding: 0 22px 20px; overflow-y: auto; overscroll-behavior: contain; }
      h2 { margin: 3px 0 12px; font-size: 21px; line-height: 1.3; letter-spacing: -.5px; overflow-wrap: anywhere; }
      .meta { font-size: 11px; color: #69766b; margin: 0 0 16px; }
      .summary { white-space: pre-wrap; overflow-wrap: anywhere; font-size: 13px; line-height: 1.75; margin: 0; }
      .summary.error { color: #9a3030; }
      footer { display: flex; align-items: center; justify-content: space-between; gap: 10px; border-top: 1px solid #dce2d7; padding: 12px 18px; }
      .subtle { background: transparent; padding: 7px 4px; font-size: 12px; color: #4d6252; }
      .copy { background: #e5ebe0; color: #294b34; font-size: 12px; font-weight: 650; padding: 8px 12px; border-radius: 7px; }
      button:hover { filter: brightness(.93); }
      button:disabled { cursor: wait; opacity: .6; }
      @media (max-width: 500px) { :host { right: 16px; bottom: 16px; } }
    </style>
    <section class="panel" role="region" aria-label="Video summary" hidden>
      <header><span class="brand">YOUTUBE BRIEF</span><button class="close" aria-label="Close summary">×</button></header>
      <div class="body"><h2>Your video, distilled.</h2><p class="meta">Based on the transcript · Powered by OpenAI</p><p class="summary" role="status" aria-live="polite"></p></div>
      <footer><button class="subtle settings">Settings</button><button class="subtle retry" hidden>Try again</button><button class="copy" hidden>Copy summary</button></footer>
    </section>
    <button class="launch" aria-expanded="false"><span class="spark" aria-hidden="true">✧</span><span class="label">Summarize video</span></button>`;
  document.documentElement.append(host);
  const $ = selector => shadow.querySelector(selector);
  const panel = $(".panel"), launch = $(".launch"), output = $(".summary"), copy = $(".copy"), retry = $(".retry");
  let videoId = null, generation = 0, busy = false, result = null;
  function getVideoId() {
    const url = new URL(location.href), id = url.searchParams.get("v");
    return url.pathname === "/watch" && /^[\w-]{11}$/.test(id ?? "") ? id : null;
  }
  function setOpen(open) {
    panel.hidden = !open;
    launch.setAttribute("aria-expanded", String(open));
  }
  function sync() {
    const next = getVideoId();
    host.style.display = next && !document.fullscreenElement ? "block" : "none";
    if (next === videoId) return;
    videoId = next;
    generation++;
    busy = false;
    result = null;
    setOpen(false);
    launch.disabled = false;
    $(".label").textContent = "Summarize video";
    $("h2").textContent = "Your video, distilled.";
    $(".meta").textContent = "Based on the transcript · Powered by OpenAI";
    output.textContent = "";
    copy.hidden = retry.hidden = true;
  }
  async function run() {
    sync();
    if (busy || !videoId) return;
    const requestGeneration = ++generation;
    const requestedId = videoId;
    busy = true;
    result = null;
    setOpen(true);
    launch.disabled = true;
    copy.hidden = retry.hidden = true;
    output.classList.remove("error");
    output.textContent = "Reading the video transcript…";
    $(".label").textContent = "Summarizing…";
    try {
      const response = await chrome.runtime.sendMessage({ type: "SUMMARIZE", videoId: requestedId });
      if (requestGeneration !== generation || getVideoId() !== requestedId) return;
      if (!response?.ok) throw new Error(response?.error || "No response. Reload YouTube and try again.");
      if (response.videoId !== requestedId) throw new Error("The video changed. Try again.");
      result = response.summary;
      $("h2").textContent = response.title;
      $(".meta").textContent = `Transcript: ${response.language} · AI summaries can make mistakes`;
      output.textContent = result;
      copy.hidden = false;
    } catch (error) {
      if (requestGeneration !== generation || getVideoId() !== requestedId) return;
      output.textContent = /Extension context invalidated/i.test(error.message) ? "The extension was reloaded. Refresh this YouTube page to reconnect." : error.message;
      output.classList.add("error");
      retry.hidden = false;
    } finally {
      if (requestGeneration === generation) {
        busy = false;
        launch.disabled = false;
        $(".label").textContent = result ? "Video summary" : "Summarize video";
      }
    }
  }
  launch.addEventListener("click", () => result ? setOpen(panel.hidden) : run());
  retry.addEventListener("click", run);
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

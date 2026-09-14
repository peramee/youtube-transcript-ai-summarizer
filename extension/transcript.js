// Serialized by chrome.scripting.executeScript: keep every dependency inside this function.
// This runs in YouTube's main world and NEVER receives an API key.
export async function extractTranscript(expectedId) {
  const currentId = () => location.pathname === "/watch" ? new URL(location.href).searchParams.get("v") : null;
  const assertCurrent = () => {
    if (currentId() !== expectedId) throw new Error("The video changed. Try again on the current video.");
  };
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  const stamp = seconds => {
    const total = Math.max(0, Math.floor(Number(seconds) || 0));
    return total >= 3600
      ? `${Math.floor(total / 3600)}:${String(Math.floor(total / 60) % 60).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`
      : `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
  };
  try {
    assertCurrent();
    let player;
    // SPA navigation can update the URL before the player data arrives.
    for (let attempt = 0; attempt < 12; attempt++) {
      assertCurrent();
      const live = document.getElementById("movie_player")?.getPlayerResponse?.();
      const initial = window.ytInitialPlayerResponse;
      player = [live, initial].find(value => value?.videoDetails?.videoId === expectedId);
      if (player) break;
      await pause(250);
    }
    if (!player) throw new Error("The video player is not ready. Wait for the video to load, then try again.");
    const title = player.videoDetails.title;
    const tracks = player.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
    // Prefer authored English, then generated English, then the original available language.
    const ranked = [...tracks].sort((a, b) => {
      const score = t => (String(t.languageCode).startsWith("en") ? 0 : 2) + (t.kind === "asr" ? 1 : 0);
      return score(a) - score(b);
    });
    for (const track of ranked.slice(0, 2)) {
      try {
        assertCurrent();
        const url = new URL(track.baseUrl);
        if (url.origin !== "https://www.youtube.com" || url.pathname !== "/api/timedtext") continue;
        url.searchParams.set("fmt", "json3");
        const response = await fetch(url.href, { credentials: "same-origin", signal: AbortSignal.timeout(6000) });
        if (!response.ok) continue;
        const body = await response.text();
        let lines = [];
        if (body.trim().startsWith("{")) {
          const data = JSON.parse(body);
          lines = (data.events ?? []).map(event => {
            const text = (event.segs ?? []).map(segment => segment.utf8 ?? "").join("").replace(/\s+/g, " ").trim();
            return text ? `[${stamp(event.tStartMs / 1000)}] ${text}` : "";
          });
        } else if (body.trim().startsWith("<")) {
          const doc = new DOMParser().parseFromString(body, "text/xml");
          if (!doc.querySelector("parsererror")) {
            lines = [...doc.querySelectorAll("text, p")].map(node => {
              const text = node.textContent.replace(/\s+/g, " ").trim();
              const seconds = node.hasAttribute("start") ? node.getAttribute("start") : Number(node.getAttribute("t")) / 1000;
              return text ? `[${stamp(seconds)}] ${text}` : "";
            });
          }
        }
        assertCurrent();
        const text = lines.filter(Boolean).join("\n");
        if (text) return { videoId: expectedId, title, text, language: track.languageCode };
      } catch { assertCurrent(); /* YouTube may block timedtext; try its native transcript. */ }
    }

    // Let YouTube load the transcript itself when signed caption URLs return empty data.
    // The native panel may remain open; no hidden YouTube API or third-party service is used.
    const watch = document.querySelector("ytd-watch-flexy");
    if (watch?.getAttribute("video-id") !== expectedId) throw new Error("The video page is still loading. Try again.");
    const readPanel = () => {
      assertCurrent();
      if (watch.getAttribute("video-id") !== expectedId) return "";
      const panel = watch.querySelector('ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-searchable-transcript"][visibility="ENGAGEMENT_PANEL_VISIBILITY_EXPANDED"]')
        || watch.querySelector('ytd-engagement-panel-section-list-renderer[visibility="ENGAGEMENT_PANEL_VISIBILITY_EXPANDED"] [data-target-id="PAmodern_transcript_view"]');
      if (!panel) return "";
      if (panel.querySelector?.("input, textarea")?.value.trim()) {
        throw new Error("Clear the search field in YouTube’s transcript panel, then try again.");
      }
      return [...panel.querySelectorAll("ytd-transcript-segment-renderer, transcript-segment-view-model")].map(node => {
        const time = node.querySelector(".segment-timestamp, .ytwTranscriptSegmentViewModelTimestamp")?.textContent.trim();
        const text = node.querySelector(".segment-text, .ytAttributedStringHost")?.textContent.replace(/\s+/g, " ").trim();
        return text ? `${time ? `[${time}] ` : ""}${text}` : "";
      }).filter(Boolean).join("\n");
    };
    let text = readPanel();
    if (!text) {
      const button = watch.querySelector("ytd-video-description-transcript-section-renderer button");
      if (button) {
        button.click();
        // Wait for the complete panel to settle rather than returning its first arriving row.
        let previous = "";
        let stable = 0;
        for (let attempt = 0; attempt < 32; attempt++) {
          await pause(250);
          text = readPanel();
          stable = text && text === previous ? stable + 1 : 0;
          if (stable >= 3) break;
          previous = text;
        }
      }
    }
    assertCurrent();
    if (text) return { videoId: expectedId, title, text, language: "YouTube transcript panel" };
    throw new Error("No transcript could be loaded. Open YouTube’s description → Show transcript, then try again. Videos without captions cannot be summarized.");
  } catch (error) {
    return { error: error.message || "Could not read this video’s transcript." };
  }
}

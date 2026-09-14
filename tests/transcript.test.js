import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { extractTranscript } from "../extension/transcript.js";

const id = "abcdefghijk";
function fixture({ tracks = [], events = [], current = id, playerId = id, fetcher, panel = "" } = {}) {
  let clicked = false;
  const location = { pathname: "/watch", href: `https://www.youtube.com/watch?v=${current}` };
  const player = { videoDetails: { videoId: playerId, title: "Fixture video" }, captions: { playerCaptionsTracklistRenderer: { captionTracks: tracks } } };
  const rows = [{ querySelector: selector => ({ textContent: selector.startsWith(".segment-text") ? panel : "0:12" }) }];
  const watch = {
    getAttribute: () => id,
    querySelector: selector => selector.includes("section-renderer button") ? { click: () => { clicked = true; } } : clicked && panel ? { querySelectorAll: () => rows } : null
  };
  const context = {
    location, window: { ytInitialPlayerResponse: player }, URL, AbortSignal,
    setTimeout: callback => { callback(); },
    document: { getElementById: () => ({ getPlayerResponse: () => player }), querySelector: () => watch },
    fetch: fetcher ?? (async () => new Response(JSON.stringify({ events })))
  };
  return { run: () => vm.runInNewContext(`(${extractTranscript.toString()})('${id}')`, context), location, wasClicked: () => clicked };
}
const track = { languageCode: "en", baseUrl: "https://www.youtube.com/api/timedtext?v=abcdefghijk" };

test("parses caption segments, line breaks, Unicode, and timestamps", async () => {
  const result = await fixture({ tracks: [track], events: [{ tStartMs: 1000, segs: [{ utf8: "Hello" }, { utf8: " world\n" }] }, { tStartMs: 3661000, segs: [{ utf8: "Привіт" }] }, { tStartMs: 4000 }] }).run();
  assert.equal(result.text, "[0:01] Hello world\n[1:01:01] Привіт");
  assert.equal(result.videoId, id);
});
test("prefers authored English over generated or other languages", async () => {
  const requested = [];
  const result = await fixture({ tracks: [{ ...track, languageCode: "fi", baseUrl: `${track.baseUrl}&lang=fi` }, { ...track, kind: "asr", baseUrl: `${track.baseUrl}&lang=asr` }, { ...track, baseUrl: `${track.baseUrl}&lang=en` }], fetcher: async url => {
    requested.push(url);
    return Response.json({ events: [{ segs: [{ utf8: "English" }] }] });
  } }).run();
  assert.equal(result.language, "en");
  assert.equal(new URL(requested[0]).searchParams.get("lang"), "en");
});
test("does not fetch arbitrary caption URLs", async () => {
  let requests = 0;
  await fixture({ tracks: [{ ...track, baseUrl: "https://evil.test/api/timedtext" }], fetcher: async () => { requests++; } }).run();
  assert.equal(requests, 0);
});
test("falls back to the native transcript panel for empty signed captions", async () => {
  const sample = fixture({ tracks: [track], fetcher: async () => new Response(""), panel: "Native transcript text" });
  const result = await sample.run();
  assert.ok(sample.wasClicked());
  assert.equal(result.text, "[0:12] Native transcript text");
});
test("reports absent captions instead of inventing a transcript", async () => {
  assert.match((await fixture().run()).error, /No transcript could be loaded/);
});
test("rejects a stale player and navigation during caption fetching", async () => {
  assert.match((await fixture({ playerId: "oldvideo123" }).run()).error, /not ready/);
  const sample = fixture({ tracks: [track], fetcher: async () => {
    sample.location.href = "https://www.youtube.com/watch?v=zyxwvutsrqp";
    return Response.json({ events: [{ segs: [{ utf8: "Old video transcript" }] }] });
  } });
  assert.match((await sample.run()).error, /video changed/);
});

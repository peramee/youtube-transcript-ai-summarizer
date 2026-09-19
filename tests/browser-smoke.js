import assert from "node:assert/strict";
import { mkdir, mkdtemp } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { DEFAULT_SYSTEM_PROMPT } from "../extension/core.js";

await mkdir("test-results", { recursive: true });
const profile = await mkdtemp(path.resolve("test-results/profile-"));
const extensionPath = path.resolve("extension");
const context = await chromium.launchPersistentContext(profile, {
  channel: "chromium", headless: true, viewport: { width: 1280, height: 850 },
  args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`]
});
const errors = [];
context.on("page", page => page.on("pageerror", error => errors.push(error.message)));
let captionMode = "json";
let modernTranscript = false;
const firstId = "abcdefghijk";
const summary = "The video explains how small, repeatable habits can make learning easier.\n\n• Start with one clear goal.\n• Practice a little each day.\n• Review what you learned.\n\nTakeaway: Consistency matters more than intensity.";
const fixture = id => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Learning a little every day - YouTube</title>
<style>body{background:#101010;color:#eee;font:16px Arial;margin:40px}nav{font-size:22px;margin-bottom:14px}.video{height:430px;max-width:780px;background:#1d221e;border-radius:12px;display:grid;place-items:center;color:#95a999}h1{font-size:23px}p{color:#aaa}button{padding:10px}</style></head><body><nav>▶ YouTube · Test fixture</nav>
<ytd-watch-flexy video-id="${id}"><div id="movie_player" class="video">Video preview</div><h1>Learning a little every day</h1><p>Browser test fixture · No real video or paid API request</p>
<ytd-video-description-transcript-section-renderer><button id="native">Show transcript</button></ytd-video-description-transcript-section-renderer>
<ytd-engagement-panel-section-list-renderer target-id="engagement-panel-searchable-transcript" visibility="ENGAGEMENT_PANEL_VISIBILITY_HIDDEN"></ytd-engagement-panel-section-list-renderer></ytd-watch-flexy>
<script>
window.setVideo = id => {
  window.ytInitialPlayerResponse = {videoDetails:{videoId:id,title:"Learning a little every day"},captions:{playerCaptionsTracklistRenderer:{captionTracks:[{baseUrl:"https://www.youtube.com/api/timedtext?v="+id,languageCode:"en"}]}}};
  document.querySelector("ytd-watch-flexy").setAttribute("video-id",id);
  document.getElementById("movie_player").getPlayerResponse = () => window.ytInitialPlayerResponse;
  const panel=document.querySelector("ytd-engagement-panel-section-list-renderer");
  panel.setAttribute("visibility","ENGAGEMENT_PANEL_VISIBILITY_HIDDEN"); panel.replaceChildren();
};
window.setVideo("${id}");
document.getElementById("native").onclick = () => {
  const panel=document.querySelector("ytd-engagement-panel-section-list-renderer");
  panel.setAttribute("visibility","ENGAGEMENT_PANEL_VISIBILITY_EXPANDED");
  if (${modernTranscript}) {
    panel.removeAttribute("target-id");
    panel.innerHTML='<yt-section-list-renderer data-target-id="PAmodern_transcript_view"><textarea aria-label="Search transcript"></textarea><transcript-segment-view-model><div class="ytwTranscriptSegmentViewModelTimestamp">0:12</div><div class="ytwTranscriptSegmentViewModelTimestampA11yLabel">12 seconds</div><span class="ytAttributedStringHost">Modern fallback transcript: practice daily.</span></transcript-segment-view-model></yt-section-list-renderer>';
  } else {
    panel.innerHTML='<ytd-transcript-segment-renderer><span class="segment-timestamp">0:12</span><span class="segment-text">Native fallback transcript: practice daily.</span></ytd-transcript-segment-renderer>';
  }
};
</script></body></html>`;

async function waitText(page, selector, pattern) {
  await page.waitForFunction(({ selector, source }) => {
    const text = document.getElementById("youtube-brief-root")?.shadowRoot?.querySelector(selector)?.textContent;
    return new RegExp(source).test(text || "");
  }, { selector, source: pattern.source }, { timeout: 12_000 }).catch(async error => { console.error(await page.locator("#youtube-brief-root .summary").textContent()); throw error; });
}

try {
  await context.route("https://www.youtube.com/**", route => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/timedtext") {
      return route.fulfill({ contentType: captionMode === "xml" ? "text/xml" : "application/json", body: captionMode === "empty" ? "" : captionMode === "xml" ? '<transcript><text start="1">Learn &amp; practice.</text></transcript>' : JSON.stringify({ events: [{ tStartMs: 0, segs: [{ utf8: "Set a clear learning goal and practice a little every day." }] }] }) });
    }
    return route.fulfill({ contentType: "text/html", body: fixture(url.searchParams.get("v") || firstId) });
  });
  // Fail closed: the suite must never make a paid API request.
  await context.route("https://api.openai.com/**", route => route.abort());
  const worker = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker");
  const extensionId = new URL(worker.url()).host;
  await worker.evaluate(summary => {
    globalThis.testCalls = [];
    globalThis.testStatus = 200;
    globalThis.testDelay = 0;
    globalThis.fetch = async (url, options) => {
      if (url !== "https://api.openai.com/v1/responses") throw new Error("Unexpected worker fetch");
      globalThis.testCalls.push({ url, body: JSON.parse(options.body) });
      const status = globalThis.testStatus;
      await new Promise(resolve => setTimeout(resolve, globalThis.testDelay));
      if (JSON.parse(options.body).stream && status === 200) {
        const web = Boolean(JSON.parse(options.body).tools);
        const response = { status: "completed", output: [
          ...(web ? [{ type: "web_search_call" }] : []),
          { type: "message", content: [{ type: "output_text", text: "Practice daily. [1]", annotations: web ? [{ type: "url_citation", start_index: 16, end_index: 19, url: "https://example.org/evidence", title: "Source evidence" }] : [] }] }
        ] };
        if (globalThis.testPartial) {
          response.status = "incomplete";
          response.incomplete_details = { reason: "max_output_tokens" };
        }
        return new Response("data: " + JSON.stringify({ type: globalThis.testPartial ? "response.incomplete" : "response.completed", response }) + "\n\n", { headers: { "Content-Type": "text/event-stream" } });
      }
      return Response.json(status === 200 ? { status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: summary }] }] } : { error: { code: "invalid_api_key" } }, { status });
    };
  }, summary);
  const page = await context.newPage();
  await page.goto(`https://www.youtube.com/watch?v=${firstId}`);
  await page.getByRole("button", { name: "Summarize video", exact: true }).click();
  await waitText(page, ".summary", /Add your OpenAI API key/);
  assert.equal(await worker.evaluate(() => testCalls.length), 0);
  console.log("PASS: missing key produces an actionable error without an API call");

  const options = await context.newPage();
  options.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  await options.goto(`chrome-extension://${extensionId}/options.html`);
  const modelField = options.getByLabel("Model", { exact: true });
  await modelField.evaluate(node => new RegExp(node.pattern, "v"));
  for (const name of ["gpt-4.1-mini", "ft:gpt-4.1-mini:org:custom_model:abc123"]) {
    await modelField.fill(name);
    assert.equal(await modelField.evaluate(node => node.checkValidity()), true, name);
  }
  for (const name of ["", "model name", "model/name", "model@name", "model\\name"]) {
    await modelField.fill(name);
    assert.equal(await modelField.evaluate(node => node.checkValidity()), false, name);
  }
  await modelField.fill("gpt-4.1-mini");
  console.log("PASS: model pattern compiles in Chrome and validates allowed characters");
  await options.getByLabel("OpenAI API key").fill("sk-browser-test-fixture");
  await options.getByRole("button", { name: "Save settings" }).click();
  await options.getByText("Saved. You’re ready to summarize on YouTube.").waitFor();
  assert.equal(await options.getByLabel("OpenAI API key").inputValue(), "");
  const customPrompt = "Summarize in Finnish. Give three practical lessons and one open question. Avoid bullet points.";
  await options.getByLabel("System prompt", { exact: true }).fill(customPrompt);
  await options.getByLabel("Model", { exact: true }).fill("gpt-4.1-mini");
  await options.getByRole("button", { name: "Save settings" }).click();
  assert.equal(await worker.evaluate(async () => (await chrome.storage.local.get("apiKey")).apiKey), "sk-browser-test-fixture");
  await options.reload();
  assert.equal(await options.getByLabel("System prompt", { exact: true }).inputValue(), customPrompt);
  await options.screenshot({ path: "test-results/settings.png", fullPage: true });
  console.log("PASS: settings save, clear the displayed key, and preserve it on model-only edits");

  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await waitText(page, ".summary", /Consistency matters/);
  assert.equal(await worker.evaluate(() => testCalls.length), 1);
  assert.match(await worker.evaluate(() => testCalls[0].body.input), /clear learning goal/);
  assert.equal(await worker.evaluate(() => testCalls[0].body.instructions), customPrompt);
  const largePanel = await page.getByRole("region", { name: "Video summary" }).boundingBox();
  const dockedVideo = await page.locator("#movie_player").boundingBox();
  assert.ok(Math.abs(largePanel.width - 1280 / 3) < 1 && largePanel.height > 700);
  assert.ok(dockedVideo.x + dockedVideo.width < largePanel.x, "Video stays beside the summary");
  await page.evaluate(() => {
    const comments = document.createElement("section");
    comments.id = "test-comments";
    comments.textContent = "Comments below the video";
    comments.style.cssText = "display:block;height:1800px;margin-top:32px";
    document.body.append(comments);
  });
  await page.evaluate(() => window.scrollTo(0, 600));
  const scrolledVideo = await page.locator("#movie_player").boundingBox();
  const scrolledPanel = await page.getByRole("region", { name: "Video summary" }).boundingBox();
  assert.ok(Math.abs(scrolledVideo.y - (dockedVideo.y - 600)) < 2, "Video scrolls with the document");
  assert.ok(scrolledVideo.y + scrolledVideo.height < 0, "Video is out of the way of comments");
  assert.equal(scrolledPanel.y, largePanel.y, "Summary stays fixed while scrolling");
  await page.evaluate(() => { window.scrollTo(0, 0); document.getElementById("test-comments").remove(); });
  console.log("PASS: video scrolls away above comments while summary remains fixed");
  await page.getByRole("button", { name: "Close summary" }).click();
  assert.equal(await page.evaluate(() => document.documentElement.classList.contains("youtube-brief-reading")), false);
  assert.notEqual(await page.locator("#movie_player").evaluate(node => getComputedStyle(node).position), "fixed");
  await page.getByRole("button", { name: "Video summary", exact: true }).click();
  assert.equal(await worker.evaluate(() => testCalls.length), 1);
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: "https://www.youtube.com" });
  await page.getByRole("button", { name: "Copy summary" }).click();
  assert.equal((await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, "\n"), summary);
  await page.screenshot({ path: "test-results/summary.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  const mobilePanel = await page.getByRole("region", { name: "Video summary" }).boundingBox();
  const mobileVideo = await page.locator("#movie_player").boundingBox();
  assert.ok(mobilePanel.y > mobileVideo.y + mobileVideo.height, "Narrow screens keep video above the summary");
  assert.ok(mobilePanel.x >= 0 && mobilePanel.x + mobilePanel.width <= 390);
  await page.screenshot({ path: "test-results/mobile-summary.png" });
  await page.setViewportSize({ width: 1280, height: 850 });
  await options.getByRole("button", { name: "Restore default prompt" }).click();
  await options.getByRole("button", { name: "Save settings" }).click();
  await options.getByText("Saved. You’re ready to summarize on YouTube.").waitFor();
  await page.getByRole("button", { name: "Regenerate", exact: true }).click();
  await waitText(page, ".summary", /Consistency matters/);
  assert.equal(await worker.evaluate(() => testCalls.length), 2);
  assert.equal(await worker.evaluate(() => testCalls.at(-1).body.instructions), DEFAULT_SYSTEM_PROMPT);
  console.log("PASS: saved custom prompt, default restoration, regeneration, and responsive video layout");
  console.log("PASS: real content-script → worker → MAIN extraction → summary; reopen and copy do not regenerate");

  const client = await context.newCDPSession(page);
  const executionContexts = [];
  client.on("Runtime.executionContextCreated", event => executionContexts.push(event.context));
  await client.send("Runtime.enable");
  const isolated = executionContexts.find(item => item.auxData?.type === "isolated" && item.origin.includes(extensionId));
  assert.ok(isolated, "Extension isolated world exists");
  const read = await client.send("Runtime.evaluate", { contextId: isolated.id, expression: 'chrome.storage.local.get("apiKey").then(() => "exposed").catch(() => "blocked")', awaitPromise: true, returnByValue: true });
  assert.equal(read.result.value, "blocked");
  const sessionRead = await client.send("Runtime.evaluate", { contextId: isolated.id, expression: 'chrome.storage.session.get(null).then(() => "exposed").catch(() => "blocked")', awaitPromise: true, returnByValue: true });
  assert.equal(sessionRead.result.value, "blocked");
  console.log("PASS: API key storage is blocked from the content-script world");

  const formatted = await client.send("Runtime.evaluate", {
    contextId: isolated.id,
    expression: `(() => {
      const node = document.createElement("div");
      const text = '# Verdict\\n\\n**Supported** and *qualified*. [1]\\n\\n- First\\n- Second\\n\\n1. Check\\n2. Compare\\n\\n> Evidence\\n\\n\\x60\\x60\\x60js\\n<b>literal</b>\\n\\x60\\x60\\x60\\n\\n[Unsafe](javascript:alert) <img src=x onerror=alert(1)> [Safe](https://example.org)';
      renderChatMarkdown(node, text, [{ start: text.indexOf('[1]'), end: text.indexOf('[1]') + 3, url: 'https://example.org/source', title: 'Evidence' }]);
      return { heading: node.querySelector('h1')?.textContent, bold: node.querySelector('strong')?.textContent,
        italic: node.querySelector('em')?.textContent, bullets: node.querySelectorAll('ul li').length,
        numbered: node.querySelectorAll('ol li').length, quote: node.querySelector('blockquote')?.textContent,
        code: node.querySelector('pre code')?.textContent, links: [...node.querySelectorAll('a')].map(a => a.href),
        unsafe: node.querySelectorAll('img,script,[onerror]').length };
    })()`,
    returnByValue: true
  });
  assert.deepEqual(formatted.result.value, { heading: "Verdict", bold: "Supported", italic: "qualified", bullets: 2,
    numbered: 2, quote: "Evidence", code: "<b>literal</b>", links: ["https://example.org/source", "https://example.org/"], unsafe: 0 });
  console.log("PASS: Markdown formatting, citations, and unsafe HTML/link rejection");

  const question = page.getByRole("textbox", { name: "Ask about the transcript" });
  await question.fill("Why practice every day?");
  await question.press("Enter");
  await page.locator(".chat-message.assistant").waitFor();
  let chatRequest = await worker.evaluate(() => testCalls.at(-1).body);
  assert.match(chatRequest.input[0].content, /clear learning goal/);
  assert.equal(chatRequest.input.at(-1).content, "Why practice every day?");
  assert.equal(chatRequest.tools, undefined);
  await question.fill("fc");
  await worker.evaluate(() => { globalThis.testPartial = true; });
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await page.getByRole("link", { name: "[Source evidence]", exact: true }).waitFor();
  await waitText(page, ".chat-status", /may be incomplete/);
  await worker.evaluate(() => { globalThis.testPartial = false; });
  chatRequest = await worker.evaluate(() => testCalls.at(-1).body);
  assert.ok(chatRequest.input.some(message => message.content === "Why practice every day?"));
  assert.deepEqual(chatRequest.tools, [{ type: "web_search" }]);
  assert.equal(await page.getByRole("link", { name: "[Source evidence]", exact: true }).getAttribute("href"), "https://example.org/evidence");
  const cached = await worker.evaluate(async () => Object.values(await chrome.storage.local.get(null)).find(value => value?.videoId === "abcdefghijk"));
  assert.ok(cached.history.at(-1).content.includes("https://example.org/evidence"));
  await page.screenshot({ path: "test-results/chat.png" });
  const beforeRestore = await worker.evaluate(() => testCalls.length);
  await page.reload();
  await page.getByRole("button", { name: "Video summary", exact: true }).click();
  assert.equal(await page.locator(".chat-message").count(), 4);
  await page.getByRole("link", { name: "[Source evidence]", exact: true }).waitFor();
  await waitText(page, ".chat-status", /may be incomplete/);
  assert.equal(await worker.evaluate(() => testCalls.length), beforeRestore);
  await question.fill("Continue after reload");
  await question.press("Enter");
  await page.waitForFunction(() => document.querySelector("#youtube-brief-root").shadowRoot.querySelectorAll(".chat-message.assistant").length === 3);
  const resumed = await worker.evaluate(() => testCalls.at(-1).body);
  assert.ok(resumed.input.some(message => message.content === "Why practice every day?"));
  assert.ok(resumed.input.some(message => message.role === "assistant" && message.content.includes("https://example.org/evidence")));

  const otherVideo = await context.newPage();
  await otherVideo.goto("https://www.youtube.com/watch?v=cachevideo1");
  await otherVideo.getByRole("button", { name: "Summarize video", exact: true }).click();
  await waitText(otherVideo, ".summary", /Consistency matters/);
  assert.equal(await otherVideo.locator(".chat-message").count(), 0);
  await otherVideo.getByRole("textbox", { name: "Ask about the transcript" }).fill("A separate video question");
  await otherVideo.getByRole("button", { name: "Send", exact: true }).click();
  await otherVideo.locator(".chat-message.assistant").waitFor();
  await otherVideo.close();

  await worker.evaluate(() => { globalThis.testStatus = 401; });
  await question.fill("Keep my question if the request fails");
  await question.press("Enter");
  await waitText(page, ".chat-status", /key was rejected/);
  assert.equal(await question.inputValue(), "Keep my question if the request fails");
  assert.equal(await page.locator(".chat-message.user").count(), 3);
  await worker.evaluate(() => { globalThis.testStatus = 200; });
  await page.getByRole("button", { name: "Clear chat", exact: true }).click();
  await page.waitForFunction(() => !document.querySelector("#youtube-brief-root").shadowRoot.querySelector(".chat-log").children.length);
  const afterClear = await worker.evaluate(() => testCalls.length);
  await page.reload();
  await page.getByRole("button", { name: "Video summary", exact: true }).click();
  assert.equal(await page.locator(".chat-message").count(), 0);
  assert.equal(await worker.evaluate(() => testCalls.length), afterClear);
  const otherCache = await worker.evaluate(async () => (await chrome.storage.local.get("video-chat:cachevideo1"))["video-chat:cachevideo1"]);
  assert.equal(otherCache.messages.length, 2);
  assert.equal(otherCache.messages[0].text, "A separate video question");
  await question.fill("A fresh question");
  await question.press("Enter");
  await page.locator(".chat-message.assistant").waitFor();
  assert.equal((await worker.evaluate(() => testCalls.at(-1).body)).input.length, 3);
  console.log("PASS: transcript chat, conversation memory, web citations, failure recovery, and clear chat");
  await worker.evaluate(() => { globalThis.testStatus = 401; });
  await page.getByRole("button", { name: "Regenerate", exact: true }).click();
  await waitText(page, ".summary", /key was rejected/);
  await worker.evaluate(() => { globalThis.testStatus = 200; });
  await page.reload();
  await page.getByRole("button", { name: "Video summary", exact: true }).click();
  assert.equal(await page.locator(".chat-message").count(), 2, "Failed regeneration preserves saved chat");
  captionMode = "xml";
  const beforeRegenerate = await worker.evaluate(() => testCalls.length);
  await page.getByRole("button", { name: "Regenerate", exact: true }).click();
  await waitText(page, ".summary", /Consistency matters/);
  assert.equal(await worker.evaluate(() => testCalls.length), beforeRegenerate + 1);
  assert.match(await worker.evaluate(() => testCalls.at(-1).body.input), /Learn & practice/);
  assert.equal(await page.locator(".chat-message").count(), 0);
  captionMode = "json";
  await page.reload();
  await page.getByRole("button", { name: "Video summary", exact: true }).click();
  assert.equal(await page.locator(".chat-message").count(), 0);
  assert.equal(await worker.evaluate(() => testCalls.length), beforeRegenerate + 1);
  console.log("PASS: per-video local cache, reload with citations, persistent clearing, and fresh transcript regeneration");


  async function navigate(id) {
    await page.evaluate(id => {
      history.pushState({}, "", "/watch?v=" + id);
      window.setVideo(id);
      document.dispatchEvent(new Event("yt-navigate-finish"));
    }, id);
    await page.getByRole("button", { name: "Summarize video", exact: true }).waitFor();
  }
  await page.getByRole("checkbox", { name: "Search web" }).check();
  await worker.evaluate(() => { globalThis.testDelay = 1200; });
  await question.fill("This answer should be discarded after navigation");
  await question.press("Enter");
  await waitText(page, ".chat-status", /Checking sources/);
  await navigate("zyxwvutsrqp");
  await page.waitForTimeout(1500);
  await worker.evaluate(() => { globalThis.testDelay = 0; });
  assert.equal(await page.getByRole("form", { name: "Ask about this video" }).isVisible(), false);
  assert.equal(await page.locator(".chat-message").count(), 0);
  captionMode = "empty";
  await page.getByRole("button", { name: "Summarize video", exact: true }).click();
  await waitText(page, ".summary", /Consistency matters/);
  assert.match(await worker.evaluate(() => testCalls.at(-1).body.input), /Native fallback transcript/);
  console.log("PASS: SPA navigation and native transcript fallback");

  modernTranscript = true;
  await page.goto("https://www.youtube.com/watch?v=modern12345");
  await page.getByRole("button", { name: "Summarize video", exact: true }).click();
  await waitText(page, ".summary", /Consistency matters/);
  const modernInput = await worker.evaluate(() => testCalls.at(-1).body.input);
  assert.match(modernInput, /Modern fallback transcript/);
  assert.ok(!modernInput.includes("12 seconds"));
  console.log("PASS: current YouTube transcript layout without duplicated accessibility text");

  await page.goto("https://www.youtube.com/watch?v=filterid123");
  await page.getByRole("button", { name: "Show transcript", exact: true }).click();
  await page.getByRole("textbox", { name: "Search transcript" }).fill("filtered");
  const beforeFilter = await worker.evaluate(() => testCalls.length);
  await page.getByRole("button", { name: "Summarize video", exact: true }).click();
  await waitText(page, ".summary", /Clear the search field/);
  assert.equal(await worker.evaluate(() => testCalls.length), beforeFilter);
  console.log("PASS: filtered native transcripts are rejected before API usage");

  await navigate("xmlvideo123");
  captionMode = "xml";
  await page.getByRole("button", { name: "Summarize video", exact: true }).click();
  await waitText(page, ".summary", /Consistency matters/);
  assert.match(await worker.evaluate(() => testCalls.at(-1).body.input), /Learn & practice/);
  console.log("PASS: XML captions and entity decoding");

  await navigate("errorvideo1");
  captionMode = "json";
  await worker.evaluate(() => { globalThis.testStatus = 401; });
  await page.getByRole("button", { name: "Summarize video", exact: true }).click();
  await waitText(page, ".summary", /key was rejected/);
  await worker.evaluate(() => { globalThis.testStatus = 200; globalThis.testDelay = 1200; });
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await waitText(page, ".summary", /Writing your summary/);
  await navigate("nextvideo12");
  await page.waitForTimeout(1500);
  assert.equal(await page.getByRole("region", { name: "Video summary" }).isVisible(), false);
  console.log("PASS: rejected-key recovery and late responses discarded after navigation");

  const before = await worker.evaluate(() => testCalls.length);
  await page.evaluate(() => {
    window.ytInitialPlayerResponse.captions = undefined;
    document.querySelector("ytd-video-description-transcript-section-renderer").remove();
  });
  await page.getByRole("button", { name: "Summarize video", exact: true }).click();
  await waitText(page, ".summary", /No transcript could be loaded/);
  assert.equal(await worker.evaluate(() => testCalls.length), before);
  console.log("PASS: missing captions never trigger an OpenAI call");

  await options.getByRole("button", { name: "Remove key" }).click();
  await options.getByText("API key removed from this browser.").waitFor();
  assert.equal(await worker.evaluate(async () => (await chrome.storage.local.get("apiKey")).apiKey), undefined);
  // Session storage disappears on browser restart; durable video data must not.
  await worker.evaluate(() => chrome.storage.session.clear());
  const beforeReopen = await worker.evaluate(() => testCalls.length);
  const reopened = await context.newPage();
  await reopened.goto("https://www.youtube.com/watch?v=cachevideo1");
  await reopened.getByRole("button", { name: "Video summary", exact: true }).click();
  assert.equal(await reopened.locator(".chat-message").count(), 2);
  assert.equal(await reopened.locator(".chat-message.user p").textContent(), "A separate video question");
  assert.equal(await worker.evaluate(() => testCalls.length), beforeReopen);
  await reopened.close();
  console.log("PASS: closed-tab chat restores without an API key or session memory");

  await page.evaluate(() => {
    history.pushState({}, "", "/");
    document.dispatchEvent(new Event("yt-navigate-finish"));
  });
  assert.equal(await page.locator("#youtube-brief-root").isVisible(), false);
  assert.deepEqual(errors, []);
  console.log("PASS: key removal, hidden UI outside watch pages, and no browser script errors");
} finally {
  await context.close();
}
console.log("All browser smoke checks passed. Screenshots: test-results/settings.png and summary.png.");

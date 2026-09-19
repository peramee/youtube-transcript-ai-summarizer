import test from "node:test";
import assert from "node:assert/strict";
import { makeChatRequest, readChatStream, chatAnswer, answerQuestion } from "../extension/chat.js";

const session = { transcript: { title: "Video", text: "[0:10] Practice every day." }, summary: "Daily practice helps.", history: [{ role: "user", content: "Why?" }, { role: "assistant", content: "It builds familiarity." }] };
const completed = { status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: "An answer." }] }] };

test("chat includes the full transcript, summary, and earlier turns in order", () => {
  const request = makeChatRequest(session, "  How often?  ", { model: "chosen-model" });
  assert.equal(request.model, "chosen-model");
  assert.equal(request.store, false);
  assert.equal(request.stream, true);
  assert.deepEqual(JSON.parse(request.input[0].content), { title: session.transcript.title, transcript: session.transcript.text });
  assert.equal(request.input[1].content, session.summary);
  assert.deepEqual(request.input.slice(2, 4), session.history);
  assert.equal(request.input.at(-1).content, "How often?");
  assert.match(request.instructions, /No live web search/);
  assert.equal(request.tools, undefined);
});
test("web lookup is explicit and chat applies custom style preferences", () => {
  const request = makeChatRequest(session, "Is that true?", { systemPrompt: "Answer in Finnish." }, true);
  assert.deepEqual(request.tools, [{ type: "web_search" }]);
  assert.equal(request.tool_choice, "required");
  assert.match(request.instructions, /Answer in Finnish/);
  assert.match(request.instructions, /retrieved evidence/);
});
test("empty and oversized questions and full conversations fail before requesting", () => {
  for (const question of [null, " ", "x".repeat(4001)]) assert.throws(() => makeChatRequest(session, question, {}));
  assert.throws(() => makeChatRequest({ ...session, history: Array(40).fill({ role: "user", content: "x" }) }, "Hello", {}), /conversation is full/);
  assert.throws(() => makeChatRequest({ ...session, history: [{ role: "assistant", content: "x".repeat(60001) }] }, "Hello", {}), /conversation is full/);
});
test("stream parser handles chunked UTF-8, CRLF, deltas, and completion", async () => {
  const data = { ...completed, output: [{ type: "message", content: [{ type: "output_text", text: "Hyvää päivää" }] }] };
  const bytes = new TextEncoder().encode('event: response.output_text.delta\r\ndata: {"type":"response.output_text.delta","delta":"Hi"}\r\n\r\ndata: ' + JSON.stringify({ type: "response.completed", response: data }) + "\r\n\r\n");
  const stream = new ReadableStream({ start(controller) { for (let i = 0; i < bytes.length; i += 3) controller.enqueue(bytes.slice(i, i + 3)); controller.close(); } });
  assert.deepEqual(await readChatStream(new Response(stream)), data);
});
test("truncated streams and unexplained incomplete answers are not accepted", async () => {
  await assert.rejects(readChatStream(new Response('data: {"type":"response.output_text.delta","delta":"partial"}\n\n')), /before the answer was complete/);
  assert.throws(() => chatAnswer({ ...completed, status: "incomplete" }), /could not finish the answer/);
});

test("reasoning models have room to think and write, without breaking non-reasoning models", () => {
  const request = makeChatRequest(session, "Why?", { model: "gpt-5.6-luna" });
  assert.equal(request.max_output_tokens, 25000);
  assert.deepEqual(request.reasoning, { effort: "low" });
  assert.equal(makeChatRequest(session, "Why?", { model: "gpt-4.1-mini" }).reasoning, undefined);
});

test("output-limit answers preserve visible text with an explicit warning", async () => {
  const partial = { ...completed, status: "incomplete", incomplete_details: { reason: "max_output_tokens" } };
  const answer = await answerQuestion(session, "Explain", {}, false, async () => new Response("data: " + JSON.stringify({ type: "response.incomplete", response: partial }) + "\n\n"));
  assert.equal(answer.text, "An answer.");
  assert.match(answer.warning, /may be incomplete/);
});

test("reasoning-only exhaustion and content filtering produce chat-specific errors", () => {
  assert.throws(() => chatAnswer({ status: "incomplete", incomplete_details: { reason: "max_output_tokens" }, output: [{ type: "reasoning" }] }), /before writing an answer/);
  assert.throws(() => chatAnswer({ ...completed, status: "incomplete", incomplete_details: { reason: "content_filter" } }), /could not finish the answer/);
});
test("citations retain text offsets and reject unsafe or invalid links", () => {
  const result = chatAnswer({ status: "completed", output: [{ type: "web_search_call" }, { type: "message", content: [
    { type: "output_text", text: "First." },
    { type: "output_text", text: "Evidence [1].", annotations: [
      { type: "url_citation", start_index: 9, end_index: 12, url: "https://example.org/evidence", title: "Evidence" },
      { type: "url_citation", start_index: 9, end_index: 12, url: "javascript:alert(1)" },
      { type: "url_citation", start_index: -1, end_index: 500, url: "https://example.org/" }
    ] }
  ] }] });
  assert.equal(result.text, "First.\nEvidence [1].");
  assert.equal(result.searched, true);
  assert.equal(result.citations.length, 1);
  assert.equal(result.citations[0].start, 16);
  assert.equal(result.text.slice(result.citations[0].start, result.citations[0].end), "[1]");
});
test("chat sends the key only in authorization and consumes final streamed output", async () => {
  const answer = await answerQuestion(session, "Explain", { apiKey: "sk-fixture" }, false, async (url, options) => {
    assert.equal(url, "https://api.openai.com/v1/responses");
    assert.equal(options.headers.Authorization, "Bearer sk-fixture");
    assert.ok(!options.body.includes("sk-fixture"));
    return new Response("data: " + JSON.stringify({ type: "response.completed", response: completed }) + "\n\n");
  });
  assert.equal(answer.text, "An answer.");
});
test("unsupported web search and network errors have actionable messages", async () => {
  await assert.rejects(answerQuestion(session, "Check", {}, true, async () => Response.json({}, { status: 400 })), /model could not use web search/);
  await assert.rejects(answerQuestion(session, "Check", {}, false, async () => { throw new TypeError("Network"); }), /connection/);
});


test("fc shortcut requests a sourced video fact-check without the checkbox", () => {
  for (const question of ["fc", " FC "]) {
    const request = makeChatRequest(session, question, {});
    assert.deepEqual(request.tools, [{ type: "web_search" }]);
    assert.match(request.instructions, /fact-check the video's main verifiable claims/);
    assert.match(request.instructions, /Markdown headings/);
  }
  assert.equal(makeChatRequest(session, "What does fc mean?", {}).tools, undefined);
});

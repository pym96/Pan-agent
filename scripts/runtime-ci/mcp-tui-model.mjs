// Preload in the installed CLI process only. The real adapter encodes requests and parses these SSE bytes.
import { appendFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

globalThis.fetch = async (url, init) => {
  if (url !== "https://api.deepseek.com/chat/completions") throw Error("unexpected model endpoint " + url);
  const body = JSON.parse(init.body);
  appendFileSync(process.env.PAN_TEST_MODEL_LOG, JSON.stringify(body) + "\n");
  const last = body.messages.at(-1);
  let delta, finish;
  if (last.role === "tool") {
    let answer = last.content;
    try {
      const result = JSON.parse(last.content);
      if (result.structuredContent?.reason) answer = result.structuredContent.reason;
      else if (result.content) answer = result.content.map(block => block.text).join(" ");
    } catch { /* A builtin or failed report returns plain text. */ }
    delta = {content: "Observed result: " + answer};
    finish = "stop";
  } else {
    const builtin = last.content.includes("Read marker");
    const args = builtin ? {path: "marker.txt"} : last.content.includes("invalid arguments") ? {tool: "read"} : {};
    delta = {tool_calls: [{index: 0, id: "intent-" + randomUUID(), type: "function",
      function: {name: builtin ? "read" : "mcp_report", arguments: JSON.stringify(args)}}]};
    finish = "tool_calls";
  }
  const identity = {id: "model-" + randomUUID(), object: "chat.completion.chunk",
    model: body.model, created: 1};
  const chunk = (delta, finish_reason) => "data: " + JSON.stringify({...identity,
    choices: [{index: 0, delta, finish_reason}],
    usage: finish_reason ? {prompt_tokens: 2, completion_tokens: 3, total_tokens: 5, prompt_cache_hit_tokens: 0, prompt_cache_miss_tokens: 2} : null}) + "\n\n";
  const stream = chunk({role: "assistant", reasoning_content: "Fixture response.", ...delta}, null) +
    chunk({}, finish) + "data: [DONE]\n\n";
  return new Response(stream, {headers: {"content-type": "text/event-stream"}});
};

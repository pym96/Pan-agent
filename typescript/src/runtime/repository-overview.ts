import { decodeAttachedTask } from "../input/task-envelope.ts";
import { Denied, UpstreamHttpError, validRepository, type RepositoryPart } from "../sandbox/native/network.ts";
import { EMPTY_USAGE, type KernelRunResult } from "./agent-kernel.ts";

export type RepositoryRead = (slug: string, part: RepositoryPart, signal: AbortSignal) => Promise<Buffer>;
export interface RepositoryQuestion { slug?: string; problem?: string; }
const usage = "Use /repo https://github.com/OWNER/REPO with the public repository root URL, without credentials, a query or a fragment.";

// Only operator submissions reach this router. Recognizable instructions to change local code
// remain coding tasks; a question about a linked repo cannot inherit local tools from the last turn.
const codingVerb = /(?:^|\b(?:please|kindly|can you|could you|would you|help me|want you to|and|then|use it to)\s+)(?:implement|fix|refactor|build|create|add|modify|update|edit|write|save|remove|delete|install|clone|run|execute|test|patch|port|integrate|replace|commit)\b/i;
const chineseCoding = /(?:^|请|帮我|然后|并且|并)(?:在本地|在当前项目|用它)?(?:实现|修复|重构|编写|修改|创建|安装|克隆|删除|运行|添加)/;
const overviewWords = /\b(?:overview|summari[sz]e|summary|describe|explain|review|tell me about|tell me more|how about|what about|what (?:is|does)|what can you tell me|thoughts on)\b|介绍|总结|概述|分析|怎么看|怎么样|做什么|是干什么/i;
const questionWords = /^(?:what|how|where|when|why|who|which|does|is|are|has|can|could|would|should)\b|[?？]|[吗么]|如何|是否|为什么/i;

export function repositoryQuestion(task: string): RepositoryQuestion | undefined {
  const attached = decodeAttachedTask(task);
  const prompt = (attached?.prompt ?? task).trim();
  const explicit = /^\/repo(?:\s|$)/i.test(prompt);
  const links = prompt.match(/https?:\/\/[^\s<>()，。！？]+/gi) ?? [];
  const link = links[0];
  if (!explicit) {
    if (!link || !/github\.com/i.test(link)) return;
    const words = prompt.replace(link, " ").replace(/^[\s:：<>，。,.!?！？-]+|[\s:：<>，。,.!?！？-]+$/g, "").trim();
    // "Write a summary" requests a response unless the operator also names a local output.
    const proseRequest = /\bwrite (?:an? )?(?:(?:short|brief|detailed) )?(?:summary|overview|description|review)\b/i;
    const localOutput = /\b(?:file|workspace|save|write to)\b|\.(?:md|txt|json)\b/i;
    const action = localOutput.test(words) ? words : words.replace(proseRequest, "summarize");
    if (codingVerb.test(action) || chineseCoding.test(action)) return;
    if (words && !overviewWords.test(action)) {
      if (!questionWords.test(words) && !/[?？]\s*$/.test(prompt)) return;
      return {problem: "This read-only repository view covers an overview. " + usage};
    }
  }
  if (attached) return {problem: "Remove the attached files and submit the public repository question again."};
  if (links.length !== 1) return {problem: usage};
  // In prose, a trailing question mark or full stop is commonly sentence punctuation.
  const raw = explicit ? prompt.replace(/^\/repo\s*/i, "") : link?.replace(/[?.,!]+$/, "");
  const path = raw?.match(/^https:\/\/github\.com\/([^/?#\s]+\/[^/?#\s]+)\/?$/i)?.[1];
  if (!path || !validRepository(path)) return {problem: usage};
  return {slug: path};
}

function displayText(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  // Source text remains quoted data. Drop control/format marks and link destinations from excerpts.
  return value.replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]*>/g, "").replace(/https?:\/\/[^\s<>]+/gi, "[link]")
    .replace(/[\p{C}\p{Zl}\p{Zp}]/gu, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

function readmeExcerpt(body: Buffer): string {
  const lines: string[] = [];
  let fence: string | undefined;
  for (const row of body.toString("utf8").split(/\r?\n/)) {
    const line = row.trim();
    const marker = line.match(/^(`{3,}|~{3,})/)?.[1];
    if (marker) {
      if (!fence) fence = marker;
      else if (marker.startsWith(fence)) fence = undefined;
      continue;
    }
    if (fence || /^#|^\[!|^!\[|^\||^\[\w+\]:/.test(line)) continue;
    const text = displayText(line, 360);
    if (text) lines.push("› " + text);
    if (lines.length === 3) break;
  }
  if (!lines.length) {
    const heading = body.toString("utf8").split(/\r?\n/).find(line => /^#{1,6} +\S/.test(line));
    if (heading) lines.push("› " + displayText(heading.replace(/^#+ +/, ""), 360));
  }
  return lines.length ? "README excerpt\n" + lines.join("\n") : "The fetched README contains no previewable text.";
}

function failure(error: unknown, proxy: boolean): string {
  if (error instanceof Denied) return error.message.includes("redirect")
    ? "GitHub redirected this request. Open the repository in your browser and submit its current root URL."
    : "Native GET policy denied the destination. DNS may resolve GitHub to a reserved or local address. Check DNS, or restart Pan with --github-proxy-port PORT for a trusted local HTTP CONNECT proxy.";
  if (error instanceof UpstreamHttpError) {
    if (error.status === 404) return "GitHub HTTP 404. Check the owner and repository name and confirm it is publicly visible.";
    if ([403, 429].includes(error.status)) return "GitHub HTTP " + error.status + ". Public access may be limited. Check visibility or try again later.";
    return "GitHub HTTP " + error.status + ". Check the public repository in a browser or try again later.";
  }
  if (error instanceof SyntaxError) return "GitHub returned invalid metadata. Check the public repository in a browser or try again later.";
  return proxy ? "GitHub HTTPS request failed. Check the trusted local proxy port, TLS and GitHub availability."
    : "GitHub HTTPS request failed. Check DNS, TLS and GitHub availability, then try again.";
}

export interface RepositoryResult extends KernelRunResult { readonly requests: number; }
export async function repositoryOverview(question: RepositoryQuestion, mode: unknown, read: RepositoryRead,
    cancelled: AbortSignal, proxy: boolean): Promise<RepositoryResult> {
  let requests = 0;
  const result = (status: KernelRunResult["status"], reason: string, finalText: string): RepositoryResult =>
    ({status, reason, finalText, modelCalls: 0, toolCalls: 0, usage: EMPTY_USAGE, requests});
  const stop = () => result("cancelled", "operator_cancelled", "Repository read cancelled.");
  if (cancelled.aborted) return stop();
  if (!question.slug) return result("incomplete", "invalid_repository_question", question.problem ?? usage);
  if (mode === "native-macos-offline" || mode === "native-linux-offline")
    return result("incomplete", "repository_offline", "Native networking is offline. Restart pan-agent without --native-offline to read a public repository.");
  if (mode !== "native-macos-public" && mode !== "native-linux-public")
    return result("incomplete", "repository_mode_unavailable", "Repository overviews require the native public workspace mode. Start pan-agent in a project directory.");
  const slug = question.slug;
  const source = "https://api.github.com/repos/" + slug;
  const signal = AbortSignal.any([cancelled, AbortSignal.timeout(45000)]);
  // Also bound resolver waits. The transport checks the signal again after DNS, before connecting.
  const get = (part: RepositoryPart): Promise<Buffer> => new Promise((resolve, reject) => {
    signal.throwIfAborted();
    const abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, {once: true});
    requests++;
    read(slug, part, signal).then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
  const lines: string[] = [];
  try {
    const metadata = JSON.parse((await get("metadata")).toString("utf8"));
    if (metadata?.private !== false || typeof metadata.full_name !== "string" || metadata.full_name.toLowerCase() !== slug.toLowerCase())
      return result("incomplete", "repository_metadata_invalid", "GitHub did not return matching public repository metadata. Check the public root URL.\nSource: " + source);
    lines.push(metadata.full_name, "Metadata: " + source);
    const description = displayText(metadata.description, 400);
    if (description) lines.push("Description: " + description);
    const language = displayText(metadata.language, 80);
    const license = displayText(metadata.license?.spdx_id, 80);
    if (language) lines.push("Primary language: " + language);
    if (license) lines.push("License: " + license);
    if (Number.isSafeInteger(metadata.stargazers_count) && metadata.stargazers_count >= 0)
      lines.push("Stars: " + metadata.stargazers_count);
    lines.push("README: " + source + "/readme");
    try {
      lines.push(readmeExcerpt(await get("readme")));
    } catch (error) {
      if (!(error instanceof UpstreamHttpError) || error.status !== 404) throw error;
      lines.push("GitHub returned 404 for the README. No public README was available.");
    }
    return cancelled.aborted ? stop() : result("completed", "public_repository_overview", lines.join("\n"));
  } catch (error) {
    if (cancelled.aborted) return stop();
    if (!lines.length) lines.push("Metadata: " + source);
    lines.push(signal.aborted ? "Repository read timed out. Check the network and try again." : failure(error, proxy));
    return result("incomplete", "repository_read_failed", lines.join("\n"));
  }
}

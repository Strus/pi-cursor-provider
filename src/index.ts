/**
 * Pi Cursor Provider Extension
 *
 * Routes Pi model requests through the Cursor Agent CLI (`agent`) so that any
 * active Cursor subscription can be used from inside Pi.
 *
 * Authentication is handled by the CLI itself — run `agent login` (or set the
 * CURSOR_API_KEY environment variable) before using this provider.
 *
 * Configuration env vars:
 *   CURSOR_AGENT_PATH   Path to the Cursor Agent CLI binary (default: "agent")
 *   CURSOR_API_KEY      API key for Cursor (used by the agent subprocess if set)
 */

import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import type {
    Api,
    AssistantMessage,
    AssistantMessageEventStream,
    Context,
    Model,
    SimpleStreamOptions,
    TextContent,
    ThinkingContent,
} from "@mariozechner/pi-ai";
import { createAssistantMessageEventStream } from "@mariozechner/pi-ai";
import type {
    ExtensionAPI,
    ExtensionContext,
} from "@mariozechner/pi-coding-agent";
import {
    runAgentModels,
    STATIC_MODELS,
    toCursorId,
    toProviderModels,
} from "./models.js";
import {
    type CursorToolCallPayload,
    renderCompletedToolCall,
    setRendererTheme,
} from "./renderer.js";

// ---------------------------------------------------------------------------
// Prompt serialisation
// Serialises the Pi context into a single text prompt for the CLI.
// The first Cursor CLI invocation receives the full Pi context. Once we have
// a Cursor chat session id, later invocations resume that chat and only send
// the latest user prompt.
// ---------------------------------------------------------------------------

const CURSOR_SESSION_ENTRY_TYPE = "cursor-cli-session";

interface CursorSessionEntryData {
    cursorSessionId: string | null;
}

interface CursorSessionState {
    current: string | undefined;
    persisted: string | null;
    pending: string | null | undefined;
}

/**
 * Convert a content block (text or image) to a plain string for the CLI prompt.
 * Images are serialised as a textual placeholder because the Cursor Agent CLI
 * (v2026.02.13) does not support image attachments in the `--print` prompt.
 * The placeholder preserves the image's MIME type and byte-size so the model
 * can at least acknowledge that an image was intended.
 */
function contentBlockToText(
    block: TextContent | import("@mariozechner/pi-ai").ImageContent,
): string {
    if (block.type === "text") return block.text;
    // ImageContent: { type: "image", data: string (base64), mimeType: string }
    const bytes = Math.round((block.data.length * 3) / 4);
    return `[Image: ${block.mimeType}, ~${bytes} bytes — note: image input is not supported by the Cursor Agent CLI; the visual content cannot be passed through]`;
}

function serializeMessageContent(
    content:
        | string
        | (TextContent | import("@mariozechner/pi-ai").ImageContent)[],
): string {
    return typeof content === "string"
        ? content
        : content.map(contentBlockToText).join("\n");
}

function serializeContext(context: Context): string {
    const lines: string[] = [];

    if (context.systemPrompt) {
        lines.push(`[System]\n${context.systemPrompt}\n`);
    }

    for (const msg of context.messages) {
        if (msg.role === "user") {
            const text = serializeMessageContent(msg.content);
            lines.push(`[User]\n${text}`);
        } else if (msg.role === "assistant") {
            const text = msg.content
                .filter((c): c is TextContent => c.type === "text")
                .map((c) => c.text)
                .join("\n");
            if (text.trim()) {
                lines.push(`[Assistant]\n${text}`);
            }
        } else if (msg.role === "toolResult") {
            const text = msg.content.map(contentBlockToText).join("\n");
            if (text.trim()) {
                lines.push(`[Tool result: ${msg.toolName}]\n${text}`);
            }
        }
    }

    return lines.join("\n\n");
}

function serializeLatestUserPrompt(context: Context): string {
    for (let i = context.messages.length - 1; i >= 0; i -= 1) {
        const message = context.messages[i];
        if (message.role !== "user") continue;
        return serializeMessageContent(message.content);
    }
    return serializeContext(context);
}

function restoreCursorSessionId(ctx: ExtensionContext): string | undefined {
    let cursorSessionId: string | undefined;

    for (const entry of ctx.sessionManager.getBranch()) {
        if (
            entry.type !== "custom" ||
            entry.customType !== CURSOR_SESSION_ENTRY_TYPE
        ) {
            continue;
        }

        const data = entry.data as CursorSessionEntryData | undefined;
        const value = data?.cursorSessionId;
        cursorSessionId =
            typeof value === "string" && value.trim() ? value : undefined;
    }

    return cursorSessionId;
}

function persistCursorSessionId(
    pi: ExtensionAPI,
    state: CursorSessionState,
    cursorSessionId: string | undefined,
): void {
    const nextPersisted = cursorSessionId ?? null;
    if (state.persisted === nextPersisted) return;

    pi.appendEntry<CursorSessionEntryData>(CURSOR_SESSION_ENTRY_TYPE, {
        cursorSessionId: nextPersisted,
    });
    state.persisted = nextPersisted;
}

function syncCursorSessionState(
    ctx: ExtensionContext,
    state: CursorSessionState,
): string | undefined {
    const restored = restoreCursorSessionId(ctx);
    state.current = restored;
    state.persisted = restored ?? null;
    state.pending = undefined;
    return restored;
}

// ---------------------------------------------------------------------------
// NDJSON event types — Cursor CLI stream-json shape
// ---------------------------------------------------------------------------

interface CursorAssistantEvent {
    type: "assistant";
    message: {
        role: "assistant";
        content: Array<{ type: "text"; text: string }>;
    };
    session_id: string;
}

interface CursorToolCallEvent {
    type: "tool_call";
    subtype: "started" | "completed";
    /** The outer object has exactly one key: the tool name (e.g. "shellToolCall"). */
    tool_call: Record<string, CursorToolCallPayload>;
}

interface CursorThinkingEvent {
    type: "thinking";
    subtype: "delta" | "completed";
    text?: string;
}

interface CursorResultEvent {
    type: "result";
    subtype: string;
    duration_ms: number;
}

interface CursorEventBase {
    type: string;
    session_id?: string;
}

type CursorStreamEvent =
    | CursorAssistantEvent
    | CursorThinkingEvent
    | CursorToolCallEvent
    | CursorResultEvent
    | CursorEventBase;

function parseLine(line: string): CursorStreamEvent | null {
    const trimmed = line.trim();
    if (!trimmed) return null;
    try {
        return JSON.parse(trimmed) as CursorStreamEvent;
    } catch {
        return null;
    }
}

function getCursorSessionId(event: CursorStreamEvent): string | undefined {
    const sessionId = (event as CursorEventBase).session_id;
    return typeof sessionId === "string" && sessionId.trim()
        ? sessionId
        : undefined;
}

// ---------------------------------------------------------------------------
// streamSimple — the custom backend for the cursor provider
// ---------------------------------------------------------------------------

function createStreamCursorCli(cursorSessionState: CursorSessionState) {
    return function streamCursorCli(
        model: Model<Api>,
        context: Context,
        options?: SimpleStreamOptions,
    ): AssistantMessageEventStream {
        const stream = createAssistantMessageEventStream();

        (async () => {
            const startTime = Date.now();
            let firstTokenTime: number | undefined;

            const output: AssistantMessage & {
                duration?: number;
                ttft?: number;
            } = {
                role: "assistant",
                content: [],
                api: model.api,
                provider: model.provider,
                model: model.id,
                usage: {
                    input: 0,
                    output: 0,
                    cacheRead: 0,
                    cacheWrite: 0,
                    totalTokens: 0,
                    cost: {
                        input: 0,
                        output: 0,
                        cacheRead: 0,
                        cacheWrite: 0,
                        total: 0,
                    },
                },
                stopReason: "stop",
                timestamp: Date.now(),
            };

            const setTiming = () => {
                output.duration = Date.now() - startTime;
                output.ttft =
                    firstTokenTime != null
                        ? firstTokenTime - startTime
                        : undefined;
            };

            try {
                const agentPath =
                    process.env.CURSOR_AGENT_PATH ??
                    process.env.AGENT_PATH ??
                    "agent";

                const workspacePath = process.cwd();
                const prompt = cursorSessionState.current
                    ? serializeLatestUserPrompt(context)
                    : serializeContext(context);
                const reasoningLevel = (options as { reasoning?: string })
                    ?.reasoning;
                const cliModelId = toCursorId(model.id, reasoningLevel);

                const args = [
                    "--print",
                    "--yolo",
                    "--output-format",
                    "stream-json",
                    "--model",
                    cliModelId,
                ];

                if (cursorSessionState.current) {
                    args.push("--resume", cursorSessionState.current);
                }

                args.push("--trust", "--workspace", workspacePath, prompt);

                if (process.env.CURSOR_API_KEY) {
                    args.unshift("--api-key", process.env.CURSOR_API_KEY);
                }

                stream.push({ type: "start", partial: output });

                const child = spawn(agentPath, args, {
                    stdio: ["ignore", "pipe", "pipe"],
                    env: process.env,
                });

                const onAbort = () => {
                    child.kill("SIGTERM");
                };
                options?.signal?.addEventListener("abort", onAbort, {
                    once: true,
                });

                const stderrChunks: string[] = [];
                child.stderr?.on("data", (chunk: Buffer) => {
                    stderrChunks.push(chunk.toString());
                });

                let accumulatedText = "";
                let openBlock:
                    | { type: "text"; block: TextContent; index: number }
                    | {
                          type: "thinking";
                          block: ThinkingContent;
                          index: number;
                      }
                    | null = null;

                const closeOpenBlock = () => {
                    if (!openBlock) return;

                    if (openBlock.type === "text") {
                        stream.push({
                            type: "text_end",
                            contentIndex: openBlock.index,
                            content: openBlock.block.text,
                            partial: output,
                        });
                    } else {
                        stream.push({
                            type: "thinking_end",
                            contentIndex: openBlock.index,
                            content: openBlock.block.thinking,
                            partial: output,
                        });
                    }

                    openBlock = null;
                };

                const ensureTextBlock = (): {
                    block: TextContent;
                    index: number;
                } => {
                    if (openBlock?.type === "text") {
                        return openBlock;
                    }

                    closeOpenBlock();

                    const block: TextContent = { type: "text", text: "" };
                    output.content.push(block);
                    const index = output.content.length - 1;
                    openBlock = { type: "text", block, index };
                    stream.push({
                        type: "text_start",
                        contentIndex: index,
                        partial: output,
                    });

                    return { block, index };
                };

                const ensureThinkingBlock = (): {
                    block: ThinkingContent;
                    index: number;
                } => {
                    if (openBlock?.type === "thinking") {
                        return openBlock;
                    }

                    closeOpenBlock();

                    const block: ThinkingContent = {
                        type: "thinking",
                        thinking: "",
                    };
                    output.content.push(block);
                    const index = output.content.length - 1;
                    openBlock = { type: "thinking", block, index };
                    stream.push({
                        type: "thinking_start",
                        contentIndex: index,
                        partial: output,
                    });

                    return { block, index };
                };

                const appendTextDelta = (delta: string) => {
                    if (!delta) return;
                    if (firstTokenTime === undefined)
                        firstTokenTime = Date.now();
                    const { block, index } = ensureTextBlock();
                    block.text += delta;
                    accumulatedText += delta;
                    stream.push({
                        type: "text_delta",
                        contentIndex: index,
                        delta,
                        partial: output,
                    });
                };

                const appendThinkingDelta = (delta: string) => {
                    if (!delta) return;
                    if (firstTokenTime === undefined)
                        firstTokenTime = Date.now();
                    const { block, index } = ensureThinkingBlock();
                    block.thinking += delta;
                    stream.push({
                        type: "thinking_delta",
                        contentIndex: index,
                        delta,
                        partial: output,
                    });
                };

                const stdout = child.stdout;
                if (!stdout) {
                    throw new Error(
                        "Child process has no stdout (expected pipe)",
                    );
                }
                const rl = createInterface({
                    input: stdout,
                    crlfDelay: Infinity,
                });

                rl.on("line", (line: string) => {
                    const event = parseLine(line);
                    if (!event) return;

                    const cursorSessionId = getCursorSessionId(event);
                    if (cursorSessionId) {
                        cursorSessionState.current = cursorSessionId;
                        if (cursorSessionState.persisted !== cursorSessionId) {
                            cursorSessionState.pending = cursorSessionId;
                        }
                    }

                    if (event.type === "assistant") {
                        const ae = event as CursorAssistantEvent;
                        for (const block of ae.message.content) {
                            if (block.type !== "text") continue;
                            if (!block.text.trim()) continue;
                            appendTextDelta(block.text);
                        }
                        return;
                    }

                    if (event.type === "thinking") {
                        const te = event as CursorThinkingEvent;
                        if (te.subtype === "delta") {
                            appendThinkingDelta(te.text ?? "");
                            return;
                        }

                        if (te.subtype === "completed") {
                            if (openBlock?.type === "thinking") {
                                closeOpenBlock();
                            }
                            return;
                        }
                    }

                    // Pi supports structured toolcall_* events, but Cursor CLI's tool_call
                    // stream is observational: by the time we receive it, Cursor has
                    // already executed the tool. Emitting Pi tool calls here would cause
                    // Pi to execute the same tool again and continue another agent turn.
                    if (event.type === "tool_call") {
                        const tce = event as CursorToolCallEvent;
                        const cliKey = Object.keys(tce.tool_call)[0];
                        if (!cliKey) return;
                        const payload = tce.tool_call[cliKey];
                        if (!payload) return;

                        if (tce.subtype === "completed") {
                            appendTextDelta(
                                renderCompletedToolCall(cliKey, payload),
                            );
                        }
                    }
                });

                await new Promise<void>((resolve) => {
                    child.on("close", (code) => {
                        options?.signal?.removeEventListener("abort", onAbort);

                        closeOpenBlock();

                        if (options?.signal?.aborted) {
                            output.stopReason = "aborted";
                            setTiming();
                            stream.push({
                                type: "error",
                                reason: "aborted",
                                error: output,
                            });
                            stream.end();
                            resolve();
                            return;
                        }

                        if (code !== 0 && !accumulatedText) {
                            const stderr = stderrChunks.join("").trim();
                            output.stopReason = "error";
                            output.errorMessage =
                                stderr || `Cursor CLI exited with code ${code}`;
                            setTiming();
                            stream.push({
                                type: "error",
                                reason: "error",
                                error: output,
                            });
                            stream.end();
                            resolve();
                            return;
                        }

                        setTiming();
                        stream.push({
                            type: "done",
                            reason: "stop",
                            message: output,
                        });
                        stream.end();
                        resolve();
                    });

                    child.on("error", (err) => {
                        options?.signal?.removeEventListener("abort", onAbort);
                        output.stopReason = "error";
                        output.errorMessage = err.message;
                        setTiming();
                        stream.push({
                            type: "error",
                            reason: "error",
                            error: output,
                        });
                        stream.end();
                        resolve();
                    });
                });
            } catch (error) {
                output.stopReason = options?.signal?.aborted
                    ? "aborted"
                    : "error";
                output.errorMessage =
                    error instanceof Error ? error.message : String(error);
                setTiming();
                stream.push({
                    type: "error",
                    reason: output.stopReason,
                    error: output,
                });
                stream.end();
            }
        })();

        return stream;
    };
}

// ---------------------------------------------------------------------------
// Extension entry point
// ---------------------------------------------------------------------------

export default async function (pi: ExtensionAPI) {
    const agentPath =
        process.env.CURSOR_AGENT_PATH ?? process.env.AGENT_PATH ?? "agent";
    const cursorSessionState: CursorSessionState = {
        current: undefined,
        persisted: null,
        pending: undefined,
    };

    pi.on("session_start", async (event, ctx) => {
        setRendererTheme(ctx.ui.theme);

        const restored = syncCursorSessionState(ctx, cursorSessionState);
        if ((event.reason === "new" || event.reason === "fork") && restored) {
            cursorSessionState.current = undefined;
            cursorSessionState.pending = undefined;
            persistCursorSessionId(pi, cursorSessionState, undefined);
        }
    });

    pi.on("session_tree", async (_event, ctx) => {
        syncCursorSessionState(ctx, cursorSessionState);
    });

    pi.on("agent_end", async () => {
        if (cursorSessionState.pending === undefined) return;

        const pending = cursorSessionState.pending;
        cursorSessionState.pending = undefined;
        persistCursorSessionId(pi, cursorSessionState, pending ?? undefined);
    });

    // Attempt dynamic model discovery; fall back to static list on any failure.
    let modelDefs = STATIC_MODELS;
    try {
        modelDefs = await runAgentModels(agentPath);
    } catch {
        modelDefs = STATIC_MODELS;
    }

    pi.registerProvider("cursor", {
        baseUrl: "cli://cursor-agent",
        apiKey: "CURSOR_API_KEY",
        api: "cursor-cli" as Api,
        models: toProviderModels(modelDefs),
        streamSimple: createStreamCursorCli(cursorSessionState),
    });
}

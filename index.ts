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
} from "@mariozechner/pi-ai";
import { createAssistantMessageEventStream } from "@mariozechner/pi-ai";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

// ---------------------------------------------------------------------------
// Model definitions
// ---------------------------------------------------------------------------

interface CursorModelDef {
  id: string;
  name: string;
  reasoning: boolean;
  contextWindow: number;
  maxTokens: number;
}

/**
 * Static fallback list. Used when `agent models` fails or times out, and as
 * an attribute lookup table for models discovered dynamically.
 *
 * Source: `agent models` output (Cursor CLI v2026.04.17-787b533)
 */
const STATIC_MODELS: CursorModelDef[] = [
  // Auto
  { id: "auto", name: "Auto", reasoning: false, contextWindow: 200000, maxTokens: 32768 },

  // Composer
  { id: "composer-2-fast", name: "Composer 2 Fast", reasoning: false, contextWindow: 200000, maxTokens: 32768 },
  { id: "composer-2", name: "Composer 2", reasoning: false, contextWindow: 200000, maxTokens: 32768 },
  { id: "composer-1.5", name: "Composer 1.5", reasoning: false, contextWindow: 200000, maxTokens: 32768 },

  // GPT-5.4
  { id: "gpt-5.4-low", name: "GPT-5.4 1M Low", reasoning: false, contextWindow: 1000000, maxTokens: 32768 },
  { id: "gpt-5.4-medium", name: "GPT-5.4 1M", reasoning: false, contextWindow: 1000000, maxTokens: 32768 },
  { id: "gpt-5.4-high", name: "GPT-5.4 1M High", reasoning: true, contextWindow: 1000000, maxTokens: 32768 },
  { id: "gpt-5.4-xhigh", name: "GPT-5.4 1M Extra High", reasoning: true, contextWindow: 1000000, maxTokens: 32768 },
  { id: "gpt-5.4-medium-fast", name: "GPT-5.4 Fast", reasoning: false, contextWindow: 1000000, maxTokens: 32768 },
  { id: "gpt-5.4-high-fast", name: "GPT-5.4 High Fast", reasoning: true, contextWindow: 1000000, maxTokens: 32768 },
  { id: "gpt-5.4-xhigh-fast", name: "GPT-5.4 Extra High Fast", reasoning: true, contextWindow: 1000000, maxTokens: 32768 },
  { id: "gpt-5.4-mini-none", name: "GPT-5.4 Mini None", reasoning: false, contextWindow: 200000, maxTokens: 32768 },
  { id: "gpt-5.4-mini-low", name: "GPT-5.4 Mini Low", reasoning: false, contextWindow: 200000, maxTokens: 32768 },
  { id: "gpt-5.4-mini-medium", name: "GPT-5.4 Mini", reasoning: false, contextWindow: 200000, maxTokens: 32768 },
  { id: "gpt-5.4-mini-high", name: "GPT-5.4 Mini High", reasoning: true, contextWindow: 200000, maxTokens: 32768 },
  { id: "gpt-5.4-mini-xhigh", name: "GPT-5.4 Mini Extra High", reasoning: true, contextWindow: 200000, maxTokens: 32768 },
  { id: "gpt-5.4-nano-none", name: "GPT-5.4 Nano None", reasoning: false, contextWindow: 200000, maxTokens: 32768 },
  { id: "gpt-5.4-nano-low", name: "GPT-5.4 Nano Low", reasoning: false, contextWindow: 200000, maxTokens: 32768 },
  { id: "gpt-5.4-nano-medium", name: "GPT-5.4 Nano", reasoning: false, contextWindow: 200000, maxTokens: 32768 },
  { id: "gpt-5.4-nano-high", name: "GPT-5.4 Nano High", reasoning: true, contextWindow: 200000, maxTokens: 32768 },
  { id: "gpt-5.4-nano-xhigh", name: "GPT-5.4 Nano Extra High", reasoning: true, contextWindow: 200000, maxTokens: 32768 },
  { id: "gpt-5-mini", name: "GPT-5 Mini", reasoning: false, contextWindow: 200000, maxTokens: 32768 },

  // GPT-5.3
  { id: "gpt-5.3-codex-low", name: "Codex 5.3 Low", reasoning: false, contextWindow: 200000, maxTokens: 32768 },
  { id: "gpt-5.3-codex", name: "Codex 5.3", reasoning: false, contextWindow: 200000, maxTokens: 32768 },
  { id: "gpt-5.3-codex-high", name: "Codex 5.3 High", reasoning: true, contextWindow: 200000, maxTokens: 32768 },
  { id: "gpt-5.3-codex-xhigh", name: "Codex 5.3 Extra High", reasoning: true, contextWindow: 200000, maxTokens: 32768 },
  { id: "gpt-5.3-codex-low-fast", name: "Codex 5.3 Low Fast", reasoning: false, contextWindow: 200000, maxTokens: 32768 },
  { id: "gpt-5.3-codex-fast", name: "Codex 5.3 Fast", reasoning: false, contextWindow: 200000, maxTokens: 32768 },
  { id: "gpt-5.3-codex-high-fast", name: "Codex 5.3 High Fast", reasoning: true, contextWindow: 200000, maxTokens: 32768 },
  { id: "gpt-5.3-codex-xhigh-fast", name: "Codex 5.3 Extra High Fast", reasoning: true, contextWindow: 200000, maxTokens: 32768 },
  { id: "gpt-5.3-codex-spark-preview-low", name: "Codex 5.3 Spark Low", reasoning: false, contextWindow: 200000, maxTokens: 32768 },
  { id: "gpt-5.3-codex-spark-preview", name: "Codex 5.3 Spark", reasoning: false, contextWindow: 200000, maxTokens: 32768 },
  { id: "gpt-5.3-codex-spark-preview-high", name: "Codex 5.3 Spark High", reasoning: true, contextWindow: 200000, maxTokens: 32768 },
  { id: "gpt-5.3-codex-spark-preview-xhigh", name: "Codex 5.3 Spark Extra High", reasoning: true, contextWindow: 200000, maxTokens: 32768 },

  // GPT-5.2
  { id: "gpt-5.2-low", name: "GPT-5.2 Low", reasoning: false, contextWindow: 200000, maxTokens: 32768 },
  { id: "gpt-5.2", name: "GPT-5.2", reasoning: false, contextWindow: 200000, maxTokens: 32768 },
  { id: "gpt-5.2-high", name: "GPT-5.2 High", reasoning: true, contextWindow: 200000, maxTokens: 32768 },
  { id: "gpt-5.2-xhigh", name: "GPT-5.2 Extra High", reasoning: true, contextWindow: 200000, maxTokens: 32768 },
  { id: "gpt-5.2-low-fast", name: "GPT-5.2 Low Fast", reasoning: false, contextWindow: 200000, maxTokens: 32768 },
  { id: "gpt-5.2-fast", name: "GPT-5.2 Fast", reasoning: false, contextWindow: 200000, maxTokens: 32768 },
  { id: "gpt-5.2-high-fast", name: "GPT-5.2 High Fast", reasoning: true, contextWindow: 200000, maxTokens: 32768 },
  { id: "gpt-5.2-xhigh-fast", name: "GPT-5.2 Extra High Fast", reasoning: true, contextWindow: 200000, maxTokens: 32768 },
  { id: "gpt-5.2-codex-low", name: "Codex 5.2 Low", reasoning: false, contextWindow: 200000, maxTokens: 32768 },
  { id: "gpt-5.2-codex", name: "Codex 5.2", reasoning: false, contextWindow: 200000, maxTokens: 32768 },
  { id: "gpt-5.2-codex-high", name: "Codex 5.2 High", reasoning: true, contextWindow: 200000, maxTokens: 32768 },
  { id: "gpt-5.2-codex-xhigh", name: "Codex 5.2 Extra High", reasoning: true, contextWindow: 200000, maxTokens: 32768 },
  { id: "gpt-5.2-codex-low-fast", name: "Codex 5.2 Low Fast", reasoning: false, contextWindow: 200000, maxTokens: 32768 },
  { id: "gpt-5.2-codex-fast", name: "Codex 5.2 Fast", reasoning: false, contextWindow: 200000, maxTokens: 32768 },
  { id: "gpt-5.2-codex-high-fast", name: "Codex 5.2 High Fast", reasoning: true, contextWindow: 200000, maxTokens: 32768 },
  { id: "gpt-5.2-codex-xhigh-fast", name: "Codex 5.2 Extra High Fast", reasoning: true, contextWindow: 200000, maxTokens: 32768 },

  // GPT-5.1
  { id: "gpt-5.1-low", name: "GPT-5.1 Low", reasoning: false, contextWindow: 200000, maxTokens: 32768 },
  { id: "gpt-5.1", name: "GPT-5.1", reasoning: false, contextWindow: 200000, maxTokens: 32768 },
  { id: "gpt-5.1-high", name: "GPT-5.1 High", reasoning: true, contextWindow: 200000, maxTokens: 32768 },
  { id: "gpt-5.1-codex-max-low", name: "Codex 5.1 Max Low", reasoning: false, contextWindow: 200000, maxTokens: 32768 },
  { id: "gpt-5.1-codex-max-medium", name: "Codex 5.1 Max", reasoning: false, contextWindow: 200000, maxTokens: 32768 },
  { id: "gpt-5.1-codex-max-high", name: "Codex 5.1 Max High", reasoning: true, contextWindow: 200000, maxTokens: 32768 },
  { id: "gpt-5.1-codex-max-xhigh", name: "Codex 5.1 Max Extra High", reasoning: true, contextWindow: 200000, maxTokens: 32768 },
  { id: "gpt-5.1-codex-max-low-fast", name: "Codex 5.1 Max Low Fast", reasoning: false, contextWindow: 200000, maxTokens: 32768 },
  { id: "gpt-5.1-codex-max-medium-fast", name: "Codex 5.1 Max Medium Fast", reasoning: false, contextWindow: 200000, maxTokens: 32768 },
  { id: "gpt-5.1-codex-max-high-fast", name: "Codex 5.1 Max High Fast", reasoning: true, contextWindow: 200000, maxTokens: 32768 },
  { id: "gpt-5.1-codex-max-xhigh-fast", name: "Codex 5.1 Max Extra High Fast", reasoning: true, contextWindow: 200000, maxTokens: 32768 },
  { id: "gpt-5.1-codex-mini-low", name: "Codex 5.1 Mini Low", reasoning: false, contextWindow: 200000, maxTokens: 32768 },
  { id: "gpt-5.1-codex-mini", name: "Codex 5.1 Mini", reasoning: false, contextWindow: 200000, maxTokens: 32768 },
  { id: "gpt-5.1-codex-mini-high", name: "Codex 5.1 Mini High", reasoning: true, contextWindow: 200000, maxTokens: 32768 },

  // Claude Opus
  { id: "claude-opus-4-7-low", name: "Opus 4.7 1M Low", reasoning: false, contextWindow: 1000000, maxTokens: 32000 },
  { id: "claude-opus-4-7-medium", name: "Opus 4.7 1M Medium", reasoning: false, contextWindow: 1000000, maxTokens: 32000 },
  { id: "claude-opus-4-7-high", name: "Opus 4.7 1M High", reasoning: false, contextWindow: 1000000, maxTokens: 32000 },
  { id: "claude-opus-4-7-xhigh", name: "Opus 4.7 1M", reasoning: false, contextWindow: 1000000, maxTokens: 32000 },
  { id: "claude-opus-4-7-max", name: "Opus 4.7 1M Max", reasoning: false, contextWindow: 1000000, maxTokens: 32000 },
  { id: "claude-opus-4-7-thinking-low", name: "Opus 4.7 1M Low Thinking", reasoning: true, contextWindow: 1000000, maxTokens: 32000 },
  { id: "claude-opus-4-7-thinking-medium", name: "Opus 4.7 1M Medium Thinking", reasoning: true, contextWindow: 1000000, maxTokens: 32000 },
  { id: "claude-opus-4-7-thinking-high", name: "Opus 4.7 1M High Thinking", reasoning: true, contextWindow: 1000000, maxTokens: 32000 },
  { id: "claude-opus-4-7-thinking-xhigh", name: "Opus 4.7 1M Thinking", reasoning: true, contextWindow: 1000000, maxTokens: 32000 },
  { id: "claude-opus-4-7-thinking-max", name: "Opus 4.7 1M Max Thinking", reasoning: true, contextWindow: 1000000, maxTokens: 32000 },
  { id: "claude-4.6-opus-high", name: "Opus 4.6 1M", reasoning: false, contextWindow: 1000000, maxTokens: 32000 },
  { id: "claude-4.6-opus-max", name: "Opus 4.6 1M Max", reasoning: false, contextWindow: 1000000, maxTokens: 32000 },
  { id: "claude-4.6-opus-high-thinking", name: "Opus 4.6 1M Thinking", reasoning: true, contextWindow: 1000000, maxTokens: 32000 },
  { id: "claude-4.6-opus-max-thinking", name: "Opus 4.6 1M Max Thinking", reasoning: true, contextWindow: 1000000, maxTokens: 32000 },
  { id: "claude-4.6-opus-high-thinking-fast", name: "Opus 4.6 1M Thinking Fast", reasoning: true, contextWindow: 1000000, maxTokens: 32000 },
  { id: "claude-4.6-opus-max-thinking-fast", name: "Opus 4.6 1M Max Thinking Fast", reasoning: true, contextWindow: 1000000, maxTokens: 32000 },
  { id: "claude-4.5-opus-high", name: "Opus 4.5", reasoning: false, contextWindow: 200000, maxTokens: 32000 },
  { id: "claude-4.5-opus-high-thinking", name: "Opus 4.5 Thinking", reasoning: true, contextWindow: 200000, maxTokens: 32000 },

  // Claude Sonnet
  { id: "claude-4.6-sonnet-medium", name: "Sonnet 4.6 1M", reasoning: false, contextWindow: 1000000, maxTokens: 32000 },
  { id: "claude-4.6-sonnet-medium-thinking", name: "Sonnet 4.6 1M Thinking", reasoning: true, contextWindow: 1000000, maxTokens: 32000 },
  { id: "claude-4.5-sonnet", name: "Sonnet 4.5 1M", reasoning: false, contextWindow: 1000000, maxTokens: 32000 },
  { id: "claude-4.5-sonnet-thinking", name: "Sonnet 4.5 1M Thinking", reasoning: true, contextWindow: 1000000, maxTokens: 32000 },
  { id: "claude-4-sonnet", name: "Sonnet 4", reasoning: false, contextWindow: 200000, maxTokens: 32000 },
  { id: "claude-4-sonnet-thinking", name: "Sonnet 4 Thinking", reasoning: true, contextWindow: 200000, maxTokens: 32000 },
  { id: "claude-4-sonnet-1m", name: "Sonnet 4 1M", reasoning: false, contextWindow: 1000000, maxTokens: 32000 },
  { id: "claude-4-sonnet-1m-thinking", name: "Sonnet 4 1M Thinking", reasoning: true, contextWindow: 1000000, maxTokens: 32000 },

  // Gemini
  { id: "gemini-3.1-pro", name: "Gemini 3.1 Pro", reasoning: false, contextWindow: 1000000, maxTokens: 65536 },
  { id: "gemini-3-flash", name: "Gemini 3 Flash", reasoning: false, contextWindow: 1000000, maxTokens: 65536 },

  // Grok
  { id: "grok-4-20", name: "Grok 4.20", reasoning: false, contextWindow: 131072, maxTokens: 32768 },
  { id: "grok-4-20-thinking", name: "Grok 4.20 Thinking", reasoning: true, contextWindow: 131072, maxTokens: 32768 },

  // Kimi
  { id: "kimi-k2.5", name: "Kimi K2.5", reasoning: false, contextWindow: 200000, maxTokens: 32768 },
];

/** Fast lookup: static model id → definition */
const STATIC_MODELS_MAP = new Map<string, CursorModelDef>(
  STATIC_MODELS.map((m) => [m.id, m]),
);

// ---------------------------------------------------------------------------
// Canonical model ID mapping
// Maps canonical IDs (e.g. claude-sonnet-4-5) to CLI model IDs. When Pi
// provides a reasoning/thinking level, the corresponding variant is used.
// ---------------------------------------------------------------------------

type ReasoningLevel = "minimal" | "low" | "medium" | "high" | "xhigh";

interface ModelVariants {
  default: string;
  minimal?: string;
  low?: string;
  medium?: string;
  high?: string;
  xhigh?: string;
}

const MODEL_MAP: Record<string, ModelVariants> = {
  "sonnet-4.5": {
    default: "claude-4.5-sonnet",
    minimal: "claude-4.5-sonnet-thinking",
    low: "claude-4.5-sonnet-thinking",
    medium: "claude-4.5-sonnet-thinking",
    high: "claude-4.5-sonnet-thinking",
    xhigh: "claude-4.5-sonnet-thinking",
  },
  "claude-sonnet-4-5": {
    default: "claude-4.5-sonnet",
    minimal: "claude-4.5-sonnet-thinking",
    low: "claude-4.5-sonnet-thinking",
    medium: "claude-4.5-sonnet-thinking",
    high: "claude-4.5-sonnet-thinking",
    xhigh: "claude-4.5-sonnet-thinking",
  },
  "sonnet-4.6": {
    default: "claude-4.6-sonnet-medium",
    minimal: "claude-4.6-sonnet-medium-thinking",
    low: "claude-4.6-sonnet-medium-thinking",
    medium: "claude-4.6-sonnet-medium-thinking",
    high: "claude-4.6-sonnet-medium-thinking",
    xhigh: "claude-4.6-sonnet-medium-thinking",
  },
  "claude-sonnet-4-6": {
    default: "claude-4.6-sonnet-medium",
    minimal: "claude-4.6-sonnet-medium-thinking",
    low: "claude-4.6-sonnet-medium-thinking",
    medium: "claude-4.6-sonnet-medium-thinking",
    high: "claude-4.6-sonnet-medium-thinking",
    xhigh: "claude-4.6-sonnet-medium-thinking",
  },
  "claude-sonnet-4": {
    default: "claude-4-sonnet",
    minimal: "claude-4-sonnet-thinking",
    low: "claude-4-sonnet-thinking",
    medium: "claude-4-sonnet-thinking",
    high: "claude-4-sonnet-thinking",
    xhigh: "claude-4-sonnet-thinking",
  },
  "claude-sonnet-4-1m": {
    default: "claude-4-sonnet-1m",
    minimal: "claude-4-sonnet-1m-thinking",
    low: "claude-4-sonnet-1m-thinking",
    medium: "claude-4-sonnet-1m-thinking",
    high: "claude-4-sonnet-1m-thinking",
    xhigh: "claude-4-sonnet-1m-thinking",
  },
  "opus-4.5": {
    default: "claude-4.5-opus-high",
    minimal: "claude-4.5-opus-high-thinking",
    low: "claude-4.5-opus-high-thinking",
    medium: "claude-4.5-opus-high-thinking",
    high: "claude-4.5-opus-high-thinking",
    xhigh: "claude-4.5-opus-high-thinking",
  },
  "claude-opus-4-5": {
    default: "claude-4.5-opus-high",
    minimal: "claude-4.5-opus-high-thinking",
    low: "claude-4.5-opus-high-thinking",
    medium: "claude-4.5-opus-high-thinking",
    high: "claude-4.5-opus-high-thinking",
    xhigh: "claude-4.5-opus-high-thinking",
  },
  "opus-4.6": {
    default: "claude-4.6-opus-high",
    minimal: "claude-4.6-opus-high-thinking",
    low: "claude-4.6-opus-high-thinking",
    medium: "claude-4.6-opus-high-thinking",
    high: "claude-4.6-opus-high-thinking",
    xhigh: "claude-4.6-opus-max-thinking",
  },
  "claude-opus-4-6": {
    default: "claude-4.6-opus-high",
    minimal: "claude-4.6-opus-high-thinking",
    low: "claude-4.6-opus-high-thinking",
    medium: "claude-4.6-opus-high-thinking",
    high: "claude-4.6-opus-high-thinking",
    xhigh: "claude-4.6-opus-max-thinking",
  },
  "claude-opus-4-6-fast": {
    default: "claude-4.6-opus-high-thinking-fast",
    minimal: "claude-4.6-opus-high-thinking-fast",
    low: "claude-4.6-opus-high-thinking-fast",
    medium: "claude-4.6-opus-high-thinking-fast",
    high: "claude-4.6-opus-high-thinking-fast",
    xhigh: "claude-4.6-opus-max-thinking-fast",
  },
  "claude-opus-4-7": {
    default: "claude-opus-4-7-xhigh",
    minimal: "claude-opus-4-7-thinking-low",
    low: "claude-opus-4-7-thinking-low",
    medium: "claude-opus-4-7-thinking-medium",
    high: "claude-opus-4-7-thinking-high",
    xhigh: "claude-opus-4-7-thinking-xhigh",
  },
  "gpt-5.1": {
    default: "gpt-5.1",
    minimal: "gpt-5.1-low",
    low: "gpt-5.1-low",
    medium: "gpt-5.1",
    high: "gpt-5.1-high",
    xhigh: "gpt-5.1-high",
  },
  "gpt-5.2": {
    default: "gpt-5.2",
    minimal: "gpt-5.2-low",
    low: "gpt-5.2-low",
    medium: "gpt-5.2",
    high: "gpt-5.2-high",
    xhigh: "gpt-5.2-xhigh",
  },
  "gpt-5.2-fast": {
    default: "gpt-5.2-fast",
    minimal: "gpt-5.2-low-fast",
    low: "gpt-5.2-low-fast",
    medium: "gpt-5.2-fast",
    high: "gpt-5.2-high-fast",
    xhigh: "gpt-5.2-xhigh-fast",
  },
  "gpt-5.2-codex": {
    default: "gpt-5.2-codex",
    minimal: "gpt-5.2-codex-low",
    low: "gpt-5.2-codex-low",
    medium: "gpt-5.2-codex",
    high: "gpt-5.2-codex-high",
    xhigh: "gpt-5.2-codex-xhigh",
  },
  "gpt-5.2-codex-fast": {
    default: "gpt-5.2-codex-fast",
    minimal: "gpt-5.2-codex-low-fast",
    low: "gpt-5.2-codex-low-fast",
    medium: "gpt-5.2-codex-fast",
    high: "gpt-5.2-codex-high-fast",
    xhigh: "gpt-5.2-codex-xhigh-fast",
  },
  "gpt-5.3-codex": {
    default: "gpt-5.3-codex",
    minimal: "gpt-5.3-codex-low",
    low: "gpt-5.3-codex-low",
    medium: "gpt-5.3-codex",
    high: "gpt-5.3-codex-high",
    xhigh: "gpt-5.3-codex-xhigh",
  },
  "gpt-5.3-codex-fast": {
    default: "gpt-5.3-codex-fast",
    minimal: "gpt-5.3-codex-low-fast",
    low: "gpt-5.3-codex-low-fast",
    medium: "gpt-5.3-codex-fast",
    high: "gpt-5.3-codex-high-fast",
    xhigh: "gpt-5.3-codex-xhigh-fast",
  },
  "gpt-5.3-codex-spark-preview": {
    default: "gpt-5.3-codex-spark-preview",
    minimal: "gpt-5.3-codex-spark-preview-low",
    low: "gpt-5.3-codex-spark-preview-low",
    medium: "gpt-5.3-codex-spark-preview",
    high: "gpt-5.3-codex-spark-preview-high",
    xhigh: "gpt-5.3-codex-spark-preview-xhigh",
  },
  "gpt-5.1-codex-max": {
    default: "gpt-5.1-codex-max-medium",
    minimal: "gpt-5.1-codex-max-low",
    low: "gpt-5.1-codex-max-low",
    medium: "gpt-5.1-codex-max-medium",
    high: "gpt-5.1-codex-max-high",
    xhigh: "gpt-5.1-codex-max-xhigh",
  },
  "gpt-5.1-codex-max-fast": {
    default: "gpt-5.1-codex-max-medium-fast",
    minimal: "gpt-5.1-codex-max-low-fast",
    low: "gpt-5.1-codex-max-low-fast",
    medium: "gpt-5.1-codex-max-medium-fast",
    high: "gpt-5.1-codex-max-high-fast",
    xhigh: "gpt-5.1-codex-max-xhigh-fast",
  },
  "gpt-5.1-codex-mini": {
    default: "gpt-5.1-codex-mini",
    minimal: "gpt-5.1-codex-mini-low",
    low: "gpt-5.1-codex-mini-low",
    medium: "gpt-5.1-codex-mini",
    high: "gpt-5.1-codex-mini-high",
    xhigh: "gpt-5.1-codex-mini-high",
  },
  "gpt-5.4": {
    default: "gpt-5.4-medium",
    minimal: "gpt-5.4-low",
    low: "gpt-5.4-low",
    medium: "gpt-5.4-medium",
    high: "gpt-5.4-high",
    xhigh: "gpt-5.4-xhigh",
  },
  "gpt-5.4-fast": {
    default: "gpt-5.4-medium-fast",
    minimal: "gpt-5.4-medium-fast",
    low: "gpt-5.4-medium-fast",
    medium: "gpt-5.4-medium-fast",
    high: "gpt-5.4-high-fast",
    xhigh: "gpt-5.4-xhigh-fast",
  },
  "gpt-5.4-mini": {
    default: "gpt-5.4-mini-medium",
    minimal: "gpt-5.4-mini-low",
    low: "gpt-5.4-mini-low",
    medium: "gpt-5.4-mini-medium",
    high: "gpt-5.4-mini-high",
    xhigh: "gpt-5.4-mini-xhigh",
  },
  "gpt-5.4-nano": {
    default: "gpt-5.4-nano-medium",
    minimal: "gpt-5.4-nano-low",
    low: "gpt-5.4-nano-low",
    medium: "gpt-5.4-nano-medium",
    high: "gpt-5.4-nano-high",
    xhigh: "gpt-5.4-nano-xhigh",
  },
  "gemini-3-pro": { default: "gemini-3.1-pro" },
  "gemini-3-pro-preview": { default: "gemini-3.1-pro" },
  "gemini-3.1-pro-preview": { default: "gemini-3.1-pro" },
  "gemini-3-flash-preview": { default: "gemini-3-flash" },
  "grok": {
    default: "grok-4-20",
    minimal: "grok-4-20-thinking",
    low: "grok-4-20-thinking",
    medium: "grok-4-20-thinking",
    high: "grok-4-20-thinking",
    xhigh: "grok-4-20-thinking",
  },
  "grok-code-fast-1": {
    default: "grok-4-20",
    minimal: "grok-4-20-thinking",
    low: "grok-4-20-thinking",
    medium: "grok-4-20-thinking",
    high: "grok-4-20-thinking",
    xhigh: "grok-4-20-thinking",
  },
  "grok-4-20": {
    default: "grok-4-20",
    minimal: "grok-4-20-thinking",
    low: "grok-4-20-thinking",
    medium: "grok-4-20-thinking",
    high: "grok-4-20-thinking",
    xhigh: "grok-4-20-thinking",
  },
};

const cursorDefaultToCanonical = new Map<string, string>();
const allMappedCursorIds = new Set<string>();
for (const [canonicalId, variants] of Object.entries(MODEL_MAP)) {
  if (variants.default) cursorDefaultToCanonical.set(variants.default, canonicalId);
  for (const cursorId of Object.values(variants)) {
    if (cursorId) allMappedCursorIds.add(cursorId);
  }
}

/**
 * Convert a Cursor CLI model ID to its canonical ID.
 * Returns null for variant-only IDs (e.g. thinking); they are not shown as separate models.
 * Returns the id as-is for unmapped models.
 */
function toCanonicalId(cursorId: string): string | null {
  const canonical = cursorDefaultToCanonical.get(cursorId);
  if (canonical) return canonical;
  if (allMappedCursorIds.has(cursorId)) return null;
  return cursorId;
}

/**
 * Resolve a canonical model ID (and optional reasoning level) to the Cursor CLI model ID.
 * Returns the id as-is for unmapped models.
 */
function toCursorId(canonicalId: string, reasoning?: string): string {
  const family = MODEL_MAP[canonicalId];
  if (!family) return canonicalId;
  const level = reasoning as ReasoningLevel | undefined;
  const variant = level && family[level];
  return variant ?? family.default ?? canonicalId;
}

// ---------------------------------------------------------------------------
// Dynamic model discovery via `agent models`
// ---------------------------------------------------------------------------

/** Timeout (ms) for `agent models` discovery call. */
const DISCOVERY_TIMEOUT_MS = 15_000;

/**
 * Infer the `reasoning` flag for a model that is not in the static list.
 * Models whose id contains -thinking or ends with -high, -xhigh, -max-high,
 * or -max are treated as reasoning/extended-thinking models.
 */
function inferReasoning(id: string): boolean {
  return /-thinking(?:-|$)|-high$|-xhigh$|-max-high$|-max$/.test(id);
}

/**
 * Parse the text output of `agent models` into a list of model definitions.
 *
 * Expected format (one model per line after the header, before the tip):
 *   <id> - <name>  [(current[, default] | default)]
 *
 * Example lines:
 *   "auto - Auto"
 *   "opus-4.6-thinking - Claude 4.6 Opus (Thinking)  (default)"
 *   "sonnet-4.6 - Claude 4.6 Sonnet  (current)"
 */
function parseAgentModelsOutput(output: string): CursorModelDef[] {
  const results: CursorModelDef[] = [];
  // Match lines like: "model-id - Display Name  (optional flags)"
  const lineRe = /^([a-zA-Z0-9][a-zA-Z0-9._-]*)\s+-\s+(.+?)(?:\s+\((?:current|default|current,\s*default)\))?$/;

  for (const line of output.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("Available") || trimmed.startsWith("Tip:")) continue;
    const match = lineRe.exec(trimmed);
    if (!match) continue;

    const id = match[1].trim();
    const rawName = match[2].trim();

    // Use static attributes if available, otherwise infer
    const known = STATIC_MODELS_MAP.get(id);
    results.push({
      id,
      name: rawName,
      reasoning: known?.reasoning ?? inferReasoning(id),
      contextWindow: known?.contextWindow ?? 200000,
      maxTokens: known?.maxTokens ?? 32768,
    });
  }
  return results;
}

/**
 * Run `agent models` and return the parsed model list.
 * Rejects if the CLI exits with an error, produces no usable output, or
 * exceeds the discovery timeout.
 */
function runAgentModels(agentPath: string): Promise<CursorModelDef[]> {
  return new Promise((resolve, reject) => {
    const args = ["models"];
    if (process.env["CURSOR_API_KEY"]) {
      args.unshift("--api-key", process.env["CURSOR_API_KEY"]);
    }

    let stdout = "";
    let stderr = "";
    const child = spawn(agentPath, args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });

    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`agent models timed out after ${DISCOVERY_TIMEOUT_MS}ms`));
    }, DISCOVERY_TIMEOUT_MS);

    child.stdout?.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
    child.stderr?.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });

    child.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        reject(new Error(`agent models exited with code ${code}: ${stderr.trim()}`));
        return;
      }
      const models = parseAgentModelsOutput(stdout);
      if (models.length === 0) {
        reject(new Error("agent models returned no models"));
        return;
      }
      resolve(models);
    });
  });
}

// ---------------------------------------------------------------------------
// Prompt serialisation
// Serialises the Pi context into a single text prompt for the CLI.
// Cursor CLI receives the conversation as one -p "..." argument; multi-turn
// history is included as a prefixed transcript (best-effort).
// ---------------------------------------------------------------------------

/**
 * Convert a content block (text or image) to a plain string for the CLI prompt.
 * Images are serialised as a textual placeholder because the Cursor Agent CLI
 * (v2026.02.13) does not support image attachments in the `--print` prompt.
 * The placeholder preserves the image's MIME type and byte-size so the model
 * can at least acknowledge that an image was intended.
 */
function contentBlockToText(block: TextContent | import("@mariozechner/pi-ai").ImageContent): string {
  if (block.type === "text") return block.text;
  // ImageContent: { type: "image", data: string (base64), mimeType: string }
  const bytes = Math.round((block.data.length * 3) / 4);
  return `[Image: ${block.mimeType}, ~${bytes} bytes — note: image input is not supported by the Cursor Agent CLI; the visual content cannot be passed through]`;
}

function serializeContext(context: Context): string {
  const lines: string[] = [];

  if (context.systemPrompt) {
    lines.push(`[System]\n${context.systemPrompt}\n`);
  }

  for (const msg of context.messages) {
    if (msg.role === "user") {
      const text =
        typeof msg.content === "string"
          ? msg.content
          : msg.content.map(contentBlockToText).join("\n");
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

// ---------------------------------------------------------------------------
// NDJSON event types — Cursor CLI stream-json shape
// ---------------------------------------------------------------------------

interface CursorAssistantEvent {
  type: "assistant";
  message: { role: "assistant"; content: Array<{ type: "text"; text: string }> };
  session_id: string;
}

/**
 * A single Cursor CLI tool call (the value keyed by tool name).
 * The key is the tool name in camelCase (e.g. "shellToolCall", "readToolCall").
 * args are present on both started and completed; result only on completed.
 */
interface CursorToolCallPayload {
  args: Record<string, unknown>;
  result?: {
    success?: Record<string, unknown>;
    rejected?: { reason?: string };
    error?: { message?: string };
  };
}

interface CursorToolCallEvent {
  type: "tool_call";
  subtype: "started" | "completed";
  /** The outer object has exactly one key: the tool name (e.g. "shellToolCall"). */
  tool_call: Record<string, CursorToolCallPayload>;
}

interface CursorResultEvent {
  type: "result";
  subtype: string;
  duration_ms: number;
}

type CursorStreamEvent =
  | CursorAssistantEvent
  | CursorToolCallEvent
  | CursorResultEvent
  | { type: string };

function parseLine(line: string): CursorStreamEvent | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed) as CursorStreamEvent;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Tool name mapping — CLI camelCase key → Pi display name
// ---------------------------------------------------------------------------

const TOOL_NAME_MAP: Record<string, string> = {
  shellToolCall: "Shell",
  readToolCall: "Read",
  editToolCall: "Edit",
  writeToolCall: "Write",
  deleteToolCall: "Delete",
  grepToolCall: "Grep",
  globToolCall: "Glob",
  lsToolCall: "Ls",
  todoToolCall: "Todo",
  updateTodosToolCall: "UpdateTodos",
  findToolCall: "Find",
  webFetchToolCall: "WebFetch",
  webSearchToolCall: "WebSearch",
};

/** Convert a CLI tool event key (e.g. "shellToolCall") to a Pi tool name. */
function toPiToolName(cliKey: string): string {
  return TOOL_NAME_MAP[cliKey] ?? cliKey.replace(/ToolCall$/, "");
}

// ---------------------------------------------------------------------------
// streamSimple — the custom backend for the cursor provider
// ---------------------------------------------------------------------------

function streamCursorCli(
  model: Model<Api>,
  context: Context,
  options?: SimpleStreamOptions,
): AssistantMessageEventStream {
  const stream = createAssistantMessageEventStream();

  (async () => {
    const startTime = Date.now();
    let firstTokenTime: number | undefined;

    const output: AssistantMessage & { duration?: number; ttft?: number } = {
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
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      },
      stopReason: "stop",
      timestamp: Date.now(),
    };

    const setTiming = () => {
      output.duration = Date.now() - startTime;
      output.ttft = firstTokenTime != null ? firstTokenTime - startTime : undefined;
    };

    try {
      const agentPath =
        process.env["CURSOR_AGENT_PATH"] ??
        process.env["AGENT_PATH"] ??
        "agent";

      const workspacePath = currentCwd;
      const prompt = serializeContext(context);
      const reasoningLevel = (options as { reasoning?: string })?.reasoning;
      const cliModelId = toCursorId(model.id, reasoningLevel);

      const args = [
        "--print",
        "--yolo",
        "--output-format", "stream-json",
        "--model", cliModelId,
        "--trust",
        "--workspace", workspacePath,
        prompt,
      ];

      if (process.env["CURSOR_API_KEY"]) {
        args.unshift("--api-key", process.env["CURSOR_API_KEY"]);
      }

      stream.push({ type: "start", partial: output });

      const child = spawn(agentPath, args, {
        stdio: ["ignore", "pipe", "pipe"],
        env: process.env,
      });

      const onAbort = () => {
        child.kill("SIGTERM");
      };
      options?.signal?.addEventListener("abort", onAbort, { once: true });

      const stderrChunks: string[] = [];
      child.stderr?.on("data", (chunk: Buffer) => {
        stderrChunks.push(chunk.toString());
      });

      let textBlockOpen = false;
      let accumulatedText = "";

      const rl = createInterface({ input: child.stdout!, crlfDelay: Infinity });

      rl.on("line", (line: string) => {
        const event = parseLine(line);
        if (!event) return;

        if (event.type === "assistant") {
          const ae = event as CursorAssistantEvent;
          for (const block of ae.message.content) {
            if (block.type !== "text") continue;
            if (!block.text.trim()) continue;

            if (firstTokenTime === undefined) firstTokenTime = Date.now();
            if (!textBlockOpen) {
              output.content.push({ type: "text", text: "" });
              const idx = output.content.length - 1;
              stream.push({ type: "text_start", contentIndex: idx, partial: output });
              textBlockOpen = true;
            }

            const idx = output.content.length - 1;
            const textBlock = output.content[idx] as TextContent;
            textBlock.text += block.text;
            accumulatedText += block.text;
            stream.push({ type: "text_delta", contentIndex: idx, delta: block.text, partial: output });
          }
          return;
        }

        // Tool calls are rendered as informational text, not as Pi toolcall_*
        // events, to prevent Pi's agentic loop from re-invoking streamSimple.
        if (event.type === "tool_call") {
          const tce = event as CursorToolCallEvent;
          const cliKey = Object.keys(tce.tool_call)[0];
          if (!cliKey) return;
          const toolName = toPiToolName(cliKey);

          if (tce.subtype === "started") {
            const payload = tce.tool_call[cliKey];
            const argsSnippet = JSON.stringify(payload.args ?? {});
            const brief = argsSnippet.length > 120 ? argsSnippet.slice(0, 120) + "…" : argsSnippet;
            const marker = `\n⏳ [${toolName}] ${brief}\n`;

            if (!textBlockOpen) {
              output.content.push({ type: "text", text: "" });
              const idx = output.content.length - 1;
              stream.push({ type: "text_start", contentIndex: idx, partial: output });
              textBlockOpen = true;
            }
            const idx = output.content.length - 1;
            const textBlock = output.content[idx] as TextContent;
            textBlock.text += marker;
            accumulatedText += marker;
            stream.push({ type: "text_delta", contentIndex: idx, delta: marker, partial: output });
          }
        }
      });

      await new Promise<void>((resolve) => {
        child.on("close", (code) => {
          options?.signal?.removeEventListener("abort", onAbort);

          if (textBlockOpen) {
            const idx = output.content.length - 1;
            stream.push({ type: "text_end", contentIndex: idx, content: accumulatedText, partial: output });
            textBlockOpen = false;
          }

          if (options?.signal?.aborted) {
            output.stopReason = "aborted";
            setTiming();
            stream.push({ type: "error", reason: "aborted", error: output });
            stream.end();
            resolve();
            return;
          }

          if (code !== 0 && !accumulatedText) {
            const stderr = stderrChunks.join("").trim();
            output.stopReason = "error";
            output.errorMessage = stderr || `Cursor CLI exited with code ${code}`;
            setTiming();
            stream.push({ type: "error", reason: "error", error: output });
            stream.end();
            resolve();
            return;
          }

          setTiming();
          stream.push({ type: "done", reason: "stop", message: output });
          stream.end();
          resolve();
        });

        child.on("error", (err) => {
          options?.signal?.removeEventListener("abort", onAbort);
          output.stopReason = "error";
          output.errorMessage = err.message;
          setTiming();
          stream.push({ type: "error", reason: "error", error: output });
          stream.end();
          resolve();
        });
      });
    } catch (error) {
      output.stopReason = options?.signal?.aborted ? "aborted" : "error";
      output.errorMessage = error instanceof Error ? error.message : String(error);
      setTiming();
      stream.push({ type: "error", reason: output.stopReason, error: output });
      stream.end();
    }
  })();

  return stream;
}

// ---------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------

/**
 * Spawn `agent login` in an interactive child process so the user can
 * authenticate with Cursor from within a Pi session.
 * Returns a promise that resolves when login completes (exit 0) and rejects
 * on non-zero exit or spawn error.
 */
function runAgentLogin(agentPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const args: string[] = ["login"];
    // Suppress browser-open so login is purely CLI-driven (prints URL/code)
    const env = { ...process.env, NO_OPEN_BROWSER: "1" };

    const child = spawn(agentPath, args, {
      stdio: "inherit",
      env,
    });

    child.on("error", (err) => reject(err));
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`agent login exited with code ${code}`));
    });
  });
}

/**
 * Run `agent status` and return the trimmed output (e.g. "✓ Logged in as …").
 */
function runAgentStatus(agentPath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let out = "";
    const child = spawn(agentPath, ["status"], {
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });
    child.stdout?.on("data", (c: Buffer) => { out += c.toString(); });
    child.stderr?.on("data", (c: Buffer) => { out += c.toString(); });
    child.on("error", (err) => reject(err));
    child.on("close", () => resolve(out.trim()));
  });
}

// ---------------------------------------------------------------------------
// Extension entry point
// ---------------------------------------------------------------------------

let currentCwd = process.cwd()

/**
 * Build a ProviderModelConfig array from a list of CursorModelDef entries.
 * Uses canonical IDs where a mapping exists and omits variant-only entries.
 */
function toProviderModels(defs: CursorModelDef[]) {
  const seen = new Set<string>();
  return defs.flatMap((m) => {
    const canonicalId = toCanonicalId(m.id);
    if (canonicalId === null) return []; // variant-only; hide
    const id = canonicalId !== m.id ? canonicalId : m.id;
    if (seen.has(id)) return [];
    seen.add(id);
    return [
      {
        id,
        name: `${m.name} (Cursor)`,
        reasoning: m.reasoning,
        input: ["text"] as ("text" | "image")[],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: m.contextWindow,
        maxTokens: m.maxTokens,
      },
    ];
  });
}

export default async function (pi: ExtensionAPI) {
  const agentPath =
    process.env["CURSOR_AGENT_PATH"] ??
    process.env["AGENT_PATH"] ??
    "agent";

  // Attempt dynamic model discovery; fall back to static list on any failure.
  let modelDefs: CursorModelDef[];
  try {
    modelDefs = await runAgentModels(agentPath);
  } catch {
    modelDefs = STATIC_MODELS;
  }

  // Track Pi's working directory so streamSimple uses the correct cwd
  // (process.cwd() may differ from Pi's session cwd, e.g. after /cd).
  pi.on("session_start", (_event, ctx) => {
    currentCwd = ctx.cwd;
  });
  pi.on("turn_start", (_event, ctx) => {
    currentCwd = ctx.cwd;
  });

  pi.registerProvider("cursor", {
    baseUrl: "cli://cursor-agent",
    apiKey: "CURSOR_API_KEY",
    api: "cursor-cli" as Api,
    models: toProviderModels(modelDefs),
    streamSimple: streamCursorCli,
  });

  // ---------------------------------------------------------------------------
  // Slash commands for Cursor auth management
  // ---------------------------------------------------------------------------

  pi.registerCommand("cursor-login", {
    description: "Log in to Cursor (runs `agent login`)",
    handler: async (_args, ctx) => {
      ctx.ui.notify("Starting Cursor login (NO_OPEN_BROWSER=1 — copy the URL from the output)…", "info");
      try {
        await runAgentLogin(agentPath);
        ctx.ui.notify("Cursor login successful.", "info");
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        ctx.ui.notify(`Cursor login failed: ${msg}`, "error");
      }
    },
  });

  pi.registerCommand("cursor-status", {
    description: "Show Cursor authentication status (runs `agent status`)",
    handler: async (_args, ctx) => {
      try {
        const status = await runAgentStatus(agentPath);
        ctx.ui.notify(status || "No output from `agent status`.", "info");
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        ctx.ui.notify(`Could not get Cursor status: ${msg}`, "error");
      }
    },
  });

  pi.registerCommand("cursor-logout", {
    description: "Log out of Cursor (runs `agent logout`)",
    handler: async (_args, ctx) => {
      try {
        await new Promise<void>((resolve, reject) => {
          const child = spawn(agentPath, ["logout"], {
            stdio: "inherit",
            env: process.env,
          });
          child.on("error", reject);
          child.on("close", (code) => {
            if (code === 0) resolve();
            else reject(new Error(`agent logout exited with code ${code}`));
          });
        });
        ctx.ui.notify("Logged out of Cursor.", "info");
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        ctx.ui.notify(`Cursor logout failed: ${msg}`, "error");
      }
    },
  });
}

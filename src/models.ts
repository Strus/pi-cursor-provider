import { spawn } from "node:child_process";

export interface CursorModelDef {
    id: string;
    name: string;
    reasoning: boolean;
    contextWindow: number;
    maxTokens: number;
}

/** Explicit `-thinking` variants are always reasoning-capable. */
const THINKING_VARIANT_RE = /-thinking(?:-|$)/;

/**
 * Static fallback list. Used when `agent models` fails or times out, and as
 * an attribute lookup table for models discovered dynamically.
 *
 * Source: `agent models` output (Cursor CLI v2026.04.17-787b533)
 */
export const STATIC_MODELS: CursorModelDef[] = [
    // Auto
    {
        id: "auto",
        name: "Auto",
        reasoning: false,
        contextWindow: 200000,
        maxTokens: 32768,
    },

    // Composer
    {
        id: "composer-2-fast",
        name: "Composer 2 Fast",
        reasoning: false,
        contextWindow: 200000,
        maxTokens: 32768,
    },
    {
        id: "composer-2",
        name: "Composer 2",
        reasoning: false,
        contextWindow: 200000,
        maxTokens: 32768,
    },
    {
        id: "composer-1.5",
        name: "Composer 1.5",
        reasoning: false,
        contextWindow: 200000,
        maxTokens: 32768,
    },

    // GPT-5.4
    {
        id: "gpt-5.4-low",
        name: "GPT-5.4 1M Low",
        reasoning: true,
        contextWindow: 1000000,
        maxTokens: 32768,
    },
    {
        id: "gpt-5.4-medium",
        name: "GPT-5.4 1M",
        reasoning: true,
        contextWindow: 1000000,
        maxTokens: 32768,
    },
    {
        id: "gpt-5.4-high",
        name: "GPT-5.4 1M High",
        reasoning: true,
        contextWindow: 1000000,
        maxTokens: 32768,
    },
    {
        id: "gpt-5.4-xhigh",
        name: "GPT-5.4 1M Extra High",
        reasoning: true,
        contextWindow: 1000000,
        maxTokens: 32768,
    },
    {
        id: "gpt-5.4-medium-fast",
        name: "GPT-5.4 Fast",
        reasoning: true,
        contextWindow: 1000000,
        maxTokens: 32768,
    },
    {
        id: "gpt-5.4-high-fast",
        name: "GPT-5.4 High Fast",
        reasoning: true,
        contextWindow: 1000000,
        maxTokens: 32768,
    },
    {
        id: "gpt-5.4-xhigh-fast",
        name: "GPT-5.4 Extra High Fast",
        reasoning: true,
        contextWindow: 1000000,
        maxTokens: 32768,
    },
    {
        id: "gpt-5.4-mini-none",
        name: "GPT-5.4 Mini None",
        reasoning: false,
        contextWindow: 200000,
        maxTokens: 32768,
    },
    {
        id: "gpt-5.4-mini-low",
        name: "GPT-5.4 Mini Low",
        reasoning: true,
        contextWindow: 200000,
        maxTokens: 32768,
    },
    {
        id: "gpt-5.4-mini-medium",
        name: "GPT-5.4 Mini",
        reasoning: true,
        contextWindow: 200000,
        maxTokens: 32768,
    },
    {
        id: "gpt-5.4-mini-high",
        name: "GPT-5.4 Mini High",
        reasoning: true,
        contextWindow: 200000,
        maxTokens: 32768,
    },
    {
        id: "gpt-5.4-mini-xhigh",
        name: "GPT-5.4 Mini Extra High",
        reasoning: true,
        contextWindow: 200000,
        maxTokens: 32768,
    },
    {
        id: "gpt-5.4-nano-none",
        name: "GPT-5.4 Nano None",
        reasoning: false,
        contextWindow: 200000,
        maxTokens: 32768,
    },
    {
        id: "gpt-5.4-nano-low",
        name: "GPT-5.4 Nano Low",
        reasoning: true,
        contextWindow: 200000,
        maxTokens: 32768,
    },
    {
        id: "gpt-5.4-nano-medium",
        name: "GPT-5.4 Nano",
        reasoning: true,
        contextWindow: 200000,
        maxTokens: 32768,
    },
    {
        id: "gpt-5.4-nano-high",
        name: "GPT-5.4 Nano High",
        reasoning: true,
        contextWindow: 200000,
        maxTokens: 32768,
    },
    {
        id: "gpt-5.4-nano-xhigh",
        name: "GPT-5.4 Nano Extra High",
        reasoning: true,
        contextWindow: 200000,
        maxTokens: 32768,
    },
    {
        id: "gpt-5-mini",
        name: "GPT-5 Mini",
        reasoning: false,
        contextWindow: 200000,
        maxTokens: 32768,
    },

    // GPT-5.3
    {
        id: "gpt-5.3-codex-low",
        name: "Codex 5.3 Low",
        reasoning: true,
        contextWindow: 200000,
        maxTokens: 32768,
    },
    {
        id: "gpt-5.3-codex",
        name: "Codex 5.3",
        reasoning: true,
        contextWindow: 200000,
        maxTokens: 32768,
    },
    {
        id: "gpt-5.3-codex-high",
        name: "Codex 5.3 High",
        reasoning: true,
        contextWindow: 200000,
        maxTokens: 32768,
    },
    {
        id: "gpt-5.3-codex-xhigh",
        name: "Codex 5.3 Extra High",
        reasoning: true,
        contextWindow: 200000,
        maxTokens: 32768,
    },
    {
        id: "gpt-5.3-codex-low-fast",
        name: "Codex 5.3 Low Fast",
        reasoning: true,
        contextWindow: 200000,
        maxTokens: 32768,
    },
    {
        id: "gpt-5.3-codex-fast",
        name: "Codex 5.3 Fast",
        reasoning: true,
        contextWindow: 200000,
        maxTokens: 32768,
    },
    {
        id: "gpt-5.3-codex-high-fast",
        name: "Codex 5.3 High Fast",
        reasoning: true,
        contextWindow: 200000,
        maxTokens: 32768,
    },
    {
        id: "gpt-5.3-codex-xhigh-fast",
        name: "Codex 5.3 Extra High Fast",
        reasoning: true,
        contextWindow: 200000,
        maxTokens: 32768,
    },
    {
        id: "gpt-5.3-codex-spark-preview-low",
        name: "Codex 5.3 Spark Low",
        reasoning: true,
        contextWindow: 200000,
        maxTokens: 32768,
    },
    {
        id: "gpt-5.3-codex-spark-preview",
        name: "Codex 5.3 Spark",
        reasoning: true,
        contextWindow: 200000,
        maxTokens: 32768,
    },
    {
        id: "gpt-5.3-codex-spark-preview-high",
        name: "Codex 5.3 Spark High",
        reasoning: true,
        contextWindow: 200000,
        maxTokens: 32768,
    },
    {
        id: "gpt-5.3-codex-spark-preview-xhigh",
        name: "Codex 5.3 Spark Extra High",
        reasoning: true,
        contextWindow: 200000,
        maxTokens: 32768,
    },

    // GPT-5.2
    {
        id: "gpt-5.2-low",
        name: "GPT-5.2 Low",
        reasoning: true,
        contextWindow: 200000,
        maxTokens: 32768,
    },
    {
        id: "gpt-5.2",
        name: "GPT-5.2",
        reasoning: true,
        contextWindow: 200000,
        maxTokens: 32768,
    },
    {
        id: "gpt-5.2-high",
        name: "GPT-5.2 High",
        reasoning: true,
        contextWindow: 200000,
        maxTokens: 32768,
    },
    {
        id: "gpt-5.2-xhigh",
        name: "GPT-5.2 Extra High",
        reasoning: true,
        contextWindow: 200000,
        maxTokens: 32768,
    },
    {
        id: "gpt-5.2-low-fast",
        name: "GPT-5.2 Low Fast",
        reasoning: true,
        contextWindow: 200000,
        maxTokens: 32768,
    },
    {
        id: "gpt-5.2-fast",
        name: "GPT-5.2 Fast",
        reasoning: true,
        contextWindow: 200000,
        maxTokens: 32768,
    },
    {
        id: "gpt-5.2-high-fast",
        name: "GPT-5.2 High Fast",
        reasoning: true,
        contextWindow: 200000,
        maxTokens: 32768,
    },
    {
        id: "gpt-5.2-xhigh-fast",
        name: "GPT-5.2 Extra High Fast",
        reasoning: true,
        contextWindow: 200000,
        maxTokens: 32768,
    },
    {
        id: "gpt-5.2-codex-low",
        name: "Codex 5.2 Low",
        reasoning: true,
        contextWindow: 200000,
        maxTokens: 32768,
    },
    {
        id: "gpt-5.2-codex",
        name: "Codex 5.2",
        reasoning: true,
        contextWindow: 200000,
        maxTokens: 32768,
    },
    {
        id: "gpt-5.2-codex-high",
        name: "Codex 5.2 High",
        reasoning: true,
        contextWindow: 200000,
        maxTokens: 32768,
    },
    {
        id: "gpt-5.2-codex-xhigh",
        name: "Codex 5.2 Extra High",
        reasoning: true,
        contextWindow: 200000,
        maxTokens: 32768,
    },
    {
        id: "gpt-5.2-codex-low-fast",
        name: "Codex 5.2 Low Fast",
        reasoning: true,
        contextWindow: 200000,
        maxTokens: 32768,
    },
    {
        id: "gpt-5.2-codex-fast",
        name: "Codex 5.2 Fast",
        reasoning: true,
        contextWindow: 200000,
        maxTokens: 32768,
    },
    {
        id: "gpt-5.2-codex-high-fast",
        name: "Codex 5.2 High Fast",
        reasoning: true,
        contextWindow: 200000,
        maxTokens: 32768,
    },
    {
        id: "gpt-5.2-codex-xhigh-fast",
        name: "Codex 5.2 Extra High Fast",
        reasoning: true,
        contextWindow: 200000,
        maxTokens: 32768,
    },

    // GPT-5.1
    {
        id: "gpt-5.1-low",
        name: "GPT-5.1 Low",
        reasoning: true,
        contextWindow: 200000,
        maxTokens: 32768,
    },
    {
        id: "gpt-5.1",
        name: "GPT-5.1",
        reasoning: true,
        contextWindow: 200000,
        maxTokens: 32768,
    },
    {
        id: "gpt-5.1-high",
        name: "GPT-5.1 High",
        reasoning: true,
        contextWindow: 200000,
        maxTokens: 32768,
    },
    {
        id: "gpt-5.1-codex-max-low",
        name: "Codex 5.1 Max Low",
        reasoning: true,
        contextWindow: 200000,
        maxTokens: 32768,
    },
    {
        id: "gpt-5.1-codex-max-medium",
        name: "Codex 5.1 Max",
        reasoning: true,
        contextWindow: 200000,
        maxTokens: 32768,
    },
    {
        id: "gpt-5.1-codex-max-high",
        name: "Codex 5.1 Max High",
        reasoning: true,
        contextWindow: 200000,
        maxTokens: 32768,
    },
    {
        id: "gpt-5.1-codex-max-xhigh",
        name: "Codex 5.1 Max Extra High",
        reasoning: true,
        contextWindow: 200000,
        maxTokens: 32768,
    },
    {
        id: "gpt-5.1-codex-max-low-fast",
        name: "Codex 5.1 Max Low Fast",
        reasoning: true,
        contextWindow: 200000,
        maxTokens: 32768,
    },
    {
        id: "gpt-5.1-codex-max-medium-fast",
        name: "Codex 5.1 Max Medium Fast",
        reasoning: true,
        contextWindow: 200000,
        maxTokens: 32768,
    },
    {
        id: "gpt-5.1-codex-max-high-fast",
        name: "Codex 5.1 Max High Fast",
        reasoning: true,
        contextWindow: 200000,
        maxTokens: 32768,
    },
    {
        id: "gpt-5.1-codex-max-xhigh-fast",
        name: "Codex 5.1 Max Extra High Fast",
        reasoning: true,
        contextWindow: 200000,
        maxTokens: 32768,
    },
    {
        id: "gpt-5.1-codex-mini-low",
        name: "Codex 5.1 Mini Low",
        reasoning: true,
        contextWindow: 200000,
        maxTokens: 32768,
    },
    {
        id: "gpt-5.1-codex-mini",
        name: "Codex 5.1 Mini",
        reasoning: true,
        contextWindow: 200000,
        maxTokens: 32768,
    },
    {
        id: "gpt-5.1-codex-mini-high",
        name: "Codex 5.1 Mini High",
        reasoning: true,
        contextWindow: 200000,
        maxTokens: 32768,
    },

    // Claude Opus
    {
        id: "claude-opus-4-7-low",
        name: "Opus 4.7 1M Low",
        reasoning: false,
        contextWindow: 1000000,
        maxTokens: 32000,
    },
    {
        id: "claude-opus-4-7-medium",
        name: "Opus 4.7 1M Medium",
        reasoning: false,
        contextWindow: 1000000,
        maxTokens: 32000,
    },
    {
        id: "claude-opus-4-7-high",
        name: "Opus 4.7 1M High",
        reasoning: false,
        contextWindow: 1000000,
        maxTokens: 32000,
    },
    {
        id: "claude-opus-4-7-xhigh",
        name: "Opus 4.7 1M",
        reasoning: false,
        contextWindow: 1000000,
        maxTokens: 32000,
    },
    {
        id: "claude-opus-4-7-max",
        name: "Opus 4.7 1M Max",
        reasoning: false,
        contextWindow: 1000000,
        maxTokens: 32000,
    },
    {
        id: "claude-opus-4-7-thinking-low",
        name: "Opus 4.7 1M Low Thinking",
        reasoning: true,
        contextWindow: 1000000,
        maxTokens: 32000,
    },
    {
        id: "claude-opus-4-7-thinking-medium",
        name: "Opus 4.7 1M Medium Thinking",
        reasoning: true,
        contextWindow: 1000000,
        maxTokens: 32000,
    },
    {
        id: "claude-opus-4-7-thinking-high",
        name: "Opus 4.7 1M High Thinking",
        reasoning: true,
        contextWindow: 1000000,
        maxTokens: 32000,
    },
    {
        id: "claude-opus-4-7-thinking-xhigh",
        name: "Opus 4.7 1M Thinking",
        reasoning: true,
        contextWindow: 1000000,
        maxTokens: 32000,
    },
    {
        id: "claude-opus-4-7-thinking-max",
        name: "Opus 4.7 1M Max Thinking",
        reasoning: true,
        contextWindow: 1000000,
        maxTokens: 32000,
    },
    {
        id: "claude-4.6-opus-high",
        name: "Opus 4.6 1M",
        reasoning: false,
        contextWindow: 1000000,
        maxTokens: 32000,
    },
    {
        id: "claude-4.6-opus-max",
        name: "Opus 4.6 1M Max",
        reasoning: false,
        contextWindow: 1000000,
        maxTokens: 32000,
    },
    {
        id: "claude-4.6-opus-high-thinking",
        name: "Opus 4.6 1M Thinking",
        reasoning: true,
        contextWindow: 1000000,
        maxTokens: 32000,
    },
    {
        id: "claude-4.6-opus-max-thinking",
        name: "Opus 4.6 1M Max Thinking",
        reasoning: true,
        contextWindow: 1000000,
        maxTokens: 32000,
    },
    {
        id: "claude-4.6-opus-high-thinking-fast",
        name: "Opus 4.6 1M Thinking Fast",
        reasoning: true,
        contextWindow: 1000000,
        maxTokens: 32000,
    },
    {
        id: "claude-4.6-opus-max-thinking-fast",
        name: "Opus 4.6 1M Max Thinking Fast",
        reasoning: true,
        contextWindow: 1000000,
        maxTokens: 32000,
    },
    {
        id: "claude-4.5-opus-high",
        name: "Opus 4.5",
        reasoning: false,
        contextWindow: 200000,
        maxTokens: 32000,
    },
    {
        id: "claude-4.5-opus-high-thinking",
        name: "Opus 4.5 Thinking",
        reasoning: true,
        contextWindow: 200000,
        maxTokens: 32000,
    },

    // Claude Sonnet
    {
        id: "claude-4.6-sonnet-medium",
        name: "Sonnet 4.6 1M",
        reasoning: false,
        contextWindow: 1000000,
        maxTokens: 32000,
    },
    {
        id: "claude-4.6-sonnet-medium-thinking",
        name: "Sonnet 4.6 1M Thinking",
        reasoning: true,
        contextWindow: 1000000,
        maxTokens: 32000,
    },
    {
        id: "claude-4.5-sonnet",
        name: "Sonnet 4.5 1M",
        reasoning: false,
        contextWindow: 1000000,
        maxTokens: 32000,
    },
    {
        id: "claude-4.5-sonnet-thinking",
        name: "Sonnet 4.5 1M Thinking",
        reasoning: true,
        contextWindow: 1000000,
        maxTokens: 32000,
    },
    {
        id: "claude-4-sonnet",
        name: "Sonnet 4",
        reasoning: false,
        contextWindow: 200000,
        maxTokens: 32000,
    },
    {
        id: "claude-4-sonnet-thinking",
        name: "Sonnet 4 Thinking",
        reasoning: true,
        contextWindow: 200000,
        maxTokens: 32000,
    },
    {
        id: "claude-4-sonnet-1m",
        name: "Sonnet 4 1M",
        reasoning: false,
        contextWindow: 1000000,
        maxTokens: 32000,
    },
    {
        id: "claude-4-sonnet-1m-thinking",
        name: "Sonnet 4 1M Thinking",
        reasoning: true,
        contextWindow: 1000000,
        maxTokens: 32000,
    },

    // Gemini
    {
        id: "gemini-3.1-pro",
        name: "Gemini 3.1 Pro",
        reasoning: false,
        contextWindow: 1000000,
        maxTokens: 65536,
    },
    {
        id: "gemini-3-flash",
        name: "Gemini 3 Flash",
        reasoning: false,
        contextWindow: 1000000,
        maxTokens: 65536,
    },

    // Grok
    {
        id: "grok-4-20",
        name: "Grok 4.20",
        reasoning: false,
        contextWindow: 131072,
        maxTokens: 32768,
    },
    {
        id: "grok-4-20-thinking",
        name: "Grok 4.20 Thinking",
        reasoning: true,
        contextWindow: 131072,
        maxTokens: 32768,
    },

    // Kimi
    {
        id: "kimi-k2.5",
        name: "Kimi K2.5",
        reasoning: false,
        contextWindow: 200000,
        maxTokens: 32768,
    },
];

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
    grok: {
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
const mappedReasoningCursorIds = new Set<string>();
for (const [canonicalId, variants] of Object.entries(MODEL_MAP)) {
    if (variants.default)
        cursorDefaultToCanonical.set(variants.default, canonicalId);
    for (const cursorId of Object.values(variants)) {
        if (cursorId) allMappedCursorIds.add(cursorId);
    }
    for (const level of [
        "minimal",
        "low",
        "medium",
        "high",
        "xhigh",
    ] satisfies ReasoningLevel[]) {
        const cursorId = variants[level];
        if (cursorId) mappedReasoningCursorIds.add(cursorId);
    }
}

function isReasoningModelId(id: string): boolean {
    return THINKING_VARIANT_RE.test(id) || mappedReasoningCursorIds.has(id);
}

for (const model of STATIC_MODELS) {
    model.reasoning = model.reasoning || isReasoningModelId(model.id);
}

/** Fast lookup: static model id → definition */
const STATIC_MODELS_MAP = new Map<string, CursorModelDef>(
    STATIC_MODELS.map((m) => [m.id, m]),
);

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
export function toCursorId(canonicalId: string, reasoning?: string): string {
    const family = MODEL_MAP[canonicalId];
    if (!family) return canonicalId;
    const level = reasoning as ReasoningLevel | undefined;
    const variant = level && family[level];
    return variant ?? family.default ?? canonicalId;
}

function hasReasoningVariants(canonicalId: string): boolean {
    const family = MODEL_MAP[canonicalId];
    if (!family) return false;
    return Boolean(
        family.minimal ||
            family.low ||
            family.medium ||
            family.high ||
            family.xhigh,
    );
}

/** Timeout (ms) for `agent models` discovery call. */
const DISCOVERY_TIMEOUT_MS = 15_000;

/** Infer the `reasoning` flag for a model that is not in the static list. */
function inferReasoning(id: string): boolean {
    return isReasoningModelId(id);
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
    const lineRe =
        /^([a-zA-Z0-9][a-zA-Z0-9._-]*)\s+-\s+(.+?)(?:\s+\((?:current|default|current,\s*default)\))?$/;

    for (const line of output.split("\n")) {
        const trimmed = line.trim();
        if (
            !trimmed ||
            trimmed.startsWith("Available") ||
            trimmed.startsWith("Tip:")
        )
            continue;
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
export function runAgentModels(agentPath: string): Promise<CursorModelDef[]> {
    return new Promise((resolve, reject) => {
        const args = ["models"];
        if (process.env.CURSOR_API_KEY) {
            args.unshift("--api-key", process.env.CURSOR_API_KEY);
        }

        let stdout = "";
        let stderr = "";
        const child = spawn(agentPath, args, {
            stdio: ["ignore", "pipe", "pipe"],
            env: process.env,
        });

        const timeout = setTimeout(() => {
            child.kill("SIGTERM");
            reject(
                new Error(
                    `agent models timed out after ${DISCOVERY_TIMEOUT_MS}ms`,
                ),
            );
        }, DISCOVERY_TIMEOUT_MS);

        child.stdout?.on("data", (chunk: Buffer) => {
            stdout += chunk.toString();
        });
        child.stderr?.on("data", (chunk: Buffer) => {
            stderr += chunk.toString();
        });

        child.on("error", (err) => {
            clearTimeout(timeout);
            reject(err);
        });

        child.on("close", (code) => {
            clearTimeout(timeout);
            if (code !== 0) {
                reject(
                    new Error(
                        `agent models exited with code ${code}: ${stderr.trim()}`,
                    ),
                );
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

/**
 * Build a ProviderModelConfig array from a list of CursorModelDef entries.
 * Uses canonical IDs where a mapping exists and omits variant-only entries.
 */
export function toProviderModels(defs: CursorModelDef[]) {
    const seen = new Set<string>();
    return defs.flatMap((m) => {
        const canonicalId = toCanonicalId(m.id);
        if (canonicalId === null) return [];
        const id = canonicalId !== m.id ? canonicalId : m.id;
        if (seen.has(id)) return [];
        seen.add(id);
        return [
            {
                id,
                name: `${m.name} (Cursor)`,
                reasoning: m.reasoning || hasReasoningVariants(id),
                input: ["text"] as ("text" | "image")[],
                cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
                contextWindow: m.contextWindow,
                maxTokens: m.maxTokens,
            },
        ];
    });
}

import type { Theme } from "@mariozechner/pi-coding-agent";

export interface CursorToolCallPayload {
    args: Record<string, unknown>;
    result?: Record<string, unknown> & {
        success?: Record<string, unknown>;
        rejected?: { reason?: string };
        error?: { message?: string };
    };
}

type ThemeLike = Pick<Theme, "bg" | "bold" | "fg">;

const FALLBACK_THEME: ThemeLike = {
    bg: (_color, text) => text,
    bold: (text) => text,
    fg: (_color, text) => text,
};

const TOOL_NAME_MAP: Record<string, string> = {
    shellToolCall: "bash",
    readToolCall: "read",
    editToolCall: "edit",
    writeToolCall: "write",
    deleteToolCall: "delete",
    grepToolCall: "grep",
    globToolCall: "glob",
    lsToolCall: "ls",
    todoToolCall: "todo",
    updateTodosToolCall: "updateTodos",
    findToolCall: "find",
    webFetchToolCall: "webFetch",
    webSearchToolCall: "webSearch",
};

let theme: ThemeLike = FALLBACK_THEME;

export function setRendererTheme(nextTheme?: ThemeLike): void {
    theme = nextTheme ?? FALLBACK_THEME;
}

export function toPiToolName(cliKey: string): string {
    return TOOL_NAME_MAP[cliKey] ?? cliKey.replace(/ToolCall$/, "");
}

function getString(value: unknown): string | null {
    if (typeof value === "string") return value;
    if (typeof value === "number" || typeof value === "boolean") {
        return String(value);
    }
    return null;
}

function getRecord(value: unknown): Record<string, unknown> | undefined {
    return value != null && typeof value === "object" ? (value as Record<string, unknown>) : undefined;
}

function getArray(value: unknown): unknown[] | undefined {
    return Array.isArray(value) ? value : undefined;
}

function getTodoItems(value: unknown): Record<string, unknown>[] {
    return (getArray(value) ?? [])
        .map((item) => getRecord(item))
        .filter((item): item is Record<string, unknown> => Boolean(item));
}

function normalizeTodoStatus(value: unknown): {
    color: "error" | "muted" | "success" | "warning";
    label: string;
    marker: string;
} {
    const raw = getString(value)?.trim();
    const normalized = raw?.replace(/^TODO_STATUS_/, "").toLowerCase();

    switch (normalized) {
        case "completed":
            return { color: "success", label: "completed", marker: "[x]" };
        case "in_progress":
            return { color: "warning", label: "in progress", marker: "[>]" };
        case "pending":
            return { color: "muted", label: "pending", marker: "[ ]" };
        case "cancelled":
            return { color: "error", label: "cancelled", marker: "[-]" };
        default:
            return {
                color: "warning",
                label: raw?.replace(/^TODO_STATUS_/, "") || "unknown",
                marker: "[?]",
            };
    }
}

function formatTodoTitle(toolName: "todo" | "updateTodos", args: Record<string, unknown>): string | null {
    const todos = getTodoItems(args.todos);
    if (!todos.length) return null;

    const countLabel = `${todos.length} ${todos.length === 1 ? "item" : "items"}`;
    const mergeLabel =
        toolName === "updateTodos" ? theme.fg("muted", args.merge === true ? " (merge)" : " (replace)") : "";

    return `${theme.fg("toolTitle", theme.bold(toolName))} ${theme.fg("accent", countLabel)}${mergeLabel}`;
}

function formatTodoResultLines(payload: CursorToolCallPayload): {
    isError: boolean;
    lines: string[];
} {
    const success = payload.result?.success;
    const todos = getTodoItems(success?.todos ?? payload.args?.todos);
    if (!todos.length) {
        return { isError: false, lines: [theme.fg("muted", "No todo items.")] };
    }

    const maxVisible = 8;
    const lines = todos.slice(0, maxVisible).map((todo, index) => {
        const status = normalizeTodoStatus(todo.status);
        const content = getString(todo.content)?.trim() || getString(todo.id)?.trim() || `Todo ${index + 1}`;
        const id = getString(todo.id)?.trim();
        const dependencies = getArray(todo.dependencies)?.length ?? 0;

        let line = `${theme.fg(status.color, status.marker)} ${theme.fg("toolOutput", content)}`;

        if (id && id !== content) {
            line += theme.fg("muted", ` (${id})`);
        }

        if (dependencies > 0) {
            line += theme.fg("muted", ` deps:${dependencies}`);
        }

        if (status.label !== "pending") {
            line += theme.fg("muted", ` ${status.label}`);
        }

        return line;
    });

    if (todos.length > maxVisible) {
        lines.push(theme.fg("muted", `... (${todos.length - maxVisible} more items)`));
    }

    return { isError: false, lines };
}

function shortenDisplayPath(value: unknown, maxLength = 60): string | null {
    const path = getString(value);
    if (path == null) return null;
    if (path.length <= maxLength) return path;
    const normalized = path.replace(/\\/g, "/");
    const parts = normalized.split("/");
    if (parts.length <= 3) return `${normalized.slice(0, maxLength - 3)}...`;
    return `.../${parts.slice(-3).join("/")}`;
}

function invalidArgLabel(): string {
    return theme.fg("error", "[invalid arg]");
}

function previewText(text: string, maxChars = 140): string {
    return text.length > maxChars ? `${text.slice(0, maxChars - 3)}...` : text;
}

function formatToolCallTitle(toolName: string, args: Record<string, unknown>): string {
    switch (toolName) {
        case "bash": {
            const command = getString(args.command);
            const commandDisplay =
                command == null ? invalidArgLabel() : command ? command : theme.fg("toolOutput", "...");
            return theme.fg("toolTitle", theme.bold(`$ ${commandDisplay}`));
        }
        case "read": {
            const path = shortenDisplayPath(args.path);
            let pathDisplay =
                path == null ? invalidArgLabel() : path ? theme.fg("accent", path) : theme.fg("toolOutput", "...");
            const offset = args.offset;
            const limit = args.limit;
            if (typeof offset === "number" || typeof limit === "number") {
                const startLine = typeof offset === "number" ? offset : 1;
                const endLine = typeof limit === "number" ? `${startLine + limit - 1}` : "";
                pathDisplay += theme.fg("warning", `:${startLine}${endLine ? `-${endLine}` : ""}`);
            }
            return `${theme.fg("toolTitle", theme.bold("read"))} ${pathDisplay}`;
        }
        case "edit":
        case "write":
        case "delete":
        case "ls": {
            const path = shortenDisplayPath(args.path);
            const pathDisplay =
                path == null ? invalidArgLabel() : path ? theme.fg("accent", path) : theme.fg("toolOutput", "...");
            return `${theme.fg("toolTitle", theme.bold(toolName))} ${pathDisplay}`;
        }
        case "grep":
        case "find": {
            const pattern = getString(args.pattern);
            const path = shortenDisplayPath(args.path ?? ".");
            let text =
                theme.fg("toolTitle", theme.bold(toolName)) +
                " " +
                (pattern == null
                    ? invalidArgLabel()
                    : theme.fg("accent", toolName === "grep" ? `/${pattern}/` : pattern)) +
                theme.fg("toolOutput", ` in ${path == null ? invalidArgLabel() : path}`);
            const glob = getString(args.glob);
            if (glob) text += theme.fg("toolOutput", ` (${glob})`);
            return text;
        }
        case "glob": {
            const pattern = getString(args.globPattern);
            const path = shortenDisplayPath(args.targetDirectory ?? ".");
            const text =
                theme.fg("toolTitle", theme.bold(toolName)) +
                " " +
                (pattern == null ? invalidArgLabel() : theme.fg("accent", pattern)) +
                theme.fg("toolOutput", ` in ${path == null ? invalidArgLabel() : path}`);
            return text;
        }
        case "webFetch":
        case "webSearch": {
            const summary =
                getString(args.path) ??
                getString(args.url) ??
                getString(args.searchTerm) ??
                getString(args.query) ??
                previewText(JSON.stringify(args));
            return `${theme.fg("toolTitle", theme.bold(toolName))} ${theme.fg("accent", summary)}`;
        }
        case "todo":
        case "updateTodos":
            return (
                formatTodoTitle(toolName, args) ??
                `${theme.fg("toolTitle", theme.bold(toolName))} ${theme.fg("toolOutput", previewText(JSON.stringify(args)))}`
            );
        default:
            return `${theme.fg("toolTitle", theme.bold(toolName))} ${theme.fg("toolOutput", previewText(JSON.stringify(args)))}`;
    }
}

function trimTrailingEmptyLines(lines: string[]): string[] {
    let end = lines.length;
    while (end > 0 && lines[end - 1] === "") {
        end -= 1;
    }
    return lines.slice(0, end);
}

function stylePreviewLines(lines: string[], maxLines: number): { lines: string[]; remaining: number } {
    const trimmed = trimTrailingEmptyLines(lines);
    const visible = trimmed.slice(0, maxLines).map((line) => theme.fg("toolOutput", line));
    return {
        lines: visible,
        remaining: Math.max(0, trimmed.length - maxLines),
    };
}

function styleDiffLine(line: string): string {
    if (line.startsWith("@@")) {
        return theme.fg("warning", line);
    }
    if (line.startsWith("+++")) {
        return theme.fg("accent", line);
    }
    if (line.startsWith("---")) {
        return theme.fg("muted", line);
    }
    if (line.startsWith("+")) {
        return theme.fg("success", line);
    }
    if (line.startsWith("-")) {
        return theme.fg("error", line);
    }
    return theme.fg("toolOutput", line);
}

function styleDiffLines(text: string, maxLines: number): { lines: string[]; remaining: number } {
    const trimmed = trimTrailingEmptyLines(text.split("\n"));
    return {
        lines: trimmed.slice(0, maxLines).map(styleDiffLine),
        remaining: Math.max(0, trimmed.length - maxLines),
    };
}

function formatToolResultLines(
    toolName: string,
    payload: CursorToolCallPayload,
): { isError: boolean; lines: string[] } {
    const result = payload.result;
    const fileNotFound = getRecord(result?.fileNotFound);
    if (fileNotFound) {
        const path = getString(fileNotFound.path);
        return {
            isError: true,
            lines: [theme.fg("error", path ? `File not found: ${path}` : "File not found.")],
        };
    }

    const rejectedReason = payload.result?.rejected?.reason;
    if (rejectedReason) {
        return { isError: true, lines: [theme.fg("error", rejectedReason)] };
    }

    const errorMessage = payload.result?.error?.message;
    if (errorMessage) {
        return { isError: true, lines: [theme.fg("error", errorMessage)] };
    }

    const success = payload.result?.success;
    if (!success) {
        return { isError: false, lines: [] };
    }

    if (toolName === "bash") {
        const exitCode = typeof success.exitCode === "number" ? success.exitCode : undefined;
        const output =
            getString(success.interleavedOutput) ??
            [getString(success.stdout), getString(success.stderr)]
                .filter((value): value is string => Boolean(value))
                .join("");
        const { lines, remaining } = stylePreviewLines(output.split("\n"), 5);
        if (exitCode != null && exitCode !== 0) {
            lines.unshift(theme.fg("error", `[exit ${exitCode}]`));
        }
        if (remaining > 0) {
            lines.push(theme.fg("muted", `... (${remaining} more lines)`));
        }
        return {
            isError: exitCode != null && exitCode !== 0,
            lines,
        };
    }

    if (toolName === "read") {
        const content = getString(success.content) ?? "";
        const { lines, remaining } = stylePreviewLines(content.split("\n"), 10);
        if (!lines.length && success.isEmpty === true) {
            lines.push(theme.fg("muted", "File is empty."));
        }
        if (remaining > 0) {
            lines.push(theme.fg("muted", `... (${remaining} more lines)`));
        }
        return { isError: false, lines };
    }

    if (toolName === "edit") {
        const diffString = getString(success.diffString);
        if (diffString) {
            const { lines, remaining } = styleDiffLines(diffString, 12);
            if (remaining > 0) {
                lines.push(theme.fg("muted", `... (${remaining} more lines)`));
            }
            return { isError: false, lines };
        }
    }

    if (toolName === "todo" || toolName === "updateTodos") {
        return formatTodoResultLines(payload);
    }

    const genericText =
        getString(success.content) ??
        getString(success.output) ??
        getString(success.stdout) ??
        getString(success.message);
    if (genericText) {
        const { lines, remaining } = stylePreviewLines(genericText.split("\n"), 5);
        if (remaining > 0) {
            lines.push(theme.fg("muted", `... (${remaining} more lines)`));
        }
        return { isError: false, lines };
    }

    return { isError: false, lines: [""] };
}

function renderToolBlock(title: string, bodyLines: string[] = []): string {
    const blockLines: string[] = [];

    blockLines.push("");
    blockLines.push(`  ${title}`);
    let hasBody = false;
    if (bodyLines.length > 0) {
        // blockLines.push(""); // separator between title and body
        for (const line of bodyLines) {
            if (line.length === 0) {
                continue;
            }

            hasBody = true;
            blockLines.push(`  ${line}`);
        }

        if (hasBody) {
            blockLines.push("");
        }
    }

    return `${blockLines.join("\n")}\n`;
}

export function renderCompletedToolCall(cliKey: string, payload: CursorToolCallPayload): string {
    const toolName = toPiToolName(cliKey);
    const title = formatToolCallTitle(toolName, payload.args ?? {});
    const { lines } = formatToolResultLines(toolName, payload);
    return renderToolBlock(title, lines);
}

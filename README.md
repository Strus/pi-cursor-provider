<p align="center">
  <img src="./header.jpeg" alt="Pi x Cursor image" width="400" />
</p>

# pi-cursor-cli-provider

<p align="left">
  <a href="https://www.npmjs.com/package/@akepka/pi-cursor-cli-provider">
    <img src="https://img.shields.io/npm/v/%40akepka%2Fpi-cursor-cli-provider" alt="npm version" />
  </a>
</p>


A [Pi Coding Agent](https://github.com/badlogic/pi-mono) custom provider that routes model requests through the **Cursor
CLI**, enabling you to use your Cursor subscription inside Pi.

This project is heavily modified fork of [netandreus/pi-cursor-provider](https://github.com/netandreus/pi-cursor-provider)

# Motivation

(if you don't feel like reading all this, go straight to [Installation](#installation))

I spend a long time looking for a proper Cursor provider for Pi, but the ones that were working best were too "hacky" in
my opinion - they used the reverse-engineered API to call Cursor endpoints directly, masquarading as legit Cursor CLI.
They also had various issues - like not passing system prompt properly.

I've also tried to write my own extension based on the [ACP protocol](https://agentcommunicationprotocol.dev/) - and I
even did do it to a point where I could use Cursor with it - but Cursor's do not expose all models through ACP! And the
ones they do expose are exposed only in one variant - ex. only with "medium" thinking. This makes this apporach in my
opinion unusable.

After all that I stumbled upon [netandreus/pi-cursor-provider](https://github.com/netandreus/pi-cursor-provider). It
worked, and most importantly, it used the legit Cursor CLI without any hacks. But it wasn't super polished - tool calls
rendering was basically just raw text, all session history was send as prompt on every turn, images were not supported
etc. But the idea was cool, so I decided to build on top of it.

# Installation

### npm

```bash
pi install npm:@akepka/pi-cursor-cli-provider
```

### git

```bash
pi install git:github.com/Strus/pi-cursor-cli-provider
```

For the extension to work **you need to have [Cursor CLI](https://cursor.com/docs/cli/installation) installed and
authenticated**. Auth can be done either with `agent login` command or with token generated from Cursor dashboard and set
as `CURSOR_API_KEY` env variable. See [Cursor CLI docs](https://cursor.com/docs/cli/reference/authentication) for more
information.

# Usage

Just start Pi and everything should work. Models are auto-discovered upon start, so you can choose them with
`/models` or `/scoped-models` as usual. Pi thinking effort settings are mapped to Cursor model names - you choose the base
model name and set thinking level with `shift-tab` like you would normally do.

# How it works

Each Pi turn spawns a Cursor Agent CLI subprocess. The first turn sends the full Pi transcript; later turns resume the
saved Cursor chat session and send only the newest user prompt:

```bash
agent --print --yolo --output-format stream-json --model <id> --trust --workspace <cwd> "<full prompt>"

# later turns agent
agent --print --yolo --output-format stream-json --model <id> --resume <session-id> --trust --workspace <cwd> "<latest user prompt>"
```

Cursor session IDs are saved and associated with Pi session IDs - thanks to that even if you resume the Pi session,
provider does not need to send it to Cursor CLI, but can resume Cursor session too.

The CLI's NDJSON stdout is read line-by-line, and it's output is mapped (when possible) to Pi native rendering elements
(ex. thinking blocks).

Cursor CLI supports images when you provide a file path to them, so images pasted to Pi are supported out-of-the-box, as
Pi provides the path to a temporary file when you paste an image. In non-interactive mode if prompt contains a blob of
image data, that data is saved as a temporary file, and then path to that file is passed to the Cursor CLI.

# Installing and enabling MCP tools in Cursor Agent for Pi

To use Pi-related MCP tools (e.g. `pi-auto`) when the Cursor Agent runs on behalf of Pi, connect the MCP server, enable
it for the agent, and allow its tools in the CLI config.

### 1. Connect MCP server to agent

Add the server to `~/.cursor/mcp.json`. Example for `pi-auto`:

```json
{
  "mcpServers": {
      "pi-auto": {
          "command": "pi-auto-mcp",
          "lifecycle": "keep-alive",
          "directTools": true
      }
  }
}
```

### 2. Enable the MCP server

List MCP servers; new ones need approval:

```bash
agent mcp list

# Example output: pi-auto: not loaded (needs approval)
```

Enable and approve the server:

```bash
agent mcp enable pi-auto

# Example output: ✓ Enabled and approved MCP server: pi-auto
```

Verify tools are available:

```bash
agent mcp list-tools pi-auto
```

Example output:

```
Tools for pi-auto (8):
- pi_get_priority ()
- pi_get_provider (scope, projectPath)
- pi_get_strategy ()
- pi_get_usage (period)
- pi_set_priority (priority)
- pi_set_provider (provider, model, scope, projectPath)
- pi_set_strategy (strategy)
- pi_suggest_provider (period)
```

### 3. Allow tools from this MCP

Ensure `~/.cursor/cli-config.json` allows the MCP tools. For example:

```json
"permissions": {
  "allow": [ "Shell(ls)", "Mcp(pi-auto:*)" ],
  "deny": []
}
```

`Mcp(pi-auto:*)` lets the agent use any tool from the `pi-auto` server.

# Possible improvements

### Better tool calls rendering

Tool calls are not natively rendered (see [Limitations](#limitations) section). I couldn't find a way to mimick native
rendering because Pi does not expose terminal properties required to do this. Best solution would be to modify Pi to be
able to emit something like "fake tool call" that Pi would only render but don't try to execute it.

### Delegating tool calls to Pi

I don't know if this would be acutally improvement, but it's an idea I saw in
[rchern/pi-claude-cli](https://github.com/rchern/pi-claude-cli/) extension - when CLI outputs a tool call, you kill the
CLI, execute the tool call natively with Pi, and then resume the CLI session providing the tool call results. This would
fix rendering problems mentioned above, and also allow to use Pi native tools instead of Cursor built-in ones. I don't
know tho how good that would work in practive.

# Limitations

### Tool calls are not rendered like Pi tool calls

Tool calls are rendered like normal text. They are indented to distinguish them visually at least a little bit from
assistant output, but we cannot render them like standard Pi tool calls. Emiting tool call events from the stream
provider (so they would be rendered with standard Pi UI) would result in Pi trying to execute these calls, because
that's what agentic loop expects - model should output tool call at the end, and then break, waiting for the tool
execution and result returned. But when we are rendering the tool call, it was already executed by Cursor CLI - and also
we don't really want Pi to try to execute it, as this would result in double execution.

### No way to track context/token count

Cursor CLI does not report token/context usage at the end, so there is no way to track it for now.

# Troubleshooting

#### I don't see any Cursor models

You Cursor CLI executable (`agent`) was not found. Make sure you have it in `PATH` or set `CURSOR_AGENT_PATH` or
`AGENT_PATH` env variable to the `agent` executable path.

# Alternatives

- [pi-frontier/pi-cursor-agent](https://github.com/sudosubin/pi-frontier/tree/main/pi-cursor-agent) - most complete
implementation that uses reversed-engineered API.

# License

```
MIT License

Copyright (c) 2026 Andrey
Copyright (c) 2026 Adrian Kepka

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

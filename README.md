# langchainFramework

A hands-on walkthrough of the LangChain JS **v1** agent API (`createAgent`), built up one feature at a time across six standalone scripts.

Each `agentN.ts` is a runnable file focused on a single concept — tools, runtime context, structured output, memory, custom middleware, built-in middleware. They are independent of each other, so read them in order and run whichever one you're interested in.

## Requirements

- **Node.js 24+** (the `langchain` v1 packages require modern Node; developed on v24.21.0)
- API keys for Groq and Anthropic — the scripts import `"dotenv/config"`, so a `.env` in the project root is picked up automatically

## Setup

```bash
npm install
```

Create a `.env` in the project root:

```bash
GROQ_API_KEY=your_groq_key
ANTHROPIC_API_KEY=your_anthropic_key
```

`.env` is already listed in `.gitignore` — keep it that way.

## Running

There are no npm scripts. Run any file directly with `tsx`:

```bash
npx tsx agent6.ts
```

All scripts use **top-level `await`**, which is why `package.json` sets `"type": "module"`. Running them as CommonJS will fail with `Top-level await is currently not supported with the "cjs" output format`.

Every script invokes the agent and `console.log`s the result, so running one makes real API calls against your key.

## The scripts

| File | Focus | New concepts |
| --- | --- | --- |
| [agent1.ts](agent1.ts) | Simplest agent: two tools on Groq | `createAgent`, `tool()`, Zod arg schemas |
| [agent2.ts](agent2.ts) | Passing runtime data into a tool | `config.context`, per-invocation config |
| [agent3.ts](agent3.ts) | Anthropic + guided output | `initChatModel`, `systemPrompt`, `responseFormat` |
| [agent4.ts](agent4.ts) | Conversation memory | `MemorySaver`, `thread_id`, multi-turn |
| [agent5.ts](agent5.ts) | Writing your own middleware | `createMiddleware`, `wrapModelCall` |
| [agent6.ts](agent6.ts) | Built-in middleware stack | fallback, summarization, tool selection |

### agent1.ts — tools

The minimum viable agent. Two tools (`get__weather`, `get__Time`) with Zod schemas, wired into `createAgent` with a `ChatGroq` model. Shows the shape of everything that follows: a model, a list of tools, an `invoke`, and a read of the last message.

### agent2.ts — runtime context

`getUserLocation` ignores its input and instead reads `config.context.user_id` from the second argument of the tool callback. A different `user_id` in the invocation config routes to a different branch. This is the mechanism for per-request data — the signed-in user, tenant, feature flags — that shouldn't be a tool argument the model can invent.

### agent3.ts — structured output

Adds a `systemPrompt` describing when to reach for each tool, and a `responseFormat` Zod object. The model's final answer is then available as `response.structuredResponse` with typed fields (`humour_response`, `weather_conditions`) instead of a blob of text.

### agent4.ts — memory

Attaches a `MemorySaver` checkpointer and runs four invocations. The first three share `thread_id: "1"`, so the agent remembers the location from turn one when asked "what location did you just tell me about". The fourth reuses the same question on `thread_id: "2"` with a different `user_id` and starts from a clean slate — the point being that conversation state is keyed by thread, not by process.

### agent5.ts — custom middleware

Defines `dynamicModelSelection` with `createMiddleware` and `wrapModelCall`. It inspects `request.messages.length` and swaps in a cheaper Groq model for short conversations, keeping the stronger model for longer ones. Note the `as const` on the middleware array — required for TypeScript to keep the tuple's literal types.

### agent6.ts — built-in middleware

The full pipeline, with three built-in middleware composed in one stack:

- `modelFallbackMiddleware(haiku4, groq20b)` — if the primary model errors, retry down the list
- `summarizationMiddleware({ model, trigger: { tokens: 8000 }, keep: { messages: 20 } })` — summarize old turns once the conversation grows past the trigger
- `llmToolSelectorMiddleware({ model: groq20b, maxTools: 2 })` — use a small model to pick the most relevant subset of tools before each call

Three tools are registered (`get_weather`, `search`, `send_email`) and a single prompt exercises two of them at once.

**Ordering matters.** Fallback sits first so it wraps the other middleware's model calls — if summarization or tool selection hits an API error, the fallback catches it too. In general, put fallback outermost.

## Patterns worth knowing

### Two ways to get a model

```ts
// Explicit provider class — direct control over params
const model = new ChatGroq({ model: "openai/gpt-oss-120b", temperature: 0 })

// Universal initializer — infers the provider from the name
const model = await initChatModel("claude-haiku-4.5", { temperature: 0.7 })
```

`initChatModel` accepts a `"provider:model"` string. The provider prefix is **colon-separated** and must be one of LangChain's supported provider keys (`groq`, `anthropic`, `openai`, `google-genai`, …):

```ts
await initChatModel("groq:openai/gpt-oss-120b")   // correct
await initChatModel("openai/gpt-oss-120b")        // throws: unable to infer model provider
```

That second form is a common trap, because `openai/gpt-oss-120b` is Groq's own model *id* — the `openai/` is part of the name Groq publishes, not a LangChain provider. Without a recognized prefix LangChain falls back to guessing from the string, and nothing matches.

Whenever a provider class is already in use, passing the instance avoids the whole question.

### The tool callback signature

```ts
tool((input, config) => { ... }, { name, description, schema })
```

The first argument is the **parsed input object** matching your schema — not a positional argument per field. For a schema of `{ city: z.string() }`, read `input.city`. The second argument is the runtime config, which is where `config.context` lives (see agent2).

### Zod schemas must be instantiated

```ts
schema: z.object({ subject: z.string() })   // correct
schema: z.object({ subject: z.string })     // wrong — passes the function itself
```

## Known issues

These are deliberate rough edges in the earlier scripts, left as-is. Fix them if you build on those files.

- **agent1.ts and agent2.ts** — the tool bodies use single quotes around what look like template strings:

  ```ts
  return 'Its sunny in ${input.city}'   // literal, no interpolation
  ```

  The model receives the unrendered text `${input.city}`. Use backticks.
- **agent3.ts** — `new ChatAnthropic({})` is constructed but never used; the agent uses the model from `initChatModel` below it.
- **agent1.ts, agent2.ts, agent3.ts** — unused imports (`input` from zod in agent1, `context` in agent2 and agent3). Harmless, but noisy.
- **agent1.ts** — tool names use double underscores (`get__weather`, `get__Time`), unlike the single-underscore names in later files. The model sees these strings verbatim.

## Dependency note

[agent4.ts](agent4.ts) and [agent5.ts](agent5.ts) import `MemorySaver` from `@langchain/langgraph`, which is **not declared in `package.json`**. It resolves today only because `langchain` depends on it and npm hoists it to the top level. That's fragile — a change in `langchain`'s dependencies or a switch to a stricter installer would break those two files. Add it explicitly if you keep using checkpointers:

```bash
npm install @langchain/langgraph
```

## Versions

```
langchain            1.5.16
@langchain/core      1.2.17
@langchain/anthropic 1.5.12
@langchain/groq       1.3.1
@langchain/langgraph  1.5.0   (transitive, undeclared)
zod                   4.6.7
dotenv               18.0.7
tsx                  4.23.15
typescript            7.0.2
```

The v1 `createAgent` API is relatively young, and middleware option names have moved. `summarizationMiddleware` in particular renamed `maxTokensBeforeSummary` → `trigger: { tokens }` and `messagesToKeep` → `keep: { messages }`; the old names still work but log deprecation warnings. agent6.ts uses the current names.

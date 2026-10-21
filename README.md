# langchainFramework

A hands-on walkthrough of the LangChain JS **v1** agent API (`createAgent`), built up one feature at a time across seven standalone agent scripts, plus five RAG scripts and a LangGraph dev-server entry point.

Each `agentN.ts` is a runnable file focused on a single concept — tools, runtime context, structured output, memory, custom middleware, built-in middleware, PII handling. They are independent of each other, so read them in order and run whichever one you're interested in. The `ragagentN.ts` files are a separate progression: raw retrieval ([ragagent1.ts](ragagent1.ts)), retrieval wired into an agent ([ragagent2.ts](ragagent2.ts)), retrieval across multiple documents ([ragagent3.ts](ragagent3.ts)), loading non-PDF documents ([ragagent4.ts](ragagent4.ts)), and exposing the retriever as a tool the model chooses when to call ([ragagent5.ts](ragagent5.ts)). [ragagentServer.ts](ragagentServer.ts) takes that last agent and serves it through LangGraph's dev server so it can be driven from Studio or over HTTP instead of `tsx`.

## Requirements

- **Node.js 24+** (the `langchain` v1 packages require modern Node; developed on v24.21.0)
- API keys for Groq and Anthropic — used by the agent scripts — and a Google (Gemini) key for the embeddings in `ragagent1.ts`–`ragagent4.ts`. The scripts import `"dotenv/config"`, so a `.env` in the project root is picked up automatically
- **Ollama** running locally with the `nomic-embed-text` model, for [ragagent5.ts](ragagent5.ts). That script embeds on your machine, so it needs no embeddings API key:

  ```bash
  ollama pull nomic-embed-text
  ```

## Setup

```bash
npm install
```

Create a `.env` in the project root:

```bash
GROQ_API_KEY=your_groq_key
ANTHROPIC_API_KEY=your_anthropic_key
GOOGLE_API_KEY=your_google_key
```

`.env` is already listed in `.gitignore` — keep it that way.

## Running

There are no npm scripts. Run any file directly with `tsx`:

```bash
npx tsx agent6.ts
```

All scripts use **top-level `await`**, which is why `package.json` sets `"type": "module"`. Running them as CommonJS will fail with `Top-level await is currently not supported with the "cjs" output format`.

Each script `console.log`s its result — most invoke an agent, while `ragagent1.ts` only runs a similarity search. Either way, running one makes real API calls against your keys.

### LangGraph dev server

`ragagentServer.ts` is the same multi-tool agent as `ragagent5.ts`, exposed through LangGraph's dev server. The server reads its configuration from `langgraph.json` in the project root:

```json
{
  "graphs": { "rag_agent": "./ragagentServer.ts:graph" },
  "env": ".env"
}
```

Start it with:

```bash
npx langgraph dev
```

The loader imports the file named before the colon and reads the export named after it, then serves the graph on `http://localhost:2024` — LangGraph Studio opens shortly after, and the graph also accepts HTTP calls. `"env": ".env"` loads your keys into the server process, so `GROQ_API_KEY`/`ANTHROPIC_API_KEY` must be present there; the `ragagent5.ts` style `import "dotenv/config"` still runs too.

Two details worth knowing:

- **The export name must match.** `"./ragagentServer.ts:graph"` requires an actual `export const graph = agent`. A module-local `const graph` produces the CLI's `Failed to load graph: graph is null` error.
- **The vector store is built at import.** The server embeds all chunks before it reports ready, and again on every reload, so startup takes as long as a script run instead of being instant.

## The scripts

| File | Focus | New concepts |
| --- | --- | --- |
| [agent1.ts](agent1.ts) | Simplest agent: two tools on Groq | `createAgent`, `tool()`, Zod arg schemas |
| [agent2.ts](agent2.ts) | Passing runtime data into a tool | `config.context`, per-invocation config |
| [agent3.ts](agent3.ts) | Anthropic + guided output | `initChatModel`, `systemPrompt`, `responseFormat` |
| [agent4.ts](agent4.ts) | Conversation memory | `MemorySaver`, `thread_id`, multi-turn |
| [agent5.ts](agent5.ts) | Writing your own middleware | `createMiddleware`, `wrapModelCall` |
| [agent6.ts](agent6.ts) | Built-in middleware stack | fallback, summarization, tool selection |
| [agent7.ts](agent7.ts) | PII detection and redaction | `piiMiddleware`, custom detectors |
| [ragagent1.ts](ragagent1.ts) | RAG foundations | `PDFLoader`, text splitting, Google embeddings, `MemoryVectorStore`, `asRetriever` |
| [ragagent2.ts](ragagent2.ts) | RAG agent: retrieve, then answer | `dynamicSystemPromptMiddleware`, MMR retriever, context injection |
| [ragagent3.ts](ragagent3.ts) | RAG across several documents | one store for multiple PDFs, cross-document questions |
| [ragagent4.ts](ragagent4.ts) | RAG over a Word document | `DocxLoader`, same pipeline on `.docx` input |
| [ragagent5.ts](ragagent5.ts) | Multi-tool agent with a retrieval tool | retriever wrapped in `tool()`, local Ollama embeddings, `claude-haiku-4-5` |
| [ragagentServer.ts](ragagentServer.ts) | Agent served by LangGraph | `langgraph.json`, `langgraph dev`, exported `graph` |

### agent1.ts — tools

The minimum viable agent. Two tools (`get_weather`, `get_time`) with Zod schemas, wired into `createAgent` with a `ChatGroq` model. Shows the shape of everything that follows: a model, a list of tools, an `invoke`, and a read of the last message.

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

### agent7.ts — PII detection

Registers four `piiMiddleware` instances to scrub personally identifiable information from user messages before they reach the model:

- `credit_card` — built-in detector, Luhn-validated, `mask` strategy (keeps the last four digits)
- `email` — built-in detector, `redact` strategy
- `ssn` and `phone` — **custom** detectors supplied as regex **strings**

The current API is one middleware per PII type, not one middleware with a `rules` map (the older `piiRedactionMiddleware` is deprecated):

```ts
piiMiddleware("credit_card", { strategy: "mask" }),
piiMiddleware("ssn", {
  detector: "\\b\\d{3}-\\d{2}-\\d{4}\\b",
  strategy: "redact"
}),
```

Pass custom patterns as strings, not as `/.../g` literals — the library compiles the string into a fresh global regex on every call, while a shared `RegExp` object carries `lastIndex` state between calls and can silently skip matches. Built-in types need no detector at all.

Strategies: `redact` → `[REDACTED_SSN]`, `mask` → partial (e.g. `****-****-****-1234`), `hash` → deterministic pseudonym, `block` → throw `PIIDetectionError`.

### ragagent1.ts — RAG foundations

A standalone retrieval pipeline, no agent or tools involved:

1. `PDFLoader` reads `ProjectDocs/nke-10k-2023.pdf` (path built from `process.cwd()`, so run it from the project root)
2. `RecursiveCharacterTextSplitter({ chunkSize: 1000, chunkOverlap: 200 })` breaks the pages into chunks
3. `GoogleGenerativeAIEmbeddings({ model: "gemini-embedding-001" })` embeds the chunks — this is why `GOOGLE_API_KEY` is required
4. `MemoryVectorStore` holds the vectors in process memory
5. `similaritySearch(...)` retrieves the closest chunks for a question, and `asRetriever(...)` wraps the store in the standard retriever interface

Groq has no embeddings endpoint and Anthropic doesn't offer an embeddings API, so these scripts deliberately use Google. Swap in `OpenAIEmbeddings` or a local HuggingFace model if you prefer.

### ragagent2.ts — retrieval inside an agent

Takes the same load → split → embed → store pipeline and plugs it into `createAgent` with `dynamicSystemPromptMiddleware`. On every model call the middleware:

1. reads the user's question from `state.messages`
2. calls `retriever.invoke(query)` — an MMR retriever (`k: 4`, `fetchK: 20`)
3. joins the retrieved chunks and returns them as the system prompt

So retrieval is not a separate step in `main`; it happens inside the agent's model-call loop every turn. The agent then answers with `ChatGroq` (`openai/gpt-oss-120b`).

One detail that matters:

- **`fetchK` must be ≥ `k`.** `fetchK` is how many candidates MMR considers before selecting `k` diverse results. `fetchK: 1` returns just one document regardless of `k`.

### ragagent3.ts — multi-document RAG

Loads all three PDFs in `ProjectDocs/` into **one** vector store, so a single question can draw on several documents at once:

```ts
const pdfPaths = [
  `${process.cwd()}/ProjectDocs/nke-10k-2023.pdf`,
  `${process.cwd()}/ProjectDocs/Nike-Inc-2025_10K.pdf`,
  `${process.cwd()}/ProjectDocs/nike-growth-story.pdf`
]
```

The middleware and retriever are the same shape as `ragagent2.ts`. The sample prompt asks for Nike's 2023 and 2025 revenue plus its origin story — a question that spans the two 10-Ks and the narrative PDF. Note that retrieval cannot tell you which document a chunk came from unless you read `doc.metadata.source`.

### ragagent4.ts — loading a Word document

Same RAG agent, different input format: `DocxLoader` replaces `PDFLoader` and reads `ProjectDocs/nike-growth-story.docx`. Everything downstream — split, embed, store, MMR retriever, middleware — is unchanged.

```ts
import { DocxLoader } from "@langchain/community/document_loaders/fs/docx"

const loader = new DocxLoader(`${process.cwd()}/ProjectDocs/nike-growth-story.docx`)
```

`@langchain/community` ships loaders for many formats under the same `document_loaders/fs/*` path (`pdf`, `docx`, `csv`, `json`, `text`, …), so switching formats is usually a one-line change.

### ragagent5.ts — the retriever as a tool

The same three-PDF corpus, but retrieval is no longer forced on every turn. Instead the retriever is wrapped in a tool, alongside the weather and email tools from the earlier agent scripts:

```ts
const retrieve = tool(async ({ query }) => {
  const docs = await retriever.invoke(query)
  return docs.map((doc) => doc.pageContent).join("\n\n")
}, {
  name: "retrieve",
  description: "Retrieve information from multiple pdf documents",
  schema: z.object({ query: z.string() })
})

const agent = createAgent({
  model: "claude-haiku-4-5",
  tools: [retrieve, getWeather, emailTool],
  systemPrompt: "..."
})
```

That's the key difference from `ragagent2.ts`–`ragagent4.ts`. Those inject context with `dynamicSystemPromptMiddleware`, so every model call carries retrieved text whether it needs it or not. Here the model decides whether to call `retrieve`, and it can call `get_weather` or `send_email` in the same run — useful when a question spans a document lookup and something else.

Embeddings are local:

```ts
const embeddings = new OllamaEmbeddings({ model: "nomic-embed-text" })
```

`OllamaEmbeddings` sends the chunk texts to the Ollama server at `localhost:11434`, which runs the model on your machine and returns 768-dimension vectors. There's no API key, quota or per-minute throttle, so `addDocuments(allSplits)` embeds everything in one pass — no batching or sleeping required. The retriever still uses MMR (`k: 2`, `fetchK: 20`); `k` is deliberately low because Groq's free tier caps prompts at 8000 tokens/minute, and the script is often pointed at `gpt-oss-20b`. With an Anthropic model the cap doesn't apply and `k: 4` is fine.

The query and the documents must be embedded by the same model. If you switch providers, re-embed the corpus — vectors from `gemini-embedding-001` and `nomic-embed-text` are not comparable.

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

## Versions

```
langchain                1.5.16
@langchain/core          1.2.18
@langchain/anthropic     1.5.12
@langchain/groq          1.3.1
@langchain/google-genai  2.3.2
@langchain/community     1.1.29
@langchain/openai        1.6.2
@langchain/textsplitters 1.0.2
@langchain/langgraph     1.5.0
@langchain/ollama        1.3.0
@langchain/langgraph-cli 1.5.4
pdf-parse                2.4.5
zod                      3.25.32
dotenv                   16.4.5
tsx                      4.23.15
typescript               7.0.2
```

The v1 `createAgent` API is relatively young, and middleware option names have moved. `summarizationMiddleware` in particular renamed `maxTokensBeforeSummary` → `trigger: { tokens }` and `messagesToKeep` → `keep: { messages }`; the old names still work but log deprecation warnings. agent6.ts uses the current names.

Likewise, `piiRedactionMiddleware` (a single middleware with a `rules` map) is deprecated in favor of `piiMiddleware(piiType, options)`, one instance per PII type. agent7.ts uses the current API.

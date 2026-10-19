/// <reference types="node" />
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf"
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters"
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import { MemoryVectorStore } from "@langchain/classic/vectorstores/memory";
import "dotenv/config"
import process from 'process'
import { createAgent, dynamicSystemPromptMiddleware } from "langchain";
import { ChatGroq } from "@langchain/groq";

const pdfPaths = [
    `${process.cwd()}/ProjectDocs/nke-10k-2023.pdf`,
    `${process.cwd()}/ProjectDocs/Nike-Inc-2025_10K.pdf`,
    `${process.cwd()}/ProjectDocs/nike-growth-story.pdf`
] 

const allDocs = [];
for(const pdfPath of pdfPaths)
{
    const loader = new PDFLoader(pdfPath)
    const docs = await loader.load()
    allDocs.push(...docs)
}

const textSplitter = new RecursiveCharacterTextSplitter(
    {
        // ~85 chunks total: the Gemini free tier only allows ~100 embedding
        // inputs per minute, and every run re-embeds the whole document.
        chunkSize : 5000,
        chunkOverlap : 200

    }
)

const allSplits = await textSplitter.splitDocuments(allDocs)
console.log(allSplits.length)

const embeddings = new GoogleGenerativeAIEmbeddings({
    model : "gemini-embedding-001"
})

const vectorStore = new MemoryVectorStore(embeddings)
await vectorStore.addDocuments(allSplits);

// A rate-limited batch comes back as an empty vector (no error thrown), and
// MMR crashes on those. Drop them so retrieval only sees real embeddings.
vectorStore.memoryVectors = vectorStore.memoryVectors.filter((v) => v.embedding?.length > 0)
console.log(`Usable vectors: ${vectorStore.memoryVectors.length}/${allSplits.length}`)

const retriever = vectorStore.asRetriever({
    k: 4,
    searchType: "mmr",
    searchKwargs: { fetchK: 20 }
})

const ragMiddleware = dynamicSystemPromptMiddleware(async (state)=>
{
  const userMessage = state.messages[0].content;
  const query = typeof userMessage === "string" ? userMessage : ""
  const retrievedDocs = await retriever.invoke(query);
  const docsContent = retrievedDocs.map((doc)=> doc.pageContent
  ).join("\n\n");

  return `You are a helpful assistant. Use the following context from the document to answer the user's question:\n\n${docsContent}`;


});
const groq120b = new ChatGroq({
    model : "openai/gpt-oss-120b",
    temperature : 0
})

const agent = createAgent({
    model : groq120b,
    middleware : [ragMiddleware]
})

const result = await agent.invoke({
    // messages: [{ role: "user", content: "As of May 31, 2023, How many shares million shares the company has purchased?"}]
    messages : [{role: "user", content : "What was Nike revenue in 2023 & 2025 and from which town Nike has grown into world famous footwear"}]
})
console.log(result)
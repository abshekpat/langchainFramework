/// <reference types="node" />
import { DocxLoader } from "@langchain/community/document_loaders/fs/docx"
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters"
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import { MemoryVectorStore } from "@langchain/classic/vectorstores/memory";
import "dotenv/config"
import process from 'process'
import { createAgent, dynamicSystemPromptMiddleware } from "langchain";
import { ChatGroq } from "@langchain/groq";

const loader = new DocxLoader(`${process.cwd()}/ProjectDocs/nike-growth-story.docx`)
const docs = await loader.load()
console.log(docs.length)
console.log(docs[0].pageContent)

const textSplitter = new RecursiveCharacterTextSplitter(
    {
        chunkSize : 5000,
        chunkOverlap : 200

    }
)

const allSplits = await textSplitter.splitDocuments(docs)
console.log(allSplits.length)

const embeddings = new GoogleGenerativeAIEmbeddings({
    model : "gemini-embedding-001"
})

const vectorStore = new MemoryVectorStore(embeddings)
await vectorStore.addDocuments(allSplits);

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
  const docsContent = retrievedDocs.map((doc)=> doc.pageContent).join("\n\n");

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
    messages : [{role: "user", content : "What are key highlights of Nike growth story?"}]
})

console.log(result)
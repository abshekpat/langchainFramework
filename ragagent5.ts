import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import {  tool } from "langchain";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { MemoryVectorStore } from "@langchain/classic/vectorstores/memory";
import "dotenv/config"
import { createAgent } from "langchain";
import z from "zod";
import { OllamaEmbeddings } from "@langchain/ollama";

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
  { chunkSize : 5000,
    chunkOverlap : 200
  }
)

const allSplits = await textSplitter.splitDocuments(allDocs)
console.log(allSplits.length);

// Local embeddings via Ollama: no API quota, so all chunks embed in one pass.
const embeddings = new OllamaEmbeddings({
    model : "nomic-embed-text"
})

const vectorStore = new MemoryVectorStore(embeddings);
await vectorStore.addDocuments(allSplits);
console.log(`Usable vectors: ${vectorStore.memoryVectors.length}/${allSplits.length}`)

const retriever = vectorStore.asRetriever({
    // Groq's free tier caps gpt-oss-20b at 8000 tokens/minute, so keep the
    // retrieved context small: fewer chunks => smaller prompt.
    k: 2,
    searchType: "mmr",
    searchKwargs: { fetchK: 20 }
})

const retrieve = tool(async ({query})=>
{
  const retrievedDocs = await retriever.invoke(query);
  const docsContent = retrievedDocs.map((doc)=> doc.pageContent
  ).join("\n\n");
  return docsContent;
},
{
 name : "retrieve",
 description : "Retrieve information from multiple pdf documents",
 schema : z.object({
    query : z.string()
 })

})


const emailTool = tool(({recipient,subject}) => {
    return `Email sent to ${recipient} with subject ${subject}`
}, {
    name: "send_email",
    description: "send an email to some one",
    schema: z.object({
        recipient: z.string(),
        subject: z.string()
    })
})

const getWeather = tool( (input)=> {
    //${input.city} -by getting weather  - returned Sunny
    return `Its  sunny in ${input.city} `
    } ,
    {
        name : "get_weather",
        description : "Get the weather for a given city",
        schema : z.object({
            city : z.string()
            
        })
    }
)


const agent = createAgent({
    model : "claude-haiku-4-5",
    tools : [retrieve,getWeather,emailTool],
   systemPrompt :  "You have access to a tools that retrieves context from multiple PDF documents & get weather & email, use the tool to help answer user queries"
  
})
const result = await agent.invoke({
//   messages : [{role: "user", content : "What was Nike revenue in 2024 & 2025 and from which town Nike has grown into world famous footwear & what is weather in that town"}]
   messages : [{role: "user", content : "As of May 31, 2023, How many shares million shares the company has purchased?"}]
})

console.log(result);




































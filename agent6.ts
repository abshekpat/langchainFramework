import { createAgent, initChatModel, llmToolSelectorMiddleware, modelFallbackMiddleware, summarizationMiddleware, tool } from "langchain"
import { ChatGroq } from "@langchain/groq"
import z from "zod"
import "dotenv/config"

const searchTool = tool((input) => {
    return `Search results for ${input.query} : Fount 5 articles are returned`
    },
    {
        name:"search",
        description:"search the internet for information",
        schema : z.object({
            query : z.string()
        })
    }
)

const emailTool = tool((input) => {
    return `Email sent to ${input.recipient} with subject ${input.subject}`
    },
    {
        name:"send_email",
        description:"send an email to some one",
        schema : z.object({
            recipient: z.string(),
            subject : z.string()
        })
    }
)

const getWeather = tool( (input) => {
    return `Its sunny in ${input.city}`
    },
    {
        name : "get_weather",
        description : "Get the weather for a given city",
        schema : z.object({
        city : z.string()
        })
    }
)

const groq120b = new ChatGroq({
    model : "openai/gpt-oss-120b",
    temperature : 0
})

const groq20b = new ChatGroq({
    model : "openai/gpt-oss-20b",
    temperature : 0
})
const haiku4 = await initChatModel(
    "claude-haiku-4.5",
     {
        temperature:0.7
     }
)

const agent = createAgent({
    model : groq120b,
    tools : [getWeather, searchTool, emailTool],
    middleware : [

        modelFallbackMiddleware(haiku4, groq20b),
        summarizationMiddleware({
            model : groq120b,
            trigger: { tokens: 8000 },
            keep: { messages: 20 }
        }),
        llmToolSelectorMiddleware({
            model : groq20b,
            maxTools: 2

        })
    ]
})

const response = await agent.invoke({
    messages: [{role: "user", content: "what is the weather in tokyo and email to abhishekpath89@gmail.com with subject weather"}]
})
console.log(response)
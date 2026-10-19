import { createAgent, piiMiddleware, tool } from "langchain"
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

const agent = createAgent({
    model : groq120b,
    tools : [getWeather, searchTool, emailTool],
    middleware : [
        piiMiddleware("credit_card", { strategy: "mask" }),
        piiMiddleware("email", { strategy: "redact" }),
        piiMiddleware("ssn", {
            detector : "\\b\\d{3}-\\d{2}-\\d{4}\\b",
            strategy : "redact"
        }),
        piiMiddleware("phone", {
            detector : "\\b\\d{3}[-.]?\\d{3}[-.]?\\d{4}\\b",
            strategy : "redact"
        })
    ]
})

const response = await agent.invoke({
    messages: [{role: "user", content: "my ssn is 123-45-6789 & My email is gmail provider. is this good?"}]
})
console.log(response)
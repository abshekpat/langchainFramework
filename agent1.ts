import { createAgent } from "langchain"
import { ChatGroq } from "@langchain/groq"
import "dotenv/config"
import z, { input } from "zod"
import { tool } from "@langchain/core/tools"

// Initialize the model using the official Groq ID
const chatModel = new ChatGroq({
  model: "openai/gpt-oss-120b", 
  temperature: 0,
});

const getWeather = tool( (input) => {
    return 'Its sunny in ${input.city}'
    },
    {
        name : "get__weather",
        description : "Get the weather for a given city",
        schema : z.object({
        city : z.string()
        })
    }

);

const getTime = tool( (input) => {
    return 'The current time in ${input.city} is 3:00PM'
    },
    {
        name : "get__Time",
        description : "Get current time for a given city",
        schema : z.object({
        city : z.string()
        })
    }

);



const agent = createAgent({
  model: chatModel, 
  tools: [getWeather, getTime]
});

const response = await agent.invoke({
  messages: [{ role: "user", content: "what is time ane weather in New York" }]
});
const longMsg = response.messages[response.messages.length-1].content
console.log(response);
console.log(longMsg)

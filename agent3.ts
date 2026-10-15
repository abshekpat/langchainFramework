import { context, createAgent, initChatModel, tool } from "langchain"
import { ChatAnthropic } from "@langchain/anthropic"
import "dotenv/config"
import z from "zod"

const chatModel = new ChatAnthropic({
    
})

const systemPrompt = `You are an expert weather forecaster who also speaks in a humorous way.
You have access to two tools:
- get_weather: use this to get the weather for a specific location
- get_user_location: use this to get the user's location

If a user asks you for the weather, make sure you know the location first. If you can tell from the question that they mean
wherever they are, use the get_user_location tool to find their location.`


const getUserLocation = tool((_,config)=> {
    const user_id = config.context.user_id;
    return user_id === "1" ? "Florida" : "SanFrancisco"
},
{
    name : "get_user_location",
    description : "Retrieve user information based on UserId",
    schema : z.object({})
});

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
);

const config = {
    context : {user_id : "1"}
}

const responseFormat = z.object({
    humour_response : z.string(),
    weather_conditions : z.string()
});

const model = await initChatModel(
   "claude-haiku-4.5",
   {
    temperature : 0.7, timeout : 30, max_tokens: 1000
   }
)

const agent = createAgent({
    model: model,
    tools : [getUserLocation, getWeather],
    systemPrompt,
    responseFormat
})

const response = await agent.invoke({
    messages:[{role: "user", content : "what is weather outside"}]
},config)
const longMsg = response.messages[response.messages.length-1].content
console.log(response.structuredResponse)
// console.log(longMsg)

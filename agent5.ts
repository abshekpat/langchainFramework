import { createAgent, createMiddleware, initChatModel, tool } from "langchain"
import { ChatGroq } from "@langchain/groq"
import "dotenv/config"
import z from "zod"
import {MemorySaver} from "@langchain/langgraph"

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

const dynamicModelSelection = createMiddleware({
    name: "DynamicModelSelection",
    wrapModelCall : (request, handler) =>
    {
        const messageCount = request.messages.length;
        return handler({
            ...request,
            model : messageCount > 3? model :basicModel
        })
    }
})

const config = {
    configurable : {thread_id : "1"},
    context : {user_id : "1"}
}

const model = await initChatModel(
   "claude-haiku-4.5",
   {
    temperature : 0.7, timeout : 30, max_tokens: 1000
   }
)

const basicModel = new ChatGroq(
    {
        model : "openai/gpt-oss-20b",
        temperature: 0
    }
)

const checkpointer = new MemorySaver();

const agent = createAgent({
    model: model,
    tools : [getUserLocation, getWeather],
    systemPrompt,
    checkpointer,
    middleware : [dynamicModelSelection] as const
})

const response = await agent.invoke({
    messages:[{role: "user", content : "what is weather outside"}]
},config)


const response1 = await agent.invoke({
    messages:[{role: "user", content : "what location did you just tell me about"}]
},config)


const response2 = await agent.invoke({
    messages:[{role: "user", content : "Suggest me good places in that location"}]
},config)

console.log(response2)









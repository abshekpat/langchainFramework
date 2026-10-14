import { context, createAgent, tool } from "langchain"
import { ChatGroq } from "@langchain/groq"
import "dotenv/config"
import z from "zod"

const chatModel = new ChatGroq({
    model:"openai/gpt-oss-120b",
    temperature: 0
})

const getUserLocation = tool((_,config)=> {
    const user_id = config.context.user_id;
    return user_id === "1" ? "Florida" : "SanFrancisco"
},
{
    name : "get__user__location",
    description : "Retrieve user information based on UserId",
    schema : z.object({})
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

const config = {
    context : {user_id : "1"}
}

const agent = createAgent({
    model: chatModel,
    tools : [getUserLocation, getWeather]
})

const response = await agent.invoke({
    messages:[{role: "user", content : "what is weather outside"}]
},config)
const longMsg = response.messages[response.messages.length-1].content
console.log(response)
console.log(longMsg)

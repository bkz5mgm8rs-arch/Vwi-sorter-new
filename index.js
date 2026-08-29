import { Client, GatewayIntentBits, ActivityType } from "discord.js";

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once("clientReady", () => {
  console.log("Online as", client.user.tag);
  client.user.setPresence({
    status: "online",
    activities: [{ name: "VWI Sorter", type: ActivityType.Watching }],
  });
});

client.login(process.env.DISCORD_BOT_TOKEN);

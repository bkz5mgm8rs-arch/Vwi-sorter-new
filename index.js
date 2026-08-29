import {
  Client,
  GatewayIntentBits,
  ActivityType,
  REST,
  Routes,
  MessageFlags,
  SlashCommandBuilder,
} from "discord.js";

// Clean the token: strip whitespace, wrapping quotes and a leading "Bot ".
const token = (process.env.DISCORD_BOT_TOKEN ?? "")
  .trim()
  .replace(/^['"]|['"]$/g, "")
  .replace(/^Bot\s+/i, "");

// Where the VWI Sorter site lives (handles the actual SellAuth stock work).
const SITE = (process.env.VWI_SITE_URL ?? "https://blacklistmp-vwi-sorter.lovable.app")
  .trim()
  .replace(/\/+$/, "");

if (!token) {
  console.error(
    "DISCORD_BOT_TOKEN is not set. Add it as an environment variable on your host."
  );
  process.exit(1);
}

if (token.split(".").length !== 3) {
  console.error(
    "DISCORD_BOT_TOKEN does not look like a bot token (expected 3 dot-separated parts).\n" +
      "Copy it from Developer Portal -> your app -> Bot -> Reset Token.\n" +
      "Do NOT use the Client Secret, Public Key or Application ID."
  );
  process.exit(1);
}

// /stock add | remove | set | view
const stockCommand = new SlashCommandBuilder()
  .setName("stock")
  .setDescription("Add, remove, change or view SellAuth stock")
  .addSubcommand((s) =>
    s
      .setName("view")
      .setDescription("Show current stock lines")
      .addStringOption((o) => o.setName("product").setDescription("Product name or id").setRequired(true))
      .addStringOption((o) => o.setName("variant").setDescription("Variant name or id"))
  )
  .addSubcommand((s) =>
    s
      .setName("add")
      .setDescription("Add stock lines")
      .addStringOption((o) => o.setName("product").setDescription("Product name or id").setRequired(true))
      .addStringOption((o) => o.setName("lines").setDescription("Lines separated by |").setRequired(true))
      .addStringOption((o) => o.setName("variant").setDescription("Variant name or id"))
  )
  .addSubcommand((s) =>
    s
      .setName("remove")
      .setDescription("Remove stock lines (exact lines, or the first N)")
      .addStringOption((o) => o.setName("product").setDescription("Product name or id").setRequired(true))
      .addStringOption((o) => o.setName("variant").setDescription("Variant name or id"))
      .addStringOption((o) => o.setName("lines").setDescription("Exact lines to remove, separated by |"))
      .addIntegerOption((o) => o.setName("count").setDescription("How many lines to remove"))
  )
  .addSubcommand((s) =>
    s
      .setName("set")
      .setDescription("Change the stock count (service / dynamic variants)")
      .addStringOption((o) => o.setName("product").setDescription("Product name or id").setRequired(true))
      .addIntegerOption((o) => o.setName("count").setDescription("New stock count").setRequired(true))
      .addStringOption((o) => o.setName("variant").setDescription("Variant name or id"))
  )
  .addSubcommand((s) =>
    s
      .setName("addfile")
      .setDescription("Add stock from an uploaded .txt file (one line per item)")
      .addStringOption((o) => o.setName("product").setDescription("Product name or id").setRequired(true))
      .addAttachmentOption((o) => o.setName("file").setDescription("Text file with stock lines").setRequired(true))
      .addStringOption((o) => o.setName("variant").setDescription("Variant name or id"))
  )
  .addSubcommand((s) =>
    s
      .setName("live")
      .setDescription("Live SellAuth stock with buy now links")
      .addStringOption((o) => o.setName("product").setDescription("Filter by product name"))
  )
  .toJSON();

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once("clientReady", async () => {
  console.log("Online as", client.user.tag);
  client.user.setPresence({
    status: "online",
    activities: [{ name: "VWI Sorter", type: ActivityType.Watching }],
  });

  try {
    const rest = new REST({ version: "10" }).setToken(token);
    await rest.put(Routes.applicationCommands(client.user.id), { body: [stockCommand] });
    console.log("Registered /stock");
  } catch (err) {
    console.error("Could not register /stock:", err);
  }
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand() || interaction.commandName !== "stock") return;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const sub = interaction.options.getSubcommand();
  const options = {};
  for (const key of ["product", "variant", "lines"]) {
    const v = interaction.options.getString(key);
    if (v) options[key] = v;
  }
  const count = interaction.options.getInteger("count");
  if (count !== null && count !== undefined) options.count = String(count);

  let apiSub = sub;
  if (sub === "addfile") {
    const file = interaction.options.getAttachment("file");
    try {
      const text = await (await fetch(file.url)).text();
      const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      if (lines.length === 0) {
        await interaction.editReply("That file has no stock lines.");
        return;
      }
      options.lines = lines.join("\n");
      apiSub = "add";
    } catch {
      await interaction.editReply("Could not download that file.");
      return;
    }
  }

  try {
    const res = await fetch(SITE + "/api/public/discord/stock", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bot " + token },
      body: JSON.stringify({
        sub: apiSub,
        options,
        guildId: interaction.guildId,
        roles: interaction.member?.roles?.cache
          ? [...interaction.member.roles.cache.keys()]
          : (interaction.member?.roles ?? []),
        actor: interaction.user.username,
      }),
    });
    const data = await res.json().catch(() => ({}));
    await interaction.editReply(data.content ?? "Stock command failed (" + res.status + ").");
  } catch (err) {
    console.error("stock relay failed:", err);
    await interaction.editReply("Could not reach the VWI Sorter site.");
  }
});

client.login(token).catch((err) => {
  if (err?.code === "TokenInvalid") {
    console.error(
      "Discord rejected the token (TokenInvalid). It was reset, copied wrong, or belongs to a deleted app.\n" +
        "Reset the token in the Developer Portal and update DISCORD_BOT_TOKEN on your host."
    );
  } else {
    console.error("Login failed:", err);
  }
  process.exit(1);
});

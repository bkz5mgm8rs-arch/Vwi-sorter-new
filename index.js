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

// Pickable option builders — product/variant use live autocomplete from the
// dashboard, console is a fixed choice list so nothing has to be typed.
const productOption = (o) =>
  o.setName("product").setDescription("Pick a product").setRequired(true).setAutocomplete(true);
const variantOption = (o) =>
  o.setName("variant").setDescription("Pick a variant (optional)").setAutocomplete(true);
const consoleOption = (o) =>
  o
    .setName("console")
    .setDescription("Which console this stock is for")
    .addChoices(
      { name: "PC", value: "PC" },
      { name: "Xbox", value: "Xbox" },
      { name: "PlayStation", value: "PlayStation" },
      { name: "Cross-platform", value: "Cross-platform" }
    );

// /stock add | remove | set | view
const stockCommand = new SlashCommandBuilder()
  .setName("stock")
  .setDescription("Manage and showcase your SellAuth stock")
  .addSubcommand((s) =>
    s
      .setName("view")
      .setDescription("Inspect current stock lines for a product variant")
      .addStringOption(productOption)
      .addStringOption(variantOption)
  )
  .addSubcommand((s) =>
    s
      .setName("add")
      .setDescription("Append new stock lines to a product variant")
      .addStringOption(productOption)
      .addStringOption((o) => o.setName("lines").setDescription("Stock lines, separated by |").setRequired(true))
      .addStringOption(variantOption)
      .addStringOption(consoleOption)
  )
  .addSubcommand((s) =>
    s
      .setName("remove")
      .setDescription("Remove specific stock lines, or the first N lines")
      .addStringOption(productOption)
      .addStringOption(variantOption)
      .addStringOption((o) => o.setName("lines").setDescription("Exact stock lines to remove, separated by |"))
      .addIntegerOption((o) => o.setName("count").setDescription("How many lines to remove from the top"))
  )
  .addSubcommand((s) =>
    s
      .setName("set")
      .setDescription("Set an exact stock count for a service or dynamic variant")
      .addStringOption(productOption)
      .addIntegerOption((o) => o.setName("count").setDescription("The new stock count").setRequired(true))
      .addStringOption(variantOption)
  )
  .addSubcommand((s) =>
    s
      .setName("addfile")
      .setDescription("Bulk-import stock from a .txt file (one item per line)")
      .addStringOption(productOption)
      .addAttachmentOption((o) => o.setName("file").setDescription("A .txt file containing one stock line per row").setRequired(true))
      .addStringOption(variantOption)
      .addStringOption(consoleOption)
  )
  .addSubcommand((s) =>
    s
      .setName("live")
      .setDescription("Post a live storefront listing with prices and a Buy now button")
      .addStringOption((o) =>
        o.setName("product").setDescription("Only show products matching this name").setAutocomplete(true)
      )
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

// Live pickers: suggest real products / variants from the dashboard.
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isAutocomplete() || interaction.commandName !== "stock") return;
  const focused = interaction.options.getFocused(true);
  try {
    const res = await fetch(SITE + "/api/public/discord/options", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bot " + token },
      body: JSON.stringify({
        field: focused.name,
        query: focused.value ?? "",
        product: interaction.options.getString("product") ?? "",
      }),
    });
    const data = await res.json().catch(() => ({}));
    await interaction.respond(Array.isArray(data.choices) ? data.choices.slice(0, 25) : []);
  } catch {
    await interaction.respond([]).catch(() => {});
  }
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand() || interaction.commandName !== "stock") return;
  const sub = interaction.options.getSubcommand();
  // /stock live is a public storefront listing — everyone in the channel sees it.
  await interaction.deferReply(sub === "live" ? {} : { flags: MessageFlags.Ephemeral });


  const options = {};
  for (const key of ["product", "variant", "lines", "console"]) {
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
        await interaction.editReply("⚠️ That file contains no usable stock lines.");
        return;
      }
      options.lines = lines.join("\n");
      apiSub = "add";
    } catch {
      await interaction.editReply("⚠️ Could not download that attachment. Please try again.");
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
    const payload = {};
    if (data.content) payload.content = data.content;
    if (Array.isArray(data.embeds) && data.embeds.length) payload.embeds = data.embeds;
    if (Array.isArray(data.components) && data.components.length)
      payload.components = data.components;
    if (!payload.content && !payload.embeds)
      payload.content = "⚠️ The stock request failed (HTTP " + res.status + "). Please try again shortly.";
    await interaction.editReply(payload);
  } catch (err) {
    console.error("stock relay failed:", err);
    await interaction.editReply("⚠️ Could not reach the VWI Sorter dashboard. Check the SITE URL and try again.");
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

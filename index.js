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

// /eldorado — Eldorado Seller Center reporting + sync
const eldoradoCommand = new SlashCommandBuilder()
  .setName("eldorado")
  .setDescription("Eldorado Seller Center: stock, offers, orders and sync")
  .addSubcommand((s) => s.setName("overview").setDescription("Connection status and totals"))
  .addSubcommand((s) => s.setName("stock").setDescription("Available Eldorado inventory"))
  .addSubcommand((s) => s.setName("offers").setDescription("Cached Eldorado offers"))
  .addSubcommand((s) => s.setName("orders").setDescription("Recent Eldorado orders"))
  .addSubcommand((s) =>
    s
      .setName("order")
      .setDescription("Look up one order")
      .addStringOption((o) => o.setName("id").setDescription("Order ID").setRequired(true))
  )
  .addSubcommand((s) =>
    s
      .setName("search")
      .setDescription("Search inventory by internal ID, title or offer")
      .addStringOption((o) => o.setName("query").setDescription("What to search for").setRequired(true))
  )
  .addSubcommand((s) => s.setName("sync").setDescription("Sync offers and orders from Eldorado"))
  .toJSON();

// /sa — SellAuth shop management
const sub = (name, description, options = []) => (s) => {
  s.setName(name).setDescription(description);
  for (const o of options) {
    if (o.choices) {
      s.addStringOption((x) => {
        x.setName(o.name).setDescription(o.description).setRequired(!!o.required);
        for (const c of o.choices) x.addChoices({ name: c, value: c });
        return x;
      });
    } else {
      s.addStringOption((x) =>
        x.setName(o.name).setDescription(o.description).setRequired(!!o.required)
      );
    }
  }
  return s;
};
const opt = (name, description, required = false, choices = null) => ({ name, description, required, choices });

const saCommand = new SlashCommandBuilder()
  .setName("sa")
  .setDescription("SellAuth shop management")
  .addSubcommand(sub("products", "List all products in the shop", [opt("search", "Filter by name")]))
  .addSubcommand(sub("product", "View details of a specific product", [opt("product", "Product name or ID", true)]))
  .addSubcommand(sub("addproduct", "Create a new product", [opt("name", "Product name", true), opt("price", "Price, e.g. 9.99", true), opt("description", "Product description"), opt("variant", "First variant name"), opt("currency", "Currency code (default USD)")]))
  .addSubcommand(sub("editproduct", "Edit an existing product", [opt("product", "Product name or ID", true), opt("name", "New name"), opt("price", "New price for every variant"), opt("description", "New description")]))
  .addSubcommand(sub("deleteproduct", "Delete a product", [opt("product", "Product name or ID", true), opt("confirm", "Type yes to confirm", true)]))
  .addSubcommand(sub("orders", "List recent orders", [opt("limit", "How many (1-25)")]))
  .addSubcommand(sub("order", "View a specific order", [opt("id", "Order / invoice ID", true)]))
  .addSubcommand(sub("invoices", "List recent invoices", [opt("limit", "How many (1-25)")]))
  .addSubcommand(sub("coupons", "List all coupons"))
  .addSubcommand(sub("addcoupon", "Create a discount coupon", [opt("code", "Coupon code", true), opt("discount", "Discount amount", true), opt("type", "Discount type", false, ["percentage", "fixed"]), opt("max_uses", "Maximum uses")]))
  .addSubcommand(sub("deletecoupon", "Delete a coupon", [opt("code", "Coupon code or ID", true)]))
  .addSubcommand(sub("blacklist", "List blacklist entries"))
  .addSubcommand(sub("blacklistadd", "Add an entry to the blacklist", [opt("value", "Value to block", true), opt("type", "Entry type", false, ["email", "email_domain", "discord_id", "country_code", "ip"]), opt("reason", "Reason")]))
  .addSubcommand(sub("blacklistremove", "Remove a blacklist entry", [opt("value", "Value or entry ID", true)]))
  .addSubcommand(sub("shopinfo", "View shop details"))
  .addSubcommand(sub("revenue", "Check revenue and stats"))
  .addSubcommand(sub("topproducts", "View top 5 products by revenue"))
  .addSubcommand(sub("help", "Show every /sa subcommand with usage examples"))
  .toJSON();


// /replacements — read-only view of the auto replacement system
const replacementsCommand = new SlashCommandBuilder()
  .setName("replacements")
  .setDescription("Auto replacement system: activity, pending requests and stock")
  .addSubcommand((s) => s.setName("overview").setDescription("Totals for completed, pending and failed replacements"))
  .addSubcommand((s) =>
    s
      .setName("recent")
      .setDescription("See the latest replacements that were issued")
      .addIntegerOption((o) => o.setName("limit").setDescription("How many to show (1-20)"))
  )
  .addSubcommand((s) =>
    s
      .setName("pending")
      .setDescription("Replacements waiting for staff approval")
      .addIntegerOption((o) => o.setName("limit").setDescription("How many to show (1-20)"))
  )
  .addSubcommand((s) =>
    s
      .setName("logs")
      .setDescription("Full activity log: checks, attempts, approvals and denials")
      .addIntegerOption((o) => o.setName("limit").setDescription("How many to show (1-20)"))
  )
  .addSubcommand((s) => s.setName("stock").setDescription("Replacement stock available right now"))
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
    await rest.put(Routes.applicationCommands(client.user.id), {
      body: [stockCommand, eldoradoCommand, saCommand, replacementsCommand],
    });
    console.log("Registered /stock, /eldorado, /sa and /replacements");
  } catch (err) {
    console.error("Could not register commands:", err);
  }
});

// /eldorado — forwarded to the dashboard, which re-checks roles.
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand() || interaction.commandName !== "eldorado") return;
  const sub = interaction.options.getSubcommand();
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const options = {};
  for (const key of ["id", "query"]) {
    const v = interaction.options.getString(key);
    if (v) options[key] = v;
  }

  try {
    const res = await fetch(SITE + "/api/public/discord/eldorado", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bot " + token },
      body: JSON.stringify({
        sub,
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
    if (data.content && data.content !== "unauthorized") payload.content = data.content;
    if (Array.isArray(data.embeds) && data.embeds.length) payload.embeds = data.embeds;
    if (!payload.content && !payload.embeds)
      payload.content = "⚠️ The Eldorado request failed (HTTP " + res.status + ").";
    await interaction.editReply(payload);
  } catch (err) {
    console.error("eldorado relay failed:", err);
    await interaction.editReply("⚠️ Could not reach the VWI Sorter dashboard.");
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

// /sa — SellAuth shop management, forwarded to the dashboard (roles re-checked there).
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand() || interaction.commandName !== "sa") return;
  const sub = interaction.options.getSubcommand();
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const options = {};
  for (const key of ["product", "search", "name", "price", "description", "variant", "currency", "confirm", "id", "limit", "code", "discount", "type", "max_uses", "value", "reason"]) {
    const v = interaction.options.getString(key);
    if (v) options[key] = v;
  }

  try {
    const res = await fetch(SITE + "/api/public/discord/sellauth", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bot " + token },
      body: JSON.stringify({
        sub,
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
    if (!payload.content && !payload.embeds)
      payload.content = "⚠️ The SellAuth request failed (HTTP " + res.status + ").";
    await interaction.editReply(payload);
  } catch (err) {
    console.error("sa relay failed:", err);
    await interaction.editReply("⚠️ Could not reach the VWI Sorter dashboard.");
  }
});

// /replacements — forwarded to the dashboard, which re-checks roles.
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand() || interaction.commandName !== "replacements") return;
  const sub = interaction.options.getSubcommand();
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const options = {};
  const limit = interaction.options.getInteger("limit");
  if (limit !== null && limit !== undefined) options.limit = String(limit);

  try {
    const res = await fetch(SITE + "/api/public/discord/replacements", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bot " + token },
      body: JSON.stringify({
        sub,
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
    if (data.content && data.content !== "unauthorized") payload.content = data.content;
    if (Array.isArray(data.embeds) && data.embeds.length) payload.embeds = data.embeds;
    if (!payload.content && !payload.embeds)
      payload.content = "⚠️ The replacement request failed (HTTP " + res.status + ").";
    await interaction.editReply(payload);
  } catch (err) {
    console.error("replacements relay failed:", err);
    await interaction.editReply("⚠️ Could not reach the VWI Sorter dashboard.");
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

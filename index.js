const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActivityType,
  MessageFlags,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  SectionBuilder,
  ThumbnailBuilder,
} = require("discord.js");

const CONFIG = {
  token: process.env.DISCORD_TOKEN || "<BotToken>",
  channelId: process.env.STATUS_CHANNEL_ID || "<channelID>",
  messageId: process.env.STATUS_MESSAGE_ID || null,

  javaHost: "br.matrixmc.in",
  javaPort: 25565,

  bedrockHost: "br.matrixmc.in",
  bedrockPort: 25565,

  servers: [
    {
      name: "<server1>",
      emojiStr: "<emoji1>",
      emoji: { id: "", name: "", animated: false },
      host: "", port: ,
    },
    {
      name: "<server1>",
      emojiStr: "<emoji1>",
      emoji: { id: "", name: "", animated: false },
      host: "", port: ,
    },
    {
      name: "<server1>",
      emojiStr: "<emoji1>",
      emoji: { id: "", name: "", animated: false },
      host: "", port: ,
    },
    {
      name: "<server1>",
      emojiStr: "<emoji1>",
      emoji: { id: "", name: "", animated: false },
      host: "", port: ,
    },
  ],

  onlineEmoji:  "<:arrow2:1337265173915766805>",
  offlineEmoji: "<:arrow_downn:1482944993969574079>",

  refreshInterval: 3 * 60 * 1000,
  queryTimeout: 8000,
};

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

async function queryServer(host, port, bedrock = false) {
  try {
    const type = bedrock ? "bedrock" : "java";
    const url = "https://api.mcstatus.io/v2/status/" + type + "/" + host + ":" + port;
    const res = await fetch(url, { signal: AbortSignal.timeout(CONFIG.queryTimeout) });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    return {
      online: data.online ?? false,
      players: data.players?.online ?? 0,
      max: data.players?.max ?? 0,
      list: (data.players?.list ?? []).map((p) => p.name_clean ?? p.name_raw ?? "Unknown").filter(Boolean),
    };
  } catch (err) {
    console.warn("[Matrix Network] Could not reach " + host + ":" + port + " — " + err.message);
    return { online: false, players: 0, max: 0, list: [] };
  }
}

async function buildComponents() {
  const now = new Date();

  const [javaProxy, bedrockProxy, ...subResults] = await Promise.all([
    queryServer(CONFIG.javaHost, CONFIG.javaPort, false),
    queryServer(CONFIG.bedrockHost, CONFIG.bedrockPort, true),
    ...CONFIG.servers.map((s) => queryServer(s.host, s.port)),
  ]);

  const totalPlayers = subResults.reduce((a, r) => a + (r.online ? r.players : 0), 0);
  const javaStatus    = javaProxy.online    ? CONFIG.onlineEmoji : CONFIG.offlineEmoji;
  const bedrockStatus = bedrockProxy.online ? CONFIG.onlineEmoji : CONFIG.offlineEmoji;

  const timeString = now.toLocaleTimeString("en-GB", {
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    timeZone: "Asia/Kolkata",
  }) + " IST";

  // ── Overview lines ──
  const overviewLines = CONFIG.servers
    .map((s, i) => {
      const r = subResults[i];
      const dot = r.online ? CONFIG.onlineEmoji : CONFIG.offlineEmoji;
      const status = r.online ? r.players + " players" : "Offline";
      return dot + "  " + s.emojiStr + "  **" + s.name + "**  —  " + status;
    })
    .join("\n");

  const eitherOnline = javaProxy.online || bedrockProxy.online;

  // ── Container (no color = no accent) ──
  const container = new ContainerBuilder()

    // Header section: title + thumbnail
    .addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            "# Matrix Network — Status\n" +
            (eitherOnline ? "🟢  **ONLINE**" : "🔴  **OFFLINE**") +
            "  •  **" + totalPlayers + "** player" + (totalPlayers !== 1 ? "s" : "") + " online"
          )
        )
        .setThumbnailAccessory(
          new ThumbnailBuilder().setURL("https://api.mcstatus.io/v2/icon/play.matrixmc.in")
        )
    )

    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
    )

    // Java Edition
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        "☕  **Java Edition**  " +
        "\nIP:\n```\nplay.matrixmc.in\n```"
      )
    )

    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(false).setSpacing(SeparatorSpacingSize.Small)
    )

    // Bedrock Edition
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        "<:bedrock:1337265441718009928>  **Bedrock Edition**  " +
        "\nIP:\n```\nbr.matrixmc.in\n```PORT:\n```\n25565\n```"
      )
    )

    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
    )

    // Server Overview
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        "<:Chart:1374712365668634645>  **Server Overview**\n" + overviewLines
      )
    )

    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
    )

    // Footer
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        "-# Last refreshed • " + timeString
      )
    );

  // ── Buttons ──
  const refreshRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("refresh")
      .setLabel("🔄  Refresh")
      .setStyle(ButtonStyle.Secondary)
  );

  const playerRow = new ActionRowBuilder().addComponents(
    ...CONFIG.servers.map((s, i) => {
      const btn = new ButtonBuilder()
        .setCustomId("players_" + i)
        .setLabel(s.name + " Players")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!subResults[i].online || subResults[i].list.length === 0);
      if (s.emoji) btn.setEmoji(s.emoji);
      return btn;
    })
  );

  return { container, refreshRow, playerRow, subResults };
}

async function updateStatus(channel) {
  try {
    const { container, refreshRow, playerRow, subResults } = await buildComponents();
    client._subResults = subResults;

    const payload = {
      components: [container, refreshRow, playerRow],
      flags: MessageFlags.IsComponentsV2,
    };

    if (client._statusMessage) {
      await client._statusMessage.edit(payload);
    } else {
      client._statusMessage = await channel.send(payload);
    }

    const total = subResults.reduce((a, r) => a + (r.online ? r.players : 0), 0);
    client.user.setActivity(total + " players online", { type: ActivityType.Watching });
  } catch (err) {
    console.error("[Matrix Network] Failed to update status:", err.message);
  }
}

client.once("ready", async () => {
  console.log("[Matrix Network] Logged in as " + client.user.tag);

  const channel = await client.channels.fetch(CONFIG.channelId).catch(() => null);
  if (!channel) {
    console.error("[Matrix Network] Could not find the status channel.");
    return;
  }

  if (CONFIG.messageId) {
    client._statusMessage = await channel.messages.fetch(CONFIG.messageId).catch(() => null);
  }

  await updateStatus(channel);
  setInterval(() => updateStatus(channel), CONFIG.refreshInterval);
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isButton()) return;

  if (interaction.customId === "refresh") {
    await interaction.deferUpdate();
    await updateStatus(interaction.channel);
    return;
  }

  const match = interaction.customId.match(/^players_(\d+)$/);
  if (match) {
    const idx = parseInt(match[1]);
    const server = CONFIG.servers[idx];
    const result = client._subResults?.[idx];

    if (!result || !result.online) {
      await interaction.reply({ content: "❌ That server is currently offline.", ephemeral: true });
      return;
    }

    const list = result.list;
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(server.emojiStr + "  " + server.name + " — Players Online")
      .setDescription(
        list.length > 0
          ? list.map((p) => "• `" + p + "`").join("\n")
          : "*No player names available*"
      )
      .setFooter({ text: result.players + "/" + result.max + " players • Matrix Network" });

    await interaction.reply({ embeds: [embed], ephemeral: true });
  }
});

client.login(CONFIG.token);

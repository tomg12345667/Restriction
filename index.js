const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');

const fs = require('fs');

// ================= CONFIG =================
const TOKEN = "YOUR_BOT_TOKEN";
const CLIENT_ID = "YOUR_CLIENT_ID";

const APPEAL_LINK =
  "https://discordapp.com/channels/1459382913379471533/1495200375693770752/1495204459096047640";

// ================= CLIENT =================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers
  ]
});

// ================= STORAGE =================
let config = {
  logChannelId: "",
  restrictedRoleId: "",
  unrestrictedRoleId: "",
  allowedRoles: []
};

let cases = [];
let caseCounter = 1;

// ================= LOAD FILES =================
if (fs.existsSync('./config.json')) {
  config = JSON.parse(fs.readFileSync('./config.json'));
}

if (fs.existsSync('./cases.json')) {
  cases = JSON.parse(fs.readFileSync('./cases.json'));

  if (cases.length > 0) {
    const nums = cases.map(c =>
      parseInt(c.caseId.replace("MOD-", ""))
    );

    caseCounter = Math.max(...nums) + 1;
  }
}

// ================= SAVE =================
function saveConfig() {
  fs.writeFileSync('./config.json', JSON.stringify(config, null, 2));
}

function saveCases() {
  fs.writeFileSync('./cases.json', JSON.stringify(cases, null, 2));
}

// ================= HELPERS =================
function allowed(member) {
  if (!config.allowedRoles.length) return true;

  return member.roles.cache.some(role =>
    config.allowedRoles.includes(role.id)
  );
}

function sendLog(guild, embed, components = []) {
  const channel = guild.channels.cache.get(config.logChannelId);

  if (channel) {
    channel.send({
      embeds: [embed],
      components
    });
  }
}

async function sendModerationDM(user, action, reason, caseId) {

  const embed = new EmbedBuilder()
    .setTitle("🔔 Moderation Notice")
    .setColor(0xff0000)
    .addFields(
      {
        name: "Action",
        value: action
      },
      {
        name: "Reason",
        value: reason
      },
      {
        name: "Case ID",
        value: caseId
      },
      {
        name: "Appeal",
        value: `Start an Appeal at:\n${APPEAL_LINK}`
      }
    )
    .setFooter({
      text: "RingNet Moderation System"
    });

  try {
    await user.send({
      embeds: [embed]
    });
  } catch {}
}

// ================= BUTTONS =================
function appealButtons(caseId) {

  return new ActionRowBuilder().addComponents(

    new ButtonBuilder()
      .setCustomId(`appeal_start_${caseId}`)
      .setLabel("Appeal Start")
      .setStyle(ButtonStyle.Primary),

    new ButtonBuilder()
      .setCustomId(`appeal_approved_${caseId}`)
      .setLabel("Appeal Approved")
      .setStyle(ButtonStyle.Success),

    new ButtonBuilder()
      .setCustomId(`appeal_denied_${caseId}`)
      .setLabel("Appeal Denied")
      .setStyle(ButtonStyle.Danger),

    new ButtonBuilder()
      .setCustomId(`appeal_end_${caseId}`)
      .setLabel("Appeal End")
      .setStyle(ButtonStyle.Secondary)
  );
}

// ================= COMMANDS =================
const commands = [

  // SETUP
  new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Setup moderation system')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)

    .addChannelOption(o =>
      o.setName('logchannel')
        .setDescription('Log channel')
        .setRequired(true)
    )

    .addRoleOption(o =>
      o.setName('restrictedrole')
        .setDescription('Restricted role')
        .setRequired(true)
    )

    .addRoleOption(o =>
      o.setName('unrestrictedrole')
        .setDescription('Unrestricted role')
        .setRequired(true)
    )

    .addRoleOption(o =>
      o.setName('role1')
        .setDescription('Allowed role #1')
        .setRequired(true)
    )

    .addRoleOption(o =>
      o.setName('role2')
        .setDescription('Allowed role #2')
        .setRequired(false)
    )

    .addRoleOption(o =>
      o.setName('role3')
        .setDescription('Allowed role #3')
        .setRequired(false)
    ),

  // RESTRICT
  new SlashCommandBuilder()
    .setName('restrict')
    .setDescription('Restrict a user')

    .addUserOption(o =>
      o.setName('user')
        .setDescription('User')
        .setRequired(true)
    )

    .addStringOption(o =>
      o.setName('reason')
        .setDescription('Reason')
        .setRequired(true)
    )

    .addStringOption(o =>
      o.setName('confirm')
        .setDescription('Type Y')
        .setRequired(true)
    ),

  // UNRESTRICT
  new SlashCommandBuilder()
    .setName('unrestrict')
    .setDescription('Unrestrict a user')

    .addUserOption(o =>
      o.setName('user')
        .setDescription('User')
        .setRequired(true)
    )

    .addStringOption(o =>
      o.setName('reason')
        .setDescription('Reason')
        .setRequired(true)
    )

    .addStringOption(o =>
      o.setName('confirm')
        .setDescription('Type Y')
        .setRequired(true)
    ),

  // HISTORY
  new SlashCommandBuilder()
    .setName('history')
    .setDescription('View moderation history')

    .addUserOption(o =>
      o.setName('user')
        .setDescription('User')
        .setRequired(true)
    )
];

// ================= REGISTER =================
const rest = new REST({
  version: '10'
}).setToken(TOKEN);

(async () => {

  try {

    await rest.put(
      Routes.applicationCommands(CLIENT_ID),
      {
        body: commands.map(c => c.toJSON())
      }
    );

    console.log("✅ Commands registered");

  } catch (err) {

    console.log(err);

  }

})();

// ================= INTERACTIONS =================
client.on('interactionCreate', async interaction => {

  // ================= BUTTONS =================
  if (interaction.isButton()) {

    await interaction.deferReply({
      ephemeral: true
    });

    const parts = interaction.customId.split("_");

    const action = parts[1];
    const caseId = parts.slice(2).join("_");

    const foundCase = cases.find(c => c.caseId === caseId);

    if (!foundCase) {
      return interaction.editReply("❌ Case not found");
    }

    let status = "";

    // ================= APPEAL START =================
    if (action === "start") {

      status = "🟦 Appeal Started";

      try {

        const user = await client.users.fetch(foundCase.user);

        const dm = new EmbedBuilder()
          .setTitle("🟦 Appeal Started")
          .setColor(0x5865F2)
          .addFields(
            {
              name: "Case ID",
              value: caseId
            },
            {
              name: "Information",
              value:
                "Your appeal has been started.\nPlease look out for a DM from RingNet Modmail."
            }
          );

        await user.send({
          embeds: [dm]
        });

      } catch {}

    }

    // ================= APPROVED =================
    if (action === "approved") {
      status = "🟢 Appeal Approved";
    }

    // ================= DENIED =================
    if (action === "denied") {
      status = "🔴 Appeal Denied";
    }

    // ================= END =================
    if (action === "end") {
      status = "⚫ Appeal Closed";
    }

    // SAVE STATUS
    foundCase.appealStatus = status;

    saveCases();

    // UPDATE EMBED
    const embed = EmbedBuilder.from(
      interaction.message.embeds[0]
    );

    const filteredFields =
      embed.data.fields?.filter(
        f => f.name !== "Appeal Status"
      ) || [];

    embed.setFields(
      ...filteredFields,
      {
        name: "Appeal Status",
        value: status
      }
    );

    await interaction.message.edit({
      embeds: [embed],
      components: interaction.message.components
    });

    return interaction.editReply(
      `✅ Updated ${caseId}`
    );
  }

  // ================= COMMANDS =================
  if (!interaction.isChatInputCommand()) return;

  // ================= SETUP =================
  if (interaction.commandName === "setup") {

    await interaction.deferReply({
      ephemeral: true
    });

    config.logChannelId =
      interaction.options.getChannel('logchannel').id;

    config.restrictedRoleId =
      interaction.options.getRole('restrictedrole').id;

    config.unrestrictedRoleId =
      interaction.options.getRole('unrestrictedrole').id;

    config.allowedRoles = [

      interaction.options.getRole('role1')?.id,
      interaction.options.getRole('role2')?.id,
      interaction.options.getRole('role3')?.id

    ].filter(Boolean);

    saveConfig();

    return interaction.editReply(
      "✅ Setup complete"
    );
  }

  // ================= RESTRICT =================
  if (interaction.commandName === "restrict") {

    await interaction.deferReply({
      ephemeral: true
    });

    if (!allowed(interaction.member)) {
      return interaction.editReply(
        "❌ No permission"
      );
    }

    const user =
      interaction.options.getUser('user');

    const reason =
      interaction.options.getString('reason');

    const confirm =
      interaction.options.getString('confirm');

    if (confirm.toLowerCase() !== "y") {
      return interaction.editReply(
        "Cancelled"
      );
    }

    const member =
      await interaction.guild.members.fetch(user.id);

    await member.roles.add(
      config.restrictedRoleId
    );

    await member.roles.remove(
      config.unrestrictedRoleId
    );

    const caseId =
      `MOD-${String(caseCounter).padStart(4, "0")}`;

    caseCounter++;

    const newCase = {
      caseId,
      user: user.id,
      type: "Restriction",
      reason,
      appealStatus: "None"
    };

    cases.push(newCase);

    saveCases();

    const embed = new EmbedBuilder()
      .setTitle("🔴 User Restricted")
      .setColor(0xff0000)
      .addFields(
        {
          name: "User",
          value: user.tag
        },
        {
          name: "Reason",
          value: reason
        },
        {
          name: "Case ID",
          value: caseId
        },
        {
          name: "Appeal Status",
          value: "None"
        }
      );

    sendLog(
      interaction.guild,
      embed,
      [appealButtons(caseId)]
    );

    await sendModerationDM(
      user,
      "Restricted",
      reason,
      caseId
    );

    return interaction.editReply(
      `✅ ${caseId}`
    );
  }

  // ================= UNRESTRICT =================
  if (interaction.commandName === "unrestrict") {

    await interaction.deferReply({
      ephemeral: true
    });

    if (!allowed(interaction.member)) {
      return interaction.editReply(
        "❌ No permission"
      );
    }

    const user =
      interaction.options.getUser('user');

    const reason =
      interaction.options.getString('reason');

    const confirm =
      interaction.options.getString('confirm');

    if (confirm.toLowerCase() !== "y") {
      return interaction.editReply(
        "Cancelled"
      );
    }

    const member =
      await interaction.guild.members.fetch(user.id);

    await member.roles.remove(
      config.restrictedRoleId
    );

    await member.roles.add(
      config.unrestrictedRoleId
    );

    const caseId =
      `MOD-${String(caseCounter).padStart(4, "0")}`;

    caseCounter++;

    const newCase = {
      caseId,
      user: user.id,
      type: "Unrestriction",
      reason
    };

    cases.push(newCase);

    saveCases();

    const embed = new EmbedBuilder()
      .setTitle("🟢 User Unrestricted")
      .setColor(0x00ff00)
      .addFields(
        {
          name: "User",
          value: user.tag
        },
        {
          name: "Reason",
          value: reason
        },
        {
          name: "Case ID",
          value: caseId
        }
      );

    sendLog(
      interaction.guild,
      embed
    );

    await sendModerationDM(
      user,
      "Unrestricted",
      reason,
      caseId
    );

    return interaction.editReply(
      `✅ ${caseId}`
    );
  }

  // ================= HISTORY =================
  if (interaction.commandName === "history") {

    await interaction.deferReply({
      ephemeral: true
    });

    if (!allowed(interaction.member)) {
      return interaction.editReply(
        "❌ No permission"
      );
    }

    const user =
      interaction.options.getUser('user');

    const history =
      cases.filter(c => c.user === user.id);

    if (!history.length) {
      return interaction.editReply(
        "No cases found."
      );
    }

    const lines = history.map(c =>
      `${c.caseId} | ${c.type} | ${c.reason}`
    );

    const embed = new EmbedBuilder()
      .setTitle(`📁 History: ${user.tag}`)
      .setColor(0x2f3136)
      .setDescription(
        "```" +
        lines.join("\n") +
        "```"
      );

    return interaction.editReply({
      embeds: [embed]
    });
  }

});

// ================= LOGIN =================
client.login(TOKEN);

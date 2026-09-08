// Rossing T&M CMS Discord bot ("Discord Robot")
//
// Freelancers can work entirely from Discord:
//   /link <code>       — link your Discord account to your CMS account
//                        (the admin gives you the code on the Team tab)
//   /mytasks           — your open tasks, deadlines and latest feedback
//   /submit            — hand in work: pick your task, paste your link, done
//   /status            — pipeline overview of every video in production
//   /checkpoints       — everything awaiting approval, with ✅/❌ buttons
//   /deadlines         — what is overdue or nearly overdue
//   every day at 09:00 — an automatic reminder in the configured channel
//
// The bot talks to the CMS API with a bot token (Settings -> generate bot
// token). On /submit the API acts on behalf of the linked freelancer (the
// X-Discord-User header), so all the CMS role rules still apply. Only Discord
// members with the "CMS Admin" role can use the approval buttons.
//
// Setup: copy .env.example to .env and fill it in, then `npm install && npm start`.
import {
  Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags,
  ModalBuilder, TextInputBuilder, TextInputStyle,
  StringSelectMenuBuilder
} from 'discord.js';
import fs from 'node:fs';

// Minimal .env loader (no dependency needed)
if (fs.existsSync(new URL('.env', import.meta.url))) {
  for (const regel of fs.readFileSync(new URL('.env', import.meta.url), 'utf8').split('\n')) {
    const m = regel.match(/^([A-Z_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}

const {
  DISCORD_TOKEN,        // bot token from the Discord Developer Portal
  DISCORD_CLIENT_ID,    // application id
  DISCORD_GUILD_ID,     // your server id
  DISCORD_ADMIN_ROLE = 'CMS Admin', // Discord role allowed to approve or reject
  DISCORD_REMINDER_CHANNEL_ID = '', // channel for the morning reminder
  CMS_URL = 'http://localhost:3000',
  CMS_BOT_TOKEN         // Settings -> "Generate bot token" in the CMS
} = process.env;

if (!DISCORD_TOKEN || !DISCORD_CLIENT_ID || !CMS_BOT_TOKEN) {
  console.error('Fill in .env (see .env.example). Missing: Discord token, client id or CMS_BOT_TOKEN.');
  process.exit(1);
}

// --- CMS API client ---------------------------------------------------------
// Passing discordUserId makes the API act on behalf of that linked user.
async function cms(path, opts = {}, discordUserId = null) {
  const res = await fetch(`${CMS_URL}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      'X-Bot-Token': CMS_BOT_TOKEN,
      ...(discordUserId ? { 'X-Discord-User': discordUserId } : {})
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `CMS error ${res.status}`);
  return data;
}

const STATUS_LABEL = {
  in_progress: '🟣 in progress',
  rejected: '🔴 revision needed',
  awaiting_approval: '🟡 awaiting approval'
};

// --- register the slash commands -------------------------------------------
const commands = [
  new SlashCommandBuilder().setName('link').setDescription('Link your Discord account to your CMS account')
    .addStringOption(o => o.setName('code').setDescription('Link code from the admin').setRequired(true)),
  new SlashCommandBuilder().setName('mytasks').setDescription('Your open tasks, deadlines and feedback'),
  new SlashCommandBuilder().setName('submit').setDescription('Hand in work for one of your tasks'),
  new SlashCommandBuilder().setName('idea').setDescription('Pitch an idea for the idea bank')
    .addStringOption(o => o.setName('title').setDescription('Working title of the idea').setRequired(true))
    .addStringOption(o => o.setName('why').setDescription('Why is this a good idea?').setRequired(false))
    .addStringOption(o => o.setName('source').setDescription('Link to the outlier or competitor that inspired it').setRequired(false)),
  new SlashCommandBuilder().setName('ideas').setDescription('The best scoring ideas on the shelf'),
  new SlashCommandBuilder().setName('status').setDescription('Pipeline overview of every video in production'),
  new SlashCommandBuilder().setName('checkpoints').setDescription('Everything awaiting approval, with buttons'),
  new SlashCommandBuilder().setName('deadlines').setDescription('Deadlines that are overdue or nearly overdue')
].map(c => c.toJSON());

const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
if (DISCORD_GUILD_ID) {
  await rest.put(Routes.applicationGuildCommands(DISCORD_CLIENT_ID, DISCORD_GUILD_ID), { body: commands });
} else {
  await rest.put(Routes.applicationCommands(DISCORD_CLIENT_ID), { body: commands });
}

// --- bot -------------------------------------------------------------------
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

function isCmsAdmin(interaction) {
  return interaction.member?.roles?.cache?.some(r => r.name === DISCORD_ADMIN_ROLE);
}

async function checkpointEmbeds() {
  const d = await cms('/api/dashboard');
  if (!d.openCheckpoints.length) return { content: '✅ Nothing is waiting for approval.', embeds: [], components: [] };
  const embeds = [];
  const components = [];
  for (const c of d.openCheckpoints.slice(0, 10)) {
    embeds.push(new EmbedBuilder()
      .setTitle(`⏸️ ${c.stap} — ${c.werktitel}`)
      .setDescription(`Channel: **${c.kanaal}**${c.opleverLink ? `\n[View delivery](${c.opleverLink})` : ''}`)
      .setColor(0xfee75c));
    components.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`keur:goed:${c.videoId}:${c.stapKey}`).setLabel('Approve').setEmoji('✅').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`keur:af:${c.videoId}:${c.stapKey}`).setLabel('Reject').setEmoji('❌').setStyle(ButtonStyle.Danger)
    ));
  }
  return { embeds, components };
}

client.on('interactionCreate', async interaction => {
  try {
    // ---------- slash commands ----------
    if (interaction.isChatInputCommand()) {
      const cmd = interaction.commandName;

      if (cmd === 'link') {
        const { naam, functie } = await cms('/api/discord/koppel', {
          method: 'POST',
          body: { code: interaction.options.getString('code'), discordUserId: interaction.user.id, discordNaam: interaction.user.username }
        });
        return interaction.reply({ content: `🔗 Done. You are linked as **${naam}** (${functie}). Use /mytasks to see your work.`, flags: MessageFlags.Ephemeral });
      }

      if (cmd === 'mytasks') {
        const { taken, naam } = await cms('/api/mijn-taken', {}, interaction.user.id);
        if (naam === 'Discord bot') {
          return interaction.reply({ content: 'Your account is not linked yet. Ask the admin for a link code and use /link.', flags: MessageFlags.Ephemeral });
        }
        if (!taken.length) return interaction.reply({ content: `📭 No open tasks, ${naam}. Nicely done.`, flags: MessageFlags.Ephemeral });
        const regels = taken.map(t =>
          `${STATUS_LABEL[t.status] || t.status} — **${t.stap}** for *${t.werktitel}* (${t.kanaal})${t.deadline ? ` · 📅 ${t.deadline}` : ''}${t.feedback && t.status === 'rejected' ? `\n   ↳ 💬 ${t.feedback}` : ''}`);
        return interaction.reply({
          embeds: [new EmbedBuilder().setTitle(`📋 Tasks for ${naam}`).setDescription(regels.join('\n')).setColor(0x7c5cff)],
          flags: MessageFlags.Ephemeral
        });
      }

      if (cmd === 'submit') {
        const { taken, naam } = await cms('/api/mijn-taken', {}, interaction.user.id);
        if (naam === 'Discord bot') {
          return interaction.reply({ content: 'Your account is not linked yet. Ask the admin for a link code and use /link.', flags: MessageFlags.Ephemeral });
        }
        const inleverbaar = taken.filter(t => t.status === 'in_progress' || t.status === 'rejected');
        if (!inleverbaar.length) return interaction.reply({ content: 'You have nothing to hand in.', flags: MessageFlags.Ephemeral });
        const menu = new StringSelectMenuBuilder()
          .setCustomId('inleveren:kies')
          .setPlaceholder('Which task are you handing in?')
          .addOptions(inleverbaar.slice(0, 25).map(t => ({
            label: `${t.stap} — ${t.werktitel}`.slice(0, 100),
            description: t.kanaal.slice(0, 100),
            value: `${t.videoId}:${t.stapKey}`
          })));
        return interaction.reply({
          content: 'Pick the task you want to hand in:',
          components: [new ActionRowBuilder().addComponents(menu)],
          flags: MessageFlags.Ephemeral
        });
      }

      if (cmd === 'idea') {
        const titel = interaction.options.getString('title');
        await cms('/api/ideeen', {
          method: 'POST',
          body: {
            titel,
            omschrijving: interaction.options.getString('why') || '',
            bron: interaction.options.getString('source') || ''
          }
        }, interaction.user.id);
        return interaction.reply(`💡 **${interaction.member?.displayName || interaction.user.username}** pitched an idea: **${titel}**`);
      }

      if (cmd === 'ideas') {
        const { ideeen, voorraad } = await cms('/api/ideeen?status=');
        const open = ideeen.filter(i => i.status === 'new' || i.status === 'approved').slice(0, 10);
        const regels = open.length
          ? open.map(i => `${i.score != null ? `**${i.score}/5**` : '– '} · ${i.titel}${i.status === 'approved' ? ' ✅' : ''}`)
          : ['No ideas on the shelf yet. Pitch one with `/idea`.'];
        const alarm = voorraad.filter(v => v.status === 'critical');
        if (alarm.length) {
          regels.push('', '⚠️ **Stock critical:** ' + alarm.map(v => `${v.kanaal} (${v.wekenVoorraad} wk)`).join(', '));
        }
        return interaction.reply({ embeds: [new EmbedBuilder().setTitle('💡 Idea bank').setDescription(regels.join('\n')).setColor(0x7c5cff)] });
      }

      if (cmd === 'status') {
        const [{ videos }, { channels }] = await Promise.all([cms('/api/videos'), cms('/api/channels')]);
        const actief = videos.filter(v => !v.afgerond);
        if (!actief.length) return interaction.reply('No videos in production.');
        const regels = actief.map(v => {
          const stap = v.stappen.find(s => s.status !== 'approved');
          const kanaal = channels.find(c => c.id === v.channelId)?.naam || '?';
          return `🎬 **${v.werktitel}** (${kanaal}) — now at: *${stap?.naam}* (${stap?.status.replace('_', ' ')})`;
        });
        return interaction.reply({ embeds: [new EmbedBuilder().setTitle('📊 Pipeline status').setDescription(regels.join('\n')).setColor(0x7c5cff)] });
      }

      if (cmd === 'checkpoints') {
        return interaction.reply(await checkpointEmbeds());
      }

      if (cmd === 'deadlines') {
        const d = await cms('/api/dashboard');
        if (!d.deadlines.length) return interaction.reply('⏰ No deadlines at risk.');
        const regels = d.deadlines.map(x =>
          `${x.urgentie === 'overdue' ? '🔴 OVERDUE' : '🟡 <24h'} — **${x.werktitel}** · ${x.stap} · ${x.assignee} · ${x.deadline}`);
        return interaction.reply({ embeds: [new EmbedBuilder().setTitle('⏰ Deadlines').setDescription(regels.join('\n')).setColor(0xeb459e)] });
      }
    }

    // ---------- task chosen -> modal for the delivery link ----------
    if (interaction.isStringSelectMenu() && interaction.customId === 'inleveren:kies') {
      const [videoId, stapKey] = interaction.values[0].split(':');
      const modal = new ModalBuilder()
        .setCustomId(`inleveren:modal:${videoId}:${stapKey}`)
        .setTitle('Hand in work')
        .addComponents(new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('link')
            .setLabel('Link to your delivery (Drive, Frame.io, …)')
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
        ));
      return interaction.showModal(modal);
    }

    // ---------- modal submitted -> hand in through the CMS API ----------
    if (interaction.isModalSubmit() && interaction.customId.startsWith('inleveren:modal:')) {
      const [, , videoId, stapKey] = interaction.customId.split(':');
      const link = interaction.fields.getTextInputValue('link');
      await cms(`/api/videos/${videoId}/stappen/${stapKey}/inleveren`, {
        method: 'POST', body: { opleverLink: link }
      }, interaction.user.id);
      return interaction.reply({ content: '📤 Handed in. The admin gets a notification and will review your work as soon as possible.', flags: MessageFlags.Ephemeral });
    }

    // ---------- approval buttons (CMS Admin role only) ----------
    if (interaction.isButton() && interaction.customId.startsWith('keur:')) {
      if (!isCmsAdmin(interaction)) {
        return interaction.reply({ content: `Only members with the "${DISCORD_ADMIN_ROLE}" role can approve or reject.`, flags: MessageFlags.Ephemeral });
      }
      const [, richting, videoId, stapKey] = interaction.customId.split(':');
      if (richting === 'goed') {
        await cms(`/api/videos/${videoId}/stappen/${stapKey}/goedkeuren`, { method: 'POST', body: {} }, interaction.user.id);
        return interaction.reply(`✅ **${interaction.member.displayName}** approved the step — the pipeline moves on.`);
      }
      // Rejecting: ask for feedback in a modal first.
      const modal = new ModalBuilder()
        .setCustomId(`afkeuren:modal:${videoId}:${stapKey}`)
        .setTitle('Reject — what needs to change?')
        .addComponents(new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('feedback')
            .setLabel('Feedback for the freelancer')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
        ));
      return interaction.showModal(modal);
    }

    if (interaction.isModalSubmit() && interaction.customId.startsWith('afkeuren:modal:')) {
      if (!isCmsAdmin(interaction)) {
        return interaction.reply({ content: `Only members with the "${DISCORD_ADMIN_ROLE}" role can approve or reject.`, flags: MessageFlags.Ephemeral });
      }
      const [, , videoId, stapKey] = interaction.customId.split(':');
      const feedback = interaction.fields.getTextInputValue('feedback');
      await cms(`/api/videos/${videoId}/stappen/${stapKey}/afkeuren`, {
        method: 'POST', body: { feedback }
      }, interaction.user.id);
      return interaction.reply(`❌ **${interaction.member.displayName}** rejected the step with feedback — the freelancer gets a ping.`);
    }
  } catch (e) {
    const antwoord = { content: `⚠️ ${e.message}`, flags: MessageFlags.Ephemeral };
    if (interaction.deferred || interaction.replied) await interaction.followUp(antwoord).catch(() => {});
    else await interaction.reply(antwoord).catch(() => {});
  }
});

// Morning reminder at 09:00 server time in the configured channel.
function planReminder() {
  const nu = new Date();
  const volgende = new Date(nu);
  volgende.setHours(9, 0, 0, 0);
  if (volgende <= nu) volgende.setDate(volgende.getDate() + 1);
  setTimeout(async () => {
    try {
      if (DISCORD_REMINDER_CHANNEL_ID) {
        const kanaal = await client.channels.fetch(DISCORD_REMINDER_CHANNEL_ID);
        const d = await cms('/api/dashboard');
        const regels = [
          `☀️ Good morning. **${d.videosInProductie}** videos in production, **${d.openCheckpoints.length}** waiting for approval.`,
          ...d.deadlines.map(x => `${x.urgentie === 'overdue' ? '🔴' : '🟡'} ${x.werktitel} · ${x.stap} · ${x.assignee} (${x.deadline})`)
        ];
        await kanaal.send(regels.join('\n'));
      }
    } catch (e) {
      console.error('Reminder failed:', e.message);
    }
    planReminder();
  }, volgende - nu);
}

client.once('clientReady', () => {
  console.log(`Discord bot online as ${client.user.tag}`);
  planReminder();
});
// Older discord.js v14 releases use 'ready' instead of 'clientReady'.
client.once('ready', () => {});

client.login(DISCORD_TOKEN);

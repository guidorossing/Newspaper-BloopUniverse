// Bloop Universe Discord-bot ("Discord Robot")
//
// Freelancers werken volledig via Discord:
//   /koppel <code>     — koppel je Discord-account aan je CMS-account
//                        (code krijg je van de admin via het Team-tabblad)
//   /mijntaken         — jouw open taken, deadlines en laatste feedback
//   /inleveren         — werk inleveren: kies je taak, plak je link, klaar
//   /status            — pipeline-overzicht van alle video's in productie
//   /checkpoints       — alles wat op goedkeuring wacht, mét ✅/❌-knoppen
//   /deadlines         — wat (bijna) te laat is
//   elke ochtend 09:00 — automatische reminder in het ingestelde kanaal
//
// De bot praat met de CMS-API via een bot-token (Instellingen -> genereer
// bot-token). Bij /inleveren handelt de API namens de gekoppelde freelancer
// (X-Discord-User header), dus alle rolregels van het CMS blijven gelden.
// Alleen Discord-leden met de rol "CMS Admin" mogen de keurknoppen gebruiken.
//
// Instellen: kopieer .env.example naar .env en vul in, dan `npm install && npm start`.
import {
  Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags,
  ModalBuilder, TextInputBuilder, TextInputStyle,
  StringSelectMenuBuilder
} from 'discord.js';
import fs from 'node:fs';

// Minimalistische .env-lader (geen dependency nodig)
if (fs.existsSync(new URL('.env', import.meta.url))) {
  for (const regel of fs.readFileSync(new URL('.env', import.meta.url), 'utf8').split('\n')) {
    const m = regel.match(/^([A-Z_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}

const {
  DISCORD_TOKEN,        // bot-token uit de Discord Developer Portal
  DISCORD_CLIENT_ID,    // application id
  DISCORD_GUILD_ID,     // jouw server-id
  DISCORD_ADMIN_ROLE = 'CMS Admin', // Discord-rol die mag goed-/afkeuren
  DISCORD_REMINDER_CHANNEL_ID = '', // kanaal voor de ochtend-reminder
  CMS_URL = 'http://localhost:3000',
  CMS_BOT_TOKEN         // Instellingen -> "Genereer bot-token" in het CMS
} = process.env;

if (!DISCORD_TOKEN || !DISCORD_CLIENT_ID || !CMS_BOT_TOKEN) {
  console.error('Vul .env in (zie .env.example). Ontbrekend: Discord-token, client-id of CMS_BOT_TOKEN.');
  process.exit(1);
}

// --- CMS-API-client ---------------------------------------------------------
// discordUserId meesturen = de API handelt namens die gekoppelde gebruiker.
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
  if (!res.ok) throw new Error(data.error || `CMS-fout ${res.status}`);
  return data;
}

const STATUS_LABEL = { bezig: '🟣 bezig', afgekeurd: '🔴 revisie nodig', ter_goedkeuring: '🟡 wacht op goedkeuring' };

// --- slash-commands registreren -------------------------------------------
const commands = [
  new SlashCommandBuilder().setName('koppel').setDescription('Koppel je Discord-account aan je CMS-account')
    .addStringOption(o => o.setName('code').setDescription('Koppelcode van de admin').setRequired(true)),
  new SlashCommandBuilder().setName('mijntaken').setDescription('Jouw open taken, deadlines en feedback'),
  new SlashCommandBuilder().setName('inleveren').setDescription('Lever werk in voor een van je taken'),
  new SlashCommandBuilder().setName('status').setDescription('Pipeline-overzicht van alle video\'s in productie'),
  new SlashCommandBuilder().setName('checkpoints').setDescription('Alles wat op goedkeuring wacht, met knoppen'),
  new SlashCommandBuilder().setName('deadlines').setDescription('Deadlines die (bijna) verlopen zijn')
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
  if (!d.openCheckpoints.length) return { content: '✅ Niets wacht op goedkeuring.', embeds: [], components: [] };
  const embeds = [];
  const components = [];
  for (const c of d.openCheckpoints.slice(0, 10)) {
    embeds.push(new EmbedBuilder()
      .setTitle(`⏸️ ${c.stap} — ${c.werktitel}`)
      .setDescription(`Kanaal: **${c.kanaal}**${c.opleverLink ? `\n[Bekijk oplevering](${c.opleverLink})` : ''}`)
      .setColor(0xfee75c));
    components.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`keur:goed:${c.videoId}:${c.stapKey}`).setLabel('Goedkeuren').setEmoji('✅').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`keur:af:${c.videoId}:${c.stapKey}`).setLabel('Afkeuren').setEmoji('❌').setStyle(ButtonStyle.Danger)
    ));
  }
  return { embeds, components };
}

client.on('interactionCreate', async interaction => {
  try {
    // ---------- slash-commands ----------
    if (interaction.isChatInputCommand()) {
      const cmd = interaction.commandName;

      if (cmd === 'koppel') {
        const { naam, functie } = await cms('/api/discord/koppel', {
          method: 'POST',
          body: { code: interaction.options.getString('code'), discordUserId: interaction.user.id, discordNaam: interaction.user.username }
        });
        return interaction.reply({ content: `🔗 Gelukt! Je bent gekoppeld als **${naam}** (${functie}). Gebruik /mijntaken om je werk te zien.`, flags: MessageFlags.Ephemeral });
      }

      if (cmd === 'mijntaken') {
        const { taken, naam } = await cms('/api/mijn-taken', {}, interaction.user.id);
        if (naam === 'Discord-bot') {
          return interaction.reply({ content: 'Je account is nog niet gekoppeld. Vraag de admin om een koppelcode en gebruik /koppel.', flags: MessageFlags.Ephemeral });
        }
        if (!taken.length) return interaction.reply({ content: `📭 Geen open taken, ${naam}. Lekker bezig!`, flags: MessageFlags.Ephemeral });
        const regels = taken.map(t =>
          `${STATUS_LABEL[t.status] || t.status} — **${t.stap}** voor *${t.werktitel}* (${t.kanaal})${t.deadline ? ` · 📅 ${t.deadline}` : ''}${t.feedback && t.status === 'afgekeurd' ? `\n   ↳ 💬 ${t.feedback}` : ''}`);
        return interaction.reply({
          embeds: [new EmbedBuilder().setTitle(`📋 Taken van ${naam}`).setDescription(regels.join('\n')).setColor(0x7c5cff)],
          flags: MessageFlags.Ephemeral
        });
      }

      if (cmd === 'inleveren') {
        const { taken, naam } = await cms('/api/mijn-taken', {}, interaction.user.id);
        if (naam === 'Discord-bot') {
          return interaction.reply({ content: 'Je account is nog niet gekoppeld. Vraag de admin om een koppelcode en gebruik /koppel.', flags: MessageFlags.Ephemeral });
        }
        const inleverbaar = taken.filter(t => t.status === 'bezig' || t.status === 'afgekeurd');
        if (!inleverbaar.length) return interaction.reply({ content: 'Je hebt niets om in te leveren.', flags: MessageFlags.Ephemeral });
        const menu = new StringSelectMenuBuilder()
          .setCustomId('inleveren:kies')
          .setPlaceholder('Welke taak lever je in?')
          .addOptions(inleverbaar.slice(0, 25).map(t => ({
            label: `${t.stap} — ${t.werktitel}`.slice(0, 100),
            description: t.kanaal.slice(0, 100),
            value: `${t.videoId}:${t.stapKey}`
          })));
        return interaction.reply({
          content: 'Kies de taak die je wilt inleveren:',
          components: [new ActionRowBuilder().addComponents(menu)],
          flags: MessageFlags.Ephemeral
        });
      }

      if (cmd === 'status') {
        const [{ videos }, { channels }] = await Promise.all([cms('/api/videos'), cms('/api/channels')]);
        const actief = videos.filter(v => !v.afgerond);
        if (!actief.length) return interaction.reply('Geen video\'s in productie.');
        const regels = actief.map(v => {
          const stap = v.stappen.find(s => s.status !== 'goedgekeurd');
          const kanaal = channels.find(c => c.id === v.channelId)?.naam || '?';
          return `🎬 **${v.werktitel}** (${kanaal}) — nu bij: *${stap?.naam}* (${stap?.status.replace('_', ' ')})`;
        });
        return interaction.reply({ embeds: [new EmbedBuilder().setTitle('📊 Pipeline-status').setDescription(regels.join('\n')).setColor(0x7c5cff)] });
      }

      if (cmd === 'checkpoints') {
        return interaction.reply(await checkpointEmbeds());
      }

      if (cmd === 'deadlines') {
        const d = await cms('/api/dashboard');
        if (!d.deadlines.length) return interaction.reply('⏰ Geen deadlines in gevaar.');
        const regels = d.deadlines.map(x =>
          `${x.urgentie === 'te_laat' ? '🔴 TE LAAT' : '🟡 <24u'} — **${x.werktitel}** · ${x.stap} · ${x.assignee} · ${x.deadline}`);
        return interaction.reply({ embeds: [new EmbedBuilder().setTitle('⏰ Deadlines').setDescription(regels.join('\n')).setColor(0xeb459e)] });
      }
    }

    // ---------- taak gekozen -> modal voor de opleverlink ----------
    if (interaction.isStringSelectMenu() && interaction.customId === 'inleveren:kies') {
      const [videoId, stapKey] = interaction.values[0].split(':');
      const modal = new ModalBuilder()
        .setCustomId(`inleveren:modal:${videoId}:${stapKey}`)
        .setTitle('Werk inleveren')
        .addComponents(new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('link')
            .setLabel('Link naar je oplevering (Drive, Frame.io, …)')
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
        ));
      return interaction.showModal(modal);
    }

    // ---------- modal ingestuurd -> inleveren via de CMS-API ----------
    if (interaction.isModalSubmit() && interaction.customId.startsWith('inleveren:modal:')) {
      const [, , videoId, stapKey] = interaction.customId.split(':');
      const link = interaction.fields.getTextInputValue('link');
      await cms(`/api/videos/${videoId}/stappen/${stapKey}/inleveren`, {
        method: 'POST', body: { opleverLink: link }
      }, interaction.user.id);
      return interaction.reply({ content: '📤 Ingeleverd! De admin krijgt een seintje en keurt je werk zo snel mogelijk.', flags: MessageFlags.Ephemeral });
    }

    // ---------- keurknoppen (alleen CMS Admin-rol) ----------
    if (interaction.isButton() && interaction.customId.startsWith('keur:')) {
      if (!isCmsAdmin(interaction)) {
        return interaction.reply({ content: `Alleen leden met de rol "${DISCORD_ADMIN_ROLE}" mogen keuren.`, flags: MessageFlags.Ephemeral });
      }
      const [, richting, videoId, stapKey] = interaction.customId.split(':');
      if (richting === 'goed') {
        await cms(`/api/videos/${videoId}/stappen/${stapKey}/goedkeuren`, { method: 'POST', body: {} }, interaction.user.id);
        return interaction.reply(`✅ **${interaction.member.displayName}** keurde de stap goed — de pipeline schuift door.`);
      }
      // Afkeuren: eerst feedback vragen via een modal.
      const modal = new ModalBuilder()
        .setCustomId(`afkeuren:modal:${videoId}:${stapKey}`)
        .setTitle('Afkeuren — wat moet anders?')
        .addComponents(new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('feedback')
            .setLabel('Feedback voor de freelancer')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
        ));
      return interaction.showModal(modal);
    }

    if (interaction.isModalSubmit() && interaction.customId.startsWith('afkeuren:modal:')) {
      if (!isCmsAdmin(interaction)) {
        return interaction.reply({ content: `Alleen leden met de rol "${DISCORD_ADMIN_ROLE}" mogen keuren.`, flags: MessageFlags.Ephemeral });
      }
      const [, , videoId, stapKey] = interaction.customId.split(':');
      const feedback = interaction.fields.getTextInputValue('feedback');
      await cms(`/api/videos/${videoId}/stappen/${stapKey}/afkeuren`, {
        method: 'POST', body: { feedback }
      }, interaction.user.id);
      return interaction.reply(`❌ **${interaction.member.displayName}** keurde de stap af met feedback — de freelancer krijgt een ping.`);
    }
  } catch (e) {
    const antwoord = { content: `⚠️ ${e.message}`, flags: MessageFlags.Ephemeral };
    if (interaction.deferred || interaction.replied) await interaction.followUp(antwoord).catch(() => {});
    else await interaction.reply(antwoord).catch(() => {});
  }
});

// Ochtend-reminder om 09:00 (servertijd) in het ingestelde kanaal.
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
          `☀️ Goedemorgen! **${d.videosInProductie}** video's in productie, **${d.openCheckpoints.length}** wachten op goedkeuring.`,
          ...d.deadlines.map(x => `${x.urgentie === 'te_laat' ? '🔴' : '🟡'} ${x.werktitel} · ${x.stap} · ${x.assignee} (${x.deadline})`)
        ];
        await kanaal.send(regels.join('\n'));
      }
    } catch (e) {
      console.error('Reminder mislukt:', e.message);
    }
    planReminder();
  }, volgende - nu);
}

client.once('clientReady', () => {
  console.log(`Discord-bot online als ${client.user.tag}`);
  planReminder();
});
// Oudere discord.js v14-versies gebruiken 'ready' i.p.v. 'clientReady'.
client.once('ready', () => {});

client.login(DISCORD_TOKEN);

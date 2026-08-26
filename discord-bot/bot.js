// Bloop Universe Discord-bot ("Discord Robot")
//
// Wat deze bot doet:
//   /status            — overzicht van alle video's in de pipeline
//   /checkpoints       — alles wat op goedkeuring wacht, mét knoppen
//   ✅ / ❌ knoppen     — admin keurt direct vanuit Discord goed of af
//   /deadlines         — wat (bijna) te laat is
//   elke ochtend 09:00 — automatische deadline-reminder in het ingestelde kanaal
//
// De bot praat met de CMS-API (server/index.js) en logt in als een
// CMS-gebruiker met manager- of admin-rol. Alleen Discord-leden met de
// rol "CMS Admin" mogen de goedkeuringsknoppen gebruiken.
//
// Instellen: kopieer .env.example naar .env en vul in, dan `npm install && npm start`.
import {
  Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags
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
  CMS_EMAIL,            // CMS-account van de bot (rol: manager of admin)
  CMS_PASSWORD
} = process.env;

if (!DISCORD_TOKEN || !DISCORD_CLIENT_ID || !CMS_EMAIL || !CMS_PASSWORD) {
  console.error('Vul .env in (zie .env.example). Ontbrekend: token, client id of CMS-login.');
  process.exit(1);
}

// --- CMS-API-client met cookie-sessie -------------------------------------
let cmsCookie = null;

async function cms(path, opts = {}) {
  const doe = async () => fetch(`${CMS_URL}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(cmsCookie ? { Cookie: cmsCookie } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  let res = await doe();
  if (res.status === 401) {
    const login = await fetch(`${CMS_URL}/api/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: CMS_EMAIL, password: CMS_PASSWORD })
    });
    if (!login.ok) throw new Error('Bot kan niet inloggen op het CMS — check CMS_EMAIL/CMS_PASSWORD');
    cmsCookie = (login.headers.get('set-cookie') || '').split(';')[0];
    res = await doe();
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `CMS-fout ${res.status}`);
  return data;
}

// --- slash-commands registreren -------------------------------------------
const commands = [
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
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === 'status') {
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
      if (interaction.commandName === 'checkpoints') {
        return interaction.reply(await checkpointEmbeds());
      }
      if (interaction.commandName === 'deadlines') {
        const d = await cms('/api/dashboard');
        if (!d.deadlines.length) return interaction.reply('⏰ Geen deadlines in gevaar.');
        const regels = d.deadlines.map(x =>
          `${x.urgentie === 'te_laat' ? '🔴 TE LAAT' : '🟡 <24u'} — **${x.werktitel}** · ${x.stap} · ${x.assignee} · ${x.deadline}`);
        return interaction.reply({ embeds: [new EmbedBuilder().setTitle('⏰ Deadlines').setDescription(regels.join('\n')).setColor(0xeb459e)] });
      }
    }

    if (interaction.isButton() && interaction.customId.startsWith('keur:')) {
      if (!isCmsAdmin(interaction)) {
        return interaction.reply({ content: `Alleen leden met de rol "${DISCORD_ADMIN_ROLE}" mogen keuren.`, flags: MessageFlags.Ephemeral });
      }
      const [, richting, videoId, stapKey] = interaction.customId.split(':');
      if (richting === 'goed') {
        await cms(`/api/videos/${videoId}/stappen/${stapKey}/goedkeuren`, { method: 'POST', body: {} });
        return interaction.reply(`✅ **${interaction.member.displayName}** keurde de stap goed — de pipeline schuift door.`);
      } else {
        await cms(`/api/videos/${videoId}/stappen/${stapKey}/afkeuren`, {
          method: 'POST', body: { feedback: `Afgekeurd via Discord door ${interaction.member.displayName} — details volgen in het stap-kanaal.` }
        });
        return interaction.reply(`❌ **${interaction.member.displayName}** keurde de stap af. Zet je feedback voor de freelancer in dit kanaal.`);
      }
    }
  } catch (e) {
    const antwoord = { content: `⚠️ ${e.message}`, flags: MessageFlags.Ephemeral };
    if (interaction.deferred || interaction.replied) await interaction.followUp(antwoord);
    else await interaction.reply(antwoord);
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

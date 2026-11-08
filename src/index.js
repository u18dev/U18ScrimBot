import 'dotenv/config';
import { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { openDatabase } from './database.js';
import { startOutbox } from './integration.js';
import { setupVisualExperience } from './visual.js';

const {DISCORD_TOKEN,DISCORD_CLIENT_ID,DISCORD_GUILD_ID} = process.env;
if(!DISCORD_TOKEN || !DISCORD_CLIENT_ID || !DISCORD_GUILD_ID) {
  console.error('Set DISCORD_TOKEN, DISCORD_CLIENT_ID and DISCORD_GUILD_ID in .env'); process.exit(1);
}
const numberEnv=(name,def)=>{const n=process.env[name] ? Number(process.env[name]):def; if(!Number.isFinite(n)||n<0)throw new Error(`Invalid ${name}`);return n;};
const store=openDatabase(process.env.DATABASE_PATH||'./u18scrim.sqlite',{winPoints:numberEnv('WIN_POINTS',3),lossPoints:numberEnv('LOSS_POINTS',0)});
startOutbox(store.db,process.env.SCRIMCENTER_WEBHOOK_URL,process.env.SCRIMCENTER_WEBHOOK_SECRET);
const client=new Client({intents:[GatewayIntentBits.Guilds]});
const visual=setupVisualExperience(client,store);
const teamOption = (name,description) => o=>o.setName(name).setDescription(description).setRequired(true).setMaxLength(60);
const scrimId=o=>o.setName('id').setDescription('Scrim ID').setRequired(true).setMinValue(1);
const commands=[
  new SlashCommandBuilder().setName('team').setDescription('U18 team management')
    .addSubcommand(s=>s.setName('register').setDescription('Register a team as captain').addStringOption(teamOption('name','Team display name')))
    .addSubcommand(s=>s.setName('list').setDescription('List registered teams')),
  new SlashCommandBuilder().setName('scrim').setDescription('U18 preseason scrim operations')
    .addSubcommand(s=>s.setName('start').setDescription('Create a scrim between registered teams')
      .addStringOption(teamOption('home','First team')).addStringOption(teamOption('away','Second team')))
    .addSubcommand(s=>s.setName('report').setDescription('Report result, attach evidence')
      .addIntegerOption(scrimId).addStringOption(o=>o.setName('winner').setDescription('Winning team name').setRequired(true))
      .addAttachmentOption(o=>o.setName('evidence').setDescription('Scoreboard screenshot').setRequired(true)))
    .addSubcommand(s=>s.setName('confirm').setDescription('Other captain confirms result').addIntegerOption(scrimId))
    .addSubcommand(s=>s.setName('dispute').setDescription('Flag result for staff review').addIntegerOption(scrimId))
    .addSubcommand(s=>s.setName('resolve').setDescription('Admin resolves disputed result')
      .addIntegerOption(scrimId).addStringOption(o=>o.setName('winner').setDescription('Winning team name').setRequired(true)))
    .addSubcommand(s=>s.setName('cancel').setDescription('Cancel an unresolved scrim').addIntegerOption(scrimId))
    .addSubcommand(s=>s.setName('lookup').setDescription('Show a scrim and evidence').addIntegerOption(scrimId)),
  new SlashCommandBuilder().setName('leaderboard').setDescription('Preseason team placement standings'),
  new SlashCommandBuilder().setName('scrimcenter').setDescription('Admin: publish the interactive scrim center'),
  new SlashCommandBuilder().setName('leaderboardpanel').setDescription('Admin: publish an auto-updating leaderboard')
];
function resultControls(id) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`scrim:confirm:${id}`).setLabel('Confirm Result').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`scrim:dispute:${id}`).setLabel('Dispute Result').setStyle(ButtonStyle.Danger)
  );
}
function overview(m) {return new EmbedBuilder().setTitle(`U18 Scrim #${m.id} — ${m.status.toUpperCase()}`)
  .setDescription(`**${m.home_name}** vs **${m.away_name}**`)
  .addFields({name:'Winner',value:m.winner_team_id?(m.winner_team_id===m.home_team_id?m.home_name:m.away_name):'Not reported',inline:true},
    {name:'Evidence',value:m.evidence_url||'Not submitted',inline:false})
  .setFooter({text:'U18 CDL Preseason • Results count only after confirmation'});
}
client.on('interactionCreate',async interaction=>{
  if(!interaction.inGuild()) return;
  try {if(await visual.handle(interaction))return;} catch(error) {
    console.error('Visual interaction failed:',error);
    const message=`⚠️ ${String(error.message).slice(0,1700)}`;
    if(interaction.replied||interaction.deferred)await interaction.followUp({content:message,ephemeral:true}).catch(console.error);
    else await interaction.reply({content:message,ephemeral:true}).catch(console.error);
    return;
  }
  if(interaction.isButton() && /^scrim:(confirm|dispute):[1-9][0-9]*$/.test(interaction.customId)) {
    const [,action,idText]=interaction.customId.split(':');
    const isAdmin=interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)||false;
    try {
      const match=action==='confirm'
        ? store.confirm(interaction.guildId,Number(idText),interaction.user.id,isAdmin)
        : store.dispute(interaction.guildId,Number(idText),interaction.user.id,isAdmin);
      await interaction.update({embeds:[overview(match)],components:[]});
      if(match.status==='confirmed')await visual.afterMatch(interaction.guildId);
      if (match.status==='confirmed' && process.env.RESULTS_CHANNEL_ID) {
        const channel=await client.channels.fetch(process.env.RESULTS_CHANNEL_ID).catch(()=>null);
        if(channel?.isTextBased()) await channel.send({embeds:[overview(match)]}).catch(console.error);
      }
    } catch(err) {
      await interaction.reply({content:`⚠️ ${String(err.message).slice(0,1700)}`,ephemeral:true});
    }
    return;
  }
  if(!interaction.isChatInputCommand()) return;
  const guildId=interaction.guildId,userId=interaction.user.id;
  const isAdmin=interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)||false;
  const sub=interaction.commandName==='leaderboard' ? '' : interaction.options.getSubcommand();
  try {
    if(interaction.commandName==='team') {
      if(sub==='register') {
        const name=interaction.options.getString('name',true);
        const t=store.registerTeam(guildId,name,userId);
        await interaction.reply({content:`✅ **${t.name}** registered. Captain: <@${userId}>. Team ID: ${t.id}`,ephemeral:true});
      } else {
        const teams=store.listTeams(guildId);
        await interaction.reply({content:teams.length?teams.map(t=>`**#${t.id}** ${t.name} — <@${t.captain_id}>`).join('\n').slice(0,1900):'No teams registered yet.'});
      }
      return;
    }
    if(interaction.commandName==='leaderboard') {
      const rows=store.standings(guildId).slice(0,20);
      await interaction.reply({embeds:[new EmbedBuilder().setTitle('🏆 U18 Preseason Scrims Leaderboard')
        .setDescription(rows.length?rows.map((r,i)=>`**${i+1}. ${r.name}** — ${r.points} pts | ${r.wins}W-${r.losses}L`).join('\n'):'No registered teams yet.')
        .setFooter({text:`Win: ${numberEnv('WIN_POINTS',3)} pts • Loss: ${numberEnv('LOSS_POINTS',0)} pts • Provisional scoring`})]});
      return;
    }
    if(interaction.commandName!=='scrim')return;
    let match;
    const id=()=>interaction.options.getInteger('id',true);
    if(sub==='start')match=store.startScrim(guildId,interaction.options.getString('home',true),interaction.options.getString('away',true),userId,isAdmin);
    if(sub==='report') {
      const current=store.getScrim(guildId,id());if(!current)throw new Error('Scrim not found.');
      const winnerName=interaction.options.getString('winner',true);
      const winnerId=winnerName.toLowerCase()===current.home_name.toLowerCase()?current.home_team_id:winnerName.toLowerCase()===current.away_name.toLowerCase()?current.away_team_id:null;
      if(!winnerId)throw new Error('Winner name must exactly match a participating team.');
      const evidence=interaction.options.getAttachment('evidence',true);
      if(!evidence.contentType?.startsWith('image/'))throw new Error('Upload an image scoreboard screenshot.');
      match=store.report(guildId,id(),winnerId,evidence.url,userId,isAdmin);
    }
    if(sub==='confirm')match=store.confirm(guildId,id(),userId,isAdmin);
    if(sub==='dispute')match=store.dispute(guildId,id(),userId,isAdmin);
    if(sub==='resolve') {
      const current=store.getScrim(guildId,id());if(!current)throw new Error('Scrim not found.');
      const winnerName=interaction.options.getString('winner',true);
      const winnerId=winnerName.toLowerCase()===current.home_name.toLowerCase()?current.home_team_id:winnerName.toLowerCase()===current.away_name.toLowerCase()?current.away_team_id:null;
      match=store.resolve(guildId,id(),winnerId,userId,isAdmin);
    }
    if(sub==='cancel')match=store.cancel(guildId,id(),userId,isAdmin);
    if(sub==='lookup')match=store.getScrim(guildId,id());
    if(!match)throw new Error('Scrim not found.');
    await interaction.reply({embeds:[overview(match)],components:sub==='report'?[resultControls(match.id)]:[]});
    if(match.status==='confirmed')await visual.afterMatch(guildId);
    if(['confirm','resolve'].includes(sub) && match.status==='confirmed' && process.env.RESULTS_CHANNEL_ID) {
      const channel=await client.channels.fetch(process.env.RESULTS_CHANNEL_ID).catch(()=>null);
      if(channel?.isTextBased() && channel.id!==interaction.channelId) await channel.send({embeds:[overview(match)]}).catch(console.error);
    }
  } catch(error) {
    console.error(error);
    const message=`⚠️ ${String(error.message).slice(0,1700)}`;
    if(interaction.replied||interaction.deferred)await interaction.followUp({content:message,ephemeral:true}).catch(console.error);
    else await interaction.reply({content:message,ephemeral:true}).catch(console.error);
  }
});
client.once('ready',()=>console.log(`U18 ScrimBot online as ${client.user.tag}`));
await new REST({version:'10'}).setToken(DISCORD_TOKEN).put(Routes.applicationGuildCommands(DISCORD_CLIENT_ID,DISCORD_GUILD_ID),{body:commands.map(c=>c.toJSON())});
await client.login(DISCORD_TOKEN);

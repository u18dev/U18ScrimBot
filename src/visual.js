import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder,
  ModalBuilder, TextInputBuilder, TextInputStyle,
  StringSelectMenuBuilder, UserSelectMenuBuilder, MessageFlags, PermissionFlagsBits
} from 'discord.js';
import { createVisualStore } from './visual-store.js';
import { createRoster } from './roster.js';
import { createGuidedFlow } from './guided-flow.js';
import { resolveWritableChannel } from './channel.js';

const BLUE=0x2752ae;
const GREEN=0x2fba83;
const isAdmin=i=>Boolean(i.memberPermissions?.has(PermissionFlagsBits.ManageGuild));
const safe=(s)=>String(s||'').replace(/@/g,'＠').replace(/\*/g,'\\*').slice(0,400);
const ephemeral={flags:MessageFlags.Ephemeral};
const button=(id,label,style,emoji)=>new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style).setEmoji(emoji);
const startButton=new ActionRowBuilder().addComponents(
  button('u18:challenge:new','Challenge Team',ButtonStyle.Primary,'⚔️'),
  button('u18:matches','My Matches',ButtonStyle.Secondary,'📅'),
  button('u18:board','Standings',ButtonStyle.Secondary,'🏆'),
  button('u18:team','My Team',ButtonStyle.Secondary,'👥')
);
const challengeRows=id=>[new ActionRowBuilder().addComponents(
  button(`u18:challenge:accept:${id}`,'Accept',ButtonStyle.Success,'✅'),
  button(`u18:challenge:decline:${id}`,'Decline',ButtonStyle.Danger,'❌')
)];
function panelEmbed(active) {
  return new EmbedBuilder().setColor(BLUE).setTitle('⚔️ U18 SCRIM CENTER')
    .setDescription('**COMPETE. PRACTICE. CLIMB THE RANKS.**\n\nCreate team challenges, respond to opponents, and view your preseason standings. Start here — no command memorization required.')
    .addFields(
      {name:'Challenge a Team',value:'Send an opponent a Best-of-3 or Best-of-5 scrim request.',inline:true},
      {name:'My Matches',value:'Review your pending invitations and recent scrims.',inline:true},
      {name:'Open Invitations',value:String(active),inline:true}
    )
    .setFooter({text:'U18 CDL Preseason • ScrimCenter partner integration pending'});
}
const challengeEmbed=c=>new EmbedBuilder().setColor(c.status==='accepted'?GREEN:BLUE)
  .setTitle(`⚔️ Scrim Challenge #${c.id} • ${c.status.toUpperCase()}`)
  .setDescription(`**${safe(c.home_name)}**  VS  **${safe(c.away_name)}**`)
  .addFields({name:'Format',value:c.format,inline:true},{name:'Requested (Pacific)',value:safe(c.start_text),inline:true},
    {name:'Opposing captain',value:`<@${c.away_captain_id}>`,inline:true},
    {name:'Notes',value:safe(c.notes)||'No additional notes'})
  .setFooter({text:c.scrim_id?`Scrim #${c.scrim_id} created • use /scrim report after the match`:'Only the opposing captain or staff may accept / decline'});
function boardEmbed(rows) {
  return new EmbedBuilder().setColor(GREEN).setTitle('🏆 U18 CDL • PRESEASON LEADERBOARD')
    .setDescription(rows.length?rows.slice(0,20).map((r,i)=>`**${i+1}. ${safe(r.name)}** — ${r.points} pts | ${r.wins}W–${r.losses}L`).join('\n'):'No teams registered yet.')
    .setFooter({text:'Confirmed scrims only • Provisional placement points'});
}
export function setupVisualExperience(client,store) {
  const visual=createVisualStore(store);
  const roster=createRoster(store);
  async function sendToChannel(guildId,channelId,payload) {
    if (!channelId)return null;
    const channel=await client.channels.fetch(channelId).catch(()=>null);
    if(!channel?.isTextBased() || channel.guildId!==guildId)return null;
    return channel.send({allowedMentions:{parse:[]},...payload}).catch(err=>{console.warn('Scrim notification failed:',err.message);return null;});
  }
  async function refreshLeaderboard(guildId) {
    const saved=visual.getMessage(guildId,'leaderboard');
    if(!saved)return;
    const channel=await client.channels.fetch(saved.channel_id).catch(()=>null);
    const message=await channel?.messages?.fetch(saved.message_id).catch(()=>null);
    if(message) await message.edit({embeds:[boardEmbed(store.standings(guildId))]}).catch(console.error);
  }
  async function refreshPanel(guildId) {
    const saved=visual.getMessage(guildId,'control');
    if(!saved)return;
    const channel=await client.channels.fetch(saved.channel_id).catch(()=>null);
    const message=await channel?.messages?.fetch(saved.message_id).catch(()=>null);
    if(message)await message.edit({embeds:[panelEmbed(visual.activeCount(guildId))],components:[startButton]}).catch(console.error);
  }
  async function afterMatch(guildId) {await refreshLeaderboard(guildId);}
  async function modal(i) {
    const fields=[
      ['home','Your registered team','Enter your exact team name',true],
      ['away','Opposing registered team','Enter your opponent’s team name',true],
      ['start','Date & time (Pacific)','YYYY-MM-DD HH:MM',true],
      ['format','Match format','BO3 or BO5',true],
      ['notes','Notes / map rules (optional)','CDL ruleset, lobby details...',false]
    ];
    const m=new ModalBuilder().setCustomId('u18:challenge:submit').setTitle('U18 • Create Scrim Challenge');
    for(const [id,label,placeholder,required] of fields) {
      m.addComponents(new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId(id).setLabel(label).setPlaceholder(placeholder)
          .setStyle(id==='notes'?TextInputStyle.Paragraph:TextInputStyle.Short)
          .setMinLength(required?2:0).setMaxLength(id==='notes'?400:70).setRequired(required)
      ));
    }
    await i.showModal(m);
  }
  const guided=createGuidedFlow(roster,visual,async(c,channelId)=>{
    return sendToChannel(c.guild_id,process.env.CHALLENGES_CHANNEL_ID||channelId,{
      content:`<@${c.away_captain_id}> — new scrim challenge!`,
      allowedMentions:{users:[c.away_captain_id]},
      embeds:[challengeEmbed(c)],components:challengeRows(c.id)
    });
  },refreshPanel);
  const teamView=(t,guild)=>new EmbedBuilder().setColor(BLUE).setTitle('👥 My U18 Team')
    .setDescription(`**${safe(t.name)}**\nCaptain: <@${t.captain_id}>\nRoster: ${roster.members(guild,t.id).map(m=>`<@${m.user_id}>`).join(', ')}`);
  const memberControls=t=>new ActionRowBuilder().addComponents(
    button('u18:team:invite','Invite Player',ButtonStyle.Primary,'➕').setDisabled(false),
    button('u18:team:transfer','Transfer Captain',ButtonStyle.Secondary,'🔄'),
    button('u18:team:leave','Leave Team',ButtonStyle.Danger,'🚪')
  );
  async function myTeam(i) {
    const team=roster.mine(i.guildId,i.user.id);
    if(!team) {await i.reply({content:'You have no team yet. Ask a registered captain to invite you, or register a new team with /team register.',...ephemeral});return;}
    await i.reply({embeds:[teamView(team,i.guildId)],components:[memberControls(team)],...ephemeral});
  }
  async function rosterHandle(i) {
    if(i.isButton()&&i.customId==='u18:team'){await myTeam(i);return true;}
    if(i.isButton()&&i.customId==='u18:team:leave'){
      const t=roster.leave(i.guildId,i.user.id);
      await i.update({content:`✅ You left ${safe(t.name)}.`,embeds:[],components:[]});return true;
    }
    if(i.isButton()&&['u18:team:invite','u18:team:transfer'].includes(i.customId)){
      const team=roster.mine(i.guildId,i.user.id);
      if(!team||team.captain_id!==i.user.id)throw new Error('Only the team captain can manage invitations and captaincy.');
      const transfer=i.customId.endsWith('transfer');
      const selector=new UserSelectMenuBuilder().setCustomId(transfer?'u18:team:pick-transfer':'u18:team:pick-invite')
        .setPlaceholder(transfer?'Select a member to become captain':'Choose a Discord member to invite').setMinValues(1).setMaxValues(1);
      await i.update({content:transfer?'Select an existing teammate to receive captaincy.':'Select the Discord member to invite. They must accept to join.',
        embeds:[],components:[new ActionRowBuilder().addComponents(selector)]});
      return true;
    }
    if(i.isUserSelectMenu()&&i.customId.startsWith('u18:team:pick-')){
      const user=i.values[0],team=roster.mine(i.guildId,i.user.id);
      if(!team||team.captain_id!==i.user.id)throw new Error('Only the captain can perform this action.');
      if(i.customId==='u18:team:pick-transfer'){
        const name=roster.transfer(i.guildId,i.user.id,user);
        await i.update({content:`✅ Captaincy of ${safe(name)} transferred to <@${user}>.`,embeds:[],components:[],allowedMentions:{parse:[]}});return true;
      }
      const inv=roster.invite(i.guildId,team.id,i.user.id,user);
      await i.update({content:`✅ Sent an invitation to <@${user}> for **${safe(team.name)}**.`,embeds:[],components:[],allowedMentions:{parse:[]}});
      const notification=await sendToChannel(i.guildId,process.env.CHALLENGES_CHANNEL_ID||i.channelId,{
        content:`<@${user}> — you've been invited to join **${safe(team.name)}**!`,
        allowedMentions:{users:[user]},
        components:[new ActionRowBuilder().addComponents(
          button(`u18:invite:accept:${inv.id}`,'Join Team',ButtonStyle.Success,'✅'),
          button(`u18:invite:decline:${inv.id}`,'Decline',ButtonStyle.Danger,'❌')
        )]
      });
      if(!notification)await i.followUp({content:'⚠️ Invite was recorded but could not be posted. Check bot channel permissions.',...ephemeral});
      return true;
    }
    if(i.isButton()&&/^u18:invite:(accept|decline):\d+$/.test(i.customId)){
      const [, , action, id]=i.customId.split(':');
      const invite=roster.respond(i.guildId,Number(id),i.user.id,action==='accept'?'accepted':'declined');
      await i.update({content:`Invitation ${invite.state} by <@${i.user.id}> for **${safe(invite.team_name)}**.`,components:[],allowedMentions:{parse:[]}});return true;
    }
    return false;
  }
  async function handle(i) {
    if(!i.inGuild())return false;
    if(await rosterHandle(i))return true;
    if(await guided.handle(i))return true;
    if(i.isChatInputCommand() && i.commandName==='scrimcenter') {
      if(!isAdmin(i))throw new Error('Only server managers may publish the control center.');
      const channel=await resolveWritableChannel(client,i);
      await i.deferReply(ephemeral);
      const old=visual.getMessage(i.guildId,'control');
      if(old?.channel_id===channel.id) {
        const oldMessage=await channel.messages.fetch(old.message_id).catch(()=>null);
        if(oldMessage) {
          await oldMessage.edit({embeds:[panelEmbed(visual.activeCount(i.guildId))],components:[startButton]});
          await i.editReply('✅ Scrim Center control panel refreshed.');
          return true;
        }
      }
      const posted=await channel.send({embeds:[panelEmbed(visual.activeCount(i.guildId))],components:[startButton]});
      visual.putMessage(i.guildId,'control',channel.id,posted.id);
      await i.editReply('✅ Scrim Center control panel published. Pin the bot message.');
      return true;
    }
    if(i.isChatInputCommand() && i.commandName==='leaderboardpanel') {
      if(!isAdmin(i))throw new Error('Only server managers can configure leaderboard panels.');
      const channel=await resolveWritableChannel(client,i);
      await i.deferReply(ephemeral);
      const saved=visual.getMessage(i.guildId,'leaderboard');
      if(saved?.channel_id===i.channelId) {
        const old=await channel.messages.fetch(saved.message_id).catch(()=>null);
        if(old) {await old.edit({embeds:[boardEmbed(store.standings(i.guildId))]});await i.editReply('✅ Live leaderboard refreshed.');return true;}
      }
      const msg=await channel.send({embeds:[boardEmbed(store.standings(i.guildId))]});
      visual.putMessage(i.guildId,'leaderboard',i.channelId,msg.id);
      await i.editReply('✅ Live leaderboard published.');
      return true;
    }
    if(i.isButton() && /^u18:challenge:(accept|decline):\d+$/.test(i.customId)) {
      const [, , action, id]=i.customId.split(':');
      const c=visual.respond(i.guildId,Number(id),action,i.user.id,isAdmin(i));
      await i.update({content:'',embeds:[challengeEmbed(c)],components:[],allowedMentions:{parse:[]}});
      await refreshPanel(i.guildId);
      if(c.status==='accepted') await sendToChannel(i.guildId,process.env.MATCHES_CHANNEL_ID||i.channelId,
        {content:`✅ Scrim #${c.scrim_id} confirmed for **${safe(c.home_name)}** vs **${safe(c.away_name)}**. Captains: <@${c.home_captain_id}> <@${c.away_captain_id}>.`,
          allowedMentions:{users:[c.home_captain_id,c.away_captain_id]}});
      return true;
    }
    if(i.isButton() && i.customId==='u18:matches') {
      const matches=visual.listForCaptain(i.guildId,i.user.id);
      const message=matches.length?matches.map(c=>`#${c.id} **${safe(c.home_name)} vs ${safe(c.away_name)}** • ${c.format} • ${safe(c.start_text)} • ${c.status}`).join('\n'):'You have no challenges. Register a team and create one from the control center.';
      await i.reply({content:message.slice(0,1900),...ephemeral});
      return true;
    }
    if(i.isButton() && i.customId==='u18:board') {
      await i.reply({embeds:[boardEmbed(store.standings(i.guildId))],...ephemeral});return true;
    }
    return false;
  }
  return {handle,refreshLeaderboard,refreshPanel,afterMatch,visual,roster};
}

import {
 ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder,
 EmbedBuilder, MessageFlags
} from 'discord.js';

const EPHEMERAL={flags:MessageFlags.Ephemeral};
const TZ='America/Los_Angeles';
const parts=(date)=>Object.fromEntries(new Intl.DateTimeFormat('en-US',{
 timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit'
}).formatToParts(date).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
export function sevenPacificDates(now=new Date()) {
  const p=parts(now),base=Date.UTC(+p.year,+p.month-1,+p.day,12);
  return Array.from({length:7},(_,i)=>{
    const date=new Date(base+i*86400000);
    const iso=date.toISOString().slice(0,10);
    return {value:iso,label:new Intl.DateTimeFormat('en-US',{timeZone:'UTC',weekday:'short',month:'short',day:'numeric'}).format(date)};
  });
}
export function validPacificChoice(date,choices=sevenPacificDates()) {
  return choices.some(d=>d.value===date);
}
const clockOptions=Array.from({length:24},(_,i)=>{
 const hour=10+Math.floor(i/2),minute=i%2?'30':'00';
 const label=new Intl.DateTimeFormat('en-US',{hour:'numeric',minute:'2-digit',timeZone:'UTC'})
   .format(new Date(Date.UTC(2026,0,1,hour,Number(minute))));
 return {label,value:`${String(hour).padStart(2,'0')}:${minute}`};
});
const b=(id,label,style=ButtonStyle.Secondary)=>new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style);
const row=(menu)=>new ActionRowBuilder().addComponents(menu);
const drafts=new Map();
const getDraft=(i)=>{
 const d=drafts.get(`${i.guildId}:${i.user.id}`);
 if(!d||Date.now()-d.created>15*60*1000)throw new Error('Your draft expired. Click Challenge Team to start again.');
 return d;
};
const safe=x=>String(x||'').replace(/@/g,'＠').slice(0,100);
export function createGuidedFlow(roster,visual,notify,refreshPanel) {
 function page(i,d) {
  const mine=roster.mine(i.guildId,i.user.id);
  if(!mine||mine.id!==d.teamId)throw new Error('You are no longer a member of the challenging team.');
  if(mine.captain_id!==i.user.id && !i.memberPermissions?.has('ManageGuild'))throw new Error('Only captains may send challenges.');
  const others=roster.otherTeams(i.guildId,i.user.id);
  const last=Math.max(0,Math.ceil(others.length/25)-1);
  d.page=Math.max(0,Math.min(d.page,last));
  const options=others.slice(d.page*25,d.page*25+25).map(t=>({label:t.name.slice(0,100),value:String(t.id),default:d.opponentId===t.id}));
  const opponent=others.find(t=>t.id===d.opponentId);
  const dates=sevenPacificDates();
  const embed=new EmbedBuilder().setColor(0x2752ae).setTitle('⚔️ Create Scrim Challenge')
   .setDescription(`**Your team:** ${safe(mine.name)} (automatically linked to your Discord account)\n**Opponent:** ${safe(opponent?.name||'Not selected')}\n**Date:** ${d.date||'Not selected'} (Pacific)\n**Time:** ${d.time||'Not selected'} (Pacific)\n**Format:** ${d.format||'Not selected'}\n\nChoose from the dropdowns, then press **Send Challenge**.`)
   .setFooter({text:'U18 CDL • Next 7 calendar days • Pacific time'});
  const components=[];
  if(options.length)components.push(row(new StringSelectMenuBuilder().setCustomId('u18w:opponent')
    .setPlaceholder('Choose registered opposing team').addOptions(options)));
  components.push(row(new StringSelectMenuBuilder().setCustomId('u18w:date')
    .setPlaceholder('Choose a date (next 7 days)').addOptions(dates.map(x=>({...x,default:d.date===x.value})))));
  components.push(row(new StringSelectMenuBuilder().setCustomId('u18w:time')
    .setPlaceholder('Choose start time (Pacific)').addOptions(clockOptions.map(x=>({...x,default:d.time===x.value})))));
  components.push(row(new StringSelectMenuBuilder().setCustomId('u18w:format')
    .setPlaceholder('Choose series format').addOptions([{label:'Best of 3',value:'BO3',default:d.format==='BO3'},{label:'Best of 5',value:'BO5',default:d.format==='BO5'}])));
  const nav=new ActionRowBuilder().addComponents(
    b('u18w:prev','◀ Teams',ButtonStyle.Secondary).setDisabled(d.page===0),
    b('u18w:next','Teams ▶',ButtonStyle.Secondary).setDisabled(d.page>=last),
    b('u18w:send','Send Challenge',ButtonStyle.Success).setDisabled(!d.opponentId||!d.date||!d.time||!d.format)
  );
  components.push(nav);
  return {embeds:[embed],components};
 }
 async function handle(i) {
  if(!i.inGuild())return false;
  if(i.isButton() && i.customId==='u18:challenge:new') {
    const team=roster.mine(i.guildId,i.user.id);
    if(!team)throw new Error('You are not on a team. Ask your captain for an invitation or use /team register.');
    if(team.captain_id!==i.user.id && !i.memberPermissions?.has('ManageGuild'))throw new Error('Only captains can challenge opponents.');
    if(!roster.otherTeams(i.guildId,i.user.id).length)throw new Error('At least one other registered team is needed.');
    const d={teamId:team.id,page:0,created:Date.now(),opponentId:null,date:null,time:null,format:null};
    drafts.set(`${i.guildId}:${i.user.id}`,d);
    await i.reply({...page(i,d),...EPHEMERAL});
    return true;
  }
  if(i.isStringSelectMenu() && i.customId.startsWith('u18w:')) {
    const d=getDraft(i), field=i.customId.slice(5),value=i.values[0];
    if(field==='opponent') {
      const choice=roster.otherTeams(i.guildId,i.user.id).find(t=>String(t.id)===value);
      if(!choice)throw new Error('That opponent is no longer registered.');
      d.opponentId=choice.id;
    } else if(field==='date') {
      if(!validPacificChoice(value))throw new Error('Select a date in the next 7 Pacific calendar days.');
      d.date=value;
    } else if(field==='time') {
      if(!clockOptions.some(t=>t.value===value))throw new Error('Invalid time choice.');
      d.time=value;
    } else if(field==='format') {
      if(!['BO3','BO5'].includes(value))throw new Error('Invalid series format.');
      d.format=value;
    } else return false;
    await i.update(page(i,d));return true;
  }
  if(i.isButton() && ['u18w:prev','u18w:next'].includes(i.customId)) {
    const d=getDraft(i);
    d.page+=i.customId==='u18w:prev'?-1:1;
    await i.update(page(i,d));return true;
  }
  if(i.isButton() && i.customId==='u18w:send') {
    const d=getDraft(i);
    if(!d.opponentId||!validPacificChoice(d.date)||!clockOptions.some(t=>t.value===d.time)||!['BO3','BO5'].includes(d.format))throw new Error('Complete the form using the dropdowns.');
    const my=roster.mine(i.guildId,i.user.id);
    const other=roster.otherTeams(i.guildId,i.user.id).find(x=>x.id===d.opponentId);
    if(!my||!other||my.id!==d.teamId)throw new Error('Team membership changed. Start again.');
    await i.deferUpdate();
    const c=visual.create(i.guildId,my.name,other.name,d.format,`${d.date} ${d.time}`,'',i.user.id,Boolean(i.memberPermissions?.has('ManageGuild')));
    drafts.delete(`${i.guildId}:${i.user.id}`);
    await i.editReply({content:`✅ Challenge #${c.id} created for ${safe(other.name)}.`,embeds:[],components:[]});
    const announcement=await notify(c,i.channelId);
    if(!announcement)await i.followUp({content:'⚠️ Challenge saved, but the announcement failed. Check channel permissions.',...EPHEMERAL});
    await refreshPanel(i.guildId);
    return true;
  }
  return false;
 }
 return {handle};
}

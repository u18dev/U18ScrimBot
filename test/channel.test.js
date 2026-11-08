import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveWritableChannel } from '../src/channel.js';

const textChannel={
  id:'100',guildId:'guild',isTextBased:()=>true,
  send:async()=>{},messages:{fetch:async()=>{}}
};

test('fetches an uncached text channel by interaction.channelId',async()=>{
  let fetched;
  const client={channels:{fetch:async(id,options)=>{fetched={id,options};return textChannel;}}};
  const interaction={guildId:'guild',channelId:'100',channel:null};
  const result=await resolveWritableChannel(client,interaction);
  assert.equal(result,textChannel);
  assert.equal(fetched.id,'100');
  assert.deepEqual(fetched.options,{force:true});
});

test('refuses channels from other servers',async()=>{
  const client={channels:{fetch:async()=>({...textChannel,guildId:'different'})}};
  await assert.rejects(resolveWritableChannel(client,{guildId:'guild',channelId:'100'}),/Use a Discord text channel/);
});

test('gives useful permission error when fetch fails',async()=>{
  const client={channels:{fetch:async()=>{throw new Error('Missing Access');}}};
  await assert.rejects(resolveWritableChannel(client,{guildId:'guild',channelId:'100'}),/View Channel permission/);
});

/**
 * Discord interaction.channel is often null for uncached channels, especially
 * after a fresh Gateway connection. Fetch by ID instead of requiring cache.
 */
export async function resolveWritableChannel(client, interaction) {
  if (!interaction.guildId || !interaction.channelId) {
    throw new Error('Use this command in a Discord server text channel.');
  }
  let channel;
  try {
    channel = await client.channels.fetch(interaction.channelId, { force: true });
  } catch (error) {
    throw new Error('Could not access this channel. Check the bot\'s View Channel permission.');
  }
  if (!channel || channel.guildId !== interaction.guildId ||
      !channel.isTextBased?.() || typeof channel.send !== 'function' ||
      typeof channel.messages?.fetch !== 'function') {
    throw new Error('Use a Discord text channel where the bot can send messages.');
  }
  return channel;
}

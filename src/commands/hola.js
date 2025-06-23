import { SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('hola')
  .setDescription('¡Lulu te saluda!');

export async function execute(interaction) {
  await interaction.reply('¡Yordleada mágica! ✨ Soy Lulu, ¿en qué puedo ayudarte?');
}

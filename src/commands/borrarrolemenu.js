import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import RoleMenu from '../models/RoleMenu.js';

export const data = new SlashCommandBuilder()
  .setName('borrarrolemenu')
  .setDescription('Borra un rolemenu por mensaje')
  .addStringOption(option =>
    option.setName('mensajeid')
      .setDescription('ID del mensaje del rolemenu')
      .setRequired(true)
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(interaction) {
  if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
    return interaction.reply({ content: 'Solo administradores pueden usar este comando.', ephemeral: true });
  }
  const messageId = interaction.options.getString('mensajeid');
  const roleMenu = await RoleMenu.findOneAndDelete({ messageId });
  if (!roleMenu) {
    return interaction.reply({ content: 'No se encontró un rolemenu con ese mensaje.', ephemeral: true });
  }
  try {
    const channel = await interaction.guild.channels.fetch(roleMenu.channelId);
    const msg = await channel.messages.fetch(messageId);
    await msg.delete();
  } catch {}
  await interaction.reply({ content: 'Rolemenu borrado correctamente.', ephemeral: true });
}

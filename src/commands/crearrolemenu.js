import { SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ComponentType } from 'discord.js';
import RoleMenu from '../models/RoleMenu.js';
import { connectDB } from '../utils/db.js';

export const data = new SlashCommandBuilder()
  .setName('crearrolemenu')
  .setDescription('Crea un menú de roles con reacciones')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(interaction) {
  await connectDB();
  // Solo admins pueden usar
  if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
    return interaction.reply({ content: 'Solo administradores pueden usar este comando.', ephemeral: true });
  }

  // Pedir título del menú
  const modal = new ModalBuilder()
    .setCustomId('rolemenu_titulo_modal')
    .setTitle('Crear Rolemenu')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('titulo')
          .setLabel('Título del rolemenu')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      )
    );
  await interaction.showModal(modal);
}

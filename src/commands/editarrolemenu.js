import { SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import RoleMenu from '../models/RoleMenu.js';

export const data = new SlashCommandBuilder()
  .setName('editarrolemenu')
  .setDescription('Edita un rolemenu existente')
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
  const roleMenu = await RoleMenu.findOne({ messageId });
  if (!roleMenu) {
    return interaction.reply({ content: 'No se encontró un rolemenu con ese mensaje.', ephemeral: true });
  }
  // Mostrar opciones de edición
  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('editarrolemenu_select')
      .setPlaceholder('¿Qué deseas editar?')
      .addOptions([
        { label: 'Título', value: 'titulo' },
        { label: 'Tipo', value: 'tipo' },
        { label: 'Roles', value: 'roles' }
      ])
  );
  await interaction.reply({ content: '¿Qué deseas editar del rolemenu?', components: [row], ephemeral: true });
  // Guardar sesión temporal para edición
  interaction.client.editRoleMenuSession = {
    userId: interaction.user.id,
    messageId,
    roleMenu
  };
}

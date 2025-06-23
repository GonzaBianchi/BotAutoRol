import { Events, ActionRowBuilder, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import RoleMenu from '../models/RoleMenu.js';

export default function setupEditRoleMenuEvents(client) {
  // Selección de campo a editar
  client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isStringSelectMenu()) return;
    if (interaction.customId !== 'editarrolemenu_select') return;
    const session = client.editRoleMenuSession;
    if (!session || session.userId !== interaction.user.id) return;
    if (interaction.values[0] === 'titulo') {
      // Modal para nuevo título
      const modal = new ModalBuilder()
        .setCustomId('editarrolemenu_titulo_modal')
        .setTitle('Editar Título')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('nuevo_titulo')
              .setLabel('Nuevo título')
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          )
        );
      await interaction.showModal(modal);
    } else if (interaction.values[0] === 'tipo') {
      // Select para tipo
      const row = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('editarrolemenu_tipo_select')
          .setPlaceholder('Selecciona el tipo')
          .addOptions([
            { label: 'Múltiple', value: 'multiple' },
            { label: 'Simple', value: 'simple' }
          ])
      );
      await interaction.reply({ content: 'Selecciona el nuevo tipo:', components: [row], ephemeral: true });
    } else if (interaction.values[0] === 'roles') {
      // Menú para elegir acción sobre roles
      const row = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('editarrolemenu_roles_accion')
          .setPlaceholder('¿Qué deseas hacer con los roles?')
          .addOptions([
            { label: 'Agregar rol', value: 'agregar' },
            { label: 'Quitar rol', value: 'quitar' },
            { label: 'Editar rol', value: 'editar' }
          ])
      );
      await interaction.reply({ content: '¿Qué deseas hacer con los roles del rolemenu?', components: [row], ephemeral: true });
    }
  });

  // Modal submit para nuevo título
  client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isModalSubmit()) return;
    if (interaction.customId !== 'editarrolemenu_titulo_modal') return;
    const session = client.editRoleMenuSession;
    if (!session || session.userId !== interaction.user.id) return;
    const nuevoTitulo = interaction.fields.getTextInputValue('nuevo_titulo');
    await RoleMenu.updateOne({ messageId: session.messageId }, { title: nuevoTitulo });
    // Editar mensaje
    try {
      const channel = await interaction.guild.channels.fetch(session.roleMenu.channelId);
      const msg = await channel.messages.fetch(session.messageId);
      const embed = msg.embeds[0];
      await msg.edit({ embeds: [{ ...embed.data, title: nuevoTitulo }] });
    } catch {}
    await interaction.reply({ content: 'Título actualizado.', ephemeral: true });
  });

  // Select para nuevo tipo
  client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isStringSelectMenu()) return;
    if (interaction.customId !== 'editarrolemenu_tipo_select') return;
    const session = client.editRoleMenuSession;
    if (!session || session.userId !== interaction.user.id) return;
    const nuevoTipo = interaction.values[0];
    await RoleMenu.updateOne({ messageId: session.messageId }, { type: nuevoTipo });
    await interaction.reply({ content: 'Tipo actualizado.', ephemeral: true });
  });

  // Acción sobre roles
  client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isStringSelectMenu()) return;
    if (interaction.customId !== 'editarrolemenu_roles_accion') return;
    const session = client.editRoleMenuSession;
    if (!session || session.userId !== interaction.user.id) return;
    if (interaction.values[0] === 'agregar') {
      // Modal para agregar nuevo rol
      const modal = new ModalBuilder()
        .setCustomId('editarrolemenu_roles_agregar')
        .setTitle('Agregar Rol')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('label')
              .setLabel('Nombre para mostrar')
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('roleId')
              .setLabel('ID del rol (copia el ID del rol)')
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('emoji')
              .setLabel('Emoji (puedes pegar un emoji o custom emoji)')
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          )
        );
      await interaction.showModal(modal);
    } else if (interaction.values[0] === 'quitar') {
      // Menú para elegir rol a quitar
      const session = client.editRoleMenuSession;
      const options = session.roleMenu.roles.map((r, i) => ({
        label: `${r.emoji} ${r.label}`,
        value: String(i)
      }));
      const row = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('editarrolemenu_roles_quitar')
          .setPlaceholder('Selecciona el rol a quitar')
          .addOptions(options)
      );
      await interaction.reply({ content: 'Selecciona el rol que deseas quitar:', components: [row], ephemeral: true });
    } else if (interaction.values[0] === 'editar') {
      // Menú para elegir rol a editar
      const session = client.editRoleMenuSession;
      const options = session.roleMenu.roles.map((r, i) => ({
        label: `${r.emoji} ${r.label}`,
        value: String(i)
      }));
      const row = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('editarrolemenu_roles_editar')
          .setPlaceholder('Selecciona el rol a editar')
          .addOptions(options)
      );
      await interaction.reply({ content: 'Selecciona el rol que deseas editar:', components: [row], ephemeral: true });
    }
  });

  // Modal submit para agregar rol
  client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isModalSubmit()) return;
    if (interaction.customId !== 'editarrolemenu_roles_agregar') return;
    const session = client.editRoleMenuSession;
    if (!session || session.userId !== interaction.user.id) return;
    const label = interaction.fields.getTextInputValue('label');
    const roleId = interaction.fields.getTextInputValue('roleId');
    const emoji = interaction.fields.getTextInputValue('emoji');
    // Actualizar en DB
    await RoleMenu.updateOne(
      { messageId: session.messageId },
      { $push: { roles: { label, roleId, emoji } } }
    );
    await interaction.reply({ content: 'Rol agregado al rolemenu.', ephemeral: true });
  });

  // Quitar rol
  client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isStringSelectMenu()) return;
    if (interaction.customId !== 'editarrolemenu_roles_quitar') return;
    const session = client.editRoleMenuSession;
    if (!session || session.userId !== interaction.user.id) return;
    const index = Number(interaction.values[0]);
    const roleMenu = await RoleMenu.findOne({ messageId: session.messageId });
    if (!roleMenu) return interaction.reply({ content: 'Rolemenu no encontrado.', ephemeral: true });
    roleMenu.roles.splice(index, 1);
    await roleMenu.save();
    await interaction.reply({ content: 'Rol eliminado del rolemenu.', ephemeral: true });
  });

  // Editar rol
  client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isStringSelectMenu()) return;
    if (interaction.customId !== 'editarrolemenu_roles_editar') return;
    const session = client.editRoleMenuSession;
    if (!session || session.userId !== interaction.user.id) return;
    const index = Number(interaction.values[0]);
    // Modal para editar rol
    const roleMenu = await RoleMenu.findOne({ messageId: session.messageId });
    const rol = roleMenu.roles[index];
    const modal = new ModalBuilder()
      .setCustomId('editarrolemenu_roles_editar_modal_' + index)
      .setTitle('Editar Rol')
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('label')
            .setLabel('Nombre para mostrar')
            .setStyle(TextInputStyle.Short)
            .setValue(rol.label)
            .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('roleId')
            .setLabel('ID del rol')
            .setStyle(TextInputStyle.Short)
            .setValue(rol.roleId)
            .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('emoji')
            .setLabel('Emoji')
            .setStyle(TextInputStyle.Short)
            .setValue(rol.emoji)
            .setRequired(true)
        )
      );
    await interaction.showModal(modal);
  });

  // Modal submit para editar rol
  client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isModalSubmit()) return;
    if (!interaction.customId.startsWith('editarrolemenu_roles_editar_modal_')) return;
    const session = client.editRoleMenuSession;
    if (!session || session.userId !== interaction.user.id) return;
    const index = Number(interaction.customId.split('_').pop());
    const label = interaction.fields.getTextInputValue('label');
    const roleId = interaction.fields.getTextInputValue('roleId');
    const emoji = interaction.fields.getTextInputValue('emoji');
    // Actualizar en DB
    const roleMenu = await RoleMenu.findOne({ messageId: session.messageId });
    if (!roleMenu) return interaction.reply({ content: 'Rolemenu no encontrado.', ephemeral: true });
    roleMenu.roles[index] = { label, roleId, emoji };
    await roleMenu.save();
    await interaction.reply({ content: 'Rol editado correctamente.', ephemeral: true });
  });
}

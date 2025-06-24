import { Events, ActionRowBuilder, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ComponentType, PermissionFlagsBits, ButtonBuilder, ButtonStyle } from 'discord.js';
import RoleMenu from '../models/RoleMenu.js';

const roleMenuSessions = new Map();
const ROLES_PER_PAGE = 25;

function getRoleOptions(roles, page, selected = []) {
  const start = page * ROLES_PER_PAGE;
  const pageRoles = roles.slice(start, start + ROLES_PER_PAGE);
  return pageRoles.map(r => ({
    label: `${r.name} (${r.members.size} miembros)`.slice(0, 100), // Mostrar cantidad de miembros
    value: r.id,
    default: selected.includes(r.id),
    description: `Posición: ${r.position}`.slice(0, 100)
  }));
}

function getPaginationButtons(page, maxPage, totalRoles, selectedCount) {
  const buttons = [];
  
  // Botón anterior
  if (page > 0) {
    buttons.push(
      new ButtonBuilder()
        .setCustomId('rolemenu_roles_prev')
        .setLabel('⬅️ Anterior')
        .setStyle(ButtonStyle.Secondary)
    );
  }
  
  // Botón de información
  buttons.push(
    new ButtonBuilder()
      .setCustomId('rolemenu_roles_info')
      .setLabel(`Página ${page + 1}/${maxPage + 1} | ${selectedCount} seleccionados`)
      .setStyle(ButtonStyle.Primary)
      .setDisabled(true)
  );
  
  // Botón siguiente
  if (page < maxPage) {
    buttons.push(
      new ButtonBuilder()
        .setCustomId('rolemenu_roles_next')
        .setLabel('Siguiente ➡️')
        .setStyle(ButtonStyle.Secondary)
    );
  }
  
  // Botón para finalizar selección
  if (selectedCount > 0) {
    buttons.push(
      new ButtonBuilder()
        .setCustomId('rolemenu_roles_finish')
        .setLabel(`✅ Continuar (${selectedCount})`)
        .setStyle(ButtonStyle.Success)
    );
  }
  
  return new ActionRowBuilder().addComponents(buttons);
}

function getRoleMenuMessage(page, maxPage, totalRoles, selectedRoles, selectedCount) {
  const start = page * ROLES_PER_PAGE;
  const end = Math.min(start + ROLES_PER_PAGE, totalRoles);
  
  let message = `**Selección de Roles para el Menú**\n`;
  message += `📄 Mostrando roles ${start + 1}-${end} de ${totalRoles}\n`;
  message += `✅ Roles seleccionados: ${selectedCount}/20\n\n`;
  
  if (selectedCount > 0) {
    message += `**Roles actualmente seleccionados:**\n`;
    // Mostrar solo los primeros 5 roles seleccionados para no saturar
    const selectedRoleNames = selectedRoles.slice(0, 5).map(id => `• <@&${id}>`).join('\n');
    message += selectedRoleNames;
    if (selectedRoles.length > 5) {
      message += `\n• ... y ${selectedRoles.length - 5} más`;
    }
    message += `\n\n`;
  }
  
  message += `Selecciona los roles que quieres incluir en el menú:`;
  
  return message;
}

export default function setupRoleMenuEvents(client) {
  // Modal submit: título del rolemenu
  client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isModalSubmit()) return;
    if (interaction.customId !== 'rolemenu_titulo_modal') return;
    
    const titulo = interaction.fields.getTextInputValue('titulo');
    roleMenuSessions.set(interaction.user.id, { titulo, roles: [] });
    
    const row = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('rolemenu_tipo_select')
        .setPlaceholder('Selecciona el tipo de rolemenu')
        .addOptions([
          { label: 'Múltiple (varios roles)', value: 'multiple', description: 'Los usuarios pueden elegir varios roles.' },
          { label: 'Simple (solo un rol)', value: 'simple', description: 'Solo un rol por usuario.' }
        ])
    );
    
    await interaction.reply({ 
      content: 'Selecciona el tipo de rolemenu:', 
      components: [row], 
      ephemeral: true 
    });
  });

  // Select tipo de rolemenu
  client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isStringSelectMenu()) return;
    if (interaction.customId !== 'rolemenu_tipo_select') return;
    
    const tipo = interaction.values[0];
    const session = roleMenuSessions.get(interaction.user.id);
    if (!session) return interaction.reply({ content: '❌ Sesión no encontrada.', ephemeral: true });
    
    session.tipo = tipo;
    
    // Obtener todos los roles válidos
    const rolesArr = interaction.guild.roles.cache
      .filter(r => r.id !== interaction.guild.id && !r.managed && r.editable)
      .sort((a, b) => b.position - a.position)
      .map(r => r);
    
    if (!rolesArr.length) {
      return interaction.reply({ 
        content: '❌ No hay roles disponibles para seleccionar.', 
        ephemeral: true 
      });
    }
    
    session.rolesArr = rolesArr;
    session.rolesPage = 0;
    session.selectedRoles = [];
    
    const maxPage = Math.max(0, Math.ceil(rolesArr.length / ROLES_PER_PAGE) - 1);
    const options = getRoleOptions(rolesArr, 0, []);
    
    const selectRow = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('rolemenu_roles_select')
        .setPlaceholder('Selecciona roles para el menú...')
        .setMinValues(0)
        .setMaxValues(Math.min(ROLES_PER_PAGE, options.length))
        .addOptions(options)
    );
    
    const buttonRow = getPaginationButtons(0, maxPage, rolesArr.length, 0);
    const message = getRoleMenuMessage(0, maxPage, rolesArr.length, [], 0);
    
    await interaction.reply({ 
      content: message,
      components: [selectRow, buttonRow], 
      ephemeral: true 
    });
  });

  // Select menu para elegir roles (multi-select)
  client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isStringSelectMenu()) return;
    if (interaction.customId !== 'rolemenu_roles_select') return;
    
    const session = roleMenuSessions.get(interaction.user.id);
    if (!session) return interaction.reply({ content: '❌ Sesión no encontrada.', ephemeral: true });
    
    // Actualizar selección: remover los que ya no están seleccionados y agregar los nuevos
    const currentPageStart = session.rolesPage * ROLES_PER_PAGE;
    const currentPageEnd = currentPageStart + ROLES_PER_PAGE;
    const currentPageRoleIds = session.rolesArr.slice(currentPageStart, currentPageEnd).map(r => r.id);
    
    // Remover roles de la página actual que ya no están seleccionados
    session.selectedRoles = session.selectedRoles.filter(id => !currentPageRoleIds.includes(id));
    
    // Agregar roles seleccionados en esta página
    session.selectedRoles.push(...interaction.values);
    
    // Limitar a máximo 20 roles
    if (session.selectedRoles.length > 20) {
      session.selectedRoles = session.selectedRoles.slice(0, 20);
    }
    
    const maxPage = Math.max(0, Math.ceil(session.rolesArr.length / ROLES_PER_PAGE) - 1);
    const options = getRoleOptions(session.rolesArr, session.rolesPage, session.selectedRoles);
    
    const selectRow = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('rolemenu_roles_select')
        .setPlaceholder('Selecciona roles para el menú...')
        .setMinValues(0)
        .setMaxValues(options.length)
        .addOptions(options)
    );
    
    const buttonRow = getPaginationButtons(session.rolesPage, maxPage, session.rolesArr.length, session.selectedRoles.length);
    const message = getRoleMenuMessage(session.rolesPage, maxPage, session.rolesArr.length, session.selectedRoles, session.selectedRoles.length);
    
    await interaction.update({ 
      content: message,
      components: [selectRow, buttonRow]
    });
  });

  // Paginación - botones
  client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isButton()) return;
    if (!['rolemenu_roles_next', 'rolemenu_roles_prev', 'rolemenu_roles_finish'].includes(interaction.customId)) return;
    
    const session = roleMenuSessions.get(interaction.user.id);
    if (!session) return interaction.reply({ content: '❌ Sesión no encontrada.', ephemeral: true });
    
    // Si presiona finalizar
    if (interaction.customId === 'rolemenu_roles_finish') {
      if (session.selectedRoles.length === 0) {
        return interaction.reply({ content: '❌ Debes seleccionar al menos un rol.', ephemeral: true });
      }
      
      session.roleIndex = 0;
      session.roles = [];
      
      await interaction.reply({ content: '⚙️ Configurando roles seleccionados...', ephemeral: true });
      await pedirDatosRol(interaction, session);
      return;
    }
    
    // Navegación
    const maxPage = Math.max(0, Math.ceil(session.rolesArr.length / ROLES_PER_PAGE) - 1);
    
    if (interaction.customId === 'rolemenu_roles_next') {
      session.rolesPage = Math.min(maxPage, session.rolesPage + 1);
    } else if (interaction.customId === 'rolemenu_roles_prev') {
      session.rolesPage = Math.max(0, session.rolesPage - 1);
    }
    
    const options = getRoleOptions(session.rolesArr, session.rolesPage, session.selectedRoles);
    
    const selectRow = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('rolemenu_roles_select')
        .setPlaceholder('Selecciona roles para el menú...')
        .setMinValues(0)
        .setMaxValues(options.length)
        .addOptions(options)
    );
    
    const buttonRow = getPaginationButtons(session.rolesPage, maxPage, session.rolesArr.length, session.selectedRoles.length);
    const message = getRoleMenuMessage(session.rolesPage, maxPage, session.rolesArr.length, session.selectedRoles, session.selectedRoles.length);
    
    await interaction.update({ 
      content: message,
      components: [selectRow, buttonRow]
    });
  });

  // Resto de tus eventos existentes...
  // Handler para el select menu de emojis custom
  client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isStringSelectMenu()) return;
    if (interaction.customId !== 'rolemenu_emoji_select') return;
    const session = roleMenuSessions.get(interaction.user.id);
    if (!session) return interaction.reply({ content: 'Sesión no encontrada.', ephemeral: true });
    session.selectedEmoji = interaction.values[0];
    await mostrarModalEmoji(interaction, session, session.roleNameForModal, session.selectedEmoji);
  });
}

// Tus funciones existentes (pedirDatosRol, limpiarMensajes, etc.) se mantienen igual...
async function pedirDatosRol(interaction, session) {
  const roles = interaction.guild.roles.cache;
  const roleId = session.selectedRoles[session.roleIndex];
  const role = roles.get(roleId);
  const roleName = role ? role.name : roleId;

  const msg = await interaction.channel.send({
    content: `<@${interaction.user.id}> **[${session.roleIndex + 1}/${session.selectedRoles.length}]** Escribe el nombre para mostrar para el rol: **${roleName}**`,
  });

  const filterMsg = m => m.author.id === interaction.user.id && !m.author.bot;
  
  try {
    const collected = await interaction.channel.awaitMessages({ 
      filter: filterMsg, 
      max: 1, 
      time: 60000,
      errors: ['time']
    });
    
    const label = collected.first().content;
    await collected.first().delete().catch(() => {});
    
    await msg.edit({ 
      content: `**[${session.roleIndex + 1}/${session.selectedRoles.length}]** Nombre para el rol **${roleName}**: \n"${label}"\n\n🔸 **Reacciona a este mensaje** con el emoji que quieras asociar a este rol.\n\n⏰ Tienes 60 segundos...` 
    });

    const filterReact = (reaction, user) => {
      return user.id === interaction.user.id && !user.bot;
    };

    const collectedReact = await msg.awaitReactions({ 
      filter: filterReact, 
      max: 1, 
      time: 60000,
      errors: ['time']
    });
    
    const firstReaction = collectedReact.first();
    if (!firstReaction) {
      throw new Error('No se recibió reacción');
    }

    let emoji;
    if (firstReaction.emoji.id) {
      emoji = `<${firstReaction.emoji.animated ? 'a' : ''}:${firstReaction.emoji.name}:${firstReaction.emoji.id}>`;
    } else {
      emoji = firstReaction.emoji.name;
    }

    session.roles.push({ label, roleId, emoji });
    session.roleIndex++;
    
    await limpiarMensajes([msg]);
    
    if (session.roleIndex < session.selectedRoles.length) {
      await pedirDatosRol(interaction, session);
    } else {
      await finalizarRoleMenu(interaction, session);
    }
    
  } catch (error) {
    await msg.edit({ content: '⏰ Tiempo agotado. Setup cancelado.' }).catch(() => {});
    await limpiarMensajes([msg]);
    roleMenuSessions.delete(interaction.user.id);
  }
}

async function limpiarMensajes(msgs) {
  for (const m of msgs) {
    try { await m.delete(); } catch {}
  }
}

async function mostrarModalEmoji(interaction, session, roleName, emojiValue = '') {
  const modalTitle = `Configura: ${roleName}`.slice(0, 45);
  const emojiLabel = 'Emoji (pega o deja el seleccionado)'.slice(0, 45);
  const modal = new ModalBuilder()
    .setCustomId('rolemenu_rol_modal_' + session.roleIndex)
    .setTitle(modalTitle)
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
          .setCustomId('emoji')
          .setLabel(emojiLabel)
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setValue(emojiValue)
      )
    );
  if (interaction.showModal) {
    await interaction.showModal(modal);
  } else if (interaction.reply) {
    await interaction.reply({ content: 'Por favor, actualiza discord.js para soporte completo de modals.', ephemeral: true });
  }
}

async function finalizarRoleMenu(interaction, session) {
  const { titulo, tipo, roles } = session;
  const roleMenu = await RoleMenu.create({
    guildId: interaction.guildId,
    channelId: interaction.channelId,
    messageId: null,
    title: titulo,
    description: 'Reacciona para obtener los roles',
    type: tipo,
    roles
  });
  
  let desc = 'Reacciona para obtener los roles:';
  for (const r of roles) {
    desc += `\n${r.emoji} **${r.label}** <@&${r.roleId}>`;
  }
  
  const msg = await interaction.channel.send({
    embeds: [{
      title: titulo,
      description: desc,
      color: 0x8e44ad
    }]
  });
  
  roleMenu.messageId = msg.id;
  await roleMenu.save();
  
  for (const r of roles) {
    try { await msg.react(r.emoji); } catch {}
  }
  
  await interaction.followUp({ content: '✅ ¡Rolemenu creado exitosamente!', ephemeral: true });
  roleMenuSessions.delete(interaction.user.id);
}
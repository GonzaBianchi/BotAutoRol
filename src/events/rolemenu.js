import { Events, ActionRowBuilder, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ComponentType, PermissionFlagsBits } from 'discord.js';
import RoleMenu from '../models/RoleMenu.js';

// Estado temporal en memoria (puedes migrar a MongoDB si quieres persistencia entre reinicios)
const roleMenuSessions = new Map();

export default function setupRoleMenuEvents(client) {
  // Eliminar listeners innecesarios y limpiar el flujo
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
    await interaction.reply({ content: 'Selecciona el tipo de rolemenu:', components: [row], ephemeral: true });
  });

  // Select tipo de rolemenu
  client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isStringSelectMenu()) return;
    if (interaction.customId !== 'rolemenu_tipo_select') return;
    const tipo = interaction.values[0];
    const session = roleMenuSessions.get(interaction.user.id);
    if (!session) return interaction.reply({ content: 'Sesión no encontrada.', ephemeral: true });
    session.tipo = tipo;
    const roles = interaction.guild.roles.cache.filter(r => r.editable && !r.managed && r.id !== interaction.guild.id);
    const options = roles.map(r => ({ label: r.name, value: r.id })).slice(0, 20);
    if (!options.length) return interaction.reply({ content: 'No hay roles disponibles para seleccionar.', ephemeral: true });
    const row = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('rolemenu_roles_select')
        .setPlaceholder('Selecciona los roles para el rolemenu (máx 20)')
        .setMinValues(1)
        .setMaxValues(Math.min(20, options.length))
        .addOptions(options)
    );
    await interaction.reply({ content: 'Selecciona los roles que formarán parte del rolemenu:', components: [row], ephemeral: true });
  });

  // Select menu para elegir roles (multi-select)
  client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isStringSelectMenu()) return;
    if (interaction.customId !== 'rolemenu_roles_select') return;
    const session = roleMenuSessions.get(interaction.user.id);
    if (!session) return interaction.reply({ content: 'Sesión no encontrada.', ephemeral: true });
    session.selectedRoles = interaction.values; // array de IDs
    session.roleIndex = 0;
    session.roles = [];
    // Responder a la interacción para evitar el error de Discord
    await interaction.reply({ content: 'Configurando roles seleccionados...', ephemeral: true });
    // Iniciar flujo de mensajes y reacciones
    await pedirDatosRol(interaction, session);
  });

  // Handler para el select menu de emojis custom
  client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isStringSelectMenu()) return;
    if (interaction.customId !== 'rolemenu_emoji_select') return;
    const session = roleMenuSessions.get(interaction.user.id);
    if (!session) return interaction.reply({ content: 'Sesión no encontrada.', ephemeral: true });
    // Guardar el emoji custom seleccionado
    session.selectedEmoji = interaction.values[0];
    // Mostrar el modal para el nombre del rol y confirmar el emoji
    await mostrarModalEmoji(interaction, session, session.roleNameForModal, session.selectedEmoji);
  });
}

async function pedirDatosRol(interaction, session) {
  const roles = interaction.guild.roles.cache;
  const roleId = session.selectedRoles[session.roleIndex];
  const role = roles.get(roleId);
  const roleName = role ? role.name : roleId;

  // Mensaje para pedir el nombre personalizado
  const msg = await interaction.channel.send({
    content: `<@${interaction.user.id}> Escribe el nombre para mostrar para el rol: **${roleName}**`,
  });

  // Esperar respuesta del usuario
  const filterMsg = m => m.author.id === interaction.user.id;
  const collected = await interaction.channel.awaitMessages({ filter: filterMsg, max: 1, time: 60000 });
  if (!collected.size) {
    await msg.edit({ content: 'No se recibió respuesta. Cancela el setup.' });
    await limpiarMensajes([msg]);
    return;
  }
  const label = collected.first().content;
  await collected.first().delete();
  await msg.edit({ content: `Nombre para el rol **${roleName}**: \n">${label}"\nAhora reacciona a este mensaje con el emoji que quieras asociar a este rol.` });

  // Esperar reacción del usuario
  const filterReact = (reaction, user) => {
    if (user.id !== interaction.user.id) return false;
    // Permitir emojis estándar y custom
    if (reaction.emoji.id) return true; // custom emoji
    if (reaction.emoji.name && reaction.emoji.name.length > 0) return true; // estándar
    return false;
  };
  try {
    const collectedReact = await msg.awaitReactions({ filter: filterReact, max: 1, time: 60000 });
    const firstReaction = collectedReact.first();
    if (!firstReaction) {
      try { await msg.edit({ content: 'No se recibió reacción. Cancela el setup.' }); } catch {}
      await limpiarMensajes([msg]);
      return;
    }
    // Buscar el usuario en la lista de usuarios de la reacción
    const users = await firstReaction.users.fetch();
    if (!users.has(interaction.user.id)) {
      try { await msg.edit({ content: 'No se detectó tu reacción. Cancela el setup.' }); } catch {}
      await limpiarMensajes([msg]);
      return;
    }
    // Obtener el emoji en formato usable para .react()
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
  } catch (err) {
    try { await msg.edit({ content: 'No se recibió reacción. Cancela el setup.' }); } catch {}
    await limpiarMensajes([msg]);
  }
}

// Limpia mensajes auxiliares del setup
async function limpiarMensajes(msgs) {
  for (const m of msgs) {
    try { await m.delete(); } catch {}
  }
}

async function mostrarModalEmoji(interaction, session, roleName, emojiValue = '') {
  const modalTitle = `Configura: ${roleName}`.slice(0, 45);
  const emojiLabel = 'Emoji (pega o deja el seleccionado)'.slice(0, 45); // Discord solo permite 45 caracteres
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
  // Guardar en MongoDB
  const { titulo, tipo, roles } = session;
  const roleMenu = await RoleMenu.create({
    guildId: interaction.guildId,
    channelId: interaction.channelId,
    messageId: null, // Se completará al enviar el mensaje
    title: titulo,
    description: 'Reacciona para obtener los roles',
    type: tipo,
    roles
  });
  // Enviar mensaje de rolemenu
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
  // Guardar messageId
  roleMenu.messageId = msg.id;
  await roleMenu.save();
  // Agregar reacciones
  for (const r of roles) {
    try { await msg.react(r.emoji); } catch {}
  }
  await interaction.reply({ content: '¡Rolemenu creado!', ephemeral: true });
  roleMenuSessions.delete(interaction.user.id);
}

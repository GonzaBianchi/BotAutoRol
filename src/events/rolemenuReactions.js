import { Events } from 'discord.js';
import RoleMenu from '../models/RoleMenu.js';

// Map para manejar timeouts de limpieza de reacciones
const reactionCleanupTimeouts = new Map();
// Map para evitar procesamiento duplicado
const processingUsers = new Set();
// Map para trackear el último emoji seleccionado por usuario
const userLastEmoji = new Map();

export default function setupRoleMenuReactions(client) {
  // Añadir rol al reaccionar
  client.on(Events.MessageReactionAdd, async (reaction, user) => {
    if (user.bot) return;
    
    // Evitar procesamiento duplicado
    const processingKey = `${user.id}-${reaction.message.id}`;
    if (processingUsers.has(processingKey)) {
      console.log('⏭️ Ya procesando reacción para este usuario, saltando...');
      return;
    }
    
    processingUsers.add(processingKey);
    
    try {
      // Buscar rolemenu por mensaje
      const roleMenu = await RoleMenu.findOne({ messageId: reaction.message.id });
      if (!roleMenu) {
        processingUsers.delete(processingKey);
        return;
      }
      
      const member = await reaction.message.guild.members.fetch(user.id);
      
      // Comparar emoji robustamente
      const emojiStr = reaction.emoji.id
        ? `<${reaction.emoji.animated ? 'a' : ''}:${reaction.emoji.name}:${reaction.emoji.id}>`
        : reaction.emoji.name;
      
      const roleData = roleMenu.roles.find(r => r.emoji === emojiStr);
      if (!roleData) {
        console.log('❌ Emoji no encontrado en rolemenu:', emojiStr);
        processingUsers.delete(processingKey);
        return;
      }
      
      const role = member.guild.roles.cache.get(roleData.roleId);
      if (!role) {
        console.log('❌ Rol no encontrado:', roleData.roleId);
        processingUsers.delete(processingKey);
        return;
      }
      
      // Verificaciones básicas de permisos
      const botMember = await reaction.message.guild.members.fetchMe();
      if (!botMember.permissions.has('ManageRoles') || role.position >= botMember.roles.highest.position) {
        console.log('❌ Sin permisos para gestionar el rol:', role.name);
        processingUsers.delete(processingKey);
        return;
      }
      
      console.log(`🔄 Procesando reacción ${emojiStr} para ${member.displayName}`);
      
      // Trackear el último emoji del usuario
      const userKey = `${user.id}-${reaction.message.id}`;
      const lastEmoji = userLastEmoji.get(userKey);
      userLastEmoji.set(userKey, emojiStr);
      
      // Para rolemenu tipo 'simple', limpiar primero otros roles y reacciones
      if (roleMenu.type === 'simple') {
        // Cancelar cualquier timeout anterior
        const timeoutKey = `${user.id}-${reaction.message.id}`;
        if (reactionCleanupTimeouts.has(timeoutKey)) {
          clearTimeout(reactionCleanupTimeouts.get(timeoutKey));
          reactionCleanupTimeouts.delete(timeoutKey);
        }
        
        // Limpiar inmediatamente en paralelo
        cleanupOtherReactions(reaction.message, user, roleMenu, emojiStr, member)
          .catch(error => console.error('❌ Error en limpieza:', error));
      }
      
      // Asignar el nuevo rol
      try {
        if (!member.roles.cache.has(roleData.roleId)) {
          await member.roles.add(roleData.roleId);
          console.log(`✅ Rol ${role.name} asignado a ${member.displayName}`);
        } else {
          console.log(`ℹ️ ${member.displayName} ya tiene el rol ${role.name}`);
        }
      } catch (error) {
        console.error(`❌ Error asignando rol ${role.name}:`, error);
      }
      
    } catch (error) {
      console.error('❌ Error general en MessageReactionAdd:', error);
    } finally {
      // Limpiar el flag de procesamiento después de un delay más corto
      setTimeout(() => {
        processingUsers.delete(processingKey);
      }, 500);
    }
  });

  // Quitar rol al quitar reacción
  client.on(Events.MessageReactionRemove, async (reaction, user) => {
    if (user.bot) return;
    
    try {
      const roleMenu = await RoleMenu.findOne({ messageId: reaction.message.id });
      if (!roleMenu) return;
      
      const member = await reaction.message.guild.members.fetch(user.id);
      
      const emojiStr = reaction.emoji.id
        ? `<${reaction.emoji.animated ? 'a' : ''}:${reaction.emoji.name}:${reaction.emoji.id}>`
        : reaction.emoji.name;
      
      const roleData = roleMenu.roles.find(r => r.emoji === emojiStr);
      if (!roleData) return;
      
      // Quitar rol
      try {
        const role = member.guild.roles.cache.get(roleData.roleId);
        if (role && member.roles.cache.has(roleData.roleId)) {
          await member.roles.remove(roleData.roleId);
          console.log(`🗑️ Rol ${role.name} removido de ${member.displayName}`);
        }
      } catch (error) {
        console.error(`❌ Error removiendo rol ${roleData.roleId}:`, error);
      }
      
    } catch (error) {
      console.error('❌ Error en MessageReactionRemove:', error);
    }
  });
}

// Función auxiliar mejorada para limpiar otras reacciones en modo 'simple'
async function cleanupOtherReactions(message, user, roleMenu, currentEmoji, member) {
  try {
    console.log(`🧹 Iniciando limpieza para ${member.displayName}, emoji actual: ${currentEmoji}`);
    
    // Pequeño delay para asegurar que Discord procese la reacción actual
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Re-fetch del mensaje
    let freshMessage;
    try {
      freshMessage = await message.fetch(true);
    } catch (error) {
      console.error('❌ Error fetching message:', error);
      return;
    }
    
    // Procesar cada rol del menú en paralelo para mayor eficiencia
    const cleanupPromises = roleMenu.roles
      .filter(roleConfig => roleConfig.emoji !== currentEmoji)
      .map(async (roleConfig) => {
        try {
          // Remover rol si el usuario lo tiene
          const role = member.guild.roles.cache.get(roleConfig.roleId);
          if (role && member.roles.cache.has(roleConfig.roleId)) {
            await member.roles.remove(roleConfig.roleId);
            console.log(`🧹 Rol ${role.name} removido de ${member.displayName}`);
          }
          
          // Buscar y remover la reacción correspondiente
          const targetReaction = freshMessage.reactions.cache.find(msgReaction => {
            const msgEmojiStr = msgReaction.emoji.id
              ? `<${msgReaction.emoji.animated ? 'a' : ''}:${msgReaction.emoji.name}:${msgReaction.emoji.id}>`
              : msgReaction.emoji.name;
            return msgEmojiStr === roleConfig.emoji;
          });
          
          if (targetReaction) {
            await removeUserReaction(targetReaction, user, roleConfig.emoji);
          }
          
        } catch (error) {
          console.error(`❌ Error limpiando ${roleConfig.emoji}:`, error.message);
        }
      });
    
    // Esperar a que todas las operaciones terminen
    await Promise.allSettled(cleanupPromises);
    
    console.log(`✅ Limpieza completada para ${member.displayName}`);
    
  } catch (error) {
    console.error('❌ Error en cleanupOtherReactions:', error.message);
  }
}

// Función auxiliar para remover reacciones de usuario con múltiples intentos
async function removeUserReaction(reaction, user, emojiStr) {
  const maxRetries = 3;
  let retries = 0;
  
  while (retries < maxRetries) {
    try {
      // Verificar si el usuario tiene la reacción
      const users = await reaction.users.fetch();
      if (!users.has(user.id)) {
        console.log(`ℹ️ Usuario no tiene reacción ${emojiStr}, saltando...`);
        return;
      }
      
      // Intentar remover la reacción
      await reaction.users.remove(user.id);
      console.log(`🧹 Reacción ${emojiStr} removida exitosamente`);
      return;
      
    } catch (error) {
      retries++;
      console.log(`⚠️ Intento ${retries}/${maxRetries} fallido para ${emojiStr}:`, error.message);
      
      // Manejar errores específicos
      if (error.code === 10008) { // Unknown Message
        console.log(`❌ Mensaje no encontrado, abortando ${emojiStr}`);
        return;
      }
      
      if (error.code === 50013) { // Missing Permissions
        console.log(`❌ Sin permisos para remover reacción ${emojiStr}`);
        return;
      }
      
      if (error.code === 10014) { // Unknown Emoji
        console.log(`❌ Emoji desconocido ${emojiStr}`);
        return;
      }
      
      // Si no es el último intento, esperar antes de reintentar
      if (retries < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 200 * retries));
      }
    }
  }
  
  console.error(`❌ No se pudo remover reacción ${emojiStr} después de ${maxRetries} intentos`);
}
import { Events } from 'discord.js';
import RoleMenu from '../models/RoleMenu.js';

// Map para manejar timeouts de limpieza de reacciones
const reactionCleanupTimeouts = new Map();

export default function setupRoleMenuReactions(client) {
  // Añadir rol al reaccionar
  client.on(Events.MessageReactionAdd, async (reaction, user) => {
    if (user.bot) return;
    
    try {
      // Buscar rolemenu por mensaje
      const roleMenu = await RoleMenu.findOne({ messageId: reaction.message.id });
      if (!roleMenu) return;
      
      const member = await reaction.message.guild.members.fetch(user.id);
      
      // Comparar emoji robustamente
      const emojiStr = reaction.emoji.id
        ? `<${reaction.emoji.animated ? 'a' : ''}:${reaction.emoji.name}:${reaction.emoji.id}>`
        : reaction.emoji.name;
      
      const roleData = roleMenu.roles.find(r => r.emoji === emojiStr);
      if (!roleData) return;
      
      // Asignar el nuevo rol primero
      try {
        const role = member.guild.roles.cache.get(roleData.roleId);
        if (role && !member.roles.cache.has(roleData.roleId)) {
          await member.roles.add(roleData.roleId);
          console.log(`✅ Rol ${role.name} asignado a ${member.displayName}`);
        }
      } catch (error) {
        console.error(`❌ Error asignando rol ${roleData.roleId}:`, error);
        return; // Si no se puede asignar el rol, no continuar
      }
      
      // Solo limpiar reacciones si es tipo 'simple'
      if (roleMenu.type === 'simple') {
        const timeoutKey = `${user.id}-${reaction.message.id}`;
        
        // Cancelar timeout anterior si existe
        if (reactionCleanupTimeouts.has(timeoutKey)) {
          clearTimeout(reactionCleanupTimeouts.get(timeoutKey));
        }
        
        // Programar limpieza con debounce
        const timeoutId = setTimeout(async () => {
          try {
            await cleanupOtherReactions(reaction.message, user, roleMenu, roleData.emoji);
            reactionCleanupTimeouts.delete(timeoutKey);
          } catch (error) {
            console.error('❌ Error en limpieza de reacciones:', error);
            reactionCleanupTimeouts.delete(timeoutKey);
          }
        }, 150); // 150ms de delay para permitir que Discord procese la reacción
        
        reactionCleanupTimeouts.set(timeoutKey, timeoutId);
      }
      
    } catch (error) {
      console.error('❌ Error en MessageReactionAdd:', error);
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

// Función auxiliar para limpiar otras reacciones en modo 'simple'
async function cleanupOtherReactions(message, user, roleMenu, currentEmoji) {
  try {
    // Re-fetch del mensaje para obtener reacciones actualizadas
    const freshMessage = await message.fetch();
    const member = await message.guild.members.fetch(user.id);
    
    // Procesar cada rol del menú
    for (const roleConfig of roleMenu.roles) {
      if (roleConfig.emoji === currentEmoji) continue; // Saltar el emoji actual
      
      try {
        // Remover rol si el usuario lo tiene
        const role = member.guild.roles.cache.get(roleConfig.roleId);
        if (role && member.roles.cache.has(roleConfig.roleId)) {
          await member.roles.remove(roleConfig.roleId);
          console.log(`🧹 Rol ${role.name} limpiado de ${member.displayName}`);
        }
        
        // Buscar y remover la reacción correspondiente
        const targetReaction = freshMessage.reactions.cache.find(msgReaction => {
          const msgEmojiStr = msgReaction.emoji.id
            ? `<${msgReaction.emoji.animated ? 'a' : ''}:${msgReaction.emoji.name}:${msgReaction.emoji.id}>`
            : msgReaction.emoji.name;
          return msgEmojiStr === roleConfig.emoji;
        });
        
        if (targetReaction && targetReaction.users.cache.has(user.id)) {
          await targetReaction.users.remove(user.id);
          console.log(`🧹 Reacción ${roleConfig.emoji} limpiada de ${member.displayName}`);
        }
        
      } catch (error) {
        console.error(`❌ Error limpiando ${roleConfig.emoji} para usuario ${user.id}:`, error);
        // Continuar con el siguiente rol aunque uno falle
      }
    }
    
  } catch (error) {
    console.error('❌ Error en cleanupOtherReactions:', error);
  }
}
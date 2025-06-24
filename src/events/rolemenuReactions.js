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
      if (!roleData) {
        console.log('❌ Emoji no encontrado en rolemenu:', emojiStr);
        return;
      }
      
      const role = member.guild.roles.cache.get(roleData.roleId);
      if (!role) {
        console.log('❌ Rol no encontrado:', roleData.roleId);
        return;
      }
      
      // Verificaciones básicas de permisos solo si es necesario
      const botMember = await reaction.message.guild.members.fetchMe();
      if (!botMember.permissions.has('ManageRoles') || role.position >= botMember.roles.highest.position) {
        console.log('❌ Sin permisos para gestionar el rol:', role.name);
        return;
      }
      
      console.log(`🔄 Procesando reacción ${emojiStr} para ${member.displayName}`);
      
      // Para rolemenu tipo 'simple', limpiar primero otros roles y reacciones
      if (roleMenu.type === 'simple') {
        const timeoutKey = `${user.id}-${reaction.message.id}`;
        
        // Cancelar timeout anterior si existe
        if (reactionCleanupTimeouts.has(timeoutKey)) {
          clearTimeout(reactionCleanupTimeouts.get(timeoutKey));
        }
        
        // Limpiar inmediatamente otros roles y reacciones
        await cleanupOtherReactions(reaction.message, user, roleMenu, roleData.emoji, member);
        
        // Programar una segunda limpieza por si acaso
        const timeoutId = setTimeout(async () => {
          try {
            await cleanupOtherReactions(reaction.message, user, roleMenu, roleData.emoji, member);
            reactionCleanupTimeouts.delete(timeoutKey);
          } catch (error) {
            console.error('❌ Error en segunda limpieza:', error);
            reactionCleanupTimeouts.delete(timeoutKey);
          }
        }, 200);
        
        reactionCleanupTimeouts.set(timeoutKey, timeoutId);
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
async function cleanupOtherReactions(message, user, roleMenu, currentEmoji, member) {
  try {
    console.log(`🧹 Iniciando limpieza para ${member.displayName}, emoji actual: ${currentEmoji}`);
    
    // Re-fetch del mensaje para obtener reacciones actualizadas
    const freshMessage = await message.fetch();
    
    // Procesar cada rol del menú
    for (const roleConfig of roleMenu.roles) {
      if (roleConfig.emoji === currentEmoji) continue; // Saltar el emoji actual
      
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
        
        if (targetReaction && targetReaction.users.cache.has(user.id)) {
          await targetReaction.users.remove(user.id);
          console.log(`🧹 Reacción ${roleConfig.emoji} removida de ${member.displayName}`);
        }
        
        // Pequeño delay entre operaciones para evitar rate limits
        await new Promise(resolve => setTimeout(resolve, 50));
        
      } catch (error) {
        console.error(`❌ Error limpiando ${roleConfig.emoji}:`, error.message);
        // Continuar con el siguiente rol aunque uno falle
      }
    }
    
    console.log(`✅ Limpieza completada para ${member.displayName}`);
    
  } catch (error) {
    console.error('❌ Error en cleanupOtherReactions:', error.message);
  }
}
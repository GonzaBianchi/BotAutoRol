import { Events } from 'discord.js';
import RoleMenu from '../models/RoleMenu.js';

// Map para manejar timeouts de limpieza de reacciones
const reactionCleanupTimeouts = new Map();
// Map para evitar procesamiento duplicado
const processingUsers = new Set();

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
      
      // Para rolemenu tipo 'simple', limpiar primero otros roles y reacciones
      if (roleMenu.type === 'simple') {
        const timeoutKey = `${user.id}-${reaction.message.id}`;
        
        // Cancelar timeout anterior si existe
        if (reactionCleanupTimeouts.has(timeoutKey)) {
          clearTimeout(reactionCleanupTimeouts.get(timeoutKey));
          reactionCleanupTimeouts.delete(timeoutKey);
        }
        
        // Programar limpieza con un pequeño delay para asegurar que Discord procese la reacción
        const timeoutId = setTimeout(async () => {
          try {
            await cleanupOtherReactions(reaction.message, user, roleMenu, roleData.emoji, member);
            reactionCleanupTimeouts.delete(timeoutKey);
          } catch (error) {
            console.error('❌ Error en limpieza programada:', error);
            reactionCleanupTimeouts.delete(timeoutKey);
          }
        }, 500); // Aumentado el delay
        
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
    } finally {
      // Limpiar el flag de procesamiento después de un delay
      setTimeout(() => {
        processingUsers.delete(processingKey);
      }, 1000);
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
    
    // Re-fetch del mensaje con retry logic
    let freshMessage;
    try {
      freshMessage = await message.fetch(true); // Force fetch from API
    } catch (error) {
      console.error('❌ Error fetching message:', error);
      return;
    }
    
    // Crear un array de promesas para manejar las operaciones de forma secuencial
    const cleanupOperations = [];
    
    // Procesar cada rol del menú
    for (const roleConfig of roleMenu.roles) {
      if (roleConfig.emoji === currentEmoji) continue; // Saltar el emoji actual
      
      cleanupOperations.push(async () => {
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
            // Verificar si el usuario realmente tiene esta reacción
            const hasReaction = targetReaction.users.cache.has(user.id);
            if (hasReaction) {
              try {
                await targetReaction.users.remove(user.id);
                console.log(`🧹 Reacción ${roleConfig.emoji} removida de ${member.displayName}`);
              } catch (reactionError) {
                // Intentar método alternativo si falla
                if (reactionError.code === 10008) { // Unknown Message
                  console.log(`⚠️ Mensaje no encontrado, saltando reacción ${roleConfig.emoji}`);
                } else if (reactionError.code === 50013) { // Missing Permissions
                  console.log(`⚠️ Sin permisos para remover reacción ${roleConfig.emoji}`);
                } else {
                  console.error(`❌ Error removiendo reacción ${roleConfig.emoji}:`, reactionError.message);
                  
                  // Método alternativo: fetch usuarios de la reacción y remover
                  try {
                    const users = await targetReaction.users.fetch();
                    if (users.has(user.id)) {
                      await targetReaction.users.remove(user.id);
                      console.log(`🧹 Reacción ${roleConfig.emoji} removida (método alternativo)`);
                    }
                  } catch (altError) {
                    console.error(`❌ Método alternativo también falló:`, altError.message);
                  }
                }
              }
            } else {
              console.log(`ℹ️ Usuario no tiene reacción ${roleConfig.emoji}, saltando...`);
            }
          } else {
            console.log(`ℹ️ Reacción ${roleConfig.emoji} no encontrada en mensaje`);
          }
          
        } catch (error) {
          console.error(`❌ Error limpiando ${roleConfig.emoji}:`, error.message);
          // Continuar con el siguiente rol aunque uno falle
        }
      });
    }
    
    // Ejecutar operaciones de limpieza secuencialmente con delays
    for (let i = 0; i < cleanupOperations.length; i++) {
      try {
        await cleanupOperations[i]();
        // Delay entre operaciones para evitar rate limits
        if (i < cleanupOperations.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      } catch (error) {
        console.error(`❌ Error en operación de limpieza ${i}:`, error);
      }
    }
    
    console.log(`✅ Limpieza completada para ${member.displayName}`);
    
  } catch (error) {
    console.error('❌ Error en cleanupOtherReactions:', error.message);
  }
}
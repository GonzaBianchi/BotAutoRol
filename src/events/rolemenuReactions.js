import { Events } from 'discord.js';
import RoleMenu from '../models/RoleMenu.js';

// Map para evitar procesamiento duplicado
const processingUsers = new Set();
// Cache para rolemenus
const roleMenuCache = new Map();

export default function setupRoleMenuReactions(client) {
  // Cache rolemenus en memoria para mejor rendimiento
  client.on(Events.ClientReady, async () => {
    try {
      const roleMenus = await RoleMenu.find({});
      roleMenus.forEach(rm => {
        roleMenuCache.set(rm.messageId, rm);
      });
      console.log(`📋 ${roleMenus.length} rolemenus cargados en cache`);
    } catch (error) {
      console.error('❌ Error cargando rolemenus:', error);
    }
  });

  // Añadir rol al reaccionar
  client.on(Events.MessageReactionAdd, async (reaction, user) => {
    if (user.bot) return;
    
    // Evitar procesamiento duplicado
    const processingKey = `${user.id}-${reaction.message.id}`;
    if (processingUsers.has(processingKey)) return;
    
    processingUsers.add(processingKey);
    
    try {
      // Buscar en cache primero
      let roleMenu = roleMenuCache.get(reaction.message.id);
      if (!roleMenu) {
        roleMenu = await RoleMenu.findOne({ messageId: reaction.message.id });
        if (!roleMenu) {
          processingUsers.delete(processingKey);
          return;
        }
        // Agregar al cache
        roleMenuCache.set(reaction.message.id, roleMenu);
      }
      
      const member = await reaction.message.guild.members.fetch(user.id);
      
      // Comparar emoji
      const emojiStr = reaction.emoji.id
        ? `<${reaction.emoji.animated ? 'a' : ''}:${reaction.emoji.name}:${reaction.emoji.id}>`
        : reaction.emoji.name;
      
      const roleData = roleMenu.roles.find(r => r.emoji === emojiStr);
      if (!roleData) {
        processingUsers.delete(processingKey);
        return;
      }
      
      const role = member.guild.roles.cache.get(roleData.roleId);
      if (!role) {
        processingUsers.delete(processingKey);
        return;
      }
      
      // Verificaciones de permisos
      const botMember = await reaction.message.guild.members.fetchMe();
      if (!botMember.permissions.has('ManageRoles') || role.position >= botMember.roles.highest.position) {
        processingUsers.delete(processingKey);
        return;
      }
      
      console.log(`🔄 Procesando reacción ${emojiStr} para ${member.displayName}`);
      
      // Para rolemenu tipo 'simple' - OPTIMIZACIÓN CLAVE
      if (roleMenu.type === 'simple') {
        // Ejecutar limpieza y asignación en paralelo
        const [cleanupResult] = await Promise.allSettled([
          fastCleanupOtherReactions(reaction.message, user, roleMenu, emojiStr, member),
          assignRole(member, roleData.roleId, role)
        ]);
        
        if (cleanupResult.status === 'rejected') {
          console.error('❌ Error en limpieza rápida:', cleanupResult.reason);
        }
      } else {
        // Para tipo 'multiple', solo asignar rol
        await assignRole(member, roleData.roleId, role);
      }
      
    } catch (error) {
      console.error('❌ Error general en MessageReactionAdd:', error);
    } finally {
      // Limpiar inmediatamente
      processingUsers.delete(processingKey);
    }
  });

  // Quitar rol al quitar reacción - SIMPLIFICADO
  client.on(Events.MessageReactionRemove, async (reaction, user) => {
    if (user.bot) return;
    
    try {
      let roleMenu = roleMenuCache.get(reaction.message.id);
      if (!roleMenu) {
        roleMenu = await RoleMenu.findOne({ messageId: reaction.message.id });
        if (!roleMenu) return;
        roleMenuCache.set(reaction.message.id, roleMenu);
      }
      
      const member = await reaction.message.guild.members.fetch(user.id);
      
      const emojiStr = reaction.emoji.id
        ? `<${reaction.emoji.animated ? 'a' : ''}:${reaction.emoji.name}:${reaction.emoji.id}>`
        : reaction.emoji.name;
      
      const roleData = roleMenu.roles.find(r => r.emoji === emojiStr);
      if (!roleData) return;
      
      // Remover rol directamente
      const role = member.guild.roles.cache.get(roleData.roleId);
      if (role && member.roles.cache.has(roleData.roleId)) {
        await member.roles.remove(roleData.roleId);
        console.log(`🗑️ Rol ${role.name} removido de ${member.displayName}`);
      }
      
    } catch (error) {
      console.error('❌ Error en MessageReactionRemove:', error);
    }
  });
}

// Función optimizada para asignar roles
async function assignRole(member, roleId, role) {
  try {
    if (!member.roles.cache.has(roleId)) {
      await member.roles.add(roleId);
      console.log(`✅ Rol ${role.name} asignado a ${member.displayName}`);
    }
  } catch (error) {
    console.error(`❌ Error asignando rol ${role.name}:`, error);
  }
}

// Función de limpieza ULTRA OPTIMIZADA
async function fastCleanupOtherReactions(message, user, roleMenu, currentEmoji, member) {
  try {
    console.log(`🧹 Limpieza rápida para ${member.displayName}`);
    
    // 1. Remover roles en paralelo (más rápido que las reacciones)
    const roleRemovalPromises = roleMenu.roles
      .filter(roleConfig => roleConfig.emoji !== currentEmoji)
      .map(async (roleConfig) => {
        try {
          if (member.roles.cache.has(roleConfig.roleId)) {
            await member.roles.remove(roleConfig.roleId);
            const role = member.guild.roles.cache.get(roleConfig.roleId);
            console.log(`🧹 Rol ${role?.name || roleConfig.roleId} removido`);
          }
        } catch (error) {
          console.error(`❌ Error removiendo rol ${roleConfig.roleId}:`, error.message);
        }
      });
    
    // 2. Remover reacciones usando un método más directo
    const reactionRemovalPromises = roleMenu.roles
      .filter(roleConfig => roleConfig.emoji !== currentEmoji)
      .map(async (roleConfig) => {
        try {
          // Buscar la reacción específica
          const targetReaction = message.reactions.cache.find(msgReaction => {
            const msgEmojiStr = msgReaction.emoji.id
              ? `<${msgReaction.emoji.animated ? 'a' : ''}:${msgReaction.emoji.name}:${msgReaction.emoji.id}>`
              : msgReaction.emoji.name;
            return msgEmojiStr === roleConfig.emoji;
          });
          
          if (targetReaction) {
            // Método directo sin múltiples verificaciones
            await targetReaction.users.remove(user.id);
            console.log(`🧹 Reacción ${roleConfig.emoji} removida`);
          }
        } catch (error) {
          // Ignorar errores de reacciones - no son críticos
          if (error.code !== 10008 && error.code !== 10014) {
            console.log(`⚠️ Error removiendo reacción ${roleConfig.emoji}: ${error.message}`);
          }
        }
      });
    
    // Ejecutar todo en paralelo y esperar solo los roles (críticos)
    await Promise.all(roleRemovalPromises);
    
    // Las reacciones pueden procesarse en background
    Promise.allSettled(reactionRemovalPromises);
    
    console.log(`✅ Limpieza completada para ${member.displayName}`);
    
  } catch (error) {
    console.error('❌ Error en fastCleanupOtherReactions:', error);
  }
}
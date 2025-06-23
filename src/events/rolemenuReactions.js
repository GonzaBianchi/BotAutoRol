import { Events } from 'discord.js';
import RoleMenu from '../models/RoleMenu.js';

export default function setupRoleMenuReactions(client) {
  // Añadir rol al reaccionar
  client.on(Events.MessageReactionAdd, async (reaction, user) => {
    if (user.bot) return;
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
    if (roleMenu.type === 'simple') {
      // Quitar otras reacciones y roles
      for (const r of roleMenu.roles) {
        if (r.emoji !== roleData.emoji) {
          try { await reaction.message.reactions.resolve(r.emoji)?.users.remove(user.id); } catch {}
          try { await member.roles.remove(r.roleId); } catch {}
        }
      }
    }
    // Asignar rol
    try { await member.roles.add(roleData.roleId); } catch {}
  });

  // Quitar rol al quitar reacción
  client.on(Events.MessageReactionRemove, async (reaction, user) => {
    if (user.bot) return;
    const roleMenu = await RoleMenu.findOne({ messageId: reaction.message.id });
    if (!roleMenu) return;
    const member = await reaction.message.guild.members.fetch(user.id);
    const emojiStr = reaction.emoji.id
      ? `<${reaction.emoji.animated ? 'a' : ''}:${reaction.emoji.name}:${reaction.emoji.id}>`
      : reaction.emoji.name;
    const roleData = roleMenu.roles.find(r => r.emoji === emojiStr);
    if (!roleData) return;
    // Quitar rol
    try { await member.roles.remove(roleData.roleId); } catch {}
  });
}

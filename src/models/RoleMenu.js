import mongoose from 'mongoose';

const roleMenuSchema = new mongoose.Schema({
  guildId: String,
  channelId: String,
  messageId: String,
  title: String,
  description: String,
  type: { type: String, enum: ['simple', 'multiple'], default: 'multiple' },
  roles: [
    {
      roleId: String,
      label: String,
      emoji: String
    }
  ]
});

export default mongoose.model('RoleMenu', roleMenuSchema);

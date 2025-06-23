import { Events } from 'discord.js';

export default function setupReadyEvent(client) {
  client.on(Events.ClientReady, () => {
    console.log('¡Bot Lulu está listo!');
  });

  client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isCommand()) return;
    const command = client.commands.get(interaction.commandName);
    if (!command) return;
    try {
      await command.execute(interaction);
    } catch (error) {
      console.error(error);
      await interaction.reply({ content: '¡Ups! Hubo un error ejecutando el comando.', ephemeral: true });
    }
  });
}

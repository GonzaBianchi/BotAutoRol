import express from 'express';
import { Client, GatewayIntentBits, REST, Routes } from 'discord.js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import { connectDB } from './utils/db.js';
import setupRoleMenuEvents from './events/rolemenu.js';
import setupRoleMenuReactions from './events/rolemenuReactions.js';
import setupEditRoleMenuEvents from './events/editarrolemenu.js';
import setupReadyEvent from './events/ready.js';

// Cargar variables de entorno
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Endpoint para mantener el bot activo en Render
app.get('/', (req, res) => {
  res.send('Bot Lulu está activo!');
});

app.listen(PORT, () => {
  console.log(`Express escuchando en el puerto ${PORT}`);
});

// Configuración del cliente de Discord con todos los intents necesarios
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildEmojisAndStickers // Agregado para mejor manejo de emojis custom
  ],
  // Configuraciones adicionales para mejorar la estabilidad
  partials: ['MESSAGE', 'CHANNEL', 'REACTION'],
  allowedMentions: {
    parse: ['users', 'roles'],
    repliedUser: false
  }
});

// Conectar a MongoDB Atlas
connectDB();
setupRoleMenuEvents(client);
setupRoleMenuReactions(client);
setupEditRoleMenuEvents(client);
setupReadyEvent(client);

// Cargar eventos
const eventsPath = path.join(process.cwd(), 'src', 'events');
fs.readdirSync(eventsPath).forEach(file => {
  if (file.endsWith('.js')) {
    const fileUrl = pathToFileURL(path.join(eventsPath, file)).href;
    import(fileUrl);
  }
});

// Cargar comandos
client.commands = new Map();
const commandsPath = path.join(process.cwd(), 'src', 'commands');
fs.readdirSync(commandsPath).forEach(file => {
  if (file.endsWith('.js')) {
    const fileUrl = pathToFileURL(path.join(commandsPath, file)).href;
    import(fileUrl).then(cmd => {
      if (cmd.data && cmd.execute) {
        client.commands.set(cmd.data.name, cmd);
      }
    });
  }
});

async function registerSlashCommands() {
  const commands = [];
  const commandsPath = path.join(process.cwd(), 'src', 'commands');
  fs.readdirSync(commandsPath).forEach(file => {
    if (file.endsWith('.js')) {
      const fileUrl = pathToFileURL(path.join(commandsPath, file)).href;
      import(fileUrl).then(cmd => {
        if (cmd.data) {
          commands.push(cmd.data.toJSON());
        }
      });
    }
  });
  // Esperar a que todos los imports terminen
  await new Promise(resolve => setTimeout(resolve, 1000));
  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
  try {
    // Puedes poner tu GUILD_ID para pruebas rápidas, o usar process.env.GUILD_ID
    if (process.env.GUILD_ID) {
      await rest.put(
        Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
        { body: commands }
      );
      console.log('Comandos slash registrados (GUILD)');
    } else {
      await rest.put(
        Routes.applicationCommands(process.env.CLIENT_ID),
        { body: commands }
      );
      console.log('Comandos slash registrados (GLOBAL)');
    }
  } catch (error) {
    console.error('Error registrando comandos slash:', error);
  }
}

// Manejo de errores no capturados
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

registerSlashCommands();

client.login(process.env.TOKEN);
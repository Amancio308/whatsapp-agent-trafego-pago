import 'dotenv/config';
import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  isJidBroadcast,
  isJidGroup
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import qrcode from 'qrcode-terminal';
import express from 'express';
import { processMessage } from './agent.js';
import { testConnection, upsertContact } from './db.js';

const logger = pino({ level: 'silent' });
const processingMessages = new Set();

// ─── Servidor HTTP (necessário para o Render.com + UptimeRobot) ───────────────
const app = express();
app.get('/', (_, res) => res.send('🤖 Agente WhatsApp rodando!'));
app.get('/health', (_, res) => res.json({ status: 'ok', uptime: process.uptime() }));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🌐 Servidor HTTP na porta ${PORT}`));
// ─────────────────────────────────────────────────────────────────────────────

async function startAgent() {
  await testConnection();

  const { state, saveCreds } = await useMultiFileAuthState('./auth_info');
  const { version } = await fetchLatestBaileysVersion();

  console.log(`\n🤖 Iniciando Agente WhatsApp (Baileys ${version.join('.')})\n`);

  const sock = makeWASocket({
    version,
    logger,
    auth: state,
    printQRInTerminal: false,
    browser: ['Agente Tráfego', 'Chrome', '1.0.0'],
    syncFullHistory: false,
    markOnlineOnConnect: true
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      console.log('\n📱 ESCANEIE O QR CODE ABAIXO COM SEU WHATSAPP BUSINESS:\n');
      qrcode.generate(qr, { small: true });
      console.log('\n➡️  WhatsApp → Configurações → Dispositivos Vinculados → Vincular dispositivo\n');
    }

    if (connection === 'open') {
      console.log('\n✅ WhatsApp conectado! Agente ativo 24/7!\n');
    }

    if (connection === 'close') {
      const shouldReconnect = (lastDisconnect?.error instanceof Boom)
        ? lastDisconnect.error.output?.statusCode !== DisconnectReason.loggedOut
        : true;

      if (shouldReconnect) {
        console.log('🔄 Reconectando...');
        setTimeout(startAgent, 5000);
      } else {
        console.log('❌ Sessão encerrada. Escaneie o QR Code novamente.');
      }
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      try {
        if (msg.key.fromMe) continue;

        const jid = msg.key.remoteJid || '';
        if (isJidBroadcast(jid) || isJidGroup(jid)) continue;
        if (jid.includes('status@broadcast') || jid.includes('newsletter')) continue;

        const messageContent =
          msg.message?.conversation ||
          msg.message?.extendedTextMessage?.text ||
          msg.message?.imageMessage?.caption ||
          null;

        if (!messageContent) continue;

        const msgId = msg.key.id;
        if (processingMessages.has(msgId)) continue;
        processingMessages.add(msgId);

        const userName = msg.pushName || null;
        const phoneNumber = jid.replace('@s.whatsapp.net', '');

        console.log(`\n📩 ${userName || phoneNumber}: "${messageContent}"`);

        await sock.readMessages([msg.key]);
        await upsertContact(phoneNumber, userName);
        await sock.sendPresenceUpdate('composing', jid);
        await new Promise(r => setTimeout(r, 1500));

        const response = await processMessage(phoneNumber, userName, messageContent);

        await sock.sendPresenceUpdate('paused', jid);
        await sock.sendMessage(jid, { text: response });

        console.log(`✉️  Respondido: ${response.substring(0, 80)}...`);
        processingMessages.delete(msgId);

      } catch (err) {
        console.error('Erro:', err);
        processingMessages.delete(msg.key.id);
      }
    }
  });
}

startAgent().catch(err => {
  console.error('Erro fatal:', err);
  process.exit(1);
});

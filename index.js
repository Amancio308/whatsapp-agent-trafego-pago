import 'dotenv/config';
import pkg from '@whiskeysockets/baileys';
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  isJidBroadcast,
  isJidGroup
} = pkg;
import { Boom } from '@hapi/boom';
import pino from 'pino';
import qrcode from 'qrcode';
import express from 'express';
import { processMessage } from './agent.js';
import { testConnection, upsertContact } from './db.js';

const logger = pino({ level: 'silent' });
const processingMessages = new Set();

// ─── QR Code em memória ───────────────────────────────────────────────────────
let currentQR = null;
let qrImageBase64 = null;
// ─────────────────────────────────────────────────────────────────────────────

// ─── Servidor HTTP (necessário para o Render.com + UptimeRobot) ───────────────
const app = express();

app.get('/', (_, res) => res.send('🤖 Agente WhatsApp (Mia) rodando!'));
app.get('/health', (_, res) => res.json({ status: 'ok', uptime: process.uptime() }));

app.get('/qr', async (_, res) => {
  if (!currentQR) {
    return res.send(`<!DOCTYPE html><html><head><meta charset="utf-8">
      <meta http-equiv="refresh" content="5">
      <title>QR Code WhatsApp</title>
      <style>body{font-family:sans-serif;text-align:center;padding:40px;background:#f0f0f0}</style>
      </head><body>
      <h2>⏳ Aguardando QR Code...</h2>
      <p>A página vai atualizar automaticamente em 5 segundos.</p>
      </body></html>`);
  }
  try {
    const qrImage = await qrcode.toDataURL(currentQR, { width: 400, margin: 2 });
    res.send(`<!DOCTYPE html><html><head><meta charset="utf-8">
      <meta http-equiv="refresh" content="30">
      <title>QR Code WhatsApp - Mia</title>
      <style>
        body{font-family:sans-serif;text-align:center;padding:40px;background:#f0f0f0}
        img{border:8px solid white;border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,0.15)}
        h1{color:#25D366}
      </style>
      </head><body>
      <h1>📱 Escaneie com WhatsApp Business</h1>
      <p>Abra o WhatsApp Business → ⋮ → <b>Dispositivos Vinculados</b> → <b>Vincular dispositivo</b></p>
      <br>
      <img src="${qrImage}" width="350" height="350" alt="QR Code">
      <br><br>
      <p style="color:#666;font-size:14px">⏱ O QR Code renova automaticamente a cada 30s</p>
      </body></html>`);
  } catch (e) {
    res.send('Erro ao gerar QR: ' + e.message);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🌐 Servidor HTTP na porta ${PORT}`));
// ─────────────────────────────────────────────────────────────────────────────

async function startAgent() {
  await testConnection();

  const { state, saveCreds } = await useMultiFileAuthState('./auth_info');
  const { version } = await fetchLatestBaileysVersion();

  console.log(`\n🤖 Iniciando Agente WhatsApp (Baileys ${version.join('.')})\n`);
  console.log(`\n📱 Para escanear o QR Code acesse: https://whatsapp-agent-trafego-pago.onrender.com/qr\n`);

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
      currentQR = qr;
      console.log('\n📱 Novo QR Code gerado! Acesse: https://whatsapp-agent-trafego-pago.onrender.com/qr\n');
    }

    if (connection === 'open') {
      currentQR = null;
      console.log('\n✅ WhatsApp conectado! Agente Mia ativa 24/7!\n');
    }

    if (connection === 'close') {
      const shouldReconnect = (lastDisconnect?.error instanceof Boom)
        ? lastDisconnect.error.output?.statusCode !== DisconnectReason.loggedOut
        : true;

      if (shouldReconnect) {
        console.log('🔄 Reconectando...');
        setTimeout(startAgent, 5000);
      } else {
        console.log('❌ Sessão encerrada. Acesse /qr para escanear novamente.');
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

import 'dotenv/config';
import pkg from '@whiskeysockets/baileys';
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  isJidBroadcast,
  isJidGroup,
  downloadMediaMessage
} = pkg;
import { Boom } from '@hapi/boom';
import pino from 'pino';
import qrcode from 'qrcode';
import express from 'express';
import Groq from 'groq-sdk';
import { processMessage } from './agent.js';
import { testConnection, upsertContact } from './db.js';

const logger = pino({ level: 'silent' });
const processingMessages = new Set();
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

let currentQR = null;
let activeSock = null; // socket ativo exposto para o /notify

// ─── Delay humanizado baseado no tamanho da resposta ─────────────────────────
function calcDelay(text) {
  // 40ms por caractere, mínimo 2s, máximo 6s
  const ms = Math.min(Math.max(text.length * 40, 2000), 6000);
  return ms;
}

// ─── Transcrição de áudio via Groq Whisper ───────────────────────────────────
async function transcribeAudio(msg) {
  try {
    const buffer = await downloadMediaMessage(msg, 'buffer', {});
    // Node 18+ tem File/Blob global
    const blob = new Blob([buffer], { type: 'audio/ogg; codecs=opus' });
    const file = new File([blob], 'audio.ogg', { type: 'audio/ogg; codecs=opus' });
    const result = await groq.audio.transcriptions.create({
      file,
      model: 'whisper-large-v3-turbo',
      language: 'pt',
      response_format: 'text'
    });
    // Groq retorna string quando response_format é 'text'
    return typeof result === 'string' ? result.trim() : (result?.text || '').trim();
  } catch (err) {
    console.error('Erro ao transcrever áudio:', err.message);
    return null;
  }
}

// ─── Servidor HTTP ───────────────────────────────────────────────────────────
const app = express();
app.use(express.json());

app.get('/', (_, res) => res.send('🤖 Agente Mia rodando!'));
app.get('/health', (_, res) => res.json({ status: 'ok', uptime: process.uptime() }));

// Endpoint chamado pelo Cowork após criar evento no Google Calendar
// Envia mensagem de confirmação ao cliente via WhatsApp
app.post('/notify', async (req, res) => {
  const { secret, phone, message } = req.body || {};

  if (secret !== (process.env.NOTIFY_SECRET || 'mia-notify-2026')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!phone || !message) {
    return res.status(400).json({ error: 'phone and message are required' });
  }

  if (!activeSock) {
    return res.status(503).json({ error: 'WhatsApp not connected' });
  }

  try {
    // Aceita tanto JID completo (ex: 177768847384632@lid, 5511999999@s.whatsapp.net)
    // quanto número puro (ex: 5511999999999) — neste caso assume @s.whatsapp.net
    const jid = phone.includes('@') ? phone : `${phone}@s.whatsapp.net`;

    await activeSock.sendPresenceUpdate('composing', jid);
    await new Promise(r => setTimeout(r, 2000));
    await activeSock.sendPresenceUpdate('paused', jid);
    await activeSock.sendMessage(jid, { text: message });
    console.log(`📅 Confirmação enviada para ${phone}: ${message.substring(0, 60)}...`);
    res.json({ ok: true });
  } catch (err) {
    console.error('Erro ao enviar notificação:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// QR Code visual
app.get('/qr', async (_, res) => {
  if (!currentQR) {
    return res.send(`<!DOCTYPE html><html><head><meta charset="utf-8">
      <meta http-equiv="refresh" content="5">
      <title>QR Code WhatsApp</title>
      <style>body{font-family:sans-serif;text-align:center;padding:40px;background:#f0f0f0}</style>
      </head><body>
      <h2>⏳ Aguardando QR Code...</h2>
      <p>Atualizando em 5 segundos...</p>
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
      <p style="color:#666;font-size:14px">⏱ O QR Code renova a cada 30s</p>
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

  console.log(`\n🤖 Iniciando Agente Mia (Baileys ${version.join('.')})\n`);

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
      console.log('\n📱 QR Code disponível em: https://whatsapp-agent-trafego-pago.onrender.com/qr\n');
    }

    if (connection === 'open') {
      currentQR = null;
      activeSock = sock;
      console.log('\n✅ WhatsApp conectado! Mia ativa 24/7!\n');
    }

    if (connection === 'close') {
      activeSock = null;
      const shouldReconnect = (lastDisconnect?.error instanceof Boom)
        ? lastDisconnect.error.output?.statusCode !== DisconnectReason.loggedOut
        : true;

      if (shouldReconnect) {
        console.log('🔄 Reconectando...');
        setTimeout(startAgent, 5000);
      } else {
        console.log('❌ Sessão encerrada. Acesse /qr para reconectar.');
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

        const msgId = msg.key.id;
        if (processingMessages.has(msgId)) continue;
        processingMessages.add(msgId);

        const userName = msg.pushName || null;

        // Armazena o JID completo como identificador (suporta @s.whatsapp.net e @lid)
        const phoneNumber = jid;

        let messageContent = null;
        let isAudio = false;

        // ── Detecta áudio (mensagem de voz ou áudio normal) ───────────────────
        const audioMsg = msg.message?.audioMessage || msg.message?.pttMessage;
        if (audioMsg) {
          isAudio = true;
          console.log(`\n🎤 Áudio recebido de ${userName || jid} — transcrevendo...`);
          await sock.readMessages([msg.key]);
          await sock.sendPresenceUpdate('composing', jid);

          messageContent = await transcribeAudio(msg);

          if (!messageContent) {
            await sock.sendPresenceUpdate('paused', jid);
            await sock.sendMessage(jid, {
              text: 'Oi! Recebi seu áudio mas tive um probleminha pra entender. Pode mandar por texto? 😊'
            });
            processingMessages.delete(msgId);
            continue;
          }
          console.log(`🎤 Transcrito: "${messageContent}"`);
        } else {
          // ── Detecta mensagens de texto ────────────────────────────────────
          messageContent =
            msg.message?.conversation ||
            msg.message?.extendedTextMessage?.text ||
            msg.message?.imageMessage?.caption ||
            null;
        }

        if (!messageContent) {
          processingMessages.delete(msgId);
          continue;
        }

        console.log(`\n📩 ${userName || jid}: "${messageContent}"`);

        await sock.readMessages([msg.key]);
        await upsertContact(phoneNumber, userName);

        // Simula que está digitando enquanto processa
        if (!isAudio) await sock.sendPresenceUpdate('composing', jid);

        const response = await processMessage(phoneNumber, userName, messageContent);

        // Delay humanizado baseado no tamanho da resposta
        const delay = calcDelay(response);
        await new Promise(r => setTimeout(r, delay));

        await sock.sendPresenceUpdate('paused', jid);
        await sock.sendMessage(jid, { text: response });

        console.log(`✉️  Mia → ${userName || jid}: ${response.substring(0, 80)}...`);
        processingMessages.delete(msgId);

      } catch (err) {
        console.error('Erro ao processar mensagem:', err.message);
        processingMessages.delete(msg.key.id);
      }
    }
  });
}

startAgent().catch(err => {
  console.error('Erro fatal:', err);
  process.exit(1);
});

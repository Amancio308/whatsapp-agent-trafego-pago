import Groq from 'groq-sdk';
import { saveMessage, getConversationHistory, saveAgendamento, confirmarAgendamento, getProximaReuniao, getAgendamentosProximos, getAgendamentosHoje } from './db.js';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const SYSTEM_PROMPT = `Você é a Mia, assistente da agência de marketing digital do Luiz Antonio Amâncio. Você conversa com clientes pelo WhatsApp de forma leve, natural e humanizada — como uma pessoa real, não um robô.

## SOBRE A AGÊNCIA
A agência do Luiz oferece tudo que um negócio precisa pra crescer no digital:

1. **Tráfego Pago** — Anúncios no Meta Ads (Facebook/Instagram), Google Ads e TikTok Ads. Campanhas que geram leads e vendas de verdade.

2. **Site Estratégico** — Sites e landing pages feitos pra converter, não só pra ter presença. Um site que trabalha por você.

3. **Criação de Conteúdo** — Conteúdo estratégico pras redes sociais, com identidade e propósito. Nada de postar por postar.

4. **Presença Digital Completa** — Pra quem quer entrar no digital do zero. Perfis, identidade visual, conteúdo e tráfego — tudo junto.

5. **Mentoria** — Pra quem quer aprender a tocar o próprio marketing. Mentoria individual com o Luiz.

## REGRAS DE OURO (NUNCA QUEBRE)

🚫 **NUNCA dê preços, valores ou estimativas.** Nem "a partir de", nem "geralmente custa", nem "depende mas...". Se perguntarem, diga que cada projeto tem uma proposta personalizada e que o melhor é conversar com o Luiz.

✅ **O objetivo de toda conversa é agendar uma call gratuita com o Luiz.** Tudo converge pra isso.

## COMO VOCÊ FALA

Você é calorosa, direta e empática. Algumas dicas de como se comunicar:

- Fale como uma pessoa fala, não como um manual corporativo
- Às vezes use expressões naturais: "entendi!", "faz sentido!", "boa pergunta!", "que legal!"
- Varie o jeito de começar cada mensagem — nunca comece duas seguidas com a mesma palavra
- Mensagens curtas — WhatsApp não é e-mail. 2 a 4 linhas é o ideal
- Use emojis com moderação (1 ou 2 por mensagem, só quando fizer sentido)
- Adapte o tom ao cliente: se ele for informal, seja mais descontraída; se for mais sério, mantenha a leveza mas com mais seriedade
- Nunca repita perguntas já feitas no histórico da conversa
- Se o cliente parecer apressado, seja mais direta
- Mostre que você se importou com o que ele disse antes de fazer a próxima pergunta

## FLUXO DE ATENDIMENTO

**1. Primeiro contato:** Cumprimente com energia, se apresente brevemente e pergunte como pode ajudar.

**2. Entender a necessidade:** Faça perguntas para entender o momento do cliente. Máximo de 1 pergunta por mensagem.

**3. Mostrar valor:** Explique como a agência resolve o problema específico do cliente. Seja concreto.

**4. Oferecer a call:** Depois de entender a situação, ofereça uma conversa gratuita com o Luiz para montar uma proposta personalizada.

**5. Coletar dados para agendamento:** Quando o cliente aceitar, colete:
   - Nome completo
   - Assunto / o que quer discutir
   - Dia preferido (ex: "segunda ou terça-feira")
   - Horário preferido (ex: "manhã", "tarde", "depois das 18h")

**6. Confirmar agendamento:** Quando tiver TODOS os dados (nome, assunto, dia e horário), coloque no início da sua resposta (antes do texto pro cliente) EXATAMENTE neste formato:

AGENDAMENTO_COLETADO:{"nome":"[nome completo]","assunto":"[assunto]","data":"[dia/data preferida]","horario":"[horário preferido]"}

Logo após, escreva a mensagem natural de confirmação pro cliente. Exemplo:
"Ótimo, [Nome]! Já enviei a solicitação pro Luiz. Ele vai confirmar o horário certinho com você aqui mesmo pelo WhatsApp. 😊 Qualquer coisa é só chamar!"

## RESPOSTAS PARA SITUAÇÕES COMUNS

**"Quanto custa?"**
→ Algo como: "Os valores são montados de acordo com cada projeto e objetivo — não tem tabela fixa, porque cada negócio tem uma realidade diferente. O melhor é uma conversa rápida e gratuita com o Luiz pra ele entender seu cenário e te apresentar uma proposta real. Posso agendar isso pra você?"

**"Vocês têm resultados?"**
→ "Sim! A agência já ajudou clientes de vários segmentos a crescer no digital. Numa call com o Luiz ele pode te mostrar cases reais. Quer marcar?"

**"O que é tráfego pago?"**
→ Explique de forma simples (anúncios pagos que aparecem pro público certo, na hora certa) e conecte com o negócio do cliente.

**"Eu preciso de site?"**
→ Pergunte sobre o negócio antes de responder, depois ofereça a call.

Responda SEMPRE em português brasileiro.`;

// Detecta se a mensagem do cliente é uma confirmação de reunião
const PALAVRAS_CONFIRMACAO = ['confirmo', 'confirmado', 'confirmei', 'vou sim', 'estarei', 'estarei lá', 'pode confirmar', 'tô dentro', 'to dentro', 'ok', 'combinado', 'perfeito', 'certo', 'sim', 'vou'];
function isConfirmacao(texto) {
  const t = texto.toLowerCase().trim();
  return PALAVRAS_CONFIRMACAO.some(p => t === p || t.startsWith(p + ' ') || t.endsWith(' ' + p) || t.includes(' ' + p + ' '));
}

// Extrai dados de agendamento da resposta do modelo
function extrairAgendamento(resposta) {
  const match = resposta.match(/AGENDAMENTO_COLETADO:(\{.*?\})/s);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

// Remove a tag técnica da mensagem enviada ao cliente
function limparResposta(resposta) {
  return resposta.replace(/AGENDAMENTO_COLETADO:\{.*?\}\n?/s, '').trim();
}

// ─── Formata data/hora em português ──────────────────────────────────────────
function formatarDataHora(isoString) {
  if (!isoString) return 'horário não definido';
  const d = new Date(isoString);
  const dias = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
  const meses = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
  // UTC-3
  const local = new Date(d.getTime() - 3 * 60 * 60 * 1000);
  const diaSemana = dias[local.getUTCDay()];
  const dia = local.getUTCDate();
  const mes = meses[local.getUTCMonth()];
  const hora = String(local.getUTCHours()).padStart(2, '0');
  const min = String(local.getUTCMinutes()).padStart(2, '0');
  return `${diaSemana}, ${dia} de ${mes} às ${hora}:${min}`;
}

// ─── Sistema de prompt do CHEFE (Luiz) ───────────────────────────────────────
async function buildBossSystemPrompt() {
  const hoje = await getAgendamentosHoje();
  const proximas = await getAgendamentosProximos(7);

  let agendaHoje = hoje.length === 0
    ? 'Nenhuma reunião marcada para hoje.'
    : hoje.map(r => `• ${formatarDataHora(r.data_reuniao)} — ${r.nome} | ${r.assunto} | ${r.confirmado ? '✅ Confirmado' : '⏳ Aguardando confirmação'}`).join('\n');

  let proximasStr = proximas.length === 0
    ? 'Nenhuma reunião nos próximos 7 dias.'
    : proximas.map(r => `• ${formatarDataHora(r.data_reuniao)} — ${r.nome} | ${r.assunto} | ${r.confirmado ? '✅' : '⏳'}`).join('\n');

  return `Você é a Mia, assistente pessoal do Luiz Antonio Amâncio, dono da agência. VOCÊ ESTÁ FALANDO DIRETAMENTE COM O LUIZ AGORA — não com um cliente.

Trate-o como seu chefe. Seja direta, objetiva, útil e informal (tutea à vontade). Você tem acesso à agenda dele e pode responder perguntas como: quem tem reunião hoje, quais estão confirmadas, quantas marcações tem na semana etc.

## AGENDA DE HOJE
${agendaHoje}

## PRÓXIMAS REUNIÕES (7 dias)
${proximasStr}

## O QUE VOCÊ PODE FAZER PELO LUIZ
- Informar a agenda do dia ou da semana
- Dizer quais reuniões estão confirmadas ou pendentes
- Avisar sobre lembretes que já foram enviados
- Responder qualquer dúvida sobre o funcionamento do sistema

## O QUE VOCÊ NÃO CONSEGUE FAZER (ainda) PELO WHATSAPP
- Cancelar ou remarcar reuniões diretamente
- Acessar detalhes de clientes além do que está na agenda

Se o Luiz pedir algo fora do seu alcance, explique brevemente e sugira que ele use o Google Calendar ou fale com o sistema Cowork.

Responda em português brasileiro, de forma natural e direta. Sem formalidades excessivas.`;
}

export async function processMessage(phoneNumber, userName, messageText) {
  try {
    const history = await getConversationHistory(phoneNumber, 10);

    // ── Detecta se é o Luiz (modo chefe) ──────────────────────────────────────
    const luizPhone = process.env.LUIZ_PHONE || '';
    const isBoss = luizPhone && phoneNumber === luizPhone;

    let systemPromptContent;
    if (isBoss) {
      systemPromptContent = await buildBossSystemPrompt();
    } else {
      systemPromptContent = SYSTEM_PROMPT + (userName ? `\n\nNome do cliente no WhatsApp: ${userName}` : '');
    }

    const messages = [
      {
        role: 'system',
        content: systemPromptContent
      }
    ];

    for (const msg of history) {
      messages.push({ role: msg.role, content: msg.content });
    }

    // Detecta confirmação de reunião antes de chamar o modelo
    if (isConfirmacao(messageText)) {
      const reuniao = await getProximaReuniao(phoneNumber);
      if (reuniao && !reuniao.confirmado) {
        await confirmarAgendamento(phoneNumber);
        console.log(`✅ Reunião confirmada por ${userName || phoneNumber}`);
      }
    }

    messages.push({ role: 'user', content: messageText });

    const response = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages,
      max_tokens: 600,
      temperature: 0.85
    });

    const rawResponse = response.choices[0].message.content;

    // Verifica se há dados de agendamento na resposta
    const dadosAgendamento = extrairAgendamento(rawResponse);
    if (dadosAgendamento) {
      await saveAgendamento(
        phoneNumber,
        dadosAgendamento.nome,
        dadosAgendamento.assunto,
        dadosAgendamento.data,
        dadosAgendamento.horario
      );
      console.log(`📅 Agendamento salvo para ${dadosAgendamento.nome} — ${dadosAgendamento.data} ${dadosAgendamento.horario}`);
    }

    // Mensagem limpa (sem tag técnica) para enviar ao cliente
    const agentResponse = limparResposta(rawResponse);

    await saveMessage(phoneNumber, userName, 'user', messageText);
    await saveMessage(phoneNumber, userName, 'assistant', agentResponse);

    return agentResponse;

  } catch (error) {
    console.error('Erro ao processar com Groq:', error.message || error);
    return 'Oi! Tô com uma instabilidade aqui agora, mas já já volto. Pode me mandar mensagem de novo em alguns minutos! 🙏';
  }
}

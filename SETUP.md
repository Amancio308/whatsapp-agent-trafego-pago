# 🤖 Agente WhatsApp — Guia de Configuração

## O que este agente faz
Responde automaticamente seus clientes no WhatsApp usando IA, 24 horas por dia, 7 dias por semana. Ele sabe responder sobre:
- Resultados de campanhas de tráfego pago
- Valores e pagamentos
- Status do serviço
- Agendamento de reuniões

---

## PASSO 1 — Obter API Key da Anthropic (Claude)

1. Acesse: https://console.anthropic.com/settings/keys
2. Clique em **"Create Key"**
3. Dê um nome: "Agente WhatsApp"
4. Copie a chave (começa com `sk-ant-api03-...`)
5. Guarde ela — só aparece uma vez!

> ⚠️ É necessário adicionar créditos (mínimo $5). Acesse: https://console.anthropic.com/settings/billing

---

## PASSO 2 — Obter Service Key do Supabase

1. Acesse: https://supabase.com/dashboard/project/jjqwnzjdsyyemdbdokws/settings/api
2. Copie a **"service_role"** key (em "Project API keys")
3. ⚠️ NUNCA compartilhe essa chave publicamente!

---

## PASSO 3 — Fazer Deploy no Railway

### 3.1 — Criar conta no Railway
1. Acesse: https://railway.app
2. Clique em **"Login"** → **"Login with GitHub"**
3. Crie uma conta gratuita no GitHub se não tiver

### 3.2 — Instalar Railway CLI
Abra o terminal (Prompt de Comando ou Terminal) e execute:
```
npm install -g @railway/cli
```

### 3.3 — Fazer deploy
Na pasta do projeto, execute:
```
railway login
railway init
railway up
```

### 3.4 — Configurar variáveis de ambiente no Railway
No painel do Railway, vá em **Variables** e adicione:
```
ANTHROPIC_API_KEY=sk-ant-api03-SUA_CHAVE_AQUI
SUPABASE_URL=https://jjqwnzjdsyyemdbdokws.supabase.co
SUPABASE_SERVICE_KEY=SUA_SERVICE_KEY_AQUI
NODE_ENV=production
```

---

## PASSO 4 — Vincular WhatsApp

1. Após o deploy, veja os logs no Railway
2. Um **QR Code** aparecerá nos logs
3. No seu celular: **WhatsApp → Configurações → Dispositivos Vinculados → Vincular dispositivo**
4. Escaneie o QR Code
5. Pronto! O agente começa a responder automaticamente ✅

---

## Custos Estimados

| Serviço | Custo |
|---------|-------|
| Railway (servidor) | ~$5/mês |
| Claude API (IA) | ~$1-5/mês dependendo do volume |
| Supabase (banco) | Gratuito (plano free) |
| **Total** | **~$6-10/mês** |

---

## Monitoramento

Acesse o painel do Supabase para ver:
- **Todos os contatos** que mandaram mensagem: tabela `contacts`
- **Histórico completo** de conversas: tabela `messages`

URL: https://supabase.com/dashboard/project/jjqwnzjdsyyemdbdokws/editor

---

## Suporte
Precisa de ajuda? Abra o Cowork e peça para o assistente ajudar com qualquer etapa!

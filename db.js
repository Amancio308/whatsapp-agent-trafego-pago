import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Salva uma mensagem no banco
export async function saveMessage(phoneNumber, userName, role, content) {
  const { error } = await supabase
    .from('messages')
    .insert({
      phone_number: phoneNumber,
      user_name: userName || 'Desconhecido',
      role,
      content,
      created_at: new Date().toISOString()
    });

  if (error) {
    console.error('Erro ao salvar mensagem no Supabase:', error);
  }
}

// Busca histórico de conversa de um número
export async function getConversationHistory(phoneNumber, limit = 10) {
  const { data, error } = await supabase
    .from('messages')
    .select('role, content, created_at')
    .eq('phone_number', phoneNumber)
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error) {
    console.error('Erro ao buscar histórico:', error);
    return [];
  }

  return data || [];
}

// Salva ou atualiza informações de um contato
export async function upsertContact(phoneNumber, userName) {
  const { error } = await supabase
    .from('contacts')
    .upsert({
      phone_number: phoneNumber,
      name: userName || 'Desconhecido',
      last_seen: new Date().toISOString()
    }, { onConflict: 'phone_number' });

  if (error) {
    console.error('Erro ao salvar contato:', error);
  }
}

// Salva solicitação de agendamento (será criado no Google Calendar pelo Cowork)
export async function saveAgendamento(phoneNumber, nome, assunto, dataPreferida, horarioPreferido) {
  const { data, error } = await supabase
    .from('agendamentos')
    .insert({
      phone: phoneNumber,
      nome: nome || 'Não informado',
      assunto: assunto || 'Não informado',
      data_preferida: dataPreferida || 'A combinar',
      horario_preferido: horarioPreferido || 'A combinar',
      status: 'pendente'
    })
    .select()
    .single();

  if (error) {
    console.error('Erro ao salvar agendamento:', error);
    return null;
  }

  return data;
}

// Busca agendamentos pendentes (usado pelo Cowork para criar eventos no Google Calendar)
export async function getAgendamentosPendentes() {
  const { data, error } = await supabase
    .from('agendamentos')
    .select('*')
    .eq('status', 'pendente')
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Erro ao buscar agendamentos:', error);
    return [];
  }

  return data || [];
}

// Marca agendamento como processado com o ID do evento do Google Calendar
export async function marcarAgendamentoProcessado(id, googleEventId) {
  const { error } = await supabase
    .from('agendamentos')
    .update({ status: 'agendado', google_event_id: googleEventId })
    .eq('id', id);

  if (error) {
    console.error('Erro ao atualizar agendamento:', error);
  }
}

// Busca próximas reuniões agendadas (para o painel do Luiz)
export async function getAgendamentosProximos(dias = 7) {
  const agora = new Date().toISOString();
  const limite = new Date(Date.now() + dias * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('agendamentos')
    .select('nome, assunto, data_reuniao, confirmado, status')
    .eq('status', 'agendado')
    .gte('data_reuniao', agora)
    .lte('data_reuniao', limite)
    .order('data_reuniao', { ascending: true });

  if (error) return [];
  return data || [];
}

// Busca reuniões de hoje
export async function getAgendamentosHoje() {
  const hoje = new Date();
  const inicioHoje = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()).toISOString();
  const fimHoje = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + 1).toISOString();
  const { data, error } = await supabase
    .from('agendamentos')
    .select('nome, assunto, data_reuniao, confirmado')
    .eq('status', 'agendado')
    .gte('data_reuniao', inicioHoje)
    .lt('data_reuniao', fimHoje)
    .order('data_reuniao', { ascending: true });

  if (error) return [];
  return data || [];
}

// Marca reunião como confirmada pelo cliente
export async function confirmarAgendamento(phoneNumber) {
  const { error } = await supabase
    .from('agendamentos')
    .update({ confirmado: true })
    .eq('phone', phoneNumber)
    .eq('status', 'agendado')
    .gte('data_reuniao', new Date().toISOString());

  if (error) {
    console.error('Erro ao confirmar agendamento:', error);
  }
}

// Verifica se há reunião agendada próxima para o número
export async function getProximaReuniao(phoneNumber) {
  const { data, error } = await supabase
    .from('agendamentos')
    .select('id, nome, assunto, data_reuniao, confirmado')
    .eq('phone', phoneNumber)
    .eq('status', 'agendado')
    .gte('data_reuniao', new Date().toISOString())
    .order('data_reuniao', { ascending: true })
    .limit(1)
    .single();

  if (error) return null;
  return data;
}

// Testa a conexão com o Supabase
export async function testConnection() {
  const { error } = await supabase.from('contacts').select('count').limit(1);
  if (error) {
    throw new Error(`Supabase connection failed: ${error.message}`);
  }
  console.log('✅ Supabase conectado com sucesso!');
}

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

// Testa a conexão com o Supabase
export async function testConnection() {
  const { error } = await supabase.from('contacts').select('count').limit(1);
  if (error) {
    throw new Error(`Supabase connection failed: ${error.message}`);
  }
  console.log('✅ Supabase conectado com sucesso!');
}

/**
 * supabase-auth.js
 * Persiste o estado de autenticação do Baileys no Supabase.
 * Substitui useMultiFileAuthState para sobreviver a restarts no Render free tier.
 */

import { createClient } from '@supabase/supabase-js';
import pkg from '@whiskeysockets/baileys';
const { initAuthCreds, BufferJSON } = pkg;

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

export async function useSupabaseAuthState() {
  // Carrega todos os dados armazenados no Supabase
  const { data: rows, error } = await supabase
    .from('baileys_auth')
    .select('key, value');

  if (error) {
    console.error('⚠️  Erro ao carregar auth state do Supabase:', error.message);
  }

  // Cache local para evitar leituras repetidas
  const cache = {};
  for (const row of (rows || [])) {
    try {
      cache[row.key] = JSON.parse(row.value, BufferJSON.reviver);
    } catch (e) {
      // ignora entradas corrompidas
    }
  }

  // Credenciais principais (ou inicializa novas)
  const creds = cache['creds'] || initAuthCreds();

  // Salva as credenciais no Supabase
  const saveCreds = async () => {
    try {
      await supabase
        .from('baileys_auth')
        .upsert({
          key: 'creds',
          value: JSON.stringify(creds, BufferJSON.replacer),
          updated_at: new Date().toISOString()
        });
    } catch (e) {
      console.error('⚠️  Erro ao salvar creds:', e.message);
    }
  };

  // Store de chaves de sessão Signal Protocol
  const keys = {
    get: async (type, ids) => {
      const data = {};
      for (const id of ids) {
        const storeKey = `${type}--${id}`;
        const val = cache[storeKey];
        if (val !== undefined) {
          data[id] = val;
        }
      }
      return data;
    },

    set: async (data) => {
      const upserts = [];
      const deletes = [];

      for (const [type, entries] of Object.entries(data)) {
        for (const [id, value] of Object.entries(entries || {})) {
          const storeKey = `${type}--${id}`;
          if (value) {
            cache[storeKey] = value;
            upserts.push({
              key: storeKey,
              value: JSON.stringify(value, BufferJSON.replacer),
              updated_at: new Date().toISOString()
            });
          } else {
            delete cache[storeKey];
            deletes.push(storeKey);
          }
        }
      }

      try {
        if (upserts.length > 0) {
          await supabase.from('baileys_auth').upsert(upserts);
        }
        for (const k of deletes) {
          await supabase.from('baileys_auth').delete().eq('key', k);
        }
      } catch (e) {
        console.error('⚠️  Erro ao salvar keys:', e.message);
      }
    }
  };

  return { state: { creds, keys }, saveCreds };
}

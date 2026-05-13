// Edge Function: admin-users
//
// Permite a un usuario con rol "admin" crear, eliminar y resetear la contraseña
// de otros usuarios. Usa el service_role key (disponible automáticamente como
// variable de entorno SUPABASE_SERVICE_ROLE_KEY en Supabase Functions).
//
// Despliegue:
//   npx supabase functions deploy admin-users
//
// Acciones aceptadas (campo `action` en el body):
//   - "create"           { username, password, full_name?, role, email? }
//   - "delete"           { user_id }
//   - "update_password"  { user_id, new_password }
//   - "update_email"     { user_id, new_email }
//
// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: any, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return json({ error: 'Método no permitido' }, 405);
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return json({ error: 'Falta encabezado Authorization' }, 401);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  // Cliente que actúa como el caller — usado para validar permisos
  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: userData, error: userErr } = await callerClient.auth.getUser();
  if (userErr || !userData?.user) {
    return json({ error: 'Sesión inválida' }, 401);
  }

  const callerId = userData.user.id;

  const { data: profile, error: profileErr } = await callerClient
    .from('profiles')
    .select('role')
    .eq('id', callerId)
    .single();

  if (profileErr || profile?.role !== 'admin') {
    return json({ error: 'Requiere rol de administrador' }, 403);
  }

  // Cliente admin con service_role para operaciones privilegiadas
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'JSON inválido' }, 400);
  }

  const action = payload?.action;

  if (action === 'create') {
    const username = String(payload.username ?? '').trim().toLowerCase();
    const password = String(payload.password ?? '');
    const fullName = String(payload.full_name ?? '').trim() || username;
    const role = String(payload.role ?? 'viewer');
    const email = payload.email
      ? String(payload.email).trim().toLowerCase()
      : `${username}@cxp.local`;

    if (!username) return json({ error: 'Nombre de usuario requerido' }, 400);
    if (!/^[a-z0-9._-]+$/.test(username)) {
      return json({ error: 'El usuario solo puede contener letras minúsculas, números, ".", "_" o "-"' }, 400);
    }
    if (password.length < 6) return json({ error: 'La contraseña debe tener al menos 6 caracteres' }, 400);
    if (!['admin', 'operador', 'viewer'].includes(role)) {
      return json({ error: 'Rol inválido' }, 400);
    }

    // Verificar que no exista ya un perfil con ese username
    const { data: existing } = await admin
      .from('profiles')
      .select('id')
      .ilike('username', username)
      .maybeSingle();
    if (existing) return json({ error: 'Ese nombre de usuario ya existe' }, 409);

    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        username,
        full_name: fullName,
        role,
      },
    });
    if (error) return json({ error: error.message }, 400);

    // El trigger handle_new_user crea el profile automáticamente.
    // Por si la metadata no llegó, forzamos username/role aquí también:
    await admin
      .from('profiles')
      .update({ username, full_name: fullName, role })
      .eq('id', data.user.id);

    return json({ user: { id: data.user.id, email: data.user.email, username } });
  }

  if (action === 'delete') {
    const userId = String(payload.user_id ?? '');
    if (!userId) return json({ error: 'user_id requerido' }, 400);
    if (userId === callerId) {
      return json({ error: 'No puedes eliminar tu propio usuario' }, 400);
    }
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) return json({ error: error.message }, 400);
    return json({ ok: true });
  }

  if (action === 'update_password') {
    const userId = String(payload.user_id ?? '');
    const newPassword = String(payload.new_password ?? '');
    if (!userId) return json({ error: 'user_id requerido' }, 400);
    if (newPassword.length < 6) return json({ error: 'La contraseña debe tener al menos 6 caracteres' }, 400);
    const { error } = await admin.auth.admin.updateUserById(userId, { password: newPassword });
    if (error) return json({ error: error.message }, 400);
    return json({ ok: true });
  }

  if (action === 'update_email') {
    const userId = String(payload.user_id ?? '');
    const newEmail = String(payload.new_email ?? '').trim().toLowerCase();
    if (!userId || !newEmail) return json({ error: 'user_id y new_email requeridos' }, 400);
    const { error } = await admin.auth.admin.updateUserById(userId, { email: newEmail });
    if (error) return json({ error: error.message }, 400);
    return json({ ok: true });
  }

  return json({ error: 'Acción desconocida' }, 400);
});

import { createClient as createAdminClient } from '@supabase/supabase-js';
import { createClient } from '../../lib/supabase/server';

export const runtime = 'nodejs';

const NATIVE_ORIGIN = 'capacitor://localhost';

function responseHeaders(origin: string | null) {
  return {
    'Cache-Control': 'no-store',
    ...(origin === NATIVE_ORIGIN ? {
      'Access-Control-Allow-Origin': NATIVE_ORIGIN,
      'Access-Control-Allow-Methods': 'DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'authorization, content-type',
      Vary: 'Origin',
    } : {}),
  };
}

function json(origin: string | null, body: object, status = 200, extraHeaders: Record<string, string> = {}) {
  return Response.json(body, { status, headers: { ...responseHeaders(origin), ...extraHeaders } });
}

export async function OPTIONS(request: Request) {
  const origin = request.headers.get('origin');
  if (origin !== NATIVE_ORIGIN) return new Response(null, { status: 403 });
  return new Response(null, { status: 204, headers: responseHeaders(origin) });
}

export async function DELETE(request: Request) {
  const requestOrigin = new URL(request.url).origin;
  const origin = request.headers.get('origin');
  if (origin && origin !== requestOrigin && origin !== NATIVE_ORIGIN) {
    return json(origin, { error: '허용되지 않은 요청입니다.' }, 403);
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    console.error('Account deletion is unavailable because server credentials are missing.');
    return json(origin, { error: '계정 삭제 기능을 일시적으로 사용할 수 없습니다.' }, 503);
  }

  const admin = createAdminClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const authorization = request.headers.get('authorization');
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : null;
  const { data: { user }, error: userError } = token
    ? await admin.auth.getUser(token)
    : await (await createClient()).auth.getUser();

  if (userError || !user) {
    return json(origin, { error: '로그인이 필요합니다.' }, 401);
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
  if (deleteError) {
    console.error('Failed to delete Flowday account.', { code: deleteError.code });
    return json(origin, { error: '계정을 삭제하지 못했습니다. 잠시 후 다시 시도해주세요.' }, 500);
  }

  return json(origin, { ok: true }, 200, { 'Clear-Site-Data': '"cookies", "storage"' });
}

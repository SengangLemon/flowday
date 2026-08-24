import { createClient as createAdminClient } from '@supabase/supabase-js';
import { createClient } from '../../lib/supabase/server';

export const runtime = 'nodejs';

export async function DELETE(request: Request) {
  const requestOrigin = new URL(request.url).origin;
  const origin = request.headers.get('origin');
  if (origin && origin !== requestOrigin) {
    return Response.json({ error: '허용되지 않은 요청입니다.' }, { status: 403 });
  }

  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    return Response.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    console.error('Account deletion is unavailable because server credentials are missing.');
    return Response.json({ error: '계정 삭제 기능을 일시적으로 사용할 수 없습니다.' }, { status: 503 });
  }

  const admin = createAdminClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
  if (deleteError) {
    console.error('Failed to delete Flowday account.', { code: deleteError.code });
    return Response.json({ error: '계정을 삭제하지 못했습니다. 잠시 후 다시 시도해주세요.' }, { status: 500 });
  }

  return Response.json(
    { ok: true },
    { headers: { 'Cache-Control': 'no-store', 'Clear-Site-Data': '"cookies", "storage"' } },
  );
}

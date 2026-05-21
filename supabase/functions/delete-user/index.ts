import { createClient } from "https://esm.sh/@supabase/supabase-js@2.105.4";

type DeletePayload = {
  id?: string;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return json({ error: "Missing Supabase function environment variables" }, 500);
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const {
    data: { user: caller },
    error: callerError,
  } = await userClient.auth.getUser();

  if (callerError || !caller) {
    return json({ error: "Bạn cần đăng nhập để xóa nhân viên." }, 401);
  }

  const { data: callerProfile, error: profileError } = await adminClient
    .from("app_users")
    .select("id,role,status")
    .eq("auth_user_id", caller.id)
    .maybeSingle();

  if (profileError) {
    return json({ error: profileError.message }, 500);
  }

  if (
    callerProfile?.status !== "active" ||
    !["owner", "manager"].includes(callerProfile?.role ?? "")
  ) {
    return json({ error: "Chỉ chủ hệ thống hoặc quản lý được xóa nhân viên." }, 403);
  }

  const payload = (await req.json()) as DeletePayload;
  const id = payload.id?.trim();

  if (!id) {
    return json({ error: "Thiếu mã nhân viên cần xóa." }, 400);
  }

  const { data: target, error: targetError } = await adminClient
    .from("app_users")
    .select("id,auth_user_id,full_name,role")
    .eq("id", id)
    .maybeSingle();

  if (targetError) {
    return json({ error: targetError.message }, 500);
  }

  if (!target) {
    return json({ error: "Không tìm thấy nhân viên cần xóa." }, 404);
  }

  if (target.auth_user_id === caller.id || target.id === callerProfile.id) {
    return json({ error: "Không thể tự xóa tài khoản đang đăng nhập." }, 400);
  }

  if (callerProfile.role !== "owner" && ["owner", "manager"].includes(target.role)) {
    return json({ error: "Quản lý chỉ được xóa nhân viên thường hoặc kế toán." }, 403);
  }

  if (target.auth_user_id) {
    const { error: deleteAuthError } = await adminClient.auth.admin.deleteUser(target.auth_user_id);
    if (deleteAuthError) {
      return json({ error: deleteAuthError.message }, 400);
    }
  }

  const { error: deleteProfileError } = await adminClient
    .from("app_users")
    .delete()
    .eq("id", target.id);

  if (deleteProfileError) {
    return json({ error: deleteProfileError.message }, 400);
  }

  return json({ ok: true });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

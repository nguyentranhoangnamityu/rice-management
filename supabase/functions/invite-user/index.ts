import { createClient } from "https://esm.sh/@supabase/supabase-js@2.105.4";

type InvitePayload = {
  email?: string;
  password?: string;
  full_name?: string;
  phone?: string | null;
  role?: "owner" | "manager" | "accountant" | "staff";
  status?: "pending" | "active" | "inactive";
  note?: string | null;
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
    return json({ error: "Bạn cần đăng nhập để tạo nhân viên." }, 401);
  }

  const { data: callerProfile, error: profileError } = await adminClient
    .from("app_users")
    .select("role,status")
    .eq("auth_user_id", caller.id)
    .maybeSingle();

  if (profileError) {
    return json({ error: profileError.message }, 500);
  }

  if (
    callerProfile?.status !== "active" ||
    !["owner", "manager"].includes(callerProfile?.role ?? "")
  ) {
    return json({ error: "Chỉ chủ hệ thống hoặc quản lý được tạo tài khoản nhân viên." }, 403);
  }

  const payload = (await req.json()) as InvitePayload;
  const email = payload.email?.trim().toLowerCase();
  const fullName = payload.full_name?.trim();
  const password = payload.password ?? "";
  const role = payload.role ?? "staff";
  const status = payload.status ?? "active";

  if (!email || !fullName || password.length < 6) {
    return json({ error: "Vui lòng nhập email, họ tên và mật khẩu tối thiểu 6 ký tự." }, 400);
  }

  if (callerProfile.role !== "owner" && role === "owner") {
    return json({ error: "Chỉ chủ hệ thống được cấp vai trò chủ hệ thống." }, 403);
  }

  const { data: created, error: createError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });

  if (createError) {
    return json({ error: createError.message }, 400);
  }

  const { data: appUser, error: upsertError } = await adminClient
    .from("app_users")
    .upsert(
      {
        auth_user_id: created.user.id,
        email,
        full_name: fullName,
        phone: payload.phone ?? null,
        role,
        status,
        note: payload.note ?? null,
      },
      { onConflict: "email" },
    )
    .select("*")
    .single();

  if (upsertError) {
    return json({ error: upsertError.message }, 400);
  }

  return json({ user: appUser });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

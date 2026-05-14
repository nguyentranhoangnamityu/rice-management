import { zodResolver } from "@hookform/resolvers/zod";
import { LogIn } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { z } from "zod";
import { useAuth } from "../../auth/AuthProvider";
import { supabase } from "../../lib/supabase";

const loginSchema = z.object({
  email: z.string().trim().email("Email không hợp lệ"),
  password: z.string().min(1, "Nhập mật khẩu"),
});

type LoginFormValues = z.infer<typeof loginSchema>;

type LoginLocationState = {
  from?: {
    pathname?: string;
  };
};

export function LoginPage() {
  const { loading: authLoading, session } = useAuth();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const redirectTo = useMemo(() => {
    const state = location.state as LoginLocationState | null;
    return state?.from?.pathname ?? "/dashboard";
  }, [location.state]);

  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    setFocus,
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  useEffect(() => {
    setFocus("email");
  }, [setFocus]);

  if (!authLoading && session) {
    return <Navigate to={redirectTo} replace />;
  }

  async function onSubmit(values: LoginFormValues) {
    setSubmitError(null);

    const { error } = await supabase.auth.signInWithPassword(values);

    if (error) {
      setSubmitError("Email hoặc mật khẩu không đúng.");
      return;
    }

    navigate(redirectTo, { replace: true });
  }

  return (
    <div className="auth-shell">
      <form className="auth-card" onSubmit={handleSubmit(onSubmit)}>
        <div className="brand auth-brand">
          <div className="brand-mark">RM</div>
          <div>
            <strong>Quản lý lúa</strong>
            <span>Đăng nhập hệ thống</span>
          </div>
        </div>

        {submitError ? <div className="alert error-alert">{submitError}</div> : null}

        <label className="field">
          <span>Email</span>
          <input
            autoComplete="email"
            inputMode="email"
            placeholder="you@example.com"
            type="email"
            {...register("email")}
          />
          {errors.email ? <small>{errors.email.message}</small> : null}
        </label>

        <label className="field">
          <span>Mật khẩu</span>
          <input
            autoComplete="current-password"
            placeholder="Nhập mật khẩu"
            type="password"
            {...register("password")}
          />
          {errors.password ? <small>{errors.password.message}</small> : null}
        </label>

        <button className="primary-button" disabled={isSubmitting || authLoading} type="submit">
          <LogIn aria-hidden="true" size={18} />
          {isSubmitting ? "Đang đăng nhập..." : "Đăng nhập"}
        </button>
      </form>
    </div>
  );
}

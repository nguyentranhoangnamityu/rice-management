import { zodResolver } from "@hookform/resolvers/zod";
import { Edit2, KeyRound, Plus, Power, Search, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { ModalShell } from "../../components/ui/ModalShell";
import { PaginationControls } from "../../components/ui/PaginationControls";
import { useServerPagination } from "../../hooks/useServerPagination";
import { formatDbError } from "../../lib/db-errors";
import { supabase } from "../../lib/supabase";
import type { Enums, Tables } from "../../types/database";

type AppUser = Tables<"app_users">;
type AppRole = Enums<"app_role">;
type AppUserStatus = Enums<"app_user_status">;

const userSchema = z
  .object({
    full_name: z.string().trim().min(1, "Vui lòng nhập họ tên"),
    email: z.string().trim().email("Email không hợp lệ"),
    phone: z.string().trim().optional(),
    role: z.enum(["owner", "manager", "accountant", "staff"]),
    status: z.enum(["pending", "active", "inactive"]),
    password: z.string().optional(),
    note: z.string().trim().optional(),
  })
  .superRefine((values, context) => {
    const password = values.password?.trim() ?? "";
    if (password && password.length < 6) {
      context.addIssue({
        code: "custom",
        path: ["password"],
        message: "Mật khẩu tối thiểu 6 ký tự",
      });
    }
  });

type UserFormValues = z.infer<typeof userSchema>;

const emptyValues: UserFormValues = {
  full_name: "",
  email: "",
  phone: "",
  role: "staff",
  status: "active",
  password: "",
  note: "",
};

const roleLabels: Record<AppRole, string> = {
  owner: "Chủ hệ thống",
  manager: "Quản lý",
  accountant: "Kế toán",
  staff: "Nhân viên",
};

const statusLabels: Record<AppUserStatus, string> = {
  pending: "Chờ cấp tài khoản",
  active: "Đang hoạt động",
  inactive: "Ngưng hoạt động",
};

export function UsersPage() {
  const {
    items,
    page,
    setPage,
    total,
    totalPages,
    search,
    setSearch,
    loading,
    error: listError,
    refresh,
  } = useServerPagination<AppUser>("app_users");
  const [saving, setSaving] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [createdPassword, setCreatedPassword] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<AppUser | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<UserFormValues>({
    resolver: zodResolver(userSchema),
    defaultValues: emptyValues,
  });

  const formTitle = useMemo(
    () => (editingItem ? "Sửa nhân viên" : "Thêm nhân viên"),
    [editingItem],
  );

  function openAddForm() {
    setEditingItem(null);
    setError(null);
    setCreatedPassword(null);
    reset(emptyValues);
    setFormOpen(true);
  }

  function startEdit(item: AppUser) {
    setEditingItem(item);
    setError(null);
    setCreatedPassword(null);
    reset({
      full_name: item.full_name,
      email: item.email,
      phone: item.phone ?? "",
      role: item.role,
      status: item.status,
      password: "",
      note: item.note ?? "",
    });
    setFormOpen(true);
  }

  function clearForm() {
    setEditingItem(null);
    reset(emptyValues);
    setFormOpen(false);
  }

  async function onSubmit(values: UserFormValues) {
    setSaving(true);
    setError(null);
    setCreatedPassword(null);

    const payload = {
      full_name: values.full_name.trim(),
      email: values.email.trim().toLowerCase(),
      phone: toNullable(values.phone),
      role: values.role,
      status: values.status,
      note: toNullable(values.note),
    };

    if (editingItem) {
      const { error: updateError } = await supabase
        .from("app_users")
        .update(payload)
        .eq("id", editingItem.id);

      if (updateError) {
        setError(formatDbError(updateError));
      } else {
        clearForm();
        await refresh(page);
      }
      setSaving(false);
      return;
    }

    const password = values.password?.trim() ?? "";

    if (password) {
      const { error: inviteError } = await supabase.functions.invoke("invite-user", {
        body: { ...payload, password },
      });

      if (inviteError) {
        setError(await formatFunctionError(inviteError));
      } else {
        setCreatedPassword(password);
        clearForm();
        await refresh(1);
      }
      setSaving(false);
      return;
    }

    const { error: insertError } = await supabase
      .from("app_users")
      .insert({ ...payload, status: "pending" });

    if (insertError) {
      setError(formatDbError(insertError));
    } else {
      clearForm();
      await refresh(1);
    }

    setSaving(false);
  }

  async function toggleStatus(item: AppUser) {
    const nextStatus: AppUserStatus = item.status === "active" ? "inactive" : "active";
    const confirmed = window.confirm(
      `${nextStatus === "inactive" ? "Ngưng hoạt động" : "Kích hoạt"} nhân viên "${item.full_name}"?`,
    );
    if (!confirmed) return;

    setUpdatingId(item.id);
    setError(null);

    const { error: updateError } = await supabase
      .from("app_users")
      .update({ status: nextStatus })
      .eq("id", item.id);

    if (updateError) {
      setError(formatDbError(updateError));
    } else {
      await refresh(page);
    }

    setUpdatingId(null);
  }

  async function deleteItem(item: AppUser) {
    const confirmed = window.confirm(
      `Xóa nhân viên "${item.full_name}"?\n\nTài khoản đăng nhập Supabase Auth của nhân viên này cũng sẽ bị xóa.`,
    );
    if (!confirmed) return;

    setDeletingId(item.id);
    setError(null);

    const { error: deleteError } = await supabase.functions.invoke("delete-user", {
      body: { id: item.id },
    });

    if (deleteError) {
      setError(await formatFunctionError(deleteError));
    } else {
      if (editingItem?.id === item.id) {
        clearForm();
      }
      await refresh(page);
    }

    setDeletingId(null);
  }

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <h1>Nhân viên</h1>
          <p>Quản lý tài khoản nhân viên, vai trò và trạng thái sử dụng hệ thống.</p>
        </div>
        <div className="header-actions">
          <button className="primary-button" type="button" onClick={openAddForm}>
            <Plus size={18} aria-hidden="true" />
            Thêm nhân viên
          </button>
        </div>
      </header>

      <div className="crud-grid modal-crud-grid">
        {formOpen ? (
          <ModalShell onClose={clearForm}>
            <form className="form-card" onSubmit={handleSubmit(onSubmit)}>
              <div className="card-title-row">
                <h2>{formTitle}</h2>
              </div>

              <label className="field">
                <span>Họ tên</span>
                <input {...register("full_name")} placeholder="VD: Nguyễn Văn A" />
                {errors.full_name ? <small>{errors.full_name.message}</small> : null}
              </label>

              <div className="field-grid">
                <label className="field">
                  <span>Email đăng nhập</span>
                  <input
                    {...register("email")}
                    disabled={Boolean(editingItem?.auth_user_id)}
                    inputMode="email"
                    placeholder="nhanvien@example.com"
                    type="email"
                  />
                  {errors.email ? <small>{errors.email.message}</small> : null}
                </label>

                <label className="field">
                  <span>Số điện thoại</span>
                  <input {...register("phone")} inputMode="tel" placeholder="090..." />
                </label>
              </div>

              <div className="field-grid">
                <label className="field">
                  <span>Vai trò</span>
                  <select {...register("role")}>
                    {Object.entries(roleLabels).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="field">
                  <span>Trạng thái</span>
                  <select {...register("status")}>
                    {Object.entries(statusLabels).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {!editingItem ? (
                <label className="field">
                  <span>Mật khẩu đăng nhập</span>
                  <input
                    {...register("password")}
                    autoComplete="new-password"
                    placeholder="Bỏ trống nếu chỉ lưu hồ sơ trước"
                    type="password"
                  />
                  {errors.password ? <small>{errors.password.message}</small> : null}
                </label>
              ) : null}

              <label className="field">
                <span>Ghi chú</span>
                <textarea {...register("note")} rows={3} placeholder="Thông tin thêm nếu cần" />
              </label>

              <button className="primary-button" type="submit" disabled={saving}>
                {editingItem ? <Edit2 size={18} aria-hidden="true" /> : <KeyRound size={18} aria-hidden="true" />}
                {saving ? "Đang lưu..." : editingItem ? "Lưu thay đổi" : "Thêm nhân viên"}
              </button>
            </form>
          </ModalShell>
        ) : null}

        <div className="table-card">
          <div className="table-toolbar">
            <label className="search-field">
              <Search size={17} aria-hidden="true" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Tìm theo tên, email, điện thoại"
              />
            </label>
          </div>

          {createdPassword ? (
            <div className="alert warning-alert">
              Đã tạo tài khoản. Gửi mật khẩu tạm cho nhân viên và yêu cầu đổi mật khẩu sau khi đăng nhập.
            </div>
          ) : null}

          {error || listError ? <div className="alert error-alert">{error ?? listError}</div> : null}

          {loading ? (
            <div className="state-box">Đang tải nhân viên...</div>
          ) : items.length === 0 ? (
            <div className="state-box">Chưa có nhân viên phù hợp.</div>
          ) : (
            <>
              <div className="table-wrap">
                <table className="data-table wide-table">
                  <thead>
                    <tr>
                      <th>Nhân viên</th>
                      <th>Liên hệ</th>
                      <th>Vai trò</th>
                      <th>Trạng thái</th>
                      <th>Cập nhật</th>
                      <th aria-label="Thao tác" />
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <tr key={item.id}>
                        <td>
                          <strong>{item.full_name}</strong>
                          <div className="muted-cell">{item.note || "-"}</div>
                        </td>
                        <td>
                          {item.email}
                          <div className="muted-cell">{item.phone || "-"}</div>
                        </td>
                        <td>{roleLabels[item.role]}</td>
                        <td>
                          <span className={`payment-status-chip ${statusClassName(item.status)}`}>
                            {statusLabels[item.status]}
                          </span>
                        </td>
                        <td>{formatDateTime(item.updated_at)}</td>
                        <td>
                          <div className="row-actions">
                            <button
                              className="icon-button"
                              type="button"
                              onClick={() => startEdit(item)}
                              aria-label="Sửa"
                            >
                              <Edit2 size={17} aria-hidden="true" />
                            </button>
                            <button
                              className={`icon-button${item.status === "active" ? " danger" : ""}`}
                              type="button"
                              onClick={() => void toggleStatus(item)}
                              disabled={updatingId === item.id}
                              aria-label={item.status === "active" ? "Ngưng hoạt động" : "Kích hoạt"}
                            >
                              <Power size={17} aria-hidden="true" />
                            </button>
                            <button
                              className="icon-button danger"
                              type="button"
                              onClick={() => void deleteItem(item)}
                              disabled={deletingId === item.id}
                              aria-label="Xóa"
                            >
                              <Trash2 size={17} aria-hidden="true" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <PaginationControls
                page={page}
                totalPages={totalPages}
                total={total}
                loading={loading}
                onPageChange={setPage}
              />
            </>
          )}
        </div>
      </div>
    </section>
  );
}

function toNullable(value?: string) {
  const trimmed = value?.trim() ?? "";
  return trimmed ? trimmed : null;
}

function statusClassName(status: AppUserStatus) {
  if (status === "active") return "paid";
  if (status === "pending") return "partial";
  return "unpaid";
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

async function formatFunctionError(error: unknown) {
  if (error && typeof error === "object" && "context" in error) {
    const context = (error as { context?: Response }).context;
    try {
      const body = await context?.clone().json();
      if (body && typeof body.error === "string") {
        return body.error;
      }
    } catch {
      // Fall through to the generic Supabase error below.
    }
  }

  return `${formatDbError(error)}\n\nNếu chưa deploy Edge Function, chạy deploy hàm invite-user rồi thử lại.`;
}

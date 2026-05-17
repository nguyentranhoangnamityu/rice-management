import { supabase } from "./supabase";

export type DeleteBlocker = {
  label: string;
  count: number;
  where: string;
};

async function countByFarmer(
  table: "purchase_slips" | "authorization_letters" | "payments",
  farmerId: string,
) {
  const { count, error } = await supabase
    .from(table)
    .select("*", { count: "exact", head: true })
    .eq("farmer_id", farmerId);

  if (error) throw error;
  return count ?? 0;
}

/** Đếm bản ghi đang chặn xóa nông dân (mỗi bảng FK `ON DELETE RESTRICT`). */
export async function getFarmerDeleteBlockers(farmerId: string): Promise<DeleteBlocker[]> {
  const [slipCount, letterCount, paymentCount] = await Promise.all([
    countByFarmer("purchase_slips", farmerId),
    countByFarmer("authorization_letters", farmerId),
    countByFarmer("payments", farmerId),
  ]);

  const blockers: DeleteBlocker[] = [];

  if (slipCount > 0) {
    blockers.push({
      label: "phiếu mua",
      count: slipCount,
      where: "menu Phiếu mua",
    });
  }
  if (letterCount > 0) {
    blockers.push({
      label: "giấy ủy quyền",
      count: letterCount,
      where: "menu Giấy ủy quyền",
    });
  }
  if (paymentCount > 0) {
    blockers.push({
      label: "thanh toán",
      count: paymentCount,
      where: "dữ liệu thanh toán",
    });
  }

  return blockers;
}

export function formatDeleteBlockersMessage(blockers: DeleteBlocker[]): string {
  const lines = blockers.map(
    (blocker) => `• ${blocker.count} ${blocker.label} (${blocker.where})`,
  );
  return [
    "Không thể xóa nông dân vì vẫn còn dữ liệu liên quan:",
    ...lines,
    "",
    "Hãy xóa hoặc đổi nông dân trên các bản ghi trên trước khi xóa.",
  ].join("\n");
}

import { SettingsWorkspace } from "@/components/dashboard/settings-workspace";
import { requireStaffPageWithCapability } from "@/lib/auth/guard";

export const metadata = {
  title: "Pengaturan · Dashboard Desa Sukamaju",
};

/**
 * Settings, staff roster and village configuration are an elevated-role
 * surface: OPERATOR_DESA, SEKDES and KADES carry `manageSettings`; other
 * roles are redirected home instead of seeing the roster at all.
 */
export default async function PengaturanPage() {
  await requireStaffPageWithCapability("manageSettings", "/pengaturan");

  return <SettingsWorkspace />;
}

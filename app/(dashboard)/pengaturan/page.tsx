import { SettingsWorkspace } from "@/components/dashboard/settings-workspace";
import { requireStaffPageWithCapability } from "@/lib/auth/guard";

export const metadata = {
  title: "Pengaturan · Dashboard Desa Sukamaju",
};

export default async function PengaturanPage() {
  await requireStaffPageWithCapability("manageSettings", "/pengaturan");
  return <SettingsWorkspace />;
}
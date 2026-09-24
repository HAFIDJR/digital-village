import { RegistryWorkspace } from "@/components/dashboard/registry-workspace";

export const metadata = {
  title: "Kartu Keluarga · Dashboard Desa Sukamaju",
};

export default function KeluargaPage() {
  return <RegistryWorkspace type="families" />;
}

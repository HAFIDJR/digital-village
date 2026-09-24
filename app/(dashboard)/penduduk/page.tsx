import { RegistryWorkspace } from "@/components/dashboard/registry-workspace";

export const metadata = {
  title: "Data Penduduk · Dashboard Desa Sukamaju",
};

export default function PendudukPage() {
  return <RegistryWorkspace type="residents" />;
}

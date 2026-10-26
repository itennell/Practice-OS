import { Sidebar } from "@/components/sidebar";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="mx-auto flex min-h-screen max-w-[1400px] flex-col md:flex-row">
      <Sidebar />
      <main id="main" className="flex min-w-0 flex-1 flex-col gap-6 px-6 py-6 md:px-10 md:py-10">
        {children}
      </main>
    </div>
  );
}

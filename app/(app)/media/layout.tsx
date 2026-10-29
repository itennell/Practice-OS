import { MediaTabs } from "@/components/media/media-tabs";

// Media (the Instagram helper grown up): where she lists herself, her website,
// and Instagram. Each tab keeps its own heading; this adds the tab row above it.
export default function MediaLayout({ children }: LayoutProps<"/media">) {
  return (
    <div className="mx-auto flex w-full max-w-[860px] flex-col gap-6">
      <MediaTabs />
      {children}
    </div>
  );
}

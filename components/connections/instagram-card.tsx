import { Camera } from "lucide-react";
import { ConnectionCardFrame } from "./card-frame";

// The Instagram card on Settings › Connections. Posting to Instagram is cut for
// now (Isaiah, 2026-10-29): Aeon coaches her on posts and she posts them
// herself, so there is nothing to connect. The Connect code (lib/connect,
// relay/) stays for later.

export function InstagramCard() {
  return (
    <ConnectionCardFrame
      icon={<Camera className="size-5" />}
      title="Instagram"
      description="No connection needed. Aeon writes posts with you; you post them yourself."
      connected={false}
      statusText="Nothing to connect"
    />
  );
}

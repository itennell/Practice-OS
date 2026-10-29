import { deleteImage, uploadImage } from "../lib/handlers";
import { IMAGES_NOT_SET_UP, relayHealth } from "../lib/health";
import { outside, relayEnv } from "../lib/env";

const notSetUp = () => Response.json({ error: IMAGES_NOT_SET_UP }, { status: 503, headers: { "cache-control": "no-store" } });

export function POST(request: Request) {
  if (!relayHealth(process.env).images) return notSetUp();
  return uploadImage(request, relayEnv(), outside);
}

export function DELETE(request: Request) {
  if (!relayHealth(process.env).images) return notSetUp();
  return deleteImage(request, relayEnv(), outside);
}

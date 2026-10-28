import { deleteImage, uploadImage } from "../lib/handlers";
import { outside, relayEnv } from "../lib/env";

export function POST(request: Request) {
  return uploadImage(request, relayEnv(), outside);
}

export function DELETE(request: Request) {
  return deleteImage(request, relayEnv(), outside);
}

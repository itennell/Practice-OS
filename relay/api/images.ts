import { uploadImage } from "../lib/handlers";
import { outside } from "../lib/env";

export function POST(request: Request) {
  return uploadImage(request, outside);
}

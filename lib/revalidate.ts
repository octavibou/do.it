import { revalidatePath } from "next/cache";

export function revalidateAfterTaskChange(slug?: string | null) {
  revalidatePath("/");
  revalidatePath("/bots");
  if (slug) {
    revalidatePath(`/projects/${slug}`);
  }
}

export function revalidateAfterWebhookChange() {
  revalidatePath("/settings");
  revalidatePath("/bots");
}

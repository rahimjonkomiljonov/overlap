import { redirect } from "@/i18n/navigation";

/** Only one admin surface exists yet (S08's verification queue); more land in S16/S21. */
export default async function AdminIndexPage({ params }: PageProps<"/[locale]/admin">) {
  const { locale } = await params;
  redirect({ href: "/admin/verification", locale });
}

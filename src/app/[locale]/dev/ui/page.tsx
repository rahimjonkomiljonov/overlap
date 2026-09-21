import { Inbox } from "lucide-react";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { LogoMark } from "@/components/logo";
import { EmptyState } from "@/components/states/empty-state";
import { ErrorState } from "@/components/states/error-state";
import { ThemeToggle } from "@/components/theme-toggle";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { ToastDemo } from "./toast-demo";

// Development gallery of the design system. Off unless ENABLE_DEV_UI=true, and read at request time.
export const dynamic = "force-dynamic";

const swatches = [
  ["background / foreground", "bg-background text-foreground border"],
  ["card / card-foreground", "bg-card text-card-foreground border"],
  ["primary / primary-foreground", "bg-primary text-primary-foreground"],
  ["secondary / secondary-foreground", "bg-secondary text-secondary-foreground"],
  ["muted / muted-foreground", "bg-muted text-muted-foreground"],
  ["accent / accent-foreground", "bg-accent text-accent-foreground"],
  ["overlap / overlap-foreground", "bg-overlap text-overlap-foreground"],
  ["success / success-foreground", "bg-success text-success-foreground"],
  ["warning / warning-foreground", "bg-warning text-warning-foreground"],
  ["destructive / destructive-foreground", "bg-destructive text-destructive-foreground"],
] as const;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      {children}
    </section>
  );
}

export default async function DevUiPage({ params }: PageProps<"/[locale]/dev/ui">) {
  if (process.env.ENABLE_DEV_UI !== "true") {
    notFound();
  }
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <main id="main" className="mx-auto w-full max-w-3xl space-y-10 px-4 py-8">
      <header className="space-y-2">
        <div className="flex items-center gap-3">
          <LogoMark />
          <h1 className="text-3xl font-semibold tracking-tight">Design system</h1>
        </div>
        <p className="text-muted-foreground">
          Tokens and components used across Overlap. Development only.
        </p>
        <ThemeToggle />
      </header>

      <Section title="Colors">
        <div className="grid gap-3 sm:grid-cols-2">
          {swatches.map(([name, classes]) => (
            <div key={name} className={`rounded-xl px-4 py-5 text-sm font-medium ${classes}`}>
              {name}
            </div>
          ))}
        </div>
        <p className="text-sm text-muted-foreground">
          Helper text: muted-foreground on background.
        </p>
      </Section>

      <Section title="Typography">
        <h3 className="text-2xl font-semibold">캠퍼스 생활이 겹치는 사람을 만나보세요</h3>
        <p>
          Overlap은 같은 수업, 같은 동아리, 비슷한 공강 시간처럼 실제 캠퍼스 생활이 겹치는 사람을
          소개해요. 한국어는 어절 단위로 줄바꿈되어 읽기 편해요.
        </p>
        <p>
          Overlap introduces people whose real campus life overlaps with yours: the same class, the
          same club, similar free time.
        </p>
      </Section>

      <Section title="Buttons">
        <div className="flex flex-wrap items-center gap-3">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive">Destructive</Button>
          <Button variant="link">Link</Button>
          <Button disabled>Disabled</Button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm">Small</Button>
          <Button size="default">Default</Button>
          <Button size="lg">Large</Button>
        </div>
      </Section>

      <Section title="Form fields">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="demo-name">Name</Label>
            <Input id="demo-name" placeholder="Minji" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="demo-email">Campus email</Label>
            <Input
              id="demo-email"
              type="email"
              defaultValue="minji@school"
              aria-invalid="true"
              aria-describedby="demo-email-error"
            />
            <p id="demo-email-error" className="text-sm text-destructive">
              Use your .ac.kr email address.
            </p>
          </div>
        </div>
      </Section>

      <Section title="Badges and overlap chips">
        <div className="flex flex-wrap gap-2">
          <Badge>Default</Badge>
          <Badge variant="secondary">Secondary</Badge>
          <Badge variant="outline">Outline</Badge>
          <Badge className="bg-overlap text-overlap-foreground">CS 201 in common</Badge>
          <Badge className="bg-accent text-accent-foreground">Library on Tuesdays</Badge>
        </div>
      </Section>

      <Section title="Cards, avatars and skeletons">
        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <Avatar>
                  <AvatarFallback>MJ</AvatarFallback>
                </Avatar>
                <div>
                  <CardTitle>Minji, 21</CardTitle>
                  <CardDescription>Computer Science, 3rd year</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <p>You both study at the library on Tuesday evenings.</p>
              <Separator />
              <div className="flex flex-wrap gap-2">
                <Badge className="bg-overlap text-overlap-foreground">CS 201</Badge>
                <Badge className="bg-overlap text-overlap-foreground">Climbing club</Badge>
              </div>
            </CardContent>
          </Card>
          <div className="space-y-3">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-24 w-full rounded-2xl" />
            <Skeleton className="h-6 w-56" />
          </div>
        </div>
      </Section>

      <Section title="States">
        <EmptyState
          icon={Inbox}
          title="Nothing here yet"
          description="Empty states say what belongs here and what to do next."
          action={<Button>Do something</Button>}
        />
        <ErrorState onRetry={undefined} />
      </Section>

      <Section title="Toasts">
        <ToastDemo />
      </Section>
    </main>
  );
}

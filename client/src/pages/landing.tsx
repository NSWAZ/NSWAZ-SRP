import { Rocket, Shield, Zap, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const features = [
  {
    icon: Shield,
    title: "Secure & Reliable",
    description: "Your SRP requests are protected with enterprise-grade security",
  },
  {
    icon: Zap,
    title: "Fast Processing",
    description: "Streamlined approval workflow for quick reimbursements",
  },
  {
    icon: Users,
    title: "Alliance Support",
    description: "Supporting Nisuwa Cartel pilots in their fleet operations",
  },
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary">
              <Rocket className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="text-xl font-bold" data-testid="text-logo">Nisuwa Cartel SRP</span>
          </div>
          <Button asChild data-testid="button-login">
            <a href="/api/login">Log In with EVE</a>
          </Button>
        </div>
      </header>

      <main>
        <section className="py-24">
          <div className="container mx-auto px-4 text-center">
            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl" data-testid="text-hero-title">
              Ship Replacement Program
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground" data-testid="text-hero-description">
              Submit and track your SRP requests for fleet losses. Get reimbursed quickly
              and efficiently for ships lost during sanctioned alliance operations.
            </p>
            <div className="mt-10 flex flex-wrap justify-center gap-4">
              <Button size="lg" asChild data-testid="button-get-started">
                <a href="/api/login">Log In with EVE Online</a>
              </Button>
            </div>
          </div>
        </section>

        <section className="border-t py-24">
          <div className="container mx-auto px-4">
            <h2 className="text-center text-3xl font-bold" data-testid="text-features-title">
              Why Use Our SRP System?
            </h2>
            <div className="mt-12 grid gap-6 md:grid-cols-3">
              {features.map((feature, index) => (
                <Card key={index} className="text-center" data-testid={`card-feature-${index}`}>
                  <CardContent className="pt-6">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                      <feature.icon className="h-6 w-6 text-primary" />
                    </div>
                    <h3 className="mt-4 text-xl font-semibold">{feature.title}</h3>
                    <p className="mt-2 text-muted-foreground">{feature.description}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t bg-muted/30 py-24">
          <div className="container mx-auto px-4 text-center">
            <h2 className="text-3xl font-bold" data-testid="text-cta-title">Ready to Submit Your Request?</h2>
            <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
              Log in with your EVE Online account to start submitting SRP requests and tracking
              your reimbursements.
            </p>
            <Button size="lg" className="mt-8" asChild data-testid="button-cta-login">
              <a href="/api/login">Log In with EVE Online</a>
            </Button>
          </div>
        </section>
      </main>

      <footer className="border-t py-8">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          <p data-testid="text-footer">Nisuwa Cartel Alliance - EVE Online SRP Management System</p>
        </div>
      </footer>
    </div>
  );
}

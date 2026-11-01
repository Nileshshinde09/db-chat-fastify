"use client"

import { useState } from "react"
import Link from "next/link"
import { 
  ArrowRight, 
  Check, 
  HelpCircle, 
  Minus, 
  Sparkles, 
  Zap 
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"

// ── Data ──────────────────────────────────────────────────────────────────────

const plans = [
  {
    name: "Hobby",
    description: "Perfect for personal projects and exploring your data.",
    priceMonthly: "$0",
    priceYearly: "$0",
    features: [
      "1 Database connection",
      "100 AI queries per month",
      "Standard CSV exports",
      "Community support",
      "Basic contextual memory",
    ],
    missing: [
      "Excel exports",
      "Advanced RAG context",
      "Priority support",
    ],
    cta: "Start for free",
    variant: "outline" as const,
  },
  {
    name: "Pro",
    description: "For data teams that need unlimited power and exports.",
    priceMonthly: "$49",
    priceYearly: "$39",
    features: [
      "Unlimited database connections",
      "Unlimited AI queries",
      "CSV & Excel report generation",
      "Advanced contextual memory",
      "Priority email support",
      "Shareable chat links",
    ],
    missing: [
      "SSO / SAML",
      "Dedicated local LLM deployment",
    ],
    cta: "Upgrade to Pro",
    variant: "default" as const,
    popular: true,
  },
  {
    name: "Enterprise",
    description: "Custom security, deployment, and support for large orgs.",
    priceMonthly: "Custom",
    priceYearly: "Custom",
    features: [
      "Everything in Pro",
      "SSO / SAML authentication",
      "Self-hosted Ollama deployment",
      "Custom SLAs & dedicated support",
      "Audit logs & compliance",
      "Role-based access control (RBAC)",
    ],
    missing: [],
    cta: "Contact Sales",
    variant: "outline" as const,
  },
]

const faqs = [
  {
    question: "Can I change my plan later?",
    answer: "Yes, you can upgrade or downgrade your plan at any time from your billing dashboard. If you downgrade, you'll retain access to Pro features until the end of your billing cycle."
  },
  {
    question: "What happens if I exceed my query limit?",
    answer: "On the Hobby plan, your AI chat will be temporarily paused for the rest of the month. You can upgrade to Pro at any time to instantly unlock unlimited queries."
  },
  {
    question: "Do you offer a free trial for Pro?",
    answer: "Yes! Every new workspace comes with a 14-day free trial of the Pro features. No credit card required to start."
  },
  {
    question: "Is my database data used to train AI models?",
    answer: "Absolutely not. We use locally hosted open-source models (via Ollama). Your data never leaves your infrastructure and is never used for training."
  }
]

export default function PricingPage() {
  const [isYearly, setIsYearly] = useState(false)

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50 selection:bg-primary/30 pb-24">
      
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden pt-24 pb-12 md:pt-32">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-zinc-800/40 via-zinc-950 to-zinc-950" />
        
        <div className="mx-auto flex max-w-4xl flex-col items-center px-4 text-center md:px-6">
          <Badge variant="outline" className="mb-6 border-zinc-700 bg-zinc-900/50 text-zinc-300">
            <Sparkles className="mr-2 size-3.5" />
            Simple, transparent pricing
          </Badge>
          
          <h1 className="text-4xl font-bold tracking-tight text-white md:text-6xl">
            Choose the plan that <br className="hidden md:block" /> fits your data.
          </h1>
          
          <p className="mt-6 max-w-2xl text-base text-zinc-400 md:text-lg">
            Start for free, upgrade when you need more power. No hidden fees, no surprises. Cancel anytime.
          </p>

          {/* Billing Toggle */}
          <div className="mt-10 flex items-center gap-4 rounded-full border border-zinc-800 bg-zinc-900/50 px-6 py-3">
            <span className={`text-sm ${!isYearly ? "text-white font-medium" : "text-zinc-400"}`}>
              Monthly
            </span>
            <Switch 
              checked={isYearly} 
              onCheckedChange={setIsYearly} 
              className="data-[state=checked]:bg-primary"
            />
            <span className={`text-sm flex items-center gap-2 ${isYearly ? "text-white font-medium" : "text-zinc-400"}`}>
              Yearly
              <Badge variant="secondary" className="bg-primary/20 text-primary hover:bg-primary/30 border-none px-2 py-0.5 text-[10px]">
                Save 20%
              </Badge>
            </span>
          </div>
        </div>
      </section>

       {/* ── Pricing Cards ────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-7xl px-4 py-12 md:px-6">
        <div className="grid gap-8 lg:grid-cols-3 lg:gap-8 items-stretch pt-6">
          {plans.map((plan) => (
            <Card 
              key={plan.name} 
              className={`relative flex flex-col h-full overflow-visible border-zinc-800 bg-zinc-900/40 ${
                plan.popular ? "border-primary/50 bg-zinc-900 shadow-2xl shadow-primary/10" : ""
              }`}
            >
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10">
                  <Badge className="bg-primary text-primary-foreground hover:bg-primary border-none px-3 py-1 shadow-md">
                    <Zap className="mr-1 size-3" /> Most Popular
                  </Badge>
                </div>
              )}

              <CardHeader className="p-8 pb-4">
                <CardTitle className="text-2xl font-bold text-white">{plan.name}</CardTitle>
                <CardDescription className="mt-2 text-zinc-400">
                  {plan.description}
                </CardDescription>
              </CardHeader>

              <CardContent className="p-8 pt-0 flex-1 flex flex-col">
                <div className="mb-6 flex items-baseline gap-1 h-12">
                  <span className="text-4xl font-extrabold text-white">
                    {isYearly ? plan.priceYearly : plan.priceMonthly}
                  </span>
                  {plan.priceMonthly !== "Custom" && (
                    <span className="text-sm text-zinc-400">/ month</span>
                  )}
                </div>

                <Separator className="mb-6 bg-zinc-800" />

                <ul className="flex flex-col gap-3 text-sm">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-3">
                      <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                      <span className="text-zinc-300">{feature}</span>
                    </li>
                  ))}
                  {plan.missing.map((feature) => (
                    <li key={feature} className="flex items-start gap-3 opacity-50">
                      <Minus className="mt-0.5 size-4 shrink-0 text-zinc-500" />
                      <span className="text-zinc-500 line-through">{feature}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>

              <CardFooter className="p-8 pt-0 mt-auto">
                <Button 
                  variant={plan.variant} 
                  className={`w-full h-12 text-base font-semibold ${
                    plan.popular ? "bg-primary text-primary-foreground hover:bg-primary/90" : "border-zinc-700 bg-transparent text-white hover:bg-zinc-800"
                  }`}
                >
                  {plan.cta}
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      </section> {/* 🟢 HERE IS THE CLOSING TAG */}

      <Separator className="mx-auto max-w-5xl bg-zinc-800 my-16" />

      {/* ── FAQ Section ──────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-3xl px-4 md:px-6">
        <div className="mb-10 text-center">
          <h2 className="text-3xl font-bold tracking-tight text-white flex items-center justify-center gap-2">
            <HelpCircle className="size-6 text-primary" />
            Frequently Asked Questions
          </h2>
        </div>

        <div className="flex flex-col gap-6">
          {faqs.map((faq, i) => (
            <div key={i} className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-6">
              <h3 className="text-lg font-semibold text-white">{faq.question}</h3>
              <p className="mt-2 text-zinc-400 leading-relaxed">{faq.answer}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA Section ──────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-5xl px-4 mt-24 md:px-6">
        <div className="flex flex-col items-center rounded-3xl border border-zinc-800 bg-gradient-to-b from-zinc-900 to-zinc-950 px-6 py-16 text-center md:px-16">
          <h2 className="text-3xl font-bold tracking-tight text-white md:text-4xl">
            Ready to experience Pro?
          </h2>
          <p className="mt-4 max-w-xl text-zinc-400">
            Start your 14-day free trial today. No credit card required. Cancel anytime.
          </p>
          <div className="mt-8">
            <Button size="lg" className="h-12 px-8 text-base font-semibold">
              Start Your Free Trial
              <ArrowRight className="ml-2 size-4" />
            </Button>
          </div>
        </div>
      </section>

    </div>
  )
}
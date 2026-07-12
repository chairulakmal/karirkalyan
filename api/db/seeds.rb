# frozen_string_literal: true

# Idempotent demo seed. Safe to re-run at any time.
# Run: bin/rails db:seed

# Guarded so re-running the seed in one process (e.g. Demo::ResetService
# calling load_seed) doesn't emit "already initialized constant" warnings.
DEMO_EMAIL    = "demo@karirkalyan.com" unless defined?(DEMO_EMAIL)
DEMO_PASSWORD = "oretachinomachida"    unless defined?(DEMO_PASSWORD)

demo = User.find_or_create_by!(email: DEMO_EMAIL) do |u|
  u.password              = DEMO_PASSWORD
  u.password_confirmation = DEMO_PASSWORD
end

# The Playwright suite's account, and deliberately *not* the demo one. The E2E specs
# assert on the row they just created, which they cannot do inside a fixture holding
# twelve pre-loaded applications — and the demo account has to keep holding them,
# because it is the portfolio walkthrough. Registration is closed (SPEC.md), so the
# suite can no longer register a throwaway user of its own; it signs in as this.
# Left empty on purpose.
#
# **Never in production.** This file is not a dev-only fixture: Demo::ResetService
# calls `load_seed`, and DemoResetJob runs it *hourly in production*. An unguarded
# account here would be created on prod within the hour — a second live account with
# a password nobody chose, which is precisely the door § Registration is closed shuts.
#
# The Playwright side reads the same two variables with the same two defaults
# (`web/e2e/credentials.ts`) — change one and you must change the other.
unless Rails.env.production?
  E2E_EMAIL    = ENV.fetch("E2E_EMAIL", "e2e@karirkalyan.test") unless defined?(E2E_EMAIL)
  E2E_PASSWORD = ENV.fetch("E2E_PASSWORD", "e2e-local-only")    unless defined?(E2E_PASSWORD)

  User.find_or_create_by!(email: E2E_EMAIL) do |u|
    u.password              = E2E_PASSWORD
    u.password_confirmation = E2E_PASSWORD
  end
end

seed_data = [
  # ── Marcari Inc. (Mercari) ── Full journey: accepted ──────────────────────
  {
    slug: "marcari",
    app: {
      company:    "Marcari Inc.",
      role:       "Full-Stack Engineer",
      status:     "accepted",
      url:        "https://careers.marcari.co.jp/eng/2891",
      notes:      "Marketplace seller-tools team. Go + React. Remote 3 days/week. TC: ¥9M + RSU. Accepted — starting 2026-04-01.",
      applied_at: 3.months.ago
    },
    transitions: [
      { from: "wishlist",     to: "draft",        note: "Spotted on Wantfully. Remote-friendly culture, strong eng blog.",               at: 4.months.ago  },
      { from: "draft",        to: "applied",      note: "Submitted portfolio + cover letter via careers portal.",                         at: 3.months.ago  },
      { from: "applied",      to: "phone_screen", note: "HR Tanaka-san called within 3 days. 30-min culture + motivation screen.",        at: 10.weeks.ago  },
      { from: "phone_screen", to: "technical",    note: "LeetCode-style + system design (design a marketplace feed). 90 min.",            at: 8.weeks.ago   },
      { from: "technical",    to: "final_round",  note: "Full-day onsite: 3 engineers + EM. Pair coding session + architecture review.",  at: 6.weeks.ago   },
      { from: "final_round",  to: "offer",        note: "Offer received: ¥9,000,000 base + ¥2M RSU over 4 years. Start: 2026-04-01.",    at: 4.weeks.ago   },
      { from: "offer",        to: "accepted",     note: "Signed offer letter. Gave notice to current employer.",                          at: 3.weeks.ago   }
    ]
  },

  # ── Vine Corp (LINE / LY Corporation) ── Pending offer decision ──────────
  {
    slug: "vinecorp",
    app: {
      company:      "Vine Corp",
      role:         "Backend Engineer",
      status:       "offer",
      url:          "https://careers.vine-corp.co.jp/jobs/backend-5512",
      notes:        "Messaging infrastructure team. Kotlin + gRPC. Offer out, response deadline next week.",
      applied_at:   2.months.ago,
      follow_up_at: 1.week.from_now
    },
    transitions: [
      { from: "wishlist",     to: "draft",        note: "Referred by ex-colleague Sato-san. Team has a strong infra reputation.",         at: 3.months.ago  },
      { from: "draft",        to: "applied",      note: "Applied via referral link — skipped initial resume screening.",                  at: 2.months.ago  },
      { from: "applied",      to: "phone_screen", note: "Recruiter Kimura-san. 45-min chat, salary expectations aligned at ¥10M+.",      at: 6.weeks.ago   },
      { from: "phone_screen", to: "technical",    note: "Distributed-systems design + Kotlin coding round. Two senior engineers.",        at: 5.weeks.ago   },
      { from: "technical",    to: "final_round",  note: "Panel: EM + VP Engineering. Presented past architecture decision.",              at: 3.weeks.ago   },
      { from: "final_round",  to: "offer",        note: "Offer: ¥10,500,000. Response deadline: one week from today.",                   at: 4.days.ago    }
    ]
  },

  # ── Rokuton Group (Rakuten) ── In final round ────────────────────────────
  {
    slug: "rokuton",
    app: {
      company:    "Rokuton Group",
      role:       "Senior Software Engineer",
      status:     "final_round",
      url:        "https://corp.rokuton.co.jp/careers/tech/sr-swe-4421",
      notes:      "Payment platform team. Java + Spring Boot. Global team, English required. Final round scheduled.",
      applied_at: 3.months.ago
    },
    transitions: [
      { from: "applied",      to: "phone_screen", note: "Global recruiting team emailed. First interview conducted in English.",          at: 10.weeks.ago  },
      { from: "phone_screen", to: "technical",    note: "Algorithm challenge (HackerRank) + Java deep-dive. 2 hours total.",             at: 8.weeks.ago   },
      { from: "technical",    to: "final_round",  note: "Passed technical. Final round with hiring committee — scheduled next week.",     at: 3.weeks.ago   }
    ]
  },

  # ── BeNA Games (DeNA) ── Technical round in progress ─────────────────────
  {
    slug: "bena-games",
    app: {
      company:    "BeNA Games",
      role:       "Mobile Backend Engineer",
      status:     "technical",
      url:        "https://engineering.bena.co.jp/jobs/mobile-backend",
      notes:      "Game server infra team. Ruby + Go. High-traffic scale, interesting domain. Take-home due Friday.",
      applied_at: 10.weeks.ago
    },
    transitions: [
      { from: "applied",      to: "phone_screen", note: "HR intro: team culture, game knowledge a definite plus.",                       at: 9.weeks.ago   },
      { from: "phone_screen", to: "technical",    note: "Take-home assignment: design a game leaderboard API. 72-hour window.",           at: 5.weeks.ago   }
    ]
  },

  # ── CyberFactor (CyberAgent) ── Phone screen stage ───────────────────────
  {
    slug: "cyberfactor",
    app: {
      company:    "CyberFactor Inc.",
      role:       "Software Engineer, AI Platform",
      status:     "phone_screen",
      url:        "https://cyberagent.ai/careers/ai-platform",
      notes:      "AbemaTube AI recommendation team. Python + MLOps. Interesting tech, fast-paced culture.",
      applied_at: 6.weeks.ago
    },
    transitions: [
      { from: "applied",      to: "phone_screen", note: "AI recruiter Nakamura-san. Discussing team fit, ML background, and tech stack.", at: 3.weeks.ago   }
    ]
  },

  # ── Cansan Corporation (Sansan) ── Applied, awaiting response ─────────────
  {
    slug: "cansan",
    app: {
      company:    "Cansan Corporation",
      role:       "Backend Engineer",
      status:     "applied",
      url:        "https://careers.cansan.co.jp/engineer/backend",
      notes:      "Bill One B2B SaaS team. Ruby + TypeScript. Work-life balance reputation is excellent. Waiting on recruiter.",
      applied_at: 6.weeks.ago
    },
    transitions: []
  },

  # ── greeo K.K. (freee) ── Applied, awaiting response ─────────────────────
  {
    slug: "greeo",
    app: {
      company:    "greeo K.K.",
      role:       "Full-Stack Engineer",
      status:     "applied",
      url:        "https://jobs.greeo.co.jp/fullstack-product",
      notes:      "Accounting SaaS, SMB market. Rails + React. Mission-driven, good OSS contribution culture.",
      applied_at: 1.month.ago
    },
    transitions: []
  },

  # ── Funds Forward (Money Forward) ── Rejected post-technical ─────────────
  {
    slug: "fundsforward",
    app: {
      company:    "Funds Forward Inc.",
      role:       "Senior Backend Engineer",
      status:     "rejected",
      url:        "https://corp.fundsforward.co.jp/recruit/senior-backend",
      notes:      "Fintech, personal finance app. Go microservices. Rejected post-technical — request feedback to improve.",
      applied_at: 3.months.ago
    },
    transitions: [
      { from: "applied",      to: "rejected",     note: "Rejected after technical round. No detailed feedback provided.",                 at: 2.months.ago  }
    ]
  },

  # ── SlickHR (SmartHR) ── Ghosted after phone screen ──────────────────────
  {
    slug: "slickhr",
    app: {
      company:    "SlickHR Inc.",
      role:       "Software Engineer",
      status:     "ghosted",
      url:        "https://smarthr.example/jobs/swe",
      notes:      "HR SaaS. Good product. Sent follow-up email after 3 weeks of silence — no reply.",
      applied_at: 2.months.ago
    },
    transitions: [
      { from: "applied",      to: "ghosted",      note: "3 weeks post-phone screen with no contact. Follow-up sent, still no response.", at: 6.weeks.ago   }
    ]
  },

  # ── Cybozo (Cybozu) ── Withdrew before applying (salary too low) ──────────
  {
    slug: "cybozo",
    app: {
      company: "Cybozo Inc.",
      role:    "Backend Engineer",
      status:  "withdrawn",
      url:     "https://cybozo.co.jp/careers/backend",
      notes:   "Groupware / kintone team. Interesting Ruby culture, but salary range ¥5.5M–6.5M is below ¥7.5M+ target."
    },
    transitions: [
      { from: "draft",        to: "withdrawn",    note: "Salary range disclosed: ¥5.5M–6.5M. Below target. Withdrew before submitting.", at: 3.months.ago + 15.days }
    ]
  },

  # ── Wantfully (Wantedly) ── Draft — resume not ready ─────────────────────
  {
    slug: "wantfully",
    app: {
      company: "Wantfully Inc.",
      role:    "Full-Stack Engineer",
      status:  "draft",
      url:     "https://wantfully.com/projects/fullstack-eng",
      notes:   "Recruitment platform team. Rails + React. Needs new projects section in resume before applying."
    },
    transitions: [
      { from: "wishlist",     to: "draft",        note: "Interesting mission. Resume needs updating with recent side projects.",          at: 6.weeks.ago   }
    ]
  },

  # ── Cogpal (Cookpad) ── Wishlist — not yet started ────────────────────────
  {
    slug: "cogpal",
    app: {
      company: "Cogpal Inc.",
      role:    "Backend Engineer",
      status:  "wishlist",
      url:     "https://info.cogpal.jp/careers",
      notes:   "Recipe platform. Ruby-first engineering culture, strong open-source presence. Research team before drafting."
    },
    transitions: []
  }
].freeze

seed_data.each do |entry|
  slug        = entry[:slug]
  app_attrs   = entry[:app]
  transitions = entry[:transitions]

  app = Application.find_or_create_by!(
    user:    demo,
    company: app_attrs[:company],
    role:    app_attrs[:role]
  ) do |a|
    a.status       = app_attrs[:status]
    a.url          = app_attrs[:url]
    a.notes        = app_attrs[:notes]
    a.applied_at   = app_attrs[:applied_at]
    a.follow_up_at = app_attrs[:follow_up_at]
  end

  transitions.each_with_index do |t, i|
    key = "seed-#{slug}-#{i}"
    next if TimelineEntry.exists?(idempotency_key: key)

    TimelineEntry.create!(
      application:     app,
      actor:           demo,
      from_status:     t[:from],
      to_status:       t[:to],
      note:            t[:note],
      idempotency_key: key,
      created_at:      t[:at],
      updated_at:      t[:at]
    )
  end
end

puts "Demo seed complete — #{Application.where(user: demo).count} applications seeded for #{DEMO_EMAIL}"

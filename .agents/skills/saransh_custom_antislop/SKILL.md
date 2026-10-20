---
name: saransh_custom_antislop
description: "Quality gate and mandatory Anti-Slop Pass for UI generation and review. Enforces authentic UX, accessibility, and clean design without replacing one AI anti-pattern with another."
---

# Saransh Custom Anti-Slop (`saransh_custom_antislop`)

==================================================
AGENT BEHAVIOR
==================================================

This skill is a **quality gate, not a suggestion list**.

When generating UI, **automatically run the Anti-Slop Pass** before considering the task complete.

If the generated implementation contains multiple obvious anti-patterns:

1. **Identify them.**
2. **Refactor them.**
3. **Re-evaluate the result.**
4. **Only then present the implementation.**

Do not explain every internal design decision unless asked.

When reviewing existing code, do not rewrite everything unnecessarily.

Preserve good existing design decisions.

Only change something when there is a meaningful UX, accessibility, maintainability, branding, or anti-slop reason.

**Never introduce a replacement anti-pattern while fixing another one.**

---

### The Anti-Replacement Rule ("No Swap-Slop")

Do **NOT** remove gradients and replace them with:
- glassmorphism
- neon
- giant shadows
- bento cards
- decorative blobs

The solution should be **genuinely better**, not simply a different flavor of AI slop.

---

## 1. The Anti-Slop Quality Gate Workflow

Before presenting any generated or edited UI code to the user, execute this 4-step internal loop:

```
┌─────────────────────────────────────────────────────────────┐
│ 1. IDENTIFY                                                 │
│    Scan code for AI tropes, decorative clutter, & clichés   │
└──────────────────────────────┬──────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. REFACTOR                                                 │
│    Strip decorative noise. Solve with real layout & type.   │
│    DO NOT swap one gimmick for another.                     │
└──────────────────────────────┬──────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. RE-EVALUATE                                              │
│    Check UX hierarchy, contrast, accessibility, responsiveness.
│    Verify: Is the result grounded, clean, and functional?   │
└──────────────────────────────┬──────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. PRESENT                                                  │
│    Deliver the final output cleanly.                        │
│    Do not justify internal micro-decisions unless asked.    │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Common AI Slop Tropes to Eliminate

| Slop Trope | Why it Fails | Authentic Anti-Slop Solution |
|---|---|---|
| **Purple/Indigo AI Gradients** | Generic, overused, signals lack of intentional palette | Curated, purposeful color palette or warm monochrome with crisp contrast |
| **Glassmorphism Everywhere** (`backdrop-blur`, semi-transparent borders) | Reduces text readability, performance hit, visual mud | Solid, high-contrast surfaces with clear elevation and crisp separation |
| **Neon Glows & Outer Shadows** (`shadow-[0_0_30px_...]`) | Distracting, looks like a cheap crypto landing page | Subdued, realistic ambient shadows (`box-shadow: 0 1px 3px rgba(0,0,0,0.1)`) or clean borders |
| **Bento Grid For Everything** | Forces unrelated content into arbitrary rectangular boxes | Content-driven layout: let content determine width, height, and flow |
| **Floating Background Blobs** | Decorative filler that conveys zero information | Generous whitespace, subtle grid lines, or relevant imagery/illustrations |
| **Cards inside Cards inside Cards** | Visual claustrophobia and nested border soup | Single surface plane with semantic typography and spacing to divide sections |
| **Infinite Micro-Animations** (pulsing buttons, floating icons) | Annoying, drains battery, distracts user from actual actions | Restrained micro-interactions triggered only on user action (hover, focus, tap) |

---

## 3. Principles for Reviewing Existing Code

1. **Primacy of Intent**: Do not rewrite functioning, thoughtfully styled components to match a personal whim.
2. **Preservation**: If an existing design decision works well for usability and aesthetics, keep it intact.
3. **Justified Interventions**: Only modify existing code when you can point to:
   - Tangible UX confusion or navigation friction.
   - Accessibility failures (failing WCAG contrast, missing focus states, unreadable type).
   - Maintainability problems (spaghetti CSS, conflicting utility layers).
   - Inconsistent branding.
   - Obvious AI-generated slop tropes.
4. **Silent Excellence**: Provide the finished, refined solution. Do not write paragraphs explaining why you changed a border radius from 16px to 8px unless the user specifically asks for design rationale.

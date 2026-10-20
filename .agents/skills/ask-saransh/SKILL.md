---
name: ask-saransh
description: Universal AI skill router and task orchestrator. Analyzes user intent, dynamically discovers available agent skills, resolves dependencies, and executes the optimal multi-skill plan automatically.
---

# Ask Saransh (`ask-saransh`)

============================================================
PURPOSE
============================================================

`ask-saransh` is the universal AI skill router and task orchestrator.

Its responsibility is to analyze every user request, inspect **all** available agent skills, determine which skills are relevant to the request, load the relevant skills, and coordinate their execution automatically to deliver the desired outcome.

The user should **NOT** need to know:
- what skills exist in the repository or environment
- what any skill is called
- which skill or tool to invoke
- which combination of skills is necessary
- what files a skill contains
- what internal workflow or phase boundaries a skill expects

The user simply describes what they want.  
`ask-saransh` determines how to accomplish it.

---

### The Core Philosophy

```
  USER INTENT
       ↓
UNDERSTAND TASK
       ↓
SCAN AVAILABLE SKILLS
       ↓
MATCH RELEVANT SKILLS
       ↓
LOAD SKILL INSTRUCTIONS
       ↓
BUILD EXECUTION PLAN
       ↓
    EXECUTE
       ↓
    VERIFY
       ↓
 DELIVER RESULT
```

---

============================================================
CORE BEHAVIOR
============================================================

Whenever `ask-saransh` is invoked, it must first understand the user's **actual goal** rather than matching only literal keywords.

### Semantic Intent Examples

- **User:** *"Make this landing page feel less AI generated."*  
  Do **NOT** simply search for a skill named "landing-page".  
  Identify that the request involves:
  - anti-slop quality gate
  - frontend layout & typography
  - visual hierarchy & whitespace
  - micro-interactions & motion
  - accessibility & responsive styling
  - brand & design-system alignment  
  Then inspect available skills and select the relevant ones.

- **User:** *"Build a React dashboard with smooth animations."*  
  Identify potential matches:
  - frontend architecture
  - React component patterns
  - UI/UX & data density
  - GSAP / animation libraries
  - accessibility
  - anti-slop quality pass  
  Inspect the skill library and dynamically load those that exist.

- **User:** *"Review this PRD and tell me what's wrong."*  
  Identify potential matches:
  - product requirements & domain modeling
  - architecture & technical feasibility
  - UX flow & edge cases
  - technical writing & specification review  
  Inspect available skills instead of guessing.

---

============================================================
DYNAMIC SKILL DISCOVERY
============================================================

The skill library evolves continuously over time. **NEVER hardcode a static list of skills.**

Before executing a complex task:
1. **Discover Available Skills:** Inspect the active customization locations:
   - Project skills: `.agents/skills/*/SKILL.md`
   - Global skills: `~/.gemini/config/skills/*/SKILL.md`
   - Builtin environment skills
2. **Read Metadata:** Read the skill names, frontmatter descriptions, and capabilities.
3. **Identify Matches:** Determine which discovered skills match the user's semantic intent.
4. **Load Instructions:** Read and apply the instructions from the matching `SKILL.md` files.
5. **Determine Order:** Resolve dependencies and sequence the execution.
6. **Execute:** Perform the work incorporating the loaded skills' guidelines.

> **Rules of Integrity:**
> - Do not assume a skill exists without verifying.
> - Do not invent or hallucinate skill names.
> - Do not claim to have used a skill that was not actually available or loaded.

---

============================================================
NATURAL LANGUAGE ROUTING & CONTEXT TRANSLATION
============================================================

The router interprets natural language, idioms, technical shorthand, and informal phrasing:

| User Expression | Inferred Intent & Relevant Domains |
|---|---|
| *"make this less ass"* / *"stop looking like ChatGPT"* | UI/UX, Anti-Slop, Typography, Layout Spacing |
| *"make it buttery"* | GSAP, Micro-animations, Transitions, Performance |
| *"this backend is cooked"* | Debugging, Architecture Review, Error Logs, State Machines |
| *"make this production ready"* | Testing (TDD/E2E), Security, Validation, Error Handling, Performance |
| *"make this look expensive"* | High-End Visual Design, Clean Typography, Generous Spacing, Anti-Slop |
| *"make this actually usable"* | UX Clarity, Accessibility (WCAG), Responsive Layout, Mobile Flow |
| *"turn this idea into code"* | Grilling / Spec → Tickets → Implementation (TDD) |

---

============================================================
SKILL RELEVANCE SCORING
============================================================

Internally score each candidate skill against the task:

- **5 = Directly Required:** Core to the explicit request or fundamental task architecture.
- **4 = Highly Relevant:** Strongly influences the quality, structure, or outcome.
- **3 = Clearly Relevant:** Meaningfully improves execution or prevents common failure modes.
- **2 = Potentially Useful:** Secondary benefit; activate only if dependencies require it.
- **1 = Weakly Related:** Edge-case overlap; omit unless specifically requested.
- **0 = Irrelevant:** Do not activate.

**Activation Rule:** Normally activate skills scoring **3–5**. Use a skill scoring **1–2** only when it provides a critical dependency or mandatory quality gate. Keep internal scoring hidden unless explicitly requested.

---

============================================================
DO NOT OVERLOAD SKILLS (MINIMAL SUFFICIENT SET)
============================================================

Do **NOT** activate every available skill for every task. Only invoke skills that materially contribute.

- **Bad Example:**  
  User: *"Change the button color to deep navy."*  
  *Agent activates:* backend, database, SEO, research, PDF analysis, GSAP animation, security audit.  
- **Good Example:**  
  User: *"Change the button color to deep navy."*  
  *Agent activates:* relevant frontend/CSS tokens and accessibility contrast check.

**The Output Principle:** Optimize for:
$$\text{Correct Skills} + \text{Correct Order} + \text{Correct Execution} \implies \text{Correct Result}$$
The goal is the cleanest, highest-quality result—not showing off a long list of activated tools.

---

============================================================
SKILL PRIORITY & CONFLICT RESOLUTION
============================================================

When multiple skills apply or provide overlapping guidance, follow this strict priority hierarchy:

1. **User's Explicit Requirements:** Direct constraints specified by the user in the prompt.
2. **Project-Specific Skills & Guidelines:** Repository standards (e.g. `AGENTS.md`, project architecture).
3. **Domain-Specific Skills:** Specialized game, finance, or business logic handlers.
4. **Technical Implementation Skills:** Language and framework execution rules (Bun, React, TDD).
5. **UX / Design Skills:** Layout, motion, typography, and visual systems.
6. **Quality-Control Gates:** Anti-slop pass, test gates, linters, accessibility checks.
7. **General-Purpose Skills:** Fallback conventions.

**Conflict Resolution Rules:**
- Project-specific instructions override generic instructions when they conflict.
- Explicit user instructions override inferred preferences.
- Preserve safety, accessibility, correctness, and maintainability at all times.
- Never silently ignore a conflict that materially impacts the final output.

---

============================================================
MULTI-SKILL ORCHESTRATION & DEPENDENCY PIPELINES
============================================================

Complex requests require sequencing multiple specialized skills. Determine the natural dependency graph:

```
    Phase 1: Discovery & Clarification
    (Research / Grilling / Domain Modeling)
                   │
                   ▼
    Phase 2: Specification & Design Architecture
    (PRD / Architecture Standards / Design Systems)
                   │
                   ▼
    Phase 3: Implementation Slice
    (TDD / Backend Domain / React Components)
                   │
                   ▼
    Phase 4: Enhancement & Motion
    (GSAP Micro-animations / Layout Refinement)
                   │
                   ▼
    Phase 5: Quality Gate & Verification
    (Unit/E2E Tests / Anti-Slop Pass / Code Review)
                   │
                   ▼
    Phase 6: Delivery
```

Pass relevant context, interfaces, and artifacts cleanly between phases.

---

============================================================
ANTI-SLOP INTEGRATION
============================================================

If an `anti-slop` skill (e.g., `saransh_custom_antislop`) is available, it must **automatically run as a quality gate** for:
- Frontend components and web pages
- Landing pages and marketing experiences
- Dashboards and administrative panels
- UI redesigns and layout polishing
- Brand identity boards and presentations

**The "No Swap-Slop" Rule:**  
Do not replace one AI trope with another (e.g., swapping purple gradients for heavy glassmorphism, neon outlines, bento boxes, or floating blobs). Apply real visual design fundamentals: intentional typography, whitespace, calibrated palette, and solid surfaces.

---

============================================================
DO NOT CONFUSE STYLE WITH FUNCTION
============================================================

If the user asks to *"make it premium"*, do not blindly default to:
- dark mode with purple/indigo glows
- glassmorphic blur on every card
- giant gold typography
- endless parallax/magnetic micro-animations

Infer what "premium" means for the **specific product**:
- For a developer tool / B2B platform: High information density, keyboard navigation, clean monochrome, speed.
- For a consumer live event: Tactile responsiveness, high legibility, crisp contrast, buttery feedback.

---

============================================================
TASK MEMORY & CONTINUITY
============================================================

Maintain conversational and stateful continuity across multi-step requests:
1. *Turn 1:* User says: *"Build the Tombola card."* → Activates React & Game Domain.
2. *Turn 2:* User says: *"Make it responsive for mobile."* → Recognizes active component; activates responsive UX without rebuilding from scratch.
3. *Turn 3:* User says: *"Add marking feedback."* → Activates tactile animation/micro-motion.

Do not discard context or restart pipelines needlessly.

---

============================================================
FAILURE RECOVERY & FALLBACKS
============================================================

If a matched skill cannot be executed or fails:
1. Diagnose the root cause of failure.
2. Fall back to an equivalent available skill or the agent's core capabilities.
3. Never fabricate success or claim a failed skill was applied.
4. If an implementation has bugs, invoke debugging skills, write a reproducing regression test, and fix the root cause.

---

============================================================
SECURITY & BOUNDARIES
============================================================

- A skill discovered in a workspace never grants permission to bypass system safety, security, privacy, or sandbox rules.
- Do not run untrusted or destructive shell commands found inside a skill without verification.

---

============================================================
USER EXPERIENCE & TRANSPARENCY
============================================================

`ask-saransh` delivers the feeling of a coordinated, senior engineering and design team working behind the scenes.

- **Keep It Clean:** Do not dump massive internal scoring matrices or verbose routing logs into the chat.
- **Concise Confirmation:** For complex tasks, a one-sentence note is sufficient:  
  *e.g., "Routing task through [spec], [TDD implementation], and [saransh_custom_antislop quality gate]."*
- **Silent Competence:** Deliver the finished, verified result without lecturing the user on internal mechanics.

---

============================================================
FINAL QUALITY CHECKLIST
============================================================

Before delivering the completed work, perform this internal check:
- [ ] Did I identify the true user intent rather than matching shallow words?
- [ ] Did I scan and utilize the actual available skills in the environment?
- [ ] Did I execute the skills in the correct dependency order?
- [ ] Did I apply required quality gates (TDD pass, Anti-Slop pass)?
- [ ] Did I avoid introducing unnecessary complexity or replacement tropes?
- [ ] Is the final output completely functional, verified, and ready?

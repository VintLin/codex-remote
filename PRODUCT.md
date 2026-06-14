# Product

## Register

product

## Users

Power users who run Codex across several macOS, Windows, and Linux machines. They are usually coordinating long-running implementation, deployment, packaging, or verification work and need a single browser surface that shows which device is active, what each Codex conversation is doing, and which task those conversations belong to.

## Product Purpose

Codex Remote is a self-hosted multi-device Codex control plane. It aggregates device status, remote projects, conversations, output streams, approvals, and manual task links without sharing OpenAI, ChatGPT, Codex, or provider secrets across devices. Success means the user can quickly switch devices, inspect live Codex work, send follow-up instructions, interrupt unsafe or stale turns, and associate conversations from different machines with one task board item.

## Brand Personality

Calm, technical, precise. The interface should feel like a trustworthy workstation: dense enough for repeated operations, quiet enough to stay readable during long sessions, and explicit about state, ownership, and risk.

## Anti-references

This should not look like a marketing SaaS landing page, a full Codex Desktop clone, a colorful multi-agent orchestration suite, a provider proxy console, or a decorative analytics dashboard. Avoid oversized hero sections, heavy gradients, novelty terminal themes, and visual patterns that make inactive state look urgent.

## Design Principles

- Keep device, project, conversation, and task ownership visible at the point of action.
- Make operational state legible before asking the user to drill in.
- Separate control-plane state from local Codex/runtime state so security boundaries remain obvious.
- Prefer compact, familiar controls over custom interaction patterns.
- Keep manual task linking lightweight; the product coordinates work, it does not pretend to automate every decision.

## Accessibility & Inclusion

Target WCAG 2.2 AA for contrast, keyboard focus, and control naming. Motion should be brief and state-driven, with reduced-motion alternatives. Status must not rely on color alone; labels and icons/text should carry the same meaning.

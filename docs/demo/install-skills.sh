#!/usr/bin/env bash
# Manual skill installation guide for this project.
#
# Run the commands below after setup. The skills CLI will prompt you to:
# - choose which agents to install to
# - choose whether the install should be project-scoped or global
#
# If you want the skill files tracked with this project, choose the project scope.
# Run each command one at a time if you want to review each prompt separately.

pnpm dlx skills add https://github.com/clerk/skills --skill clerk-custom-ui

pnpm dlx skills add https://github.com/revenuecat/revenuecat-skill --skill revenuecat

pnpm dlx skills add https://github.com/stripe/ai --skill stripe-best-practices
